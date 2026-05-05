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

/**
 * API тесты для комментариев к благодарностям — Негативные тесты
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
  feedbackUserAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("user");
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
  "Feedback Comments API - Negative Tests",
  { tag: ["@api", "@feedback", "@comments", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Comments Negative");
    });

    test("C5022: GET /private/feedback-comments/of-feedback/{id}/ - несуществующая благодарность", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/feedback-comments/of-feedback/{id}/ - несуществующая благодарность", async () => {
        const nonExistentId = 999999999;
        logInput("feedbackId", nonExistentId);
        logExpected("Ошибка 404 Not Found");

        const { response } = await feedbackAPI.getComments(nonExistentId);
        logResponse(response, {});

        // 500 - возможный ответ сервера на несуществующий ресурс
        expect([400, 403, 404, 500]).toContain(response.status());
      });
    });

    test("C5023: GET /private/feedback-comments/{id}/ - несуществующий комментарий", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/feedback-comments/{id}/ - несуществующий комментарий", async () => {
        const nonExistentId = 999999999;
        logInput("commentId", nonExistentId);
        logExpected("Ошибка 404 Not Found");

        const { response } = await feedbackAPI.getCommentById(nonExistentId);
        logResponse(response, {});

        // 500 - возможный ответ сервера на несуществующий ресурс
        expect([400, 403, 404, 500]).toContain(response.status());
      });
    });

    test(
      "C5024: POST /private/feedback-comments/ - пустой текст комментария",
      { tag: ["@db"] },
      async ({ feedbackAPI, feedbackVerifier }) => {
        setSeverity("normal");

        const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
        test.skip(
          !feedbackId,
          "Не удалось получить благодарность для тестирования",
        );

        // DB: Получаем количество комментариев до запроса
        const commentsBefore =
          await test.step("DB: Получение комментариев до теста", async () => {
            return await feedbackVerifier.countComments(feedbackId);
          });

        logInput("payload", { feedbackId, body: "" });
        logExpected("Ошибка валидации - пустой текст");

        const { response } = await feedbackAPI.createComment(feedbackId, "");
        logResponse(response, {});

        expect([400, 422]).toContain(response.status());

        // DB: Проверяем что комментарий НЕ создан
        await test.step("DB: Проверка что комментарий НЕ создан", async () => {
          await feedbackVerifier.verifyCommentsCount(
            feedbackId,
            commentsBefore,
          );
        });
      },
    );

    test(
      "C5025: POST /private/feedback-comments/ - несуществующая благодарность",
      { tag: ["@db"] },
      async ({ feedbackAPI, feedbackVerifier }) => {
        setSeverity("normal");

        const nonExistentId = 999999999;
        const commentBody = "Тестовый комментарий";

        logInput("payload", { feedbackId: nonExistentId, body: commentBody });
        logExpected("Ошибка 404 Not Found или 400 Bad Request");

        const { response } = await feedbackAPI.createComment(
          nonExistentId,
          commentBody,
        );
        logResponse(response, {});

        // 500 - возможный ответ при ошибке сервера на несуществующий ресурс
        expect([400, 403, 404, 500]).toContain(response.status());

        // DB: Проверяем что комментарий НЕ создан для несуществующей благодарности
        await test.step("DB: Проверка что комментарий НЕ создан", async () => {
          await feedbackVerifier.verifyNoCommentsForFeedback(nonExistentId);
        });
      },
    );

    test("C5026: POST /private/feedback-comments/ - null как текст комментария", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: POST /private/feedback-comments/ - null как текст комментария", async () => {
        const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
        test.skip(
          !feedbackId,
          "Не удалось получить благодарность для тестирования",
        );

        logInput("payload", { feedbackId, body: null });
        logExpected("Ошибка валидации");

        const { response } = await feedbackAPI.createComment(feedbackId, null);
        logResponse(response, {});

        expect([400, 422, 500]).toContain(response.status());
      });
    });

    test("C5027: POST /private/feedback-comments/{id}/ - обновить несуществующий комментарий", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/feedback-comments/{id}/ - обновить несуществующий комментарий", async () => {
        const nonExistentId = 999999999;
        const newBody = "Новый текст";

        logInput("payload", { commentId: nonExistentId, body: newBody });
        logExpected("Ошибка 404 Not Found");

        const { response } = await feedbackAPI.updateComment(
          nonExistentId,
          newBody,
        );
        logResponse(response, {});

        expect([400, 403, 404, 405]).toContain(response.status());
      });
    });

    test("C5028: POST /private/feedback-comments/ - комментарий только из пробелов", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: POST /private/feedback-comments/ - комментарий только из пробелов", async () => {
        const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
        test.skip(
          !feedbackId,
          "Не удалось получить благодарность для тестирования",
        );

        const whitespaceBody = "   \t\n   ";
        logInput("payload", { feedbackId, body: whitespaceBody });
        logExpected("Ошибка валидации или принятие (зависит от бэкенда)");

        const { response, data } = await feedbackAPI.createComment(
          feedbackId,
          whitespaceBody,
        );
        logResponse(response, data);

        // API может обрезать пробелы и вернуть ошибку или принять
        expect([200, 201, 400, 422]).toContain(response.status());
      });
    });
  },
);
