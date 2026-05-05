import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TARGET_EMAIL = process.env.TARGET_EMAIL || 'qaseed+10@example.org';
const EXPECTED_GROUPS = (process.env.EXPECTED_GROUPS || '1,2')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
const PAUSE_MS = Number(process.env.PAUSE_MS || 1800);
const OUT_DIR = process.env.OUT_DIR || '/tmp/v2_t0_t3_all_surveys';
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

function groupValueHasBoth(value, expectedGroupTitles) {
  const raw = String(value ?? '').trim();
  if (!raw) return false;

  const split = raw
    .split(/[;,|/]+/g)
    .map((x) => normalizeToken(x))
    .filter(Boolean);

  const allTokens = new Set(split);
  const normalizedExpected = expectedGroupTitles.map((x) => normalizeToken(x));

  return normalizedExpected.every((g) => {
    if (allTokens.has(g)) return true;
    return Array.from(allTokens).some((t) => t.includes(g));
  });
}

function parseXlsx(filePath, expectedGroupTitles = []) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.includes('Ответы') ? 'Ответы' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = (rows[0] || []).map((x) => String(x ?? '').trim());
  const body = rows.slice(1).filter((r) => r.some((x) => String(x ?? '').trim() !== ''));
  const groupsColIdx = headers.findIndex((h) => h === 'Группы');
  const groupValues = groupsColIdx >= 0 ? body.map((r) => String(r[groupsColIdx] ?? '').trim()) : [];

  return {
    sheetName,
    headers,
    rowsCount: body.length,
    hasGroupsColumn: groupsColIdx >= 0,
    groupsColIdx,
    groupValuesSample: groupValues.slice(0, 5),
    groupValues,
    hasAnyRowWithBothGroups:
      groupsColIdx >= 0 && groupValues.some((v) => groupValueHasBoth(v, expectedGroupTitles)),
  };
}

async function exportXlsx({
  token,
  surveyId,
  filters,
  key,
  resultsWithGroups,
  expectedGroupTitles,
}) {
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
  );
  if (!dlRes.ok) return { ok: false, stage: 'download', status: dlRes.status };

  const filePath = path.join(OUT_DIR, `${key}.xlsx`);
  await fs.writeFile(filePath, Buffer.from(await dlRes.arrayBuffer()));
  const parsed = parseXlsx(filePath, expectedGroupTitles);
  return {
    ok: true,
    filePath,
    tokenStatus: tokenRes.status,
    downloadStatus: dlRes.status,
    parsed,
  };
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
      String(u?.account?.email || u?.email || '').toLowerCase() ===
      email.toLowerCase(),
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

async function getUsersInGroup(token, groupId) {
  await sleep(PAUSE_MS);
  const res = await api(
    `${API_BASE}/manager/user-groups/${groupId}/users/?limit=500&offset=0`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) return [];
  return extractItems(res.data);
}

function isUserInUsersList(users, userId) {
  return users.some((u) => Number(u?.id) === Number(userId));
}

async function isUserInGroup(token, userId, groupId) {
  const users = await getUsersInGroup(token, groupId);
  return isUserInUsersList(users, userId);
}

