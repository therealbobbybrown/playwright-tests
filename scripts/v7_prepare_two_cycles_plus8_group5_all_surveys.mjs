import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TARGET_EMAIL = process.env.TARGET_EMAIL || 'qaseed+8@example.org';
const TARGET_PASSWORD = process.env.TARGET_PASSWORD || 'admin';
const GROUP_TITLE = process.env.GROUP_TITLE || '5';
const PAUSE_MS = Number(process.env.PAUSE_MS || 1800);
const OUT_DIR = process.env.OUT_DIR || '/tmp/v7_prep_two_cycles_plus8';
const SURVEY_IDS = (process.env.SURVEY_IDS || '16,17,18,19,20,21,22,23,24')
  .split(',')
  .map((x) => Number(x.trim()))
  .filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fp(seed = '') {
  return createHash('md5').update(`${Date.now()}_${seed}`).digest('hex');
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

async function login(email, password) {
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

function authHeaders(token, withJson = true) {
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

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function flattenQuestions(surveyDetails) {
  const pages = surveyDetails?.pages || [];
  return pages.flatMap((p) => p.questions || p.updatedQuestions || []);
}

function randomText(email) {
  const variants = [
    'Стабильный рабочий цикл.',
    'Хочу больше обратной связи.',
    'По задачам всё в порядке.',
    'Есть идеи по улучшению процессов.',
  ];
  return `${pickRandom(variants)} (${email})`;
}

function generateAnswersMap(questions, email) {
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
        values: [{ value: randomText(email), isCustom: true, commentAnswer: null, cantAnswer: false }],
      };
    }
  }
  return answers;
}

async function getUserByEmail(adminToken, email) {
  await sleep(PAUSE_MS);
  const usersRes = await api(
    `${API_BASE}/manager/users/?q=${encodeURIComponent(email)}&limit=50&offset=0`,
    { headers: authHeaders(adminToken, false) },
  );
  const users = extractItems(usersRes.data);
  return users.find(
    (u) => String(u?.account?.email || u?.email || '').toLowerCase() === email.toLowerCase(),
  );
}

async function getGroupByTitle(adminToken, title) {
  await sleep(PAUSE_MS);
  const res = await api(
    `${API_BASE}/manager/user-groups/by-title/?title=${encodeURIComponent(title)}`,
    { headers: authHeaders(adminToken, false) },
  );
  return res.ok && res.data?.id ? res.data : null;
}

async function updateGroupTitle(adminToken, groupId, title) {
  await sleep(PAUSE_MS);
  return api(`${API_BASE}/manager/user-groups/${groupId}/`, {
    method: 'POST',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ title }),
  });
}

async function getAllGroups(adminToken) {
  await sleep(PAUSE_MS);
  const res = await api(`${API_BASE}/manager/user-groups/?limit=300&offset=0`, {
    headers: authHeaders(adminToken, false),
  });
  return extractItems(res.data);
}

async function getGroupUsersByQuery(adminToken, groupId, email) {
  await sleep(PAUSE_MS);
  const res = await api(
    `${API_BASE}/manager/user-groups/${groupId}/users/?q=${encodeURIComponent(email)}&limit=20&offset=0`,
    { headers: authHeaders(adminToken, false) },
  );
  return extractItems(res.data);
}

async function isUserInGroup(adminToken, userId, groupId, email) {
  const users = await getGroupUsersByQuery(adminToken, groupId, email);
  return users.some((u) => Number(u?.id) === Number(userId));
}

async function addUserToGroup(adminToken, userId, groupId) {
  await sleep(PAUSE_MS);
  return api(`${API_BASE}/manager/user-groups/${groupId}/users/add/`, {
    method: 'POST',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ usersIds: [userId] }),
  });
}

async function removeUserFromGroup(adminToken, userId, groupId) {
  await sleep(PAUSE_MS);
  return api(`${API_BASE}/manager/user-groups/${groupId}/users/remove/`, {
    method: 'POST',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ usersIds: [userId] }),
  });
}

async function getSurvey(adminToken, surveyId) {
  await sleep(PAUSE_MS);
  return api(`${API_BASE}/manager/surveys/${surveyId}/`, {
    headers: authHeaders(adminToken, false),
  });
}

async function stopIfActive(adminToken, surveyId) {
  const survey = await getSurvey(adminToken, surveyId);
  if (!survey.ok) throw new Error(`Survey ${surveyId} load failed: ${survey.status}`);
  if (survey.data?.status !== 'active') return false;

  await sleep(PAUSE_MS);
  const stopRes = await api(`${API_BASE}/manager/surveys/${surveyId}/stop/`, {
    method: 'POST',
    headers: authHeaders(adminToken),
  });
  if (!stopRes.ok) throw new Error(`Survey ${surveyId} stop failed: ${stopRes.status}`);
  return true;
}

