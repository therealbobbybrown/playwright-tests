import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const SURVEY_ID = Number(process.env.SURVEY_ID || 16);
const TARGET_EMAIL = process.env.TARGET_EMAIL || 'qaseed+8@example.org';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const OUT_DIR = process.env.OUT_DIR || '/tmp/st16_v0_case';
const PAUSE_MS = Number(process.env.PAUSE_MS || 1400);

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

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function toIsoPlus8Now() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const pad = (n, z = 2) => String(n).padStart(z, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(
    d.getUTCMilliseconds(),
    3,
  )}+08:00`;
}

function pickActiveRevision(revisions) {
  if (!revisions.length) return null;
  return (
    revisions.find((x) => x.status === 'active') ||
    revisions.find((x) => x.dateEnd == null) ||
    revisions
      .slice()
      .sort(
        (a, b) =>
          new Date(b.dateStart || b.createdAt || 0).getTime() -
          new Date(a.dateStart || a.createdAt || 0).getTime(),
      )[0]
  );
}

function parseXlsx(filePath, targetMarker) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.includes('Ответы') ? 'Ответы' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = rows[0] || [];
  const body = rows.slice(1).filter((r) => r.some((x) => String(x).trim() !== ''));
  const groupIdx = headers.findIndex((h) => String(h).trim() === 'Группы');
  const markerRows = body.filter((r) =>
    JSON.stringify(r).toLowerCase().includes(targetMarker.toLowerCase()),
  );
  const markerGroups =
    groupIdx >= 0 ? markerRows.map((r) => String(r[groupIdx] ?? '').trim()) : [];
  return {
    sheetName,
    headers,
    rowsCount: body.length,
    hasGroupsColumn: groupIdx >= 0,
    groupsColumnIndex: groupIdx,
    markerRowsCount: markerRows.length,
    markerGroups,
    sampleRows: body.slice(0, 2),
  };
}

async function getTokenAndDownloadXlsx({
  token,
  filters,
  resultsWithGroups,
  key,
}) {
  const userDate = toIsoPlus8Now();
  const q = new URLSearchParams({
    userDate,
    filters: JSON.stringify(filters),
    resultsWithAI: 'false',
    resultsWithGroups: resultsWithGroups ? 'true' : 'false',
  });

  await sleep(PAUSE_MS);
  const tokenRes = await api(
    `${API_BASE}/manager/surveys/${SURVEY_ID}/export/get-token/?${q.toString()}`,
    { headers: authHeaders(token) },
  );
  if (!tokenRes.ok || !tokenRes.data?.token) {
    throw new Error(
      `get-token failed (${key}): ${tokenRes.status} ${tokenRes.text.slice(0, 600)}`,
    );
  }

  await sleep(PAUSE_MS);
  const fileRes = await fetch(
    `${API_BASE}/public/surveys/export/xlsx/?lang=ru&token=${encodeURIComponent(
      tokenRes.data.token,
    )}`,
  );
  const fileBuf = Buffer.from(await fileRes.arrayBuffer());
  if (!fileRes.ok) {
    throw new Error(`xlsx download failed (${key}): ${fileRes.status}`);
  }

  const filePath = path.join(OUT_DIR, `${key}.xlsx`);
  await fs.writeFile(filePath, fileBuf);

  return { filePath, tokenStatus: tokenRes.status, downloadStatus: fileRes.status };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const loginRes = await api(`${API_BASE}/auth/account/signin/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: ADMIN_LOGIN,
      password: ADMIN_PASSWORD,
      fingerPrint: fp(),
      permissions: [],
    }),
  });
  if (!loginRes.ok || !loginRes.data?.accessToken) {
    throw new Error(`admin signin failed: ${loginRes.status} ${loginRes.text}`);
  }
  const token = loginRes.data.accessToken;

  await sleep(PAUSE_MS);
  const statRevRes = await api(
    `${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/revisions/`,
    { headers: authHeaders(token) },
  );
  const statRevisions = Array.isArray(statRevRes.data)
    ? statRevRes.data
    : statRevRes.data?.items || [];
  const activeRevision = pickActiveRevision(statRevisions);
  if (!activeRevision?.id) {
    throw new Error(`cannot resolve active revision for survey ${SURVEY_ID}`);
  }

  await sleep(PAUSE_MS);
  const usersRes = await api(
    `${API_BASE}/manager/users/?q=${encodeURIComponent(TARGET_EMAIL)}&limit=20&offset=0`,
    { headers: authHeaders(token) },
  );
  const users = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.items || [];
  const targetUser = users.find(
    (u) =>
      String(u?.account?.email || u?.email || '').toLowerCase() ===
      TARGET_EMAIL.toLowerCase(),
  );
  if (!targetUser?.id) {
    throw new Error(`target user not found: ${TARGET_EMAIL}`);
  }

  await sleep(PAUSE_MS);
  const groupsRes = await api(
    `${API_BASE}/manager/user-groups/?limit=100&offset=0&withUsersIds=1`,
    { headers: authHeaders(token) },
  );
  const groups = Array.isArray(groupsRes.data)
    ? groupsRes.data
    : groupsRes.data?.items || [];
  const targetGroups = groups
    .filter((g) => (g.usersIds || []).includes(targetUser.id))
    .map((g) => ({ id: g.id, title: g.title }));

  const exportsMeta = {};

  // OFF + no-filter
  exportsMeta.off_no_filter = await getTokenAndDownloadXlsx({
    token,
    filters: { revisionsIds: [], usersIds: [], userGroupsIds: [], departmentsIds: [] },
    resultsWithGroups: false,
    key: 'off_no_filter',
  });

  // OFF + filtered active revision
  exportsMeta.off_filtered = await getTokenAndDownloadXlsx({
    token,
    filters: {
      revisionsIds: [activeRevision.id],
      usersIds: [],
      userGroupsIds: [],
      departmentsIds: [],
    },
    resultsWithGroups: false,
    key: 'off_filtered',
  });

  // ON + no-filter
  exportsMeta.on_no_filter = await getTokenAndDownloadXlsx({
    token,
    filters: { revisionsIds: [], usersIds: [], userGroupsIds: [], departmentsIds: [] },
    resultsWithGroups: true,
    key: 'on_no_filter',
  });

  // ON + filtered active revision
  exportsMeta.on_filtered = await getTokenAndDownloadXlsx({
    token,
    filters: {
      revisionsIds: [activeRevision.id],
      usersIds: [],
      userGroupsIds: [],
      departmentsIds: [],
    },
    resultsWithGroups: true,
    key: 'on_filtered',
  });

  const parsed = {
    off_no_filter: parseXlsx(exportsMeta.off_no_filter.filePath, TARGET_EMAIL),
    off_filtered: parseXlsx(exportsMeta.off_filtered.filePath, TARGET_EMAIL),
    on_no_filter: parseXlsx(exportsMeta.on_no_filter.filePath, TARGET_EMAIL),
    on_filtered: parseXlsx(exportsMeta.on_filtered.filePath, TARGET_EMAIL),
  };

  const checks = {
    groups_column_absent_when_off:
      !parsed.off_no_filter.hasGroupsColumn && !parsed.off_filtered.hasGroupsColumn,
    groups_column_present_when_on:
      parsed.on_no_filter.hasGroupsColumn && parsed.on_filtered.hasGroupsColumn,
    row_count_stable_no_filter:
      parsed.off_no_filter.rowsCount === parsed.on_no_filter.rowsCount,
    row_count_stable_filtered:
      parsed.off_filtered.rowsCount === parsed.on_filtered.rowsCount,
    marker_found_in_on_filtered: parsed.on_filtered.markerRowsCount > 0,
    marker_group_matches_org_if_found:
      parsed.on_filtered.markerRowsCount > 0
        ? parsed.on_filtered.markerGroups.some((x) => x === '1' || x.includes('1'))
        : null,
  };

  const report = {
    surveyId: SURVEY_ID,
    caseId: 'V0',
    targetEmail: TARGET_EMAIL,
    activeRevision: {
      id: activeRevision.id,
      alias: activeRevision.alias,
      dateStart: activeRevision.dateStart,
      dateEnd: activeRevision.dateEnd ?? null,
    },
    orgStructure: {
      targetUserId: targetUser.id,
      targetGroups,
    },
    exportsMeta,
    parsed,
    checks,
  };

  const outFile = path.join(OUT_DIR, 'st16_case_v0_result.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, report }, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
