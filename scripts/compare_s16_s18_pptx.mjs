import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const API = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const OUT_DIR = '/tmp/s16_s18_pptx_compare';
const SURVEY_IDS = [16, 18];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function authHeaders(token, json = false) {
  const h = { Authorization: `Bearer ${token}` };
  if (json) h['content-type'] = 'application/json';
  return h;
}

function extractItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function fingerprint(seed = '') {
  return createHash('md5').update(`${Date.now()}_${seed}`).digest('hex');
}

function userDatePlus8() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const p = (n, z = 2) => String(n).padStart(z, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}+08:00`;
}

async function signIn() {
  const res = await api(`${API}/auth/account/signin/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: ADMIN_LOGIN,
      password: ADMIN_PASSWORD,
      fingerPrint: fingerprint(ADMIN_LOGIN),
      permissions: [],
    }),
  });
  if (!res.ok || !res.data?.accessToken) {
    throw new Error(`Auth failed: ${res.status} ${(res.text || '').slice(0, 250)}`);
  }
  return res.data.accessToken;
}

async function getSurveyMeta(token, surveyId) {
  const res = await api(`${API}/manager/surveys/${surveyId}/`, {
    headers: authHeaders(token),
  });
  return { ok: res.ok, status: res.status, data: res.data };
}

async function getRevisions(token, surveyId) {
  const res = await api(`${API}/manager/surveys/${surveyId}/statistics/revisions/`, {
    headers: authHeaders(token),
  });
  const items = extractItems(res.data).sort(
    (a, b) => new Date(b.dateStart || b.createdAt || 0) - new Date(a.dateStart || a.createdAt || 0),
  );
  return items;
}

function pickRevision(revisions) {
  const nonEmpty = revisions.find((r) => Number(r.answersCount || 0) > 0);
  return nonEmpty || revisions[0] || null;
}

async function getExportToken(token, surveyId, revisionId) {
  const filters = {
    revisionsIds: revisionId ? [revisionId] : [],
    usersIds: [],
    userGroupsIds: [],
    departmentsIds: [],
  };

  const q = new URLSearchParams({
    userDate: userDatePlus8(),
    filters: JSON.stringify(filters),
    resultsWithAI: 'false',
    resultsWithGroups: 'false',
  });

  const res = await api(`${API}/manager/surveys/${surveyId}/export/get-token/?${q.toString()}`, {
    headers: authHeaders(token),
  });

  if (!res.ok || !res.data?.token) {
    throw new Error(`get-token failed s${surveyId}: ${res.status} ${(res.text || '').slice(0, 250)}`);
  }
  return res.data.token;
}

async function downloadPptx(tokenStr, surveyId) {
  const url = `${API}/public/surveys/export/pptx/?lang=ru&token=${encodeURIComponent(tokenStr)}`;
  const r = await fetch(url);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`download pptx failed s${surveyId}: ${r.status} ${t.slice(0, 180)}`);
  }
  return Buffer.from(await r.arrayBuffer());
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
    maxBuffer: 20 * 1024 * 1024,
  });
}

function parsePptx(filePath) {
  const entries = unzipList(filePath)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)[1]) - Number(b.match(/slide(\d+)\.xml/)[1]));

  const slides = [];
  const keywordCounters = {
    respondent: 0,
    email: 0,
    group: 0,
    department: 0,
    anonymousWord: 0,
    nps: 0,
    answer: 0,
  };

  const linesAll = [];

  for (const file of entries) {
    const xml = unzipRead(filePath, file);
    const textRuns = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)]
      .map((m) => decodeXmlEntities(m[1]).trim())
      .filter(Boolean);

    const unique = [...new Set(textRuns)];
    linesAll.push(...unique);
    const joined = unique.join(' | ').toLowerCase();

    if (/респондент|сотрудник|участник/.test(joined)) keywordCounters.respondent += 1;
    if (/email|e-mail|почт/.test(joined)) keywordCounters.email += 1;
    if (/групп/.test(joined)) keywordCounters.group += 1;
    if (/отдел/.test(joined)) keywordCounters.department += 1;
    if (/аноним/.test(joined)) keywordCounters.anonymousWord += 1;
    if (/nps/.test(joined)) keywordCounters.nps += 1;
    if (/ответ|ответы|заполн/.test(joined)) keywordCounters.answer += 1;

    slides.push({
      file,
      textCount: unique.length,
      sample: unique.slice(0, 25),
      hasRespondentWords: /респондент|сотрудник|участник/.test(joined),
      hasEmailWords: /email|e-mail|почт/.test(joined),
      hasAnonWords: /аноним/.test(joined),
    });
  }

  const uniqueAll = [...new Set(linesAll)];
  const piiLike = uniqueAll.filter((t) => /@|qaseed|юрий\s*\d+/i.test(t));

  return {
    slideCount: slides.length,
    slides,
    keywordCounters,
    piiLike: piiLike.slice(0, 200),
    uniqueTextSample: uniqueAll.slice(0, 500),
  };
}

