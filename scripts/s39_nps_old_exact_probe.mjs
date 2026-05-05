import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

const API = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const SURVEY_ID = Number(process.env.SURVEY_ID || 39);
const OUT_DIR = process.env.OUT_DIR || '/tmp/s39_nps_old_probe';

const WEB_5STEP = new Map([
  ['#EA9C99', 'red'],
  ['#E09F9A', 'red'],
  ['#F4CFCC', 'light_red'],
  ['#EED2CE', 'light_red'],
  ['#FFF2CC', 'yellow'],
  ['#FCF2CF', 'yellow'],
  ['#B9E4CF', 'light_green'],
  ['#C3E3D1', 'light_green'],
  ['#89C3A8', 'green'],
  ['#94C1A9', 'green'],
]);

function fp(seed = '') {
  return createHash('md5').update(`${Date.now()}_${seed}`).digest('hex');
}

function extractItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  const n = Number(String(v).trim().replace(',', '.').replace('%', ''));
  return Number.isFinite(n) ? n : NaN;
}

function bandByNpsValue(nps, s) {
  const t1 = Number(s.colorNpsRangeLightRed);
  const t2 = Number(s.colorNpsRangeYellow);
  const t3 = Number(s.colorNpsRangeLightGreen);
  const t4 = Number(s.colorNpsRangeGreen);
  if (nps < t1) return 'red';
  if (nps < t2) return 'light_red';
  if (nps < t3) return 'yellow';
  if (nps < t4) return 'light_green';
  return 'green';
}

async function parseJson(res) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const body = await parseJson(res);
  return { ok: res.ok, status: res.status, data: body.json, text: body.text };
}

async function signIn() {
  const r = await api(`${API}/auth/account/signin/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ADMIN_LOGIN,
      password: process.env.ADMIN_PASSWORD,
      fingerPrint: fp('admin'),
      permissions: [],
    }),
  });
  if (!r.ok || !r.data?.accessToken) throw new Error(`signIn failed ${r.status}`);
  return r.data.accessToken;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const token = await signIn();
  const h = { Authorization: `Bearer ${token}` };
  const hj = { ...h, 'content-type': 'application/json' };

  const settingsR = await api(`${API}/manager/surveys/${SURVEY_ID}/statistics/settings/`, { headers: h });
  if (!settingsR.ok) throw new Error(`settings failed ${settingsR.status}`);
  const settings = settingsR.data || {};

  const surveyR = await api(`${API}/manager/surveys/${SURVEY_ID}/`, { headers: h });
  if (!surveyR.ok) throw new Error(`survey failed ${surveyR.status}`);
  const pages = surveyR.data?.body?.pages || surveyR.data?.pages || [];
  const npsMeta = new Map();
  for (const p of pages) {
    for (const q of (p.questions || [])) {
      if (q.type === 'nps') {
        npsMeta.set(Number(q.id), {
          id: Number(q.id),
          title: q.title || q.text || '',
          min: Number(q.rangeMin ?? 0),
          max: Number(q.rangeMax ?? 10),
        });
      }
    }
  }

  const revR = await api(`${API}/manager/surveys/${SURVEY_ID}/statistics/revisions/`, { headers: h });
  if (!revR.ok) throw new Error(`revisions failed ${revR.status}`);
  const revisions = extractItems(revR.data)
    .slice()
    .sort((a, b) => new Date(b.dateStart || 0).getTime() - new Date(a.dateStart || 0).getTime());

  const byRevision = [];
  for (const rev of revisions) {
    const summaryR = await api(`${API}/manager/surveys/${SURVEY_ID}/statistics/summary/get/`, {
      method: 'POST',
      headers: hj,
      body: JSON.stringify({ revisionsIds: [rev.id] }),
    });
    if (!summaryR.ok) continue;

    const ts = summaryR.data?.totalSummary || {};
    const qm = ts.questionsMap || {};
    const npsRows = [];
    for (const [qidStr, obj] of Object.entries(qm)) {
      const qid = Number(qidStr);
      const meta = npsMeta.get(qid);
      if (!meta) continue;
      const value = toNum(obj?.value);
      if (!Number.isFinite(value)) continue;
      const colorRaw = String(obj?.color || '').toUpperCase();
      const colorBand = WEB_5STEP.get(colorRaw) || null;
      const expectedBand = bandByNpsValue(value, settings);
      npsRows.push({
        qid,
        title: meta.title,
        nps: value,
        colorRaw,
        colorBand,
        expectedBand,
        ok: colorBand === expectedBand,
      });
    }

    const coveredBands = [...new Set(npsRows.map((x) => x.colorBand).filter(Boolean))];
    byRevision.push({
      revisionId: rev.id,
      alias: rev.alias || null,
      dateStart: rev.dateStart || null,
      answersCount: Number(ts.answersCount || 0),
      totalCount: Number(ts.totalCount || 0),
      npsQuestionsCount: npsRows.length,
      coveredBands,
      coveredBandsCount: coveredBands.length,
      npsMin: npsRows.length ? Math.min(...npsRows.map((x) => x.nps)) : null,
      npsMax: npsRows.length ? Math.max(...npsRows.map((x) => x.nps)) : null,
      mismatches: npsRows.filter((x) => !x.ok).length,
      npsRows: npsRows.sort((a, b) => a.nps - b.nps),
    });
  }

  const mostRepresentative = byRevision
    .slice()
    .sort((a, b) => {
      if (b.coveredBandsCount !== a.coveredBandsCount) return b.coveredBandsCount - a.coveredBandsCount;
      if (b.npsQuestionsCount !== a.npsQuestionsCount) return b.npsQuestionsCount - a.npsQuestionsCount;
      return new Date(b.dateStart || 0).getTime() - new Date(a.dateStart || 0).getTime();
    })[0] || null;

  const out = {
    surveyId: SURVEY_ID,
    settings: {
      colorNpsRangeLightRed: settings.colorNpsRangeLightRed,
      colorNpsRangeYellow: settings.colorNpsRangeYellow,
      colorNpsRangeLightGreen: settings.colorNpsRangeLightGreen,
      colorNpsRangeGreen: settings.colorNpsRangeGreen,
      useOldRulesHint:
        Number(settings.colorNpsRangeLightRed) === -49 &&
        Number(settings.colorNpsRangeYellow) === 0 &&
        Number(settings.colorNpsRangeLightGreen) === 50 &&
        Number(settings.colorNpsRangeGreen) === 75,
    },
    totalRevisionsChecked: byRevision.length,
    mostRepresentative: mostRepresentative
      ? {
          revisionId: mostRepresentative.revisionId,
          dateStart: mostRepresentative.dateStart,
          answersCount: mostRepresentative.answersCount,
          totalCount: mostRepresentative.totalCount,
          npsQuestionsCount: mostRepresentative.npsQuestionsCount,
          coveredBands: mostRepresentative.coveredBands,
          npsMin: mostRepresentative.npsMin,
          npsMax: mostRepresentative.npsMax,
          mismatches: mostRepresentative.mismatches,
          rows: mostRepresentative.npsRows,
        }
      : null,
    revisionsDigest: byRevision.map((r) => ({
      revisionId: r.revisionId,
      dateStart: r.dateStart,
      answersCount: r.answersCount,
      npsQuestionsCount: r.npsQuestionsCount,
      coveredBands: r.coveredBands,
      npsMin: r.npsMin,
      npsMax: r.npsMax,
      mismatches: r.mismatches,
    })),
  };

  const outFile = `${OUT_DIR}/s${SURVEY_ID}_nps_old_exact_probe.json`;
  await fs.writeFile(outFile, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ outFile, out }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});

