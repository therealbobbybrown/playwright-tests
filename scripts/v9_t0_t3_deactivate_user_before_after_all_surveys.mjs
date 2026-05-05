import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TARGET_EMAIL = process.env.TARGET_EMAIL || 'qaseed+10@example.org';
const GROUP_A = process.env.GROUP_A || '1';
const GROUP_B = process.env.GROUP_B || '2';
const PAUSE_MS = Number(process.env.PAUSE_MS || 1800);
const OUT_DIR = process.env.OUT_DIR || '/tmp/v9_t0_t3_all_surveys';
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

function pickActiveOrLatestRevision(revisions) {
  if (!revisions.length) return null;
  return (
    revisions.find((r) => r.status === 'active') ||
    revisions.find((r) => r.dateEnd == null) ||
    revisions
      .slice()
      .sort(
        (a, b) =>
          new Date(b.dateStart || b.createdAt || 0).getTime() -
          new Date(a.dateStart || a.createdAt || 0).getTime(),
      )[0]
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

function parseXlsx(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.includes('Ответы') ? 'Ответы' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = (rows[0] || []).map((x) => String(x ?? '').trim());
  const body = rows.slice(1).filter((r) => r.some((x) => String(x ?? '').trim() !== ''));
  const groupsColIdx = headers.findIndex((h) => h === 'Группы');
  const groupValues = groupsColIdx >= 0 ? body.map((r) => String(r[groupsColIdx] ?? '').trim()) : [];
  return {
    rowsCount: body.length,
    hasGroupsColumn: groupsColIdx >= 0,
    groupValues,
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
  return { ok: true, filePath, parsed: parseXlsx(filePath) };
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

async function deactivateUser(token, userId) {
  await sleep(PAUSE_MS);
  const attempts = [];

  // Legacy route (may return 404 on some stands)
  const legacy = await api(`${API_BASE}/manager/users/${userId}/deactivate/`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  attempts.push({ route: `/manager/users/${userId}/deactivate/`, status: legacy.status });
  if (legacy.ok) return { ...legacy, attempts, route: `/manager/users/${userId}/deactivate/` };

  // Batch route from OpenAPI
  const payloads = [
    { usersIds: [userId] },
    { userIds: [userId] },
    { ids: [userId] },
    { users: [userId] },
    { accountsIds: [userId] },
  ];
  for (const body of payloads) {
    await sleep(PAUSE_MS);
    const res = await api(`${API_BASE}/manager/users/deactivate`, {
      method: 'POST',
      headers: authHeaders(token, true),
      body: JSON.stringify(body),
    });
    attempts.push({ route: '/manager/users/deactivate', body, status: res.status });
    if (res.ok) return { ...res, attempts, route: '/manager/users/deactivate', bodyUsed: body };
  }

  return { ...legacy, attempts };
}

async function getManagerUserById(token, userId) {
  await sleep(PAUSE_MS);
  return api(`${API_BASE}/manager/users/${userId}/`, {
    headers: authHeaders(token),
  });
}

function inferInactive(data) {
  if (!data || typeof data !== 'object') return null;
  const candidates = [
    data.isActive,
    data.active,
    data.isDeactivated,
    data.user?.isActive,
    data.user?.active,
    data.user?.isDeactivated,
    data.account?.isActive,
    data.account?.active,
  ].filter((v) => v !== undefined);
  if (!candidates.length) return null;
  // if any explicit false-ish active flag
  if (candidates.includes(false)) return true;
  if (candidates.includes(true)) return false;
  return null;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const auth = await signIn(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!auth.ok || !auth.data?.accessToken) throw new Error(`Admin auth failed: ${auth.status} ${auth.text}`);
  const token = auth.data.accessToken;

  const user = await getUserByEmail(token, TARGET_EMAIL);
  if (!user?.id) throw new Error(`Target user not found: ${TARGET_EMAIL}`);

  const g1 = await getGroupByTitle(token, GROUP_A);
  const g2 = await getGroupByTitle(token, GROUP_B);
  if (!g1?.id || !g2?.id) throw new Error(`Cannot resolve groups ${GROUP_A} and ${GROUP_B}`);

  // T0: ensure +10 in groups 1+2
  const fixes = [];
  const groups = await getAllGroups(token);
  for (const g of groups) {
    const inGroup = await isUserInGroup(token, user.id, g.id, TARGET_EMAIL);
    if (!inGroup) continue;
    if (Number(g.id) === Number(g1.id) || Number(g.id) === Number(g2.id)) continue;
    const rem = await removeUserFromGroup(token, user.id, g.id);
    if (!rem.ok) throw new Error(`T0 cannot remove from group ${g.title}: ${rem.status}`);
    fixes.push(`removed_from_${g.title}`);
  }
  let in1 = await isUserInGroup(token, user.id, g1.id, TARGET_EMAIL);
  if (!in1) {
    const add = await addUserToGroup(token, user.id, g1.id);
    if (!add.ok) throw new Error(`T0 cannot add to group ${GROUP_A}: ${add.status}`);
    fixes.push(`added_to_${GROUP_A}`);
  }
  let in2 = await isUserInGroup(token, user.id, g2.id, TARGET_EMAIL);
  if (!in2) {
    const add = await addUserToGroup(token, user.id, g2.id);
    if (!add.ok) throw new Error(`T0 cannot add to group ${GROUP_B}: ${add.status}`);
    fixes.push(`added_to_${GROUP_B}`);
  }
  in1 = await isUserInGroup(token, user.id, g1.id, TARGET_EMAIL);
  in2 = await isUserInGroup(token, user.id, g2.id, TARGET_EMAIL);
  if (!in1 || !in2) throw new Error(`T0 hard-fail: ${TARGET_EMAIL} not in ${GROUP_A}+${GROUP_B}`);

  // T1
  const surveys = [];
  for (const surveyId of SURVEY_IDS) {
    await sleep(PAUSE_MS);
    const revRes = await api(`${API_BASE}/manager/surveys/${surveyId}/statistics/revisions/`, {
      headers: authHeaders(token),
    });
    const revisions = extractItems(revRes.data);
    const revision = pickActiveOrLatestRevision(revisions);

    const row = {
      surveyId,
      revision: revision ? { id: revision.id, alias: revision.alias, status: revision.status ?? null } : null,
      t1_answerCheck: null,
      exports: null,
      checks: null,
    };
    if (!revision?.id) {
      row.checks = { error: 'no_revision_found' };
      surveys.push(row);
      continue;
    }

    await sleep(PAUSE_MS);
    const summaryRes = await api(`${API_BASE}/manager/surveys/${surveyId}/statistics/summary/get/`, {
      method: 'POST',
      headers: authHeaders(token, true),
      body: JSON.stringify({ revisionsIds: [revision.id] }),
    });
    await sleep(PAUSE_MS);
    const usersRes = await api(
      `${API_BASE}/manager/surveys/${surveyId}/statistics/users/?revisionsIds=${revision.id}&limit=400&offset=0`,
      { headers: authHeaders(token) },
    );
    const userItems = extractItems(usersRes.data);
    const targetVisible = userItems.some(
      (u) => String(u?.account?.email || u?.email || '').toLowerCase() === TARGET_EMAIL.toLowerCase(),
    );
    const answersCount = Number(summaryRes.data?.totalSummary?.answersCount || 0);
    row.t1_answerCheck = {
      answersCount,
      targetVisibleInUsersList: targetVisible,
      passByData: targetVisible || (answersCount > 0 && userItems.length === 0),
    };
    surveys.push(row);
  }

  // T2: deactivate user
  const deactivateRes = await deactivateUser(token, user.id);
  if (!deactivateRes.ok) throw new Error(`T2 cannot deactivate user ${TARGET_EMAIL}: ${deactivateRes.status}`);
  const userAfterDeactivate = await getManagerUserById(token, user.id);
  const inactiveInferred = inferInactive(userAfterDeactivate.data);

  // T3 exports
  for (const row of surveys) {
    if (!row.revision?.id) continue;
    const surveyId = row.surveyId;
    const revisionId = row.revision.id;
    const userFilters = { revisionsIds: [revisionId], usersIds: [user.id], userGroupsIds: [], departmentsIds: [] };
    const cycleFilters = { revisionsIds: [revisionId], usersIds: [], userGroupsIds: [], departmentsIds: [] };

    const userBefore = await exportXlsx({
      token, surveyId, filters: userFilters, key: `survey_${surveyId}_rev_${revisionId}_v9_user_before`, resultsWithGroups: false,
    });
    const userAfter = await exportXlsx({
      token, surveyId, filters: userFilters, key: `survey_${surveyId}_rev_${revisionId}_v9_user_after`, resultsWithGroups: true,
    });
    const cycleBefore = await exportXlsx({
      token, surveyId, filters: cycleFilters, key: `survey_${surveyId}_rev_${revisionId}_v9_cycle_before`, resultsWithGroups: false,
    });
    const cycleAfter = await exportXlsx({
      token, surveyId, filters: cycleFilters, key: `survey_${surveyId}_rev_${revisionId}_v9_cycle_after`, resultsWithGroups: true,
    });

    const vals = userAfter.ok ? userAfter.parsed.groupValues : [];
    row.exports = { userBefore, userAfter, cycleBefore, cycleAfter };
    row.checks = {
      userExport_before_hasGroupsColumn: userBefore.ok ? userBefore.parsed.hasGroupsColumn : null,
      userExport_after_hasGroupsColumn: userAfter.ok ? userAfter.parsed.hasGroupsColumn : null,
      userExport_before_rows: userBefore.ok ? userBefore.parsed.rowsCount : null,
      userExport_after_rows: userAfter.ok ? userAfter.parsed.rowsCount : null,
      userExport_after_hasGroup1: userAfter.ok ? vals.some((v) => hasTokenLike(v, GROUP_A)) : null,
      userExport_after_hasGroup2: userAfter.ok ? vals.some((v) => hasTokenLike(v, GROUP_B)) : null,
      cycleExport_before_hasGroupsColumn: cycleBefore.ok ? cycleBefore.parsed.hasGroupsColumn : null,
      cycleExport_after_hasGroupsColumn: cycleAfter.ok ? cycleAfter.parsed.hasGroupsColumn : null,
      modelInference: userAfter.ok
        ? (userAfter.parsed.rowsCount > 0
            ? vals.some((v) => hasTokenLike(v, GROUP_A) || hasTokenLike(v, GROUP_B))
              ? 'row_kept_groups_kept'
              : 'row_kept_groups_changed'
            : 'no_user_row')
        : 'no_export',
    };
  }

  const report = {
    scenario: 'V9',
    targetEmail: TARGET_EMAIL,
    groups: [GROUP_A, GROUP_B],
    t0: {
      userId: user.id,
      inGroup1: in1,
      inGroup2: in2,
      fixesApplied: fixes,
    },
    t2: {
      deactivateStatus: deactivateRes.status,
      deactivateRoute: deactivateRes.route || null,
      deactivateBodyUsed: deactivateRes.bodyUsed || null,
      deactivateAttempts: deactivateRes.attempts || [],
      inactiveInferred,
    },
    surveys,
  };

  const outFile = path.join(OUT_DIR, 'v9_t0_t3_result.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, surveys: surveys.length }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