async function run() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const token = await signIn();

  const result = {
    generatedAt: new Date().toISOString(),
    api: API,
    surveys: [],
  };

  for (const surveyId of SURVEY_IDS) {
    await sleep(1200);

    const meta = await getSurveyMeta(token, surveyId);
    const revisions = await getRevisions(token, surveyId);
    const revision = pickRevision(revisions);

    const exportToken = await getExportToken(token, surveyId, revision?.id);
    const pptxBuf = await downloadPptx(exportToken, surveyId);
    const pptxPath = `${OUT_DIR}/survey_${surveyId}_rev_${revision?.id || 'none'}.pptx`;

    await fs.writeFile(pptxPath, pptxBuf);
    const parsed = parsePptx(pptxPath);

    result.surveys.push({
      surveyId,
      title: meta.data?.title || null,
      isAnonymous: meta.data?.isAnonymous ?? null,
      isPublic: meta.data?.isPublic ?? null,
      status: meta.data?.status || null,
      pickedRevision: revision
        ? {
            id: revision.id,
            status: revision.status,
            answersCount: Number(revision.answersCount || 0),
            totalCount: Number(revision.totalCount || 0),
            dateStart: revision.dateStart || null,
            dateEnd: revision.dateEnd || null,
          }
        : null,
      revisionsTop: revisions.slice(0, 8).map((r) => ({
        id: r.id,
        status: r.status,
        answersCount: Number(r.answersCount || 0),
        totalCount: Number(r.totalCount || 0),
      })),
      pptxPath,
      pptx: parsed,
    });
  }

  const [s16, s18] = result.surveys;
  if (s16 && s18) {
    const set16 = new Set(s16.pptx.uniqueTextSample || []);
    const set18 = new Set(s18.pptx.uniqueTextSample || []);

    const only16 = [...set16].filter((x) => !set18.has(x)).slice(0, 300);
    const only18 = [...set18].filter((x) => !set16.has(x)).slice(0, 300);

    result.diff = {
      slideCount: {
        survey16: s16.pptx.slideCount,
        survey18: s18.pptx.slideCount,
      },
      keywordCounters: {
        survey16: s16.pptx.keywordCounters,
        survey18: s18.pptx.keywordCounters,
      },
      piiLikeCounts: {
        survey16: (s16.pptx.piiLike || []).length,
        survey18: (s18.pptx.piiLike || []).length,
      },
      textOnlyIn16: only16,
      textOnlyIn18: only18,
    };
  }

  const outFile = `${OUT_DIR}/compare_s16_s18_pptx.json`;
  await fs.writeFile(outFile, JSON.stringify(result, null, 2));

  console.log(
    JSON.stringify(
      {
        outFile,
        surveys: result.surveys.map((s) => ({
          surveyId: s.surveyId,
          isAnonymous: s.isAnonymous,
          isPublic: s.isPublic,
          pickedRevision: s.pickedRevision,
          slideCount: s.pptx.slideCount,
          keywords: s.pptx.keywordCounters,
          piiLikeCount: (s.pptx.piiLike || []).length,
        })),
        diff: result.diff,
      },
      null,
      2,
    ),
  );
}

run().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
