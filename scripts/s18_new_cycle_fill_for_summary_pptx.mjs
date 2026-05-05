import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SURVEY_ID = Number(process.env.SURVEY_ID || 18);
const PAUSE_MS = Number(process.env.PAUSE_MS || 1700);
const OUT_DIR = process.env.OUT_DIR || '/tmp/s18_summary_fix';

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

function positiveText(email) {
  return `В целом всё отлично, процессы прозрачны и удобны. (${email})`;
}

function buildPositiveAnswers(questions, email) {
  const answers = {};

  for (const q of questions || []) {
    const qid = q.id;
    const type = q.type;

    if (type === 'scale') {
      const max = q.rangeMax ?? 5;
      answers[qid] = {
        action: 'answer',
        values: [
          {
            value: max,
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
            value: 10,
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
              value: opts[opts.length - 1].text,
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
        answers[qid] = {
          action: 'answer',
          values: [
            {
              value: opts[0].text,
              isCustom: false,
              commentAnswer: null,
              cantAnswer: false,
            },
          ],
        };
      }
      continue;
    }

    if (type === 'shortText' || type === 'longText') {
      answers[qid] = {
        action: 'answer',
        values: [
          {
            value: positiveText(email),
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

async function getSurvey(token) {
  await sleep(PAUSE_MS);
  return api(`${API_BASE}/manager/surveys/${SURVEY_ID}/`, {
    headers: authHeaders(token, false),
  });
}

async function getManagerRevisions(token) {
  await sleep(PAUSE_MS);
  const res = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/revisions/?limit=100`, {
    headers: authHeaders(token, false),
  });
  return extractItems(res.data);
}

async function ensureStopped(token) {
  const survey = await getSurvey(token);
  if (!survey.ok) {
    throw new Error(`Survey load failed: ${survey.status}`);
  }
  if (survey.data?.status !== 'active') return false;

  await sleep(PAUSE_MS);
  const stopRes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/stop/`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!stopRes.ok) {
    throw new Error(`Survey stop failed: ${stopRes.status}`);
  }
  return true;
}

async function startNewCycle(token) {
  const before = await getManagerRevisions(token);
  const beforeIds = new Set(before.map((x) => Number(x.id)));

  await sleep(PAUSE_MS);
  const startRes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/start/`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!startRes.ok) {
    throw new Error(`Survey start failed: ${startRes.status} ${(startRes.text || '').slice(0, 180)}`);
  }

  const after = await getManagerRevisions(token);
  const created =
    after.find((x) => !beforeIds.has(Number(x.id))) ||
    pickLatestRevision(after);
  if (!created?.id || !created?.alias) {
    throw new Error('Cannot determine created cycle');
  }
  return created;
}

async function getStatsRevisions(token) {
  await sleep(PAUSE_MS);
  const res = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/revisions/`, {
    headers: authHeaders(token, false),
  });
  return extractItems(res.data);
}

async function getRespondentEmails(revisionId, token) {
  await sleep(PAUSE_MS);
  const res = await api(
    `${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/users/?revisionsIds=${revisionId}&limit=500&offset=0`,
    { headers: authHeaders(token, false) },
  );
  const items = extractItems(res.data);
  const emails = items
    .map((x) => String(x?.account?.email || x?.email || '').trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(emails)];
}

async function getAllCandidateEmails(token) {
  const seeded = ['qaseed@example.org'];
  for (let i = 1; i <= 40; i += 1) seeded.push(`qaseed+${i}@example.org`);

  await sleep(PAUSE_MS);
  const qRes = await api(`${API_BASE}/manager/users/?q=${encodeURIComponent('qaseed')}&limit=500&offset=0`, {
    headers: authHeaders(token, false),
  });
  const fromApi = extractItems(qRes.data)
    .map((u) => String(u?.account?.email || u?.email || '').trim().toLowerCase())
    .filter((e) => e.includes('qaseed') && e.endsWith('@example.org'));

  return [...new Set([...seeded, ...fromApi])];
}

async function answerAsUser(email, alias, allQuestions) {
  const result = {
    email,
    login: false,
    started: false,
    answered: false,
    note: null,
  };

  await sleep(PAUSE_MS);
  const userAuth = await login(email, 'admin');
  if (!userAuth.data?.accessToken) {
    result.note = `login_failed_${userAuth.status}`;
    return result;
  }
  result.login = true;
  const token = userAuth.data.accessToken;

  await sleep(PAUSE_MS);
  const startRes = await api(
    `${API_BASE}/private/surveys/${SURVEY_ID}/${alias}/answer/page/start/`,
    { method: 'POST', headers: authHeaders(token) },
  );
  if (!startRes.ok) {
    result.note = `start_failed_${startRes.status}`;
    return result;
  }
  result.started = true;

  let pageToken = startRes.data?.nextPageToken || startRes.data?.pageToken || null;
  let page = startRes.data?.nextPage || null;
  let guard = 0;
  let failed = false;

  while (pageToken && page?.questions?.length && guard < 40) {
    guard += 1;
    const pageAnswers = buildPositiveAnswers(page.questions || [], email);
    await sleep(PAUSE_MS);
    const nextRes = await api(
      `${API_BASE}/private/surveys/${SURVEY_ID}/${alias}/answer/page/next/?pageToken=${encodeURIComponent(
        pageToken,
      )}`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(pageAnswers),
      },
    );
    if (!nextRes.ok && nextRes.status !== 201) {
      failed = true;
      result.note = `page_next_failed_${nextRes.status}`;
      break;
    }
    pageToken = nextRes.data?.nextPageToken || null;
    page = nextRes.data?.nextPage || null;
  }

  if (!failed) {
    result.answered = true;
    result.note = 'answered_page_flow_positive';
    return result;
  }

  const allAnswers = buildPositiveAnswers(allQuestions, email);
  await sleep(PAUSE_MS);
  const answerRes = await api(
    `${API_BASE}/private/surveys/${SURVEY_ID}/${alias}/answer/`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(allAnswers),
    },
  );
  result.answered = answerRes.ok || answerRes.status === 201;
  result.note = result.answered ? 'answered_full_positive' : `answer_failed_${answerRes.status}`;
  return result;
}

async function getSummary(revisionId, token) {
  await sleep(PAUSE_MS);
  const res = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/summary/get/`, {
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

async function downloadFilteredPptx(revisionId, token) {
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
  const tRes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/export/get-token/?${q.toString()}`, {
    headers: authHeaders(token, false),
  });
  if (!tRes.ok || !tRes.data?.token) {
    throw new Error(`Export token failed: ${tRes.status}`);
  }

  await sleep(PAUSE_MS);
  const dl = await fetch(`${API_BASE}/public/surveys/export/pptx/?lang=ru&token=${encodeURIComponent(tRes.data.token)}`);
  if (!dl.ok) {
    const txt = await dl.text();
    throw new Error(`PPTX download failed: ${dl.status} ${txt.slice(0, 180)}`);
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

function unzipRead(filePath, entryName) {
  return execFileSync('unzip', ['-p', filePath, entryName], {
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024,
  });
}

function unzipList(filePath) {
  const out = execFileSync('unzip', ['-Z1', filePath], { encoding: 'utf8' });
  return out
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function extractSlideText(filePath, slideNum) {
  const xml = unzipRead(filePath, `ppt/slides/slide${slideNum}.xml`);
  return [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)]
    .map((m) => decodeXmlEntities(m[1]).trim())
    .filter(Boolean);
}

function analyzeFirstSlides(filePath) {
  const entries = unzipList(filePath);
  const slideNums = entries
    .filter((x) => /^ppt\/slides\/slide\d+\.xml$/.test(x))
    .map((x) => Number(x.match(/slide(\d+)\.xml/)[1]))
    .sort((a, b) => a - b);

  const first = {};
  for (let i = 1; i <= 8; i += 1) {
    if (slideNums.includes(i)) {
      first[`slide${i}`] = extractSlideText(filePath, i).slice(0, 80);
    } else {
      first[`slide${i}`] = ['<missing-slide>'];
    }
  }
  const joined = Object.values(first).flat().join(' | ');
  return {
    slideCount: slideNums.length,
    availableSlides: slideNums.slice(0, 20),
    firstSlides: first,
    hasNaN: /NaN%?/i.test(joined),
    hasQuestionMarkPlaceholder: /\?\b/.test(joined),
    hasZeroAnswersPhrase: /0\s*ответов/i.test(joined),
  };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const adminAuth = await login(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!adminAuth.data?.accessToken) {
    throw new Error(`Admin auth failed: ${adminAuth.status}`);
  }
  const adminToken = adminAuth.data.accessToken;

  const stoppedInitially = await ensureStopped(adminToken);
  const createdRevision = await startNewCycle(adminToken);
  const survey = await getSurvey(adminToken);
  if (!survey.ok) throw new Error(`Survey details failed: ${survey.status}`);
  const questions = flattenQuestions(survey.data);
  if (!questions.length) throw new Error('Survey has no questions');

  const statsRevisions = await getStatsRevisions(adminToken);
  const statsRev = statsRevisions.find((r) => r.alias === createdRevision.alias) || pickLatestRevision(statsRevisions);
  if (!statsRev?.id) throw new Error('Cannot resolve stats revision');

  const emailsFromRevision = await getRespondentEmails(statsRev.id, adminToken);
  const fallbackEmails = await getAllCandidateEmails(adminToken);
  const emails = emailsFromRevision.length ? emailsFromRevision : fallbackEmails;
  const answerResults = [];
  for (const email of emails) {
    const r = await answerAsUser(email, createdRevision.alias, questions);
    answerResults.push(r);
  }

  await sleep(PAUSE_MS);
  const stopRes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/stop/`, {
    method: 'POST',
    headers: authHeaders(adminToken),
  });

  const summary = await getSummary(statsRev.id, adminToken);
  const pptxBuf = await downloadFilteredPptx(statsRev.id, adminToken);
  const pptxPath = path.join(OUT_DIR, `survey_${SURVEY_ID}_revision_${statsRev.id}_positive.pptx`);
  await fs.writeFile(pptxPath, pptxBuf);

  const pptxAnalysis = analyzeFirstSlides(pptxPath);

  const report = {
    surveyId: SURVEY_ID,
    stoppedInitially,
    createdRevision: {
      id: createdRevision.id,
      alias: createdRevision.alias,
      dateStart: createdRevision.dateStart || null,
    },
    statsRevisionId: statsRev.id,
    respondents: {
      expected: emails.length,
      source: emailsFromRevision.length ? 'revision_users' : 'fallback_users',
      loginOk: answerResults.filter((x) => x.login).length,
      started: answerResults.filter((x) => x.started).length,
      answered: answerResults.filter((x) => x.answered).length,
    },
    stopSurvey: { ok: stopRes.ok, status: stopRes.status },
    summary,
    pptxPath,
    pptxAnalysis,
    answerResults,
  };

  const outFile = path.join(OUT_DIR, `s${SURVEY_ID}_positive_cycle_report.json`);
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, report }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
