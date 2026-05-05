import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const SURVEY_ID = Number(process.env.SURVEY_ID || 16);
const PAUSE_MS = Number(process.env.PAUSE_MS || 1400);
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const OUT_DIR = process.env.OUT_DIR || '/tmp/st16_prepare_answers';

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

function fp() {
  return createHash('md5').update(String(Date.now())).digest('hex');
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
      fingerPrint: fp(),
      permissions: [],
    }),
  });
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
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
    'Процессы понятны, но хочу быстрее обратную связь.',
    'Коммуникация в команде стала лучше.',
    'Есть перегруз в пиковые дни, в остальном стабильно.',
    'Нужно улучшить синхронизацию по задачам.',
    'В целом хорошо, но есть точки роста.',
    'Хочу больше прозрачности по приоритетам.',
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
            value: uniqueText(email),
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

function extractRevisions(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function pickActiveRevision(managerRevisions, statRevisions) {
  const byId = new Map();
  for (const r of managerRevisions) byId.set(Number(r.id), r);
  for (const r of statRevisions) {
    const id = Number(r.id);
    if (!byId.has(id)) byId.set(id, r);
  }

  const all = [...byId.values()];
  const active =
    all.find((r) => r.status === 'active') ||
    all.find((r) => r.dateEnd === null || r.dateEnd === undefined);
  if (active) return active;

  return all.sort((a, b) => {
    const da = new Date(a.dateStart || a.createdAt || 0).getTime();
    const db = new Date(b.dateStart || b.createdAt || 0).getTime();
    return db - da;
  })[0];
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const adminAuth = await login(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!adminAuth.data?.accessToken) {
    throw new Error(`Admin auth failed: ${adminAuth.status} ${adminAuth.text}`);
  }
  const adminH = authHeaders(adminAuth.data.accessToken);

  await sleep(PAUSE_MS);
  const revisionsRes = await api(
    `${API_BASE}/manager/surveys/${SURVEY_ID}/revisions/?limit=50`,
    { headers: adminH },
  );
  if (!revisionsRes.ok) {
    throw new Error(
      `Cannot load manager revisions: ${revisionsRes.status} ${revisionsRes.text}`,
    );
  }

  await sleep(PAUSE_MS);
  const statRevisionsRes = await api(
    `${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/revisions/`,
    { headers: adminH },
  );
  const managerRevisions = extractRevisions(revisionsRes.data);
  const statRevisions = extractRevisions(statRevisionsRes.data);
  const activeRevision = pickActiveRevision(managerRevisions, statRevisions);
  if (!activeRevision?.alias) {
    throw new Error('Cannot resolve active revision alias for survey');
  }

  await sleep(PAUSE_MS);
  const surveyDetailsRes = await api(
    `${API_BASE}/manager/surveys/${SURVEY_ID}/`,
    { headers: adminH },
  );
  if (!surveyDetailsRes.ok) {
    throw new Error(
      `Cannot load survey details: ${surveyDetailsRes.status} ${surveyDetailsRes.text}`,
    );
  }
  const questions = flattenQuestions(surveyDetailsRes.data);
  if (!questions.length) throw new Error('Survey has no questions');

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

    const userH = authHeaders(userAuth.data.accessToken);

    await sleep(PAUSE_MS);
    const startRes = await api(
      `${API_BASE}/private/surveys/${SURVEY_ID}/${activeRevision.alias}/answer/page/start/`,
      { method: 'POST', headers: userH },
    );

    // Некоторые пользователи могли уже ответить
    if (!startRes.ok && /answered|completed|already/i.test(startRes.text || '')) {
      item.started = false;
      item.answered = true;
      item.note = 'already_answered';
      results.push(item);
      continue;
    }

    if (!startRes.ok) {
      item.note = `start_failed_${startRes.status}`;
      results.push(item);
      continue;
    }
    item.started = true;

    const answers = generateAnswers(questions, email);

    // Основной путь: отдать все ответы одним запросом
    await sleep(PAUSE_MS);
    const answerRes = await api(
      `${API_BASE}/private/surveys/${SURVEY_ID}/${activeRevision.alias}/answer/`,
      {
        method: 'POST',
        headers: userH,
        body: JSON.stringify(answers),
      },
    );

    if (answerRes.ok || answerRes.status === 201) {
      item.answered = true;
      item.note = 'answered';
    } else {
      // fallback для flow с pageToken
      const pageToken = startRes.data?.pageToken || startRes.data?.nextPageToken;
      if (!pageToken) {
        item.note = `answer_failed_${answerRes.status}`;
        results.push(item);
        continue;
      }

      await sleep(PAUSE_MS);
      const nextRes = await api(
        `${API_BASE}/private/surveys/${SURVEY_ID}/${activeRevision.alias}/answer/page/next/?pageToken=${encodeURIComponent(pageToken)}`,
        {
          method: 'POST',
          headers: userH,
          body: JSON.stringify(answers),
        },
      );

      if (nextRes.ok || nextRes.status === 201) {
        item.answered = true;
        item.note = 'answered_page_next';
      } else {
        item.note = `next_failed_${nextRes.status}`;
      }
    }

    results.push(item);
  }

  await sleep(PAUSE_MS);
  const summaryRes = await api(
    `${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/summary/get/`,
    {
      method: 'POST',
      headers: adminH,
      body: JSON.stringify({ revisionsIds: [activeRevision.id] }),
    },
  );

  const totalSummary = summaryRes.data?.totalSummary || {};
  const report = {
    surveyId: SURVEY_ID,
    revision: {
      id: activeRevision.id,
      alias: activeRevision.alias,
      dateStart: activeRevision.dateStart,
      dateEnd: activeRevision.dateEnd ?? null,
    },
    users: TARGET_USERS,
    results,
    summary: {
      status: summaryRes.status,
      answersCount: Number(totalSummary.answersCount || 0),
      totalCount: Number(totalSummary.totalCount || 0),
    },
  };

  const outFile = path.join(OUT_DIR, 'st16_prepare_random_answers_result.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({ outFile, report }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
