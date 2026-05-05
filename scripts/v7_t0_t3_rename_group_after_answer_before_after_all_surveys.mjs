import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TARGET_EMAIL = process.env.TARGET_EMAIL || 'qaseed+8@example.org';
const FROM_GROUP = process.env.FROM_GROUP || '5';
const RENAMED_GROUP = process.env.RENAMED_GROUP || 'Commercial';
const PAUSE_MS = Number(process.env.PAUSE_MS || 1800);
const OUT_DIR = process.env.OUT_DIR || '/tmp/v7_t0_t3_all_surveys';
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

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function flattenQuestions(surveyDetails) {
  const pages = surveyDetails?.pages || [];
  return pages.flatMap((p) => p.questions || p.updatedQuestions || []);
}

function uniqueText(email) {
  const variants = [
    'Работа в целом комфортная.',
    'Хочу более чёткие приоритеты.',
    'Нужна регулярная обратная связь.',
    'Команда работает слаженно.',
  ];
  return `${pickRandom(variants)} (${email})`;
}

function generateAnswers(questions, email) {
  const answers = {};
  for (const q of questions) {
    const qid = q.id;
    const type = q.type;

    if (type === 'scale') {
      const min = q.rangeMin ?? 1;
      const max = q.rangeMax ?? 10;
      answers[qid] = {
        action: 'answer',
        values: [{ value: randInt(min, max), isCustom: false, commentAnswer: null, cantAnswer: false }],
      };
      continue;
    }

    if (type === 'nps') {
      answers[qid] = {
        action: 'answer',
        values: [{ value: randInt(0, 10), isCustom: false, commentAnswer: null, cantAnswer: false }],
      };
      continue;
    }

    if (type === 'singleSelect') {
      const opts = q.answerOptions || q.updatedAnswerOptions || [];
      if (opts.length) {
        answers[qid] = {
          action: 'answer',
          values: [{ value: pickRandom(opts).text, isCustom: false, commentAnswer: null, cantAnswer: false }],
        };
      }
      continue;
    }

    if (type === 'multiSelect') {
      const opts = q.answerOptions || q.updatedAnswerOptions || [];
      if (opts.length) {
        const shuffled = opts.slice().sort(() => Math.random() - 0.5);
        const count = randInt(1, Math.min(3, opts.length));
        answers[qid] = {
          action: 'answer',
          values: shuffled.slice(0, count).map((x) => ({
            value: x.text,
            isCustom: false,
            commentAnswer: null,
            cantAnswer: false,
          })),
        };
      }
      continue;
    }

    if (type === 'shortText' || type === 'longText') {
      answers[qid] = {
        action: 'answer',
        values: [{ value: uniqueText(email), isCustom: true, commentAnswer: null, cantAnswer: false }],
      };
    }
  }
  return answers;
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
  return { hasGroupsColumn: groupsColIdx >= 0, groupValues };
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

async function updateGroupTitle(token, groupId, title) {
  await sleep(PAUSE_MS);
  return api(`${API_BASE}/manager/user-groups/${groupId}/`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ title }),
  });
}

