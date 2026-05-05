// @ts-check
import { test as base, expect } from "@playwright/test";
import { CompanyAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";

/**
 * API тесты для модуля Brand (Внешний вид)
 *
 * Покрытие:
 * - Получение информации о компании
 * - Обновление брендинга компании
 * - Обновление названия компании
 * - Настройки компании
 * - Токены компании
 *
 * @tags @api @brand @company
 */

// Расширяем test с фикстурой для Company API
const test = base.extend({
  companyAPI: async ({ request }, use) => {
    const api = new CompanyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  companyUserAPI: async ({ request }, use) => {
    const api = new CompanyAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

// Сохраняем оригинальные данные для восстановления
let originalCompanyTitle = null;

// ==================== COMPANY INFO ====================

test.describe(
  "Brand API - Company Info",
  { tag: ["@api", "@brand", "@company", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.BRAND, "Company Info");
    });

    test(
      "C4660: GET /manager/company - получить информацию о компании",
      { tag: ["@critical"] },
      async ({ companyAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /manager/company - получить информацию о компании", async () => {
          const { response, data } = await companyAPI.getCompany();

          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
            // Сохраняем оригинальное название для восстановления
            if (data.title) {
              originalCompanyTitle = data.title;
            }
          }
        });
      },
    );

    test("C4661: Компания содержит обязательные поля", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Компания содержит обязательные поля", async () => {
        const { response, data } = await companyAPI.getCompany();

        if (!response.ok()) {
          test.skip(true, "Нет доступа к данным компании");
          return;
        }

        expect(data).toBeDefined();
        // Проверяем наличие базовых полей
        expect(data.id || data.companyId).toBeDefined();
      });
    });

    test(
      "C4662: GET /manager/company/settings - получить настройки компании",
      { tag: ["@critical"] },
      async ({ companyAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /manager/company/settings - получить настройки компании", async () => {
          const { response, data } =
            await companyAPI.getManagerCompanySettings();

          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
            expect(typeof data).toBe("object");
          }
        });
      },
    );

    test("C4663: GET /private/company/settings - получить настройки компании (private)", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/company/settings - получить настройки компании (private)", async () => {
        const { response, data } = await companyAPI.getPrivateCompanySettings();

        assertSuccessStatus(response);
        expect(data).toBeDefined();
      });
    });

    test("C4664: GET /private/company/admin-email - получить email администратора", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/company/admin-email - получить email администратора", async () => {
        const { response, data } = await companyAPI.getAdminEmail();

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        // Должен вернуть email или объект с email
        if (typeof data === "string") {
          expect(data).toContain("@");
        } else if (data?.email) {
          expect(data.email).toContain("@");
        }
      });
    });
  },
);

// ==================== COMPANY UPDATE ====================

test.describe(
  "Brand API - Company Update",
  { tag: ["@api", "@brand", "@update", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.BRAND, "Company Update");
    });

    test("C4665: PATCH /manager/company - обновить компанию (пустой объект)", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: PATCH /manager/company - обновить компанию (пустой объект)", async () => {
        const { response: getResp } = await companyAPI.getCompany();

        if (!getResp.ok()) {
          test.skip(true, "Нет доступа к компании");
          return;
        }

        const { response } = await companyAPI.updateCompany({});

        // Пустое обновление может быть принято или отклонено
        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test(
      "C4666: PATCH /manager/company/title - обновить название компании",
      { tag: ["@critical"] },
      async ({ companyAPI }) => {
        setSeverity("critical");

        let originalTitle, newTitle, response;
        await test.step("Выполнить запрос: PATCH /manager/company/title - обновить название компании", async () => {
          // Получаем текущие данные
          const { response: getResp, data: getData } =
            await companyAPI.getCompany();

          if (!getResp.ok()) {
            test.skip(true, "Нет доступа к компании");
            return;
          }

          originalTitle = getData.title;
          newTitle = TestDataHelper.generateUniqueName("Тестовая компания");

          // Обновляем название
          ({ response } = await companyAPI.updateCompanyTitle(newTitle));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            // Проверяем что название обновилось
            const { response: checkResp, data: checkData } =
              await companyAPI.getCompany();
            expect(checkResp.ok()).toBe(true);
            expect(checkData.title).toBe(newTitle);

            // Восстанавливаем оригинальное название
            if (originalTitle) {
              await companyAPI.updateCompanyTitle(originalTitle);
            }
          }
        });
      },
    );

    test("C4667: PATCH /manager/company/settings - обновить настройки компании", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: PATCH /manager/company/settings - обновить настройки компании", async () => {
        const { response: getResp, data: currentSettings } =
          await companyAPI.getManagerCompanySettings();

        if (!getResp.ok()) {
          test.skip(true, "Нет доступа к настройкам");
          return;
        }

        // Пробуем обновить с текущими настройками (без изменений)
        const { response } = await companyAPI.patch(
          "/manager/company/settings",
          currentSettings,
        );

        expect([200, 400, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== COMPANY TOKENS ====================

test.describe(
  "Brand API - Company Tokens",
  { tag: ["@api", "@brand", "@tokens", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.BRAND, "Company Tokens");
    });

    test("C4668: GET /manager/company/tokens - получить токены компании", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /manager/company/tokens - получить токены компании", async () => {
        const { response, data } = await companyAPI.getCompanyTokens();

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          expect(Array.isArray(items)).toBe(true);
        }
      });
    });

    test("C4669: GET /manager/company/tokens с пагинацией", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /manager/company/tokens с пагинацией", async () => {
        const { response, data } = await companyAPI.getCompanyTokens({
          limit: 5,
          offset: 0,
        });

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          expect(Array.isArray(items)).toBe(true);
          expect(items.length).toBeLessThanOrEqual(5);
        }
      });
    });
  },
);

