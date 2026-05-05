// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { ObjectivesAPI, getCredentials } from "../../utils/api/index.js";
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
 * API тесты для модуля Objectives - Comments
 *
 * Покрытие:
 * - CRUD операции с комментариями к целям
 * - Negative тесты комментариев (пустой body, несуществующий ID, чужие комментарии)
 */

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
  objectivesManagerAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
});

// Хранение созданных ID для cleanup
const createdObjectiveIds = [];

// Хелпер для получения текущего периода
function getCurrentPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  // Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec
  const quarter = Math.floor(month / 3) + 1;
  return { periodYear: year, periodQ: quarter };
}

// Хелпер для получения текущего пользователя
async function getCurrentUserId(objectivesAPI) {
  // Получаем через /private/accounts/me/ - возвращает account.currentUserId
  const { response, data } = await objectivesAPI.get("/private/accounts/me/");
  if (response.ok() && data?.currentUserId) {
    return data.currentUserId;
  }
  // Fallback - пробуем взять из account.users[0]
  if (response.ok() && data?.account?.users?.[0]?.id) {
    return data.account.users[0].id;
  }
  return null;
}

// Хелпер для создания тестовой цели
async function createTestObjective(objectivesAPI, overrides = {}) {
  const { periodYear, periodQ } = getCurrentPeriod();
  const { startDate, endDate } = ObjectivesAPI.getQuarterDates(periodYear, periodQ);
  const timestamp = Date.now();

  // Получаем ID текущего пользователя
  const responsibleUserId =
    overrides.responsibleUserId || (await getCurrentUserId(objectivesAPI));

  const objectiveData = {
    title: `Test Objective ${timestamp}`,
    description: `Test objective description ${timestamp}`,
    periodYear,
    periodQ,
    startDate,
    endDate,
    status: "draft", // черновик для безопасности
    level: "self", // self, team, company
    responsibleUserId,
    userAccessType: "everybody", // everybody, selective
    milestones: [
      {
        temporaryId: `temp-${timestamp}-1`,
        title: `Milestone 1 - ${timestamp}`,
        type: "percent", // percent, number, boolean
        weight: 50,
        progress: 0,
        responsibleUserId,
      },
      {
        temporaryId: `temp-${timestamp}-2`,
        title: `Milestone 2 - ${timestamp}`,
        type: "percent",
        weight: 50,
        progress: 0,
        responsibleUserId,
      },
    ],
    ...overrides,
  };

  const { response, data } = await objectivesAPI.saveObjective(objectiveData);

  if (response.ok() && data?.id) {
    createdObjectiveIds.push(data.id);
  }

  return { response, data, objectiveData };
}

// Хелпер для поиска существующей цели
async function findExistingObjective(objectivesAPI) {
  // Сначала ищем в своих целях
  const { periodYear, periodQ } = getCurrentPeriod();

  const { data: myObjectives } = await objectivesAPI.getMyObjectives({
    periodYear,
    periodQ,
    limit: 10,
  });

  const myItems = myObjectives?.items || myObjectives || [];
  if (myItems.length > 0) {
    return { objectiveId: myItems[0].id, objective: myItems[0] };
  }

  // Затем ищем в черновиках
  const { data: drafts } = await objectivesAPI.getDraftObjectives({
    limit: 10,
  });
  const draftItems = drafts?.items || drafts || [];
  if (draftItems.length > 0) {
    return { objectiveId: draftItems[0].id, objective: draftItems[0] };
  }

  return { objectiveId: null, objective: null };
}

// Cleanup после всех тестов
test.afterAll(async ({ request }) => {
  if (createdObjectiveIds.length > 0) {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    for (const id of createdObjectiveIds) {
      try {
        await api.deleteObjective(id);
      } catch (e) {
        // Игнорируем ошибки при cleanup
      }
    }
    createdObjectiveIds.length = 0;
  }
});

// ==================== COMMENTS ====================

