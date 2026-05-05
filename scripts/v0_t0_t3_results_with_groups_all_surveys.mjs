import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TARGET_EMAIL = process.env.TARGET_EMAIL || 'qaseed+8@example.org';
const EXPECTED_GROUP = process.env.EXPECTED_GROUP || '1';
const PAUSE_MS = Number(process.env.PAUSE_MS || 1800);
const OUT_DIR = process.env.OUT_DIR || '/tmp/v0_t0_t3_all_surveys';
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
    sheetName,
    headers,
    rowsCount: body.length,
    hasGroupsColumn: groupsColIdx >= 0,
    groupsColIdx,
    groupValuesSample: groupValues.slice(0, 5),
    containsExpectedGroup: groupValues.some((v) => v === EXPECTED_GROUP || v.includes(EXPECTED_GROUP)),
  };
}

async function exportXlsx({
  token,
  surveyId,
  filters,
  key,
  resultsWithGroups = true,
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
  if (!dlRes.ok) {
    return { ok: false, stage: 'download', status: dlRes.status };
  }

  const filePath = path.join(OUT_DIR, `${key}.xlsx`);
  await fs.writeFile(filePath, Buffer.from(await dlRes.arrayBuffer()));
  const parsed = parseXlsx(filePath);

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
    `${API_BASE}/manager/user-groups/?limit=200&offset=0&withUsersIds=1`,
    { headers: authHeaders(token) },
  );
  const groups = extractItems(groupsRes.data);
  return groups
    .filter((g) => (g.usersIds || []).includes(userId))
    .map((g) => ({ id: g.id, title: g.title }));
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

  const expectedGroup = await getUserGroupByTitle(token, EXPECTED_GROUP);
  if (!expectedGroup?.id) {
    throw new Error(`Expected group not found by title: ${EXPECTED_GROUP}`);
  }

  // T0: стартовое состояние (жесткая валидация членства в группе 1)
  let inExpectedAtT0 = await isUserInGroup(token, user.id, expectedGroup.id);
  let t0AutoFixApplied = false;
  if (!inExpectedAtT0) {
    const addRes = await addUserToGroup(token, user.id, expectedGroup.id);
    if (!addRes.ok) {
      throw new Error(
        `T0 failed and cannot auto-fix membership: ${addRes.status} ${(addRes.text || '').slice(0, 200)}`,
      );
    }
    t0AutoFixApplied = true;
    inExpectedAtT0 = await isUserInGroup(token, user.id, expectedGroup.id);
  }
  if (!inExpectedAtT0) {
    throw new Error(
      `T0 hard-fail: ${TARGET_EMAIL} is not in expected group ${EXPECTED_GROUP}`,
    );
  }

  const groupsT0 = await getAllUserGroupsByUserId(token, user.id);

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

    // T1: момент ответа
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
      passByData:
        targetVisible || (answersCount > 0 && userItems.length === 0),
    };

    // T2: между ответом и выгрузкой (в этом сценарии без изменений, но фиксируем факт)
    const t2Groups = await getAllUserGroupsByUserId(token, user.id);
    const inExpectedAtT2 = await isUserInGroup(token, user.id, expectedGroup.id);
    surveyResult.t2_snapshot = {
      groups: t2Groups,
      hasExpectedGroup: inExpectedAtT2,
      groupsSameAsT0:
        JSON.stringify(groupsT0.map((g) => g.title).sort()) ===
        JSON.stringify(t2Groups.map((g) => g.title).sort()),
    };

    // T3: выгрузка результатов
    const filteredByUser = await exportXlsx({
      token,
      surveyId,
      key: `survey_${surveyId}_rev_${revision.id}_filtered_user`,
      filters: {
        revisionsIds: [revision.id],
        usersIds: [user.id],
        userGroupsIds: [],
        departmentsIds: [],
      },
      resultsWithGroups: true,
    });

    const filteredByCycle = await exportXlsx({
      token,
      surveyId,
      key: `survey_${surveyId}_rev_${revision.id}_filtered_cycle`,
      filters: {
        revisionsIds: [revision.id],
        usersIds: [],
        userGroupsIds: [],
        departmentsIds: [],
      },
      resultsWithGroups: true,
    });

    surveyResult.exports = {
      filteredByUser,
      filteredByCycle,
    };

    const t3Groups = await getAllUserGroupsByUserId(token, user.id);
    const inExpectedAtT3 = await isUserInGroup(token, user.id, expectedGroup.id);
    surveyResult.t3_snapshot = {
      groups: t3Groups,
      hasExpectedGroup: inExpectedAtT3,
      groupsSameAsT2:
        JSON.stringify(t2Groups.map((g) => g.title).sort()) ===
        JSON.stringify(t3Groups.map((g) => g.title).sort()),
      groupsSameAsT0:
        JSON.stringify(groupsT0.map((g) => g.title).sort()) ===
        JSON.stringify(t3Groups.map((g) => g.title).sort()),
    };

    surveyResult.checks = {
      groupsColumnInUserExport: filteredByUser.ok
        ? filteredByUser.parsed.hasGroupsColumn
        : null,
      groupsValueLooksStableForUser: filteredByUser.ok
        ? filteredByUser.parsed.containsExpectedGroup
        : null,
      cycleExportHasGroupsColumn: filteredByCycle.ok
        ? filteredByCycle.parsed.hasGroupsColumn
        : null,
    };

    surveys.push(surveyResult);
  }

  // T3: конечное состояние группы
  const groupsT3 = await getAllUserGroupsByUserId(token, user.id);
  const inExpectedAtT3Overall = await isUserInGroup(token, user.id, expectedGroup.id);

  const report = {
    scenario: 'V0',
    targetEmail: TARGET_EMAIL,
    expectedGroup: EXPECTED_GROUP,
    expectedGroupResolved: {
      id: expectedGroup.id,
      title: expectedGroup.title,
    },
    t0AutoFixApplied,
    t0: {
      userId: user.id,
      groups: groupsT0,
      hasExpectedGroup: inExpectedAtT0,
    },
    t2: {
      changesApplied: false,
      note: 'T2 was explicitly captured per survey in surveys[].t2_snapshot',
    },
    t3: {
      groups: groupsT3,
      hasExpectedGroup: inExpectedAtT3Overall,
      groupsStable:
        JSON.stringify(groupsT0.map((g) => g.title).sort()) ===
        JSON.stringify(groupsT3.map((g) => g.title).sort()),
    },
    surveys,
  };

  const outFile = path.join(OUT_DIR, 'v0_t0_t3_result.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, report }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
