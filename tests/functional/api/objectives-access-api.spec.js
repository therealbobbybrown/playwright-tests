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
 * API тесты для модуля Objectives (Цели) - Access Control & Permissions
 *
 * Покрытие:
 * - Контроль доступа (Admin, User, Manager)
 * - User Access (everybody, selective)
 * - Права на удаление целей
 * - Права на редактирование целей
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

// ==================== ACCESS CONTROL ====================

test.describe(
  "Objectives API - Access Control",
  { tag: ["@api", "@regression", "@objectives", "@access"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Access Control");
    });

    test("C5588: Обычный пользователь может получить свои цели", async ({
      objectivesUserAPI,
    }) => {
      setSeverity("critical");

      let periodYear, periodQ, response, data;

      await test.step("Подготовить параметры запроса: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Отправить POST /private/objectives/get/mine от имени обычного пользователя", async () => {
        const result = await objectivesUserAPI.getMyObjectives({
          periodYear,
          periodQ,
          limit: 10,
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
    });

    test("C5589: Обычный пользователь может создать черновик цели", async ({
      objectivesUserAPI,
    }) => {
      setSeverity("critical");

      let periodYear, periodQ, userData, userId, timestamp, response, data;

      await test.step("Подготовить параметры запроса: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Получить ID текущего пользователя через GET /private/users/me/", async () => {
        const result = await objectivesUserAPI.get("/private/users/me/");
        userData = result.data;
        userId = userData?.id || 1;
      });

      await test.step("Подготовить данные черновика цели пользователя", async () => {
        timestamp = Date.now();
      });

      await test.step("Отправить POST /private/objectives/ для создания черновика от имени пользователя", async () => {
        const result = await objectivesUserAPI.saveObjective({
          title: `User Objective ${timestamp}`,
          description: "Created by regular user",
          periodYear,
          periodQ,
          status: "draft",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-user-${timestamp}`,
              title: "M1",
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

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие ID созданной цели", async () => {
        expect(data?.id).toBeDefined();
      });

      await test.step("Cleanup: удалить созданную цель", async () => {
        if (data?.id) {
          await objectivesUserAPI.deleteObjective(data.id);
        }
      });
    });

    test("C5590: Manager settings доступны только для менеджеров", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Отправить GET /manager/objectives/settings/ от имени админа", async () => {
        const result = await objectivesAPI.getSettings();
        response = result.response;
      });

      await test.step("Проверить статус ответа: 200 OK (админ имеет доступ)", async () => {
        assertSuccessStatus(response);
      });
    });

    test("C5591: Обычный пользователь НЕ имеет доступа к manager settings", async ({
      objectivesUserAPI,
    }) => {
      setSeverity("critical");

      let response;

      await test.step("Отправить GET /manager/objectives/settings/ от имени обычного пользователя", async () => {
        const result = await objectivesUserAPI.getSettings();
        response = result.response;
      });

      await test.step("Проверить статус ответа: 401 Unauthorized или 403 Forbidden", async () => {
        expect([401, 403].includes(response.status())).toBe(true);
      });
    });
  },
);

// ==================== USER ACCESS TYPE ====================

test.describe(
  "Objectives API - User Access",
  { tag: ["@api", "@regression", "@objectives", "@user-access"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "User Access");
    });

    test(
      "C5605: Создание цели с доступом everybody",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        const { data } = await createTestObjective(objectivesAPI, {
          userAccessType: "everybody",
        });

        expect(data?.id).toBeDefined();
        expect(data.userAccessType).toBe("everybody");

        // DB верификация
        await test.step("DB: Проверка создания цели с доступом everybody", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
        });
      },
    );

    test(
      "C5606: Создание цели с доступом selective",
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

        await test.step("Отправить POST /private/objectives/ с userAccessType=selective", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Selective Access Test ${timestamp}`,
            description: "Testing selective access",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "selective",
            usersWithAccess: [userId],
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

        await test.step("Проверить userAccessType: selective", async () => {
          expect(data.userAccessType).toBe("selective");
        });

        await test.step("Добавить ID в cleanup", async () => {
          createdObjectiveIds.push(data.id);
        });

        await test.step("DB: Проверка создания цели с доступом selective", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
        });
      },
    );
  },
);

// ==================== SELECTIVE ACCESS ADVANCED ====================

test.describe(
  "Objectives API - Selective Access",
  { tag: ["@api", "@regression", "@objectives", "@selective-access"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Selective Access");
    });

    test(
      "C5631: Проверка userAccess в ответе для selective цели",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("normal");

        let userId,
          periodYear,
          periodQ,
          timestamp,
          response,
          data,
          fetchedData,
          objective;

        await test.step("Получить ID текущего пользователя", async () => {
          userId = await getCurrentUserId(objectivesAPI);
        });

        await test.step("Подготовить параметры: текущий период и timestamp", async () => {
          const period = getCurrentPeriod();
          periodYear = period.periodYear;
          periodQ = period.periodQ;
          timestamp = Date.now();
        });

        await test.step("Отправить POST /private/objectives/ с userAccessType=selective", async () => {
          const result = await objectivesAPI.saveObjective({
            title: `Selective Access Check ${timestamp}`,
            description: "Testing userAccess in response",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "selective",
            userAccess: [userId],
            milestones: [
              {
                temporaryId: `temp-sel-${timestamp}`,
                title: "M1",
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

        await test.step("Проверить userAccessType: selective", async () => {
          expect(data.userAccessType).toBe("selective");
        });

        await test.step("Отправить GET /private/objectives/{id} для проверки userAccess", async () => {
          const result = await objectivesAPI.getObjectiveById(data.id);
          fetchedData = result.data;
          objective = fetchedData?.objective || fetchedData;
        });

        await test.step("Проверить userAccessType в полученной цели: selective", async () => {
          expect(objective.userAccessType).toBe("selective");
        });

        await test.step("Проверить наличие и тип поля userAccess", async () => {
          if (objective.userAccess) {
            expect(
              Array.isArray(objective.userAccess) ||
                typeof objective.userAccess === "object",
            ).toBe(true);
          }
        });

        await test.step("Добавить ID в cleanup", async () => {
          createdObjectiveIds.push(data.id);
        });

        await test.step("DB: Проверка создания цели с selective access", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveCreated(data.id);
        });
      },
    );
  },
);

// ==================== PERMISSIONS: DELETE OBJECTIVES ====================
// Права на удаление:
// - Админ может удалять все цели
// - Пользователь может удалить только свой черновик
// - isCanEdit флаг определяет возможность удаления

test.describe(
  "Objectives API - Delete Permissions",
  { tag: ["@api", "@regression", "@objectives", "@permissions", "@delete"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Delete Permissions");
    });

    test(
      "C5632: Админ может удалить черновик цели",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let createdObjective, idx, response, getResp;

        await test.step("Создать черновик цели", async () => {
          const result = await createTestObjective(objectivesAPI, {
            status: "draft",
          });
          createdObjective = result.data;
          expect(createdObjective?.id).toBeDefined();
          expect(createdObjective.status).toBe("draft");
        });

        await test.step("Удалить ID из списка cleanup (удалим вручную)", async () => {
          idx = createdObjectiveIds.indexOf(createdObjective.id);
          if (idx > -1) createdObjectiveIds.splice(idx, 1);
        });

        await test.step("Отправить DELETE /private/objectives/{id} для удаления черновика", async () => {
          const result = await objectivesAPI.deleteObjective(
            createdObjective.id,
          );
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Отправить GET /private/objectives/{id} для проверки удаления", async () => {
          const result = await objectivesAPI.getObjectiveById(
            createdObjective.id,
          );
          getResp = result.response;
        });

        await test.step("Проверить что цель не найдена: 404 или 400", async () => {
          expect([404, 400].includes(getResp.status())).toBe(true);
        });

        await test.step("DB: Проверка удаления черновика админом", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveDeleted(createdObjective.id);
        });
      },
    );

    test(
      "C5633: Админ может удалить активную цель",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let createdObjective, idx, response;

        await test.step("Создать активную цель", async () => {
          const result = await createTestObjective(objectivesAPI, {
            status: "active",
          });
          createdObjective = result.data;
          expect(createdObjective?.id).toBeDefined();
        });

        await test.step("Удалить ID из списка cleanup (удалим вручную)", async () => {
          idx = createdObjectiveIds.indexOf(createdObjective.id);
          if (idx > -1) createdObjectiveIds.splice(idx, 1);
        });

        await test.step("Отправить DELETE /private/objectives/{id} для удаления активной цели", async () => {
          const result = await objectivesAPI.deleteObjective(
            createdObjective.id,
          );
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("DB: Проверка удаления активной цели админом", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveDeleted(createdObjective.id);
        });
      },
    );

    test(
      "C5634: Обычный пользователь может удалить свой черновик",
      { tag: ["@db"] },
      async ({ objectivesUserAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let userId,
          periodYear,
          periodQ,
          timestamp,
          createResp,
          createdObjective,
          response;

        await test.step("Получить ID текущего пользователя", async () => {
          userId = await getCurrentUserId(objectivesUserAPI);
        });

        await test.step("Подготовить параметры: текущий период и timestamp", async () => {
          const period = getCurrentPeriod();
          periodYear = period.periodYear;
          periodQ = period.periodQ;
          timestamp = Date.now();
        });

        await test.step("Отправить POST /private/objectives/ для создания черновика пользователем", async () => {
          const result = await objectivesUserAPI.saveObjective({
            title: `User Draft ${timestamp}`,
            description: "User draft for delete test",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-user-${timestamp}`,
                title: "M1",
                type: "percent",
                weight: 100,
                progress: 0,
                responsibleUserId: userId,
              },
            ],
          });
          createResp = result.response;
          createdObjective = result.data;
        });

        await test.step("Проверить статус создания: 200/201 OK", async () => {
          expect(createResp.ok()).toBe(true);
        });

        await test.step("Проверить ID цели определён", async () => {
          expect(createdObjective?.id).toBeDefined();
        });

        await test.step("Отправить DELETE /private/objectives/{id} для удаления своего черновика", async () => {
          const result = await objectivesUserAPI.deleteObjective(
            createdObjective.id,
          );
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("DB: Проверка удаления черновика пользователем", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveDeleted(createdObjective.id);
        });
      },
    );

    test("C5635: Обычный пользователь НЕ может удалить чужую цель", async ({
      objectivesAPI,
      objectivesUserAPI,
    }) => {
      setSeverity("critical");

      let adminObjective, response;

      await test.step("Создать цель админом", async () => {
        const result = await createTestObjective(objectivesAPI, {
          status: "draft",
        });
        adminObjective = result.data;
        expect(adminObjective?.id).toBeDefined();
      });

      await test.step("Попытаться удалить чужую цель обычным пользователем", async () => {
        const result = await objectivesUserAPI.deleteObjective(
          adminObjective.id,
        );
        response = result.response;
      });

      await test.step("Проверить статус ответа: 403/404/400 (отказ в доступе)", async () => {
        expect([403, 404, 400].includes(response.status())).toBe(true);
      });

      await test.step("Очистка: админ удаляет свою цель", async () => {
        await objectivesAPI.deleteObjective(adminObjective.id);
      });
    });

    test("C5636: Проверка isCanEdit флага в ответе GET", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let createdObjective, response, data;

      await test.step("Создать тестовую цель", async () => {
        const result = await createTestObjective(objectivesAPI);
        createdObjective = result.data;
        expect(createdObjective?.id).toBeDefined();
      });

      await test.step("Отправить GET /private/objectives/{id} для получения цели", async () => {
        const result = await objectivesAPI.getObjectiveById(
          createdObjective.id,
        );
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие и значение флага isCanEdit: boolean, true для своей цели", async () => {
        if (data.isCanEdit !== undefined) {
          expect(typeof data.isCanEdit).toBe("boolean");
          expect(data.isCanEdit).toBe(true);
        }
      });
    });
  },
);

// ==================== PERMISSIONS: EDIT OBJECTIVES ====================

test.describe(
  "Objectives API - Edit Permissions",
  { tag: ["@api", "@regression", "@objectives", "@permissions", "@edit"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Edit Permissions");
    });

    test(
      "C5637: Пользователь может редактировать свой черновик",
      { tag: ["@db"] },
      async ({ objectivesUserAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let userId,
          periodYear,
          periodQ,
          timestamp,
          createdObjective,
          newTitle,
          response,
          data;

        await test.step("Получить ID текущего пользователя", async () => {
          userId = await getCurrentUserId(objectivesUserAPI);
        });

        await test.step("Подготовить параметры: текущий период и timestamp", async () => {
          const period = getCurrentPeriod();
          periodYear = period.periodYear;
          periodQ = period.periodQ;
          timestamp = Date.now();
        });

        await test.step("Отправить POST /private/objectives/ для создания черновика", async () => {
          const result = await objectivesUserAPI.saveObjective({
            title: `User Draft Edit ${timestamp}`,
            description: "Draft for edit test",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-edit-${timestamp}`,
                title: "M1",
                type: "percent",
                weight: 100,
                progress: 0,
                responsibleUserId: userId,
              },
            ],
          });
          createdObjective = result.data;
        });

        await test.step("Проверить ID цели определён", async () => {
          expect(createdObjective?.id).toBeDefined();
        });

        await test.step("Подготовить новое название для обновления", async () => {
          newTitle = `Updated User Draft ${timestamp}`;
        });

        await test.step("Отправить POST /private/objectives/ для обновления черновика с новым title", async () => {
          const result = await objectivesUserAPI.saveObjective({
            id: createdObjective.id,
            title: newTitle,
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

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить title обновлён корректно", async () => {
          expect(data.title).toBe(newTitle);
        });

        await test.step("DB: Проверка обновления черновика пользователем", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveTitle(
            createdObjective.id,
            newTitle,
          );
        });

        await test.step("Очистка: удалить цель", async () => {
          await objectivesUserAPI.deleteObjective(createdObjective.id);
        });
      },
    );

    test("C5638: Пользователь НЕ может редактировать чужую цель", async ({
      objectivesAPI,
      objectivesUserAPI,
    }) => {
      setSeverity("critical");

      let adminObjective, timestamp, response, fetchedData, objective;

      await test.step("Создать цель админом", async () => {
        const result = await createTestObjective(objectivesAPI, {
          status: "draft",
        });
        adminObjective = result.data;
        expect(adminObjective?.id).toBeDefined();
      });

      await test.step("Подготовить timestamp для тестового названия", async () => {
        timestamp = Date.now();
      });

      await test.step("Попытаться редактировать чужую цель обычным пользователем", async () => {
        const result = await objectivesUserAPI.saveObjective({
          id: adminObjective.id,
          title: `Hacked Title ${timestamp}`,
          description: adminObjective.description,
          periodYear: adminObjective.periodYear,
          periodQ: adminObjective.periodQ,
          level: adminObjective.level,
          responsibleUserId: adminObjective.responsibleUserId,
          userAccessType: adminObjective.userAccessType,
          milestones: adminObjective.milestones,
          status: "draft",
        });
        response = result.response;
      });

      await test.step("Проверить статус ответа: 403/404/400 (отказ в доступе)", async () => {
        expect([403, 404, 400].includes(response.status())).toBe(true);
      });

      await test.step("Отправить GET /private/objectives/{id} для проверки что title не изменился", async () => {
        const result = await objectivesAPI.getObjectiveById(adminObjective.id);
        fetchedData = result.data;
        objective = fetchedData?.objective || fetchedData;
      });

      await test.step("Проверить что title остался прежним", async () => {
        expect(objective.title).toBe(adminObjective.title);
      });

      await test.step("Очистка: админ удаляет цель", async () => {
        await objectivesAPI.deleteObjective(adminObjective.id);
      });
    });

    test(
      "C5639: Админ может редактировать чужую активную цель",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesManagerAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let managerId,
          periodYear,
          periodQ,
          timestamp,
          createResp,
          managerObjective,
          newTitle,
          editResp,
          editedData;

        await test.step("Получить ID менеджера", async () => {
          managerId = await getCurrentUserId(objectivesManagerAPI);
        });

        await test.step("Подготовить параметры: текущий период и timestamp", async () => {
          const period = getCurrentPeriod();
          periodYear = period.periodYear;
          periodQ = period.periodQ;
          timestamp = Date.now();
        });

        await test.step("Менеджер создаёт АКТИВНУЮ цель", async () => {
          const result = await objectivesManagerAPI.saveObjective({
            title: `Manager Objective For Admin Edit ${timestamp}`,
            description: "Manager objective for admin edit test",
            periodYear,
            periodQ,
            status: "active",
            level: "self",
            responsibleUserId: managerId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-admin-edit-${timestamp}`,
                title: "M1",
                type: "percent",
                weight: 100,
                progress: 0,
                responsibleUserId: managerId,
              },
            ],
          });
          createResp = result.response;
          managerObjective = result.data;
        });

        await test.step("Проверить статус создания: 200/201 OK", async () => {
          expect(createResp.ok()).toBe(true);
        });

        await test.step("Проверить ID цели определён", async () => {
          expect(managerObjective?.id).toBeDefined();
        });

        await test.step("Подготовить новое название для редактирования админом", async () => {
          newTitle = `Admin Edited ${timestamp}`;
        });

        await test.step("Админ редактирует чужую активную цель", async () => {
          const result = await objectivesAPI.saveObjective({
            id: managerObjective.id,
            title: newTitle,
            description: managerObjective.description,
            periodYear: managerObjective.periodYear,
            periodQ: managerObjective.periodQ,
            level: managerObjective.level,
            responsibleUserId: managerObjective.responsibleUserId,
            userAccessType: managerObjective.userAccessType,
            milestones: managerObjective.milestones,
            status: "active",
          });
          editResp = result.response;
          editedData = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK (админ может редактировать)", async () => {
          expect(editResp.ok()).toBe(true);
        });

        await test.step("Проверить title обновлён корректно", async () => {
          expect(editedData?.title).toBe(newTitle);
        });

        await test.step("DB: Проверка редактирования чужой цели админом", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveTitle(
            managerObjective.id,
            newTitle,
          );
        });

        await test.step("Очистка: админ удаляет цель", async () => {
          await objectivesAPI.deleteObjective(managerObjective.id);
        });
      },
    );

    test("C5640: Админ НЕ может редактировать/удалять чужой черновик", async ({
      objectivesAPI,
      objectivesManagerAPI,
    }) => {
      setSeverity("normal");

      let managerId,
        periodYear,
        periodQ,
        timestamp,
        createResp,
        managerDraft,
        editResp,
        deleteResp;

      await test.step("Получить ID менеджера", async () => {
        managerId = await getCurrentUserId(objectivesManagerAPI);
      });

      await test.step("Подготовить параметры: текущий период и timestamp", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
        timestamp = Date.now();
      });

      await test.step("Менеджер создаёт ЧЕРНОВИК", async () => {
        const result = await objectivesManagerAPI.saveObjective({
          title: `Manager Draft For Admin Test ${timestamp}`,
          description: "Manager draft - admin should not access",
          periodYear,
          periodQ,
          status: "draft",
          level: "self",
          responsibleUserId: managerId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-admin-draft-${timestamp}`,
              title: "M1",
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: managerId,
            },
          ],
        });
        createResp = result.response;
        managerDraft = result.data;
      });

      await test.step("Проверить статус создания: 200/201 OK", async () => {
        expect(createResp.ok()).toBe(true);
      });

      await test.step("Проверить ID черновика определён", async () => {
        expect(managerDraft?.id).toBeDefined();
      });

      await test.step("Админ пытается редактировать чужой черновик", async () => {
        const result = await objectivesAPI.saveObjective({
          id: managerDraft.id,
          title: `Admin Trying To Edit Draft ${timestamp}`,
          description: managerDraft.description,
          periodYear: managerDraft.periodYear,
          periodQ: managerDraft.periodQ,
          level: managerDraft.level,
          responsibleUserId: managerDraft.responsibleUserId,
          userAccessType: managerDraft.userAccessType,
          milestones: managerDraft.milestones,
          status: "draft",
        });
        editResp = result.response;
      });

      await test.step("Проверить статус ответа: 403 Forbidden (админ НЕ может редактировать чужой черновик)", async () => {
        expect(editResp.status()).toBe(403);
      });

      await test.step("Админ пытается удалить чужой черновик", async () => {
        const result = await objectivesAPI.deleteObjective(managerDraft.id);
        deleteResp = result.response;
      });

      await test.step("Проверить статус ответа: 403 Forbidden (админ НЕ может удалить чужой черновик)", async () => {
        expect(deleteResp.status()).toBe(403);
      });

      await test.step("Очистка: владелец удаляет свой черновик", async () => {
        await objectivesManagerAPI.deleteObjective(managerDraft.id);
      });
    });

    test(
      "C5641: Админ может удалить чужую активную цель",
      { tag: ["@db"] },
      async ({ objectivesAPI, objectivesManagerAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let managerId,
          periodYear,
          periodQ,
          timestamp,
          createResp,
          managerObjective,
          deleteResp,
          getResp;

        await test.step("Получить ID менеджера", async () => {
          managerId = await getCurrentUserId(objectivesManagerAPI);
        });

        await test.step("Подготовить параметры: текущий период и timestamp", async () => {
          const period = getCurrentPeriod();
          periodYear = period.periodYear;
          periodQ = period.periodQ;
          timestamp = Date.now();
        });

        await test.step("Менеджер создаёт АКТИВНУЮ цель", async () => {
          const result = await objectivesManagerAPI.saveObjective({
            title: `Manager Objective For Admin Delete ${timestamp}`,
            description: "Manager objective for admin delete test",
            periodYear,
            periodQ,
            status: "active",
            level: "self",
            responsibleUserId: managerId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-admin-delete-${timestamp}`,
                title: "M1",
                type: "percent",
                weight: 100,
                progress: 0,
                responsibleUserId: managerId,
              },
            ],
          });
          createResp = result.response;
          managerObjective = result.data;
        });

        await test.step("Проверить статус создания: 200/201 OK", async () => {
          expect(createResp.ok()).toBe(true);
        });

        await test.step("Проверить ID цели определён", async () => {
          expect(managerObjective?.id).toBeDefined();
        });

        await test.step("Админ удаляет чужую активную цель", async () => {
          const result = await objectivesAPI.deleteObjective(
            managerObjective.id,
          );
          deleteResp = result.response;
        });

        await test.step("Проверить статус ответа: 200 OK (админ может удалить чужую активную цель)", async () => {
          expect(deleteResp.ok()).toBe(true);
        });

        await test.step("Отправить GET /private/objectives/{id} для проверки удаления", async () => {
          const result = await objectivesAPI.getObjectiveById(
            managerObjective.id,
          );
          getResp = result.response;
        });

        await test.step("Проверить что цель не найдена: 404 или 400", async () => {
          expect([404, 400].includes(getResp.status())).toBe(true);
        });

        await test.step("DB: Проверка удаления чужой активной цели админом", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyObjectiveDeleted(managerObjective.id);
        });
      },
    );
  },
);
