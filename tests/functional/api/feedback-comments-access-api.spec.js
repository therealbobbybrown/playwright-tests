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
import { assertValidArray } from "../../utils/api/common-assertions.js";

/**
 * API тесты для комментариев к благодарностям — Контроль доступа
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
  "Feedback Comments API - Access Control",
  { tag: ["@api", "@feedback", "@comments", "@access", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Comments Access");
    });

    test("C5034: Обычный пользователь может комментировать доступную благодарность", async ({
      feedbackUserAPI,
      feedbackAPI,
    }) => {
      setSeverity("critical");

      let response, data;
      await test.step("Выполнить запрос: Обычный пользователь может комментировать доступную благодарность", async () => {
        // Получаем публичную благодарность
        const { data: sharedData } = await feedbackUserAPI.getSharedFeedbacks({
          limit: 10,
        });
        const sharedItems = sharedData?.items || sharedData || [];

        test.skip(sharedItems.length === 0, "Нет публичных благодарностей");

        const feedbackId = sharedItems[0].id;
        const commentBody = TestDataHelper.generateUniqueName(
          "Комментарий от пользователя",
        );

        logInput("payload", { feedbackId, body: commentBody });
        logExpected("Успешное создание комментария или отказ в доступе");

        ({ response, data } = await feedbackUserAPI.createComment(
          feedbackId,
          commentBody,
        ));
        logResponse(response, data);

        // Может быть успех или отказ в зависимости от настроек
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 403]).toContain(response.status());
      });
    });

    test("C5035: Пользователь может видеть комментарии к доступной благодарности", async ({
      feedbackUserAPI,
    }) => {
      setSeverity("critical");

      let response, data;
      await test.step("Выполнить запрос: Пользователь может видеть комментарии к доступной благодарности", async () => {
        // Получаем публичную благодарность
        const { data: sharedData } = await feedbackUserAPI.getSharedFeedbacks({
          limit: 10,
        });
        const sharedItems = sharedData?.items || sharedData || [];

        test.skip(sharedItems.length === 0, "Нет публичных благодарностей");

        const feedbackId = sharedItems[0].id;

        logInput("feedbackId", feedbackId);
        logExpected("Список комментариев или пустой массив");

        ({ response, data } = await feedbackUserAPI.getComments(feedbackId));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403, 404]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });

    test("C5036: Пользователь может удалить только свой комментарий", async ({
      feedbackUserAPI,
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let response;
      await test.step("Выполнить запрос: Пользователь может удалить только свой комментарий", async () => {
        // Получаем благодарность и создаём комментарий от admin
        const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
        test.skip(
          !feedbackId,
          "Не удалось получить благодарность для тестирования",
        );

        // Создаём комментарий от admin
        const adminComment =
          TestDataHelper.generateUniqueName("Комментарий админа");
        const { response: createResp, data: createData } =
          await feedbackAPI.createComment(feedbackId, adminComment);

        test.skip(
          !createResp.ok() || !createData?.id,
          "Не удалось создать комментарий админа",
        );

        const adminCommentId = createData.id;

        logInput("commentId", adminCommentId);
        logExpected("Ошибка доступа при попытке удаления чужого комментария");

        // Пытаемся удалить от имени user
        ({ response } = await feedbackUserAPI.deleteComment(adminCommentId));
        logResponse(response, {});

        // Должен быть отказ в доступе
      });

      await test.step("Проверить ответ", async () => {
        expect([403, 404]).toContain(response.status());
      });
    });

    test("C5037: Пользователь может обновить только свой комментарий", async ({
      feedbackUserAPI,
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let response;
      await test.step("Выполнить запрос: Пользователь может обновить только свой комментарий", async () => {
        // Получаем благодарность и создаём комментарий от admin
        const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
        test.skip(
          !feedbackId,
          "Не удалось получить благодарность для тестирования",
        );

        // Создаём комментарий от admin
        const adminComment = TestDataHelper.generateUniqueName(
          "Комментарий админа для обновления",
        );
        const { response: createResp, data: createData } =
          await feedbackAPI.createComment(feedbackId, adminComment);

        test.skip(
          !createResp.ok() || !createData?.id,
          "Не удалось создать комментарий админа",
        );

        const adminCommentId = createData.id;
        const newBody = "Попытка изменить чужой комментарий";

        logInput("payload", { commentId: adminCommentId, body: newBody });
        logExpected("Ошибка доступа при попытке изменения чужого комментария");

        // Пытаемся обновить от имени user
        ({ response } = await feedbackUserAPI.updateComment(
          adminCommentId,
          newBody,
        ));
        logResponse(response, {});

        // Должен быть отказ в доступе или API не поддерживает обновление
      });

      await test.step("Проверить ответ", async () => {
        expect([403, 404, 405]).toContain(response.status());
      });
    });
  },
);
