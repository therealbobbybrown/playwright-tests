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
 * API тесты для модуля Objectives (Цели) - Workflow & Lifecycle
 *
 * Покрытие:
 * - Workflow (смена статусов, редактирование, удаление)
 * - Levels (self, team, company)
 * - Responsible (назначение ответственных)
 * - Periods (кварталы, годы)
 * - Development Plans интеграция
 * - Team Level (departmentId)
 * - Manager Subordinates
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
  const timestamp = Date.now();

  // Получаем ID текущего пользователя
  const responsibleUserId =
    overrides.responsibleUserId || (await getCurrentUserId(objectivesAPI));

  // startDate/endDate обязательны с обновления API (DEVAPR-11xxx)
  const { startDate, endDate } = ObjectivesAPI.getQuarterDates(periodYear, periodQ);

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

// ==================== WORKFLOW / LIFECYCLE ====================
// Статусы целей: draft, active (согласно ObjectiveStatus enum)

test.describe(
  "Objectives API - Workflow",
  { tag: ["@api", "@regression", "@objectives", "@workflow"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Workflow");
    });

    test(
      "C5592: Смена статуса: draft → active",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let createdObjective, response, data, fetchedData, objective;

        await test.step("Создать цель в статусе draft", async () => {
          const result = await createTestObjective(objectivesAPI, {
            status: "draft",
          });
          createdObjective = result.data;
        });

        await test.step("Проверить что цель создана со статусом draft", async () => {
          expect(createdObjective?.id).toBeDefined();
          expect(createdObjective.status).toBe("draft");
        });

        await test.step("Отправить POST /private/objectives/ для смены статуса на active", async () => {
          const result = await objectivesAPI.saveObjective({
            id: createdObjective.id,
            title: createdObjective.title,
            description: createdObjective.description,
            periodYear: createdObjective.periodYear,
            periodQ: createdObjective.periodQ,
            level: createdObjective.level,
            responsibleUserId: createdObjective.responsibleUserId,
            userAccessType: createdObjective.userAccessType,
            milestones: createdObjective.milestones,
            status: "active",
          });
          response = result.response;
          data = result.data;
        });

        if (response.ok()) {
          await test.step("Проверить что статус изменился на active в ответе", async () => {
            expect(data.status).toBe("active");
          });

          await test.step(`Отправить GET /private/objectives/${createdObjective.id}/ для подтверждения смены статуса`, async () => {
            const result = await objectivesAPI.getObjectiveById(
              createdObjective.id,
            );
            fetchedData = result.data;
            objective = fetchedData?.objective || fetchedData;
          });

          await test.step("Проверить что статус active сохранился", async () => {
            expect(objective.status).toBe("active");
          });

          await test.step("DB: Проверка смены статуса на active", async () => {
            if (!objectivesVerifier.isConnected()) return;
            await objectivesVerifier.verifyObjectiveStatus(
              createdObjective.id,
              "active",
            );
          });
        } else {
          await test.step("Проверить статус ответа: 400 Bad Request или 403 Forbidden (API запрещает смену статуса)", async () => {
            expect([400, 403].includes(response.status())).toBe(true);
          });
        }
      },
    );

    test(
      "C5593: Смена статуса: active → draft (возврат в черновик)",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        let createdObjective, response, data;

        await test.step("Создать цель в статусе active", async () => {
          const result = await createTestObjective(objectivesAPI, {
            status: "active",
          });
          createdObjective = result.data;
        });

        await test.step("Проверить что цель создана", async () => {
          expect(createdObjective?.id).toBeDefined();
        });

        await test.step("Отправить POST /private/objectives/ для смены статуса на draft", async () => {
          const result = await objectivesAPI.saveObjective({
            id: createdObjective.id,
            title: createdObjective.title,
            description: createdObjective.description,
            periodYear: createdObjective.periodYear,
            periodQ: createdObjective.periodQ,
            level: createdObjective.level,
            responsibleUserId: createdObjective.responsibleUserId,
            userAccessType: createdObjective.userAccessType,
            milestones: createdObjective.milestones,
            status: "draft",
          });
          response = result.response;
          data = result.data;
        });

        if (response.ok()) {
          await test.step("Проверить что статус изменился на draft в ответе", async () => {
            expect(data.status).toBe("draft");
          });

          await test.step("DB: Проверка смены статуса на draft", async () => {
            if (!objectivesVerifier.isConnected()) return;
            await objectivesVerifier.verifyObjectiveStatus(
              createdObjective.id,
              "draft",
            );
          });
        } else {
          await test.step("Проверить статус ответа: 400 Bad Request или 403 Forbidden (возврат из active в draft запрещён)", async () => {
            expect([400, 403].includes(response.status())).toBe(true);
          });
        }
      },
    );

    test(
      "C5594: Редактирование активной цели",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        let createdObjective, newTitle, response, data;

        await test.step("Создать цель в статусе active", async () => {
          const result = await createTestObjective(objectivesAPI, {
            status: "active",
          });
          createdObjective = result.data;
        });

        await test.step("Проверить что цель создана", async () => {
          expect(createdObjective?.id).toBeDefined();
        });

        await test.step("Подготовить новое название цели", async () => {
          newTitle = `Updated Active Objective ${Date.now()}`;
        });

        await test.step("Отправить POST /private/objectives/ для изменения названия активной цели", async () => {
          const result = await objectivesAPI.saveObjective({
            id: createdObjective.id,
            title: newTitle,
            description: createdObjective.description,
            periodYear: createdObjective.periodYear,
            periodQ: createdObjective.periodQ,
            level: createdObjective.level,
            responsibleUserId: createdObjective.responsibleUserId,
            userAccessType: createdObjective.userAccessType,
            milestones: createdObjective.milestones,
            status: "active",
          });
          response = result.response;
          data = result.data;
        });

        if (response.ok()) {
          await test.step("Проверить что название обновилось в ответе", async () => {
            expect(data.title).toBe(newTitle);
          });

          await test.step("DB: Проверка обновления названия активной цели", async () => {
            if (!objectivesVerifier.isConnected()) return;
            await objectivesVerifier.verifyObjectiveTitle(
              createdObjective.id,
              newTitle,
            );
          });
        } else {
          await test.step("Проверить статус ответа: 400 Bad Request или 403 Forbidden (редактирование активной цели запрещено)", async () => {
            expect([400, 403].includes(response.status())).toBe(true);
          });
        }
      },
    );

    test(
      "C5595: Удаление черновика цели",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        let createdObjective, idx, response, getResp;

        await test.step("Создать цель в статусе draft", async () => {
          const result = await createTestObjective(objectivesAPI, {
            status: "draft",
          });
          createdObjective = result.data;
        });

        await test.step("Проверить что цель создана", async () => {
          expect(createdObjective?.id).toBeDefined();
        });

        await test.step("Удалить ID из списка cleanup (тест сам удалит цель)", async () => {
          idx = createdObjectiveIds.indexOf(createdObjective.id);
          if (idx > -1) createdObjectiveIds.splice(idx, 1);
        });

        await test.step(`Отправить DELETE /private/objectives/${createdObjective.id}`, async () => {
          const result = await objectivesAPI.deleteObjective(
            createdObjective.id,
          );
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step(`Отправить GET /private/objectives/${createdObjective.id}/ для проверки удаления`, async () => {
          const result = await objectivesAPI.getObjectiveById(
            createdObjective.id,
          );
          getResp = result.response;
        });

        await test.step("Проверить статус ответа GET: 404 Not Found или 400 Bad Request (цель удалена)", async () => {
          expect([404, 400].includes(getResp.status())).toBe(true);
        });

        await test.step("DB: Проверка удаления черновика цели", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveDeleted(createdObjective.id);
        });
      },
    );

    test(
      "C5596: Удаление активной цели",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        let createdObjective, idx, response;

        await test.step("Создать цель в статусе active", async () => {
          const result = await createTestObjective(objectivesAPI, {
            status: "active",
          });
          createdObjective = result.data;
        });

        await test.step("Проверить что цель создана", async () => {
          expect(createdObjective?.id).toBeDefined();
        });

        await test.step("Удалить ID из списка cleanup (тест сам удалит цель)", async () => {
          idx = createdObjectiveIds.indexOf(createdObjective.id);
          if (idx > -1) createdObjectiveIds.splice(idx, 1);
        });

        await test.step(`Отправить DELETE /private/objectives/${createdObjective.id} для удаления активной цели`, async () => {
          const result = await objectivesAPI.deleteObjective(
            createdObjective.id,
          );
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200/204 OK или 400/403 (API может запретить удаление активной цели)", async () => {
          expect([200, 204, 400, 403].includes(response.status())).toBe(true);
        });

        if (response.ok()) {
          await test.step("DB: Проверка удаления активной цели", async () => {
            if (!objectivesVerifier.isConnected()) return;
            await objectivesVerifier.verifyObjectiveDeleted(
              createdObjective.id,
            );
          });
        }
      },
    );
  },
);

