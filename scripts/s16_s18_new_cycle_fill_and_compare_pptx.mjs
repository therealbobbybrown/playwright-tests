import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const PAUSE_MS = Number(process.env.PAUSE_MS || 1400);
const OUT_DIR = process.env.OUT_DIR || '/tmp/s16_s18_after_refill';
const SURVEY_IDS = [16, 18];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fp(seed = '') {
  return createHash('md5').update(`${Date.now()}_${seed}`).digest('hex');
}

function unique(list) {
  return [...new Set(list)];
}

function authHeaders(token, withJson = true) {
  if (!withJson) return { Authorization: `Bearer ${token}` };
  return { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

function extractItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
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

function flattenQuestions(surveyDetails) {
  const pages = surveyDetails?.pages || [];
  return pages.flatMap((p) => p.questions || p.updatedQuestions || []);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomText(email) {
  const variants = [
    'Рабочий процесс стабилен, но есть точки роста.',
    'В целом доволен, нужны улучшения по синхронизации.',
    'Есть прогресс, но хотелось бы чаще обратную связь.',
    'Команда помогает, нагрузка в пределах нормы.',
    'Нормально, но по процессам можно ускориться.',
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
    }
  }

  return answers;
}

async function getSurveyDetails(surveyId, token) {
  await sleep(PAUSE_MS);
  return api(`${API_BASE}/manager/surveys/${surveyId}/`, {
    headers: authHeaders(token, false),
  });
}

async function getSurveyRevisions(surveyId, token) {
  await sleep(PAUSE_MS);
  const r = await api(`${API_BASE}/manager/surveys/${surveyId}/revisions/?limit=100`, {
    headers: authHeaders(token, false),
  });
  return extractItems(r.data);
}

async function createNewCycle(surveyId, token) {
  const beforeRevisions = await getSurveyRevisions(surveyId, token);
  const beforeIds = new Set(beforeRevisions.map((x) => Number(x.id)));

  const survey = await getSurveyDetails(surveyId, token);
  if (!survey.ok) throw new Error(`Survey ${surveyId} load failed: ${survey.status}`);

  if (survey.data?.status === 'active') {
    await sleep(PAUSE_MS);
    const stopRes = await api(`${API_BASE}/manager/surveys/${surveyId}/stop/`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    if (!stopRes.ok) {
      throw new Error(`Survey ${surveyId} stop failed: ${stopRes.status}`);
    }
  }

  await sleep(PAUSE_MS);
  const startRes = await api(`${API_BASE}/manager/surveys/${surveyId}/start/`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!startRes.ok) {
    throw new Error(
      `Survey ${surveyId} start failed: ${startRes.status} ${(startRes.text || '').slice(0, 260)}`,
    );
  }

  const afterRevisions = await getSurveyRevisions(surveyId, token);
  const created =
    afterRevisions.find((x) => !beforeIds.has(Number(x.id))) ||
    afterRevisions.sort((a, b) => new Date(b.dateStart || 0) - new Date(a.dateStart || 0))[0];
  if (!created?.id || !created?.alias) {
    throw new Error(`Cannot determine new revision for survey ${surveyId}`);
  }
  return created;
}

async function getStatsRevisionByAlias(surveyId, alias, token) {
  await sleep(PAUSE_MS);
  const res = await api(`${API_BASE}/manager/surveys/${surveyId}/statistics/revisions/`, {
    headers: authHeaders(token, false),
  });
  const revs = extractItems(res.data);
  return revs.find((r) => r.alias === alias) || revs.find((r) => Number(r.id) === Number(alias)) || null;
}

async function getSurveyRespondentEmails(surveyId, revisionId, token) {
  await sleep(PAUSE_MS);
  const res = await api(
    `${API_BASE}/manager/surveys/${surveyId}/statistics/users/?revisionsIds=${revisionId}&limit=500&offset=0`,
    { headers: authHeaders(token, false) },
  );
  const items = extractItems(res.data);
  return unique(
    items
      .map((x) => String(x?.account?.email || x?.email || '').trim().toLowerCase())
      .filter(Boolean),
  );
}

async function getAllCandidateEmails(token) {
  const fromRange = ['qaseed@example.org'];
  for (let i = 1; i <= 40; i += 1) fromRange.push(`qaseed+${i}@example.org`);

  await sleep(PAUSE_MS);
  const byQ = await api(`${API_BASE}/manager/users/?q=${encodeURIComponent('qaseed')}&limit=500&offset=0`, {
    headers: authHeaders(token, false),
  });
  const users = extractItems(byQ.data);
  const fromApi = users
    .map((u) => String(u?.account?.email || u?.email || '').trim().toLowerCase())
    .filter((e) => e.includes('qaseed') && e.endsWith('@example.org'));

  return unique([...fromRange, ...fromApi]);
}

async function answerCycleAsManyAsPossible(surveyId, alias, questions, preferredEmails, fallbackEmails) {
  const candidates = unique([...preferredEmails, ...fallbackEmails]);
  const results = [];

  for (const email of candidates) {
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
    const startRes = await api(`${API_BASE}/private/surveys/${surveyId}/${alias}/answer/page/start/`, {
      method: 'POST',
      headers: authHeaders(userToken),
    });
    if (!startRes.ok) {
      item.note = `start_failed_${startRes.status}`;
      results.push(item);
      continue;
    }
    item.started = true;

    const answers = generateAnswersMap(questions, email);

    await sleep(PAUSE_MS);
    const answerRes = await api(`${API_BASE}/private/surveys/${surveyId}/${alias}/answer/`, {
      method: 'POST',
      headers: authHeaders(userToken),
      body: JSON.stringify(answers),
    });

    if (answerRes.ok || answerRes.status === 201) {
      item.answered = true;
      item.note = 'answered';
      results.push(item);
      continue;
    }

    const pageToken = startRes.data?.pageToken || startRes.data?.nextPageToken;
    if (!pageToken) {
      item.note = `answer_failed_${answerRes.status}`;
      results.push(item);
      continue;
    }

    await sleep(PAUSE_MS);
    const nextRes = await api(
      `${API_BASE}/private/surveys/${surveyId}/${alias}/answer/page/next/?pageToken=${encodeURIComponent(pageToken)}`,
      {
        method: 'POST',
        headers: authHeaders(userToken),
        body: JSON.stringify(answers),
      },
    );

    item.answered = nextRes.ok || nextRes.status === 201;
    item.note = item.answered ? 'answered_page_next' : `next_failed_${nextRes.status}`;
    results.push(item);
  }

  return results;
}

async function getRevisionSummary(surveyId, revisionId, token) {
  await sleep(PAUSE_MS);
  const res = await api(`${API_BASE}/manager/surveys/${surveyId}/statistics/summary/get/`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ revisionsIds: [revisionId] }),
  });
  const ts = res.data?.totalSummary || {};
  return {
    status: res.status,
    answersCount: Number(ts.answersCount || 0),
    totalCount: Number(ts.totalCount || 0),
  };
}

