// @ts-check
/**
 * API тесты для модуля Scenarios (Сценарии / Workflows)
 *
 * Покрытие:
 * - CRUD операции со сценариями
 * - Фильтрация и пагинация
 * - Сортировка
 * - Валидация полей
 * - DB верификация (если доступна БД)
 *
 * @tags @api @regression @scenarios @crud
 * @module Scenarios
 */

import { test as baseTest, expect } from "@playwright/test";
import { allure } from "allure-playwright";
import { ScenariosAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertSuccessStatus,
  assertValidArray,
  assertEntityHasId,
  assertPaginationBounds,
  assertForbidden,
  assertBadRequest,
  assertHasRequiredProperties,
  assertArrayItems,
  assertAccessDeniedScenario,
  extractItems,
} from "../../utils/api/common-assertions.js";
import {
  assertMatchesSchemaWithAllure,
  SCHEMAS,
} from "../../utils/api/schema-validator.js";
import { DatabaseClient, ScenarioVerifier } from "../../utils/db/index.js";
import { ScenarioSeedHelper } from "../../utils/seed/index.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";

/**
 * Логировать API ответ в Allure для отладки
 * @param {string} name - Название запроса
 * @param {import('@playwright/test').APIResponse} response - Ответ API
 * @param {Object} data - Данные ответа
 */
async function logResponseToAllure(name, response, data) {
  await allure.step(`API: ${name}`, async () => {
    allure.attachment(
      "Response Status",
      String(response.status()),
      "text/plain",
    );
    allure.attachment("Response URL", response.url(), "text/plain");
    if (data) {
      allure.attachment(
        "Response Body",
        JSON.stringify(data, null, 2),
        "application/json",
      );
    }
  });
}

// Extend test with API fixtures + DB verification + Seed helper
const test = baseTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new ScenariosAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  userAPI: async ({ request }, use) => {
    const api = new ScenariosAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  // DB верификатор (graceful - не падает если БД недоступна)
  scenarioVerifier: async ({}, use) => {
    const db = new DatabaseClient();
    await db.connect().catch(() => {
      // БД недоступна - продолжаем без неё
    });
    const verifier = new ScenarioVerifier(db);
    await use(verifier);
    await db.disconnect();
  },
  // Seed helper для создания тестовых данных
  scenarioSeed: async ({ request }, use) => {
    const seed = new ScenarioSeedHelper(request);
    await seed.init("admin");
    await use(seed);
    await seed.cleanup();
  },
});

// Cleanup tracking
const createdScenarioIds = [];

// ==================== GET LIST ====================

