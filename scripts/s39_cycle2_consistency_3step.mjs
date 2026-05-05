import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import XLSX from 'xlsx';
import JSZip from 'jszip';

const API = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const SURVEY_ID = 39;
const REVISION_ID = 87;

const OUT_JSON = '/private/tmp/s39_cycle2_consistency_3step_result.json';
const OUT_XLSX = '/private/tmp/s39_cycle2_filtered_latest.xlsx';
const OUT_PPTX = '/private/tmp/s39_cycle2_filtered_latest.pptx';
const OUT_PDF = '/private/tmp/s39_cycle2_filtered_latest.pdf';

const WEB_5STEP = new Map([
  ['#EA9C99', 'red'], ['#E09F9A', 'red'],
  ['#F4CFCC', 'light_red'], ['#EED2CE', 'light_red'],
  ['#FFF2CC', 'yellow'], ['#FCF2CF', 'yellow'],
  ['#B9E4CF', 'light_green'], ['#C3E3D1', 'light_green'],
  ['#89C3A8', 'green'], ['#94C1A9', 'green'],
]);

// Reports may use 3-step palette in XLSX heatmap sheets
const REPORT_3STEP = new Map([
  ['F4CCCC', 'red'], ['EA9C99', 'red'], ['E09F9A', 'red'], ['F4CFCC', 'red'], ['EED2CE', 'red'],
  ['FFF2CC', 'yellow'], ['FCF2CF', 'yellow'],
  ['B7E1CD', 'green'], ['B9E4CF', 'green'], ['C3E3D1', 'green'], ['89C3A8', 'green'], ['94C1A9', 'green'],
]);

function normHex(v) {
  if (!v) return '';
  const s = String(v).trim().toUpperCase().replace(/^#/, '');
  if (s.length === 8) return s.slice(2);
  return s;
}
function toNum(v) {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  const s = String(v).trim().replace(',', '.').replace('%', '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function collapse5to3(b) {
  if (b === 'red' || b === 'light_red') return 'red';
  if (b === 'yellow') return 'yellow';
  if (b === 'light_green' || b === 'green') return 'green';
  return null;
}

// old 5-step collapsed to 3-step for scale
function expectedScale3(pct, settings) {
  const t2 = Number(settings.colorScaleRangeYellow);      // 70 in old
  const t3 = Number(settings.colorScaleRangeLightGreen);  // 90 in old
  if (pct < t2) return 'red';
  if (pct < t3) return 'yellow';
  return 'green';
}
// old 5-step collapsed to 3-step for nps
function expectedNps3(nps, settings) {
  const t2 = Number(settings.colorNpsRangeYellow);        // 0 in old
  const t3 = Number(settings.colorNpsRangeLightGreen);    // 50 in old
  if (nps < t2) return 'red';
  if (nps < t3) return 'yellow';
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
  const fp = createHash('md5').update(String(Date.now())).digest('hex');
  const r = await api(`${API}/auth/account/signin/`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD, fingerPrint: fp, permissions: [] }),
  });
  if (!r.ok || !r.data?.accessToken) throw new Error(`signIn failed ${r.status}`);
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

async function getWebData(token) {
  const H = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const settingsR = await api(`${API}/manager/surveys/${SURVEY_ID}/statistics/settings/`, { headers: { Authorization: `Bearer ${token}` } });
  const surveyR = await api(`${API}/manager/surveys/${SURVEY_ID}/`, { headers: { Authorization: `Bearer ${token}` } });
  const summaryR = await api(`${API}/manager/surveys/${SURVEY_ID}/statistics/summary/get/`, {
    method: 'POST', headers: H, body: JSON.stringify({ revisionsIds: [REVISION_ID] }),
  });

  const settings = settingsR.data || {};
  const pages = surveyR.data?.body?.pages || [];
  const qType = new Map();
  for (const p of pages) for (const q of (p.questions || [])) qType.set(Number(q.id), { type: q.type, min: Number(q.rangeMin), max: Number(q.rangeMax) });

  const qm = summaryR.data?.totalSummary?.questionsMap || {};
  const checks = [];
  for (const [id, obj] of Object.entries(qm)) {
    const qid = Number(id);
    const meta = qType.get(qid);
    if (!meta) continue;
    const vRaw = String(obj?.value ?? '').trim();
    const color5 = WEB_5STEP.get(String(obj?.color || '').toUpperCase()) || null;
    const color3 = collapse5to3(color5);

    if (meta.type === 'scale') {
      const v = toNum(vRaw);
      if (!Number.isFinite(v)) continue;
      const pct = (v / meta.max) * 100;
      const exp3 = expectedScale3(pct, settings);
      checks.push({ src: 'web', metric: `scale_${meta.min}_${meta.max}`, value: vRaw, pct, colorRaw: obj?.color || null, color3, exp3, ok3: color3 === exp3 });
    } else if (meta.type === 'nps') {
      const n = toNum(vRaw);
      if (!Number.isFinite(n)) continue;
      const exp3 = expectedNps3(n, settings);
      checks.push({ src: 'web', metric: `nps_${meta.min}_${meta.max}`, value: vRaw, pct: n, colorRaw: obj?.color || null, color3, exp3, ok3: color3 === exp3 });
    }
  }

  return { settings, checks, mismatches3: checks.filter(x => !x.ok3) };
}

