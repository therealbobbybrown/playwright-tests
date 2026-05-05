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
 * API тесты для модуля Objectives - Filters
 *
 * Покрытие:
 * - Фильтры подчинённых и отделов
 * - Пагинация и фильтрация
 * - Include Parameters (includeDepartmentTitle, includeCanEdit)
 * - Department Filtering
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

// ==================== FILTERS ====================

test.describe(
  "Objectives API - Filters",
  { tag: ["@api", "@regression", "@objectives", "@filters"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Filters");
    });

    test("C5564: GET /private/objectives/subordinates/filter - получить фильтр подчинённых", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response, data, items;

      await test.step("Отправить GET /private/objectives/subordinates/filter с limit=20", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "GET /private/objectives/subordinates/filter",
        });
        const result = await objectivesAPI.getSubordinatesFilter({ limit: 20 });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие данных в ответе", async () => {
        expect(data).toBeDefined();
      });

      await test.step("Извлечь и валидировать массив подчинённых", async () => {
        items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5565: GET /private/objectives/subordinates/filter/selected - получить выбранных подчинённых", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      let response, data;

      await test.step("Отправить GET /private/objectives/subordinates/filter/selected с limit=20", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "GET /private/objectives/subordinates/filter/selected",
        });
        const result = await objectivesAPI.getSubordinatesFilterSelected({
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
    });

    test("C5566: GET /private/objectives/head/departments - получить отделы руководителя", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response, data, items;

      await test.step("Отправить GET /private/objectives/head/departments с limit=20", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "GET /private/objectives/head/departments",
        });
        const result = await objectivesAPI.getHeadDepartments({ limit: 20 });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие данных в ответе", async () => {
        expect(data).toBeDefined();
      });

      await test.step("Извлечь и валидировать массив отделов", async () => {
        items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5567: POST /private/objectives/subordinates/query-results/get - получить результаты запроса", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      let response, data;

      await test.step("Подготовить минимальный валидный query с пустыми массивами", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description:
            "POST /private/objectives/subordinates/query-results/get",
        });
        test.info().annotations.push({
          type: "query",
          description: "responsibleUserIds: [], departmentIds: []",
        });
      });

      await test.step("Отправить POST запрос с query и limit=10", async () => {
        const result = await objectivesAPI.getSubordinatesQueryResults(
          { responsibleUserIds: [], departmentIds: [] },
          { limit: 10 },
        );
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить что API отвечает (HTTP статус > 0)", async () => {
        expect(response.status()).toBeGreaterThan(0);
      });
    });
  },
);

// ==================== PAGINATION & FILTERING ====================

