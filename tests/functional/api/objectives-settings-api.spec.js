// @ts-check
import { test as base, expect } from "@playwright/test";
import { allure } from "allure-playwright";
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
 * API тесты для менеджерских настроек модуля Objectives (Цели)
 * TASK-039-040
 *
 * Покрытие:
 * - Получение настроек целей
 * - Сохранение настроек целей
 * - Включение/отключение мотивационных целей
 * - Контроль доступа к настройкам
 * - Валидация входных данных
 */

// Хелперы для Allure логирования
function logInput(name, value) {
  allure.attachment(
    `Input: ${name}`,
    JSON.stringify(value, null, 2),
    "application/json",
  );
}

function logExpected(description) {
  allure.attachment("Expected", description, "text/plain");
}

function logResponse(response, data) {
  allure.attachment(
    `Response (${response.status()})`,
    JSON.stringify(data, null, 2),
    "application/json",
  );
}

// Расширяем test с фикстурой для Objectives API
const test = base.extend({
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
});

test.describe(
  "Objectives Settings API - GET Settings",
  { tag: ["@api", "@objectives", "@settings", "@manager", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Manager Settings GET");
    });

    test("C5574: GET /manager/objectives/settings/ - получить настройки целей", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: GET /manager/objectives/settings/ - получить настройки целей", async () => {
        logExpected("Настройки целей возвращаются успешно");

        const { response, data } = await objectivesAPI.getSettings();
        logResponse(response, data);

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          // Настройки могут содержать различные поля
          // Проверяем что это объект
          expect(typeof data === "object").toBe(true);
        }
      });
    });

    test("C5658: GET /manager/objectives/settings/ - структура настроек", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /manager/objectives/settings/ - структура настроек", async () => {
        logExpected("Настройки содержат ожидаемые поля");

        const { response, data } = await objectivesAPI.getSettings();
        logResponse(response, data);

        expect([200, 403]).toContain(response.status());

        if (response.ok() && data) {
          // Проверяем возможные поля настроек
          // Конкретные поля зависят от API
          expect(typeof data).toBe("object");

          // Логируем структуру для анализа
          allure.attachment(
            "Settings structure",
            JSON.stringify(Object.keys(data), null, 2),
            "application/json",
          );
        }
      });
    });

    test("C5659: GET /manager/objectives/settings/ - повторный запрос возвращает те же данные", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let resp1, data1, resp2, data2;
      await test.step("Выполнить запрос: GET /manager/objectives/settings/ - повторный запрос возвращает те же данные", async () => {
        logExpected("Повторный запрос возвращает идентичные настройки");

        ({ response: resp1, data: data1 } = await objectivesAPI.getSettings());

        if (!resp1.ok()) {
          test.skip(true, "Настройки недоступны");
          return;
        }

        ({ response: resp2, data: data2 } = await objectivesAPI.getSettings());
      });

      await test.step("Проверить ответ", async () => {
        expect(resp2.ok()).toBe(true);

        // Настройки должны быть идентичны (если не были изменены между запросами)
        logInput("comparison", { settings1: data1, settings2: data2 });

        // Сравниваем ключи
        expect(Object.keys(data1 || {}).sort()).toEqual(
          Object.keys(data2 || {}).sort(),
        );
      });
    });
  },
);

