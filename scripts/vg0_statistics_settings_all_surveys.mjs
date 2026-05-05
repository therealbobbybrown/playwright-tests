import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TARGET_EMAIL = (process.env.TARGET_EMAIL || 'qaseed+8@example.org').toLowerCase();
const EXPECTED_GROUP = String(process.env.EXPECTED_GROUP || '1');
const PAUSE_MS = Number(process.env.PAUSE_MS || 2200);
const OUT_DIR = process.env.OUT_DIR || '/tmp/vg0_statistics_settings';
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
    body: JSON.stringify({ email, password, fingerPrint: fp(email), permissions: [] }),
  });
}

function authHeaders(token, withJson = false) {
  if (!withJson) return { Authorization: `Bearer ${token}` };
  return { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
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

function normalize(v) {
  return String(v ?? '').trim().toLowerCase();
}

function splitGroupTokens(v) {
  return String(v ?? '')
    .split(/[;,|/]+/g)
    .map((x) => normalize(x))
    .filter(Boolean);
}

function includesExpectedGroup(v) {
  const ex = normalize(EXPECTED_GROUP);
  return splitGroupTokens(v).some((t) => t === ex || t.includes(ex));
}

async function getUserByEmail(token, email) {
  await sleep(PAUSE_MS);
  const usersRes = await api(
    `${API_BASE}/manager/users/?q=${encodeURIComponent(email)}&limit=50&offset=0`,
    { headers: authHeaders(token) },
  );
  const users = extractItems(usersRes.data);
  return users.find((u) => normalize(u?.account?.email || u?.email) === normalize(email)) || null;
}

async function getAllGroups(token) {
  await sleep(PAUSE_MS);
  const groupsRes = await api(`${API_BASE}/manager/user-groups/?limit=300&offset=0&withUsersIds=1`, {
    headers: authHeaders(token),
  });
  return extractItems(groupsRes.data);
}

async function isEmailInGroup(token, groupId, email) {
  await sleep(PAUSE_MS);
  const res = await api(
    `${API_BASE}/manager/user-groups/${groupId}/users/?q=${encodeURIComponent(email)}&limit=20&offset=0`,
    { headers: authHeaders(token) },
  );
  const items = extractItems(res.data);
  return items.some((u) => normalize(u?.account?.email || u?.email) === normalize(email));
}

async function getGroupByTitle(token, title) {
  await sleep(PAUSE_MS);
  const byTitle = await api(
    `${API_BASE}/manager/user-groups/by-title/?title=${encodeURIComponent(title)}`,
    { headers: authHeaders(token) },
  );
  if (byTitle.ok && byTitle.data?.id) return byTitle.data;

  const groups = await getAllGroups(token);
  return groups.find((g) => normalize(g?.title) === normalize(title)) || null;
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

async function getUserGroupsByEmail(token, email) {
  const groups = await getAllGroups(token);
  const found = [];
  for (const g of groups) {
    const inGroup = await isEmailInGroup(token, g.id, email);
    if (inGroup) found.push({ id: g.id, title: g.title });
  }
  return found.sort((a, b) => String(a.title).localeCompare(String(b.title)));
}

async function ensureUserOnlyInExpectedGroup(token, userId, userEmail, expectedGroupId) {
  const fixes = [];
  const groups = await getUserGroupsByEmail(token, userEmail);
  for (const g of groups) {
    if (Number(g.id) === Number(expectedGroupId)) continue;
    const rem = await removeUserFromGroup(token, userId, g.id);
    if (!rem.ok) {
      throw new Error(
        `Cannot remove user ${userId} from group ${g.id}: ${rem.status} ${(rem.text || '').slice(0, 200)}`,
      );
    }
    fixes.push({ action: 'remove', groupId: g.id, groupTitle: g.title, status: rem.status, ok: rem.ok });
  }

  const now = await getUserGroupsByEmail(token, userEmail);
  const inExpected = now.some((g) => Number(g.id) === Number(expectedGroupId));
  if (!inExpected) {
    const add = await addUserToGroup(token, userId, expectedGroupId);
    if (!add.ok) {
      throw new Error(
        `Cannot add user ${userId} to expected group ${expectedGroupId}: ${add.status} ${(add.text || '').slice(0, 200)}`,
      );
    }
    fixes.push({ action: 'add', groupId: expectedGroupId, status: add.status, ok: add.ok });
  }

  const finalState = await getUserGroupsByEmail(token, userEmail);
  return { fixes, finalState };
}

async function getSurveyRevisions(token, surveyId) {
  await sleep(PAUSE_MS);
  const revRes = await api(`${API_BASE}/manager/surveys/${surveyId}/statistics/revisions/`, {
    headers: authHeaders(token),
  });
  return extractItems(revRes.data);
}

async function getWebSnapshot(token, surveyId, revisionId, userId, userEmail) {
  await sleep(PAUSE_MS);
  const summary = await api(`${API_BASE}/manager/surveys/${surveyId}/statistics/summary/get/`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ revisionsIds: [revisionId] }),
  });

  await sleep(PAUSE_MS);
  const users = await api(
    `${API_BASE}/manager/surveys/${surveyId}/statistics/users/?revisionsIds=${revisionId}&q=${encodeURIComponent(
      userEmail,
    )}&limit=100&offset=0`,
    { headers: authHeaders(token) },
  );

  await sleep(PAUSE_MS);
  const groups = await api(
    `${API_BASE}/manager/surveys/${surveyId}/statistics/user-groups/?revisionsIds=${revisionId}`,
    { headers: authHeaders(token) },
  );

  await sleep(PAUSE_MS);
  const departments = await api(
    `${API_BASE}/manager/surveys/${surveyId}/statistics/departments/?revisionsIds=${revisionId}`,
    { headers: authHeaders(token) },
  );

  const userRows = extractItems(users.data);
  const targetRows = userRows.filter((u) => {
    const e = normalize(u?.account?.email || u?.email);
    return e === normalize(userEmail) || Number(u?.id) === Number(userId);
  });

  const groupsItems = extractItems(groups.data);
  const departmentsItems = extractItems(departments.data);

  return {
    summaryStatus: summary.status,
    usersStatus: users.status,
    groupsStatus: groups.status,
    departmentsStatus: departments.status,
    answersCount: Number(summary.data?.totalSummary?.answersCount || 0),
    totalCount: Number(summary.data?.totalSummary?.totalCount || 0),
    usersCount: userRows.length,
    targetUserRowsCount: targetRows.length,
    userGroupNamesVisible: groupsItems.map((g) => g.title || g.name).filter(Boolean).slice(0, 50),
    departmentNamesVisible: departmentsItems.map((d) => d.title || d.name).filter(Boolean).slice(0, 50),
  };
}

