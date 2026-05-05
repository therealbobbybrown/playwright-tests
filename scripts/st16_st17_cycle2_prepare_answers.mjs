import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const PAUSE_MS = Number(process.env.PAUSE_MS || 1500);
const OUT_DIR = process.env.OUT_DIR || '/tmp/st16_st17_cycle2';

const SURVEY_16_ID = Number(process.env.SURVEY_16_ID || 16);
const SURVEY_17_ID = Number(process.env.SURVEY_17_ID || 17);

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
    'Есть зоны для улучшения, но динамика положительная.',
    'Командная поддержка помогает достигать целей.',
    'Нужна лучшая приоритизация задач.',
    'В целом всё стабильно и понятно.',
    'Хотелось бы чаще получать конструктивную обратную связь.',
  ];
  return `${pickRandom(variants)} (${email})`;
}

function flattenQuestions(surveyDetails) {
  const pages = surveyDetails?.pages || [];
  return pages.flatMap((p) => p.questions || p.updatedQuestions || []);
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

async function stopStartAndGetNewRevision(surveyId, token) {
  await sleep(PAUSE_MS);
  const beforeRevsRes = await api(
    `${API_BASE}/manager/surveys/${surveyId}/revisions/?limit=100`,
    { headers: authHeaders(token, false) },
  );
  if (!beforeRevsRes.ok) {
    throw new Error(
      `Cannot load revisions before start for survey ${surveyId}: ${beforeRevsRes.status}`,
    );
  }
  const beforeRevs = extractItems(beforeRevsRes.data);
  const beforeIds = new Set(beforeRevs.map((x) => Number(x.id)));

  await sleep(PAUSE_MS);
  const surveyRes = await api(`${API_BASE}/manager/surveys/${surveyId}/`, {
    headers: authHeaders(token, false),
  });
  if (surveyRes.ok && surveyRes.data?.status === 'active') {
    await sleep(PAUSE_MS);
    await api(`${API_BASE}/manager/surveys/${surveyId}/stop/`, {
      method: 'POST',
      headers: authHeaders(token),
    });
  }

  await sleep(PAUSE_MS);
  const startRes = await api(`${API_BASE}/manager/surveys/${surveyId}/start/`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!startRes.ok) {
    throw new Error(
      `Cannot start survey ${surveyId}: ${startRes.status} ${startRes.text.slice(0, 300)}`,
    );
  }

  await sleep(PAUSE_MS);
  const afterRevsRes = await api(
    `${API_BASE}/manager/surveys/${surveyId}/revisions/?limit=100`,
    { headers: authHeaders(token, false) },
  );
  const afterRevs = extractItems(afterRevsRes.data);
  const created =
    afterRevs.find((r) => !beforeIds.has(Number(r.id))) || pickLatestRevision(afterRevs);
  if (!created?.alias) {
    throw new Error(`New revision alias not found for survey ${surveyId}`);
  }
  return created;
}

async function answerSurvey16ByUsers(revisionAlias) {
  const surveyId = SURVEY_16_ID;
  const results = [];

  const adminAuth = await login(ADMIN_LOGIN, ADMIN_PASSWORD);
  const adminToken = adminAuth.data?.accessToken;
  if (!adminToken) throw new Error('admin auth failed while loading survey16 details');

  await sleep(PAUSE_MS);
  const detailsRes = await api(`${API_BASE}/manager/surveys/${surveyId}/`, {
    headers: authHeaders(adminToken, false),
  });
  if (!detailsRes.ok) {
    throw new Error(`survey16 details failed: ${detailsRes.status}`);
  }
  const questions = flattenQuestions(detailsRes.data);

  for (const email of TARGET_USERS) {
    const item = { email, login: false, answered: false, note: null };

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
      `${API_BASE}/private/surveys/${surveyId}/${revisionAlias}/answer/page/start/`,
      { method: 'POST', headers: authHeaders(userToken) },
    );
    if (!startRes.ok) {
      item.note = `start_failed_${startRes.status}`;
      results.push(item);
      continue;
    }

    const answers = generateAnswersMap(questions, email);

    await sleep(PAUSE_MS);
    const answerRes = await api(
      `${API_BASE}/private/surveys/${surveyId}/${revisionAlias}/answer/`,
      {
        method: 'POST',
        headers: authHeaders(userToken),
        body: JSON.stringify(answers),
      },
    );
    if (answerRes.ok || answerRes.status === 201) {
      item.answered = true;
      item.note = 'answered';
    } else {
      const pt = startRes.data?.pageToken || startRes.data?.nextPageToken;
      if (!pt) {
        item.note = `answer_failed_${answerRes.status}`;
        results.push(item);
        continue;
      }
      await sleep(PAUSE_MS);
      const nextRes = await api(
        `${API_BASE}/private/surveys/${surveyId}/${revisionAlias}/answer/page/next/?pageToken=${encodeURIComponent(
          pt,
        )}`,
        {
          method: 'POST',
          headers: authHeaders(userToken),
          body: JSON.stringify(answers),
        },
      );
      item.answered = nextRes.ok || nextRes.status === 201;
      item.note = item.answered ? 'answered_page_next' : `next_failed_${nextRes.status}`;
    }

    results.push(item);
  }

  return results;
}

