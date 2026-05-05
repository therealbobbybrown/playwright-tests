import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const PAUSE_MS = Number(process.env.PAUSE_MS || 1500);
const OUT_DIR = process.env.OUT_DIR || '/tmp/statistics_settings_audit';
const SURVEY_IDS = (process.env.SURVEY_IDS || '16,17,18,19,20,21,22,23,24')
  .split(',')
  .map((x) => Number(x.trim()))
  .filter(Boolean);
const TARGET_EMAILS = (process.env.TARGET_EMAILS || 'qaseed+8@example.org,qaseed+9@example.org,qaseed+10@example.org,qaseed+11@example.org,qaseed+12@example.org,qaseed+13@example.org,qaseed+14@example.org')
  .split(',')
  .map((x) => x.trim())
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

function sortRevisions(revisions) {
  return revisions
    .slice()
    .sort(
      (a, b) =>
        new Date(b.dateStart || b.createdAt || 0).getTime() -
        new Date(a.dateStart || a.createdAt || 0).getTime(),
    );
}

async function getUserByEmail(token, email) {
  await sleep(PAUSE_MS);
  const res = await api(`${API_BASE}/manager/users/?q=${encodeURIComponent(email)}&limit=50&offset=0`, {
    headers: authHeaders(token),
  });
  const users = extractItems(res.data);
  return users.find((u) => String(u?.account?.email || u?.email || '').toLowerCase() === email.toLowerCase()) || null;
}

async function getGroupTitlesByUser(token, userId) {
  await sleep(PAUSE_MS);
  const res = await api(`${API_BASE}/manager/user-groups/?limit=300&offset=0&withUsersIds=1`, {
    headers: authHeaders(token),
  });
  const groups = extractItems(res.data);
  return groups
    .filter((g) => (g.usersIds || []).some((uid) => Number(uid) === Number(userId)))
    .map((g) => g.title)
    .sort();
}

async function getDepartmentsMap(token) {
  await sleep(PAUSE_MS);
  const res = await api(`${API_BASE}/manager/departments/?limit=300&offset=0`, {
    headers: authHeaders(token),
  });
  const deps = extractItems(res.data);
  const map = new Map();
  for (const d of deps) map.set(Number(d.id), d.title || d.name || String(d.id));
  return { list: deps, map };
}

async function getSurveyState(token, surveyId, targetEmailsSet) {
  await sleep(PAUSE_MS);
  const surveyRes = await api(`${API_BASE}/manager/surveys/${surveyId}/`, { headers: authHeaders(token) });

  await sleep(PAUSE_MS);
  const revRes = await api(`${API_BASE}/manager/surveys/${surveyId}/statistics/revisions/`, {
    headers: authHeaders(token),
  });
  const revisions = sortRevisions(extractItems(revRes.data));
  const topRevisions = revisions.slice(0, 3);

  const revisionSummaries = [];
  for (const r of topRevisions) {
    await sleep(PAUSE_MS);
    const summaryRes = await api(`${API_BASE}/manager/surveys/${surveyId}/statistics/summary/get/`, {
      method: 'POST',
      headers: authHeaders(token, true),
      body: JSON.stringify({ revisionsIds: [r.id] }),
    });

    await sleep(PAUSE_MS);
    const usersRes = await api(
      `${API_BASE}/manager/surveys/${surveyId}/statistics/users/?revisionsIds=${r.id}&limit=500&offset=0`,
      { headers: authHeaders(token) },
    );
    const users = extractItems(usersRes.data);
    const emailsInRev = new Set(
      users.map((u) => String(u?.account?.email || u?.email || '').toLowerCase()).filter(Boolean),
    );
    const targetPresence = {};
    for (const e of targetEmailsSet) targetPresence[e] = emailsInRev.has(e);

    revisionSummaries.push({
      id: r.id,
      alias: r.alias,
      status: r.status ?? null,
      dateStart: r.dateStart ?? null,
      dateEnd: r.dateEnd ?? null,
      answersCount: Number(summaryRes.data?.totalSummary?.answersCount || 0),
      totalCount: Number(summaryRes.data?.totalSummary?.totalCount || 0),
      targetPresence,
    });
  }

  return {
    surveyId,
    survey: {
      id: surveyRes.data?.id ?? surveyId,
      title: surveyRes.data?.title ?? null,
      status: surveyRes.data?.status ?? null,
      type: surveyRes.data?.type ?? null,
      isAnonymous: surveyRes.data?.isAnonymous ?? null,
      recipientsType: surveyRes.data?.recipientsType ?? null,
    },
    revisionsTotal: revisions.length,
    revisions: revisionSummaries,
  };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const auth = await signIn(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!auth.ok || !auth.data?.accessToken) {
    throw new Error(`Admin auth failed: ${auth.status} ${auth.text}`);
  }
  const token = auth.data.accessToken;

  const targetEmailsSet = TARGET_EMAILS.map((e) => e.toLowerCase());

  const { list: departments, map: depMap } = await getDepartmentsMap(token);
  const users = [];
  for (const email of TARGET_EMAILS) {
    const u = await getUserByEmail(token, email);
    if (!u) {
      users.push({ email, found: false });
      continue;
    }
    const groupTitles = await getGroupTitlesByUser(token, u.id);
    const depId = Number(u?.departmentId || u?.department?.id || 0) || null;
    users.push({
      email,
      found: true,
      id: u.id,
      isActive: u.isActive ?? u.active ?? null,
      departmentId: depId,
      departmentTitle: depId ? depMap.get(depId) || null : null,
      groups: groupTitles,
    });
  }

  const surveys = [];
  for (const surveyId of SURVEY_IDS) {
    const s = await getSurveyState(token, surveyId, targetEmailsSet);
    surveys.push(s);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apiBase: API_BASE,
    surveyIds: SURVEY_IDS,
    targetEmails: TARGET_EMAILS,
    departmentsTotal: departments.length,
    users,
    surveys,
  };

  const outFile = path.join(OUT_DIR, 'statistics_settings_readiness_audit.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, surveys: surveys.length, users: users.length }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