function parseXlsxBuffer(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames.includes('Ответы') ? 'Ответы' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = (rows[0] || []).map((x) => String(x ?? '').trim());
  const body = rows.slice(1).filter((r) => r.some((x) => String(x ?? '').trim() !== ''));
  const groupsIdx = headers.findIndex((h) => h === 'Группы');
  const targetRow = body.find((r) => r.some((c) => normalize(c).includes(TARGET_EMAIL)));
  const targetGroupsValue = groupsIdx >= 0 && targetRow ? String(targetRow[groupsIdx] ?? '').trim() : '';
  return {
    rowCount: body.length,
    hasGroupsColumn: groupsIdx >= 0,
    targetRowFound: Boolean(targetRow),
    targetGroupsValue,
    targetGroupsContainsExpected: includesExpectedGroup(targetGroupsValue),
  };
}

function parseCsvBuffer(buf) {
  const text = Buffer.from(buf).toString('utf-8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) {
    return {
      rowCount: 0,
      hasGroupsColumn: false,
      targetRowFound: false,
      targetGroupsValue: '',
      targetGroupsContainsExpected: false,
    };
  }

  const delim = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = (line) => line.split(delim).map((x) => x.trim());
  const headers = split(lines[0]);
  const body = lines.slice(1).map(split).filter((r) => r.some((x) => x !== ''));
  const groupsIdx = headers.findIndex((h) => normalize(h) === normalize('Группы'));
  const targetRow = body.find((r) => r.some((c) => normalize(c).includes(TARGET_EMAIL)));
  const targetGroupsValue = groupsIdx >= 0 && targetRow ? String(targetRow[groupsIdx] ?? '').trim() : '';
  return {
    rowCount: body.length,
    hasGroupsColumn: groupsIdx >= 0,
    targetRowFound: Boolean(targetRow),
    targetGroupsValue,
    targetGroupsContainsExpected: includesExpectedGroup(targetGroupsValue),
  };
}