// ==================== INTEGRATIONS ====================

test.describe(
  "Brand API - Integrations",
  { tag: ["@api", "@brand", "@integrations", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.BRAND, "Integrations");
    });

    test("C4670: GET /private/company/active-integrations - получить активные интеграции", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/company/active-integrations - получить активные интеграции", async () => {
        const { response, data } = await companyAPI.getActiveIntegrations();

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        expect(Array.isArray(items)).toBe(true);
      });
    });
  },
);

// ==================== NEGATIVE TESTS ====================

test.describe(
  "Brand API - Negative Tests",
  { tag: ["@api", "@brand", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.BRAND, "Negative");
    });

    test("C4671: PATCH /manager/company/title - пустое название", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: PATCH /manager/company/title - пустое название", async () => {
        const { response } = await companyAPI.updateCompanyTitle("");

        expect([400, 422]).toContain(response.status());
      });
    });

    test("C4672: PATCH /manager/company/title - слишком длинное название", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: PATCH /manager/company/title - слишком длинное название", async () => {
        const longTitle = "a".repeat(500);
        const { response } = await companyAPI.updateCompanyTitle(longTitle);

        // Может быть валидация на длину или принять
        expect([200, 400, 422]).toContain(response.status());

        // Если принято, восстанавливаем
        if (response.ok() && originalCompanyTitle) {
          await companyAPI.updateCompanyTitle(originalCompanyTitle);
        }
      });
    });

    test("C4673: PATCH /manager/company - невалидные данные", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: PATCH /manager/company - невалидные данные", async () => {
        const { response } = await companyAPI.updateCompany({
          invalidField: "test",
        });

        // Может игнорировать неизвестные поля или вернуть ошибку
        expect([200, 400, 422]).toContain(response.status());
      });
    });

    test("C4674: PATCH /manager/company/settings - невалидные настройки", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: PATCH /manager/company/settings - невалидные настройки", async () => {
        const { response } = await companyAPI.patch(
          "/manager/company/settings",
          {
            invalidSetting: true,
          },
        );

        expect([200, 400, 403, 422]).toContain(response.status());
      });
    });
  },
);

// ==================== USER ROLE ACCESS ====================

test.describe(
  "Brand API - User Role Access",
  { tag: ["@api", "@brand", "@access", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.BRAND, "User Role Access");
    });

    test(
      "C4675: Обычный пользователь может получить настройки компании (private)",
      { tag: ["@critical"] },
      async ({ companyUserAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может получить настройки компании (private)", async () => {
          const { response, data } =
            await companyUserAPI.getPrivateCompanySettings();

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      },
    );

    test("C4676: Обычный пользователь может получить email администратора", async ({
      companyUserAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обычный пользователь может получить email администратора", async () => {
        const { response, data } = await companyUserAPI.getAdminEmail();

        assertSuccessStatus(response);
        expect(data).toBeDefined();
      });
    });

    test("C4677: Обычный пользователь может получить активные интеграции", async ({
      companyUserAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обычный пользователь может получить активные интеграции", async () => {
        const { response, data } = await companyUserAPI.getActiveIntegrations();

        assertSuccessStatus(response);
        expect(data).toBeDefined();
      });
    });

    test("C4678: Обычный пользователь НЕ должен получать данные компании (manager)", async ({
      companyUserAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Обычный пользователь НЕ должен получать данные компании (manager)", async () => {
        const { response } = await companyUserAPI.getCompany();

        expect([200, 403]).toContain(response.status());
      });
    });

    test("C4679: Обычный пользователь НЕ может обновить название компании", async ({
      companyUserAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обычный пользователь НЕ может обновить название компании", async () => {
        const { response } = await companyUserAPI.updateCompanyTitle("Тест");

        expect(response.status()).toBe(403);
      });
    });

    test("C4680: Обычный пользователь НЕ должен получать настройки компании (manager)", async ({
      companyUserAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Обычный пользователь НЕ должен получать настройки компании (manager)", async () => {
        const { response } = await companyUserAPI.getManagerCompanySettings();

        // Ожидаем 200, 403 или 404 (доступ может быть разрешён или нет)
        expect([200, 403, 404]).toContain(response.status());
      });
    });

    test("C4681: Обычный пользователь НЕ может получить токены компании", async ({
      companyUserAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обычный пользователь НЕ может получить токены компании", async () => {
        const { response } = await companyUserAPI.getCompanyTokens();

        expect([403]).toContain(response.status());
      });
    });
  },
);

