import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TARGET_EMAIL = process.env.TARGET_EMAIL || 'qaseed+12@example.org';
const GROUP_CYCLE1 = process.env.GROUP_CYCLE1 || '1';
const GROUP_CYCLE2 = process.env.GROUP_CYCLE2 || '2';
const PAUSE_MS = Number(process.env.PAUSE_MS || 1800);
const OUT_DIR = process.env.OUT_DIR || '/tmp/v11_t0_t3_all_surveys';
const SURVEY_IDS = (process.env.SURVEY_IDS || '16,17,18,19,20,21,22,23,24')
  .split(',')
  .map((x) => Number(x.trim()))
  .filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const res = await fetch(url, opts);
  const body = await parseJson(res);
  return { ok: res.ok, status: res.status, data: body.json, text: body.text };
}

async function signIn(email, password) {
  return api(`${API_BASE}/auth/account/signin/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      fingerPrint: fp(email),
      permissions: [],
    }),
  });
}

function authHeaders(token, withJson = false) {
  if (!withJson) return { Authorization: `Bearer ${token}` };
  return {
    Authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

function extractItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function sortRevisionsAsc(revisions) {
  return revisions
    .slice()
    .sort(
      (a, b) =>
        new Date(a.dateStart || a.createdAt || 0).getTime() -
        new Date(b.dateStart || b.createdAt || 0).getTime(),
    );
}

function normalizeToken(value) {
  return String(value ?? '').trim().toLowerCase();
}

function splitGroupTokens(value) {
  return String(value ?? '')
    .split(/[;,|/]+/g)
    .map((x) => normalizeToken(x))
    .filter(Boolean);
}

function hasTokenLike(value, expected) {
  const ex = normalizeToken(expected);
  const tokens = splitGroupTokens(value);
  return tokens.some((t) => t === ex || t.includes(ex));
}

function parseXlsx(filePath, targetEmail) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.includes('Ответы') ? 'Ответы' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = (rows[0] || []).map((x) => String(x ?? '').trim());
  const body = rows.slice(1).filter((r) => r.some((x) => String(x ?? '').trim() !== ''));
  const groupsColIdx = headers.findIndex((h) => h === 'Группы');

  const targetRows = body.filter((r) =>
    r.some((cell) => String(cell ?? '').toLowerCase().includes(String(targetEmail).toLowerCase())),
  );
  const targetGroupValues =
    groupsColIdx >= 0
      ? targetRows.map((r) => String(r[groupsColIdx] ?? '').trim()).filter(Boolean)
      : [];

  return {
    rowsCount: body.length,
    hasGroupsColumn: groupsColIdx >= 0,
    targetRowsCount: targetRows.length,
    targetGroupValues,
  };
}

async function exportXlsx({ token, surveyId, filters, key, resultsWithGroups }) {
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
    `${API_BASE}/public/surveys/export/xlsx/?lang=ru&token=${encodeURIComponent(tokenRes.data.token)}`,
  );
  if (!dlRes.ok) return { ok: false, stage: 'download', status: dlRes.status };

  const filePath = path.join(OUT_DIR, `${key}.xlsx`);
  await fs.writeFile(filePath, Buffer.from(await dlRes.arrayBuffer()));
  return { ok: true, filePath, parsed: parseXlsx(filePath, TARGET_EMAIL) };
}

async function getUserByEmail(token, email) {
  await sleep(PAUSE_MS);
  const usersRes = await api(
    `${API_BASE}/manager/users/?q=${encodeURIComponent(email)}&limit=50&offset=0`,
    { headers: authHeaders(token) },
  );
  const users = extractItems(usersRes.data);
  return users.find(
    (u) => String(u?.account?.email || u?.email || '').toLowerCase() === email.toLowerCase(),
  );
}

async function getGroupByTitle(token, title) {
  await sleep(PAUSE_MS);
  const res = await api(
    `${API_BASE}/manager/user-groups/by-title/?title=${encodeURIComponent(title)}`,
    { headers: authHeaders(token) },
  );
  return res.ok && res.data?.id ? res.data : null;
}

async function getAllGroups(token) {
  await sleep(PAUSE_MS);
  const res = await api(`${API_BASE}/manager/user-groups/?limit=300&offset=0`, {
    headers: authHeaders(token),
  });
  return extractItems(res.data);
}

async function getGroupUsersByQuery(token, groupId, email) {
  await sleep(PAUSE_MS);
  const res = await api(
    `${API_BASE}/manager/user-groups/${groupId}/users/?q=${encodeURIComponent(email)}&limit=20&offset=0`,
    { headers: authHeaders(token) },
  );
  return extractItems(res.data);
}

async function isUserInGroup(token, userId, groupId, email) {
  const users = await getGroupUsersByQuery(token, groupId, email);
  return users.some((u) => Number(u?.id) === Number(userId));
}

async function addUserToGroup(token, userId, groupId) {
  await sleep(PAUSE_MS);
  return api(`${API_BASE}/manager/user-groups/${groupId}/users/add/`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ usersIds: [userId] }),
  });
}

async function removeUserFromGroup(token, userId, groupId) {
  await sleep(PAUSE_MS);
  return api(`${API_BASE}/manager/user-groups/${groupId}/users/remove/`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ usersIds: [userId] }),
  });
}

async function revisionHasTargetAnswer(token, surveyId, revisionId) {
  await sleep(PAUSE_MS);
  const usersRes = await api(
    `${API_BASE}/manager/surveys/${surveyId}/statistics/users/?revisionsIds=${revisionId}&limit=500&offset=0`,
    { headers: authHeaders(token) },
  );
  const items = extractItems(usersRes.data);
  return items.some(
    (u) => String(u?.account?.email || u?.email || '').toLowerCase() === TARGET_EMAIL.toLowerCase(),
  );
}

function inferModel(groupValues) {
  if (!groupValues.length) return 'no_target_rows';
  const has1 = groupValues.some((v) => hasTokenLike(v, GROUP_CYCLE1));
  const has2 = groupValues.some((v) => hasTokenLike(v, GROUP_CYCLE2));
  if (has1 && !has2) return 't1_historical_group';
  if (!has1 && has2) return 't3_current_group';
  if (has1 && has2) return 'mixed';
  return 'other';
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const auth = await signIn(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!auth.ok || !auth.data?.accessToken) throw new Error(`Admin auth failed: ${auth.status} ${auth.text}`);
  const token = auth.data.accessToken;

  const user = await getUserByEmail(token, TARGET_EMAIL);
  if (!user?.id) throw new Error(`Target user not found: ${TARGET_EMAIL}`);

  const g1 = await getGroupByTitle(token, GROUP_CYCLE1);
  const g2 = await getGroupByTitle(token, GROUP_CYCLE2);
  if (!g1?.id || !g2?.id) throw new Error(`Cannot resolve groups ${GROUP_CYCLE1} and ${GROUP_CYCLE2}`);

  // T2/T3: move +12 to only group 2 before export
  const fixes = [];
  const groups = await getAllGroups(token);
  for (const g of groups) {
    const inGroup = await isUserInGroup(token, user.id, g.id, TARGET_EMAIL);
    if (!inGroup) continue;
    if (Number(g.id) === Number(g2.id)) continue;
    const rem = await removeUserFromGroup(token, user.id, g.id);
    if (!rem.ok) throw new Error(`T2 cannot remove from group ${g.title}: ${rem.status}`);
    fixes.push(`removed_from_${g.title}`);
  }
  let in2 = await isUserInGroup(token, user.id, g2.id, TARGET_EMAIL);
  if (!in2) {
    const add = await addUserToGroup(token, user.id, g2.id);
    if (!add.ok) throw new Error(`T2 cannot add to group ${GROUP_CYCLE2}: ${add.status}`);
    fixes.push(`added_to_${GROUP_CYCLE2}`);
    in2 = await isUserInGroup(token, user.id, g2.id, TARGET_EMAIL);
  }
  if (!in2) throw new Error(`T3 hard-fail: ${TARGET_EMAIL} not in group ${GROUP_CYCLE2}`);

  const surveys = [];
  for (const surveyId of SURVEY_IDS) {
    await sleep(PAUSE_MS);
    const revRes = await api(`${API_BASE}/manager/surveys/${surveyId}/statistics/revisions/`, {
      headers: authHeaders(token),
    });
    const revisions = sortRevisionsAsc(extractItems(revRes.data));

    const revisionsWithTarget = [];
    for (const rev of revisions) {
      if (!rev?.id) continue;
      const hasTarget = await revisionHasTargetAnswer(token, surveyId, rev.id);
      if (hasTarget) revisionsWithTarget.push(rev);
    }

    const cycle1 = revisionsWithTarget.length ? revisionsWithTarget[0] : revisions[0];
    const row = {
      surveyId,
      cycle1: cycle1 ? { id: cycle1.id, alias: cycle1.alias ?? null } : null,
      precondition: {
        hasAtLeastTwoRevisions: revisions.length >= 2,
        targetAnsweredCycle1: Boolean(cycle1 && revisionsWithTarget.some((r) => r.id === cycle1.id)),
        revisionsWithTargetIds: revisionsWithTarget.map((r) => r.id),
      },
      exports: null,
      checks: null,
    };

    if (!cycle1?.id) {
      row.checks = { error: 'no_cycle1_revision_found' };
      surveys.push(row);
      continue;
    }

    const filters = {
      revisionsIds: [cycle1.id],
      usersIds: [user.id],
      userGroupsIds: [],
      departmentsIds: [],
    };

    const before = await exportXlsx({
      token,
      surveyId,
      filters,
      key: `survey_${surveyId}_cycle1_${cycle1.id}_v11_before`,
      resultsWithGroups: false,
    });
    const after = await exportXlsx({
      token,
      surveyId,
      filters,
      key: `survey_${surveyId}_cycle1_${cycle1.id}_v11_after`,
      resultsWithGroups: true,
    });

    const values = after.ok ? after.parsed.targetGroupValues : [];
    row.exports = { before, after };
    row.checks = {
      before_hasGroupsColumn: before.ok ? before.parsed.hasGroupsColumn : null,
      after_hasGroupsColumn: after.ok ? after.parsed.hasGroupsColumn : null,
      before_targetRowsCount: before.ok ? before.parsed.targetRowsCount : null,
      after_targetRowsCount: after.ok ? after.parsed.targetRowsCount : null,
      after_targetGroupValues: values,
      after_has_group1: after.ok ? values.some((v) => hasTokenLike(v, GROUP_CYCLE1)) : null,
      after_has_group2: after.ok ? values.some((v) => hasTokenLike(v, GROUP_CYCLE2)) : null,
      modelInference: inferModel(values),
    };

    surveys.push(row);
  }

  const report = {
    scenario: 'V11',
    targetEmail: TARGET_EMAIL,
    cycle1Group: GROUP_CYCLE1,
    movedToGroupBeforeExport: GROUP_CYCLE2,
    t2FixesApplied: fixes,
    surveys,
  };

  const outFile = path.join(OUT_DIR, 'v11_t0_t3_result.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, surveys: surveys.length }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