function parseXlsxWholeCompany(file, settings) {
  const wb = XLSX.readFile(file, { cellStyles: true });
  const out = [];
  for (const sheetName of ['Отделы', 'Группы']) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const headers = rows[0] || [];
    const row = (rows || []).find(r => String(r?.[0] || '').trim() === 'Вся компания');
    if (!row) continue;

    for (let c = 0; c < headers.length; c++) {
      const h = String(headers[c] || '').toLowerCase();
      let metric = null;
      if (h.includes('nps')) metric = 'nps_0_10';
      else if (h.includes('шкала 0-10')) metric = 'scale_0_10';
      else if (h.includes('шкала 0-5')) metric = 'scale_0_5';
      else continue;

      const raw = row[c];
      if (raw === '' || raw == null) continue;

      const addr = XLSX.utils.encode_cell({ r: rows.indexOf(row), c });
      const cell = ws[addr];
      const rgb = normHex(cell?.s?.fgColor?.rgb);
      const color3 = REPORT_3STEP.get(rgb) || null;

      let exp3 = null;
      let pct = null;
      if (metric === 'scale_0_5') {
        const v = toNum(raw); if (!Number.isFinite(v)) continue;
        pct = (v / 5) * 100;
        exp3 = expectedScale3(pct, settings);
      } else if (metric === 'scale_0_10') {
        const v = toNum(raw); if (!Number.isFinite(v)) continue;
        pct = (v / 10) * 100;
        exp3 = expectedScale3(pct, settings);
      } else {
        const n = toNum(raw); if (!Number.isFinite(n)) continue;
        pct = n;
        exp3 = expectedNps3(n, settings);
      }

      out.push({ src: 'xlsx', sheet: sheetName, metric, header: headers[c], value: String(raw), pct, rgb, color3, exp3, ok3: color3 === exp3 });
    }
  }
  return { checks: out, mismatches3: out.filter(x => !x.ok3) };
}

async function parsePptxSimple(file, settings) {
  const buf = await fs.readFile(file);
  const zip = await JSZip.loadAsync(buf);
  const checks = [];
  const numRe = /^-?\d+(?:[.,]\d+)?%?$/;

  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith('ppt/slides/slide') || !name.endsWith('.xml')) continue;
    const xml = await zip.files[name].async('string');
    const tcBlocks = xml.match(/<a:tc[^>]*>.*?<\/a:tc>/gs) || [];
    for (const tc of tcBlocks) {
      const colors = [...tc.matchAll(/<a:srgbClr val="([0-9A-Fa-f]{6})"/g)].map(m => normHex(m[1]));
      const rgb = colors.find(x => REPORT_3STEP.has(x));
      if (!rgb) continue;
      const texts = [...tc.matchAll(/<a:t>(.*?)<\/a:t>/g)].map(m => m[1].trim()).filter(Boolean);
      if (!texts.length) continue;
      const t = texts[texts.length - 1];
      if (!numRe.test(t)) continue;

      const color3 = REPORT_3STEP.get(rgb) || null;
      let exp3 = null;
      let metric = null;
      let pct = null;
      if (t.includes('%')) {
        const n = toNum(t); if (!Number.isFinite(n)) continue;
        metric = 'nps_0_10'; pct = n;
        exp3 = expectedNps3(n, settings);
      } else {
        const v = toNum(t); if (!Number.isFinite(v)) continue;
        // conservative: only unambiguous scale for 0-10 when >5
        if (v > 5) {
          metric = 'scale_0_10'; pct = (v / 10) * 100;
          exp3 = expectedScale3(pct, settings);
        } else {
          continue;
        }
      }
      checks.push({ src: 'pptx', slide: name, metric, value: t, pct, rgb, color3, exp3, ok3: color3 === exp3 });
    }
  }
  return { checks, mismatches3: checks.filter(x => !x.ok3) };
}

const token = await signIn();
const web = await getWebData(token);
const exportToken = await getExportToken(token);
const dl = {
  xlsx: await downloadByToken('xlsx', exportToken, OUT_XLSX),
  pptx: await downloadByToken('pptx', exportToken, OUT_PPTX),
  pdf: await downloadByToken('pdf', exportToken, OUT_PDF),
};

const xlsx = parseXlsxWholeCompany(OUT_XLSX, web.settings || {});
const pptx = await parsePptxSimple(OUT_PPTX, web.settings || {});

const out = {
  surveyId: SURVEY_ID,
  revisionId: REVISION_ID,
  settings: web.settings,
  downloads: dl,
  model: {
    web: 'old-5-step collapsed to 3-step',
    reports: '3-step (red/yellow/green)',
    scale3: { red: '<70', yellow: '70..89', green: '>=90' },
    nps3: { red: '<0', yellow: '0..49', green: '>=50' },
  },
  web: {
    total: web.checks.length,
    mismatches3: web.mismatches3.length,
    mismatchSamples: web.mismatches3.slice(0, 20),
  },
  xlsx: {
    total: xlsx.checks.length,
    mismatches3: xlsx.mismatches3.length,
    mismatchSamples: xlsx.mismatches3.slice(0, 40),
  },
  pptx: {
    totalComparable: pptx.checks.length,
    mismatches3: pptx.mismatches3.length,
    mismatchSamples: pptx.mismatches3.slice(0, 30),
  },
};

await fs.writeFile(OUT_JSON, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
