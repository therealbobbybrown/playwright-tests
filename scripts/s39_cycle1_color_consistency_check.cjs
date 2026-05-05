const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const XLSX = require('xlsx');
const JSZip = require('jszip');

const API = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const SURVEY_ID = 39;
const REVISION_ID = 85;
const XLSX_FILE = '/tmp/s39_cycle1_filtered.xlsx';
const PPTX_FILE = '/tmp/s39_cycle1_filtered.pptx';

const WEB_COLOR_TO_BAND = new Map([
  ['#EA9C99', 'red'], ['#E09F9A', 'red'],
  ['#F4CFCC', 'light_red'], ['#EED2CE', 'light_red'],
  ['#FFF2CC', 'yellow'], ['#FCF2CF', 'yellow'],
  ['#B9E4CF', 'light_green'], ['#C3E3D1', 'light_green'],
  ['#89C3A8', 'green'], ['#94C1A9', 'green'],
]);

const REPORT_COLOR_TO_BAND = new Map([
  ['E09F9A', 'red'], ['EA9C99', 'red'],
  ['EED2CE', 'light_red'], ['F4CFCC', 'light_red'],
  ['FCF2CF', 'yellow'], ['FFF2CC', 'yellow'],
  ['C3E3D1', 'light_green'], ['B9E4CF', 'light_green'],
  ['94C1A9', 'green'], ['89C3A8', 'green'],
]);

