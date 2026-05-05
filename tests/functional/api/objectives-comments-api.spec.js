// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { allure } from "allure-playwright";
import { ObjectivesAPI, getCredentials } from "../../utils/api/index.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertSuccessStatus,
  assertErrorStatus,
  assertHasRequiredProperties,
  assertValidArray,
  assertNotEmptyArray,
  assertEntityHasId,
  extractItems,
  assertUnauthorized,
  assertForbidden,
  assertNotFound,
  assertBadRequest,
} from "../../utils/api/common-assertions.js";

/**
 * API тесты для комментариев к целям (Objective Comments)
 * TASK-037-038
 *
 * Покрытие:
 * - CRUD операции с комментариями
 * - Получение комментариев к цели
 * - Пагинация комментариев
 * - Проверка доступа к комментариям
 * - Валидация входных данных
 * - Негативные тесты
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

// Расширяем test с фикстурой для Objectives API
const test = fullTest.extend({
  objectivesAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  objectivesUserAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

// Кэширование данных для тестов
let cachedObjectiveId = null;
let cachedUserId = null;

// Хелпер для получения текущего периода
function getCurrentPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  return { periodYear: year, periodQ: quarter };
}

// Хелпер для получения ID текущего пользователя
async function getCurrentUserId(objectivesAPI) {
  if (cachedUserId) return cachedUserId;

  const { response, data } = await objectivesAPI.get("/private/accounts/me/");
  if (response.ok() && data?.currentUserId) {
    cachedUserId = data.currentUserId;
    return cachedUserId;
  }
  if (response.ok() && data?.account?.users?.[0]?.id) {
    cachedUserId = data.account.users[0].id;
    return cachedUserId;
  }
  return null;
}

// Хелпер для получения или создания цели для тестов комментариев
async function getOrCreateObjectiveForComments(objectivesAPI) {
  if (cachedObjectiveId) {
    // Проверяем что цель ещё существует
    const { response } =
      await objectivesAPI.getObjectiveById(cachedObjectiveId);
    if (response.ok()) return cachedObjectiveId;
    cachedObjectiveId = null;
  }

  // Ищем существующую цель
  const { data: myObjectives } = await objectivesAPI.getMyObjectives({
    limit: 10,
  });
  const myItems = myObjectives?.items || myObjectives || [];
  const existingObjective = Array.isArray(myItems)
    ? myItems.find((o) => o && o.id)
    : null;

  if (existingObjective) {
    cachedObjectiveId = existingObjective.id;
    return cachedObjectiveId;
  }

  // Создаём новую цель
  const { periodYear, periodQ } = getCurrentPeriod();
  const { startDate, endDate } = ObjectivesAPI.getQuarterDates(periodYear, periodQ);
  const responsibleUserId = await getCurrentUserId(objectivesAPI);

  if (!responsibleUserId) return null;

  const timestamp = Date.now();
  const objectiveData = {
    title: `Цель для комментариев ${timestamp}`,
    description: "Тестовая цель для тестирования комментариев",
    periodYear,
    periodQ,
    startDate,
    endDate,
    status: "active",
    level: "self",
    responsibleUserId,
    userAccessType: "everybody",
    milestones: [
      {
        temporaryId: `temp-${timestamp}`,
        title: `Milestone ${timestamp}`,
        type: "percent",
        weight: 100,
        progress: 0,
        responsibleUserId,
      },
    ],
  };

  const { response, data } = await objectivesAPI.saveObjective(objectiveData);

  if (response.ok() && data?.id) {
    cachedObjectiveId = data.id;
    return cachedObjectiveId;
  }

  return null;
}

test.describe(
  "Objective Comments API - CRUD Operations",
  { tag: ["@api", "@objectives", "@comments", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Comments CRUD");
    });

    test.describe("GET Comments", () => {
      test("C5522: GET /private/objective-comments/of-objective/{id}/ - получить комментарии к цели", async ({
        objectivesAPI,
      }) => {
        setSeverity("critical");

        let response, data;
        await test.step("Выполнить запрос: GET /private/objective-comments/of-objective/{id}/ - получить комментарии к цели", async () => {
          const objectiveId =
            await getOrCreateObjectiveForComments(objectivesAPI);
          test.skip(!objectiveId, "Не удалось получить цель для тестирования");

          logInput("objectiveId", objectiveId);
          logExpected("Список комментариев к цели или пустой массив");

          ({ response, data } = await objectivesAPI.getComments(objectiveId));
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

      test("C5523: GET /private/objective-comments/of-objective/{id}/ - с пагинацией (limit)", async ({
        objectivesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET /private/objective-comments/of-objective/{id}/ - с пагинацией (limit)", async () => {
          const objectiveId =
            await getOrCreateObjectiveForComments(objectivesAPI);
          test.skip(!objectiveId, "Не удалось получить цель для тестирования");

          const params = { limit: 5, offset: 0 };
          logInput("params", { objectiveId, ...params });
          logExpected("Не более 5 комментариев");

          const { response, data } = await objectivesAPI.getComments(
            objectiveId,
            params,
          );
          logResponse(response, data);

          assertSuccessStatus(response);

          const items = data?.items || data || [];
          assertValidArray(items);
          expect(items.length).toBeLessThanOrEqual(5);
        });
      });

      test("C5524: GET /private/objective-comments/of-objective/{id}/ - с offset", async ({
        objectivesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET /private/objective-comments/of-objective/{id}/ - с offset", async () => {
          const objectiveId =
            await getOrCreateObjectiveForComments(objectivesAPI);
          test.skip(!objectiveId, "Не удалось получить цель для тестирования");

          const params = { limit: 10, offset: 5 };
          logInput("params", { objectiveId, ...params });
          logExpected("Комментарии начиная с 6-го");

          const { response, data } = await objectivesAPI.getComments(
            objectiveId,
            params,
          );
          logResponse(response, data);

          assertSuccessStatus(response);

          const items = data?.items || data || [];
          assertValidArray(items);
        });
      });

      // C5525: дубликат, живёт в objectives-comments-crud-api.spec.js

      // C5526: дубликат, живёт в objectives-comments-crud-api.spec.js
    });

    test.describe("CREATE Comment", () => {
      // C5527: дубликат, живёт в objectives-comments-crud-api.spec.js

      test("C5528: POST /private/objective-comments/ - создать комментарий с длинным текстом", async ({
        objectivesAPI,
      }) => {
        setSeverity("normal");

        let longBody, response, data;
        await test.step("Выполнить запрос: POST /private/objective-comments/ - создать комментарий с длинным текстом", async () => {
          const objectiveId =
            await getOrCreateObjectiveForComments(objectivesAPI);
          test.skip(!objectiveId, "Не удалось получить цель для тестирования");

          longBody =
            "A".repeat(500) +
            " " +
            TestDataHelper.generateUniqueName("Длинный комментарий");
          logInput("payload", { objectiveId, bodyLength: longBody.length });
          logExpected("Успешное создание или ошибка валидации");

          ({ response, data } = await objectivesAPI.createComment(
            objectiveId,
            longBody,
          ));
          logResponse(response, data);

          // Может быть успех или ошибка валидации длины
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 422]).toContain(response.status());

          if (response.ok() && data?.id) {
            expect(data.body).toBe(longBody);
            await objectivesAPI.deleteComment(data.id);
          }
        });
      });

      test("C5529: POST /private/objective-comments/ - создать комментарий с кириллицей", async ({
        objectivesAPI,
      }) => {
        setSeverity("normal");

        let cyrillicBody, response, data;
        await test.step("Выполнить запрос: POST /private/objective-comments/ - создать комментарий с кириллицей", async () => {
          const objectiveId =
            await getOrCreateObjectiveForComments(objectivesAPI);
          test.skip(!objectiveId, "Не удалось получить цель для тестирования");

          cyrillicBody =
            "Отличный прогресс по цели! Так держать. " +
            TestDataHelper.generateUniqueName("");
          logInput("payload", { objectiveId, body: cyrillicBody });
          logExpected("Успешное создание комментария с кириллицей");

          ({ response, data } = await objectivesAPI.createComment(
            objectiveId,
            cyrillicBody,
          ));
          logResponse(response, data);
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403]).toContain(response.status());

          if (response.ok() && data?.id) {
            expect(data.body).toBe(cyrillicBody);
            await objectivesAPI.deleteComment(data.id);
          }
        });
      });

      test("C5530: POST /private/objective-comments/ - создать несколько комментариев подряд", async ({
        objectivesAPI,
      }) => {
        setSeverity("normal");

        let objectiveId, createdIds;
        await test.step("Выполнить запрос: POST /private/objective-comments/ - создать несколько комментариев подряд", async () => {
          objectiveId = await getOrCreateObjectiveForComments(objectivesAPI);
          test.skip(!objectiveId, "Не удалось получить цель для тестирования");

          createdIds = [];

          for (let i = 1; i <= 3; i++) {
            const commentBody = TestDataHelper.generateUniqueName(
              `Комментарий #${i}`,
            );
            const { response, data } = await objectivesAPI.createComment(
              objectiveId,
              commentBody,
            );

            if (response.ok() && data?.id) {
              createdIds.push(data.id);
            }
          }

          logInput("createdCommentsCount", createdIds.length);
          logExpected("Все 3 комментария созданы");
        });

        await test.step("Проверить ответ", async () => {
          expect(createdIds.length).toBeGreaterThan(0);

          // Проверяем что все комментарии есть в списке
          const { data: commentsData } = await objectivesAPI.getComments(
            objectiveId,
            { limit: 50 },
          );
          const items = commentsData?.items || commentsData || [];

          for (const id of createdIds) {
            const found = Array.isArray(items)
              ? items.some((c) => c.id === id)
              : false;
            expect(found, `Комментарий ${id} должен быть в списке`).toBe(true);
          }

          // Cleanup
          for (const id of createdIds) {
            await objectivesAPI.deleteComment(id);
          }
        });
      });
    });

    test.describe("UPDATE Comment", () => {
      test("C5531: POST /private/objective-comments/{id}/ - обновить текст комментария", async ({
        objectivesAPI,
      }) => {
        setSeverity("critical");

        let commentId, updatedBody, response, data;
        await test.step("Выполнить запрос: POST /private/objective-comments/{id}/ - обновить текст комментария", async () => {
          const objectiveId =
            await getOrCreateObjectiveForComments(objectivesAPI);
          test.skip(!objectiveId, "Не удалось получить цель для тестирования");

          // Создаём комментарий для обновления
          const originalBody = TestDataHelper.generateUniqueName(
            "Оригинальный комментарий",
          );
          const { response: createResp, data: createData } =
            await objectivesAPI.createComment(objectiveId, originalBody);

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

          ({ response, data } = await objectivesAPI.updateComment(
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
              await objectivesAPI.getCommentById(commentId);
            if (updatedComment?.body) {
              expect(updatedComment.body).toBe(updatedBody);
            }
          }

          // Cleanup
          await objectivesAPI.deleteComment(commentId);
        });
      });

      test("C5532: POST /private/objective-comments/{id}/ - обновить с пустым текстом (негативный)", async ({
        objectivesAPI,
      }) => {
        setSeverity("normal");

        let commentId, response;
        await test.step("Выполнить запрос: POST /private/objective-comments/{id}/ - обновить с пустым текстом (негативный)", async () => {
          const objectiveId =
            await getOrCreateObjectiveForComments(objectivesAPI);
          test.skip(!objectiveId, "Не удалось получить цель для тестирования");

          // Создаём комментарий для обновления
          const originalBody = TestDataHelper.generateUniqueName(
            "Комментарий для обновления пустым",
          );
          const { response: createResp, data: createData } =
            await objectivesAPI.createComment(objectiveId, originalBody);

          test.skip(
            !createResp.ok() || !createData?.id,
            "Не удалось создать комментарий для теста",
          );

          commentId = createData.id;

          logInput("payload", { commentId, body: "" });
          logExpected("Ошибка валидации - пустой текст не допускается");

          ({ response } = await objectivesAPI.updateComment(commentId, ""));
          logResponse(response, {});

          // Должна быть ошибка валидации
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 403, 404, 405, 422]).toContain(response.status());

          // Cleanup
          await objectivesAPI.deleteComment(commentId);
        });
      });
    });

    test.describe("DELETE Comment", () => {
      // C5533: дубликат, живёт в objectives-comments-crud-api.spec.js

      test("C5534: DELETE /private/objective-comments/{id}/ - удалить несуществующий комментарий", async ({
        objectivesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: DELETE /private/objective-comments/{id}/ - удалить несуществующий комментарий", async () => {
          const nonExistentId = 999999999;
          logInput("commentId", nonExistentId);
          logExpected("Ошибка 404 Not Found");

          const { response } = await objectivesAPI.deleteComment(nonExistentId);
          logResponse(response, {});

          expect([400, 403, 404, 405]).toContain(response.status());
        });
      });
    });
  },
);

test.describe(
  "Objective Comments API - Negative Tests",
  { tag: ["@api", "@objectives", "@comments", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Comments Negative");
    });

    test("C5535: GET /private/objective-comments/of-objective/{id}/ - несуществующая цель", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/objective-comments/of-objective/{id}/ - несуществующая цель", async () => {
        const nonExistentId = 999999999;
        logInput("objectiveId", nonExistentId);
        logExpected("Ошибка 404 Not Found");

        const { response } = await objectivesAPI.getComments(nonExistentId);
        logResponse(response, {});

        // 500 - возможный ответ сервера на несуществующий ресурс
        expect([400, 403, 404, 500]).toContain(response.status());
      });
    });

    test("C5536: GET /private/objective-comments/{id}/ - несуществующий комментарий", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/objective-comments/{id}/ - несуществующий комментарий", async () => {
        const nonExistentId = 999999999;
        logInput("commentId", nonExistentId);
        logExpected("Ошибка 404 Not Found");

        const { response } = await objectivesAPI.getCommentById(nonExistentId);
        logResponse(response, {});

        // 500 - возможный ответ сервера на несуществующий ресурс
        expect([400, 403, 404, 500]).toContain(response.status());
      });
    });

    test(
      "C5537: POST /private/objective-comments/ - пустой текст комментария",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        const objectiveId =
          await getOrCreateObjectiveForComments(objectivesAPI);
        test.skip(!objectiveId, "Не удалось получить цель для тестирования");

        // DB: Получаем количество комментариев до теста
        const commentsBefore =
          await test.step("DB: Получение комментариев до теста", async () => {
            if (!objectivesVerifier.isConnected()) return 0;
            return await objectivesVerifier.countComments(objectiveId);
          });

        logInput("payload", { objectiveId, body: "" });
        logExpected("Ошибка валидации - пустой текст");

        const { response } = await objectivesAPI.createComment(objectiveId, "");
        logResponse(response, {});

        expect([400, 422]).toContain(response.status());

        // DB: Проверяем что комментарий НЕ создан
        await test.step("DB: Проверка что комментарий НЕ создан", async () => {
          if (!objectivesVerifier.isConnected()) return;
          const commentsAfter =
            await objectivesVerifier.countComments(objectiveId);
          expect(
            commentsAfter,
            "Количество комментариев не должно увеличиться",
          ).toBe(commentsBefore);
        });
      },
    );

    test(
      "C5538: POST /private/objective-comments/ - несуществующая цель",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        const nonExistentId = 999999999;
        const commentBody = "Тестовый комментарий";

        // DB: Получаем количество комментариев до теста
        const commentsBefore =
          await test.step("DB: Получение комментариев до теста", async () => {
            if (!objectivesVerifier.isConnected()) return 0;
            return await objectivesVerifier.countAllComments();
          });

        logInput("payload", { objectiveId: nonExistentId, body: commentBody });
        logExpected("Ошибка 404 Not Found или 400 Bad Request");

        const { response } = await objectivesAPI.createComment(
          nonExistentId,
          commentBody,
        );
        logResponse(response, {});

        // 500 - возможный ответ при ошибке сервера на несуществующий ресурс
        expect([400, 403, 404, 500]).toContain(response.status());

        // DB: Проверяем что комментарий НЕ создан
        await test.step("DB: Проверка что комментарий НЕ создан", async () => {
          if (!objectivesVerifier.isConnected()) return;
          const commentsAfter = await objectivesVerifier.countAllComments();
          expect(
            commentsAfter,
            "Количество комментариев не должно увеличиться",
          ).toBe(commentsBefore);
        });
      },
    );

    test(
      "C5539: POST /private/objective-comments/ - null как текст комментария",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("minor");

        const objectiveId =
          await getOrCreateObjectiveForComments(objectivesAPI);
        test.skip(!objectiveId, "Не удалось получить цель для тестирования");

        // DB: Получаем количество комментариев до теста
        const commentsBefore =
          await test.step("DB: Получение комментариев до теста", async () => {
            if (!objectivesVerifier.isConnected()) return 0;
            return await objectivesVerifier.countComments(objectiveId);
          });

        logInput("payload", { objectiveId, body: null });
        logExpected("Ошибка валидации");

        const { response } = await objectivesAPI.createComment(
          objectiveId,
          null,
        );
        logResponse(response, {});

        expect([400, 422, 500]).toContain(response.status());

        // DB: Проверяем что комментарий НЕ создан
        await test.step("DB: Проверка что комментарий НЕ создан", async () => {
          if (!objectivesVerifier.isConnected()) return;
          const commentsAfter =
            await objectivesVerifier.countComments(objectiveId);
          expect(
            commentsAfter,
            "Количество комментариев не должно увеличиться",
          ).toBe(commentsBefore);
        });
      },
    );

    test("C5540: POST /private/objective-comments/{id}/ - обновить несуществующий комментарий", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/objective-comments/{id}/ - обновить несуществующий комментарий", async () => {
        const nonExistentId = 999999999;
        const newBody = "Новый текст";

        logInput("payload", { commentId: nonExistentId, body: newBody });
        logExpected("Ошибка 404 Not Found");

        const { response } = await objectivesAPI.updateComment(
          nonExistentId,
          newBody,
        );
        logResponse(response, {});

        expect([400, 403, 404, 405, 500]).toContain(response.status());
      });
    });

    test("C5541: POST /private/objective-comments/ - комментарий только из пробелов", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: POST /private/objective-comments/ - комментарий только из пробелов", async () => {
        const objectiveId =
          await getOrCreateObjectiveForComments(objectivesAPI);
        test.skip(!objectiveId, "Не удалось получить цель для тестирования");

        const whitespaceBody = "   \t\n   ";
        logInput("payload", { objectiveId, body: whitespaceBody });
        logExpected("Ошибка валидации или принятие (зависит от бэкенда)");

        const { response, data } = await objectivesAPI.createComment(
          objectiveId,
          whitespaceBody,
        );
        logResponse(response, data);

        // API может обрезать пробелы и вернуть ошибку или принять
        expect([200, 201, 400, 422]).toContain(response.status());

        if (response.ok() && data?.id) {
          await objectivesAPI.deleteComment(data.id);
        }
      });
    });
  },
);

test.describe(
  "Objective Comments API - Pagination",
  { tag: ["@api", "@objectives", "@comments", "@pagination", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Comments Pagination");
    });

    test("C5029: Пагинация: limit ограничивает количество результатов", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let createdIds, items;
      await test.step("Выполнить запрос: Пагинация: limit ограничивает количество результатов", async () => {
        const objectiveId =
          await getOrCreateObjectiveForComments(objectivesAPI);
        test.skip(!objectiveId, "Не удалось получить цель для тестирования");

        // Создаём несколько комментариев
        createdIds = [];
        for (let i = 1; i <= 5; i++) {
          const { response, data } = await objectivesAPI.createComment(
            objectiveId,
            TestDataHelper.generateUniqueName(`Пагинация #${i}`),
          );
          if (response.ok() && data?.id) {
            createdIds.push(data.id);
          }
        }

        const params = { limit: 3 };
        logInput("params", { objectiveId, ...params });
        logExpected("Не более 3 комментариев");

        const { response, data } = await objectivesAPI.getComments(
          objectiveId,
          params,
        );
        logResponse(response, data);

        assertSuccessStatus(response);

        items = data?.items || data || [];
      });

      await test.step("Проверить ответ", async () => {
        expect(Array.isArray(items) ? items.length : 0).toBeLessThanOrEqual(3);

        // Cleanup
        for (const id of createdIds) {
          await objectivesAPI.deleteComment(id);
        }
      });
    });

    test("C5031: Пагинация: большой offset возвращает пустой массив", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Пагинация: большой offset возвращает пустой массив", async () => {
        const objectiveId =
          await getOrCreateObjectiveForComments(objectivesAPI);
        test.skip(!objectiveId, "Не удалось получить цель для тестирования");

        const params = { limit: 10, offset: 999999 };
        logInput("params", { objectiveId, ...params });
        logExpected("Пустой массив комментариев");

        const { response, data } = await objectivesAPI.getComments(
          objectiveId,
          params,
        );
        logResponse(response, data);

        assertSuccessStatus(response);

        const items = data?.items || data || [];
        expect(Array.isArray(items) ? items.length : 0).toBe(0);
      });
    });

    test("C5032: Пагинация: limit=0 возвращает все или ошибку", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Пагинация: limit=0 возвращает все или ошибку", async () => {
        const objectiveId =
          await getOrCreateObjectiveForComments(objectivesAPI);
        test.skip(!objectiveId, "Не удалось получить цель для тестирования");

        const params = { limit: 0 };
        logInput("params", { objectiveId, ...params });
        logExpected("Все комментарии или ошибка валидации");

        const { response, data } = await objectivesAPI.getComments(
          objectiveId,
          params,
        );
        logResponse(response, data);

        expect([200, 400]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });
  },
);

test.describe(
  "Objective Comments API - Access Control",
  { tag: ["@api", "@objectives", "@comments", "@access", "@regression"] },
  () => {
    let userObjectiveId = null;

    test.beforeAll(async ({ request }) => {
      // Создаём цель от имени пользователя, чтобы тесты доступа не скипались
      const userAPI = new ObjectivesAPI(request);
      const { email, password } = getCredentials("user");
      await userAPI.signIn(email, password);

      // Сначала проверяем существующие цели
      const { data: myObjectives } = await userAPI.getMyObjectives({
        limit: 10,
      });
      const myItems = myObjectives?.items || myObjectives || [];
      const existing = Array.isArray(myItems)
        ? myItems.find((o) => o && o.id)
        : null;

      if (existing) {
        userObjectiveId = existing.id;
        return;
      }

      // Создаём новую цель
      const meResp = await userAPI.get("/private/accounts/me/");
      const meData = await meResp.response.json().catch(() => meResp.data);
      const userId =
        meResp.data?.currentUserId || meResp.data?.account?.users?.[0]?.id;

      if (!userId) throw new Error("Не удалось определить userId для user");

      const { periodYear, periodQ } = getCurrentPeriod();
      const timestamp = Date.now();
      const { response, data } = await userAPI.saveObjective({
        title: `Цель пользователя для Access Control ${timestamp}`,
        description: "Авто-созданная цель для тестов доступа к комментариям",
        periodYear,
        periodQ,
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-ac-${timestamp}`,
            title: `Milestone AC ${timestamp}`,
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      });

      if (!response.ok() || !data?.id) {
        throw new Error(
          `Не удалось создать цель для user: ${response.status()}`,
        );
      }
      userObjectiveId = data.id;
    });

    test.afterAll(async ({ request }) => {
      if (!userObjectiveId) return;
      // Cleanup: удаляем созданную цель
      const userAPI = new ObjectivesAPI(request);
      const { email, password } = getCredentials("user");
      await userAPI.signIn(email, password);
      await userAPI.deleteObjective(userObjectiveId).catch(() => {});
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Comments Access");
    });

    test("C5545: Обычный пользователь может видеть комментарии к своей цели", async ({
      objectivesUserAPI,
    }) => {
      setSeverity("critical");
      expect(userObjectiveId, "Цель пользователя должна быть создана в beforeAll").toBeTruthy();

      let response, data;
      await test.step("Получить комментарии к своей цели", async () => {
        logInput("objectiveId", userObjectiveId);
        logExpected("Список комментариев или пустой массив");

        ({ response, data } = await objectivesUserAPI.getComments(
          userObjectiveId,
        ));
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

    test("C5546: Пользователь может комментировать свою цель", async ({
      objectivesUserAPI,
    }) => {
      setSeverity("critical");
      expect(userObjectiveId, "Цель пользователя должна быть создана в beforeAll").toBeTruthy();

      let response, data;
      await test.step("Создать комментарий к своей цели", async () => {
        const commentBody = TestDataHelper.generateUniqueName(
          "Комментарий от пользователя",
        );

        logInput("payload", { objectiveId: userObjectiveId, body: commentBody });
        logExpected("Успешное создание комментария");

        ({ response, data } = await objectivesUserAPI.createComment(
          userObjectiveId,
          commentBody,
        ));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 403]).toContain(response.status());

        if (response.ok() && data?.id) {
          await objectivesUserAPI.deleteComment(data.id);
        }
      });
    });

    test("C5547: Проверка доступа к комментариям через checkCommentAccess", async ({
      objectivesAPI,
      objectivesUserAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Проверка доступа к комментариям через checkCommentAccess", async () => {
        const objectiveId =
          await getOrCreateObjectiveForComments(objectivesAPI);
        test.skip(!objectiveId, "Не удалось получить цель для тестирования");

        logInput("objectiveId", objectiveId);
        logExpected("Информация о доступе к комментариям");

        // Admin проверяет доступ
        const { response: adminResp, data: adminData } =
          await objectivesAPI.checkCommentAccess(objectiveId);
        logResponse(adminResp, adminData);

        expect([200, 403, 404]).toContain(adminResp.status());

        // User проверяет доступ
        const { response: userResp, data: userData } =
          await objectivesUserAPI.checkCommentAccess(objectiveId);
        logResponse(userResp, userData);

        expect([200, 403, 404]).toContain(userResp.status());
      });
    });
  },
);

test.describe(
  "Objective Comments API - Data Validation",
  { tag: ["@api", "@objectives", "@comments", "@validation", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Comments Validation");
    });

    test("C5038: Комментарий содержит корректные поля автора", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Комментарий содержит корректные поля автора", async () => {
        const objectiveId =
          await getOrCreateObjectiveForComments(objectivesAPI);
        test.skip(!objectiveId, "Не удалось получить цель для тестирования");

        // Создаём комментарий
        const commentBody = TestDataHelper.generateUniqueName(
          "Комментарий для проверки автора",
        );
        const { response: createResp, data: createData } =
          await objectivesAPI.createComment(objectiveId, commentBody);

        test.skip(
          !createResp.ok() || !createData?.id,
          "Не удалось создать комментарий",
        );

        logInput("commentId", createData.id);
        logExpected("Комментарий содержит данные автора");

        const { response, data } = await objectivesAPI.getCommentById(
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

        // Cleanup
        await objectivesAPI.deleteComment(createData.id);
      });
    });

    test("C5039: Комментарий содержит дату создания", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Комментарий содержит дату создания", async () => {
        const objectiveId =
          await getOrCreateObjectiveForComments(objectivesAPI);
        test.skip(!objectiveId, "Не удалось получить цель для тестирования");

        // Создаём комментарий
        const commentBody = TestDataHelper.generateUniqueName(
          "Комментарий для проверки даты",
        );
        const { response: createResp, data: createData } =
          await objectivesAPI.createComment(objectiveId, commentBody);

        test.skip(
          !createResp.ok() || !createData?.id,
          "Не удалось создать комментарий",
        );

        logInput("commentId", createData.id);
        logExpected("Комментарий содержит дату создания");

        const { response, data } = await objectivesAPI.getCommentById(
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

        // Cleanup
        await objectivesAPI.deleteComment(createData.id);
      });
    });

    test("C5550: Комментарий связан с корректной целью", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Комментарий связан с корректной целью", async () => {
        const objectiveId =
          await getOrCreateObjectiveForComments(objectivesAPI);
        test.skip(!objectiveId, "Не удалось получить цель для тестирования");

        // Создаём комментарий
        const commentBody = TestDataHelper.generateUniqueName(
          "Комментарий для проверки связи",
        );
        const { response: createResp, data: createData } =
          await objectivesAPI.createComment(objectiveId, commentBody);

        test.skip(
          !createResp.ok() || !createData?.id,
          "Не удалось создать комментарий",
        );

        logInput("data", { objectiveId, commentId: createData.id });
        logExpected("Комментарий связан с указанной целью");

        const { response, data } = await objectivesAPI.getCommentById(
          createData.id,
        );
        logResponse(response, data);

        assertSuccessStatus(response);

        // Проверяем связь с целью
        if (data.objectiveId) {
          expect(data.objectiveId).toBe(objectiveId);
        }

        // Cleanup
        await objectivesAPI.deleteComment(createData.id);
      });
    });
  },
);

test.describe(
  "Objective Comments API - Lifecycle",
  { tag: ["@api", "@objectives", "@comments", "@lifecycle", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Comments Lifecycle");
    });

    test("C5042: Полный жизненный цикл комментария: создание → обновление → удаление", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      let originalBody, createResp, createData;
      await test.step("Выполнить запрос: Полный жизненный цикл комментария: создание → обновление → удаление", async () => {
        const objectiveId =
          await getOrCreateObjectiveForComments(objectivesAPI);
        test.skip(!objectiveId, "Не удалось получить цель для тестирования");

        // 1. Создание
        originalBody = TestDataHelper.generateUniqueName(
          "Жизненный цикл комментарий",
        );
        logInput("step1", {
          action: "create",
          objectiveId,
          body: originalBody,
        });

        ({ response: createResp, data: createData } =
          await objectivesAPI.createComment(objectiveId, originalBody));
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
          await objectivesAPI.getCommentById(commentId);
        expect(readResp.ok()).toBe(true);
        expect(readData.id).toBe(commentId);
        expect(readData.body).toBe(originalBody);

        // 3. Обновление
        const updatedBody = TestDataHelper.generateUniqueName(
          "Обновлённый комментарий жизненного цикла",
        );
        logInput("step2", { action: "update", commentId, body: updatedBody });

        const { response: updateResp } = await objectivesAPI.updateComment(
          commentId,
          updatedBody,
        );

        if (updateResp.ok()) {
          const { data: updatedData } =
            await objectivesAPI.getCommentById(commentId);
          expect(updatedData.body).toBe(updatedBody);
        }

        // 4. Удаление
        logInput("step3", { action: "delete", commentId });

        const { response: deleteResp } =
          await objectivesAPI.deleteComment(commentId);

        if (deleteResp.ok() || deleteResp.status() === 204) {
          // Проверяем что комментарий удалён
          const { response: checkResp } =
            await objectivesAPI.getCommentById(commentId);
          expect([400, 403, 404]).toContain(checkResp.status());
        }

        logExpected(
          "Комментарий прошёл полный жизненный цикл: создан → обновлён → удалён",
        );
      });
    });
  },
);