async function addUserToGroup(token, userId, groupId) {
  await sleep(PAUSE_MS);
  return api(`${API_BASE}/manager/user-groups/${groupId}/users/add/`, {
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

function groupsContainAll(groups, expectedTitles) {
  const titles = new Set(groups.map((g) => normalizeToken(g.title)));
  return expectedTitles.every((t) => titles.has(normalizeToken(t)));
}

async function hasAllExpectedMemberships(token, userId, expectedGroupsResolved) {
  for (const g of expectedGroupsResolved) {
    const inGroup = await isUserInGroup(token, userId, g.id);
    if (!inGroup) return false;
  }
  return true;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const auth = await signIn(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!auth.ok || !auth.data?.accessToken) {
    throw new Error(`Admin auth failed: ${auth.status} ${auth.text}`);
  }
  const token = auth.data.accessToken;

  const user = await getUserByEmail(token, TARGET_EMAIL);
  if (!user?.id) throw new Error(`Target user not found: ${TARGET_EMAIL}`);

  const expectedGroupsResolved = [];
  for (const title of EXPECTED_GROUPS) {
    const g = await getUserGroupByTitle(token, title);
    if (!g?.id) throw new Error(`Expected group not found by title: ${title}`);
    expectedGroupsResolved.push({ id: g.id, title: g.title });
  }

  // T0: ensure +10 is in groups 1+2
  const t0AutoFix = [];
  for (const g of expectedGroupsResolved) {
    const inGroup = await isUserInGroup(token, user.id, g.id);
    if (!inGroup) {
      const addRes = await addUserToGroup(token, user.id, g.id);
      if (!addRes.ok) {
        throw new Error(
          `Cannot add user to group ${g.title}(${g.id}): ${addRes.status} ${(addRes.text || '').slice(0, 200)}`,
        );
      }
      t0AutoFix.push(g.title);
    }
  }

  const groupsT0 = await getAllUserGroupsByUserId(token, user.id);
  const hasAllExpectedAtT0 = await hasAllExpectedMemberships(token, user.id, expectedGroupsResolved);
  if (!hasAllExpectedAtT0) {
    throw new Error(`T0 hard-fail: ${TARGET_EMAIL} is not in all expected groups ${EXPECTED_GROUPS.join('+')}`);
  }

  const surveys = [];
  for (const surveyId of SURVEY_IDS) {
    await sleep(PAUSE_MS);
    const revRes = await api(
      `${API_BASE}/manager/surveys/${surveyId}/statistics/revisions/`,
      { headers: authHeaders(token) },
    );
    const revisions = extractItems(revRes.data);
    const revision = pickActiveOrLatestRevision(revisions);

    const surveyResult = {
      surveyId,
      revision: revision
        ? {
            id: revision.id,
            alias: revision.alias,
            dateStart: revision.dateStart,
            dateEnd: revision.dateEnd ?? null,
            status: revision.status ?? null,
          }
        : null,
      t1_answerCheck: null,
      t2_snapshot: null,
      t3_snapshot: null,
      exports: null,
      checks: null,
    };

    if (!revision?.id) {
      surveyResult.checks = { error: 'no_revision_found' };
      surveys.push(surveyResult);
      continue;
    }

    // T1: answered
    await sleep(PAUSE_MS);
    const summaryRes = await api(
      `${API_BASE}/manager/surveys/${surveyId}/statistics/summary/get/`,
      {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ revisionsIds: [revision.id] }),
      },
    );
    await sleep(PAUSE_MS);
    const usersRes = await api(
      `${API_BASE}/manager/surveys/${surveyId}/statistics/users/?revisionsIds=${revision.id}&limit=300&offset=0`,
      { headers: authHeaders(token) },
    );
    const userItems = extractItems(usersRes.data);
    const targetVisible = userItems.some(
      (u) =>
        String(u?.account?.email || u?.email || '').toLowerCase() ===
        TARGET_EMAIL.toLowerCase(),
    );
    const answersCount = Number(summaryRes.data?.totalSummary?.answersCount || 0);
    surveyResult.t1_answerCheck = {
      summaryStatus: summaryRes.status,
      usersStatus: usersRes.status,
      itemsCount: userItems.length,
      answersCount,
      targetVisibleInUsersList: targetVisible,
      passByData: targetVisible || (answersCount > 0 && userItems.length === 0),
    };

    // T2: no changes
    const groupsT2 = await getAllUserGroupsByUserId(token, user.id);
    const hasAllExpectedAtT2 = await hasAllExpectedMemberships(token, user.id, expectedGroupsResolved);
    surveyResult.t2_snapshot = {
      groups: groupsT2,
      hasAllExpectedGroups: hasAllExpectedAtT2,
      groupsSameAsT0:
        JSON.stringify(groupsT0.map((g) => g.title).sort()) ===
        JSON.stringify(groupsT2.map((g) => g.title).sort()),
    };

    // T3: exports before/after feature
    const userFilters = {
      revisionsIds: [revision.id],
      usersIds: [user.id],
      userGroupsIds: [],
      departmentsIds: [],
    };
    const cycleFilters = {
      revisionsIds: [revision.id],
      usersIds: [],
      userGroupsIds: [],
      departmentsIds: [],
    };

    const userBefore = await exportXlsx({
      token,
      surveyId,
      filters: userFilters,
      key: `survey_${surveyId}_rev_${revision.id}_v2_user_before`,
      resultsWithGroups: false,
      expectedGroupTitles: EXPECTED_GROUPS,
    });
    const userAfter = await exportXlsx({
      token,
      surveyId,
      filters: userFilters,
      key: `survey_${surveyId}_rev_${revision.id}_v2_user_after`,
      resultsWithGroups: true,
      expectedGroupTitles: EXPECTED_GROUPS,
    });
    const cycleBefore = await exportXlsx({
      token,
      surveyId,
      filters: cycleFilters,
      key: `survey_${surveyId}_rev_${revision.id}_v2_cycle_before`,
      resultsWithGroups: false,
      expectedGroupTitles: EXPECTED_GROUPS,
    });
    const cycleAfter = await exportXlsx({
      token,
      surveyId,
      filters: cycleFilters,
      key: `survey_${surveyId}_rev_${revision.id}_v2_cycle_after`,
      resultsWithGroups: true,
      expectedGroupTitles: EXPECTED_GROUPS,
    });

    surveyResult.exports = { userBefore, userAfter, cycleBefore, cycleAfter };

    const groupsT3 = await getAllUserGroupsByUserId(token, user.id);
    const hasAllExpectedAtT3 = await hasAllExpectedMemberships(token, user.id, expectedGroupsResolved);
    surveyResult.t3_snapshot = {
      groups: groupsT3,
      hasAllExpectedGroups: hasAllExpectedAtT3,
      groupsSameAsT2:
        JSON.stringify(groupsT2.map((g) => g.title).sort()) ===
        JSON.stringify(groupsT3.map((g) => g.title).sort()),
    };

    surveyResult.checks = {
      userExport_before_hasGroupsColumn: userBefore.ok ? userBefore.parsed.hasGroupsColumn : null,
      userExport_after_hasGroupsColumn: userAfter.ok ? userAfter.parsed.hasGroupsColumn : null,
      userExport_after_hasBothGroupsInOneRow: userAfter.ok
        ? userAfter.parsed.hasAnyRowWithBothGroups
        : null,
      cycleExport_before_hasGroupsColumn: cycleBefore.ok ? cycleBefore.parsed.hasGroupsColumn : null,
      cycleExport_after_hasGroupsColumn: cycleAfter.ok ? cycleAfter.parsed.hasGroupsColumn : null,
      cycleExport_after_hasAnyRowWithBothGroups: cycleAfter.ok
        ? cycleAfter.parsed.hasAnyRowWithBothGroups
        : null,
    };

    surveys.push(surveyResult);
  }

  const report = {
    scenario: 'V2',
    targetEmail: TARGET_EMAIL,
    expectedGroups: EXPECTED_GROUPS,
    expectedGroupsResolved,
    t0AutoFixAppliedGroups: t0AutoFix,
    t0: {
      userId: user.id,
      groups: groupsT0,
      hasAllExpectedGroups: hasAllExpectedAtT0,
    },
    surveys,
  };

  const outFile = path.join(OUT_DIR, 'v2_t0_t3_result.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, reportSummary: { surveys: report.surveys.length } }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
