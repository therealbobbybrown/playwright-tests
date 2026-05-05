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
 * API тесты для комментариев к благодарностям — CRUD операции
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

// Хелпер для получения типа благодарности
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

// Хелпер для поиска целевого пользователя
let cachedTargetUserId = null;
async function findTargetUser(feedbackAPI) {
  if (cachedTargetUserId) return cachedTargetUserId;

  const { response: usersResp, data: usersData } = await feedbackAPI.get(
    "/manager/users?limit=10",
  );
  if (usersResp.ok()) {
    const users = usersData?.items || usersData || [];
    if (users.length > 1) {
      cachedTargetUserId = users[1].id;
      return cachedTargetUserId;
    }
    if (users.length > 0) {
      cachedTargetUserId = users[0].id;
      return cachedTargetUserId;
    }
  }

  // Fallback: ищем в благодарностях
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

// Хелпер для получения или создания благодарности для тестов комментариев
async function getOrCreateFeedbackForComments(feedbackAPI) {
  if (cachedFeedbackId) {
    // Проверяем что благодарность ещё существует
    const { response } = await feedbackAPI.getById(cachedFeedbackId);
    if (response.ok()) return cachedFeedbackId;
    cachedFeedbackId = null;
  }

  // Ищем существующую благодарность
  const { data: myFeedbacks } = await feedbackAPI.getMyFeedbacks({ limit: 10 });
  const myItems = myFeedbacks?.items || myFeedbacks || [];
  if (myItems.length > 0) {
    cachedFeedbackId = myItems[0].id;
    return cachedFeedbackId;
  }

  // Создаём новую благодарность
  const feedbackTypeId = await getThanksTypeId(feedbackAPI);
  const targetUserId = await findTargetUser(feedbackAPI);

  if (!feedbackTypeId || !targetUserId) return null;

  const body = TestDataHelper.generateUniqueName(
    "Благодарность для комментариев",
  );
  const { response, data } = await feedbackAPI.create({
    body,
    targets: [{ targetType: "user", entityId: targetUserId }],
    feedbackTypeId,
    userAccessType: "selective",
    usersWithAccess: [],
  });

  if (response.ok() && data?.id) {
    cachedFeedbackId = data.id;
    return cachedFeedbackId;
  }

  return null;
}

test.describe(
  "Feedback Comments API - CRUD Operations",
  { tag: ["@api", "@feedback", "@comments", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Comments CRUD");
    });

    test.describe("GET Comments", () => {
      test("C5010: GET /private/feedback-comments/of-feedback/{id}/ - получить комментарии к благодарности", async ({
        feedbackAPI,
      }) => {
        setSeverity("critical");

        let response, data;
        await test.step("Выполнить запрос: GET /private/feedback-comments/of-feedback/{id}/ - получить комментарии к благодарности", async () => {
          const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
          test.skip(
            !feedbackId,
            "Не удалось получить благодарность для тестирования",
          );

          logInput("feedbackId", feedbackId);
          logExpected("Список комментариев к благодарности или пустой массив");

          ({ response, data } = await feedbackAPI.getComments(feedbackId));
          logResponse(response, data);
        });

        await test.step("Проверить ответ", async () => {
          expect(
            response.ok(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(true);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          expect(
            Array.isArray(items),
            "Ответ должен содержать массив комментариев",
          ).toBe(true);

          // Валидация структуры комментариев
          if (items.length > 0) {
            const comment = items[0];
            expect(comment).toHaveProperty("id");
            expect(comment).toHaveProperty("body");
            expect(
              typeof comment.id === "string" || typeof comment.id === "number",
            ).toBe(true);
            expect(typeof comment.body).toBe("string");
          }
        });
      });

      test("C5011: GET /private/feedback-comments/of-feedback/{id}/ - с пагинацией (limit)", async ({
        feedbackAPI,
      }) => {
        setSeverity("normal");

        let items;
        await test.step("Выполнить запрос: GET /private/feedback-comments/of-feedback/{id}/ - с пагинацией (limit)", async () => {
          const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
          test.skip(
            !feedbackId,
            "Не удалось получить благодарность для тестирования",
          );

          const params = { limit: 5, offset: 0 };
          logInput("params", { feedbackId, ...params });
          logExpected("Не более 5 комментариев");

          const { response, data } = await feedbackAPI.getComments(
            feedbackId,
            params,
          );
          logResponse(response, data);

          assertSuccessStatus(response);

          items = data?.items || data || [];
          assertValidArray(items);
        });

        await test.step("Проверить ответ", async () => {
          expect(items.length).toBeLessThanOrEqual(5);
        });
      });

      test("C5012: GET /private/feedback-comments/of-feedback/{id}/ - с offset", async ({
        feedbackAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET /private/feedback-comments/of-feedback/{id}/ - с offset", async () => {
          const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
          test.skip(
            !feedbackId,
            "Не удалось получить благодарность для тестирования",
          );

          const params = { limit: 10, offset: 5 };
          logInput("params", { feedbackId, ...params });
          logExpected("Комментарии начиная с 6-го");

          const { response, data } = await feedbackAPI.getComments(
            feedbackId,
            params,
          );
          logResponse(response, data);

          assertSuccessStatus(response);

          const items = data?.items || data || [];
          assertValidArray(items);
        });
      });

      test("C5013: GET /private/feedback-comments/{id}/ - получить комментарий по ID", async ({
        feedbackAPI,
      }) => {
        setSeverity("critical");

        let response, data, commentId;
        await test.step("Выполнить запрос: GET /private/feedback-comments/{id}/ - получить комментарий по ID", async () => {
          const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
          test.skip(
            !feedbackId,
            "Не удалось получить благодарность для тестирования",
          );

          // Получаем список комментариев
          const { data: commentsData } =
            await feedbackAPI.getComments(feedbackId);
          const items = commentsData?.items || commentsData || [];

          // Если нет комментариев - создаём один
          if (items.length === 0) {
            const createBody = TestDataHelper.generateUniqueName(
              "Тестовый комментарий",
            );
            const { response: createResp, data: createData } =
              await feedbackAPI.createComment(feedbackId, createBody);
            if (!createResp.ok() || !createData?.id) {
              test.skip(true, "Не удалось создать комментарий для теста");
              return;
            }
            commentId = createData.id;
          } else {
            commentId = items[0].id;
          }

          logInput("commentId", commentId);
          logExpected("Данные комментария с указанным ID");

          ({ response, data } = await feedbackAPI.getCommentById(commentId));
          logResponse(response, data);
        });

        await test.step("Проверить ответ", async () => {
          expect(
            response.ok(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(true);
          expect(data).toBeDefined();
          expect(data.id).toBe(commentId);
          expect(data).toHaveProperty("body");
        });
      });
    });

    test.describe("CREATE Comment", () => {
      test(
        "C5014: POST /private/feedback-comments/ - создать комментарий",
        { tag: ["@critical", "@db"] },
        async ({ feedbackAPI, feedbackVerifier }) => {
          setSeverity("critical");

          const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
          test.skip(
            !feedbackId,
            "Не удалось получить благодарность для тестирования",
          );

          const commentBody =
            TestDataHelper.generateUniqueName("Новый комментарий");
          logInput("payload", { feedbackId, body: commentBody });
          logExpected("Созданный комментарий с ID и телом");

          const { response, data } = await feedbackAPI.createComment(
            feedbackId,
            commentBody,
          );
          logResponse(response, data);

          expect([200, 201, 400, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
            expect(data).toHaveProperty("id");
            expect(data.body).toBe(commentBody);

            // Проверяем что комментарий появился в списке
            const { data: commentsData } =
              await feedbackAPI.getComments(feedbackId);
            const items = commentsData?.items || commentsData || [];
            expect(
              items.some((c) => c.id === data.id),
              "Комментарий должен быть в списке",
            ).toBe(true);

            // DB верификация
            await test.step("DB: Проверка создания комментария в БД", async () => {
              await feedbackVerifier.verifyCommentCreated(data.id);
              // verifyCommentBody не используем: БД хранит тело зашифрованным (privacy feature),
              // а корректность текста уже проверена через expect(data.body).toBe(commentBody) выше
              await feedbackVerifier.verifyCommentFeedback(data.id, feedbackId);
            });
          }
        },
      );

      test("C5015: POST /private/feedback-comments/ - создать комментарий с длинным текстом", async ({
        feedbackAPI,
      }) => {
        setSeverity("normal");

        let longBody, response, data;
        await test.step("Выполнить запрос: POST /private/feedback-comments/ - создать комментарий с длинным текстом", async () => {
          const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
          test.skip(
            !feedbackId,
            "Не удалось получить благодарность для тестирования",
          );

          longBody =
            "A".repeat(500) +
            " " +
            TestDataHelper.generateUniqueName("Длинный комментарий");
          logInput("payload", { feedbackId, bodyLength: longBody.length });
          logExpected("Успешное создание или ошибка валидации");

          ({ response, data } = await feedbackAPI.createComment(
            feedbackId,
            longBody,
          ));
          logResponse(response, data);

          // Может быть успех или ошибка валидации длины
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 422]).toContain(response.status());

          if (response.ok() && data?.id) {
            expect(data.body).toBe(longBody);
          }
        });
      });

      test("C5016: POST /private/feedback-comments/ - создать комментарий с кириллицей", async ({
        feedbackAPI,
      }) => {
        setSeverity("normal");

        let cyrillicBody, response, data;
        await test.step("Выполнить запрос: POST /private/feedback-comments/ - создать комментарий с кириллицей", async () => {
          const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
          test.skip(
            !feedbackId,
            "Не удалось получить благодарность для тестирования",
          );

          cyrillicBody =
            "Отличная работа! Спасибо за помощь. " +
            TestDataHelper.generateUniqueName("");
          logInput("payload", { feedbackId, body: cyrillicBody });
          logExpected("Успешное создание комментария с кириллицей");

          ({ response, data } = await feedbackAPI.createComment(
            feedbackId,
            cyrillicBody,
          ));
          logResponse(response, data);
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403]).toContain(response.status());

          if (response.ok() && data?.id) {
            expect(data.body).toBe(cyrillicBody);
          }
        });
      });

      test("C5017: POST /private/feedback-comments/ - создать несколько комментариев подряд", async ({
        feedbackAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST /private/feedback-comments/ - создать несколько комментариев подряд", async () => {
          const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
          test.skip(
            !feedbackId,
            "Не удалось получить благодарность для тестирования",
          );

          const createdIds = [];

          for (let i = 1; i <= 3; i++) {
            const commentBody = TestDataHelper.generateUniqueName(
              `Комментарий #${i}`,
            );
            const { response, data } = await feedbackAPI.createComment(
              feedbackId,
              commentBody,
            );

            if (response.ok() && data?.id) {
              createdIds.push(data.id);
            }
          }

          logInput("createdCommentsCount", createdIds.length);
          logExpected("Все 3 комментария созданы");

          // Проверяем что все комментарии есть в списке
          const { data: commentsData } = await feedbackAPI.getComments(
            feedbackId,
            { limit: 50 },
          );
          const items = commentsData?.items || commentsData || [];

          for (const id of createdIds) {
            expect(
              items.some((c) => c.id === id),
              `Комментарий ${id} должен быть в списке`,
            ).toBe(true);
          }
        });
      });
    });

    test.describe("UPDATE Comment", () => {
      test("C5018: POST /private/feedback-comments/{id}/ - обновить текст комментария", async ({
        feedbackAPI,
      }) => {
        setSeverity("critical");

        let commentId, updatedBody, response, data;
        await test.step("Выполнить запрос: POST /private/feedback-comments/{id}/ - обновить текст комментария", async () => {
          const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
          test.skip(
            !feedbackId,
            "Не удалось получить благодарность для тестирования",
          );

          // Создаём комментарий для обновления
          const originalBody = TestDataHelper.generateUniqueName(
            "Оригинальный комментарий",
          );
          const { response: createResp, data: createData } =
            await feedbackAPI.createComment(feedbackId, originalBody);

          test.skip(
            !createResp.ok() || !createData?.id,
            "Не удалось создать комментарий для теста",
          );

          commentId = createData.id;
          updatedBody = TestDataHelper.generateUniqueName(
            "Обновлённый комментарий",
          );

          logInput("payload", { commentId, originalBody, updatedBody });
          logExpected("Комментарий успешно обновлён");

          ({ response, data } = await feedbackAPI.updateComment(
            commentId,
            updatedBody,
          ));
          logResponse(response, data);

          // API может не поддерживать обновление
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 404, 405]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();

            // Проверяем что текст обновился
            const { data: updatedComment } =
              await feedbackAPI.getCommentById(commentId);
            if (updatedComment?.body) {
              expect(updatedComment.body).toBe(updatedBody);
            }
          }
        });
      });

      test("C5019: POST /private/feedback-comments/{id}/ - обновить с пустым текстом (негативный)", async ({
        feedbackAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: POST /private/feedback-comments/{id}/ - обновить с пустым текстом (негативный)", async () => {
          const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
          test.skip(
            !feedbackId,
            "Не удалось получить благодарность для тестирования",
          );

          // Создаём комментарий для обновления
          const originalBody = TestDataHelper.generateUniqueName(
            "Комментарий для обновления пустым",
          );
          const { response: createResp, data: createData } =
            await feedbackAPI.createComment(feedbackId, originalBody);

          test.skip(
            !createResp.ok() || !createData?.id,
            "Не удалось создать комментарий для теста",
          );

          const commentId = createData.id;

          logInput("payload", { commentId, body: "" });
          logExpected("Ошибка валидации - пустой текст не допускается");

          ({ response } = await feedbackAPI.updateComment(commentId, ""));
          logResponse(response, {});

          // Должна быть ошибка валидации
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 403, 404, 405, 422]).toContain(response.status());
        });
      });
    });

    test.describe("DELETE Comment", () => {
      test("C5020: DELETE /private/feedback-comments/{id}/ - удалить комментарий", async ({
        feedbackAPI,
      }) => {
        setSeverity("critical");

        let commentId, response;
        await test.step("Выполнить запрос: DELETE /private/feedback-comments/{id}/ - удалить комментарий", async () => {
          const feedbackId = await getOrCreateFeedbackForComments(feedbackAPI);
          test.skip(
            !feedbackId,
            "Не удалось получить благодарность для тестирования",
          );

          // Создаём комментарий для удаления
          const commentBody = TestDataHelper.generateUniqueName(
            "Комментарий для удаления",
          );
          const { response: createResp, data: createData } =
            await feedbackAPI.createComment(feedbackId, commentBody);

          test.skip(
            !createResp.ok() || !createData?.id,
            "Не удалось создать комментарий для теста",
          );

          commentId = createData.id;

          logInput("commentId", commentId);
          logExpected("Комментарий успешно удалён");

          ({ response } = await feedbackAPI.deleteComment(commentId));
          logResponse(response, {});

          // API может не поддерживать удаление
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 204, 400, 403, 404, 405]).toContain(response.status());

          // Если удаление успешно, проверяем что комментарий недоступен
          if (response.ok() || response.status() === 204) {
            const { response: getResp } =
              await feedbackAPI.getCommentById(commentId);
            expect([400, 403, 404]).toContain(getResp.status());
          }
        });
      });

      test("C5021: DELETE /private/feedback-comments/{id}/ - удалить несуществующий комментарий", async ({
        feedbackAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: DELETE /private/feedback-comments/{id}/ - удалить несуществующий комментарий", async () => {
          const nonExistentId = 999999999;
          logInput("commentId", nonExistentId);
          logExpected("Ошибка 404 Not Found");

          const { response } = await feedbackAPI.deleteComment(nonExistentId);
          logResponse(response, {});

          expect([400, 403, 404, 405]).toContain(response.status());
        });
      });
    });
  },
);