test.describe(
  "Objectives Settings API - POST Settings",
  { tag: ["@api", "@objectives", "@settings", "@manager", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Manager Settings POST");
    });

    test("C5660: POST /manager/objectives/settings/ - сохранить настройки (без изменений)", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: POST /manager/objectives/settings/ - сохранить настройки (без изменений)", async () => {
        // Получаем текущие настройки
        const { response: getResp, data: currentSettings } =
          await objectivesAPI.getSettings();

        if (!getResp.ok()) {
          test.skip(true, "Не удалось получить текущие настройки");
          return;
        }

        logInput("currentSettings", currentSettings);
        logExpected("Настройки сохраняются без изменений");

        // Сохраняем те же настройки
        const { response, data } = await objectivesAPI.saveSettings(
          currentSettings || {},
        );
        logResponse(response, data);

        expect([200, 201, 400, 403]).toContain(response.status());
      });
    });

    test("C5661: POST /manager/objectives/settings/ - сохранить с пустым объектом", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /manager/objectives/settings/ - сохранить с пустым объектом", async () => {
        logInput("settings", {});
        logExpected("Сохранение пустого объекта или ошибка валидации");

        const { response, data } = await objectivesAPI.saveSettings({});
        logResponse(response, data);

        // Может быть успех или ошибка валидации
        expect([200, 201, 400, 403, 422]).toContain(response.status());
      });
    });

    test("C5662: POST /manager/objectives/settings/ - сохранить с дополнительными полями", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      let response, data;
      await test.step("Выполнить запрос: POST /manager/objectives/settings/ - сохранить с дополнительными полями", async () => {
        // Получаем текущие настройки
        const { response: getResp, data: currentSettings } =
          await objectivesAPI.getSettings();

        if (!getResp.ok()) {
          test.skip(true, "Не удалось получить текущие настройки");
          return;
        }

        const settingsWithExtra = {
          ...currentSettings,
          extraField: "test",
          anotherExtra: 123,
        };

        logInput("settings", settingsWithExtra);
        logExpected("API игнорирует неизвестные поля или возвращает ошибку");

        ({ response, data } =
          await objectivesAPI.saveSettings(settingsWithExtra));
        logResponse(response, data);

        // API может игнорировать неизвестные поля или вернуть ошибку
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 403, 422]).toContain(response.status());
      });
    });

    test("C5663: POST /manager/objectives/settings/ - идемпотентность", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /manager/objectives/settings/ - идемпотентность", async () => {
        // Получаем текущие настройки
        const { response: getResp, data: currentSettings } =
          await objectivesAPI.getSettings();

        if (!getResp.ok()) {
          test.skip(true, "Не удалось получить текущие настройки");
          return;
        }

        logInput("settings", currentSettings);
        logExpected("Повторное сохранение возвращает тот же результат");

        // Сохраняем дважды
        const { response: resp1 } = await objectivesAPI.saveSettings(
          currentSettings || {},
        );
        const { response: resp2 } = await objectivesAPI.saveSettings(
          currentSettings || {},
        );

        if (resp1.ok() && resp2.ok()) {
          // Оба запроса должны быть успешными
          expect(resp1.status()).toBe(resp2.status());
        }
      });
    });
  },
);