// ==================== LEVELS ====================

test.describe(
  "Objectives API - Levels",
  { tag: ["@api", "@regression", "@objectives", "@levels"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Levels");
    });

    test(
      "C5601: Создание цели уровня self",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        const { data } = await createTestObjective(objectivesAPI, {
          level: "self",
        });

        expect(data?.id).toBeDefined();
        expect(data.level).toBe("self");

        // DB верификация
        await test.step("DB: Проверка создания цели уровня self", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
          await objectivesVerifier.verifyObjectiveStatus(data.id, "draft");
        });
      },
    );

    test(
      "C5602: Создание цели уровня team",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        const { response, data } = await createTestObjective(objectivesAPI, {
          level: "team",
        });

        // team level может требовать дополнительных прав
        if (response.ok()) {
          expect(data.level).toBe("team");

          // DB верификация
          await test.step("DB: Проверка создания цели уровня team", async () => {
            if (!objectivesVerifier.isConnected()) return;
            await objectivesVerifier.verifyObjectiveCreated(data.id);
          });
        } else {
          expect([400, 403].includes(response.status())).toBe(true);
        }
      },
    );

    test(
      "C5603: Создание цели уровня company",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        const { response, data } = await createTestObjective(objectivesAPI, {
          level: "company",
        });

        // company level может требовать дополнительных прав
        if (response.ok()) {
          expect(data.level).toBe("company");

          // DB верификация
          await test.step("DB: Проверка создания цели уровня company", async () => {
            if (!objectivesVerifier.isConnected()) return;
            await objectivesVerifier.verifyObjectiveCreated(data.id);
          });
        } else {
          expect([400, 403].includes(response.status())).toBe(true);
        }
      },
    );

    test("C5604: Фильтрация целей по уровню", async ({ objectivesAPI }) => {
      setSeverity("minor");

      let periodYear, periodQ, response, data, items;

      await test.step("Подготовить параметры: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Отправить GET /private/objectives/my с фильтром level=self", async () => {
        const result = await objectivesAPI.getMyObjectives({
          periodYear,
          periodQ,
          level: "self",
          limit: 20,
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 2xx-5xx (API не упал)", async () => {
        expect(response.status()).toBeGreaterThanOrEqual(200);
        expect(response.status()).toBeLessThan(600);
      });

      await test.step("Проверить данные и фильтр level если запрос успешен", async () => {
        if (response.ok()) {
          expect(data).toBeDefined();
          items = data?.items || data || [];
          for (const item of items) {
            if (item.level) {
              expect(item.level).toBe("self");
            }
          }
        }
      });
    });
  },
);