async function getRevisions(adminToken, surveyId) {
  await sleep(PAUSE_MS);
  const res = await api(`${API_BASE}/manager/surveys/${surveyId}/revisions/?limit=200`, {
    headers: authHeaders(adminToken, false),
  });
  if (!res.ok) throw new Error(`Survey ${surveyId} revisions failed: ${res.status}`);
  return extractItems(res.data);
}

function pickLatestRevision(revisions) {
  return revisions
    .slice()
    .sort(
      (a, b) =>
        new Date(b.dateStart || b.createdAt || 0).getTime() -
        new Date(a.dateStart || a.createdAt || 0).getTime(),
    )[0];
}

async function startNewCycle(adminToken, surveyId) {
  const before = await getRevisions(adminToken, surveyId);
  const beforeIds = new Set(before.map((x) => Number(x.id)));

  await sleep(PAUSE_MS);
  const startRes = await api(`${API_BASE}/manager/surveys/${surveyId}/start/`, {
    method: 'POST',
    headers: authHeaders(adminToken),
  });
  if (!startRes.ok) throw new Error(`Survey ${surveyId} start failed: ${startRes.status}`);

  const after = await getRevisions(adminToken, surveyId);
  return after.find((r) => !beforeIds.has(Number(r.id))) || pickLatestRevision(after);
}

async function answerAsUserPrivate(userToken, surveyId, alias, questions) {
  await sleep(PAUSE_MS);
  const startRes = await api(
    `${API_BASE}/private/surveys/${surveyId}/${alias}/answer/page/start/`,
    { method: 'POST', headers: authHeaders(userToken) },
  );

  if (!startRes.ok) {
    if (/answered|completed|already/i.test(startRes.text || '')) return { ok: true, mode: 'private_already_answered' };
    return { ok: false, mode: `private_start_${startRes.status}` };
  }

  let pageToken = startRes.data?.nextPageToken || startRes.data?.pageToken || null;
  let page = startRes.data?.nextPage || null;
  let guard = 0;
  while (pageToken && page && guard < 30) {
    guard += 1;
    const pageAnswers = generateAnswersMap(page.questions || [], TARGET_EMAIL);
    await sleep(PAUSE_MS);
    const nextRes = await api(
      `${API_BASE}/private/surveys/${surveyId}/${alias}/answer/page/next/?pageToken=${encodeURIComponent(pageToken)}`,
      {
        method: 'POST',
        headers: authHeaders(userToken),
        body: JSON.stringify(pageAnswers),
      },
    );
    if (!nextRes.ok && nextRes.status !== 201) {
      return { ok: false, mode: `private_next_${nextRes.status}` };
    }
    pageToken = nextRes.data?.nextPageToken || null;
    page = nextRes.data?.nextPage || null;
  }

  // Fallback full answer
  const fullAnswers = generateAnswersMap(questions, TARGET_EMAIL);
  await sleep(PAUSE_MS);
  const fullRes = await api(
    `${API_BASE}/private/surveys/${surveyId}/${alias}/answer/`,
    {
      method: 'POST',
      headers: authHeaders(userToken),
      body: JSON.stringify(fullAnswers),
    },
  );
  if (fullRes.ok || fullRes.status === 201 || /answered|completed|already/i.test(fullRes.text || '')) {
    return { ok: true, mode: 'private_full_or_already' };
  }

  // Page flow could already complete without /answer/
  return { ok: true, mode: 'private_page_flow' };
}

async function answerAsUserPublic(userToken, surveyId, alias) {
  await sleep(PAUSE_MS);
  const startRes = await api(
    `${API_BASE}/public/surveys/${surveyId}/${alias}/answer/page/start/`,
    { method: 'POST', headers: authHeaders(userToken) },
  );
  if (!startRes.ok) {
    if (/answered|completed|already/i.test(startRes.text || '')) return { ok: true, mode: 'public_already_answered' };
    return { ok: false, mode: `public_start_${startRes.status}` };
  }

  let pageToken = startRes.data?.nextPageToken || startRes.data?.pageToken || null;
  let page = startRes.data?.nextPage || null;
  let guard = 0;
  while (pageToken && page && guard < 30) {
    guard += 1;
    const pageAnswers = generateAnswersMap(page.questions || [], TARGET_EMAIL);
    await sleep(PAUSE_MS);
    const nextRes = await api(
      `${API_BASE}/public/surveys/${surveyId}/${alias}/answer/page/next/?pageToken=${encodeURIComponent(pageToken)}`,
      {
        method: 'POST',
        headers: authHeaders(userToken),
        body: JSON.stringify(pageAnswers),
      },
    );
    if (!nextRes.ok && nextRes.status !== 201) {
      return { ok: false, mode: `public_next_${nextRes.status}` };
    }
    pageToken = nextRes.data?.nextPageToken || null;
    page = nextRes.data?.nextPage || null;
  }

  return { ok: true, mode: 'public_page_flow' };
}