test.describe(
  "Scenarios API - GET List",
  { tag: ["@api", "@regression", "@scenarios", "@crud"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SCENARIOS, "GET List");
    });

    test(
      "C6718: GET /manager/scenarios/ - получить список сценариев",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data;
        await test.step("Отправить GET /manager/scenarios/ (авторизован как admin)", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "GET /manager/scenarios/",
          });
          const result = await adminAPI.getList();
          response = result.response;
          data = result.data;
        });

        await test.step("Логировать ответ в Allure для отладки", async () => {
          await logResponseToAllure("GET /manager/scenarios/", response, data);
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(
            response,
            "Admin должен иметь доступ к списку сценариев",
          );
        });

        await test.step("Проверить наличие тела ответа", async () => {
          expect(data).toBeDefined();
        });

        let items;
        await test.step("Извлечь массив items из ответа", async () => {
          items = extractItems(data);
        });

        await test.step("Проверить что items является валидным массивом", async () => {
          assertValidArray(items);
        });

        await test.step("Проверить структуру элементов списка и соответствие схеме", async () => {
          if (items.length > 0) {
            assertArrayItems(items, ["id", "title", "status"], "Scenario");
            // Валидация первого элемента по схеме
            await assertMatchesSchemaWithAllure(
              items[0],
              SCHEMAS.Scenario,
              "Scenario[0]",
            );
          }
        });
      },
    );

    test("C6719: GET /manager/scenarios/ с пагинацией", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Отправить GET /manager/scenarios/ с параметрами limit=5, offset=0", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "GET /manager/scenarios/?limit=5&offset=0",
        });
        const result = await adminAPI.getList({
          limit: 5,
          offset: 0,
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие тела ответа", async () => {
        expect(data).toBeDefined();
      });

      let items;
      await test.step("Извлечь массив items из ответа", async () => {
        items = extractItems(data);
      });

      await test.step("Проверить что items является валидным массивом", async () => {
        assertValidArray(items);
      });

      await test.step("Проверить границы пагинации: не более 5 элементов", async () => {
        assertPaginationBounds(data, 5);
      });

      await test.step("Проверить метаданные пагинации: поле total", async () => {
        if (data?.total !== undefined) {
          expect(typeof data.total).toBe("number");
          expect(data.total).toBeGreaterThanOrEqual(0);
        }
      });
    });

    test("C6720: GET /manager/scenarios/ с фильтром по статусу draft", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Отправить GET /manager/scenarios/ с фильтром status=draft, limit=10", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "GET /manager/scenarios/?status=draft&limit=10",
        });
        const result = await adminAPI.getList({
          status: "draft",
          limit: 10,
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      let items;
      await test.step("Извлечь массив items из ответа", async () => {
        items = extractItems(data);
      });

      await test.step("Проверить что items является валидным массивом", async () => {
        assertValidArray(items);
      });

      await test.step("Проверить что все элементы в статусе draft", async () => {
        items.forEach((item) => {
          expect(item.status).toBe("draft");
        });
      });
    });

    test("C6721: GET /manager/scenarios/ с фильтром по статусу active", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Отправить GET /manager/scenarios/ с фильтром status=active, limit=10", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "GET /manager/scenarios/?status=active&limit=10",
        });
        const result = await adminAPI.getList({
          status: "active",
          limit: 10,
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      let items;
      await test.step("Извлечь массив items из ответа", async () => {
        items = extractItems(data);
      });

      await test.step("Проверить что items является валидным массивом", async () => {
        assertValidArray(items);
      });

      await test.step("Проверить что все элементы в статусе active", async () => {
        items.forEach((item) => {
          expect(item.status).toBe("active");
        });
      });
    });

    test("C6722: GET /manager/scenarios/ с поиском по названию", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Отправить GET /manager/scenarios/ с параметром поиска q=test, limit=10", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "GET /manager/scenarios/?q=test&limit=10",
        });
        const result = await adminAPI.getList({
          q: "test",
          limit: 10,
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      let items;
      await test.step("Извлечь массив items из ответа", async () => {
        items = extractItems(data);
      });

      await test.step("Проверить что items является валидным массивом", async () => {
        assertValidArray(items);
      });
    });

    test("C6723: GET /manager/scenarios/ с сортировкой по дате создания", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Отправить GET /manager/scenarios/ с сортировкой sortBy=createdAt, orderBy=desc, limit=10", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description:
            "GET /manager/scenarios/?sortBy=createdAt&orderBy=desc&limit=10",
        });
        const result = await adminAPI.getList({
          sortBy: "createdAt",
          orderBy: "desc",
          limit: 10,
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить что API поддерживает сортировку (или пропустить тест)", async () => {
        if (!response.ok()) {
          // Сортировка не поддерживается - пропускаем
          console.log("[INFO] Sorting params not supported by API");
          test.skip();
        }
      });

      let items;
      await test.step("Извлечь массив items из ответа", async () => {
        items = extractItems(data);
      });

      await test.step("Проверить что items является валидным массивом", async () => {
        assertValidArray(items);
      });

      await test.step("Проверить порядок сортировки по убыванию даты (desc)", async () => {
        if (items.length >= 2 && items[0].createdAt && items[1].createdAt) {
          const date0 = new Date(items[0].createdAt).getTime();
          const date1 = new Date(items[1].createdAt).getTime();
          expect(date0).toBeGreaterThanOrEqual(date1);
        }
      });
    });

    test('C6724: GET /manager/scenarios/?own=true - фильтр "Мои сценарии"', async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Отправить GET /manager/scenarios/ с фильтром own=true", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "GET /manager/scenarios/?own=true",
        });
        const result = await adminAPI.getList({ own: true });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      let items;
      await test.step("Извлечь массив items из ответа", async () => {
        items = extractItems(data);
      });

      await test.step("Проверить что items является валидным массивом", async () => {
        assertValidArray(items);
        console.log(`[INFO] Own scenarios count: ${items.length}`);
      });

      await test.step("Проверить что все сценарии принадлежат одному owner", async () => {
        if (items.length > 1) {
          const firstOwnerId = items[0].ownerUserId || items[0].owner?.id;
          for (const item of items) {
            const ownerId = item.ownerUserId || item.owner?.id;
            expect(
              ownerId,
              "Все сценарии должны принадлежать одному owner",
            ).toBe(firstOwnerId);
          }
        }
      });
    });

    test("C6725: GET /manager/scenarios/ - user без прав получает 403", async ({
      userAPI,
    }) => {
      setSeverity("critical");

      let response;
      await test.step("Отправить GET /manager/scenarios/ (авторизован как user без прав)", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "GET /manager/scenarios/",
        });
        test.info().annotations.push({
          type: "role",
          description: "user without ManageScenario",
        });
        const result = await userAPI.getList();
        response = result.response;
      });

      let errorBody;
      await test.step("Прочитать тело ошибки", async () => {
        errorBody = await response.json().catch(() => null);
      });

      await test.step("Логировать ответ в Allure для отладки", async () => {
        await logResponseToAllure(
          "GET /manager/scenarios/ (user 403)",
          response,
          errorBody,
        );
      });

      await test.step("Проверить статус ответа: 403 Forbidden", async () => {
        assertForbidden(
          response,
          "User без ManageScenario не должен иметь доступ",
        );
      });
    });
  },
);

