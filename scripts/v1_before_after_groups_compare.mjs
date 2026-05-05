import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import { createHash } from 'node:crypto';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const OUT_DIR = process.env.OUT_DIR || '/tmp/v1_t0_t3_all_surveys';
const PAUSE_MS = Number(process.env.PAUSE_MS || 1800);
const TARGET_USER_ID = Number(process.env.TARGET_USER_ID || 189);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timeoutMs = 45000;

function fp(seed = '') {
  return createHash('md5').update(`${Date.now()}_${seed}`).digest('hex');
}

function userDatePlus8() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const p = (n, z = 2) => String(n).padStart(z, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(
    d.getUTCHours(),
  )}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}+08:00`;
}

async function parseJson(res) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

async function api(url, opts = {}) {
  const merged = { ...opts, signal: AbortSignal.timeout(timeoutMs) };
  const res = await fetch(url, merged);
  const body = await parseJson(res);
  return { ok: res.ok, status: res.status, data: body.json, text: body.text };
}

function authHeaders(token, withJson = false) {
  if (!withJson) return { Authorization: `Bearer ${token}` };
  return {
    Authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

function parseXlsx(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.includes('Ответы') ? 'Ответы' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = (rows[0] || []).map((x) => String(x ?? '').trim());
  const body = rows.slice(1).filter((r) => r.some((x) => String(x ?? '').trim() !== ''));
  const groupsColIdx = headers.findIndex((h) => h === 'Группы');
  return {
    hasGroupsColumn: groupsColIdx >= 0,
    rowsCount: body.length,
    groupsValues:
      groupsColIdx >= 0
        ? body.map((r) => String(r[groupsColIdx] ?? '').trim())
        : [],
  };
}

async function exportXlsx({
  token,
  surveyId,
  revisionId,
  mode,
  resultsWithGroups,
}) {
  const filters =
    mode === 'user'
      ? {
          revisionsIds: [revisionId],
          usersIds: [TARGET_USER_ID],
          userGroupsIds: [],
          departmentsIds: [],
        }
      : {
          revisionsIds: [revisionId],
          usersIds: [],
          userGroupsIds: [],
          departmentsIds: [],
        };

  const q = new URLSearchParams({
    userDate: userDatePlus8(),
    filters: JSON.stringify(filters),
    resultsWithAI: 'false',
    resultsWithGroups: resultsWithGroups ? 'true' : 'false',
  });

  await sleep(PAUSE_MS);
  const tokenRes = await api(
    `${API_BASE}/manager/surveys/${surveyId}/export/get-token/?${q.toString()}`,
    { headers: authHeaders(token) },
  );
  if (!tokenRes.ok || !tokenRes.data?.token) {
    return {
      ok: false,
      stage: 'get-token',
      status: tokenRes.status,
      textSample: (tokenRes.text || '').slice(0, 300),
    };
  }

  await sleep(PAUSE_MS);
  const dlRes = await fetch(
    `${API_BASE}/public/surveys/export/xlsx/?lang=ru&token=${encodeURIComponent(
      tokenRes.data.token,
    )}`,
    { signal: AbortSignal.timeout(timeoutMs) },
  );
  if (!dlRes.ok) {
    return { ok: false, stage: 'download', status: dlRes.status };
  }

  const key = `survey_${surveyId}_rev_${revisionId}_v1_${mode}_${resultsWithGroups ? 'on' : 'off'}`;
  const filePath = path.join(OUT_DIR, `${key}.xlsx`);
  await fs.writeFile(filePath, Buffer.from(await dlRes.arrayBuffer()));
  return { ok: true, filePath, parsed: parseXlsx(filePath) };
}

async function main() {
  const src = JSON.parse(
    await fs.readFile(path.join(OUT_DIR, 'v1_t0_t3_result.json'), 'utf8'),
  );

  const auth = await api(`${API_BASE}/auth/account/signin/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: ADMIN_LOGIN,
      password: ADMIN_PASSWORD,
      fingerPrint: fp(ADMIN_LOGIN),
      permissions: [],
    }),
  });
  if (!auth.ok || !auth.data?.accessToken) {
    throw new Error(`Auth failed: ${auth.status} ${auth.text}`);
  }
  const token = auth.data.accessToken;

  const results = [];
  for (const s of src.surveys) {
    if (!s.revision?.id) continue;
    const surveyId = s.surveyId;
    const revisionId = s.revision.id;

    const userOff = await exportXlsx({
      token,
      surveyId,
      revisionId,
      mode: 'user',
      resultsWithGroups: false,
    });
    const userOn = await exportXlsx({
      token,
      surveyId,
      revisionId,
      mode: 'user',
      resultsWithGroups: true,
    });
    const cycleOff = await exportXlsx({
      token,
      surveyId,
      revisionId,
      mode: 'cycle',
      resultsWithGroups: false,
    });
    const cycleOn = await exportXlsx({
      token,
      surveyId,
      revisionId,
      mode: 'cycle',
      resultsWithGroups: true,
    });

    results.push({
      surveyId,
      revisionId,
      user: {
        off: userOff.ok ? userOff.parsed.hasGroupsColumn : null,
        on: userOn.ok ? userOn.parsed.hasGroupsColumn : null,
        onValues: userOn.ok ? userOn.parsed.groupsValues : [],
      },
      cycle: {
        off: cycleOff.ok ? cycleOff.parsed.hasGroupsColumn : null,
        on: cycleOn.ok ? cycleOn.parsed.hasGroupsColumn : null,
      },
      raw: { userOff, userOn, cycleOff, cycleOn },
    });
  }

  const out = path.join(OUT_DIR, 'v1_before_after_compare.json');
  await fs.writeFile(out, JSON.stringify({ results }, null, 2));
  console.log(JSON.stringify({ out, count: results.length }, null, 2));
}

main().catch((e) => {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
});