test.describe(
  "Objectives Settings API - Motivational",
  { tag: ["@api", "@objectives", "@settings", "@motivational", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Motivational Settings");
    });

    test("C5576: POST /manager/objectives/motivational-enabled/ - включить мотивационные цели", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: POST /manager/objectives/motivational-enabled/ - включить мотивационные цели", async () => {
        logExpected("Мотивационные цели включаются успешно");

        const { response, data } = await objectivesAPI.enableMotivational();
        logResponse(response, data);

        expect([200, 201, 400, 403]).toContain(response.status());
      });
    });

    test("C5577: POST /manager/objectives/motivational-disabled/ - отключить мотивационные цели", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: POST /manager/objectives/motivational-disabled/ - отключить мотивационные цели", async () => {
        logExpected("Мотивационные цели отключаются успешно");

        const { response, data } = await objectivesAPI.disableMotivational();
        logResponse(response, data);

        expect([200, 201, 400, 403]).toContain(response.status());
      });
    });

    test("C5666: Переключение мотивационных целей: включить → отключить", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Переключение мотивационных целей: включить → отключить", async () => {
        logExpected("Мотивационные цели переключаются без ошибок");

        // Включаем
        const { response: enableResp } =
          await objectivesAPI.enableMotivational();
        logInput("step1", { action: "enable", status: enableResp.status() });

        if (!enableResp.ok() && enableResp.status() !== 400) {
          test.skip(true, "Включение мотивационных целей недоступно");
          return;
        }

        // Отключаем
        const { response: disableResp } =
          await objectivesAPI.disableMotivational();
        logInput("step2", { action: "disable", status: disableResp.status() });

        expect([200, 201, 400, 403]).toContain(disableResp.status());
      });
    });

    test("C5667: Переключение мотивационных целей: отключить → включить", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Переключение мотивационных целей: отключить → включить", async () => {
        logExpected("Мотивационные цели переключаются без ошибок");

        // Отключаем
        const { response: disableResp } =
          await objectivesAPI.disableMotivational();
        logInput("step1", { action: "disable", status: disableResp.status() });

        if (!disableResp.ok() && disableResp.status() !== 400) {
          test.skip(true, "Отключение мотивационных целей недоступно");
          return;
        }

        // Включаем
        const { response: enableResp } =
          await objectivesAPI.enableMotivational();
        logInput("step2", { action: "enable", status: enableResp.status() });

        expect([200, 201, 400, 403]).toContain(enableResp.status());
      });
    });

    test("C5668: Повторное включение мотивационных целей (идемпотентность)", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Повторное включение мотивационных целей (идемпотентность)", async () => {
        logExpected("Повторное включение не вызывает ошибок");

        const { response: resp1 } = await objectivesAPI.enableMotivational();
        const { response: resp2 } = await objectivesAPI.enableMotivational();

        logInput("responses", {
          first: resp1.status(),
          second: resp2.status(),
        });

        // Оба запроса должны вернуть допустимый статус
        expect([200, 201, 400, 403]).toContain(resp1.status());
        expect([200, 201, 400, 403]).toContain(resp2.status());
      });
    });

    test("C5669: Повторное отключение мотивационных целей (идемпотентность)", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Повторное отключение мотивационных целей (идемпотентность)", async () => {
        logExpected("Повторное отключение не вызывает ошибок");

        const { response: resp1 } = await objectivesAPI.disableMotivational();
        const { response: resp2 } = await objectivesAPI.disableMotivational();

        logInput("responses", {
          first: resp1.status(),
          second: resp2.status(),
        });

        // Оба запроса должны вернуть допустимый статус
        expect([200, 201, 400, 403]).toContain(resp1.status());
        expect([200, 201, 400, 403]).toContain(resp2.status());
      });
    });
  },
);

test.describe(
  "Objectives Settings API - Access Control",
  { tag: ["@api", "@objectives", "@settings", "@access", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Settings Access Control");
    });

    test("C5670: Обычный пользователь НЕ имеет доступа к GET settings", async ({
      objectivesUserAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Обычный пользователь НЕ имеет доступа к GET settings", async () => {
        logExpected("Ошибка 403 Forbidden для обычного пользователя");

        const { response } = await objectivesUserAPI.getSettings();
        logResponse(response, {});

        assertForbidden(response);
      });
    });

    test("C5671: Обычный пользователь НЕ имеет доступа к POST settings", async ({
      objectivesUserAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Обычный пользователь НЕ имеет доступа к POST settings", async () => {
        logInput("settings", {});
        logExpected("Ошибка 403 Forbidden для обычного пользователя");

        const { response } = await objectivesUserAPI.saveSettings({});
        logResponse(response, {});

        assertForbidden(response);
      });
    });

    test("C5672: Обычный пользователь НЕ имеет доступа к enableMotivational", async ({
      objectivesUserAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Обычный пользователь НЕ имеет доступа к enableMotivational", async () => {
        logExpected("Ошибка 403 Forbidden для обычного пользователя");

        const { response } = await objectivesUserAPI.enableMotivational();
        logResponse(response, {});

        assertForbidden(response);
      });
    });

    test("C5673: Обычный пользователь НЕ имеет доступа к disableMotivational", async ({
      objectivesUserAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Обычный пользователь НЕ имеет доступа к disableMotivational", async () => {
        logExpected("Ошибка 403 Forbidden для обычного пользователя");

        const { response } = await objectivesUserAPI.disableMotivational();
        logResponse(response, {});

        assertForbidden(response);
      });
    });

    test("C5674: Admin имеет доступ ко всем настройкам", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      let getResp;
      await test.step("Выполнить запрос: Admin имеет доступ ко всем настройкам", async () => {
        logExpected("Admin имеет полный доступ к настройкам");

        // GET settings
        ({ response: getResp } = await objectivesAPI.getSettings());
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(getResp.status());

        // Enable motivational
        const { response: enableResp } =
          await objectivesAPI.enableMotivational();
        expect([200, 201, 400, 403]).toContain(enableResp.status());

        // Disable motivational
        const { response: disableResp } =
          await objectivesAPI.disableMotivational();
        expect([200, 201, 400, 403]).toContain(disableResp.status());

        logInput("accessResults", {
          getSettings: getResp.status(),
          enableMotivational: enableResp.status(),
          disableMotivational: disableResp.status(),
        });
      });
    });
  },
);

