import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const PAUSE_MS = Number(process.env.PAUSE_MS || 1800);
const OUT_DIR = process.env.OUT_DIR || '/tmp/statistics_settings_baseline';
const SURVEY_IDS = (process.env.SURVEY_IDS || '16,17,18,19,20,21,22,23,24')
  .split(',').map((x) => Number(x.trim())).filter(Boolean);
const TARGET_EMAILS = (process.env.TARGET_EMAILS || 'qaseed+8@example.org,qaseed+9@example.org,qaseed+10@example.org,qaseed+11@example.org,qaseed+12@example.org,qaseed+13@example.org,qaseed+14@example.org')
  .split(',').map((x) => x.trim()).filter(Boolean);

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

async function getUserByEmail(token, email) {
  await sleep(PAUSE_MS);
  const res = await api(`${API_BASE}/manager/users/?q=${encodeURIComponent(email)}&limit=50&offset=0`, {
    headers: authHeaders(token),
  });
  const users = extractItems(res.data);
  return users.find((u) => String(u?.account?.email || u?.email || '').toLowerCase() === email.toLowerCase()) || null;
}

async function getAllGroups(token) {
  await sleep(PAUSE_MS);
  const res = await api(`${API_BASE}/manager/user-groups/?limit=300&offset=0`, {
    headers: authHeaders(token),
  });
  return extractItems(res.data);
}

async function isUserInGroup(token, groupId, email) {
  await sleep(PAUSE_MS);
  const res = await api(
    `${API_BASE}/manager/user-groups/${groupId}/users/?q=${encodeURIComponent(email)}&limit=20&offset=0`,
    { headers: authHeaders(token) },
  );
  const users = extractItems(res.data);
  return users.some((u) => String(u?.account?.email || u?.email || '').toLowerCase() === email.toLowerCase());
}

async function getAllDepartments(token) {
  await sleep(PAUSE_MS);
  const res = await api(`${API_BASE}/manager/departments/?limit=300&offset=0`, {
    headers: authHeaders(token),
  });
  return extractItems(res.data);
}

async function getSurveyRevisions(token, surveyId) {
  await sleep(PAUSE_MS);
  const res = await api(`${API_BASE}/manager/surveys/${surveyId}/statistics/revisions/`, {
    headers: authHeaders(token),
  });
  const revs = extractItems(res.data);
  return revs.sort((a,b)=> new Date(b.dateStart||b.createdAt||0)-new Date(a.dateStart||a.createdAt||0));
}

async function checkExport(token, surveyId, filters, ext) {
  const q = new URLSearchParams({
    userDate: userDatePlus8(),
    filters: JSON.stringify(filters),
    resultsWithAI: 'false',
  });

  await sleep(PAUSE_MS);
  const tRes = await api(`${API_BASE}/manager/surveys/${surveyId}/export/get-token/?${q.toString()}`, {
    headers: authHeaders(token),
  });
  if (!tRes.ok || !tRes.data?.token) {
    return { tokenStatus: tRes.status, downloadStatus: null, ok: false };
  }

  await sleep(PAUSE_MS);
  const dl = await fetch(`${API_BASE}/public/surveys/export/${ext}/?lang=ru&token=${encodeURIComponent(tRes.data.token)}`);
  return { tokenStatus: tRes.status, downloadStatus: dl.status, ok: dl.ok };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const auth = await signIn(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!auth.ok || !auth.data?.accessToken) throw new Error(`Admin auth failed: ${auth.status}`);
  const token = auth.data.accessToken;

  const groups = await getAllGroups(token);
  const departments = await getAllDepartments(token);

  const users = [];
  for (const email of TARGET_EMAILS) {
    const u = await getUserByEmail(token, email);
    if (!u) {
      users.push({ email, found: false });
      continue;
    }
    const memberOf = [];
    for (const g of groups) {
      const inGroup = await isUserInGroup(token, g.id, email);
      if (inGroup) memberOf.push(g.title || String(g.id));
    }

    users.push({
      email,
      found: true,
      id: u.id,
      isActive: u.isActive ?? u.active ?? null,
      departmentId: u.departmentId ?? u.department?.id ?? null,
      departmentTitle: u.department?.title ?? u.department?.name ?? null,
      groups: memberOf.sort(),
    });
  }

  const surveys = [];
  for (const surveyId of SURVEY_IDS) {
    await sleep(PAUSE_MS);
    const sRes = await api(`${API_BASE}/manager/surveys/${surveyId}/`, { headers: authHeaders(token) });
    const revisions = await getSurveyRevisions(token, surveyId);
    const latest = revisions[0] || null;

    const noFilter = { revisionsIds: [], usersIds: [], userGroupsIds: [], departmentsIds: [] };
    const withFilter = { revisionsIds: latest?.id ? [latest.id] : [], usersIds: [], userGroupsIds: [], departmentsIds: [] };

    const exports = { noFilter: {}, withFilter: {} };
    for (const ext of ['xlsx','csv','pptx']) {
      exports.noFilter[ext] = await checkExport(token, surveyId, noFilter, ext);
      exports.withFilter[ext] = await checkExport(token, surveyId, withFilter, ext);
    }

    surveys.push({
      surveyId,
      title: sRes.data?.title ?? null,
      status: sRes.data?.status ?? null,
      revisionsTotal: revisions.length,
      latestRevisionId: latest?.id ?? null,
      latestAnswersCount: latest ? Number(latest.answersCount || 0) : null,
      exports,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apiBase: API_BASE,
    users,
    groupsTotal: groups.length,
    departmentsTotal: departments.length,
    surveys,
  };

  const outFile = path.join(OUT_DIR, 'statistics_settings_baseline_check.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, surveys: surveys.length, users: users.length }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