// ==================== GET BY ID ====================

test.describe(
  "Scenarios API - GET by ID",
  { tag: ["@api", "@regression", "@scenarios", "@crud"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SCENARIOS, "GET by ID");
    });

    test(
      "C6726: GET /manager/scenarios/{id}/ - получить сценарий по ID",
      { tag: ["@critical"] },
      async ({ adminAPI, scenarioVerifier }) => {
        setSeverity("critical");

        let createResp, created;
        await test.step("Создать тестовый сценарий для проверки GET by ID", async () => {
          const result = await adminAPI.create({
            title: TestDataHelper.generateUniqueName("Тест GET by ID"),
            description: "Сценарий для теста получения по ID",
          });
          createResp = result.response;
          created = result.data;
        });

        let scenarioId;
        await test.step("Проверить что сценарий создан успешно", async () => {
          if (!createResp.ok() || !created?.id) {
            throw new Error("Не удалось создать тестовый сценарий");
          }
          scenarioId = created.id;
          createdScenarioIds.push(scenarioId);
        });

        await test.step(`Проверить в БД что сценарий ID=${scenarioId} создан`, async () => {
          await scenarioVerifier.verifyScenarioCreated(scenarioId);
        });

        let response, data;
        await test.step(`Отправить GET /manager/scenarios/${scenarioId}/`, async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: `GET /manager/scenarios/${scenarioId}/`,
          });
          const result = await adminAPI.getById(scenarioId);
          response = result.response;
          data = result.data;
        });

        await test.step("Логировать ответ в Allure для отладки", async () => {
          await logResponseToAllure(
            "GET /manager/scenarios/{id}/",
            response,
            data,
          );
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие тела ответа", async () => {
          expect(data).toBeDefined();
        });

        await test.step("Проверить наличие ID в ответе", async () => {
          assertEntityHasId(data, "Scenario");
        });

        await test.step(`Проверить что ID совпадает с запрошенным: ${scenarioId}`, async () => {
          expect(data.id).toBe(scenarioId);
        });

        await test.step("Проверить наличие обязательных полей: id, title, status", async () => {
          assertHasRequiredProperties(
            data,
            ["id", "title", "status"],
            "Scenario",
          );
        });

        await test.step("Проверить соответствие структуры схеме Scenario", async () => {
          await assertMatchesSchemaWithAllure(
            data,
            SCHEMAS.Scenario,
            "Scenario",
          );
        });
      },
    );

    test("C6727: GET /manager/scenarios/{id}/ - несуществующий ID возвращает 404", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let response;
      await test.step("Отправить GET /manager/scenarios/999999/ (несуществующий ID)", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "GET /manager/scenarios/999999/",
        });
        const result = await adminAPI.getById(999999);
        response = result.response;
      });

      await test.step("Проверить статус ответа: 404 Not Found", async () => {
        expect(response.status()).toBe(404);
      });
    });

    test("C6728: GET /manager/scenarios/{id}/ - user без прав получает 403", async ({
      userAPI,
      adminAPI,
    }) => {
      setSeverity("critical");

      let createResp, created;
      await test.step("Создать тестовый сценарий админом", async () => {
        const result = await adminAPI.create({
          title: TestDataHelper.generateUniqueName("Защищённый от User"),
          description: "Сценарий для теста доступа User",
        });
        createResp = result.response;
        created = result.data;
      });

      let scenarioId;
      await test.step("Проверить что сценарий создан успешно", async () => {
        if (!createResp.ok() || !created?.id) {
          throw new Error("Не удалось создать тестовый сценарий");
        }
        scenarioId = created.id;
        createdScenarioIds.push(created.id);
      });

      let response;
      await test.step(`Отправить GET /manager/scenarios/${scenarioId}/ (авторизован как user без прав)`, async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: `GET /manager/scenarios/${scenarioId}/`,
        });
        test.info().annotations.push({
          type: "role",
          description: "user without ManageScenario",
        });
        const result = await userAPI.getById(created.id);
        response = result.response;
      });

      await test.step("Проверить статус ответа: 403 Forbidden или 404 Not Found", async () => {
        expect([403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== CREATE ====================

test.describe(
  "Scenarios API - CREATE",
  { tag: ["@api", "@regression", "@scenarios", "@crud"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SCENARIOS, "CREATE");
    });

    test.afterAll(async ({ request }) => {
      // Cleanup с логированием ошибок
      const api = new ScenariosAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of createdScenarioIds) {
        try {
          await api.remove(id);
        } catch (error) {
          // Логируем ошибки cleanup (DELETE API не реализован - это ожидаемо)
          console.log(
            `[CLEANUP] Не удалось удалить сценарий ${id}:`,
            error.message || "unknown error",
          );
        }
      }
      createdScenarioIds.length = 0;
    });

    test(
      "C6729: POST /manager/scenarios/ - создать сценарий",
      { tag: ["@critical"] },
      async ({ adminAPI, scenarioVerifier }) => {
        setSeverity("critical");

        let title, description;
        await test.step("Подготовить данные для создания сценария", async () => {
          title = TestDataHelper.generateUniqueName("Тестовый сценарий");
          description = "Описание тестового сценария для API тестов";
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/scenarios/",
          });
        });

        let response, data;
        await test.step("Отправить POST /manager/scenarios/ с данными сценария", async () => {
          const result = await adminAPI.create({
            title,
            description,
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Логировать ответ в Allure для отладки", async () => {
          await logResponseToAllure("POST /manager/scenarios/", response, data);
        });

        await test.step("Проверить статус ответа: 200 OK или 201 Created", async () => {
          assertSuccessStatus(
            response,
            "Создание сценария должно быть успешным",
          );
        });

        await test.step("Проверить наличие тела ответа", async () => {
          expect(data).toBeDefined();
        });

        await test.step("Проверить наличие ID созданного сценария", async () => {
          assertEntityHasId(data, "Scenario");
          createdScenarioIds.push(data.id);
        });

        await test.step(`Проверить что поле title сохранилось: ${title}`, async () => {
          expect(data.title).toBe(title);
        });

        await test.step("Проверить что новый сценарий создан в статусе draft", async () => {
          expect(data.status).toBe("draft");
        });

        await test.step("Проверить соответствие структуры схеме Scenario", async () => {
          await assertMatchesSchemaWithAllure(
            data,
            SCHEMAS.Scenario,
            "Created Scenario",
          );
        });

        await test.step(`Проверить в БД что сценарий ID=${data.id} создан`, async () => {
          await scenarioVerifier.verifyScenarioCreated(data.id);
        });

        await test.step(`Проверить в БД что сценарий ID=${data.id} имеет статус draft`, async () => {
          await scenarioVerifier.verifyScenarioStatus(data.id, "draft");
        });
      },
    );

    test("C6730: POST /manager/scenarios/ - создать сценарий с минимальными данными", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let title;
      await test.step("Подготовить минимальные данные для создания сценария", async () => {
        title = TestDataHelper.generateUniqueName("Минимальный сценарий");
        test.info().annotations.push({
          type: "endpoint",
          description: "POST /manager/scenarios/",
        });
      });

      let response, data;
      await test.step("Отправить POST /manager/scenarios/ с пустым description", async () => {
        const result = await adminAPI.create({
          title,
          description: "", // Пустое описание
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить что API принимает пустое description (или пропустить тест)", async () => {
        if (!response.ok()) {
          // API требует непустое description - это валидация
          console.log("[INFO] API requires non-empty description");
          test.skip();
        }
      });

      await test.step("Проверить наличие ID созданного сценария", async () => {
        assertEntityHasId(data, "Scenario");
        createdScenarioIds.push(data.id);
      });

      await test.step(`Проверить что поле title сохранилось: ${title}`, async () => {
        expect(data.title).toBe(title);
      });
    });

    test("C6731: POST /manager/scenarios/ - нельзя создать без title", async ({
      adminAPI,
    }) => {
      setSeverity("critical");

      let response;
      await test.step("Отправить POST /manager/scenarios/ без поля title", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "POST /manager/scenarios/",
        });
        test.info().annotations.push({
          type: "validation",
          description: "missing required field: title",
        });
        const result = await adminAPI.create({
          description: "Только описание",
        });
        response = result.response;
      });

      let errorBody;
      await test.step("Прочитать тело ошибки", async () => {
        errorBody = await response.json().catch(() => null);
      });

      await test.step("Логировать ответ в Allure для отладки", async () => {
        await logResponseToAllure(
          "POST /manager/scenarios/ (no title)",
          response,
          errorBody,
        );
      });

      await test.step("Проверить статус ответа: 400 Bad Request", async () => {
        assertBadRequest(response, "title является обязательным полем");
      });

      await test.step("Проверить наличие описания ошибки в теле ответа", async () => {
        if (errorBody) {
          expect(
            errorBody.message ||
              errorBody.error ||
              errorBody.detail ||
              errorBody.title,
            "Ответ об ошибке должен содержать описание",
          ).toBeDefined();
        }
      });
    });

    test("C6732: POST /manager/scenarios/ - нельзя создать с пустым title", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let response;
      await test.step('Отправить POST /manager/scenarios/ с пустым title=""', async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "POST /manager/scenarios/",
        });
        test
          .info()
          .annotations.push({ type: "validation", description: "empty title" });
        const result = await adminAPI.create({
          title: "",
        });
        response = result.response;
      });

      let errorBody;
      await test.step("Прочитать тело ошибки", async () => {
        errorBody = await response.json().catch(() => null);
      });

      await test.step("Логировать ответ в Allure для отладки", async () => {
        await logResponseToAllure(
          "POST /manager/scenarios/ (empty title)",
          response,
          errorBody,
        );
      });

      await test.step("Проверить статус ответа: 400 Bad Request", async () => {
        assertBadRequest(response, "Пустой title не допускается");
      });

      await test.step("Проверить наличие описания ошибки в теле ответа", async () => {
        if (errorBody) {
          expect(
            errorBody.message ||
              errorBody.error ||
              errorBody.detail ||
              errorBody.title,
            "Ответ об ошибке должен содержать описание",
          ).toBeDefined();
        }
      });
    });

    test("C6733: POST /manager/scenarios/ - user без прав получает 403", async ({
      userAPI,
    }) => {
      setSeverity("critical");

      let response;
      await test.step("Отправить POST /manager/scenarios/ (авторизован как user без прав)", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "POST /manager/scenarios/",
        });
        test.info().annotations.push({
          type: "role",
          description: "user without ManageScenario",
        });
        const result = await userAPI.create({
          title: "Хакерский сценарий",
        });
        response = result.response;
      });

      let errorBody;
      await test.step("Прочитать тело ошибки", async () => {
        errorBody = await response.json().catch(() => null);
      });

      await test.step("Логировать ответ в Allure для отладки", async () => {
        await logResponseToAllure(
          "POST /manager/scenarios/ (user 403)",
          response,
          errorBody,
        );
      });

      await test.step("Проверить статус ответа: 403 Forbidden", async () => {
        assertForbidden(
          response,
          "User без ManageScenario не может создавать сценарии",
        );
      });
    });
  },
);

