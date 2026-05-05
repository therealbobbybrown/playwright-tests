import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TARGET_EMAIL = process.env.TARGET_EMAIL || 'qaseed+13@example.org';
const BASE_GROUP = process.env.BASE_GROUP || '1';
const REMOVED_GROUP = process.env.REMOVED_GROUP || '2';
const PAUSE_MS = Number(process.env.PAUSE_MS || 1800);
const OUT_DIR = process.env.OUT_DIR || '/tmp/v5_t0_t3_all_surveys';
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
  return String(value ?? '')
    .trim()
    .toLowerCase();
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
    (u) =>
      String(u?.account?.email || u?.email || '').toLowerCase() === email.toLowerCase(),
  );
}

async function getUserGroupByTitle(token, title) {
  await sleep(PAUSE_MS);
  const res = await api(
    `${API_BASE}/manager/user-groups/by-title/?title=${encodeURIComponent(title)}`,
    { headers: authHeaders(token) },
  );
  if (!res.ok || !res.data) return null;
  return res.data?.id ? res.data : null;
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

async function getAllUserGroupsByUserId(token, userId) {
  await sleep(PAUSE_MS);
  const groupsRes = await api(
    `${API_BASE}/manager/user-groups/?limit=300&offset=0&withUsersIds=1`,
    { headers: authHeaders(token) },
  );
  const groups = extractItems(groupsRes.data);
  return groups
    .filter((g) => (g.usersIds || []).some((uid) => Number(uid) === Number(userId)))
    .map((g) => ({ id: g.id, title: g.title }));
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const auth = await signIn(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!auth.ok || !auth.data?.accessToken) throw new Error(`Admin auth failed: ${auth.status} ${auth.text}`);
  const token = auth.data.accessToken;

  const user = await getUserByEmail(token, TARGET_EMAIL);
  if (!user?.id) throw new Error(`Target user not found: ${TARGET_EMAIL}`);

  const baseGroup = await getUserGroupByTitle(token, BASE_GROUP);
  const removedGroup = await getUserGroupByTitle(token, REMOVED_GROUP);
  if (!baseGroup?.id || !removedGroup?.id) throw new Error(`Cannot resolve groups ${BASE_GROUP}, ${REMOVED_GROUP}`);

  // T0: ensure +13 in 1+2
  const fixes = [];
  let inBase = await isUserInGroup(token, user.id, baseGroup.id, TARGET_EMAIL);
  if (!inBase) {
    const add = await addUserToGroup(token, user.id, baseGroup.id);
    if (!add.ok) throw new Error(`T0 cannot add to base group: ${add.status}`);
    fixes.push(`added_to_${BASE_GROUP}`);
  }
  let inRemoved = await isUserInGroup(token, user.id, removedGroup.id, TARGET_EMAIL);
  if (!inRemoved) {
    const add = await addUserToGroup(token, user.id, removedGroup.id);
    if (!add.ok) throw new Error(`T0 cannot add to removed group: ${add.status}`);
    fixes.push(`added_to_${REMOVED_GROUP}`);
  }
  inBase = await isUserInGroup(token, user.id, baseGroup.id, TARGET_EMAIL);
  inRemoved = await isUserInGroup(token, user.id, removedGroup.id, TARGET_EMAIL);
  if (!inBase || !inRemoved) throw new Error(`T0 hard-fail: expected in ${BASE_GROUP}=true and in ${REMOVED_GROUP}=true`);
  const groupsT0 = await getAllUserGroupsByUserId(token, user.id);

  // T1
  const surveys = [];
  for (const surveyId of SURVEY_IDS) {
    await sleep(PAUSE_MS);
    const revRes = await api(`${API_BASE}/manager/surveys/${surveyId}/statistics/revisions/`, { headers: authHeaders(token) });
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

  // T2: remove from group 2
  const rem2 = await removeUserFromGroup(token, user.id, removedGroup.id);
  if (!rem2.ok) throw new Error(`T2 cannot remove from group ${REMOVED_GROUP}: ${rem2.status}`);
  const inBaseAfter = await isUserInGroup(token, user.id, baseGroup.id, TARGET_EMAIL);
  const inRemovedAfter = await isUserInGroup(token, user.id, removedGroup.id, TARGET_EMAIL);
  if (!inBaseAfter || inRemovedAfter) throw new Error(`T2 hard-fail: expected in ${BASE_GROUP}=true and in ${REMOVED_GROUP}=false`);
  const groupsT2 = await getAllUserGroupsByUserId(token, user.id);

  // T3 exports
  for (const row of surveys) {
    if (!row.revision?.id) continue;
    const surveyId = row.surveyId;
    const revisionId = row.revision.id;
    const userFilters = { revisionsIds: [revisionId], usersIds: [user.id], userGroupsIds: [], departmentsIds: [] };
    const cycleFilters = { revisionsIds: [revisionId], usersIds: [], userGroupsIds: [], departmentsIds: [] };

    const userBefore = await exportXlsx({
      token, surveyId, filters: userFilters, key: `survey_${surveyId}_rev_${revisionId}_v5_user_before`, resultsWithGroups: false,
    });
    const userAfter = await exportXlsx({
      token, surveyId, filters: userFilters, key: `survey_${surveyId}_rev_${revisionId}_v5_user_after`, resultsWithGroups: true,
    });
    const cycleBefore = await exportXlsx({
      token, surveyId, filters: cycleFilters, key: `survey_${surveyId}_rev_${revisionId}_v5_cycle_before`, resultsWithGroups: false,
    });
    const cycleAfter = await exportXlsx({
      token, surveyId, filters: cycleFilters, key: `survey_${surveyId}_rev_${revisionId}_v5_cycle_after`, resultsWithGroups: true,
    });

    const vals = userAfter.ok ? userAfter.parsed.groupValues : [];
    row.exports = { userBefore, userAfter, cycleBefore, cycleAfter };
    row.checks = {
      userExport_before_hasGroupsColumn: userBefore.ok ? userBefore.parsed.hasGroupsColumn : null,
      userExport_after_hasGroupsColumn: userAfter.ok ? userAfter.parsed.hasGroupsColumn : null,
      userExport_after_hasBaseGroup: userAfter.ok ? vals.some((v) => hasTokenLike(v, BASE_GROUP)) : null,
      userExport_after_hasRemovedGroup: userAfter.ok ? vals.some((v) => hasTokenLike(v, REMOVED_GROUP)) : null,
      cycleExport_before_hasGroupsColumn: cycleBefore.ok ? cycleBefore.parsed.hasGroupsColumn : null,
      cycleExport_after_hasGroupsColumn: cycleAfter.ok ? cycleAfter.parsed.hasGroupsColumn : null,
      modelInference: userAfter.ok
        ? (vals.some((v) => hasTokenLike(v, BASE_GROUP)) && vals.some((v) => hasTokenLike(v, REMOVED_GROUP))
            ? 'historical_1_plus_2'
            : vals.some((v) => hasTokenLike(v, BASE_GROUP))
            ? 'actual_1_only'
            : 'no_user_row')
        : 'no_export',
    };
  }

  const groupsT3 = await getAllUserGroupsByUserId(token, user.id);

  const report = {
    scenario: 'V5',
    targetEmail: TARGET_EMAIL,
    baseGroup: BASE_GROUP,
    removedGroup: REMOVED_GROUP,
    t0: { userId: user.id, groups: groupsT0, fixesApplied: fixes, inBase: true, inRemoved: true },
    t2: { groupsAfterRemove: groupsT2, inBase: inBaseAfter, inRemoved: inRemovedAfter },
    t3: { groups: groupsT3 },
    surveys,
  };

  const outFile = path.join(OUT_DIR, 'v5_t0_t3_result.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, surveys: surveys.length }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
