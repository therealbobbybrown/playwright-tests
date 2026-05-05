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
 * API тесты для модуля Objectives (Цели) - Validation
 *
 * Покрытие:
 * - Валидация обязательных полей
 * - Расширенная валидация (типы, уровни, периоды)
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

  const objectiveData = {
    title: `Test Objective ${timestamp}`,
    description: `Test objective description ${timestamp}`,
    periodYear,
    periodQ,
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

// ==================== VALIDATION ====================

test.describe(
  "Objectives API - Validation",
  { tag: ["@api", "@regression", "@objectives", "@validation"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Validation");
    });

    test(
      "C5583: Создание цели без title возвращает ошибку",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        let periodYear, periodQ, uniqueDescription, response;

        await test.step("Подготовить данные цели БЕЗ обязательного поля title", async () => {
          const period = getCurrentPeriod();
          periodYear = period.periodYear;
          periodQ = period.periodQ;
          uniqueDescription = `No title objective ${Date.now()}`;
        });

        await test.step("Отправить POST /private/objectives/ без title", async () => {
          const result = await objectivesAPI.saveObjective({
            // title отсутствует
            description: uniqueDescription,
            periodYear,
            periodQ,
          });
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400 Bad Request", async () => {
          assertBadRequest(response);
        });

        await test.step("DB: Проверить что цель НЕ создана в базе данных", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveNotCreatedByDescription(
            uniqueDescription,
          );
        });
      },
    );

    test("C5584: Получение несуществующей цели возвращает 404", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Отправить GET /private/objectives/999999999/ (несуществующий ID)", async () => {
        const result = await objectivesAPI.getObjectiveById(999999999);
        response = result.response;
      });

      await test.step("Проверить статус ответа: 404 Not Found или 400 Bad Request", async () => {
        expect([404, 400].includes(response.status())).toBe(true);
      });
    });

    test("C5585: Удаление несуществующей цели возвращает ошибку", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Отправить DELETE /private/objectives/non-existent-id-12345", async () => {
        const result = await objectivesAPI.deleteObjective(
          "non-existent-id-12345",
        );
        response = result.response;
      });

      await test.step("Проверить статус ответа: 404 Not Found или 400 Bad Request", async () => {
        expect([404, 400].includes(response.status())).toBe(true);
      });
    });

    test("C5586: Обновление milestone несуществующей цели возвращает ошибку", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Отправить PATCH для обновления milestone несуществующей цели", async () => {
        const result = await objectivesAPI.updateMilestoneProgress(
          "non-existent-objective",
          "non-existent-milestone",
          { progress: 50 },
        );
        response = result.response;
      });

      await test.step("Проверить статус ответа: 404 Not Found или 400 Bad Request", async () => {
        expect([404, 400].includes(response.status())).toBe(true);
      });
    });

    test("C5587: Комментарий к несуществующей цели возвращает ошибку", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Отправить POST /private/objective-comments/ для несуществующей цели", async () => {
        const result = await objectivesAPI.createComment(
          "non-existent-id",
          "Test comment",
        );
        response = result.response;
      });

      await test.step("Проверить статус ответа: 404 Not Found или 400 Bad Request", async () => {
        expect([404, 400].includes(response.status())).toBe(true);
      });
    });
  },
);

// ==================== EXTENDED VALIDATION ====================