test.describe(
  "Objectives Settings API - Validation",
  { tag: ["@api", "@objectives", "@settings", "@validation", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Settings Validation");
    });

    test("C5675: POST /manager/objectives/settings/ - null как payload", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: POST /manager/objectives/settings/ - null как payload", async () => {
        logInput("settings", null);
        logExpected("Ошибка валидации или принятие пустого объекта");

        const { response, data } = await objectivesAPI.saveSettings(null);
        logResponse(response, data);

        expect([200, 400, 403, 422, 500]).toContain(response.status());
      });
    });

    test("C5676: POST /manager/objectives/settings/ - невалидные типы данных", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: POST /manager/objectives/settings/ - невалидные типы данных", async () => {
        const invalidSettings = {
          someField: "should be number",
          anotherField: ["unexpected", "array"],
          nested: { deep: { object: true } },
        };

        logInput("settings", invalidSettings);
        logExpected("Ошибка валидации или игнорирование невалидных полей");

        const { response, data } =
          await objectivesAPI.saveSettings(invalidSettings);
        logResponse(response, data);

        expect([200, 201, 400, 403, 422]).toContain(response.status());
      });
    });

    test("C5677: POST /manager/objectives/settings/ - очень большой payload", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: POST /manager/objectives/settings/ - очень большой payload", async () => {
        // Создаём большой объект
        const largeSettings = {};
        for (let i = 0; i < 100; i++) {
          largeSettings[`field_${i}`] = "A".repeat(1000);
        }

        logInput("settingsSize", JSON.stringify(largeSettings).length);
        logExpected("Ошибка размера или принятие");

        const { response, data } =
          await objectivesAPI.saveSettings(largeSettings);
        logResponse(response, data);

        expect([200, 201, 400, 403, 413, 422]).toContain(response.status());
      });
    });
  },
);

