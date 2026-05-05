/**
 * Шаблон API теста
 *
 * Используйте этот файл как образец при создании новых API тестов.
 *
 * Обязательные элементы:
 * 1. import { test } from '../../fixtures/api.js' — для доступа к adminAPI/userAPI
 * 2. import common-assertions — для стандартизированных проверок
 * 3. markAsAPITest в beforeEach — для Allure репортинга
 * 4. Теги @api и функциональный тег (@smoke/@regression/@negative)
 *
 * Доступные фикстуры из api.js:
 * - adminAPI — авторизованный клиент под админом
 * - userAPI — авторизованный клиент под пользователем
 * - managerAPI — авторизованный клиент под менеджером
 * - apiClient — неавторизованный клиент
 * - authAPI — клиент для тестов аутентификации
 */

import { test, expect } from "../../fixtures/api.js";
import {
  assertSuccessStatus,
  assertErrorStatus,
  assertHasRequiredProperties,
  assertValidArray,
  assertNotEmptyArray,
  assertEntityHasId,
  extractItems,
  extractFirstItem,
  assertUnauthorized,
  assertForbidden,
} from "../../utils/api/common-assertions.js";
import {
  markAsAPITest,
  setSeverity,
  MODULES,
} from "../../utils/allure-helpers.js";

/**
 * Пример API теста
 *
 * Теги:
 * - @api — обязательный тег для всех API тестов
 * - @example — уникальный тег для этого шаблона (заменить на реальный модуль)
 * - @regression — функциональный тег
 */
test.describe(
  "Example API Test",
  { tag: ["@api", "@example", "@regression"] },
  () => {
    /**
     * beforeEach — Allure маркировка
     * ОБЯЗАТЕЛЬНО для всех API тестов
     */
    test.beforeEach(() => {
      // Первый аргумент — модуль из MODULES enum
      // Второй аргумент — название подраздела
      markAsAPITest(MODULES.FEEDBACK, "Example");
    });

    /**
     * Пример: GET запрос с проверкой успешного ответа
     */
    test(
      "C7083: GET /api/example - успешный запрос",
      { tag: ["@regression"] },
      async ({ adminAPI }) => {
        // Установка severity для Allure (blocker/critical/normal/minor/trivial)
        setSeverity("normal");

        // Выполнение запроса
        // adminAPI.get() возвращает { response, data }
        const { response, data } = await adminAPI.get(
          "/private/company/settings",
        );

        // Проверка статуса — используем common-assertions
        assertSuccessStatus(response, "Не удалось получить настройки компании");

        // Проверка обязательных полей (company settings содержит флаги, не id/name)
        assertHasRequiredProperties(
          data,
          ["isObjectivesEnabled", "isFeedbackDisabled"],
          "Company settings",
        );

        // Дополнительные проверки — значения должны быть boolean
        expect(typeof data.isObjectivesEnabled).toBe("boolean");
      },
    );

    /**
     * Пример: GET запрос со списком (массивом)
     */
    test(
      "C7084: GET /api/example/list - получение списка",
      { tag: ["@regression"] },
      async ({ adminAPI }) => {
        setSeverity("normal");

        const { response, data } = await adminAPI.get(
          "/private/users?limit=10",
        );

        assertSuccessStatus(response);

        // Извлечение массива из ответа (обрабатывает разные форматы)
        const items = extractItems(data);

        // Проверка что массив не пустой
        assertNotEmptyArray(
          items,
          "Список пользователей не должен быть пустым",
        );

        // Проверка структуры первого элемента
        const firstItem = extractFirstItem(data);
        if (firstItem) {
          assertEntityHasId(firstItem, "User");
          // email находится в account.email, а не на верхнем уровне
          assertHasRequiredProperties(
            firstItem,
            ["firstName", "lastName"],
            "User",
          );
          expect(firstItem.account).toBeDefined();
          expect(firstItem.account.email).toBeTruthy();
        }
      },
    );

    /**
     * Пример: POST запрос
     */
    test.skip(
      "POST /api/example - создание сущности",
      { tag: ["@regression"] },
      async ({ adminAPI }) => {
        // test.skip — пропустить тест (например, endpoint ещё не готов)
        setSeverity("critical");

        const payload = {
          name: "Test Entity",
          description: "Created by API test",
        };

        const { response, data } = await adminAPI.post("/api/example", payload);

        assertSuccessStatus(response, "Не удалось создать сущность");
        assertEntityHasId(data, "Created entity");
        assertHasRequiredProperties(
          data,
          ["name", "description"],
          "Created entity",
        );

        expect(data.name).toBe(payload.name);
      },
    );

    /**
     * Пример: Негативный тест — неавторизованный доступ
     */
    test(
      "C7085: GET /api/example - без авторизации возвращает 401",
      { tag: ["@negative"] },
      async ({ apiClient }) => {
        setSeverity("critical");

        // apiClient — неавторизованный клиент
        const { response } = await apiClient.get("/private/users");

        // Проверка что требуется авторизация
        assertUnauthorized(
          response,
          "Приватный endpoint должен требовать авторизацию",
        );
      },
    );

    /**
     * Пример: Негативный тест — запрещённый доступ
     */
    test.skip(
      "GET /admin-only - обычный пользователь получает 403",
      { tag: ["@negative"] },
      async ({ userAPI }) => {
        setSeverity("normal");

        // userAPI — авторизован как обычный пользователь
        const { response } = await userAPI.get("/admin/only/endpoint");

        // Проверка что доступ запрещён
        assertForbidden(
          response,
          "Админский endpoint должен быть недоступен пользователю",
        );
      },
    );

    /**
     * Пример: Тест с параметрами запроса
     */
    test(
      "C7086: GET /api/example?param=value - с query параметрами",
      { tag: ["@regression"] },
      async ({ adminAPI }) => {
        setSeverity("normal");

        // Параметры можно передать в URL или как объект
        const { response, data } = await adminAPI.get("/private/users", {
          limit: 5,
          offset: 0,
        });

        assertSuccessStatus(response);

        const items = extractItems(data);
        assertValidArray(items, 0, "Ответ должен содержать массив");

        // Проверка что вернулось не больше запрошенного лимита
        expect(items.length).toBeLessThanOrEqual(5);
      },
    );
  },
);

/**
 * Пример: Отдельный describe для другой группы тестов
 */
test.describe(
  "Example API Error Handling",
  { tag: ["@api", "@example", "@negative"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Error Handling");
    });

    test(
      "C7087: GET /api/nonexistent - возвращает 404",
      { tag: ["@negative"] },
      async ({ adminAPI }) => {
        setSeverity("minor");

        const { response } = await adminAPI.get(
          "/api/definitely/not/exists/12345",
        );

        // Для 404 можно использовать assertErrorStatus или прямую проверку
        assertErrorStatus(
          response,
          [404, 500],
          "Несуществующий endpoint должен возвращать ошибку",
        );
      },
    );
  },
);