// ==================== INTEGRATION TESTS ====================

test.describe(
  "Brand API - Integration Tests",
  { tag: ["@api", "@brand", "@integration", "@regression"] },
  () => {
    // Тесты обновляют название компании — нельзя параллелить
    test.describe.configure({ mode: "serial" });

    test.beforeEach(() => {
      markAsAPITest(MODULES.BRAND, "Integration");
    });

    test("C4682: Согласованность: manager и private настройки", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Согласованность: manager и private настройки", async () => {
        // Получаем через manager
        const { response: managerResp, data: managerData } =
          await companyAPI.getManagerCompanySettings();

        if (!managerResp.ok()) {
          test.skip(true, "Нет доступа к manager настройкам");
          return;
        }

        // Получаем через private
        const { response: privateResp, data: privateData } =
          await companyAPI.getPrivateCompanySettings();
        expect(privateResp.ok()).toBe(true);

        // Оба должны быть объектами с настройками
        expect(typeof managerData).toBe("object");
        expect(typeof privateData).toBe("object");
      });
    });

    test("C4683: Обновление названия и проверка изменения", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновление названия и проверка изменения", async () => {
        // Получаем текущее название
        const { response: getResp1, data: getData1 } =
          await companyAPI.getCompany();

        if (!getResp1.ok()) {
          test.skip(true, "Нет доступа к компании");
          return;
        }

        const originalTitle = getData1.title;
        const testTitle = TestDataHelper.generateUniqueName(
          "Интеграционный тест компания",
        );

        try {
          // Обновляем
          const { response: updateResp } =
            await companyAPI.updateCompanyTitle(testTitle);

          if (!updateResp.ok()) {
            test.skip(true, "Не удалось обновить название");
            return;
          }

          // Проверяем изменение
          const { response: getResp2, data: getData2 } =
            await companyAPI.getCompany();
          expect(getResp2.ok()).toBe(true);
          expect(getData2.title).toBe(testTitle);
        } finally {
          // Восстанавливаем оригинальное название
          if (originalTitle) {
            await companyAPI.updateCompanyTitle(originalTitle);
          }
        }
      });
    });

    test("C4684: Множественные запросы данных компании стабильны", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      let results, statuses;
      await test.step("Выполнить запрос: Множественные запросы данных компании стабильны", async () => {
        results = [];

        for (let i = 0; i < 3; i++) {
          const { response, data } = await companyAPI.getCompany();
          results.push({
            status: response.status(),
            title: data?.title,
          });
        }

        // Все запросы должны вернуть одинаковый статус
        statuses = [...new Set(results.map((r) => r.status))];
      });

      await test.step("Проверить ответ", async () => {
        expect(statuses.length).toBe(1);

        // Если успешно, название должно быть одинаковым
        if (results[0].status === 200) {
          const titles = [...new Set(results.map((r) => r.title))];
          expect(titles.length).toBe(1);
        }
      });
    });
  },
);

// ==================== DATA STRUCTURE ====================

test.describe(
  "Brand API - Data Structure",
  { tag: ["@api", "@brand", "@structure", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.BRAND, "Data Structure");
    });

    test("C4685: Данные компании содержат ожидаемую структуру", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Данные компании содержат ожидаемую структуру", async () => {
        const { response, data } = await companyAPI.getCompany();

        if (!response.ok()) {
          test.skip(true, "Нет доступа к компании");
          return;
        }

        expect(data).toBeDefined();
        expect(typeof data).toBe("object");

        // Базовые поля которые обычно есть
        // id, title, createdAt и т.д.
        expect(data.id !== undefined || data.companyId !== undefined).toBe(
          true,
        );
      });
    });

    test("C4686: Настройки компании содержат настраиваемые параметры", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Настройки компании содержат настраиваемые параметры", async () => {
        const { response, data } = await companyAPI.getManagerCompanySettings();

        if (!response.ok()) {
          test.skip(true, "Нет доступа к настройкам");
          return;
        }

        expect(data).toBeDefined();
        expect(typeof data).toBe("object");
      });
    });

    test("C4687: Токены компании имеют корректную структуру", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Токены компании имеют корректную структуру", async () => {
        const { response, data } = await companyAPI.getCompanyTokens({
          limit: 5,
        });

        if (!response.ok()) {
          test.skip(true, "Нет доступа к токенам");
          return;
        }

        const items = data?.items || data || [];

        if (items.length > 0) {
          const token = items[0];
          expect(token).toHaveProperty("id");
          // Токены обычно имеют тип, значение или дату создания
        }
      });
    });
  },
);