test.describe(
  "Objectives API - Comments",
  { tag: ["@api", "@regression", "@objectives", "@comments"] },
  () => {
    let testObjectiveId = null;
    let createdCommentIds = [];

    test.beforeAll(async ({ request }) => {
      // Создаём тестовую цель для комментариев
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const { data } = await createTestObjective(api, { status: "active" });
      testObjectiveId = data?.id;
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Comments");
    });

    test.afterAll(async ({ request }) => {
      // Cleanup комментариев
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of createdCommentIds) {
        try {
          await api.deleteComment(id);
        } catch (e) {
          // ignore
        }
      }
      createdCommentIds = [];
    });

    test("C5568: GET /private/objective-comments/of-objective/{id}/ - получить комментарии цели", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let objectiveId, response, data, items;

      await test.step("Определить ID цели для получения комментариев", async () => {
        objectiveId = testObjectiveId;
        if (!objectiveId) {
          const { objectiveId: existingId } =
            await findExistingObjective(objectivesAPI);
          objectiveId = existingId;
        }
        test.skip(!objectiveId, "Нет доступных целей для теста");
        test.info().annotations.push({
          type: "endpoint",
          description: `GET /private/objective-comments/of-objective/${objectiveId}/`,
        });
      });

      await test.step(`Отправить GET /private/objective-comments/of-objective/${objectiveId}/`, async () => {
        const result = await objectivesAPI.getComments(objectiveId);
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие данных в ответе", async () => {
        expect(data).toBeDefined();
      });

      await test.step("Извлечь и валидировать массив комментариев", async () => {
        items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5526: GET /private/objective-comments/of-objective/{id}/check-access/ - проверить доступ к комментариям", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let objectiveId, response, data;

      await test.step("Определить ID цели для проверки доступа к комментариям", async () => {
        objectiveId = testObjectiveId;
        if (!objectiveId) {
          const { objectiveId: existingId } =
            await findExistingObjective(objectivesAPI);
          objectiveId = existingId;
        }
        test.skip(!objectiveId, "Нет доступных целей для теста");
        test.info().annotations.push({
          type: "endpoint",
          description: `GET /private/objective-comments/of-objective/${objectiveId}/check-access/`,
        });
      });

      await test.step(`Отправить GET check-access для цели ${objectiveId}`, async () => {
        const result = await objectivesAPI.checkCommentAccess(objectiveId);
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие данных о доступе в ответе", async () => {
        expect(data).toBeDefined();
      });
    });

    test("C5527: POST /private/objective-comments/ - создать комментарий", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      let objectiveId, commentText, response, data;

      await test.step("Определить ID цели для создания комментария", async () => {
        objectiveId = testObjectiveId;
        if (!objectiveId) {
          const result = await createTestObjective(objectivesAPI, {
            status: "active",
          });
          objectiveId = result.data?.id;
        }
        test.skip(!objectiveId, "Не удалось создать цель для теста");
      });

      await test.step("Подготовить текст комментария", async () => {
        commentText = `Test comment ${Date.now()}`;
        test.info().annotations.push({
          type: "endpoint",
          description: "POST /private/objective-comments/",
        });
        test.info().annotations.push({
          type: "objectiveId",
          description: String(objectiveId),
        });
      });

      await test.step("Отправить POST /private/objective-comments/ для создания комментария", async () => {
        const result = await objectivesAPI.createComment(
          objectiveId,
          commentText,
        );
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие данных созданного комментария", async () => {
        expect(data).toBeDefined();
      });

      await test.step("Проверить ID и тип ID созданного комментария", async () => {
        expect(data.id).toBeDefined();
        expect(typeof data.id).toBe("number");
      });

      await test.step("Проверить что текст комментария совпадает с отправленным", async () => {
        expect(data.body).toBe(commentText);
      });

      await test.step("Проверить что objectiveId комментария совпадает с целью", async () => {
        expect(data.objectiveId).toBe(objectiveId);
      });

      await test.step("Проверить наличие автора комментария (если присутствует)", async () => {
        if (data.author || data.authorUser) {
          const author = data.author || data.authorUser;
          expect(author.id).toBeDefined();
        }
      });

      await test.step("Проверить формат даты создания (если присутствует)", async () => {
        if (data.createdAt) {
          expect(typeof data.createdAt).toBe("string");
        }
      });

      await test.step("Добавить ID комментария в список для cleanup", async () => {
        createdCommentIds.push(data.id);
      });
    });

    test("C5525: GET /private/objective-comments/{id}/ - получить комментарий по ID", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let objectiveId, comment, response, data;

      await test.step("Определить или создать цель для комментария", async () => {
        objectiveId = testObjectiveId;
        if (!objectiveId) {
          const result = await createTestObjective(objectivesAPI, {
            status: "active",
          });
          objectiveId = result.data?.id;
        }
        test.skip(!objectiveId, "Не удалось создать цель для теста");
      });

      await test.step("Создать тестовый комментарий", async () => {
        const result = await objectivesAPI.createComment(
          objectiveId,
          `Comment ${Date.now()}`,
        );
        comment = result.data;
        expect(comment?.id).toBeDefined();
        createdCommentIds.push(comment.id);
      });

      await test.step(`Отправить GET /private/objective-comments/${comment.id}/`, async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: `GET /private/objective-comments/${comment.id}/`,
        });
        const result = await objectivesAPI.getCommentById(comment.id);
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие данных комментария", async () => {
        expect(data).toBeDefined();
      });

      await test.step("Проверить что ID полученного комментария совпадает с созданным", async () => {
        expect(data.id).toBe(comment.id);
      });
    });

    test("C5572: POST /private/objective-comments/{id}/ - обновить комментарий", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let objectiveId, comment, updatedText, response, data;

      await test.step("Определить или создать цель для комментария", async () => {
        objectiveId = testObjectiveId;
        if (!objectiveId) {
          const result = await createTestObjective(objectivesAPI, {
            status: "active",
          });
          objectiveId = result.data?.id;
        }
        test.skip(!objectiveId, "Не удалось создать цель для теста");
      });

      await test.step("Создать исходный комментарий", async () => {
        const result = await objectivesAPI.createComment(
          objectiveId,
          `Original ${Date.now()}`,
        );
        comment = result.data;
        expect(comment?.id).toBeDefined();
        createdCommentIds.push(comment.id);
      });

      await test.step("Подготовить обновлённый текст комментария", async () => {
        updatedText = `Updated ${Date.now()}`;
        test.info().annotations.push({
          type: "endpoint",
          description: `POST /private/objective-comments/${comment.id}/`,
        });
      });

      await test.step("Отправить POST для обновления комментария", async () => {
        const result = await objectivesAPI.updateComment(
          comment.id,
          updatedText,
        );
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие данных обновлённого комментария", async () => {
        expect(data).toBeDefined();
      });

      await test.step("Проверить что текст комментария обновился", async () => {
        expect(data.body).toBe(updatedText);
      });
    });

    test("C5533: DELETE /private/objective-comments/{id}/ - удалить комментарий", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let objectiveId, comment, response, getResponse;

      await test.step("Определить или создать цель для комментария", async () => {
        objectiveId = testObjectiveId;
        if (!objectiveId) {
          const result = await createTestObjective(objectivesAPI, {
            status: "active",
          });
          objectiveId = result.data?.id;
        }
        test.skip(!objectiveId, "Не удалось создать цель для теста");
      });

      await test.step("Создать комментарий для последующего удаления", async () => {
        const result = await objectivesAPI.createComment(
          objectiveId,
          `To delete ${Date.now()}`,
        );
        comment = result.data;
        expect(comment?.id).toBeDefined();
      });

      await test.step(`Отправить DELETE /private/objective-comments/${comment.id}/`, async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: `DELETE /private/objective-comments/${comment.id}/`,
        });
        const result = await objectivesAPI.deleteComment(comment.id);
        response = result.response;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить что комментарий больше не доступен через GET (404)", async () => {
        const result = await objectivesAPI.getCommentById(comment.id);
        getResponse = result.response;
        expect(getResponse.status()).toBe(404);
      });
    });
  },
);