async function answerSurvey17ByUsers(revisionAlias) {
  const surveyId = SURVEY_17_ID;
  const results = [];

  for (const email of TARGET_USERS) {
    const item = { email, login: false, answered: false, note: null };

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
      `${API_BASE}/public/surveys/${surveyId}/${revisionAlias}/answer/page/start/`,
      { method: 'POST', headers: authHeaders(userToken) },
    );
    if (!startRes.ok) {
      item.note = `start_failed_${startRes.status}`;
      results.push(item);
      continue;
    }

    let nextPageToken = startRes.data?.nextPageToken || startRes.data?.pageToken;
    let nextPage = startRes.data?.nextPage;
    let guard = 0;
    let failed = false;

    while (nextPageToken && nextPage && guard < 20) {
      guard += 1;
      const q = nextPage.questions || [];
      const answers = generateAnswersMap(q, email);

      await sleep(PAUSE_MS);
      const nextRes = await api(
        `${API_BASE}/public/surveys/${surveyId}/${revisionAlias}/answer/page/next/?pageToken=${encodeURIComponent(
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

async function getSummaryByAlias(surveyId, alias, token) {
  await sleep(PAUSE_MS);
  const statRevRes = await api(
    `${API_BASE}/manager/surveys/${surveyId}/statistics/revisions/`,
    { headers: authHeaders(token, false) },
  );
  const statRevs = extractItems(statRevRes.data);
  const rev =
    statRevs.find((x) => x.alias === alias) ||
    statRevs.find((x) => Number(x.id) === Number(alias)) ||
    pickLatestRevision(statRevs);

  if (!rev?.id) {
    return { revisionId: null, answersCount: null, totalCount: null };
  }

  await sleep(PAUSE_MS);
  const summaryRes = await api(
    `${API_BASE}/manager/surveys/${surveyId}/statistics/summary/get/`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ revisionsIds: [rev.id] }),
    },
  );
  const ts = summaryRes.data?.totalSummary || {};
  return {
    revisionId: rev.id,
    alias: rev.alias,
    answersCount: Number(ts.answersCount || 0),
    totalCount: Number(ts.totalCount || 0),
  };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const adminAuth = await login(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!adminAuth.data?.accessToken) {
    throw new Error(`Admin auth failed: ${adminAuth.status} ${adminAuth.text}`);
  }
  const adminToken = adminAuth.data.accessToken;

  // Survey 16: stop/start => new cycle => answer by users
  const rev16 = await stopStartAndGetNewRevision(SURVEY_16_ID, adminToken);
  const answers16 = await answerSurvey16ByUsers(rev16.alias);
  const summary16 = await getSummaryByAlias(SURVEY_16_ID, rev16.alias, adminToken);

  // Survey 17: stop/start => new cycle => answer by users (link/public flow)
  const rev17 = await stopStartAndGetNewRevision(SURVEY_17_ID, adminToken);
  const answers17 = await answerSurvey17ByUsers(rev17.alias);
  const summary17 = await getSummaryByAlias(SURVEY_17_ID, rev17.alias, adminToken);

  const report = {
    surveys: {
      s16: {
        surveyId: SURVEY_16_ID,
        newCycle: { id: rev16.id, alias: rev16.alias, dateStart: rev16.dateStart },
        answers: answers16,
        summary: summary16,
      },
      s17: {
        surveyId: SURVEY_17_ID,
        newCycle: { id: rev17.id, alias: rev17.alias, dateStart: rev17.dateStart },
        answers: answers17,
        summary: summary17,
      },
    },
  };

  const outFile = path.join(OUT_DIR, 'st16_st17_cycle2_prepare_result.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, report }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
