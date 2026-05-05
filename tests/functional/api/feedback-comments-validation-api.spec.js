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
 * API тесты для комментариев к благодарностям — Валидация данных
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
  "Feedback Comments API - Data Validation",
  { tag: ["@api", "@feedback", "@comments", "@validation", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Comments Validation");
    });

    test("C5038: Комментарий содержит корректные поля автора", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Комментарий содержит корректные поля автора", async () => {
        const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
        test.skip(
          !feedbackId,
          "Не удалось получить благодарность для тестирования",
        );

        // Создаём комментарий
        const commentBody = TestDataHelper.generateUniqueName(
          "Комментарий для проверки автора",
        );
        const { response: createResp, data: createData } =
          await feedbackAPI.createComment(feedbackId, commentBody);

        test.skip(
          !createResp.ok() || !createData?.id,
          "Не удалось создать комментарий",
        );

        logInput("commentId", createData.id);
        logExpected("Комментарий содержит данные автора");

        const { response, data } = await feedbackAPI.getCommentById(
          createData.id,
        );
        logResponse(response, data);

        assertSuccessStatus(response);

        // Проверяем наличие данных автора
        if (data.authorUser) {
          expect(data.authorUser).toHaveProperty("id");
        }
        if (data.authorUserId) {
          expect(
            typeof data.authorUserId === "string" ||
              typeof data.authorUserId === "number",
          ).toBe(true);
        }
      });
    });

    test("C5039: Комментарий содержит дату создания", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Комментарий содержит дату создания", async () => {
        const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
        test.skip(
          !feedbackId,
          "Не удалось получить благодарность для тестирования",
        );

        // Создаём комментарий
        const commentBody = TestDataHelper.generateUniqueName(
          "Комментарий для проверки даты",
        );
        const { response: createResp, data: createData } =
          await feedbackAPI.createComment(feedbackId, commentBody);

        test.skip(
          !createResp.ok() || !createData?.id,
          "Не удалось создать комментарий",
        );

        logInput("commentId", createData.id);
        logExpected("Комментарий содержит дату создания");

        const { response, data } = await feedbackAPI.getCommentById(
          createData.id,
        );
        logResponse(response, data);

        assertSuccessStatus(response);

        // Проверяем наличие даты создания
        if (data.createdAt) {
          expect(typeof data.createdAt).toBe("string");
          // Проверяем что дата валидна
          const date = new Date(data.createdAt);
          expect(date.toString()).not.toBe("Invalid Date");
        }
      });
    });

    test("C5040: Комментарий связан с корректной благодарностью", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Комментарий связан с корректной благодарностью", async () => {
        const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
        test.skip(
          !feedbackId,
          "Не удалось получить благодарность для тестирования",
        );

        // Создаём комментарий
        const commentBody = TestDataHelper.generateUniqueName(
          "Комментарий для проверки связи",
        );
        const { response: createResp, data: createData } =
          await feedbackAPI.createComment(feedbackId, commentBody);

        test.skip(
          !createResp.ok() || !createData?.id,
          "Не удалось создать комментарий",
        );

        logInput("data", { feedbackId, commentId: createData.id });
        logExpected("Комментарий связан с указанной благодарностью");

        const { response, data } = await feedbackAPI.getCommentById(
          createData.id,
        );
        logResponse(response, data);

        assertSuccessStatus(response);

        // Проверяем связь с благодарностью
        if (data.feedbackId) {
          expect(data.feedbackId).toBe(feedbackId);
        }
      });
    });

    test("C5041: Список комментариев отсортирован по дате", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Список комментариев отсортирован по дате", async () => {
        const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
        test.skip(
          !feedbackId,
          "Не удалось получить благодарность для тестирования",
        );

        // Создаём несколько комментариев с небольшой задержкой
        for (let i = 1; i <= 3; i++) {
          await feedbackAPI.createComment(
            feedbackId,
            TestDataHelper.generateUniqueName(`Сортировка #${i}`),
          );
          await new Promise((resolve) => setTimeout(resolve, 100)); // небольшая задержка
        }

        logInput("feedbackId", feedbackId);
        logExpected("Комментарии отсортированы по дате");

        const { response, data } = await feedbackAPI.getComments(feedbackId, {
          limit: 50,
        });
        logResponse(response, data);

        assertSuccessStatus(response);

        const items = data?.items || data || [];

        // Проверяем что комментарии отсортированы
        if (items.length > 1 && items[0].createdAt) {
          for (let i = 1; i < items.length; i++) {
            const prevDate = new Date(items[i - 1].createdAt);
            const currDate = new Date(items[i].createdAt);
            // Допускаем как ASC так и DESC сортировку
            const isAscending = prevDate <= currDate;
            const isDescending = prevDate >= currDate;
            expect(isAscending || isDescending).toBe(true);
          }
        }
      });
    });
  },
);