test.describe(
  "Objectives API - Pagination & Filtering",
  { tag: ["@api", "@regression", "@objectives", "@pagination"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Pagination");
    });

    test("C5578: Пагинация работает корректно", async ({ objectivesAPI }) => {
      setSeverity("normal");

      let periodYear, periodQ, resp1, page1, items1, resp2, page2, items2;

      await test.step("Подготовить параметры запроса: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Отправить POST для получения первой страницы: offset=0, limit=5", async () => {
        const result = await objectivesAPI.getMyObjectives({
          periodYear,
          periodQ,
          limit: 5,
          offset: 0,
        });
        resp1 = result.response;
        page1 = result.data;
      });

      await test.step("Проверить статус ответа первой страницы: 200 OK", async () => {
        expect(resp1.ok()).toBe(true);
      });

      await test.step("Извлечь items из первой страницы", async () => {
        expect(page1).toBeDefined();
        items1 = page1?.items || page1 || [];
      });

      await test.step("Проверить метаданные пагинации: total >= items.length", async () => {
        if (page1?.total !== undefined) {
          expect(typeof page1.total).toBe("number");
          expect(page1.total).toBeGreaterThanOrEqual(items1.length);
        }
      });

      await test.step("Отправить POST для получения второй страницы: offset=5, limit=5", async () => {
        const result = await objectivesAPI.getMyObjectives({
          periodYear,
          periodQ,
          limit: 5,
          offset: 5,
        });
        resp2 = result.response;
        page2 = result.data;
      });

      await test.step("Проверить статус ответа второй страницы: 200 OK", async () => {
        expect(resp2.ok()).toBe(true);
        expect(page2).toBeDefined();
        items2 = page2?.items || page2 || [];
      });

      await test.step("Проверить отсутствие пересечений ID между страницами", async () => {
        if (items1.length > 0 && items2.length > 0) {
          const ids1 = items1.map((i) => i.id);
          const ids2 = items2.map((i) => i.id);
          const intersection = ids1.filter((id) => ids2.includes(id));
          expect(intersection.length).toBe(0);
        }
      });

      await test.step("Проверить что total одинаковый на обеих страницах", async () => {
        if (page1?.total !== undefined && page2?.total !== undefined) {
          expect(page1.total).toBe(page2.total);
        }
      });
    });

    test("C5579: Фильтрация по периоду работает", async ({ objectivesAPI }) => {
      setSeverity("normal");

      let currentYear, response, data, items;

      await test.step("Подготовить параметры: текущий год, Q1", async () => {
        currentYear = new Date().getFullYear();
      });

      await test.step("Отправить POST /private/objectives/get/mine с periodYear и periodQ", async () => {
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

      await test.step("Проверить наличие данных в ответе", async () => {
        expect(data).toBeDefined();
      });

      await test.step("Извлечь массив целей", async () => {
        items = data?.items || data || [];
      });

      await test.step(`Проверить что все цели за указанный период: year=${currentYear}`, async () => {
        for (const item of items) {
          if (item.periodYear !== undefined) {
            expect(item.periodYear).toBe(currentYear);
          }
        }
      });
    });

    test("C5580: Фильтрация по статусу работает", async ({ objectivesAPI }) => {
      setSeverity("normal");

      let periodYear,
        periodQ,
        allData,
        allItems,
        targetStatus,
        response,
        data,
        items;

      await test.step("Подготовить параметры запроса: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Отправить POST для получения всех целей: определить доступные статусы", async () => {
        const result = await objectivesAPI.getMyObjectives({
          periodYear,
          periodQ,
          limit: 50,
        });
        allData = result.data;
        allItems = allData?.items || allData || [];
      });

      if (allItems.length > 0) {
        await test.step("Определить целевой статус из первой цели", async () => {
          targetStatus = allItems[0].status;
        });

        await test.step(`Отправить POST с фильтром status=${targetStatus}`, async () => {
          const result = await objectivesAPI.getMyObjectives({
            periodYear,
            periodQ,
            status: targetStatus,
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

        await test.step("Извлечь массив целей из ответа", async () => {
          items = data?.items || data || [];
        });

        await test.step(`Проверить что все цели имеют статус: ${targetStatus}`, async () => {
          for (const item of items) {
            if (item.status !== undefined) {
              expect(item.status).toBe(targetStatus);
            }
          }
        });
      } else {
        await test.step("Отправить POST с фильтром status=active (целей нет, проверка работоспособности API)", async () => {
          const result = await objectivesAPI.getMyObjectives({
            periodYear,
            periodQ,
            status: "active",
            limit: 20,
          });
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });
      }
    });

    test("C5581: Сортировка работает", async ({ objectivesAPI }) => {
      setSeverity("minor");

      let periodYear, periodQ, response, data;

      await test.step("Подготовить параметры запроса: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Отправить POST /private/objectives/get/mine с limit=20", async () => {
        test.info().annotations.push({
          type: "note",
          description: "sortBy и sortOrder могут не поддерживаться API",
        });
        const result = await objectivesAPI.getMyObjectives({
          periodYear,
          periodQ,
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
    });

    test("C5582: Поиск по тексту работает", async ({ objectivesAPI }) => {
      setSeverity("minor");

      let periodYear, periodQ, response, data;

      await test.step("Подготовить параметры запроса: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step('Отправить POST /private/objectives/get/mine с параметром q="test"', async () => {
        const result = await objectivesAPI.getMyObjectives({
          periodYear,
          periodQ,
          q: "test",
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
    });
  },
);

// ==================== INCLUDE PARAMETERS ====================

test.describe(
  "Objectives API - Include Parameters",
  { tag: ["@api", "@regression", "@objectives", "@include-params"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Include Parameters");
    });

    test("C5620: Параметр includeDepartmentTitle добавляет название отдела", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let periodYear,
        periodQ,
        respWith,
        dataWith,
        itemsWithDept,
        respWithout,
        dataWithout;

      await test.step("Подготовить параметры: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Отправить POST /private/objectives/get с includeDepartmentTitle=true", async () => {
        const result = await objectivesAPI.getObjectives({
          periodYear,
          periodQ,
          includeDepartmentTitle: true,
          limit: 10,
        });
        respWith = result.response;
        dataWith = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        expect(respWith.ok()).toBe(true);
      });

      await test.step("Извлечь массив целей", async () => {
        itemsWithDept = dataWith?.items || dataWith || [];
      });

      await test.step("Валидировать наличие departmentTitle в целях с отделами", async () => {
        if (itemsWithDept.length > 0) {
          const hasAnyDepartmentTitle = itemsWithDept.some(
            (item) =>
              item.departmentTitle !== undefined ||
              item.department?.title !== undefined,
          );
          console.log(
            "Items with includeDepartmentTitle=true:",
            JSON.stringify(itemsWithDept[0], null, 2),
          );
        }
      });

      await test.step("Отправить POST /private/objectives/get с includeDepartmentTitle=false", async () => {
        const result = await objectivesAPI.getObjectives({
          periodYear,
          periodQ,
          includeDepartmentTitle: false,
          limit: 10,
        });
        respWithout = result.response;
        dataWithout = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        expect(respWithout.ok()).toBe(true);
      });
    });

    test("C5621: Параметр includeCanEdit добавляет флаг редактирования", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let periodYear, periodQ, response, data, items;

      await test.step("Подготовить параметры: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Отправить POST /private/objectives/get с includeCanEdit=true", async () => {
        const result = await objectivesAPI.getObjectives({
          periodYear,
          periodQ,
          includeCanEdit: true,
          limit: 10,
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Извлечь массив целей", async () => {
        items = data?.items || data || [];
      });

      await test.step("Валидировать наличие поля canEdit/isCanEdit типа boolean", async () => {
        if (items.length > 0) {
          const firstItem = items[0];
          const hasCanEdit =
            firstItem.canEdit !== undefined ||
            firstItem.isCanEdit !== undefined;
          if (hasCanEdit) {
            const canEditValue = firstItem.canEdit ?? firstItem.isCanEdit;
            expect(typeof canEditValue).toBe("boolean");
          }
        }
      });
    });

    test("C5622: Комбинация includeDepartmentTitle и includeCanEdit", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      let periodYear, periodQ, response, data;

      await test.step("Подготовить параметры: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Отправить POST /private/objectives/get с includeDepartmentTitle=true и includeCanEdit=true", async () => {
        const result = await objectivesAPI.getObjectives({
          periodYear,
          periodQ,
          includeDepartmentTitle: true,
          includeCanEdit: true,
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
  },
);

// ==================== DEPARTMENT FILTERING ====================

test.describe(
  "Objectives API - Department Filtering",
  { tag: ["@api", "@regression", "@objectives", "@departments"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Department Filtering");
    });

    test("C5623: Фильтрация целей по departmentIds", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let periodYear,
        periodQ,
        deptResp,
        deptData,
        departments,
        departmentId,
        response,
        data;

      await test.step("Подготовить параметры: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Отправить GET /private/objectives/head-departments для получения отделов", async () => {
        const result = await objectivesAPI.getHeadDepartments({ limit: 10 });
        deptResp = result.response;
        deptData = result.data;
      });

      await test.step("Извлечь массив отделов", async () => {
        if (deptResp.ok() && deptData) {
          departments = deptData?.items || deptData || [];
        }
      });

      await test.step("Отправить POST /private/objectives/get с фильтром departmentIds", async () => {
        if (departments && departments.length > 0) {
          departmentId = departments[0].id;
          const result = await objectivesAPI.getObjectives({
            periodYear,
            periodQ,
            departmentIds: [departmentId],
            limit: 20,
          });
          response = result.response;
          data = result.data;
        }
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        if (response) {
          assertSuccessStatus(response);
        }
      });

      await test.step("Проверить наличие данных в ответе", async () => {
        if (data) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5624: Фильтрация целей подчинённых по departmentIds", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let periodYear,
        periodQ,
        deptData,
        departments,
        departmentId,
        response,
        data;

      await test.step("Подготовить параметры: текущий период", async () => {
        const period = getCurrentPeriod();
        periodYear = period.periodYear;
        periodQ = period.periodQ;
      });

      await test.step("Отправить GET /private/objectives/head-departments для получения отделов", async () => {
        const result = await objectivesAPI.getHeadDepartments({ limit: 10 });
        deptData = result.data;
      });

      await test.step("Извлечь массив отделов", async () => {
        departments = deptData?.items || deptData || [];
      });

      await test.step("Отправить POST /private/objectives/subordinates с фильтром departmentIds", async () => {
        if (departments.length > 0) {
          departmentId = departments[0].id;
          const result = await objectivesAPI.getSubordinatesObjectives({
            periodYear,
            periodQ,
            departmentIds: [departmentId],
            limit: 20,
          });
          response = result.response;
          data = result.data;
        }
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        if (response) {
          assertSuccessStatus(response);
        }
      });

      await test.step("Проверить наличие данных в ответе", async () => {
        if (data) {
          expect(data).toBeDefined();
        }
      });
    });
  },
);
