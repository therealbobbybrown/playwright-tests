import "dotenv/config";
import { request as playwrightRequest } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";

const log = (msg) => process.stderr.write(msg + "\n");

async function getQuestionsFromPages(userAPI, prId, revAlias, ruId) {
  const allQuestions = [];

  // Fetch start page
  const { data: startData } = await userAPI.get(
    `/private/performance-reviews/${prId}/${revAlias}/${ruId}/answer/page/start`,
  );

  // Check if already completed
  if (startData?.userResponse?.isCompleted) {
    log("    Already completed");
    return [];
  }

  let pageToken = startData?.nextPageToken;
  let pageNum = 0;

  while (pageToken) {
    pageNum++;
    const { response: pageResp, data: pageData } = await userAPI.post(
      `/private/performance-reviews/${prId}/${revAlias}/${ruId}/answer/page/next`,
      { pageToken },
    );

    if (!pageResp.ok()) {
      log("    Page " + pageNum + " failed: " + pageResp.status());
      break;
    }

    // Extract questions from this page
    const page = pageData?.page || pageData;
    const questions = page?.questions || page?.items || [];
    log("    Page " + pageNum + ": " + questions.length + " questions");

    for (const q of questions) {
      allQuestions.push(q);
    }

    // Next page
    pageToken = pageData?.nextPageToken;
    if (pageData?.isLast) break;
  }

  return allQuestions;
}

function generateAnswers(questions) {
  const answers = [];
  for (const q of questions) {
    const qId = q.id || q.questionId;
    const qType = q.type || q.questionType;

    if (qType === "competence" || qType === "scale" || qType === "rating") {
      // Score 4 out of 5 (80%)
      answers.push({ questionId: qId, value: 4 });
    } else if (qType === "text" || qType === "textarea") {
      answers.push({ questionId: qId, value: "Тестовый ответ" });
    } else {
      // Try numeric for unknown types
      answers.push({ questionId: qId, value: 4 });
    }
  }
  return answers;
}

const main = async () => {
  const ctx = await playwrightRequest.newContext({
    baseURL: process.env.BASE_URL,
  });
  const api = new PerformanceReviewAPI(ctx);
  await api.signIn(process.env.ADMIN_LOGIN, process.env.ADMIN_PASSWORD);

  const prId = 8588;
  const { data: rev } = await api.getLastRevision(prId);
  const revAlias = rev?.alias || String(rev?.id);
  log("Revision: " + revAlias);

  const { data: recData } = await api.getReceiverUsers(prId, { limit: 100 });
  const receivers = recData?.items || [];
  const testPassword = process.env.TEST_USER_PASSWORD;
  log(
    "Receivers: " +
      receivers.length +
      ", testPassword: " +
      (testPassword ? "set" : "NOT SET"),
  );

  for (const receiver of receivers) {
    const email = receiver.user?.account?.email;
    const userId = receiver.userId || receiver.user?.id;
    log("\nReceiver: " + email + " (uid=" + userId + ")");

    const userCtx = await playwrightRequest.newContext({
      baseURL: process.env.BASE_URL,
    });
    const userAPI = new PerformanceReviewAPI(userCtx);
    const { response: authResp } = await userAPI.signIn(email, testPassword);

    if (!authResp.ok()) {
      log("  Auth failed: " + authResp.status());
      await userCtx.dispose();
      continue;
    }
    log("  Auth: OK");

    const { data: myRU } = await userAPI.get(
      "/private/performance-reviews/" +
        prId +
        "/" +
        revAlias +
        "/revision-users",
    );
    const myItems = myRU?.items || myRU || [];
    log("  Revision users: " + myItems.length);

    for (const ru of myItems) {
      const ruId = ru.id || ru.revisionUserId;
      const dir = ru.direction?.receiverType || ru.directionType || "N/A";
      log("  RU " + ruId + " dir=" + dir);

      const questions = await getQuestionsFromPages(
        userAPI,
        prId,
        revAlias,
        ruId,
      );
      log("  Total questions: " + questions.length);

      if (questions.length > 0) {
        log(
          "  Question types: " +
            [
              ...new Set(
                questions.map((q) => q.type || q.questionType || "unknown"),
              ),
            ].join(", "),
        );
        log("  Sample: " + JSON.stringify(questions[0]).substring(0, 200));
      }

      const answers = generateAnswers(questions);
      log("  Generated answers: " + answers.length);

      if (answers.length > 0) {
        const { response: subResp } = await userAPI.post(
          `/private/performance-reviews/${prId}/${revAlias}/${ruId}/answer`,
          { answers, isCompleted: true },
        );
        log("  Submit: " + subResp.status());
        if (!subResp.ok()) {
          const body = await subResp.text().catch(() => "");
          log("  Submit body: " + body.substring(0, 300));
        }
      }
    }

    await userCtx.dispose();
  }

  // Check scores after filling
  const { data: counts } = await api.getUsersCounts(prId);
  log("\nCounts after: " + JSON.stringify(counts));

  // Check dashboard
  const { data: dashboard } = await api.getDashboard(prId, {
    revisionId: rev?.id,
    usersQuery: {},
  });
  const users = dashboard?.items || dashboard?.users || [];
  log("Dashboard users: " + users.length);
  for (const u of users.slice(0, 5)) {
    const score = u.totalScore ?? u.score ?? u.calculatedTotalScore;
    log("  " + (u.user?.firstName || "N/A") + ": totalScore=" + score);
  }

  await ctx.dispose();
};
main().catch((e) => log("ERR: " + e.message));
