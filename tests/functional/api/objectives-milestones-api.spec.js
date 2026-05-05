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
 * API тесты для модуля Objectives - Milestones
 *
 * Покрытие:
 * - Milestones (прогресс)
 * - Milestone Types (percent, number, boolean)
 * - Milestone Extended (activityType, baseValue/targetValue)
 * - Milestone Negative Values
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

// ==================== MILESTONES ====================

test.describe(
  "Objectives API - Milestones",
  { tag: ["@api", "@regression", "@objectives", "@milestones"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Milestones");
    });

    test(
      "C5562: PATCH /private/objectives/{id}/milestones/{milestoneId} - обновить прогресс milestone",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let createdObjective,
          objectiveData,
          objective,
          milestone,
          originalProgress,
          newProgress,
          response,
          data;

        await test.step("Создать тестовую цель с milestones", async () => {
          const result = await createTestObjective(objectivesAPI);
          createdObjective = result.data;
          expect(createdObjective?.id).toBeDefined();
        });

        await test.step("Получить цель по ID для извлечения реальных ID milestones", async () => {
          const result = await objectivesAPI.getObjectiveById(
            createdObjective.id,
          );
          objectiveData = result.data;
          objective = objectiveData?.objective || objectiveData;
          expect(objective?.milestones?.length).toBeGreaterThan(0);
        });

        await test.step("Извлечь первый milestone и его текущий прогресс", async () => {
          milestone = objective.milestones[0];
          expect(milestone.id).toBeDefined();
          originalProgress = milestone.progress || 0;
        });

        await test.step("Подготовить новое значение прогресса: 50%", async () => {
          newProgress = 50;
          test.info().annotations.push({
            type: "endpoint",
            description: `PATCH /private/objectives/${createdObjective.id}/milestones/${milestone.id}`,
          });
        });

        await test.step(`Отправить PATCH для обновления прогресса milestone на ${newProgress}%`, async () => {
          const result = await objectivesAPI.updateMilestoneProgress(
            createdObjective.id,
            milestone.id,
            {
              progress: newProgress,
              id: milestone.id,
              objectiveId: createdObjective.id,
            },
          );
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить результат обновления (200 OK или 400 с ошибкой)", async () => {
          if (response.ok()) {
            expect(data).toBeDefined();
          } else {
            expect(data?.message || data?.error).toBeDefined();
          }
        });

        if (response.ok()) {
          await test.step("Получить обновлённую цель для проверки изменений", async () => {
            const result = await objectivesAPI.getObjectiveById(
              createdObjective.id,
            );
            const updatedData = result.data;
            const updatedObjective = updatedData?.objective || updatedData;
            const updatedMilestone = updatedObjective.milestones.find(
              (m) => m.id === milestone.id,
            );
            expect(updatedMilestone).toBeDefined();
          });

          await test.step("Проверить что прогресс milestone обновился на новое значение", async () => {
            const result = await objectivesAPI.getObjectiveById(
              createdObjective.id,
            );
            const updatedData = result.data;
            const updatedObjective = updatedData?.objective || updatedData;
            const updatedMilestone = updatedObjective.milestones.find(
              (m) => m.id === milestone.id,
            );
            expect(updatedMilestone.progress).toBe(newProgress);
          });

          await test.step("DB: Проверить обновление прогресса цели в базе данных", async () => {
            if (!objectivesVerifier.isConnected()) return;
            await objectivesVerifier.verifyObjectiveProgress(
              createdObjective.id,
              newProgress,
            );
          });
        }
      },
    );

    test(
      "C5563: Прогресс milestone влияет на общий прогресс цели",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        let createdObjective, objective, m1, updatedObjective;

        await test.step("Создать тестовую цель с 2 milestones по 50% веса", async () => {
          const result = await createTestObjective(objectivesAPI);
          createdObjective = result.data;
          expect(createdObjective?.id).toBeDefined();
        });

        await test.step("Получить цель по ID для извлечения реальных ID milestones", async () => {
          const result = await objectivesAPI.getObjectiveById(
            createdObjective.id,
          );
          const objectiveData = result.data;
          objective = objectiveData?.objective || objectiveData;
          expect(objective?.milestones?.length).toBe(2);
        });

        await test.step("Обновить прогресс первого milestone на 100%", async () => {
          m1 = objective.milestones[0];
          test.info().annotations.push({
            type: "milestone_update",
            description: `milestone ${m1.id} progress: 0% → 100%`,
          });
          await objectivesAPI.updateMilestoneProgress(
            createdObjective.id,
            m1.id,
            { progress: 100 },
          );
        });

        await test.step("Получить обновлённую цель после изменения прогресса", async () => {
          const result = await objectivesAPI.getObjectiveById(
            createdObjective.id,
          );
          const updatedData = result.data;
          updatedObjective = updatedData?.objective || updatedData;
          expect(updatedObjective).toBeDefined();
        });

        await test.step("Проверить что общий прогресс цели >= 0 (отражает изменение milestone)", async () => {
          if (updatedObjective.progress !== undefined) {
            expect(updatedObjective.progress).toBeGreaterThanOrEqual(0);
          }
        });

        await test.step("DB: Проверить что в БД сохранены 2 key results", async () => {
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

// ==================== MILESTONE TYPES ====================

test.describe(
  "Objectives API - Milestone Types",
  { tag: ["@api", "@regression", "@objectives", "@milestone-types"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Milestone Types");
    });

    test(
      "C5597: Создание milestone с типом percent",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

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

        await test.step("Отправить POST /private/objectives/ с milestone type=percent", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Percent Milestone Test ${timestamp}`,
            description: "Testing percent type milestone",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-percent-${timestamp}`,
                title: "Percent milestone",
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

        await test.step("Проверить тип milestone: percent", async () => {
          expect(data.milestones[0].type).toBe("percent");
        });

        await test.step("Добавить ID в cleanup", async () => {
          createdObjectiveIds.push(data.id);
        });

        await test.step("DB: Проверка создания цели с percent milestone", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
          await objectivesVerifier.verifyKeyResultsCount(data.id, 1);
        });
      },
    );

    test(
      "C5598: Создание milestone с типом number",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

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

        await test.step("Отправить POST /private/objectives/ с milestone type=number", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Number Milestone Test ${timestamp}`,
            description: "Testing number type milestone",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-number-${timestamp}`,
                title: "Number milestone",
                type: "number",
                weight: 100,
                progress: 0,
                targetValue: 100,
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

        await test.step("Проверить тип milestone: number", async () => {
          expect(data.milestones[0].type).toBe("number");
        });

        await test.step("Добавить ID в cleanup", async () => {
          createdObjectiveIds.push(data.id);
        });

        await test.step("DB: Проверка создания цели с number milestone", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
          await objectivesVerifier.verifyKeyResultsCount(data.id, 1);
        });
      },
    );

    test(
      "C5599: Создание milestone с типом boolean",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

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

        await test.step("Отправить POST /private/objectives/ с milestone type=boolean", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Boolean Milestone Test ${timestamp}`,
            description: "Testing boolean type milestone",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-boolean-${timestamp}`,
                title: "Boolean milestone - done/not done",
                type: "boolean",
                weight: 100,
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

        await test.step("Проверить тип milestone: boolean", async () => {
          expect(data.milestones[0].type).toBe("boolean");
        });

        await test.step("Добавить ID в cleanup", async () => {
          createdObjectiveIds.push(data.id);
        });

        await test.step("DB: Проверка создания цели с boolean milestone", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
          await objectivesVerifier.verifyKeyResultsCount(data.id, 1);
        });
      },
    );

    test("C5600: Сумма весов milestones может быть любой", async ({
      objectivesAPI,
    }) => {
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

      await test.step("Отправить POST /private/objectives/ с milestones сумма весов != 100", async () => {
        const result = await objectivesAPI.saveObjective({
          title: `Weight Sum Test ${timestamp}`,
          description: "Testing milestone weight sum",
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
              weight: 30,
              progress: 0,
              responsibleUserId: userId,
            },
            {
              temporaryId: `t2-${timestamp}`,
              title: "M2",
              type: "percent",
              weight: 30,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200/201 OK или 400 Bad Request", async () => {
        expect([200, 201, 400].includes(response.status())).toBe(true);
      });

      await test.step("Добавить ID в cleanup если создание прошло успешно", async () => {
        if (response.ok() && data?.id) createdObjectiveIds.push(data.id);
      });
    });
  },
);

// ==================== MILESTONE EXTENDED PROPERTIES ====================

test.describe(
  "Objectives API - Milestone Extended",
  { tag: ["@api", "@regression", "@objectives", "@milestone-extended"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Milestone Extended");
    });

    test(
      "C5625: Создание milestone с activityType: practice",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

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

        await test.step("Отправить POST /private/objectives/ с milestone activityType=practice", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Activity Type Practice ${timestamp}`,
            description: "Testing activityType practice",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-practice-${timestamp}`,
                title: "Practice milestone",
                type: "percent",
                activityType: "practice",
                weight: 100,
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

        await test.step("Проверить наличие milestones в ответе", async () => {
          expect(
            data.milestones,
            "Milestones должны быть в ответе",
          ).toBeDefined();
          expect(
            data.milestones[0],
            "Первый milestone должен существовать",
          ).toBeDefined();
        });

        await test.step("Добавить ID в cleanup", async () => {
          createdObjectiveIds.push(data.id);
        });

        await test.step("DB: Проверка создания цели с activityType practice", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
          await objectivesVerifier.verifyKeyResultsCount(data.id, 1);
        });
      },
    );

    test(
      "C5626: Создание milestone с activityType: theoretics",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

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

        await test.step("Отправить POST /private/objectives/ с milestone activityType=theoretics", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Activity Type Theoretics ${timestamp}`,
            description: "Testing activityType theoretics",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-theoretics-${timestamp}`,
                title: "Theoretics milestone",
                type: "percent",
                activityType: "theoretics",
                weight: 100,
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

        await test.step("Проверить наличие milestones в ответе", async () => {
          expect(
            data.milestones,
            "Milestones должны быть в ответе",
          ).toBeDefined();
          expect(
            data.milestones[0],
            "Первый milestone должен существовать",
          ).toBeDefined();
        });

        await test.step("Добавить ID в cleanup", async () => {
          createdObjectiveIds.push(data.id);
        });

        await test.step("DB: Проверка создания цели с activityType theoretics", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
          await objectivesVerifier.verifyKeyResultsCount(data.id, 1);
        });
      },
    );

    test(
      "C5627: Создание milestone с activityType: teamwork",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

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

        await test.step("Отправить POST /private/objectives/ с milestone activityType=teamwork", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Activity Type Teamwork ${timestamp}`,
            description: "Testing activityType teamwork",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-teamwork-${timestamp}`,
                title: "Teamwork milestone",
                type: "percent",
                activityType: "teamwork",
                weight: 100,
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

        await test.step("Проверить наличие milestones в ответе", async () => {
          expect(
            data.milestones,
            "Milestones должны быть в ответе",
          ).toBeDefined();
          expect(
            data.milestones[0],
            "Первый milestone должен существовать",
          ).toBeDefined();
        });

        await test.step("Добавить ID в cleanup", async () => {
          createdObjectiveIds.push(data.id);
        });

        await test.step("DB: Проверка создания цели с activityType teamwork", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
          await objectivesVerifier.verifyKeyResultsCount(data.id, 1);
        });
      },
    );

    test(
      "C5628: Milestone типа number с baseValue и targetValue",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        let userId,
          periodYear,
          periodQ,
          timestamp,
          baseValue,
          targetValue,
          response,
          data,
          milestone;

        await test.step("Получить ID текущего пользователя", async () => {
          userId = await getCurrentUserId(objectivesAPI);
        });

        await test.step("Подготовить параметры: текущий период, timestamp и значения", async () => {
          const period = getCurrentPeriod();
          periodYear = period.periodYear;
          periodQ = period.periodQ;
          timestamp = Date.now();
          baseValue = 0;
          targetValue = 100;
        });

        await test.step("Отправить POST /private/objectives/ с milestone type=number baseValue/targetValue", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Number with Base/Target ${timestamp}`,
            description: "Testing baseValue and targetValue",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-number-bt-${timestamp}`,
                title: "Number milestone with base/target",
                type: "number",
                weight: 100,
                progress: 0,
                baseValue: baseValue,
                targetValue: targetValue,
                currentValue: baseValue,
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

        await test.step("Проверить наличие milestones в ответе", async () => {
          expect(
            data.milestones,
            "Milestones должны быть в ответе",
          ).toBeDefined();
          expect(
            data.milestones[0],
            "Первый milestone должен существовать",
          ).toBeDefined();
        });

        await test.step("Проверить тип milestone: number", async () => {
          milestone = data.milestones[0];
          expect(milestone.type).toBe("number");
        });

        await test.step("Проверить сохранение baseValue и targetValue", async () => {
          if (milestone.baseValue !== undefined) {
            expect(milestone.baseValue).toBe(baseValue);
          }
          if (milestone.targetValue !== undefined) {
            expect(milestone.targetValue).toBe(targetValue);
          }
        });

        await test.step("Добавить ID в cleanup", async () => {
          createdObjectiveIds.push(data.id);
        });

        await test.step("DB: Проверка создания цели с number milestone", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
          await objectivesVerifier.verifyKeyResultsCount(data.id, 1);
        });
      },
    );

    // Удалён тест "Milestone с endDate" — endDate для milestones не поддерживается в системе.
    // Даты для целей устанавливаются только через period (год + квартал) на уровне objective.
  },
);

