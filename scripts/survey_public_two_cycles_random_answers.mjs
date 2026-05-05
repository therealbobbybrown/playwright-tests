import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SURVEY_ID = Number(process.env.SURVEY_ID || 20);
const PAUSE_MS = Number(process.env.PAUSE_MS || 1800);
const OUT_DIR = process.env.OUT_DIR || '/tmp/survey_public_two_cycles';

const TARGET_USERS = [
  'qaseed+8@example.org',
  'qaseed+9@example.org',
  'qaseed+10@example.org',
  'qaseed+11@example.org',
  'qaseed+12@example.org',
  'qaseed+13@example.org',
  'qaseed+14@example.org',
];

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

function pickLatestRevision(revisions) {
  if (!revisions.length) return null;
  return revisions
    .slice()
    .sort(
      (a, b) =>
        new Date(b.dateStart || b.createdAt || 0).getTime() -
        new Date(a.dateStart || a.createdAt || 0).getTime(),
    )[0];
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomText(email) {
  const variants = [
    'Хочу больше прозрачности по приоритетам.',
    'Рабочие процессы в целом понятны.',
    'Есть идеи по улучшению взаимодействия.',
    'Коммуникация в команде стала лучше.',
    'Нужно немного сократить ручные шаги.',
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
      const max = q.rangeMax ?? 5;
      answers[qid] = {
        action: 'answer',
        values: [
          {
            value: randInt(min, max),
            isCustom: false,
            commentAnswer: null,
            cantAnswer: false,
          },
        ],
      };
      continue;
    }

    if (type === 'nps') {
      answers[qid] = {
        action: 'answer',
        values: [
          {
            value: randInt(0, 10),
            isCustom: false,
            commentAnswer: null,
            cantAnswer: false,
          },
        ],
      };
      continue;
    }

    if (type === 'singleSelect') {
      const opts = q.answerOptions || q.updatedAnswerOptions || [];
      if (opts.length) {
        answers[qid] = {
          action: 'answer',
          values: [
            {
              value: pickRandom(opts).text,
              isCustom: false,
              commentAnswer: null,
              cantAnswer: false,
            },
          ],
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
        values: [
          {
            value: randomText(email),
            isCustom: true,
            commentAnswer: null,
            cantAnswer: false,
          },
        ],
      };
      continue;
    }
  }
  return answers;
}

async function getSurvey(token) {
  await sleep(PAUSE_MS);
  return api(`${API_BASE}/manager/surveys/${SURVEY_ID}/`, {
    headers: authHeaders(token, false),
  });
}

async function stopIfActive(token) {
  const survey = await getSurvey(token);
  if (!survey.ok) {
    throw new Error(`Survey ${SURVEY_ID} load failed: ${survey.status}`);
  }
  if (survey.data?.status !== 'active') return false;

  await sleep(PAUSE_MS);
  const stopRes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/stop/`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!stopRes.ok) {
    throw new Error(`Survey ${SURVEY_ID} stop failed: ${stopRes.status}`);
  }
  return true;
}

async function startNewCycle(token) {
  await sleep(PAUSE_MS);
  const beforeRes = await api(
    `${API_BASE}/manager/surveys/${SURVEY_ID}/revisions/?limit=100`,
    { headers: authHeaders(token, false) },
  );
  if (!beforeRes.ok) throw new Error(`Revisions before failed: ${beforeRes.status}`);
  const before = extractItems(beforeRes.data);
  const beforeIds = new Set(before.map((x) => Number(x.id)));

  await sleep(PAUSE_MS);
  const startRes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/start/`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!startRes.ok) {
    throw new Error(`Survey ${SURVEY_ID} start failed: ${startRes.status}`);
  }

  await sleep(PAUSE_MS);
  const afterRes = await api(
    `${API_BASE}/manager/surveys/${SURVEY_ID}/revisions/?limit=100`,
    { headers: authHeaders(token, false) },
  );
  if (!afterRes.ok) throw new Error(`Revisions after failed: ${afterRes.status}`);
  const after = extractItems(afterRes.data);
  return (
    after.find((r) => !beforeIds.has(Number(r.id))) || pickLatestRevision(after)
  );
}