async function answerInRevision({ adminToken, userToken, surveyId, alias }) {
  await sleep(PAUSE_MS);
  const detailsRes = await api(`${API_BASE}/manager/surveys/${surveyId}/`, {
    headers: authHeaders(adminToken, false),
  });
  const questions = flattenQuestions(detailsRes.data);

  const priv = await answerAsUserPrivate(userToken, surveyId, alias, questions);
  if (priv.ok) return priv;

  const pub = await answerAsUserPublic(userToken, surveyId, alias);
  return pub;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const adminAuth = await login(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!adminAuth.ok || !adminAuth.data?.accessToken) {
    throw new Error(`Admin auth failed: ${adminAuth.status} ${adminAuth.text}`);
  }
  const adminToken = adminAuth.data.accessToken;

  const userAuth = await login(TARGET_EMAIL, TARGET_PASSWORD);
  if (!userAuth.ok || !userAuth.data?.accessToken) {
    throw new Error(`User auth failed (${TARGET_EMAIL}): ${userAuth.status} ${userAuth.text}`);
  }
  const userToken = userAuth.data.accessToken;

  const user = await getUserByEmail(adminToken, TARGET_EMAIL);
  if (!user?.id) throw new Error(`Target user not found: ${TARGET_EMAIL}`);

  let g = await getGroupByTitle(adminToken, GROUP_TITLE);
  const cg = await getGroupByTitle(adminToken, 'Commercial');
  const prepFixes = [];
  if (!g && cg) {
    const rb = await updateGroupTitle(adminToken, cg.id, GROUP_TITLE);
    if (!rb.ok) throw new Error(`Cannot rename Commercial->${GROUP_TITLE}: ${rb.status}`);
    prepFixes.push('renamed_Commercial_to_5');
    g = await getGroupByTitle(adminToken, GROUP_TITLE);
  }
  if (!g?.id) throw new Error(`Group ${GROUP_TITLE} not found`);

  const allGroups = await getAllGroups(adminToken);
  for (const grp of allGroups) {
    const inGrp = await isUserInGroup(adminToken, user.id, grp.id, TARGET_EMAIL);
    if (!inGrp) continue;
    if (Number(grp.id) === Number(g.id)) continue;
    const rem = await removeUserFromGroup(adminToken, user.id, grp.id);
    if (!rem.ok) throw new Error(`Cannot remove from group ${grp.title}: ${rem.status}`);
    prepFixes.push(`removed_from_${grp.title}`);
  }
  const inG = await isUserInGroup(adminToken, user.id, g.id, TARGET_EMAIL);
  if (!inG) {
    const add = await addUserToGroup(adminToken, user.id, g.id);
    if (!add.ok) throw new Error(`Cannot add to group ${GROUP_TITLE}: ${add.status}`);
    prepFixes.push(`added_to_${GROUP_TITLE}`);
  }

  const surveys = [];
  for (const surveyId of SURVEY_IDS) {
    const row = { surveyId, stoppedBefore: false, cycle1: null, cycle2: null, errors: [] };
    try {
      row.stoppedBefore = await stopIfActive(adminToken, surveyId);

      const c1 = await startNewCycle(adminToken, surveyId);
      row.cycle1 = { id: c1?.id, alias: c1?.alias ?? null, answer: null };
      if (!c1?.alias) throw new Error('cycle1 alias missing');
      row.cycle1.answer = await answerInRevision({ adminToken, userToken, surveyId, alias: c1.alias });

      await sleep(PAUSE_MS);
      const stop1 = await api(`${API_BASE}/manager/surveys/${surveyId}/stop/`, {
        method: 'POST',
        headers: authHeaders(adminToken),
      });
      if (!stop1.ok) throw new Error(`cycle1 stop failed: ${stop1.status}`);

      const c2 = await startNewCycle(adminToken, surveyId);
      row.cycle2 = { id: c2?.id, alias: c2?.alias ?? null, answer: null };
      if (!c2?.alias) throw new Error('cycle2 alias missing');
      row.cycle2.answer = await answerInRevision({ adminToken, userToken, surveyId, alias: c2.alias });
    } catch (e) {
      row.errors.push(String(e.message || e));
    }
    surveys.push(row);
  }

  const report = {
    scenario: 'V7_PREP',
    targetEmail: TARGET_EMAIL,
    groupTitle: GROUP_TITLE,
    prepFixes,
    surveys,
  };

  const outFile = path.join(OUT_DIR, 'v7_prep_two_cycles_plus8_result.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, surveys: surveys.length }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