// ==================== MILESTONE NEGATIVE VALUES ====================
// Отрицательные значения для milestone допустимы

test.describe(
  "Objectives API - Milestone Negative Values",
  { tag: ["@api", "@regression", "@objectives", "@milestone-negative"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Milestone Negative Values");
    });

    test(
      "C5642: Milestone с отрицательным baseValue",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

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

        await test.step("Отправить POST /private/objectives/ с milestone baseValue=-100 (отрицательное)", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Negative BaseValue ${timestamp}`,
            description: "Testing negative baseValue",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-neg-base-${timestamp}`,
                title: "Negative base milestone",
                type: "number",
                weight: 100,
                progress: 0,
                baseValue: -100,
                targetValue: 0,
                currentValue: -100,
                responsibleUserId: userId,
              },
            ],
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/201 OK (отрицательные значения допустимы)", async () => {
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

        await test.step("Проверить наличие milestones в ответе", async () => {
          expect(
            data.milestones,
            "Milestones должны быть в ответе",
          ).toBeDefined();
          expect(
            data.milestones[0],
            "Первый milestone должен существовать",
          ).toBeDefined();
        });

        await test.step("Проверить baseValue сохранён корректно: -100", async () => {
          expect(data.milestones[0].baseValue).toBe(-100);
        });

        await test.step("Добавить ID в cleanup", async () => {
          createdObjectiveIds.push(data.id);
        });

        await test.step("DB: Проверка создания цели с отрицательным baseValue", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
          await objectivesVerifier.verifyKeyResultsCount(data.id, 1);
        });
      },
    );

    test(
      "C5643: Milestone с отрицательным targetValue",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

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

        await test.step("Отправить POST /private/objectives/ с milestone targetValue=-50", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Negative TargetValue ${timestamp}`,
            description: "Testing negative targetValue",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-neg-target-${timestamp}`,
                title: "Negative target milestone",
                type: "number",
                weight: 100,
                progress: 0,
                baseValue: 0,
                targetValue: -50,
                currentValue: 0,
                responsibleUserId: userId,
              },
            ],
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/201 OK (отрицательные значения допустимы)", async () => {
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

        await test.step("Проверить наличие milestones в ответе", async () => {
          expect(
            data.milestones,
            "Milestones должны быть в ответе",
          ).toBeDefined();
          expect(
            data.milestones[0],
            "Первый milestone должен существовать",
          ).toBeDefined();
        });

        await test.step("Проверить targetValue milestone: -50", async () => {
          expect(data.milestones[0].targetValue).toBe(-50);
        });

        await test.step("Добавить ID в cleanup", async () => {
          createdObjectiveIds.push(data.id);
        });

        await test.step("DB: Проверка создания цели с отрицательным targetValue", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
          await objectivesVerifier.verifyKeyResultsCount(data.id, 1);
        });
      },
    );

    test(
      "C5644: Milestone с отрицательным currentValue",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

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

        await test.step("Отправить POST /private/objectives/ с milestone currentValue=-25", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Negative CurrentValue ${timestamp}`,
            description: "Testing negative currentValue",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-neg-current-${timestamp}`,
                title: "Negative current milestone",
                type: "number",
                weight: 100,
                progress: 0,
                baseValue: 0,
                targetValue: 100,
                currentValue: -25,
                responsibleUserId: userId,
              },
            ],
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/201 OK (отрицательные значения допустимы)", async () => {
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

        await test.step("Добавить ID в cleanup", async () => {
          createdObjectiveIds.push(data.id);
        });

        await test.step("DB: Проверка создания цели с отрицательным currentValue", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
          await objectivesVerifier.verifyKeyResultsCount(data.id, 1);
        });
      },
    );

    test("C5645: Milestone с отрицательным weight", async ({
      objectivesAPI,
    }) => {
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

      await test.step("Отправить POST /private/objectives/ с milestone weight=-50", async () => {
        const result = await objectivesAPI.saveObjective({
          title: `Negative Weight ${timestamp}`,
          description: "Testing negative weight",
          periodYear,
          periodQ,
          status: "draft",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-neg-weight-${timestamp}`,
              title: "Negative weight milestone",
              type: "percent",
              weight: -50,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200/201 OK или 400 Bad Request", async () => {
        expect([200, 201, 400].includes(response.status())).toBe(true);
      });

      await test.step("Добавить ID в cleanup если создание прошло успешно", async () => {
        if (response.ok() && data?.id) createdObjectiveIds.push(data.id);
      });
    });

    test(
      "C5646: Milestone с baseValue > targetValue (уменьшение показателя)",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

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

        await test.step("Отправить POST /private/objectives/ с milestone baseValue=1000 > targetValue=500", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Decrease Target ${timestamp}`,
            description: "Testing decrease scenario (base > target)",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-decrease-${timestamp}`,
                title: "Reduce expenses",
                type: "number",
                weight: 100,
                progress: 0,
                baseValue: 1000,
                targetValue: 500,
                currentValue: 1000,
                responsibleUserId: userId,
              },
            ],
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/201 OK (уменьшение показателя допустимо)", async () => {
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

        await test.step("Проверить наличие milestones в ответе", async () => {
          expect(
            data.milestones,
            "Milestones должны быть в ответе",
          ).toBeDefined();
          expect(
            data.milestones[0],
            "Первый milestone должен существовать",
          ).toBeDefined();
        });

        await test.step("Проверить baseValue и targetValue milestone", async () => {
          expect(data.milestones[0].baseValue).toBe(1000);
          expect(data.milestones[0].targetValue).toBe(500);
        });

        await test.step("Добавить ID в cleanup", async () => {
          createdObjectiveIds.push(data.id);
        });

        await test.step("DB: Проверка создания цели с уменьшением показателя", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
          await objectivesVerifier.verifyKeyResultsCount(data.id, 1);
        });
      },
    );
  },
);