async function fillPublicCycle(alias) {
  const results = [];

  for (const email of TARGET_USERS) {
    const item = { email, login: false, started: false, answered: false, note: null };

    await sleep(PAUSE_MS);
    const userAuth = await login(email, 'admin');
    if (!userAuth.data?.accessToken) {
      item.note = `login_failed_${userAuth.status}`;
      results.push(item);
      continue;
    }
    item.login = true;
    const userToken = userAuth.data.accessToken;

    await sleep(PAUSE_MS);
    const startRes = await api(
      `${API_BASE}/public/surveys/${SURVEY_ID}/${alias}/answer/page/start/`,
      { method: 'POST', headers: authHeaders(userToken) },
    );
    if (!startRes.ok) {
      item.note = `start_failed_${startRes.status}`;
      results.push(item);
      continue;
    }
    item.started = true;

    let nextPageToken = startRes.data?.nextPageToken || startRes.data?.pageToken;
    let nextPage = startRes.data?.nextPage;
    let guard = 0;
    let failed = false;

    while (nextPageToken && nextPage && guard < 30) {
      guard += 1;
      const q = nextPage.questions || [];
      const answers = generateAnswersMap(q, email);

      await sleep(PAUSE_MS);
      const nextRes = await api(
        `${API_BASE}/public/surveys/${SURVEY_ID}/${alias}/answer/page/next/?pageToken=${encodeURIComponent(
          nextPageToken,
        )}`,
        {
          method: 'POST',
          headers: authHeaders(userToken),
          body: JSON.stringify(answers),
        },
      );

      if (!nextRes.ok && nextRes.status !== 201) {
        failed = true;
        item.note = `next_failed_${nextRes.status}`;
        item.errorSample = (nextRes.text || '').slice(0, 300);
        break;
      }

      nextPageToken = nextRes.data?.nextPageToken || null;
      nextPage = nextRes.data?.nextPage || null;
    }

    if (!failed) {
      item.answered = true;
      item.note = 'answered';
    }

    results.push(item);
  }

  return results;
}

async function summaryByAlias(alias, token) {
  await sleep(PAUSE_MS);
  const statRevRes = await api(
    `${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/revisions/`,
    { headers: authHeaders(token, false) },
  );
  const statRevs = extractItems(statRevRes.data);
  const rev = statRevs.find((x) => x.alias === alias) || pickLatestRevision(statRevs);
  if (!rev?.id) return { revisionId: null, answersCount: null, totalCount: null };

  await sleep(PAUSE_MS);
  const sumRes = await api(
    `${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/summary/get/`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ revisionsIds: [rev.id] }),
    },
  );
  const ts = sumRes.data?.totalSummary || {};
  return {
    revisionId: rev.id,
    alias: rev.alias,
    answersCount: Number(ts.answersCount || 0),
    totalCount: Number(ts.totalCount || 0),
  };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const admin = await login(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!admin.data?.accessToken) {
    throw new Error(`Admin auth failed: ${admin.status} ${admin.text}`);
  }
  const adminToken = admin.data.accessToken;

  const stoppedInitially = await stopIfActive(adminToken);

  const cycle1 = await startNewCycle(adminToken);
  const cycle1Answers = await fillPublicCycle(cycle1.alias);
  const cycle1Summary = await summaryByAlias(cycle1.alias, adminToken);
  await sleep(PAUSE_MS);
  const cycle1StopRes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/stop/`, {
    method: 'POST',
    headers: authHeaders(adminToken),
  });

  const cycle2 = await startNewCycle(adminToken);
  const cycle2Answers = await fillPublicCycle(cycle2.alias);
  const cycle2Summary = await summaryByAlias(cycle2.alias, adminToken);

  const report = {
    surveyId: SURVEY_ID,
    stoppedInitially,
    cycle1: {
      id: cycle1?.id,
      alias: cycle1?.alias,
      dateStart: cycle1?.dateStart,
      stopped: cycle1StopRes.ok,
      stopStatus: cycle1StopRes.status,
      answers: cycle1Answers,
      summary: cycle1Summary,
    },
    cycle2: {
      id: cycle2?.id,
      alias: cycle2?.alias,
      dateStart: cycle2?.dateStart,
      answers: cycle2Answers,
      summary: cycle2Summary,
    },
  };

  const outFile = path.join(OUT_DIR, 'survey_public_two_cycles_result.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, report }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