function userDatePlus8() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const p = (n, z = 2) => String(n).padStart(z, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}+08:00`;
}

async function downloadPptxForRevision(surveyId, revisionId, token) {
  const q = new URLSearchParams({
    userDate: userDatePlus8(),
    filters: JSON.stringify({
      revisionsIds: [revisionId],
      usersIds: [],
      userGroupsIds: [],
      departmentsIds: [],
    }),
    resultsWithAI: 'false',
    resultsWithGroups: 'false',
  });

  await sleep(PAUSE_MS);
  const tRes = await api(`${API_BASE}/manager/surveys/${surveyId}/export/get-token/?${q.toString()}`, {
    headers: authHeaders(token, false),
  });
  if (!tRes.ok || !tRes.data?.token) {
    throw new Error(`Export token failed survey ${surveyId}: ${tRes.status}`);
  }

  await sleep(PAUSE_MS);
  const dl = await fetch(`${API_BASE}/public/surveys/export/pptx/?lang=ru&token=${encodeURIComponent(tRes.data.token)}`);
  if (!dl.ok) {
    const txt = await dl.text();
    throw new Error(`PPTX download failed survey ${surveyId}: ${dl.status} ${txt.slice(0, 240)}`);
  }
  return Buffer.from(await dl.arrayBuffer());
}

function decodeXmlEntities(s = '') {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function unzipList(filePath) {
  const out = execFileSync('unzip', ['-Z1', filePath], { encoding: 'utf8' });
  return out.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

function unzipRead(filePath, entryName) {
  return execFileSync('unzip', ['-p', filePath, entryName], {
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024,
  });
}

function parsePptxStructure(filePath) {
  const slideEntries = unzipList(filePath)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)[1]) - Number(b.match(/slide(\d+)\.xml/)[1]));

  const slides = [];
  const allTexts = [];
  let personalTokens = 0;

  for (const entry of slideEntries) {
    const xml = unzipRead(filePath, entry);
    const texts = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)]
      .map((m) => decodeXmlEntities(m[1]).trim())
      .filter(Boolean);
    const uniqueTexts = [...new Set(texts)];
    allTexts.push(...uniqueTexts);

    const joined = uniqueTexts.join(' | ');
    if (/@example\.org|Юрий\s*\d+|qaseed/i.test(joined)) personalTokens += 1;

    slides.push({
      file: entry,
      sample: uniqueTexts.slice(0, 20),
    });
  }

  const uniqueAll = [...new Set(allTexts)];
  return {
    slideCount: slides.length,
    slides,
    personalTokensSlides: personalTokens,
    uniqueTextSample: uniqueAll.slice(0, 500),
  };
}

async function processSurvey(surveyId, adminToken, fallbackEmails) {
  const createdRevision = await createNewCycle(surveyId, adminToken);
  const surveyDetails = await getSurveyDetails(surveyId, adminToken);
  if (!surveyDetails.ok) {
    throw new Error(`Survey details failed for ${surveyId}: ${surveyDetails.status}`);
  }
  const questions = flattenQuestions(surveyDetails.data);

  const statsRevision = await getStatsRevisionByAlias(surveyId, createdRevision.alias, adminToken);
  const revisionIdForStats = statsRevision?.id || createdRevision.id;
  const preferredEmails = statsRevision?.id
    ? await getSurveyRespondentEmails(surveyId, statsRevision.id, adminToken)
    : [];

  const answerResults = await answerCycleAsManyAsPossible(
    surveyId,
    createdRevision.alias,
    questions,
    preferredEmails,
    fallbackEmails,
  );

  await sleep(PAUSE_MS);
  await api(`${API_BASE}/manager/surveys/${surveyId}/stop/`, {
    method: 'POST',
    headers: authHeaders(adminToken),
  });

  const summary = await getRevisionSummary(surveyId, revisionIdForStats, adminToken);

  const pptxBuf = await downloadPptxForRevision(surveyId, revisionIdForStats, adminToken);
  const pptxPath = `${OUT_DIR}/survey_${surveyId}_revision_${revisionIdForStats}.pptx`;
  await fs.writeFile(pptxPath, pptxBuf);
  const parsedPptx = parsePptxStructure(pptxPath);

  return {
    surveyId,
    title: surveyDetails.data?.title || null,
    isAnonim: surveyDetails.data?.isAnonim ?? null,
    newRevision: {
      id: createdRevision.id,
      alias: createdRevision.alias,
      dateStart: createdRevision.dateStart || null,
    },
    statsRevisionId: revisionIdForStats,
    preferredCandidatesCount: preferredEmails.length,
    attemptedCandidatesCount: unique([...preferredEmails, ...fallbackEmails]).length,
    answeredCount: answerResults.filter((x) => x.answered).length,
    startedCount: answerResults.filter((x) => x.started).length,
    loginOkCount: answerResults.filter((x) => x.login).length,
    summary,
    answerResults,
    pptxPath,
    pptx: parsedPptx,
  };
}

function buildDiff(a, b) {
  const setA = new Set(a.pptx.uniqueTextSample || []);
  const setB = new Set(b.pptx.uniqueTextSample || []);
  return {
    slideCount: {
      surveyA: a.pptx.slideCount,
      surveyB: b.pptx.slideCount,
    },
    personalTokensSlides: {
      surveyA: a.pptx.personalTokensSlides,
      surveyB: b.pptx.personalTokensSlides,
    },
    textOnlyInA: [...setA].filter((x) => !setB.has(x)).slice(0, 250),
    textOnlyInB: [...setB].filter((x) => !setA.has(x)).slice(0, 250),
  };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const adminAuth = await login(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!adminAuth.data?.accessToken) {
    throw new Error(`Admin auth failed: ${adminAuth.status}`);
  }
  const adminToken = adminAuth.data.accessToken;
  const fallbackEmails = await getAllCandidateEmails(adminToken);

  const first = await processSurvey(SURVEY_IDS[0], adminToken, fallbackEmails);
  const second = await processSurvey(SURVEY_IDS[1], adminToken, fallbackEmails);
  const diff = buildDiff(first, second);

  const report = {
    generatedAt: new Date().toISOString(),
    apiBase: API_BASE,
    surveys: [first, second],
    diff,
  };

  const outFile = `${OUT_DIR}/s16_s18_new_cycle_fill_compare_pptx.json`;
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        outFile,
        surveys: report.surveys.map((s) => ({
          surveyId: s.surveyId,
          isAnonim: s.isAnonim,
          newRevision: s.newRevision,
          answeredCount: s.answeredCount,
          summary: s.summary,
          slideCount: s.pptx.slideCount,
          personalTokensSlides: s.pptx.personalTokensSlides,
        })),
        diff,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});