async function updateGroupTitleWithRetry(token, groupId, title, retries = 3) {
  let last = null;
  for (let i = 0; i < retries; i++) {
    const res = await updateGroupTitle(token, groupId, title);
    last = res;
    if (res.ok) return res;
    if (res.status >= 500) {
      await sleep(PAUSE_MS);
      continue;
    }
    break;
  }
  return last;
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
  const userAuth = await signIn(TARGET_EMAIL, 'admin');
  if (!userAuth.ok || !userAuth.data?.accessToken) {
    throw new Error(`Target user auth failed: ${userAuth.status} ${userAuth.text}`);
  }
  const userToken = userAuth.data.accessToken;

  const user = await getUserByEmail(token, TARGET_EMAIL);
  if (!user?.id) throw new Error(`Target user not found: ${TARGET_EMAIL}`);

  let fromGroup = await getGroupByTitle(token, FROM_GROUP);
  let renamedGroup = await getGroupByTitle(token, RENAMED_GROUP);
  const t0Fixes = [];

  // Bootstrap precondition: group title should be FROM_GROUP
  if (!fromGroup && renamedGroup) {
    const rb = await updateGroupTitleWithRetry(token, renamedGroup.id, FROM_GROUP, 5);
    if (!rb.ok) throw new Error(`Cannot rename ${RENAMED_GROUP} back to ${FROM_GROUP}: ${rb.status}`);
    t0Fixes.push(`renamed_${RENAMED_GROUP}_to_${FROM_GROUP}`);
    fromGroup = await getGroupByTitle(token, FROM_GROUP);
    renamedGroup = await getGroupByTitle(token, RENAMED_GROUP);
  }
  if (!fromGroup?.id) throw new Error(`Cannot resolve source group ${FROM_GROUP}`);

  // T0: ensure +8 is ONLY in group 5
  const allGroups = await getAllGroups(token);
  for (const g of allGroups) {
    const inGroup = await isUserInGroup(token, user.id, g.id, TARGET_EMAIL);
    if (!inGroup) continue;
    if (Number(g.id) === Number(fromGroup.id)) continue;
    const rem = await removeUserFromGroup(token, user.id, g.id);
    if (!rem.ok) throw new Error(`T0 cannot remove from group ${g.title}: ${rem.status}`);
    t0Fixes.push(`removed_from_${g.title}`);
  }
  const add = await addUserToGroup(token, user.id, fromGroup.id);
  if (!add.ok) throw new Error(`T0 cannot add user to group ${FROM_GROUP}: ${add.status}`);
  t0Fixes.push(`added_user_to_${FROM_GROUP}`);

  const inFrom = await isUserInGroup(token, user.id, fromGroup.id, TARGET_EMAIL);
  let hasAnyOther = false;
  for (const g of allGroups) {
    if (Number(g.id) === Number(fromGroup.id)) continue;
    const inOther = await isUserInGroup(token, user.id, g.id, TARGET_EMAIL);
    if (inOther) {
      hasAnyOther = true;
      break;
    }
  }
  if (!inFrom || hasAnyOther) {
    throw new Error(`T0 hard-fail: ${TARGET_EMAIL} is not exclusively in group ${FROM_GROUP}`);
  }

  const surveys = [];

  // T1: ensure answer + answer check
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

    // Try to submit answer as target user in current revision (for non-link/internal surveys).
    await sleep(PAUSE_MS);
    const surveyDetailsRes = await api(`${API_BASE}/manager/surveys/${surveyId}/`, { headers: authHeaders(token) });
    const questions = flattenQuestions(surveyDetailsRes.data);
    const answers = generateAnswers(questions, TARGET_EMAIL);
    let answerAttempt = 'not_attempted';

    await sleep(PAUSE_MS);
    const startRes = await api(
      `${API_BASE}/private/surveys/${surveyId}/${revision.alias}/answer/page/start/`,
      { method: 'POST', headers: authHeaders(userToken) },
    );

    if (startRes.ok) {
      await sleep(PAUSE_MS);
      const answerRes = await api(
        `${API_BASE}/private/surveys/${surveyId}/${revision.alias}/answer/`,
        {
          method: 'POST',
          headers: authHeaders(userToken, true),
          body: JSON.stringify(answers),
        },
      );
      if (answerRes.ok || answerRes.status === 201) {
        answerAttempt = 'answered';
      } else if (/answered|completed|already/i.test(answerRes.text || '')) {
        answerAttempt = 'already_answered';
      } else {
        answerAttempt = `answer_failed_${answerRes.status}`;
      }
    } else if (/answered|completed|already/i.test(startRes.text || '')) {
      answerAttempt = 'already_answered';
    } else {
      answerAttempt = `start_failed_${startRes.status}`;
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
      answerAttempt,
    };
    surveys.push(row);
  }

  // T2: rename group 5 -> Commercial
  const renameRes = await updateGroupTitleWithRetry(token, fromGroup.id, RENAMED_GROUP, 5);
  if (!renameRes.ok) throw new Error(`T2 cannot rename group ${FROM_GROUP} to ${RENAMED_GROUP}: ${renameRes.status}`);
  renamedGroup = await getGroupByTitle(token, RENAMED_GROUP);
  if (!renamedGroup?.id || Number(renamedGroup.id) !== Number(fromGroup.id)) {
    throw new Error(`T2 hard-fail: renamed group ${RENAMED_GROUP} not found as original id`);
  }
  const inRenamed = await isUserInGroup(token, user.id, renamedGroup.id, TARGET_EMAIL);
  if (!inRenamed) throw new Error(`T2 hard-fail: ${TARGET_EMAIL} not in renamed group ${RENAMED_GROUP}`);

  // T3: exports before/after feature in renamed state
  for (const row of surveys) {
    if (!row.revision?.id) continue;
    const surveyId = row.surveyId;
    const revisionId = row.revision.id;
    const userFilters = { revisionsIds: [revisionId], usersIds: [user.id], userGroupsIds: [], departmentsIds: [] };
    const cycleFilters = { revisionsIds: [revisionId], usersIds: [], userGroupsIds: [], departmentsIds: [] };

    const userBefore = await exportXlsx({
      token, surveyId, filters: userFilters, key: `survey_${surveyId}_rev_${revisionId}_v7_user_before`, resultsWithGroups: false,
    });
    const userAfter = await exportXlsx({
      token, surveyId, filters: userFilters, key: `survey_${surveyId}_rev_${revisionId}_v7_user_after`, resultsWithGroups: true,
    });
    const cycleBefore = await exportXlsx({
      token, surveyId, filters: cycleFilters, key: `survey_${surveyId}_rev_${revisionId}_v7_cycle_before`, resultsWithGroups: false,
    });
    const cycleAfter = await exportXlsx({
      token, surveyId, filters: cycleFilters, key: `survey_${surveyId}_rev_${revisionId}_v7_cycle_after`, resultsWithGroups: true,
    });

    const vals = userAfter.ok ? userAfter.parsed.groupValues : [];
    row.exports = { userBefore, userAfter, cycleBefore, cycleAfter };
    row.checks = {
      userExport_before_hasGroupsColumn: userBefore.ok ? userBefore.parsed.hasGroupsColumn : null,
      userExport_after_hasGroupsColumn: userAfter.ok ? userAfter.parsed.hasGroupsColumn : null,
      userExport_after_hasFromGroupTitle: userAfter.ok ? vals.some((v) => hasTokenLike(v, FROM_GROUP)) : null,
      userExport_after_hasRenamedGroupTitle: userAfter.ok ? vals.some((v) => hasTokenLike(v, RENAMED_GROUP)) : null,
      cycleExport_before_hasGroupsColumn: cycleBefore.ok ? cycleBefore.parsed.hasGroupsColumn : null,
      cycleExport_after_hasGroupsColumn: cycleAfter.ok ? cycleAfter.parsed.hasGroupsColumn : null,
      modelInference: userAfter.ok
        ? (vals.some((v) => hasTokenLike(v, RENAMED_GROUP))
            ? 'actual_t3_name'
            : vals.some((v) => hasTokenLike(v, FROM_GROUP))
            ? 'historical_t1_name'
            : 'no_user_row')
        : 'no_export',
    };
  }

  const report = {
    scenario: 'V7',
    targetEmail: TARGET_EMAIL,
    fromGroup: FROM_GROUP,
    renamedGroup: RENAMED_GROUP,
    t0: { userId: user.id, inFromGroup: inFrom, fixesApplied: t0Fixes },
    t2: { renamedGroupId: renamedGroup.id, userInRenamedGroup: inRenamed },
    surveys,
  };

  const outFile = path.join(OUT_DIR, 'v7_t0_t3_result.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, surveys: surveys.length }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