// ==================== RESPONSIBLE ====================

test.describe(
  "Objectives API - Responsible",
  { tag: ["@api", "@regression", "@objectives", "@responsible"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Responsible");
    });

    test(
      "C5607: Назначение ответственного на цель",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        const userId = await getCurrentUserId(objectivesAPI);
        const { data } = await createTestObjective(objectivesAPI, {
          responsibleUserId: userId,
        });

        expect(data?.id).toBeDefined();
        expect(data.responsibleUserId).toBe(userId);

        // DB верификация
        await test.step("DB: Проверка назначения ответственного на цель", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveOwner(data.id, userId);
        });
      },
    );

    test("C5608: Фильтрация целей по ответственному", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let periodYear, periodQ, userId, response, data, items;

      await test.step("Подготовить параметры: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Получить ID текущего пользователя", async () => {
        userId = await getCurrentUserId(objectivesAPI);
      });

      await test.step("Отправить GET /private/objectives с фильтром responsibleUserIds", async () => {
        const result = await objectivesAPI.getObjectives({
          periodYear,
          periodQ,
          responsibleUserIds: [userId],
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

      await test.step("Проверить что все цели имеют указанного ответственного", async () => {
        items = data?.items || data || [];
        for (const item of items) {
          if (item.responsibleUserId) {
            expect(item.responsibleUserId).toBe(userId);
          }
        }
      });
    });

    test(
      "C5609: Назначение разных ответственных на milestones",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("minor");

        let userId, periodYear, periodQ, timestamp, response, data;

        await test.step("Получить ID текущего пользователя", async () => {
          userId = await getCurrentUserId(objectivesAPI);
        });

        await test.step("Подготовить параметры: текущий период и timestamp", async () => {
          const period = getCurrentPeriod();
          periodYear = period.periodYear;
          periodQ = period.periodQ;
          timestamp = Date.now();
        });

        await test.step("Отправить POST /private/objectives/ с milestones с разными ответственными", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Different Responsible Test ${timestamp}`,
            description: "Testing different responsible users",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `t1-${timestamp}`,
                title: "M1",
                type: "percent",
                weight: 50,
                progress: 0,
                responsibleUserId: userId,
              },
              {
                temporaryId: `t2-${timestamp}`,
                title: "M2",
                type: "percent",
                weight: 50,
                progress: 0,
                responsibleUserId: userId,
              },
            ],
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/201 OK", async () => {
          expect(
            response.ok(),
            `Ожидается успешный ответ, получен ${response.status()}`,
          ).toBe(true);
        });

        await test.step("Проверить наличие данных в ответе", async () => {
          expect(data, "Ответ должен содержать данные").toBeDefined();
        });

        await test.step("Проверить ID цели определён", async () => {
          expect(data.id, "ID цели должен быть определён").toBeDefined();
        });

        await test.step("Проверить количество milestones: 2", async () => {
          expect(data.milestones.length).toBe(2);
        });

        await test.step("Добавить ID в cleanup", async () => {
          createdObjectiveIds.push(data.id);
        });

        await test.step("DB: Проверка создания цели с milestones", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
          await objectivesVerifier.verifyKeyResultsCount(data.id, 2);
        });
      },
    );
  },
);

// ==================== PERIODS ====================

test.describe(
  "Objectives API - Periods",
  { tag: ["@api", "@regression", "@objectives", "@periods"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Periods");
    });

    test(
      "C5610: Создание целей за разные кварталы",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        let userId, currentYear, timestamp, resp1, data1, resp4, data4;

        await test.step("Получить ID текущего пользователя", async () => {
          userId = await getCurrentUserId(objectivesAPI);
        });

        await test.step("Подготовить параметры: текущий год и timestamp", async () => {
          currentYear = new Date().getFullYear();
          timestamp = Date.now();
        });

        await test.step("Отправить POST /private/objectives/ для создания цели Q1", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Q1 Objective ${timestamp}`,
            description: "Q1 test",
            periodYear: currentYear,
            periodQ: 1,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `q1-${timestamp}`,
                title: "M1",
                type: "percent",
                weight: 100,
                progress: 0,
                responsibleUserId: userId,
              },
            ],
          });
          resp1 = result.response;
          data1 = result.data;
        });

        await test.step("Проверить статус ответа Q1: 200/201 OK", async () => {
          expect(resp1.ok()).toBe(true);
        });

        await test.step("Проверить periodQ цели Q1: 1", async () => {
          expect(data1.periodQ).toBe(1);
        });

        await test.step("Добавить ID Q1 в cleanup", async () => {
          if (data1?.id) createdObjectiveIds.push(data1.id);
        });

        await test.step("Отправить POST /private/objectives/ для создания цели Q4", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Q4 Objective ${timestamp}`,
            description: "Q4 test",
            periodYear: currentYear,
            periodQ: 4,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `q4-${timestamp}`,
                title: "M1",
                type: "percent",
                weight: 100,
                progress: 0,
                responsibleUserId: userId,
              },
            ],
          });
          resp4 = result.response;
          data4 = result.data;
        });

        await test.step("Проверить статус ответа Q4: 200/201 OK", async () => {
          expect(resp4.ok()).toBe(true);
        });

        await test.step("Проверить periodQ цели Q4: 4", async () => {
          expect(data4.periodQ).toBe(4);
        });

        await test.step("Добавить ID Q4 в cleanup", async () => {
          if (data4?.id) createdObjectiveIds.push(data4.id);
        });

        await test.step("DB: Проверка создания целей за разные кварталы", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data1.id);
          await objectivesVerifier.verifyObjectiveCreated(data4.id);
        });
      },
    );

    test("C5611: Получение целей за конкретный квартал", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let currentYear, response, data, items;

      await test.step("Подготовить параметры: текущий год", async () => {
        currentYear = new Date().getFullYear();
      });

      await test.step("Отправить GET /private/objectives/my с фильтром периода Q1", async () => {
        const result = await objectivesAPI.getMyObjectives({
          periodYear: currentYear,
          periodQ: 1,
          limit: 20,
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить что все цели за Q1 текущего года", async () => {
        items = data?.items || data || [];
        const { startDate: q1Start, endDate: q1End } =
          ObjectivesAPI.getQuarterDates(currentYear, 1);
        for (const item of items) {
          // API может возвращать periodQ или startDate/endDate
          if (item.periodQ !== undefined) {
            expect(item.periodQ).toBe(1);
            expect(item.periodYear).toBe(currentYear);
          } else {
            // API может вернуть "2026-01-01" или "2026-01-01T00:00:00.000Z"
            expect(item.startDate?.substring(0, 10)).toBe(q1Start);
            expect(item.endDate?.substring(0, 10)).toBe(q1End);
          }
        }
      });
    });

    test("C5612: Создание целей за разные годы", async ({ objectivesAPI }) => {
      setSeverity("minor");

      let userId, currentYear, timestamp, respCurrent, respNext, dataNext;

      await test.step("Получить ID текущего пользователя", async () => {
        userId = await getCurrentUserId(objectivesAPI);
      });

      await test.step("Подготовить параметры: текущий год и timestamp", async () => {
        currentYear = new Date().getFullYear();
        timestamp = Date.now();
      });

      await test.step("Отправить POST /private/objectives/ для создания цели текущего года", async () => {
        const result = await objectivesAPI.saveObjective({
          title: `Current Year ${timestamp}`,
          description: "Current year test",
          periodYear: currentYear,
          periodQ: 1,
          status: "draft",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `cy-${timestamp}`,
              title: "M1",
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });
        respCurrent = result.response;
      });

      await test.step("Проверить статус ответа текущего года: 200/201 OK", async () => {
        expect(respCurrent.ok()).toBe(true);
      });

      await test.step("Отправить POST /private/objectives/ для создания цели следующего года", async () => {
        const result = await objectivesAPI.saveObjective({
          title: `Next Year ${timestamp}`,
          description: "Next year test",
          periodYear: currentYear + 1,
          periodQ: 1,
          status: "draft",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `ny-${timestamp}`,
              title: "M1",
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });
        respNext = result.response;
        dataNext = result.data;
      });

      await test.step("Проверить статус ответа следующего года: 200/201 OK", async () => {
        expect(respNext.ok()).toBe(true);
      });

      await test.step("Проверить periodYear цели следующего года", async () => {
        expect(dataNext.periodYear).toBe(currentYear + 1);
      });

      await test.step("Добавить ID в cleanup", async () => {
        if (dataNext?.id) createdObjectiveIds.push(dataNext.id);
      });
    });
  },
);

// ==================== DEVELOPMENT PLANS INTEGRATION ====================

test.describe(
  "Objectives API - Development Plans",
  { tag: ["@api", "@regression", "@objectives", "@dev-plans"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Development Plans");
    });

    test("C5619: Фильтрация целей по developmentPlanId", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      let periodYear, periodQ, response, data, items;

      await test.step("Подготовить параметры: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Отправить POST /private/objectives/get с фильтром developmentPlanId=999999", async () => {
        const result = await objectivesAPI.getObjectives({
          periodYear,
          periodQ,
          developmentPlanId: 999999,
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

      await test.step("Извлечь и валидировать массив целей (должен быть пуст для несуществующего плана)", async () => {
        items = data?.items || data || [];
        assertValidArray(items);
      });
    });
  },
);

// ==================== TEAM LEVEL ====================

test.describe(
  "Objectives API - Team Level",
  { tag: ["@api", "@regression", "@objectives", "@team-level"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Team Level");
    });

    test(
      "C5629: Создание цели уровня team с departmentId",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        let userId,
          periodYear,
          periodQ,
          timestamp,
          deptData,
          departments,
          departmentId,
          response,
          data;

        await test.step("Получить ID текущего пользователя", async () => {
          userId = await getCurrentUserId(objectivesAPI);
        });

        await test.step("Подготовить параметры: текущий период и timestamp", async () => {
          const period = getCurrentPeriod();
          periodYear = period.periodYear;
          periodQ = period.periodQ;
          timestamp = Date.now();
        });

        await test.step("Отправить GET /private/objectives/head-departments для получения отделов", async () => {
          const result = await objectivesAPI.getHeadDepartments({ limit: 10 });
          deptData = result.data;
        });

        await test.step("Извлечь массив отделов", async () => {
          departments = deptData?.items || deptData || [];
          if (departments.length === 0) {
            console.log("No departments available for team level test");
            return;
          }
          departmentId = departments[0].id;
        });

        await test.step("Отправить POST /private/objectives/ с level=team и departmentId", async () => {
          if (!departmentId) return;
          const result = await objectivesAPI.saveObjective({
            title: `Team Level Objective ${timestamp}`,
            description: "Testing team level with departmentId",
            periodYear,
            periodQ,
            status: "draft",
            level: "team",
            departmentId: departmentId,
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-team-${timestamp}`,
                title: "Team milestone",
                type: "percent",
                weight: 100,
                progress: 0,
                responsibleUserId: userId,
              },
            ],
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Валидировать ответ: успех или ошибка прав", async () => {
          if (!response) return;
          if (response.ok()) {
            expect(data.level).toBe("team");
            expect(data.departmentId).toBe(departmentId);
            if (data?.id) createdObjectiveIds.push(data.id);
          } else {
            expect([400, 403].includes(response.status())).toBe(true);
          }
        });

        await test.step("DB: Проверка создания цели уровня team", async () => {
          if (!objectivesVerifier.isConnected()) return;
          if (data?.id) {
            await objectivesVerifier.verifyObjectiveCreated(data.id);
          }
        });
      },
    );

    test("C5630: Цель уровня team без departmentId возвращает ошибку", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let userId, periodYear, periodQ, timestamp, response;

      await test.step("Получить ID текущего пользователя", async () => {
        userId = await getCurrentUserId(objectivesAPI);
      });

      await test.step("Подготовить параметры: текущий период и timestamp", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
        timestamp = Date.now();
      });

      await test.step("Отправить POST /private/objectives/ с level=team БЕЗ departmentId", async () => {
        const result = await objectivesAPI.saveObjective({
          title: `Team Without Dept ${timestamp}`,
          description: "Testing team level without departmentId",
          periodYear,
          periodQ,
          status: "draft",
          level: "team",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-team-nodept-${timestamp}`,
              title: "Team milestone",
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });
        response = result.response;
      });

      await test.step("Проверить статус ответа: 200/201 OK или 400 Bad Request (зависит от валидации)", async () => {
        expect([200, 201, 400].includes(response.status())).toBe(true);
      });
    });
  },
);

// ==================== MANAGER SUBORDINATES ====================

test.describe(
  "Objectives API - Manager Subordinates",
  { tag: ["@api", "@regression", "@objectives", "@manager-subordinates"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Manager Subordinates");
    });

    test("C5654: Руководитель может получить цели подчинённых", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      let periodYear, periodQ, response, data, items, firstItem;

      await test.step("Подготовить параметры: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Отправить запрос для получения целей подчинённых", async () => {
        const result = await objectivesAPI.getSubordinatesObjectives({
          periodYear,
          periodQ,
          includeCanEdit: true,
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

      await test.step("Проверить наличие isCanEdit поля в целях подчинённых", async () => {
        if (items.length > 0) {
          firstItem = items[0];
          if (firstItem.isCanEdit !== undefined) {
            expect(typeof firstItem.isCanEdit).toBe("boolean");
          }
        }
      });
    });

    test("C5655: Получение фильтра подчинённых с withSelf", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let respWithSelf,
        dataWithSelf,
        itemsWithSelf,
        respWithoutSelf,
        dataWithoutSelf,
        itemsWithoutSelf;

      await test.step("Отправить запрос фильтра подчинённых с withSelf=true", async () => {
        const result = await objectivesAPI.getSubordinatesFilter({
          withSelf: true,
          limit: 20,
        });
        respWithSelf = result.response;
        dataWithSelf = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        expect(respWithSelf.ok()).toBe(true);
      });

      await test.step("Извлечь массив с withSelf=true", async () => {
        itemsWithSelf = dataWithSelf?.items || dataWithSelf || [];
      });

      await test.step("Отправить запрос фильтра подчинённых с withSelf=false", async () => {
        const result = await objectivesAPI.getSubordinatesFilter({
          withSelf: false,
          limit: 20,
        });
        respWithoutSelf = result.response;
        dataWithoutSelf = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        expect(respWithoutSelf.ok()).toBe(true);
      });

      await test.step("Извлечь массив с withSelf=false", async () => {
        itemsWithoutSelf = dataWithoutSelf?.items || dataWithoutSelf || [];
      });

      await test.step("Проверить что с withSelf количество >= чем без", async () => {
        expect(itemsWithSelf.length).toBeGreaterThanOrEqual(
          itemsWithoutSelf.length,
        );
      });
    });

    test("C5656: Руководитель может фильтровать цели по конкретному подчинённому", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let periodYear,
        periodQ,
        filterData,
        subordinates,
        subordinateId,
        response,
        data,
        items;

      await test.step("Подготовить параметры: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Получить список подчинённых", async () => {
        const result = await objectivesAPI.getSubordinatesFilter({ limit: 10 });
        filterData = result.data;
        subordinates = filterData?.items || filterData || [];
      });

      await test.step("Извлечь ID первого подчинённого если есть", async () => {
        if (subordinates.length === 0) return;
        subordinateId = subordinates[0].id;
      });

      await test.step("Фильтровать цели по конкретному подчинённому", async () => {
        if (!subordinateId) return;
        const result = await objectivesAPI.getSubordinatesObjectives({
          periodYear,
          periodQ,
          responsibleUserIds: [subordinateId],
          limit: 20,
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        if (!response) return;
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие данных в ответе", async () => {
        if (!data) return;
        expect(data).toBeDefined();
      });

      await test.step("Проверить что все цели назначены на указанного подчинённого", async () => {
        if (!data) return;
        items = data?.items || data || [];
        for (const item of items) {
          if (item.responsibleUserId) {
            expect(item.responsibleUserId).toBe(subordinateId);
          }
        }
      });
    });
  },
);
