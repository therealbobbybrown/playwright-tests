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
import {
  assertSuccessStatus,
  assertValidArray,
} from "../../utils/api/common-assertions.js";

/**
 * API тесты для комментариев к благодарностям — Пагинация
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
  "Feedback Comments API - Pagination",
  { tag: ["@api", "@feedback", "@comments", "@pagination", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Comments Pagination");
    });

    test("C5029: Пагинация: limit ограничивает количество результатов", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let items;
      await test.step("Выполнить запрос: Пагинация: limit ограничивает количество результатов", async () => {
        const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
        test.skip(
          !feedbackId,
          "Не удалось получить благодарность для тестирования",
        );

        // Создаём несколько комментариев
        for (let i = 1; i <= 5; i++) {
          await feedbackAPI.createComment(
            feedbackId,
            TestDataHelper.generateUniqueName(`Комментарий пагинации #${i}`),
          );
        }

        const params = { limit: 3 };
        logInput("params", { feedbackId, ...params });
        logExpected("Не более 3 комментариев");

        const { response, data } = await feedbackAPI.getComments(
          feedbackId,
          params,
        );
        logResponse(response, data);

        assertSuccessStatus(response);

        items = data?.items || data || [];
      });

      await test.step("Проверить ответ", async () => {
        expect(items.length).toBeLessThanOrEqual(3);
      });
    });

    test("C5030: Пагинация: offset пропускает первые записи", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Пагинация: offset пропускает первые записи", async () => {
        const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
        test.skip(
          !feedbackId,
          "Не удалось получить благодарность для тестирования",
        );

        // Получаем все комментарии
        const { data: allData } = await feedbackAPI.getComments(feedbackId, {
          limit: 100,
        });
        const allItems = allData?.items || allData || [];

        if (allItems.length < 3) {
          test.skip(true, "Недостаточно комментариев для теста пагинации");
          return;
        }

        // Получаем с offset
        const params = { limit: 10, offset: 2 };
        logInput("params", { feedbackId, ...params });
        logExpected("Комментарии начиная с 3-го");

        const { response, data } = await feedbackAPI.getComments(
          feedbackId,
          params,
        );
        logResponse(response, data);

        assertSuccessStatus(response);

        const items = data?.items || data || [];
        // ID первого элемента с offset должен быть третьим из полного списка
        if (items.length > 0 && allItems.length > 2) {
          expect(items[0].id).toBe(allItems[2].id);
        }
      });
    });

    test("C5031: Пагинация: большой offset возвращает пустой массив", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      let items;
      await test.step("Выполнить запрос: Пагинация: большой offset возвращает пустой массив", async () => {
        const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
        test.skip(
          !feedbackId,
          "Не удалось получить благодарность для тестирования",
        );

        const params = { limit: 10, offset: 999999 };
        logInput("params", { feedbackId, ...params });
        logExpected("Пустой массив комментариев");

        const { response, data } = await feedbackAPI.getComments(
          feedbackId,
          params,
        );
        logResponse(response, data);

        assertSuccessStatus(response);

        items = data?.items || data || [];
      });

      await test.step("Проверить ответ", async () => {
        expect(items.length).toBe(0);
      });
    });

    test("C5032: Пагинация: limit=0 возвращает все или ошибку", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      let response, data;
      await test.step("Выполнить запрос: Пагинация: limit=0 возвращает все или ошибку", async () => {
        const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
        test.skip(
          !feedbackId,
          "Не удалось получить благодарность для тестирования",
        );

        const params = { limit: 0 };
        logInput("params", { feedbackId, ...params });
        logExpected("Все комментарии или ошибка валидации");

        ({ response, data } = await feedbackAPI.getComments(
          feedbackId,
          params,
        ));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 400]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });

    test("C4770: Пагинация: последовательные страницы не пересекаются", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let feedbackId, resp1, data1;
      await test.step("Выполнить запрос: Пагинация: последовательные страницы не пересекаются", async () => {
        feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
        test.skip(
          !feedbackId,
          "Не удалось получить благодарность для тестирования",
        );

        // Получаем первую страницу
        ({ response: resp1, data: data1 } = await feedbackAPI.getComments(
          feedbackId,
          {
            limit: 3,
            offset: 0,
          },
        ));
      });

      await test.step("Проверить ответ", async () => {
        expect(resp1.ok()).toBe(true);
        const items1 = data1?.items || data1 || [];

        if (items1.length < 3) {
          test.skip(true, "Недостаточно комментариев для теста");
          return;
        }

        // Получаем вторую страницу
        const { response: resp2, data: data2 } = await feedbackAPI.getComments(
          feedbackId,
          {
            limit: 3,
            offset: 3,
          },
        );

        expect(resp2.ok()).toBe(true);
        const items2 = data2?.items || data2 || [];

        // ID из второй страницы не должны быть на первой
        const ids1 = items1.map((c) => c.id);
        for (const comment of items2) {
          expect(ids1).not.toContain(comment.id);
        }

        logInput("pages", {
          page1Ids: ids1,
          page2Ids: items2.map((c) => c.id),
        });
        logExpected("Никаких пересечений между страницами");
      });
    });
  },
);