const normHex = (v) => {
  if (!v) return '';
  const s = String(v).trim().toUpperCase().replace(/^#/, '');
  return s.length === 8 ? s.slice(2) : s;
};

const parseNum = (v) => {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  const n = Number(String(v).trim().replace(',', '.').replace('%', ''));
  return Number.isFinite(n) ? n : NaN;
};

function bandByScalePct(pct, s) {
  const t1 = Number(s.colorScaleRangeLightRed);
  const t2 = Number(s.colorScaleRangeYellow);
  const t3 = Number(s.colorScaleRangeLightGreen);
  const t4 = Number(s.colorScaleRangeGreen);
  if (pct < t1) return 'red';
  if (pct < t2) return 'light_red';
  if (pct < t3) return 'yellow';
  if (pct < t4) return 'light_green';
  return 'green';
}

function bandByNps(nps, s) {
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

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

async function signIn() {
  const fingerPrint = createHash('md5').update(String(Date.now())).digest('hex');
  const r = await api(`${API}/auth/account/signin/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ADMIN_LOGIN,
      password: process.env.ADMIN_PASSWORD,
      fingerPrint,
      permissions: [],
    }),
  });
  if (!r.ok || !r.data?.accessToken) throw new Error(`signIn failed: ${r.status}`);
  return r.data.accessToken;
}

async function getWebData(token) {
  const h = { Authorization: `Bearer ${token}` };
  const hj = { ...h, 'content-type': 'application/json' };
  const settings = await api(`${API}/manager/surveys/${SURVEY_ID}/statistics/settings/`, { headers: h });
  const survey = await api(`${API}/manager/surveys/${SURVEY_ID}/`, { headers: h });
  const summary = await api(`${API}/manager/surveys/${SURVEY_ID}/statistics/summary/get/`, {
    method: 'POST', headers: hj, body: JSON.stringify({ revisionsIds: [REVISION_ID] }),
  });

  const typeByQuestionId = new Map();
  const pages = survey.data?.body?.pages || [];
  for (const p of pages) {
    for (const q of (p.questions || [])) {
      typeByQuestionId.set(Number(q.id), { type: q.type, min: Number(q.rangeMin), max: Number(q.rangeMax) });
    }
  }

  const qm = summary.data?.totalSummary?.questionsMap || {};
  const checks = [];
  for (const [idStr, obj] of Object.entries(qm)) {
    const qid = Number(idStr);
    const meta = typeByQuestionId.get(qid);
    if (!meta) continue;

    const colorBand = WEB_COLOR_TO_BAND.get(String(obj?.color || '').toUpperCase()) || null;
    const vRaw = String(obj?.value ?? '').trim();
    let expectedBand = null;
    let metric = null;

    if (meta.type === 'scale') {
      const v = parseNum(vRaw); if (!Number.isFinite(v)) continue;
      const pct = (v / meta.max) * 100;
      expectedBand = bandByScalePct(pct, settings.data || {});
      metric = { type: `scale_${meta.min}_${meta.max}`, v, pct };
    } else if (meta.type === 'nps') {
      const nps = parseNum(vRaw); if (!Number.isFinite(nps)) continue;
      expectedBand = bandByNps(nps, settings.data || {});
      metric = { type: `nps_${meta.min}_${meta.max}`, v: nps, pct: nps };
    } else continue;

    checks.push({ qid, value: vRaw, color: obj?.color || null, colorBand, expectedBand, metric, ok: colorBand === expectedBand });
  }

  return {
    settings: settings.data,
    checks,
    mismatches: checks.filter((x) => !x.ok),
  };
}

function parseXlsxFiltered(file, settings) {
  const wb = XLSX.readFile(file, { cellStyles: true });
  const ws = wb.Sheets['Отделы'] || wb.Sheets[wb.SheetNames[1]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = rows[0] || [];
  const dataRow = rows[1] || [];
  const checks = [];

  for (let c = 0; c < headers.length; c++) {
    const h = String(headers[c] || '').toLowerCase();
    let type = null;
    if (h.includes('nps')) type = 'nps_0_10';
    else if (h.includes('шкала 0-10')) type = 'scale_0_10';
    else if (h.includes('шкала 0-5')) type = 'scale_0_5';
    if (!type) continue;

    const raw = dataRow[c];
    if (raw === '' || raw == null) continue;

    const addr = XLSX.utils.encode_cell({ r: 1, c });
    const cell = ws[addr];
    const rgb = normHex(cell?.s?.fgColor?.rgb);
    const colorBand = REPORT_COLOR_TO_BAND.get(rgb) || null;

    let expectedBand = null;
    let metric = null;
    if (type === 'scale_0_5') {
      const v = parseNum(raw); const pct = (v / 5) * 100;
      expectedBand = bandByScalePct(pct, settings);
      metric = { type, v, pct };
    } else if (type === 'scale_0_10') {
      const v = parseNum(raw); const pct = (v / 10) * 100;
      expectedBand = bandByScalePct(pct, settings);
      metric = { type, v, pct };
    } else {
      const nps = parseNum(raw);
      expectedBand = bandByNps(nps, settings);
      metric = { type, v: nps, pct: nps };
    }

    checks.push({ header: headers[c], value: raw, rgb, colorBand, expectedBand, metric, ok: colorBand === expectedBand });
  }

  return { checks, mismatches: checks.filter((x) => !x.ok) };
}

async function parsePptxFiltered(file, settings, knownSets) {
  const zip = await JSZip.loadAsync(await fs.readFile(file));
  const numRe = /^-?\d+(?:[.,]\d+)?%?$/;
  const checks = [];

  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith('ppt/slides/slide') || !name.endsWith('.xml')) continue;
    const xml = await zip.files[name].async('string');
    const tcBlocks = xml.match(/<a:tc[^>]*>.*?<\/a:tc>/gs) || [];
    for (const tc of tcBlocks) {
      const colors = [...tc.matchAll(/<a:srgbClr val="([0-9A-Fa-f]{6})"/g)].map((m) => normHex(m[1]));
      const rgb = colors.find((x) => REPORT_COLOR_TO_BAND.has(x));
      if (!rgb) continue;

      const texts = [...tc.matchAll(/<a:t>(.*?)<\/a:t>/g)].map((m) => m[1].trim()).filter(Boolean);
      const t = texts[texts.length - 1];
      if (!t || !numRe.test(t)) continue;

      const colorBand = REPORT_COLOR_TO_BAND.get(rgb) || null;
      let expectedBand = null;
      let metric = null;

      if (t.includes('%')) {
        const nps = parseNum(t);
        expectedBand = bandByNps(nps, settings);
        metric = { type: 'nps_0_10', v: nps, pct: nps };
      } else {
        const v = parseNum(t);
        if (!Number.isFinite(v)) continue;
        if (v > 5) {
          const pct = (v / 10) * 100;
          expectedBand = bandByScalePct(pct, settings);
          metric = { type: 'scale_0_10', v, pct };
        } else {
          const in5 = knownSets.scale0_5.has(v.toFixed(1));
          const in10 = knownSets.scale0_10.has(v.toFixed(1));
          if (in5 && !in10) {
            const pct = (v / 5) * 100;
            expectedBand = bandByScalePct(pct, settings);
            metric = { type: 'scale_0_5', v, pct };
          } else if (in10 && !in5) {
            const pct = (v / 10) * 100;
            expectedBand = bandByScalePct(pct, settings);
            metric = { type: 'scale_0_10', v, pct };
          } else {
            continue;
          }
        }
      }

      checks.push({ slide: name, value: t, rgb, colorBand, expectedBand, metric, ok: colorBand === expectedBand });
    }
  }

  return { checks, mismatches: checks.filter((x) => !x.ok) };
}

(async () => {
  const token = await signIn();
  const web = await getWebData(token);
  const xlsx = parseXlsxFiltered(XLSX_FILE, web.settings || {});
  const knownSets = {
    scale0_5: new Set(xlsx.checks.filter((x) => x.metric.type === 'scale_0_5').map((x) => Number(x.metric.v).toFixed(1))),
    scale0_10: new Set(xlsx.checks.filter((x) => x.metric.type === 'scale_0_10').map((x) => Number(x.metric.v).toFixed(1))),
  };
  const pptx = await parsePptxFiltered(PPTX_FILE, web.settings || {}, knownSets);

  const out = {
    surveyId: SURVEY_ID,
    revisionId: REVISION_ID,
    settings: web.settings,
    web: { total: web.checks.length, mismatches: web.mismatches.length },
    xlsxFiltered: { total: xlsx.checks.length, mismatches: xlsx.mismatches.length },
    pptxFiltered: { totalComparable: pptx.checks.length, mismatches: pptx.mismatches.length },
    mismatchSamples: {
      web: web.mismatches.slice(0, 20),
      xlsxFiltered: xlsx.mismatches.slice(0, 20),
      pptxFiltered: pptx.mismatches.slice(0, 20),
    },
  };

  await fs.writeFile('/tmp/s39_cycle1_color_consistency_result.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})();