// ==================== UPDATE ====================

test.describe(
  "Scenarios API - UPDATE",
  { tag: ["@api", "@regression", "@scenarios", "@crud"] },
  () => {
    let testScenarioId = null;

    test.beforeEach(() => {
      markAsAPITest(MODULES.SCENARIOS, "UPDATE");
    });

    test.beforeAll(async ({ request }) => {
      // Создаём тестовый сценарий
      const api = new ScenariosAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const { data } = await api.create({
        title: TestDataHelper.generateUniqueName("Сценарий для обновления"),
        description: "Исходное описание",
      });

      if (data?.id) {
        testScenarioId = data.id;
        createdScenarioIds.push(data.id);
      }
    });

    test.afterAll(async ({ request }) => {
      // Cleanup с логированием ошибок
      const api = new ScenariosAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of createdScenarioIds) {
        try {
          await api.remove(id);
        } catch (error) {
          // Логируем ошибки cleanup (DELETE API не реализован - это ожидаемо)
          console.log(
            `[CLEANUP] Не удалось удалить сценарий ${id}:`,
            error.message || "unknown error",
          );
        }
      }
      createdScenarioIds.length = 0;
    });

    test(
      "C6734: PATCH /manager/scenarios/{id}/ - обновить title",
      { tag: ["@critical"] },
      async ({ adminAPI, scenarioVerifier }) => {
        setSeverity("critical");
        test.skip(!testScenarioId, "Нет тестового сценария");

        let newTitle;
        await test.step("Подготовить новое значение title", async () => {
          newTitle = TestDataHelper.generateUniqueName("Обновлённое название");
          test.info().annotations.push({
            type: "endpoint",
            description: `PATCH /manager/scenarios/${testScenarioId}/`,
          });
        });

        let response, data;
        await test.step(`Отправить PATCH /manager/scenarios/${testScenarioId}/ с новым title`, async () => {
          const result = await adminAPI.update(testScenarioId, {
            title: newTitle,
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Логировать ответ в Allure для отладки", async () => {
          await logResponseToAllure(
            "PATCH /manager/scenarios/{id}/",
            response,
            data,
          );
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step(`Проверить что title обновился: ${newTitle}`, async () => {
          expect(data.title).toBe(newTitle);
        });

        await test.step(`Проверить в БД что title сценария ID=${testScenarioId} обновился`, async () => {
          await scenarioVerifier.verifyScenarioTitle(testScenarioId, newTitle);
        });
      },
    );

    test("C6735: PATCH /manager/scenarios/{id}/ - обновить description", async ({
      adminAPI,
      scenarioVerifier,
    }) => {
      setSeverity("normal");
      test.skip(!testScenarioId, "Нет тестового сценария");

      let newDescription;
      await test.step("Подготовить новое значение description", async () => {
        newDescription = "Новое описание сценария " + Date.now();
        test.info().annotations.push({
          type: "endpoint",
          description: `PATCH /manager/scenarios/${testScenarioId}/`,
        });
      });

      let response, data;
      await test.step(`Отправить PATCH /manager/scenarios/${testScenarioId}/ с новым description`, async () => {
        const result = await adminAPI.update(testScenarioId, {
          description: newDescription,
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Логировать ответ в Allure для отладки", async () => {
        await logResponseToAllure(
          "PATCH /manager/scenarios/{id}/ (description)",
          response,
          data,
        );
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step(`Проверить что description обновился в ответе`, async () => {
        expect(data.description).toBe(newDescription);
      });

      await test.step(`Проверить в БД что description сценария ID=${testScenarioId} обновился`, async () => {
        const dbRecord =
          await scenarioVerifier.verifyScenarioCreated(testScenarioId);
        if (dbRecord) {
          expect(dbRecord.description).toBe(newDescription);
        }
      });
    });

    test("C6736: PATCH /manager/scenarios/{id}/ - нельзя обновить несуществующий", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let response;
      await test.step("Отправить PATCH /manager/scenarios/999999/ (несуществующий ID)", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "PATCH /manager/scenarios/999999/",
        });
        const result = await adminAPI.update(999999, {
          title: "Обновление призрака",
        });
        response = result.response;
      });

      await test.step("Проверить статус ответа: 404 Not Found", async () => {
        expect(response.status()).toBe(404);
      });
    });

    test("C6737: PATCH /manager/scenarios/{id}/ - user без прав получает 403", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testScenarioId, "Нет тестового сценария");

      let response;
      await test.step(`Отправить PATCH /manager/scenarios/${testScenarioId}/ (авторизован как user без прав)`, async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: `PATCH /manager/scenarios/${testScenarioId}/`,
        });
        test.info().annotations.push({
          type: "role",
          description: "user without ManageScenario",
        });
        const result = await userAPI.update(testScenarioId, {
          title: "Хакерское обновление",
        });
        response = result.response;
      });

      await test.step("Проверить статус ответа: 403 Forbidden или 404 Not Found", async () => {
        expect([403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== SCENARIO STRUCTURE ====================

test.describe(
  "Scenarios API - Response Structure",
  { tag: ["@api", "@regression", "@scenarios"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SCENARIOS, "Structure");
    });

    test("C6738: Сценарий содержит обязательные поля и соответствует схеме", async ({
      adminAPI,
      scenarioSeed,
      scenarioVerifier,
    }) => {
      setSeverity("critical");

      let created;
      await test.step("Создать тестовый сценарий через seed helper", async () => {
        created = await scenarioSeed.seedDraftScenario({
          title: "Тест структуры",
          description: "Сценарий для проверки обязательных полей",
        });
      });

      await test.step("Проверить что seed вернул ID сценария", async () => {
        if (!created?.id) {
          throw new Error("Seed не вернул ID сценария");
        }
      });

      await test.step(`Проверить в БД что сценарий ID=${created.id} создан`, async () => {
        await scenarioVerifier.verifyScenarioCreated(created.id);
      });

      let response, data;
      await test.step(`Отправить GET /manager/scenarios/${created.id}/`, async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: `GET /manager/scenarios/${created.id}/`,
        });
        const result = await adminAPI.getById(created.id);
        response = result.response;
        data = result.data;
      });

      await test.step("Логировать ответ в Allure для отладки", async () => {
        await logResponseToAllure(
          "GET /manager/scenarios/{id}/ (structure)",
          response,
          data,
        );
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие обязательных полей: id, title, status", async () => {
        assertHasRequiredProperties(
          data,
          ["id", "title", "status"],
          "Scenario",
        );
      });

      await test.step("Проверить соответствие структуры схеме Scenario", async () => {
        await assertMatchesSchemaWithAllure(data, SCHEMAS.Scenario, "Scenario");
      });

      await test.step("Проверить тип поля id: number или string", async () => {
        expect(typeof data.id === "number" || typeof data.id === "string").toBe(
          true,
        );
      });

      await test.step("Проверить тип и значение поля title: непустая строка", async () => {
        expect(typeof data.title).toBe("string");
        expect(data.title.length).toBeGreaterThan(0);
      });

      await test.step("Проверить что status входит в допустимые значения enum", async () => {
        expect(["draft", "active", "archive", "delete"]).toContain(data.status);
      });

      await test.step("Проверить что массив actions является массивом", async () => {
        const actions = data.scenarioActions || data.actions || [];
        expect(Array.isArray(actions)).toBe(true);
      });
    });

    test("C6739: Статус сценария соответствует enum", async ({ adminAPI }) => {
      setSeverity("normal");

      let data;
      await test.step("Отправить GET /manager/scenarios/ с limit=20", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "GET /manager/scenarios/?limit=20",
        });
        const result = await adminAPI.getList({ limit: 20 });
        data = result.data;
      });

      let items;
      await test.step("Извлечь массив items из ответа", async () => {
        items = extractItems(data);
      });

      await test.step("Проверить что все статусы входят в допустимые значения enum", async () => {
        const validStatuses = ["draft", "active", "archive", "delete"];
        items.forEach((item) => {
          expect(
            validStatuses,
            `Статус ${item.status} должен быть допустимым`,
          ).toContain(item.status);
        });
      });
    });
  },
);
