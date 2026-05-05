import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const SURVEY_ID = Number(process.env.SURVEY_ID || 1);
const PAUSE_MS = Number(process.env.PAUSE_MS || 1200);
const OUT_DIR = '/tmp/s1_results_with_groups';

const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fp() {
  return createHash('md5').update(String(Date.now())).digest('hex');
}

async function parseJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await parseJson(res);
  return { ok: res.ok, status: res.status, data };
}

async function signIn(email, password) {
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

function userDatePlus8() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const pad = (n, z = 2) => String(n).padStart(z, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}+08:00`;
}

function parseXlsxMeta(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const firstSheet = wb.SheetNames[0];
  const ws = wb.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = (rows[0] || []).map((x) => String(x || '').trim());
  return {
    sheet: firstSheet,
    headers,
    rowsCount: Math.max(0, rows.length - 1),
  };
}

function addedColumns(beforeHeaders, afterHeaders) {
  const beforeSet = new Set(beforeHeaders);
  return afterHeaders.filter((h) => h && !beforeSet.has(h));
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const auth = await signIn(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!auth.data?.accessToken) {
    throw new Error(`Admin auth failed: ${JSON.stringify(auth.data)}`);
  }

  const headers = {
    Authorization: `Bearer ${auth.data.accessToken}`,
    'content-type': 'application/json',
  };

  // 1) Определяем 1-й цикл (самый ранний по dateStart)
  await sleep(PAUSE_MS);
  const revRes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/revisions/`, { headers });
  const revisions = Array.isArray(revRes.data) ? revRes.data : (revRes.data?.items || []);
  if (!revisions.length) throw new Error(`No revisions for survey ${SURVEY_ID}`);

  const oldest = revisions
    .slice()
    .sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart))[0];

  const cycle1Id = oldest.id;

  // 2) Web до/после (те же API, что использует UI): summary + users по cycle1
  async function readWebSnapshot(label) {
    await sleep(PAUSE_MS);
    const summary = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/summary/get/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ revisionsIds: [cycle1Id] }),
    });

    await sleep(PAUSE_MS);
    const users = await api(
      `${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/users/?revisionsIds=${cycle1Id}&limit=200&offset=0`,
      { headers },
    );

    const usersArr = users.data?.items || users.data || [];
    return {
      label,
      summaryStatus: summary.status,
      usersStatus: users.status,
      answersCount: Number(summary.data?.totalSummary?.answersCount || 0),
      totalCount: Number(summary.data?.totalSummary?.totalCount || 0),
      usersCount: Array.isArray(usersArr) ? usersArr.length : 0,
    };
  }

  const webBefore = await readWebSnapshot('before_feature');
  const webAfter = await readWebSnapshot('after_feature');

  const baseFilters = {
    usersIds: [],
    userGroupsIds: [],
    departmentsIds: [],
  };
  const filtersNo = { ...baseFilters, revisionsIds: [] };
  const filtersYes = { ...baseFilters, revisionsIds: [cycle1Id] };
  const userDate = userDatePlus8();

  async function exportXlsx(kind, filters, resultsWithGroups) {
    await sleep(PAUSE_MS);
    const tokenRes = await api(
      `${API_BASE}/manager/surveys/${SURVEY_ID}/export/get-token/?userDate=${encodeURIComponent(userDate)}&filters=${encodeURIComponent(JSON.stringify(filters))}&resultsWithAI=false&resultsWithGroups=${resultsWithGroups ? 'true' : 'false'}`,
      { headers },
    );

    const token = tokenRes.data?.token;
    if (!token) {
      return {
        kind,
        resultsWithGroups,
        tokenStatus: tokenRes.status,
        error: 'no_token',
      };
    }

    await sleep(PAUSE_MS);
    const dl = await fetch(`${API_BASE}/public/surveys/export/xlsx/?lang=ru&token=${token}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    const file = path.join(
      OUT_DIR,
      `${kind}_${resultsWithGroups ? 'with_groups' : 'without_groups'}.xlsx`,
    );
    await fs.writeFile(file, buf);
    const meta = parseXlsxMeta(buf);

    return {
      kind,
      resultsWithGroups,
      tokenStatus: tokenRes.status,
      downloadStatus: dl.status,
      file,
      ...meta,
    };
  }

  // 3) XLSX двух видов: без фильтров и с фильтром по 1-му циклу
  const noFilterBefore = await exportXlsx('no_filter', filtersNo, false);
  const noFilterAfter = await exportXlsx('no_filter', filtersNo, true);
  const filteredBefore = await exportXlsx('filtered_cycle1', filtersYes, false);
  const filteredAfter = await exportXlsx('filtered_cycle1', filtersYes, true);

  const result = {
    surveyId: SURVEY_ID,
    cycle1: {
      id: cycle1Id,
      alias: oldest.alias,
      dateStart: oldest.dateStart,
      dateEnd: oldest.dateEnd,
    },
    web: {
      before: webBefore,
      after: webAfter,
      same: webBefore.answersCount === webAfter.answersCount &&
        webBefore.totalCount === webAfter.totalCount &&
        webBefore.usersCount === webAfter.usersCount,
    },
    xlsx: {
      noFilter: {
        before: noFilterBefore,
        after: noFilterAfter,
        addedColumns: addedColumns(noFilterBefore.headers || [], noFilterAfter.headers || []),
      },
      filteredCycle1: {
        before: filteredBefore,
        after: filteredAfter,
        addedColumns: addedColumns(filteredBefore.headers || [], filteredAfter.headers || []),
      },
    },
  };

  const outFile = path.join(OUT_DIR, 'result.json');
  await fs.writeFile(outFile, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ outFile, result }, null, 2));
}

main().catch((e) => {
  console.error(e?.stack || e?.message || String(e));
  process.exit(1);
});

