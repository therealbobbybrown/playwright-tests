import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import XLSX from 'xlsx';
import JSZip from 'jszip';

const API = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const SURVEY_ID = 16;
const REVISION_ID = 95;
const OUT_DIR = '/tmp/s16_cycle6_consistency';
const OUT_JSON = `${OUT_DIR}/s16_cycle6_consistency.json`;
const OUT_XLSX = `${OUT_DIR}/s16_cycle6_filtered.xlsx`;
const OUT_PPTX = `${OUT_DIR}/s16_cycle6_filtered.pptx`;

const WEB_5 = new Map([
  ['EA9C99', 'red'], ['E09F9A', 'red'],
  ['F4CFCC', 'light_red'], ['EED2CE', 'light_red'],
  ['FFF2CC', 'yellow'], ['FCF2CF', 'yellow'],
  ['B9E4CF', 'light_green'], ['C3E3D1', 'light_green'],
  ['89C3A8', 'green'], ['94C1A9', 'green'],
]);

const REPORT_3 = new Map([
  ['F4CCCC', 'red'], ['EA9C99', 'red'], ['E09F9A', 'red'], ['F4CFCC', 'red'], ['EED2CE', 'red'],
  ['FFF2CC', 'yellow'], ['FCF2CF', 'yellow'],
  ['B7E1CD', 'green'], ['B9E4CF', 'green'], ['C3E3D1', 'green'], ['89C3A8', 'green'], ['94C1A9', 'green'],
]);

