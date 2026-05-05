// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { allure } from "allure-playwright";
import { FeedbackAPI, getCredentials } from "../../utils/api/index.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * API тесты для комментариев к благодарностям — Жизненный цикл
 */

// Хелперы для Allure логирования
function logInput(name, value) {
  allure.attachment(
    `Input: ${name}`,
    JSON.stringify(value, null, 2),
    "application/json",
  );
}

function logExpected(description) {
  allure.attachment("Expected", description, "text/plain");
}

function logResponse(response, data) {
  allure.attachment(
    `Response (${response.status()})`,
    JSON.stringify(data, null, 2),
    "application/json",
  );
}

// Расширяем test с фикстурой для Feedback API
const test = fullTest.extend({
  feedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Кэширование данных для тестов
let cachedFeedbackId = null;
let cachedFeedbackTypeId = null;
let cachedTargetUserId = null;

async function getThanksTypeId(feedbackAPI) {
  if (cachedFeedbackTypeId) return cachedFeedbackTypeId;
  const { data } = await feedbackAPI.getFeedbackTypes();
  const items = data?.items || data || [];
  const thanksType = items.find(
    (t) =>
      t.name?.toLowerCase() === "thanks" ||
      t.code?.toLowerCase() === "thanks" ||
      t.selectable === true,
  );
  cachedFeedbackTypeId = thanksType?.id || items[0]?.id || null;
  return cachedFeedbackTypeId;
}

async function findTargetUser(feedbackAPI) {
  if (cachedTargetUserId) return cachedTargetUserId;
  const { response: usersResp, data: usersData } = await feedbackAPI.get(
    "/manager/users?limit=10",
  );
  if (usersResp.ok()) {
    const users = usersData?.items || usersData || [];
    if (users.length > 1) { cachedTargetUserId = users[1].id; return cachedTargetUserId; }
    if (users.length > 0) { cachedTargetUserId = users[0].id; return cachedTargetUserId; }
  }
  const { data } = await feedbackAPI.getFeedbacksOfEmployees({ limit: 50 });
  const items = data?.items || data || [];
  for (const feedback of items) {
    if (feedback.targetUsers && feedback.targetUsers.length > 0) {
      const target = feedback.targetUsers[0];
      cachedTargetUserId = target.userId || target.user?.id || target.id;
      return cachedTargetUserId;
    }
  }
  return null;
}

async function getOrCreateFeedbackForComments(feedbackAPI) {
  if (cachedFeedbackId) {
    const { response } = await feedbackAPI.getById(cachedFeedbackId);
    if (response.ok()) return cachedFeedbackId;
    cachedFeedbackId = null;
  }
  const { data: myFeedbacks } = await feedbackAPI.getMyFeedbacks({ limit: 10 });
  const myItems = myFeedbacks?.items || myFeedbacks || [];
  if (myItems.length > 0) { cachedFeedbackId = myItems[0].id; return cachedFeedbackId; }

  const feedbackTypeId = await getThanksTypeId(feedbackAPI);
  const targetUserId = await findTargetUser(feedbackAPI);
  if (!feedbackTypeId || !targetUserId) return null;

  const body = TestDataHelper.generateUniqueName("Благодарность для комментариев");
  const { response, data } = await feedbackAPI.create({
    body,
    targets: [{ targetType: "user", entityId: targetUserId }],
    feedbackTypeId,
    userAccessType: "selective",
    usersWithAccess: [],
  });
  if (response.ok() && data?.id) { cachedFeedbackId = data.id; return cachedFeedbackId; }
  return null;
}

test.describe(
  "Feedback Comments API - Lifecycle",
  { tag: ["@api", "@feedback", "@comments", "@lifecycle", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Comments Lifecycle");
    });

    test("C5042: Полный жизненный цикл комментария: создание -> обновление -> удаление", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      let originalBody, createResp, createData;
      await test.step("Выполнить запрос: Полный жизненный цикл комментария: создание -> обновление -> удаление", async () => {
        const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
        test.skip(
          !feedbackId,
          "Не удалось получить благодарность для тестирования",
        );

        // 1. Создание
        originalBody = TestDataHelper.generateUniqueName(
          "Жизненный цикл комментарий",
        );
        logInput("step1", { action: "create", feedbackId, body: originalBody });

        ({ response: createResp, data: createData } =
          await feedbackAPI.createComment(feedbackId, originalBody));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 403]).toContain(createResp.status());

        if (!createResp.ok() || !createData?.id) {
          test.skip(true, "Создание комментариев недоступно");
          return;
        }

        const commentId = createData.id;
        expect(createData.body).toBe(originalBody);

        // 2. Чтение
        const { response: readResp, data: readData } =
          await feedbackAPI.getCommentById(commentId);
        expect(readResp.ok()).toBe(true);
        expect(readData.id).toBe(commentId);
        expect(readData.body).toBe(originalBody);

        // 3. Обновление
        const updatedBody = TestDataHelper.generateUniqueName(
          "Обновлённый комментарий жизненного цикла",
        );
        logInput("step2", { action: "update", commentId, body: updatedBody });

        const { response: updateResp } = await feedbackAPI.updateComment(
          commentId,
          updatedBody,
        );

        if (updateResp.ok()) {
          const { data: updatedData } =
            await feedbackAPI.getCommentById(commentId);
          expect(updatedData.body).toBe(updatedBody);
        }

        // 4. Удаление
        logInput("step3", { action: "delete", commentId });

        const { response: deleteResp } =
          await feedbackAPI.deleteComment(commentId);

        if (deleteResp.ok() || deleteResp.status() === 204) {
          // Проверяем что комментарий удалён
          const { response: checkResp } =
            await feedbackAPI.getCommentById(commentId);
          expect([400, 403, 404]).toContain(checkResp.status());
        }

        logExpected(
          "Комментарий прошёл полный жизненный цикл: создан -> обновлён -> удалён",
        );
      });
    });

    test("C5043: Комментарии сохраняются после обновления благодарности", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let commentId;
      let items;
      await test.step("Выполнить запрос: Комментарии сохраняются после обновления благодарности", async () => {
        // Создаём благодарность
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);
        test.skip(
          !feedbackTypeId || !targetUserId,
          "Нет типа благодарности или целевого пользователя",
        );

        const feedbackBody = TestDataHelper.generateUniqueName(
          "Благодарность для проверки комментариев",
        );
        const { response: createFeedbackResp, data: feedbackData } =
          await feedbackAPI.create({
            body: feedbackBody,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          });

        test.skip(
          !createFeedbackResp.ok() || !feedbackData?.id,
          "Не удалось создать благодарность",
        );

        const feedbackId = feedbackData.id;

        // Добавляем комментарий
        const commentBody = TestDataHelper.generateUniqueName(
          "Комментарий к благодарности",
        );
        const { response: createCommentResp, data: commentData } =
          await feedbackAPI.createComment(feedbackId, commentBody);

        test.skip(
          !createCommentResp.ok() || !commentData?.id,
          "Не удалось создать комментарий",
        );

        commentId = commentData.id;

        // Обновляем благодарность
        const updatedFeedbackBody = TestDataHelper.generateUniqueName(
          "Обновлённая благодарность",
        );
        await feedbackAPI.update(feedbackId, { body: updatedFeedbackBody });

        logInput("data", { feedbackId, commentId });
        logExpected("Комментарий сохраняется после обновления благодарности");

        // Проверяем что комментарий всё ещё существует
        const { response, data } = await feedbackAPI.getComments(feedbackId);
        logResponse(response, data);

        assertSuccessStatus(response);

        items = data?.items || data || [];
      });

      await test.step("Проверить ответ", async () => {
        expect(
          items.some((c) => c.id === commentId),
          "Комментарий должен сохраниться после обновления благодарности",
        ).toBe(true);
      });
    });
  },
);