test.describe(
  "Objectives API - Extended Validation",
  { tag: ["@api", "@regression", "@objectives", "@extended-validation"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Extended Validation");
    });

    test("C5613: Создание цели с пустым title", async ({ objectivesAPI }) => {
      setSeverity("normal");

      let userId, periodYear, periodQ, response, data;

      await test.step("Получить ID текущего пользователя", async () => {
        userId = await getCurrentUserId(objectivesAPI);
      });

      await test.step("Подготовить параметры: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Отправить POST /private/objectives/ с пустым title", async () => {
        const result = await objectivesAPI.saveObjective({
          title: "",
          description: "Test",
          periodYear,
          periodQ,
          status: "draft",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [],
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200/201 OK или 400 Bad Request (API может разрешить или запретить)", async () => {
        expect([200, 201, 400].includes(response.status())).toBe(true);
      });

      await test.step("Добавить ID в cleanup если цель создана", async () => {
        if (response.ok() && data?.id) {
          createdObjectiveIds.push(data.id);
        }
      });
    });

    test("C5614: Создание milestone с невалидным type возвращает ошибку", async ({
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

      await test.step('Отправить POST /private/objectives/ с milestone невалидного типа "invalid_type"', async () => {
        const result = await objectivesAPI.saveObjective({
          title: `Invalid Type Test ${timestamp}`,
          description: "Test",
          periodYear,
          periodQ,
          status: "draft",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-${timestamp}`,
              title: "Invalid milestone",
              type: "invalid_type",
              weight: 100,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });
        response = result.response;
      });

      await test.step("Проверить статус ответа: 400 Bad Request", async () => {
        assertBadRequest(response);
      });
    });

    test("C5615: Создание цели с невалидным level возвращает ошибку", async ({
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

      await test.step('Отправить POST /private/objectives/ с невалидным level="invalid_level"', async () => {
        const result = await objectivesAPI.saveObjective({
          title: `Invalid Level Test ${timestamp}`,
          description: "Test",
          periodYear,
          periodQ,
          status: "draft",
          level: "invalid_level",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-${timestamp}`,
              title: "M1",
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });
        response = result.response;
      });

      await test.step("Проверить статус ответа: 400 Bad Request", async () => {
        assertBadRequest(response);
      });
    });

    test("C5616: Создание цели без milestones", async ({ objectivesAPI }) => {
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

      await test.step("Отправить POST /private/objectives/ с пустым массивом milestones", async () => {
        const result = await objectivesAPI.saveObjective({
          title: `No Milestones Test ${timestamp}`,
          description: "Test without milestones",
          periodYear,
          periodQ,
          status: "draft",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [],
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200/201 OK или 400 Bad Request (API может требовать milestone)", async () => {
        expect([200, 201, 400].includes(response.status())).toBe(true);
      });

      await test.step("Добавить ID в cleanup если цель создана", async () => {
        if (response.ok() && data?.id) createdObjectiveIds.push(data.id);
      });
    });

    test("C5617: Создание цели с невалидным userAccessType возвращает ошибку", async ({
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

      await test.step('Отправить POST /private/objectives/ с невалидным userAccessType="invalid_access"', async () => {
        const result = await objectivesAPI.saveObjective({
          title: `Invalid Access Test ${timestamp}`,
          description: "Test",
          periodYear,
          periodQ,
          status: "draft",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "invalid_access",
          milestones: [
            {
              temporaryId: `temp-${timestamp}`,
              title: "M1",
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });
        response = result.response;
      });

      await test.step("Проверить статус ответа: 400 Bad Request", async () => {
        assertBadRequest(response);
      });
    });

    test("C5618: Создание цели с невалидным periodQ возвращает ошибку", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let userId, currentYear, timestamp, response;

      await test.step("Получить ID текущего пользователя", async () => {
        userId = await getCurrentUserId(objectivesAPI);
      });

      await test.step("Подготовить параметры: текущий год и timestamp", async () => {
        currentYear = new Date().getFullYear();
        timestamp = Date.now();
      });

      await test.step("Отправить POST /private/objectives/ с невалидным periodQ=5 (квартал должен быть 1-4)", async () => {
        const result = await objectivesAPI.saveObjective({
          title: `Invalid Quarter Test ${timestamp}`,
          description: "Test",
          periodYear: currentYear,
          periodQ: 5,
          status: "draft",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-${timestamp}`,
              title: "M1",
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });
        response = result.response;
      });

      await test.step("Проверить статус ответа: 400 Bad Request", async () => {
        assertBadRequest(response);
      });
    });
  },
);
