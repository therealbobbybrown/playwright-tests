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
  assertValidArray,
} from "../../utils/api/common-assertions.js";

/**
 * API тесты для модуля Objectives (Цели) — CRUD операции
 *
 * Покрытие:
 * - Получение списков целей (мои, подчинённых, черновики)
 * - Создание, чтение, обновление, удаление целей
 * - Milestones в составе целей
 */

// Расширяем test с фикстурой для Objectives API
const test = fullTest.extend({
  objectivesAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Хранение созданных ID для cleanup
const createdObjectiveIds = [];

// Хелпер для получения дат текущего квартала
function getCurrentQuarterDates() {
  const now = new Date();
  const year = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  const starts = ["01-01", "04-01", "07-01", "10-01"];
  const ends = ["03-31", "06-30", "09-30", "12-31"];
  return {
    startDate: `${year}-${starts[q - 1]}`,
    endDate: `${year}-${ends[q - 1]}`,
  };
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
  const { startDate, endDate } = getCurrentQuarterDates();
  const timestamp = Date.now();

  // Получаем ID текущего пользователя
  const responsibleUserId =
    overrides.responsibleUserId || (await getCurrentUserId(objectivesAPI));

  const objectiveData = {
    title: `Test Objective ${timestamp}`,
    description: `Test objective description ${timestamp}`,
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

// ==================== OBJECTIVES CRUD ====================

test.describe(
  "Objectives API - CRUD",
  { tag: ["@api", "@regression", "@objectives", "@crud"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "CRUD");
    });

    test(
      "C5552: POST /private/objectives/get - получить список всех целей",
      { tag: ["@critical"] },
      async ({ objectivesAPI }) => {
        setSeverity("critical");

        let startDate, endDate, response, data, items;

        await test.step("Подготовить параметры запроса: текущий период", async () => {
          const dates = getCurrentQuarterDates();
          startDate = dates.startDate;
          endDate = dates.endDate;
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /private/objectives/get",
          });
          test.info().annotations.push({
            type: "params",
            description: `period: ${startDate} - ${endDate}, limit: 20`,
          });
        });

        await test.step("Отправить POST /private/objectives/get с параметрами текущего периода", async () => {
          const result = await objectivesAPI.getObjectives({
            startDate,
            endDate,
            limit: 20,
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие данных в ответе", async () => {
          expect(data).toBeDefined();
        });

        await test.step("Извлечь и валидировать массив целей", async () => {
          items = data?.items || data || [];
          assertValidArray(items);
        });

        await test.step("Проверить метаданные пагинации: total", async () => {
          if (data?.total !== undefined) {
            expect(typeof data.total).toBe("number");
            expect(data.total).toBeGreaterThanOrEqual(0);
          }
        });

        await test.step("Проверить структуру объекта цели (если есть данные)", async () => {
          if (items.length > 0) {
            const objective = items[0];
            expect(objective.id, "Цель должна иметь ID").toBeDefined();
            expect(objective.title, "Цель должна иметь title").toBeDefined();
            expect(typeof objective.title).toBe("string");
          }
        });

        await test.step("Проверить опциональные поля: status, startDate, endDate", async () => {
          if (items.length > 0) {
            const objective = items[0];
            if (objective.status) {
              expect(["draft", "active"]).toContain(objective.status);
            }
            if (objective.startDate) {
              expect(typeof objective.startDate).toBe("string");
            }
            if (objective.endDate) {
              expect(typeof objective.endDate).toBe("string");
            }
          }
        });
      },
    );

    test(
      "C5553: POST /private/objectives/get/mine - получить мои цели",
      { tag: ["@critical"] },
      async ({ objectivesAPI }) => {
        setSeverity("critical");

        let startDate, endDate, response, data, items;

        await test.step("Подготовить параметры запроса: текущий период", async () => {
          const dates = getCurrentQuarterDates();
          startDate = dates.startDate;
          endDate = dates.endDate;
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /private/objectives/get/mine",
          });
        });

        await test.step("Отправить POST /private/objectives/get/mine для получения моих целей", async () => {
          const result = await objectivesAPI.getMyObjectives({
            startDate,
            endDate,
            limit: 20,
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие данных в ответе", async () => {
          expect(data).toBeDefined();
        });

        await test.step("Извлечь и валидировать массив моих целей", async () => {
          items = data?.items || data || [];
          assertValidArray(items);
        });

        await test.step("Проверить метаданные пагинации: total", async () => {
          if (data?.total !== undefined) {
            expect(typeof data.total).toBe("number");
          }
        });

        await test.step("Проверить структуру цели (если есть данные)", async () => {
          if (items.length > 0) {
            const objective = items[0];
            expect(objective.id).toBeDefined();
            expect(objective.title).toBeDefined();
          }
        });
      },
    );

    test("C5554: POST /private/objectives/get/subordinates - получить цели подчинённых", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let startDate, endDate, response, data, items;

      await test.step("Подготовить параметры запроса: текущий период", async () => {
        const dates = getCurrentQuarterDates();
        startDate = dates.startDate;
        endDate = dates.endDate;
        test.info().annotations.push({
          type: "endpoint",
          description: "POST /private/objectives/get/subordinates",
        });
      });

      await test.step("Отправить POST /private/objectives/get/subordinates для получения целей подчинённых", async () => {
        const result = await objectivesAPI.getSubordinatesObjectives({
          startDate,
          endDate,
          limit: 20,
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие данных в ответе", async () => {
        expect(data).toBeDefined();
      });

      await test.step("Извлечь и валидировать массив целей подчинённых", async () => {
        items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5555: GET /private/objectives/draft - получить черновики", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response, data, items;

      await test.step("Отправить GET /private/objectives/draft с limit=20", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "GET /private/objectives/draft",
        });
        const result = await objectivesAPI.getDraftObjectives({ limit: 20 });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие данных в ответе", async () => {
        expect(data).toBeDefined();
      });

      await test.step("Извлечь и валидировать массив черновиков", async () => {
        items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5556: GET /private/objectives/is-empty - проверить наличие целей", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response, data;

      await test.step("Отправить GET /private/objectives/is-empty", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "GET /private/objectives/is-empty",
        });
        const result = await objectivesAPI.checkIsEmpty();
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие данных в ответе", async () => {
        expect(data).toBeDefined();
      });

      await test.step("Проверить тип ответа: boolean или объект с флагом isEmpty/empty", async () => {
        expect(
          typeof data === "boolean" ||
            typeof data?.isEmpty === "boolean" ||
            typeof data?.empty === "boolean",
        ).toBe(true);
      });
    });

    test(
      "C5557: POST /private/objectives/ - создать цель (черновик)",
      { tag: ["@critical", "@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let response, data, objectiveData;

        await test.step("Создать тестовую цель через хелпер createTestObjective", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /private/objectives/",
          });
          const result = await createTestObjective(objectivesAPI);
          response = result.response;
          data = result.data;
          objectiveData = result.objectiveData;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие данных созданной цели", async () => {
          expect(data).toBeDefined();
        });

        await test.step("Проверить наличие и тип ID созданной цели", async () => {
          expect(data.id).toBeDefined();
          expect(typeof data.id).toBe("number");
        });

        await test.step("Проверить соответствие основных полей цели отправленным данным", async () => {
          expect(data.title).toBe(objectiveData.title);
          expect(data.description).toBe(objectiveData.description);
          // API возвращает даты в ISO-формате ("2026-01-01T00:00:00.000Z"), проверяем по префиксу
          expect(data.startDate).toContain(objectiveData.startDate);
          expect(data.endDate).toContain(objectiveData.endDate);
          expect(data.level).toBe(objectiveData.level);
          expect(data.responsibleUserId).toBe(objectiveData.responsibleUserId);
        });

        await test.step("Проверить статус созданной цели: draft", async () => {
          expect(data.status).toBe("draft");
        });

        await test.step("Проверить наличие и количество milestones: 2", async () => {
          expect(data.milestones).toBeDefined();
          expect(Array.isArray(data.milestones)).toBe(true);
          expect(data.milestones.length).toBe(2);
        });

        await test.step("Проверить структуру первого milestone", async () => {
          const milestone = data.milestones[0];
          expect(milestone.title).toBeDefined();
          expect(typeof milestone.title).toBe("string");
          if (milestone.weight !== undefined) {
            expect(typeof milestone.weight).toBe("number");
          }
        });

        await test.step("DB: Проверить создание цели в базе данных", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
        });

        await test.step("DB: Проверить статус цели в БД: draft", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveStatus(data.id, "draft");
        });

        await test.step('DB: Проверить что title цели в БД содержит "Test Objective"', async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveTitleContains(
            data.id,
            "Test Objective",
          );
        });
      },
    );

    test(
      "C5558: GET /private/objectives/{id}/ - получить цель по ID",
      { tag: ["@critical", "@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let createdObjective, response, data, objective;

        await test.step("Создать тестовую цель для последующего получения", async () => {
          const result = await createTestObjective(objectivesAPI);
          createdObjective = result.data;
          expect(createdObjective?.id).toBeDefined();
        });

        await test.step(`Отправить GET /private/objectives/${createdObjective.id}/`, async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: `GET /private/objectives/${createdObjective.id}/`,
          });
          const result = await objectivesAPI.getObjectiveById(
            createdObjective.id,
          );
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие данных в ответе", async () => {
          expect(data).toBeDefined();
        });

        await test.step("Извлечь объект цели из ответа (objective || data)", async () => {
          objective = data.objective || data;
        });

        await test.step("Проверить ID цели совпадает с созданным", async () => {
          expect(objective.id).toBe(createdObjective.id);
        });

        await test.step("Проверить соответствие основных полей цели", async () => {
          expect(objective.title).toBe(createdObjective.title);
          expect(objective.description).toBe(createdObjective.description);
          expect(objective.status).toBe(createdObjective.status);
          expect(objective.startDate).toBe(createdObjective.startDate);
          expect(objective.endDate).toBe(createdObjective.endDate);
        });

        await test.step("Проверить наличие и количество milestones", async () => {
          expect(objective.milestones).toBeDefined();
          expect(Array.isArray(objective.milestones)).toBe(true);
          expect(objective.milestones.length).toBe(
            createdObjective.milestones.length,
          );
        });

        await test.step("Проверить что каждый milestone имеет реальный ID (не temporaryId)", async () => {
          for (const milestone of objective.milestones) {
            expect(milestone.id).toBeDefined();
            expect(typeof milestone.id).toBe("number");
            expect(milestone.title).toBeDefined();
            if (milestone.progress !== undefined) {
              expect(typeof milestone.progress).toBe("number");
            }
          }
        });

        await test.step("Проверить флаг isCanEdit (если присутствует)", async () => {
          if (data.isCanEdit !== undefined) {
            expect(typeof data.isCanEdit).toBe("boolean");
          }
        });

        await test.step("DB: Получить цель из базы данных", async () => {
          if (!objectivesVerifier.isConnected()) return;
          const dbObjective = await objectivesVerifier.getObjective(
            createdObjective.id,
          );
          expect(dbObjective).not.toBeNull();
        });

        await test.step("DB: Проверить соответствие title в БД", async () => {
          if (!objectivesVerifier.isConnected()) return;
          const dbObjective = await objectivesVerifier.getObjective(
            createdObjective.id,
          );
          expect(dbObjective.title).toBe(objective.title);
        });
      },
    );

    test(
      "C5559: POST /private/objectives/ - обновить существующую цель",
      { tag: ["@critical", "@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let createdObjective, updatedTitle, response, data;

        await test.step("Создать тестовую цель для последующего обновления", async () => {
          const result = await createTestObjective(objectivesAPI);
          createdObjective = result.data;
          expect(createdObjective?.id).toBeDefined();
        });

        await test.step("Подготовить новый title для обновления цели", async () => {
          updatedTitle = `Updated Objective ${Date.now()}`;
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /private/objectives/ (update)",
          });
          test.info().annotations.push({
            type: "objectiveId",
            description: String(createdObjective.id),
          });
        });

        await test.step("Отправить POST /private/objectives/ с обновлёнными данными цели", async () => {
          const result = await objectivesAPI.saveObjective({
            id: createdObjective.id,
            title: updatedTitle,
            description: createdObjective.description,
            startDate: createdObjective.startDate,
            endDate: createdObjective.endDate,
            status: createdObjective.status,
            level: createdObjective.level,
            responsibleUserId: createdObjective.responsibleUserId,
            userAccessType: createdObjective.userAccessType || "everybody",
            milestones: createdObjective.milestones,
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие данных обновлённой цели", async () => {
          expect(data).toBeDefined();
        });

        await test.step("Проверить что title цели обновился на новое значение", async () => {
          expect(data.title).toBe(updatedTitle);
        });

        await test.step("DB: Проверить обновление title цели в базе данных", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveTitle(
            createdObjective.id,
            updatedTitle,
          );
        });
      },
    );

    test(
      "C5560: DELETE /private/objectives/{id} - удалить цель",
      { tag: ["@critical", "@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let createdObjective, response, getResponse;

        await test.step("Создать тестовую цель для последующего удаления", async () => {
          const result = await createTestObjective(objectivesAPI);
          createdObjective = result.data;
          expect(createdObjective?.id).toBeDefined();
        });

        await test.step("Убрать ID цели из списка cleanup (удалим вручную)", async () => {
          const idx = createdObjectiveIds.indexOf(createdObjective.id);
          if (idx > -1) createdObjectiveIds.splice(idx, 1);
        });

        await test.step(`Отправить DELETE /private/objectives/${createdObjective.id}`, async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: `DELETE /private/objectives/${createdObjective.id}`,
          });
          const result = await objectivesAPI.deleteObjective(
            createdObjective.id,
          );
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить что цель больше не доступна через GET (404)", async () => {
          const result = await objectivesAPI.getObjectiveById(
            createdObjective.id,
          );
          getResponse = result.response;
          expect(getResponse.status()).toBe(404);
        });

        await test.step("DB: Проверить что цель удалена из базы данных", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveDeleted(createdObjective.id);
        });
      },
    );

    test(
      "C5561: Цель содержит milestones",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        let createdObjective;

        await test.step("Создать тестовую цель с milestones", async () => {
          const result = await createTestObjective(objectivesAPI);
          createdObjective = result.data;
        });

        await test.step("Проверить что цель создана и имеет ID", async () => {
          expect(createdObjective?.id).toBeDefined();
        });

        await test.step("Проверить наличие milestones в созданной цели", async () => {
          expect(createdObjective.milestones).toBeDefined();
        });

        await test.step("Проверить что milestones является массивом", async () => {
          expect(Array.isArray(createdObjective.milestones)).toBe(true);
        });

        await test.step("Проверить количество milestones: 2", async () => {
          expect(createdObjective.milestones.length).toBe(2);
        });

        await test.step("DB: Проверить что цель существует в базе данных", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(createdObjective.id);
        });

        await test.step("DB: Проверить количество key results в БД: 2", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyKeyResultsCount(
            createdObjective.id,
            2,
          );
        });
      },
    );
  },
);