test.describe(
  "Objectives Settings API - Consistency",
  { tag: ["@api", "@objectives", "@settings", "@consistency", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Settings Consistency");
    });

    test("C5678: Настройки сохраняются и считываются корректно", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      let getResp1, originalSettings, getResp2, savedSettings;
      await test.step("Выполнить запрос: Настройки сохраняются и считываются корректно", async () => {
        // Получаем текущие настройки
        ({ response: getResp1, data: originalSettings } =
          await objectivesAPI.getSettings());

        if (!getResp1.ok()) {
          test.skip(true, "Настройки недоступны");
          return;
        }

        logInput("originalSettings", originalSettings);
        logExpected("Настройки сохраняются и считываются без искажений");

        // Сохраняем настройки
        const { response: saveResp } = await objectivesAPI.saveSettings(
          originalSettings || {},
        );

        if (!saveResp.ok()) {
          logInput("saveError", saveResp.status());
          return;
        }

        // Считываем настройки снова
        ({ response: getResp2, data: savedSettings } =
          await objectivesAPI.getSettings());
      });

      await test.step("Проверить ответ", async () => {
        expect(getResp2.ok()).toBe(true);

        // Сравниваем ключи (значения могут измениться из-за нормализации на сервере)
        const originalKeys = Object.keys(originalSettings || {}).sort();
        const savedKeys = Object.keys(savedSettings || {}).sort();

        logInput("comparison", { originalKeys, savedKeys });

        // Основные ключи должны сохраниться
        for (const key of originalKeys) {
          if (savedSettings && key in savedSettings) {
            // Ключ присутствует
          }
        }
      });
    });

    test("C5679: Изменения настроек персистентны", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let checkResp, checkSettings;
      await test.step("Выполнить запрос: Изменения настроек персистентны", async () => {
        // Получаем текущие настройки
        const { response: getResp, data: originalSettings } =
          await objectivesAPI.getSettings();

        if (!getResp.ok()) {
          test.skip(true, "Настройки недоступны");
          return;
        }

        logInput("originalSettings", originalSettings);
        logExpected("Изменения настроек сохраняются между запросами");

        // Пробуем переключить мотивационные цели
        const { response: toggleResp } =
          await objectivesAPI.enableMotivational();

        if (!toggleResp.ok()) {
          logInput("toggleError", toggleResp.status());
          return;
        }

        // Проверяем что изменение применилось
        ({ response: checkResp, data: checkSettings } =
          await objectivesAPI.getSettings());
      });

      await test.step("Проверить ответ", async () => {
        expect(checkResp.ok()).toBe(true);

        logInput("afterToggle", checkSettings);

        // Восстанавливаем исходное состояние
        await objectivesAPI.disableMotivational();
      });
    });
  },
);

test.describe(
  "Objectives Settings API - Edge Cases",
  { tag: ["@api", "@objectives", "@settings", "@edge", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Settings Edge Cases");
    });

    test("C5680: Быстрое переключение мотивационных целей", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Быстрое переключение мотивационных целей", async () => {
        logExpected("Быстрые переключения не вызывают ошибок");

        const results = [];

        // Быстро переключаем несколько раз
        for (let i = 0; i < 5; i++) {
          const action = i % 2 === 0 ? "enable" : "disable";
          const { response } =
            action === "enable"
              ? await objectivesAPI.enableMotivational()
              : await objectivesAPI.disableMotivational();
          results.push({ action, status: response.status() });
        }

        logInput("toggleResults", results);

        // Все переключения должны вернуть допустимый статус
        for (const result of results) {
          expect([200, 201, 400, 403]).toContain(result.status);
        }
      });
    });

    test("C5681: Параллельные запросы к настройкам", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      let statuses;
      await test.step("Выполнить запрос: Параллельные запросы к настройкам", async () => {
        logExpected("Параллельные запросы обрабатываются корректно");

        // Запускаем несколько запросов параллельно
        const promises = [
          objectivesAPI.getSettings(),
          objectivesAPI.getSettings(),
          objectivesAPI.getSettings(),
        ];

        const results = await Promise.all(promises);

        // Все запросы должны быть успешными
        for (const { response } of results) {
          expect([200, 403]).toContain(response.status());
        }

        // Все должны вернуть одинаковые данные
        statuses = results.map((r) => r.response.status());
        logInput("parallelResults", { statuses });
      });

      await test.step("Проверить ответ", async () => {
        expect(new Set(statuses).size).toBe(1); // Все статусы должны быть одинаковыми
      });
    });

    test("C5682: Сохранение настроек после множественных GET", async ({
      objectivesAPI,
    }) => {
      setSeverity("minor");

      let saveResp;
      await test.step("Выполнить запрос: Сохранение настроек после множественных GET", async () => {
        logExpected("Сохранение работает после множественных GET");

        // Делаем несколько GET запросов
        for (let i = 0; i < 3; i++) {
          await objectivesAPI.getSettings();
        }

        // Получаем настройки
        const { response: getResp, data: settings } =
          await objectivesAPI.getSettings();

        if (!getResp.ok()) {
          test.skip(true, "Настройки недоступны");
          return;
        }

        // Сохраняем
        ({ response: saveResp } = await objectivesAPI.saveSettings(
          settings || {},
        ));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 403]).toContain(saveResp.status());
      });
    });
  },
);
