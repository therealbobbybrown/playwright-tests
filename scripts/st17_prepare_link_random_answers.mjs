import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const SURVEY_ID = Number(process.env.SURVEY_ID || 17);
const REVISION_ALIAS =
  process.env.REVISION_ALIAS || '370cc580-d0ea-4f3d-8a7f-547adbf2d725';
const PAUSE_MS = Number(process.env.PAUSE_MS || 1500);
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const OUT_DIR = process.env.OUT_DIR || '/tmp/st17_prepare_answers';

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
  const p = await parseJson(res);
  return { ok: res.ok, status: res.status, data: p.json, text: p.text };
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

function authHeaders(token) {
  return token
    ? {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      }
    : { 'content-type': 'application/json' };
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildText(email) {
  const pool = [
    'Хочу больше прозрачности по приоритетам.',
    'Команда поддерживает, это помогает.',
    'Нужно немного улучшить процессы.',
    'В целом всё хорошо, но есть точки роста.',
    'С коммуникацией стало заметно лучше.',
  ];
  return `${pickRandom(pool)} (${email})`;
}

function generateAnswers(questions, email) {
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
            value: buildText(email),
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

function extractItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function pickStatsRevision(statRevisions) {
  const sorted = [...statRevisions].sort((a, b) => {
    const da = new Date(a.dateStart || 0).getTime();
    const db = new Date(b.dateStart || 0).getTime();
    return db - da;
  });
  return (
    sorted.find((x) => x.alias === REVISION_ALIAS) ||
    sorted.find((x) => x.status === 'active') ||
    sorted.find((x) => x.dateEnd == null) ||
    sorted[0]
  );
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const adminAuth = await login(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!adminAuth.data?.accessToken) {
    throw new Error(`Admin auth failed: ${adminAuth.status} ${adminAuth.text}`);
  }
  const adminHeaders = authHeaders(adminAuth.data.accessToken);

  await sleep(PAUSE_MS);
  const statRevRes = await api(
    `${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/revisions/`,
    { headers: adminHeaders },
  );
  if (!statRevRes.ok) {
    throw new Error(
      `Cannot load statistics revisions: ${statRevRes.status} ${statRevRes.text}`,
    );
  }
  const statRevisions = extractItems(statRevRes.data);
  const activeStatsRevision = pickStatsRevision(statRevisions);
  if (!activeStatsRevision?.id) {
    throw new Error('Cannot resolve stats revision for summary checks');
  }

  await sleep(PAUSE_MS);
  const summaryBeforeRes = await api(
    `${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/summary/get/`,
    {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ revisionsIds: [activeStatsRevision.id] }),
    },
  );
  const beforeTotal = Number(summaryBeforeRes.data?.totalSummary?.totalCount || 0);
  const beforeAnswers = Number(
    summaryBeforeRes.data?.totalSummary?.answersCount || 0,
  );

  const results = [];

  for (const email of TARGET_USERS) {
    const item = {
      email,
      login: false,
      started: false,
      answered: false,
      note: null,
    };

    await sleep(PAUSE_MS);
    const userAuth = await login(email, 'admin');
    if (!userAuth.data?.accessToken) {
      item.note = `login_failed_${userAuth.status}`;
      results.push(item);
      continue;
    }
    item.login = true;

    const userHeaders = authHeaders(userAuth.data.accessToken);

    await sleep(PAUSE_MS);
    const startRes = await api(
      `${API_BASE}/public/surveys/${SURVEY_ID}/${REVISION_ALIAS}/answer/page/start/`,
      { method: 'POST', headers: userHeaders },
    );
    if (!startRes.ok) {
      item.note = `start_failed_${startRes.status}`;
      results.push(item);
      continue;
    }
    item.started = true;

    const nextPageToken = startRes.data?.nextPageToken || startRes.data?.pageToken;
    const questions = startRes.data?.nextPage?.questions || [];
    if (!nextPageToken || !questions.length) {
      item.note = 'no_page_token_or_questions';
      results.push(item);
      continue;
    }

    const answers = generateAnswers(questions, email);

    await sleep(PAUSE_MS);
    const nextRes = await api(
      `${API_BASE}/public/surveys/${SURVEY_ID}/${REVISION_ALIAS}/answer/page/next/?pageToken=${encodeURIComponent(nextPageToken)}`,
      {
        method: 'POST',
        headers: userHeaders,
        body: JSON.stringify(answers),
      },
    );

    if (nextRes.ok || nextRes.status === 201) {
      item.answered = true;
      item.note = 'answered';
    } else {
      item.note = `next_failed_${nextRes.status}`;
      item.errorSample = (nextRes.text || '').slice(0, 280);
    }

    results.push(item);
  }

  await sleep(PAUSE_MS);
  const summaryAfterRes = await api(
    `${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/summary/get/`,
    {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ revisionsIds: [activeStatsRevision.id] }),
    },
  );
  const afterTotal = Number(summaryAfterRes.data?.totalSummary?.totalCount || 0);
  const afterAnswers = Number(summaryAfterRes.data?.totalSummary?.answersCount || 0);

  const report = {
    surveyId: SURVEY_ID,
    revisionAlias: REVISION_ALIAS,
    statsRevisionId: activeStatsRevision.id,
    before: { totalCount: beforeTotal, answersCount: beforeAnswers },
    after: { totalCount: afterTotal, answersCount: afterAnswers },
    deltaAnswers: afterAnswers - beforeAnswers,
    users: TARGET_USERS,
    results,
  };

  const outFile = path.join(OUT_DIR, 'st17_prepare_link_random_answers_result.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, report }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