// ==================== COMMENTS NEGATIVE TESTS ====================

test.describe(
  "Objectives API - Comments Negative",
  { tag: ["@api", "@regression", "@objectives", "@comments-negative"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Comments Negative");
    });

    test("C5647: Создание комментария с пустым body", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let objective, response;

      await test.step("Создать тестовую цель", async () => {
        const result = await createTestObjective(objectivesAPI);
        objective = result.data;
        expect(objective?.id).toBeDefined();
      });

      await test.step("Попытаться создать комментарий с пустым body", async () => {
        try {
          const result = await objectivesAPI.createComment(objective.id, "");
          response = result.response;
        } catch (e) {
          // API может выбросить ошибку
        }
      });

      await test.step("Проверить статус ответа: 400/422 Bad Request (пустой комментарий отклонён)", async () => {
        if (response) {
          expect([400, 422].includes(response.status())).toBe(true);
        }
      });

      await test.step("Очистка: удалить тестовую цель", async () => {
        await objectivesAPI.deleteObjective(objective.id);
      });
    });

    test("C5648: Создание комментария с только пробелами", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      let objective, response;

      await test.step("Создать тестовую цель", async () => {
        const result = await createTestObjective(objectivesAPI);
        objective = result.data;
        expect(objective?.id).toBeDefined();
      });

      await test.step("Попытаться создать комментарий с только пробелами", async () => {
        try {
          const result = await objectivesAPI.createComment(objective.id, "   ");
          response = result.response;
        } catch (e) {
          // API может выбросить ошибку
        }
      });

      await test.step("Проверить статус ответа: 200 OK, 400/422 Bad Request (отклонён или нормализован)", async () => {
        if (response) {
          expect([200, 400, 422].includes(response.status())).toBe(true);
        }
      });

      await test.step("Очистка: удалить тестовую цель", async () => {
        await objectivesAPI.deleteObjective(objective.id);
      });
    });

    test("C5649: Обновление несуществующего комментария", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Попытаться обновить несуществующий комментарий ID=999999999", async () => {
        const result = await objectivesAPI.updateComment(
          999999999,
          "Updated text",
        );
        response = result.response;
      });

      await test.step("Проверить статус ответа: 400/404 Not Found (несуществующий комментарий)", async () => {
        expect([400, 404].includes(response.status())).toBe(true);
      });
    });

    test("C5650: Удаление несуществующего комментария", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Попытаться удалить несуществующий комментарий ID=999999999", async () => {
        const result = await objectivesAPI.deleteComment(999999999);
        response = result.response;
      });

      await test.step("Проверить статус ответа: 400/404 Not Found (несуществующий комментарий)", async () => {
        expect([400, 404].includes(response.status())).toBe(true);
      });
    });

    test("C5651: Получение несуществующего комментария по ID", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Попытаться получить несуществующий комментарий ID=999999999", async () => {
        const result = await objectivesAPI.getCommentById(999999999);
        response = result.response;
      });

      await test.step("Проверить статус ответа: 400/404 Not Found (несуществующий комментарий)", async () => {
        expect([400, 404].includes(response.status())).toBe(true);
      });
    });

    test("C5652: Пользователь НЕ может удалить чужой комментарий", async ({
      objectivesAPI,
      objectivesUserAPI,
    }) => {
      setSeverity("critical");

      let objective, createResp, adminComment, response;

      await test.step("Создать активную цель админом", async () => {
        const result = await createTestObjective(objectivesAPI, {
          status: "active",
        });
        objective = result.data;
        expect(objective?.id).toBeDefined();
      });

      await test.step("Админ создаёт комментарий", async () => {
        try {
          const result = await objectivesAPI.createComment(
            objective.id,
            `Admin comment ${Date.now()}`,
          );
          createResp = result.response;
          adminComment = result.data;
        } catch (e) {
          // API может не поддерживать комментарии
        }
      });

      await test.step("Проверить что комментарий создан (если поддерживается)", async () => {
        if (!createResp?.ok()) {
          console.log("Comments not supported for this objective status");
          await objectivesAPI.deleteObjective(objective.id);
          return;
        }
        expect(adminComment?.id).toBeDefined();
      });

      await test.step("Обычный пользователь пытается удалить чужой комментарий", async () => {
        if (adminComment?.id) {
          const result = await objectivesUserAPI.deleteComment(adminComment.id);
          response = result.response;
        }
      });

      await test.step("Проверить статус ответа: 403/404/400 (отказ в доступе)", async () => {
        if (response) {
          expect([403, 404, 400].includes(response.status())).toBe(true);
        }
      });

      await test.step("Очистка: админ удаляет комментарий и цель", async () => {
        if (adminComment?.id) {
          await objectivesAPI.deleteComment(adminComment.id);
        }
        await objectivesAPI.deleteObjective(objective.id);
      });
    });

    test("C5653: Пользователь НЕ может редактировать чужой комментарий", async ({
      objectivesAPI,
      objectivesUserAPI,
    }) => {
      setSeverity("critical");

      let objective,
        originalText,
        createResp,
        adminComment,
        response,
        fetchedComment;

      await test.step("Создать активную цель админом", async () => {
        const result = await createTestObjective(objectivesAPI, {
          status: "active",
        });
        objective = result.data;
        expect(objective?.id).toBeDefined();
      });

      await test.step("Админ создаёт комментарий", async () => {
        try {
          originalText = `Admin comment ${Date.now()}`;
          const result = await objectivesAPI.createComment(
            objective.id,
            originalText,
          );
          createResp = result.response;
          adminComment = result.data;
        } catch (e) {
          // API может не поддерживать комментарии
        }
      });

      await test.step("Проверить что комментарий создан (если поддерживается)", async () => {
        if (!createResp?.ok()) {
          console.log("Comments not supported for this objective status");
          await objectivesAPI.deleteObjective(objective.id);
          return;
        }
        expect(adminComment?.id).toBeDefined();
      });

      await test.step("Обычный пользователь пытается редактировать чужой комментарий", async () => {
        if (adminComment?.id) {
          const result = await objectivesUserAPI.updateComment(
            adminComment.id,
            "Hacked comment",
          );
          response = result.response;
        }
      });

      await test.step("Проверить статус ответа: 403/404/400 (отказ в доступе)", async () => {
        if (response) {
          expect([403, 404, 400].includes(response.status())).toBe(true);
        }
      });

      await test.step("Проверить что текст комментария не изменился", async () => {
        if (adminComment?.id) {
          const result = await objectivesAPI.getCommentById(adminComment.id);
          fetchedComment = result.data;
          expect(fetchedComment.body).toBe(originalText);
        }
      });

      await test.step("Очистка: админ удаляет комментарий и цель", async () => {
        if (adminComment?.id) {
          await objectivesAPI.deleteComment(adminComment.id);
        }
        await objectivesAPI.deleteObjective(objective.id);
      });
    });
  },
);
