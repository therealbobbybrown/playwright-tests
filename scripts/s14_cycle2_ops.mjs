import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

const API_BASE = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const SURVEY_ID = Number(process.env.SURVEY_ID || 14);
const PAUSE_MS = Number(process.env.PAUSE_MS || 1500);
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TARGET_ANSWERERS = Number(process.env.TARGET_ANSWERERS || randInt(3, 4));

const CANDIDATES = [
  'qaseed@example.org',
  'qaseed+1@example.org',
  'qaseed+2@example.org',
  'qaseed+3@example.org',
  'qaseed+4@example.org',
  'qaseed+5@example.org',
  'qaseed+6@example.org',
  'qaseed+7@example.org',
];

const OUT_DIR = '/tmp/s14_cycle2';
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

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

function flattenQuestions(details) {
  const pages = details?.pages || [];
  return pages.flatMap((p) => p.questions || p.updatedQuestions || []);
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateAnswers(questions) {
  const out = {};
  for (const q of questions) {
    const id = q.id;
    const type = q.type;

    if (type === 'scale') {
      const min = q.rangeMin ?? 1;
      const max = q.rangeMax ?? 5;
      out[id] = {
        action: 'answer',
        values: [{
          value: randInt(min, max),
          isCustom: false,
          commentAnswer: null,
          cantAnswer: false,
        }],
      };
      continue;
    }

    if (type === 'singleSelect') {
      const opts = q.answerOptions || q.updatedAnswerOptions || [];
      if (opts.length) {
        out[id] = {
          action: 'answer',
          values: [{
            value: pickRandom(opts).text,
            isCustom: false,
            commentAnswer: null,
            cantAnswer: false,
          }],
        };
      }
      continue;
    }

    if (type === 'multiSelect') {
      const opts = q.answerOptions || q.updatedAnswerOptions || [];
      if (opts.length) {
        const shuffled = opts.slice().sort(() => Math.random() - 0.5);
        const pick = Math.min(opts.length, randInt(1, Math.min(3, opts.length)));
        out[id] = {
          action: 'answer',
          values: shuffled.slice(0, pick).map((x) => ({
            value: x.text,
            isCustom: false,
            commentAnswer: null,
            cantAnswer: false,
          })),
        };
      }
      continue;
    }

    if (type === 'nps') {
      out[id] = {
        action: 'answer',
        values: [{
          value: randInt(0, 10),
          isCustom: false,
          commentAnswer: null,
          cantAnswer: false,
        }],
      };
      continue;
    }

    if (type === 'shortText' || type === 'longText') {
      const texts = [
        'Есть прогресс, но хочу больше обратной связи',
        'Команда помогает быстро решать задачи',
        'Нагрузка волнами, в целом ок',
        'Нужны улучшения по процессам',
        'Коммуникация стала лучше',
      ];
      out[id] = {
        action: 'answer',
        values: [{
          value: pickRandom(texts),
          isCustom: true,
          commentAnswer: null,
          cantAnswer: false,
        }],
      };
      continue;
    }
  }
  return out;
}

function csvRowsCount(text) {
  const rows = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Math.max(0, rows.length - 1);
}

function xlsxRowsCount(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const first = String(rows?.[0]?.[0] || '');
  if (first.includes('{"statusCode":500')) return { rows: -1, error: 'xlsx_500_payload' };
  return { rows: Math.max(0, rows.length - 1), error: null };
}

async function pptxMeta(filePath) {
  const list = execFileSync('unzip', ['-Z1', filePath], { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('ppt/slides/slide') && s.endsWith('.xml'));

  let text = '';
  for (const f of list) {
    const xml = execFileSync('unzip', ['-p', filePath, f], { encoding: 'utf8' });
    const parts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
    text += parts.join(' ') + '\n';
  }

  const m = text.match(/(\d+)\s+Сотрудник(?:ов|а|и)?/i);
  return { respondents: m ? Number(m[1]) : null };
}

function currentIsoPlus8() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const pad = (n, z = 2) => String(n).padStart(z, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}+08:00`;
}

(async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const auth = await login(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!auth.data?.accessToken) throw new Error(`Admin auth failed: ${JSON.stringify(auth.data)}`);
  const h = headers(auth.data.accessToken);

  await sleep(PAUSE_MS);
  const surveyBefore = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/`, { headers: h });

  await sleep(PAUSE_MS);
  const revsBeforeRes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/revisions/?limit=50`, { headers: h });
  const revsBefore = revsBeforeRes.data?.items || [];
  const beforeIds = new Set(revsBefore.map((r) => r.id));

  if (surveyBefore.data?.status === 'active') {
    await sleep(PAUSE_MS);
    await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/stop/`, { method: 'POST', headers: h });
  }

  await sleep(PAUSE_MS);
  // "Запустить снова": всегда создаёт новый цикл (новую ревизию)
  const startRes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/start/`, {
    method: 'POST',
    headers: h,
  });

  await sleep(PAUSE_MS);
  const surveyAfterStart = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/`, { headers: h });

  await sleep(PAUSE_MS);
  const revsAfterRes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/revisions/?limit=50`, { headers: h });
  const revsAfter = revsAfterRes.data?.items || [];

  let cycle2 = revsAfter.find((r) => !beforeIds.has(r.id));
  if (!cycle2) throw new Error('start did not create a new revision');

  if (!cycle2?.alias) throw new Error('Cannot determine cycle2 revision alias');

  await sleep(PAUSE_MS);
  const detailsRes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/`, { headers: h });
  const questions = flattenQuestions(detailsRes.data);
  if (!questions.length) throw new Error('No questions found in survey details');

  const answeredBy = [];
  const failedBy = [];
  for (const email of CANDIDATES) {
    if (answeredBy.length >= TARGET_ANSWERERS) break;

    await sleep(PAUSE_MS);
    const u = await login(email, 'admin');
    if (!u.data?.accessToken) {
      failedBy.push({ email, step: 'login', status: u.status });
      continue;
    }
    const uh = headers(u.data.accessToken);

    await sleep(PAUSE_MS);
    const startRes = await api(`${API_BASE}/private/surveys/${SURVEY_ID}/${cycle2.alias}/answer/page/start/`, {
      method: 'POST',
      headers: uh,
    });

    const answers = generateAnswers(questions);

    const pageToken = startRes.data?.pageToken || startRes.data?.nextPageToken;
    let nextRes;
    if (pageToken) {
      await sleep(PAUSE_MS);
      nextRes = await api(`${API_BASE}/private/surveys/${SURVEY_ID}/${cycle2.alias}/answer/page/next/?pageToken=${encodeURIComponent(pageToken)}`, {
        method: 'POST',
        headers: uh,
        body: JSON.stringify(answers),
      });
    } else {
      // Fallback для сценариев, где API не вернул pageToken
      await sleep(PAUSE_MS);
      nextRes = await api(`${API_BASE}/private/surveys/${SURVEY_ID}/${cycle2.alias}/answer/`, {
        method: 'POST',
        headers: uh,
        body: JSON.stringify(answers),
      });
    }

    if (nextRes.ok || nextRes.status === 201) {
      answeredBy.push(email);
    } else {
      failedBy.push({ email, step: 'answer', status: nextRes.status, body: nextRes.data });
    }
  }

  await sleep(PAUSE_MS);
  const stopRes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/stop/`, { method: 'POST', headers: h });

  await sleep(PAUSE_MS);
  const statsRevsRes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/revisions/`, { headers: h });
  const statsRevs = Array.isArray(statsRevsRes.data) ? statsRevsRes.data : (statsRevsRes.data?.items || []);

  const cycle2Stats = statsRevs.find((r) => r.alias === cycle2.alias) || statsRevs.find((r) => r.id === cycle2.id) || statsRevs[0];
  const cycle2Id = cycle2Stats?.id || cycle2.id;

  await sleep(PAUSE_MS);
  const summaryRes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/statistics/summary/get/`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ revisionsIds: [cycle2Id] }),
  });

  const totalSummary = summaryRes.data?.totalSummary || {};
  const expectedAnswers = Number(totalSummary.answersCount || 0);
  const expectedTotal = Number(totalSummary.totalCount || 0);

  const userDate = currentIsoPlus8();
  const filtersAll = { revisionsIds: [], usersIds: [], userGroupsIds: [], departmentsIds: [] };
  const filtersCycle2 = { revisionsIds: [cycle2Id], usersIds: [], userGroupsIds: [], departmentsIds: [] };

  await sleep(PAUSE_MS);
  const tNo = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/export/get-token/?userDate=${encodeURIComponent(userDate)}&filters=${encodeURIComponent(JSON.stringify(filtersAll))}`, { headers: h });
  await sleep(PAUSE_MS);
  const tYes = await api(`${API_BASE}/manager/surveys/${SURVEY_ID}/export/get-token/?userDate=${encodeURIComponent(userDate)}&filters=${encodeURIComponent(JSON.stringify(filtersCycle2))}`, { headers: h });

  const getAndParse = async (key, ext, token) => {
    await sleep(PAUSE_MS);
    const res = await fetch(`${API_BASE}/public/surveys/export/${ext}/?lang=ru&token=${token}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const file = path.join(OUT_DIR, `${key}.${ext}`);
    await fs.writeFile(file, buf);

    if (ext === 'csv') return { status: res.status, file, rows: csvRowsCount(buf.toString('utf8')) };
    if (ext === 'xlsx') return { status: res.status, file, ...xlsxRowsCount(buf) };
    return { status: res.status, file, ...(await pptxMeta(file)) };
  };

  const exportsData = {
    no_feature_all_csv: await getAndParse('no_feature_all', 'csv', tNo.data?.token),
    no_feature_all_xlsx: await getAndParse('no_feature_all', 'xlsx', tNo.data?.token),
    no_feature_all_pptx: await getAndParse('no_feature_all', 'pptx', tNo.data?.token),
    with_feature_cycle2_csv: await getAndParse('with_feature_cycle2', 'csv', tYes.data?.token),
    with_feature_cycle2_xlsx: await getAndParse('with_feature_cycle2', 'xlsx', tYes.data?.token),
    with_feature_cycle2_pptx: await getAndParse('with_feature_cycle2', 'pptx', tYes.data?.token),
  };

  const result = {
    surveyId: SURVEY_ID,
    targetAnswerers: TARGET_ANSWERERS,
    startResult: {
      status: startRes.status,
      currentRevisionId: startRes.data?.currentRevision?.id,
      surveyStatus: startRes.data?.status,
    },
    stateAfterStart: surveyAfterStart.data?.status,
    cycle2: {
      id: cycle2.id,
      alias: cycle2.alias,
      statsId: cycle2Id,
      dateStart: cycle2Stats?.dateStart,
      dateEnd: cycle2Stats?.dateEnd,
      expectedTotal,
      expectedAnswers,
    },
    respondents: { answeredBy, failedBy },
    stopResult: { status: stopRes.status, body: stopRes.data },
    consistency: {
      cycle2_filtered: {
        csvRows: exportsData.with_feature_cycle2_csv.rows,
        xlsxRows: exportsData.with_feature_cycle2_xlsx.rows,
        pptxRespondents: exportsData.with_feature_cycle2_pptx.respondents,
        pass:
          exportsData.with_feature_cycle2_csv.rows === expectedAnswers &&
          exportsData.with_feature_cycle2_xlsx.rows === expectedAnswers &&
          exportsData.with_feature_cycle2_pptx.respondents === expectedAnswers,
      },
      no_filter_mix: {
        csvRows: exportsData.no_feature_all_csv.rows,
        xlsxRows: exportsData.no_feature_all_xlsx.rows,
        pptxRespondents: exportsData.no_feature_all_pptx.respondents,
      },
    },
    exportsData,
  };

  const outFile = path.join(OUT_DIR, 'result.json');
  await fs.writeFile(outFile, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ outFile, result }, null, 2));
})();
