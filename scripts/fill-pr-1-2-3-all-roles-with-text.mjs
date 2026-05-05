import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";

const API_BASE = process.env.API_BASE_URL || "https://api.st7.apprs.ru";
const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const USER_PASSWORD = process.env.TEST_USER_PASSWORD || "admin";
const PR_IDS = [1, 2, 3];
const PAUSE_MS = Number(process.env.PAUSE_MS || 1500);
const OUT_FILE = process.env.OUT_FILE || "/tmp/fill_pr_1_2_3_result.json";

const TEXT_PHRASES = [
  "Сильная вовлеченность, отличная коммуникация.",
  "Регулярно помогает команде и держит фокус на результате.",
  "Есть хороший потенциал роста в лидерских навыках.",
  "Качественно ведет задачи и соблюдает сроки.",
  "Полезно усилить проактивность в сложных ситуациях.",
  "Коллега открыт к обратной связи и быстро адаптируется.",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomText() {
  const phrase = TEXT_PHRASES[randomInt(0, TEXT_PHRASES.length - 1)];
  const suffix = ` [${Date.now()}-${randomInt(100, 999)}]`;
  return phrase + suffix;
}

function extractQuestionsFromPageData(pageData) {
  const out = [];
  if (Array.isArray(pageData?.questions)) out.push(...pageData.questions);
  if (Array.isArray(pageData?.assessment?.pages)) {
    for (const p of pageData.assessment.pages) {
      if (Array.isArray(p?.questions)) out.push(...p.questions);
    }
  }
  if (Array.isArray(pageData?.page?.questions)) out.push(...pageData.page.questions);
  if (Array.isArray(pageData?.page?.items)) out.push(...pageData.page.items);
  return out;
}

function dedupeQuestions(questions) {
  const map = new Map();
  for (const q of questions) {
    const qid = q?.id ?? q?.temporaryId ?? q?.questionId;
    if (!qid) continue;
    if (!map.has(String(qid))) map.set(String(qid), q);
  }
  return [...map.values()];
}

async function collectAllQuestions(userAPI, prId, revisionAlias, revisionUserId) {
  const allQuestions = [];
  const { response: startResp, data: startData } = await userAPI.get(
    `/private/performance-reviews/${prId}/${revisionAlias}/${revisionUserId}/answer/page/start`,
  );

  if (!startResp.ok()) {
    return { ok: false, status: startResp.status(), questions: [] };
  }

  allQuestions.push(...extractQuestionsFromPageData(startData));
  let pageToken = startData?.nextPageToken;
  let guard = 0;

  while (pageToken && guard < 30) {
    guard += 1;
    const { response: nextResp, data: nextData } = await userAPI.post(
      `/private/performance-reviews/${prId}/${revisionAlias}/${revisionUserId}/answer/page/next`,
      { pageToken },
    );

    if (!nextResp.ok()) break;
    allQuestions.push(...extractQuestionsFromPageData(nextData));
    pageToken = nextData?.nextPageToken;
    if (nextData?.isLast === true) break;
    await sleep(PAUSE_MS);
  }

  return { ok: true, status: startResp.status(), questions: dedupeQuestions(allQuestions) };
}

function pickSingleOption(options) {
  if (!Array.isArray(options) || options.length === 0) return null;
  const idx = randomInt(0, options.length - 1);
  return options[idx]?.id ?? null;
}

function pickMultiOptions(options) {
  if (!Array.isArray(options) || options.length === 0) return [];
  const count = Math.min(options.length, randomInt(1, Math.min(3, options.length)));
  const shuffled = [...options].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((o) => o?.id).filter(Boolean);
}

function buildAnswerForQuestion(q) {
  const type = String(q?.type || q?.questionType || "").toLowerCase();
  const options = q?.answerOptions || q?.updatedAnswerOptions || [];

  if (type.includes("shorttext") || type.includes("longtext") || type === "text" || type.includes("textarea") || type.includes("comment")) {
    return { value: randomText() };
  }

  if (type.includes("single")) {
    const selected = pickSingleOption(options);
    if (selected) return { selectedIds: [selected] };
  }

  if (type.includes("multi")) {
    const selected = pickMultiOptions(options);
    if (selected.length > 0) return { selectedIds: selected };
  }

  if (type.includes("nps")) {
    return { value: randomInt(7, 10) };
  }

  if (type.includes("scale") || type.includes("rating") || type.includes("competence")) {
    return { value: randomInt(3, 5) };
  }

  if (Array.isArray(options) && options.length > 0) {
    const selected = pickSingleOption(options);
    if (selected) return { selectedIds: [selected] };
  }

  return { value: randomInt(3, 5) };
}

function buildAnswersMap(questions) {
  const answers = {};
  for (const q of questions) {
    const qid = q?.id ?? q?.temporaryId ?? q?.questionId;
    if (!qid) continue;
    answers[qid] = buildAnswerForQuestion(q);
  }
  return answers;
}

function isAlreadyDone(response, body) {
  const text = String(body || "");
  return response?.status?.() === 400 && /already|completed|answered|done/i.test(text);
}

async function fillOneRevisionUser({ userAPI, prId, revisionAlias, revisionUserId }) {
  const qRes = await collectAllQuestions(userAPI, prId, revisionAlias, revisionUserId);
  if (!qRes.ok) {
    return {
      status: "questions_failed",
      startStatus: qRes.status,
      questions: 0,
      textQuestions: 0,
    };
  }

  const questions = qRes.questions || [];
  const textQuestions = questions.filter((q) => {
    const t = String(q?.type || q?.questionType || "").toLowerCase();
    return t.includes("shorttext") || t.includes("longtext") || t === "text" || t.includes("textarea") || t.includes("comment");
  }).length;

  if (questions.length === 0) {
    return { status: "no_questions", questions: 0, textQuestions: 0 };
  }

  const answers = buildAnswersMap(questions);
  const { response: submitResp } = await userAPI.post(
    `/private/performance-reviews/${prId}/${revisionAlias}/${revisionUserId}/answer`,
    { answers, isCompleted: true },
  );

  if (submitResp.ok()) {
    return { status: "filled", submitStatus: submitResp.status(), questions: questions.length, textQuestions };
  }

  const body = await submitResp.text().catch(() => "");
  if (isAlreadyDone(submitResp, body)) {
    return { status: "already_completed", submitStatus: submitResp.status(), questions: questions.length, textQuestions };
  }

  return {
    status: "submit_failed",
    submitStatus: submitResp.status(),
    submitBody: String(body).slice(0, 300),
    questions: questions.length,
    textQuestions,
  };
}

async function fillPR(prId, adminAPI) {
  const result = {
    prId,
    revisionAlias: null,
    usersTotal: 0,
    usersAuthed: 0,
    revisionUsersTotal: 0,
    filled: 0,
    alreadyCompleted: 0,
    failed: 0,
    withTextQuestions: 0,
    byUser: [],
  };

  const { data: rev } = await adminAPI.getLastRevision(prId);
  const revisionAlias = rev?.alias || String(rev?.id);
  result.revisionAlias = revisionAlias;

  const { data: recData } = await adminAPI.getReceiverUsers(prId, { limit: 500 });
  const receivers = recData?.items || [];
  const emails = [...new Set(receivers.map((r) => r?.user?.account?.email).filter(Boolean))];
  result.usersTotal = emails.length;

  for (const email of emails) {
    const userCtx = await request.newContext({ baseURL: API_BASE, timeout: 90000 });
    const userAPI = new PerformanceReviewAPI(userCtx);
    const userRow = { email, authStatus: null, revisionUsers: 0, filled: 0, alreadyCompleted: 0, failed: 0, details: [] };

    try {
      const { response: authResp } = await userAPI.signIn(email, USER_PASSWORD);
      userRow.authStatus = authResp.status();

      if (!authResp.ok()) {
        userRow.failed += 1;
        result.failed += 1;
        result.byUser.push(userRow);
        await userCtx.dispose();
        await sleep(PAUSE_MS);
        continue;
      }

      result.usersAuthed += 1;
      const { data: ruData, response: ruResp } = await userAPI.get(
        `/private/performance-reviews/${prId}/${revisionAlias}/revision-users`,
      );

      if (!ruResp.ok()) {
        userRow.failed += 1;
        result.failed += 1;
        result.byUser.push(userRow);
        await userCtx.dispose();
        await sleep(PAUSE_MS);
        continue;
      }

      const items = ruData?.items || ruData || [];
      userRow.revisionUsers = items.length;
      result.revisionUsersTotal += items.length;

      for (const it of items) {
        const revisionUserId = it?.id;
        const status = it?.response?.status;
        if (!revisionUserId) continue;

        if (status === "complete") {
          userRow.alreadyCompleted += 1;
          result.alreadyCompleted += 1;
          continue;
        }

        const filledRow = await fillOneRevisionUser({
          userAPI,
          prId,
          revisionAlias,
          revisionUserId,
        });

        userRow.details.push({ revisionUserId, ...filledRow });

        if (filledRow.textQuestions > 0) {
          result.withTextQuestions += 1;
        }

        if (filledRow.status === "filled") {
          userRow.filled += 1;
          result.filled += 1;
        } else if (filledRow.status === "already_completed") {
          userRow.alreadyCompleted += 1;
          result.alreadyCompleted += 1;
        } else {
          userRow.failed += 1;
          result.failed += 1;
        }

        await sleep(PAUSE_MS);
      }

      result.byUser.push(userRow);
      await userCtx.dispose();
      await sleep(PAUSE_MS);
    } catch (e) {
      userRow.error = e?.message || String(e);
      userRow.failed += 1;
      result.failed += 1;
      result.byUser.push(userRow);
      await userCtx.dispose().catch(() => {});
      await sleep(PAUSE_MS);
    }
  }

  return result;
}

async function main() {
  if (!ADMIN_LOGIN || !ADMIN_PASSWORD) {
    throw new Error("ADMIN_LOGIN/ADMIN_PASSWORD are required");
  }

  const adminCtx = await request.newContext({ baseURL: API_BASE, timeout: 90000 });
  const adminAPI = new PerformanceReviewAPI(adminCtx);

  const { response: authResp } = await adminAPI.signIn(ADMIN_LOGIN, ADMIN_PASSWORD);
  if (!authResp.ok()) {
    throw new Error(`Admin auth failed: ${authResp.status()}`);
  }

  const summary = {
    startedAt: new Date().toISOString(),
    apiBase: API_BASE,
    prIds: PR_IDS,
    pauseMs: PAUSE_MS,
    results: [],
  };

  for (const prId of PR_IDS) {
    // one-thread processing
    const r = await fillPR(prId, adminAPI);
    summary.results.push(r);
    await sleep(PAUSE_MS);
  }

  summary.finishedAt = new Date().toISOString();
  await adminCtx.dispose();

  const fs = await import("node:fs/promises");
  await fs.writeFile(OUT_FILE, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nSaved: ${OUT_FILE}`);
}

main().catch((e) => {
  console.error("ERROR:", e?.message || e);
  process.exit(1);
});