const normHex = (v) => {
  if (!v) return '';
  const s = String(v).trim().toUpperCase().replace(/^#/, '');
  return s.length === 8 ? s.slice(2) : s;
};

const toNum = (v) => {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  const s = String(v).trim().replace(',', '.').replace('%', '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

const collapse5to3 = (b) => {
  if (!b) return null;
  if (b === 'red' || b === 'light_red') return 'red';
  if (b === 'yellow') return 'yellow';
  if (b === 'light_green' || b === 'green') return 'green';
  return null;
};

function band5Scale(v, min, max, s) {
  // Для survey16 (1-5) подтверждено вычисление через value/max, не через (value-min)/(max-min)
  const pct = (v / max) * 100;
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

function band5Nps(nps, s) {
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
  const r = await fetch(url, options);
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, data, text };
}

async function signIn() {
  const fp = createHash('md5').update(String(Date.now())).digest('hex');
  const r = await api(`${API}/auth/account/signin/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ADMIN_LOGIN,
      password: process.env.ADMIN_PASSWORD,
      fingerPrint: fp,
      permissions: [],
    }),
  });
  if (!r.ok || !r.data?.accessToken) throw new Error(`signIn failed: ${r.status}`);
  return r.data.accessToken;
}

async function getExportToken(token) {
  const headers = { Authorization: `Bearer ${token}` };
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const pad = (n, z = 2) => String(n).padStart(z, '0');
  const userDate = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}+08:00`;

  const q = new URLSearchParams({
    userDate,
    resultsWithAI: 'false',
    resultsWithGroups: 'false',
    filters: JSON.stringify({ revisionsIds: [REVISION_ID], usersIds: [], userGroupsIds: [], departmentsIds: [] }),
  });

  const r = await api(`${API}/manager/surveys/${SURVEY_ID}/export/get-token/?${q.toString()}`, { headers });
  if (!r.ok || !r.data?.token) throw new Error(`get-token failed ${r.status}`);
  return r.data.token;
}

async function downloadByToken(kind, token, outPath) {
  const r = await fetch(`${API}/public/surveys/export/${kind}/?lang=ru&token=${encodeURIComponent(token)}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(outPath, buf);
  return { status: r.status, bytes: buf.length, outPath };
}

function byValueKey(n) {
  return Number(n).toFixed(3);
}

async function collectWeb(token) {
  const H = { Authorization: `Bearer ${token}` };
  const HJ = { ...H, 'content-type': 'application/json' };

  const settingsR = await api(`${API}/manager/surveys/${SURVEY_ID}/statistics/settings/`, { headers: H });
  const surveyR = await api(`${API}/manager/surveys/${SURVEY_ID}/`, { headers: H });
  const summaryR = await api(`${API}/manager/surveys/${SURVEY_ID}/statistics/summary/get/`, {
    method: 'POST', headers: HJ, body: JSON.stringify({ revisionsIds: [REVISION_ID] }),
  });

  const settings = settingsR.data || {};
  const pages = surveyR.data?.pages || [];
  const qMeta = new Map();
  for (const p of pages) {
    for (const q of (p.questions || [])) qMeta.set(Number(q.id), { type: q.type, min: Number(q.rangeMin), max: Number(q.rangeMax), title: q.title || '' });
  }
  const npsTitles = new Set([...qMeta.values()].filter((q) => q.type === 'nps').map((q) => String(q.title || '').trim()).filter(Boolean));
  const scaleTitles = new Set([...qMeta.values()].filter((q) => q.type === 'scale').map((q) => String(q.title || '').trim()).filter(Boolean));

  const qm = summaryR.data?.totalSummary?.questionsMap || {};
  const rows = [];

  for (const [idStr, obj] of Object.entries(qm)) {
    const qid = Number(idStr);
    const meta = qMeta.get(qid);
    if (!meta || !['scale', 'nps'].includes(meta.type)) continue;

    const v = toNum(obj?.value);
    if (!Number.isFinite(v)) continue;

    const hex = normHex(obj?.color);
    const actual5 = WEB_5.get(hex) || null;
    const actual3 = collapse5to3(actual5);

    let expected5 = null;
    let metric = null;
    if (meta.type === 'scale') {
      expected5 = band5Scale(v, meta.min, meta.max, settings);
      metric = `scale_${meta.min}_${meta.max}`;
    } else {
      expected5 = band5Nps(v, settings);
      metric = `nps_${meta.min}_${meta.max}`;
    }
    const expected3 = collapse5to3(expected5);

    rows.push({ qid, metric, value: v, colorHex: hex, actual5, actual3, expected5, expected3, ok5: actual5 === expected5, ok3: actual3 === expected3 });
  }

  const map = new Map();
  for (const r of rows) {
    const key = `${r.metric}|${byValueKey(r.value)}`;
    if (!map.has(key)) map.set(key, { metric: r.metric, value: r.value, expected5: r.expected5, expected3: r.expected3, actual5set: new Set(), actual3set: new Set(), count: 0 });
    const x = map.get(key);
    x.actual5set.add(r.actual5);
    x.actual3set.add(r.actual3);
    x.count += 1;
  }

  const valueMap = [...map.values()].map(x => ({
    metric: x.metric,
    value: x.value,
    expected5: x.expected5,
    expected3: x.expected3,
    actual5: [...x.actual5set],
    actual3: [...x.actual3set],
    count: x.count,
  }));

  return {
    settings,
    rows,
    valueMap,
    npsTitles: [...npsTitles],
    scaleTitles: [...scaleTitles],
    mismatches5: rows.filter(x => !x.ok5),
    mismatches3: rows.filter(x => !x.ok3),
  };
}

function parseXlsx(file, webValueMap, titleMeta) {
  const wb = XLSX.readFile(file, { cellStyles: true });
  const checks = [];
  const webMap = new Map(webValueMap.map(x => [`${x.metric}|${byValueKey(x.value)}`, x]));
  const npsTitles = new Set(titleMeta?.npsTitles || []);
  const scaleTitles = new Set(titleMeta?.scaleTitles || []);

  for (const sheetName of ['Отделы', 'Группы']) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const headers = rows[0] || [];
    const rowIndex = rows.findIndex(r => String(r?.[0] || '').trim() === 'Вся компания');
    if (rowIndex < 0) continue;
    const row = rows[rowIndex] || [];

    for (let c = 0; c < headers.length; c++) {
      const header = String(headers[c] || '').trim();
      let metric = null;
      if (npsTitles.has(header)) metric = 'nps_0_10';
      else if (scaleTitles.has(header)) metric = 'scale_1_5';
      else continue;

      const raw = row[c];
      if (raw === '' || raw == null) continue;

      const rawStr = String(raw).trim();
      const v = toNum(rawStr);
      if (!Number.isFinite(v)) continue;

      const addr = XLSX.utils.encode_cell({ r: rowIndex, c });
      const rgb = normHex(ws[addr]?.s?.fgColor?.rgb);
      const actual3 = REPORT_3.get(rgb) || null;

      const key = `${metric}|${byValueKey(v)}`;
      const web = webMap.get(key) || null;
      const expected3 = web?.expected3 || null;
      checks.push({ src: 'xlsx', sheet: sheetName, header, metric, value: v, rgb, actual3, expected3, ok: expected3 ? actual3 === expected3 : null });
    }
  }

  return { checks, mismatches: checks.filter(x => x.ok === false), unknown: checks.filter(x => x.ok === null) };
}

async function parsePptx(file, webValueMap) {
  const buf = await fs.readFile(file);
  const zip = await JSZip.loadAsync(buf);
  const checks = [];

  const webMap = new Map(webValueMap.map(x => [`${x.metric}|${byValueKey(x.value)}`, x]));
  const scaleKnown = new Set(webValueMap.filter(x => x.metric === 'scale_1_5').map(x => byValueKey(x.value)));
  const npsKnown = new Set(webValueMap.filter(x => x.metric === 'nps_0_10').map(x => byValueKey(x.value)));

  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith('ppt/slides/slide') || !name.endsWith('.xml')) continue;
    const xml = await zip.files[name].async('string');
    const tcBlocks = xml.match(/<a:tc[^>]*>.*?<\/a:tc>/gs) || [];

    for (const tc of tcBlocks) {
      const colors = [...tc.matchAll(/<a:srgbClr val="([0-9A-Fa-f]{6})"/g)].map(m => normHex(m[1]));
      const rgb = colors.find(x => WEB_5.has(x) || REPORT_3.has(x));
      if (!rgb) continue;

      const texts = [...tc.matchAll(/<a:t>(.*?)<\/a:t>/g)].map(m => m[1].trim()).filter(Boolean);
      if (!texts.length) continue;
      const t = texts[texts.length - 1];

      if (!/^-?\d+(?:[\.,]\d+)?%?$/.test(t)) continue;
      const v = toNum(t);
      if (!Number.isFinite(v)) continue;

      let metric = null;
      if (t.includes('%')) {
        const k = byValueKey(v);
        if (!npsKnown.has(k)) continue;
        metric = 'nps_0_10';
      } else {
        const k = byValueKey(v);
        if (!scaleKnown.has(k)) continue;
        metric = 'scale_1_5';
      }

      const band5 = WEB_5.get(rgb) || null;
      const band3from5 = collapse5to3(band5);
      const band3 = REPORT_3.get(rgb) || band3from5 || null;

      const web = webMap.get(`${metric}|${byValueKey(v)}`) || null;
      const expected3 = web?.expected3 || null;
      checks.push({ src: 'pptx', slide: name, metric, value: v, rgb, actual3: band3, expected3, ok: expected3 ? band3 === expected3 : null });
    }
  }

  return { checks, mismatches: checks.filter(x => x.ok === false), unknown: checks.filter(x => x.ok === null) };
}

await fs.mkdir(OUT_DIR, { recursive: true });
const token = await signIn();
const web = await collectWeb(token);
const exportToken = await getExportToken(token);
const dl = {
  xlsx: await downloadByToken('xlsx', exportToken, OUT_XLSX),
  pptx: await downloadByToken('pptx', exportToken, OUT_PPTX),
};

const xlsx = parseXlsx(OUT_XLSX, web.valueMap, { npsTitles: web.npsTitles, scaleTitles: web.scaleTitles });
const pptx = await parsePptx(OUT_PPTX, web.valueMap);

const out = {
  surveyId: SURVEY_ID,
  revisionId: REVISION_ID,
  settings: {
    useOldColorRules: web.settings.useOldColorRules,
    nps: {
      lightRed: web.settings.colorNpsRangeLightRed,
      yellow: web.settings.colorNpsRangeYellow,
      lightGreen: web.settings.colorNpsRangeLightGreen,
      green: web.settings.colorNpsRangeGreen,
    },
    scale: {
      lightRed: web.settings.colorScaleRangeLightRed,
      yellow: web.settings.colorScaleRangeYellow,
      lightGreen: web.settings.colorScaleRangeLightGreen,
      green: web.settings.colorScaleRangeGreen,
    },
  },
  downloads: dl,
  web: {
    totalRows: web.rows.length,
    mismatches5: web.mismatches5.length,
    mismatches3: web.mismatches3.length,
    valueMap: web.valueMap,
  },
  xlsx: {
    total: xlsx.checks.length,
    mismatches: xlsx.mismatches.length,
    unknown: xlsx.unknown.length,
    checks: xlsx.checks,
  },
  pptx: {
    totalComparable: pptx.checks.length,
    mismatches: pptx.mismatches.length,
    unknown: pptx.unknown.length,
    checks: pptx.checks,
  },
};

await fs.writeFile(OUT_JSON, JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({
  out: OUT_JSON,
  web: { totalRows: out.web.totalRows, mismatches5: out.web.mismatches5, mismatches3: out.web.mismatches3 },
  xlsx: { total: out.xlsx.total, mismatches: out.xlsx.mismatches },
  pptx: { totalComparable: out.pptx.totalComparable, mismatches: out.pptx.mismatches },
}, null, 2));