async function exportReport(token, surveyId, ext, filters, key) {
  const q = new URLSearchParams({
    userDate: userDatePlus8(),
    filters: JSON.stringify(filters),
    resultsWithAI: 'false',
    resultsWithGroups: 'true',
  });

  await sleep(PAUSE_MS);
  const tokenRes = await api(`${API_BASE}/manager/surveys/${surveyId}/export/get-token/?${q.toString()}`, {
    headers: authHeaders(token),
  });
  if (!tokenRes.ok || !tokenRes.data?.token) {
    return { ok: false, stage: 'get-token', tokenStatus: tokenRes.status, textSample: (tokenRes.text || '').slice(0, 300) };
  }

  await sleep(PAUSE_MS);
  const dlRes = await fetch(
    `${API_BASE}/public/surveys/export/${ext}/?lang=ru&token=${encodeURIComponent(tokenRes.data.token)}`,
  );
  if (!dlRes.ok) return { ok: false, stage: 'download', tokenStatus: tokenRes.status, downloadStatus: dlRes.status };

  const buf = Buffer.from(await dlRes.arrayBuffer());
  const filePath = path.join(OUT_DIR, `${key}.${ext}`);
  await fs.writeFile(filePath, buf);

  let parsed = null;
  if (ext === 'xlsx') parsed = parseXlsxBuffer(buf);
  if (ext === 'csv') parsed = parseCsvBuffer(buf);
  if (ext === 'pptx') {
    parsed = {
      fileSizeBytes: buf.length,
    };
  }

  return { ok: true, tokenStatus: tokenRes.status, downloadStatus: dlRes.status, filePath, parsed };
}

async function captureReports(token, surveyId, revisionId, userId, phaseTag) {
  const noFilter = { revisionsIds: [], usersIds: [], userGroupsIds: [], departmentsIds: [] };
  const filtered = { revisionsIds: [revisionId], usersIds: [userId], userGroupsIds: [], departmentsIds: [] };

  const extList = ['xlsx', 'csv', 'pptx'];
  const noFilterReports = {};
  const filteredReports = {};

  for (const ext of extList) {
    noFilterReports[ext] = await exportReport(token, surveyId, ext, noFilter, `${phaseTag}_survey_${surveyId}_nofilter`);
    filteredReports[ext] = await exportReport(token, surveyId, ext, filtered, `${phaseTag}_survey_${surveyId}_filtered`);
  }

  return { noFilter: noFilterReports, filtered: filteredReports };
}

async function applyMembershipUpdate(token, surveyId, revisionId) {
  await sleep(PAUSE_MS);
  return api(`${API_BASE}/manager/surveys/${surveyId}/statistics/membership/update/?revisionId=${revisionId}`, {
    method: 'POST',
    headers: authHeaders(token, true),
  });
}

function compareBeforeAfter(pre, post) {
  const result = {
    web: {
      answersCountStable: pre.answersCount === post.answersCount,
      totalCountStable: pre.totalCount === post.totalCount,
      targetRowsStable: pre.targetUserRowsCount === post.targetUserRowsCount,
    },
    reports: {},
  };

  for (const scope of ['noFilter', 'filtered']) {
    result.reports[scope] = {};
    for (const ext of ['xlsx', 'csv', 'pptx']) {
      const a = pre.scopeReports?.[scope]?.[ext];
      const b = post.scopeReports?.[scope]?.[ext];
      if (!a?.ok || !b?.ok) {
        result.reports[scope][ext] = { comparable: false };
        continue;
      }

      if (ext === 'xlsx' || ext === 'csv') {
        result.reports[scope][ext] = {
          comparable: true,
          hasGroupsColumnStable: a.parsed?.hasGroupsColumn === b.parsed?.hasGroupsColumn,
          targetRowStable: a.parsed?.targetRowFound === b.parsed?.targetRowFound,
          targetGroupsValueBefore: a.parsed?.targetGroupsValue ?? '',
          targetGroupsValueAfter: b.parsed?.targetGroupsValue ?? '',
          targetGroupsContainsExpectedBefore: Boolean(a.parsed?.targetGroupsContainsExpected),
          targetGroupsContainsExpectedAfter: Boolean(b.parsed?.targetGroupsContainsExpected),
        };
      } else {
        result.reports[scope][ext] = {
          comparable: true,
          fileSizeBytesBefore: a.parsed?.fileSizeBytes ?? null,
          fileSizeBytesAfter: b.parsed?.fileSizeBytes ?? null,
          fileSizeStable:
            (a.parsed?.fileSizeBytes ?? null) === (b.parsed?.fileSizeBytes ?? null),
        };
      }
    }
  }

  return result;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const auth = await signIn(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!auth.ok || !auth.data?.accessToken) throw new Error(`Admin auth failed: ${auth.status}`);
  const token = auth.data.accessToken;

  const user = await getUserByEmail(token, TARGET_EMAIL);
  if (!user?.id) throw new Error(`Target user not found: ${TARGET_EMAIL}`);

  const expectedGroup = await getGroupByTitle(token, EXPECTED_GROUP);
  if (!expectedGroup?.id) throw new Error(`Expected group not found by title: ${EXPECTED_GROUP}`);

  const t0Ensure = await ensureUserOnlyInExpectedGroup(token, user.id, TARGET_EMAIL, expectedGroup.id);
  const t0Groups = t0Ensure.finalState;
  const t0InExpected = t0Groups.some((g) => Number(g.id) === Number(expectedGroup.id));
  if (!t0InExpected) throw new Error(`T0 failed: target user is not in expected group ${EXPECTED_GROUP}`);

  const surveys = [];
  for (const surveyId of SURVEY_IDS) {
    const revisions = await getSurveyRevisions(token, surveyId);
    const revision = pickActiveOrLatestRevision(revisions);

    const item = {
      surveyId,
      revision: revision
        ? {
            id: revision.id,
            alias: revision.alias,
            status: revision.status ?? null,
            dateStart: revision.dateStart ?? null,
            dateEnd: revision.dateEnd ?? null,
          }
        : null,
      beforeApply: null,
      apply: null,
      afterApply: null,
      analysis: null,
    };

    if (!revision?.id) {
      item.analysis = { error: 'no_revision_found' };
      surveys.push(item);
      continue;
    }

    const webBefore = await getWebSnapshot(token, surveyId, revision.id, user.id, TARGET_EMAIL);
    const reportsBefore = await captureReports(token, surveyId, revision.id, user.id, 'before_apply');

    const applyRes = await applyMembershipUpdate(token, surveyId, revision.id);

    const webAfter = await getWebSnapshot(token, surveyId, revision.id, user.id, TARGET_EMAIL);
    const reportsAfter = await captureReports(token, surveyId, revision.id, user.id, 'after_apply');

    const beforeObj = { ...webBefore, scopeReports: reportsBefore };
    const afterObj = { ...webAfter, scopeReports: reportsAfter };

    item.beforeApply = {
      web: webBefore,
      reports: reportsBefore,
    };
    item.apply = {
      status: applyRes.status,
      ok: applyRes.ok,
      textSample: (applyRes.text || '').slice(0, 300),
    };
    item.afterApply = {
      web: webAfter,
      reports: reportsAfter,
    };
    item.analysis = compareBeforeAfter(beforeObj, afterObj);
    surveys.push(item);
  }

  const t3Groups = await getUserGroupsByEmail(token, TARGET_EMAIL);
  const out = {
    scenario: 'VG0',
    feature: 'statisticsSettings',
    targetEmail: TARGET_EMAIL,
    expectedGroup: EXPECTED_GROUP,
    t0: {
      userId: user.id,
      ensuredGroups: t0Groups,
      ensureActions: t0Ensure.fixes,
      hasExpectedGroup: t0InExpected,
    },
    t3: {
      finalGroups: t3Groups,
    },
    surveys,
    generatedAt: new Date().toISOString(),
  };

  const outFile = path.join(OUT_DIR, 'vg0_statistics_settings_result.json');
  await fs.writeFile(outFile, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ outFile, surveys: surveys.length }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
