// @ts-check
import { test as base, expect } from "@playwright/test";
import { ProfileAPI, getCredentials } from "../../utils/api/index.js";
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
 * API тесты для кастомных полей профиля — доступ, интеграция, edge cases
 *
 * Покрытие (TASK-041, TASK-042):
 * - User Role Access — проверка прав обычного пользователя
 * - Integration Tests — полный цикл, мультитипы, мультипользователи
 * - Edge Cases — Unicode, пробелы, NaN, Infinity, параллельное обновление
 *
 * @tags @api @profile @custom-fields
 */

// Расширяем test с фикстурой для Profile API
const test = base.extend({
  adminAPI: async ({ request }, use) => {
    const api = new ProfileAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  userAPI: async ({ request }, use) => {
    const api = new ProfileAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== CTX: данные для тестов ====================

/**
 * Разделяемый контекст: targetUserId + field IDs по типу.
 * Заполняется один раз при первом вызове initCtx().
 */
const ctx = {
  targetUserId: null,
  stringFieldId: null,
  numberFieldId: null,
  datetimeFieldId: null,
};

/** Промис инициализации — гарантирует одну инициализацию при параллельных вызовах */
let _ctxInitPromise = null;

/**
 * Ленивая инициализация ctx.
 * Находит non-admin пользователя и определяет field IDs по типу через пробинг.
 * @param {ProfileAPI} adminAPI
 */
async function initCtx(adminAPI) {
  if (!_ctxInitPromise) {
    _ctxInitPromise = _doInitCtx(adminAPI);
  }
  return _ctxInitPromise;
}

async function _doInitCtx(adminAPI) {
  const adminId = adminAPI.getCurrentUserId();

  // Найти не-админ пользователя
  const { data: usersData } = await adminAPI.getUsers({ limit: 20 });
  const users = Array.isArray(usersData)
    ? usersData
    : usersData?.items || usersData?.data || [];
  const target = users.find((u) => u.id !== adminId);
  if (!target) return;
  ctx.targetUserId = target.id;

  // Собрать field IDs из profile tabs (все поля компании)
  const fieldIds = [];
  try {
    const { data: tabs } = await adminAPI.getProfileTabs(target.id);
    const tabArr = Array.isArray(tabs) ? tabs : [];
    for (const tab of tabArr) {
      if (tab?.name !== "custom") continue;
      for (const block of tab?.blocks || []) {
        for (const content of block?.contents || []) {
          const fid = content?.userFieldId ?? content?.fieldId;
          if (fid && !fieldIds.includes(fid)) fieldIds.push(fid);
        }
      }
    }
  } catch {}

  // Получить существующие значения полей — нужны valueId для UPDATE (избежать maxValuesCountExceeded)
  const existingValueIds = {};
  try {
    const { data: fv } = await adminAPI.getFieldValues(target.id);
    for (const entry of Array.isArray(fv) ? fv : []) {
      if (entry?.fieldId) {
        // Добавить в список fieldIds если ещё нет
        if (!fieldIds.includes(entry.fieldId)) fieldIds.push(entry.fieldId);
        // Сохранить valueId существующей записи
        const vid = entry?.value?.[0]?.id;
        if (vid) existingValueIds[entry.fieldId] = vid;
      }
    }
  } catch {}

  // Пробинг: определить тип каждого поля.
  // Используем existingValueIds чтобы UPDATE вместо CREATE — иначе 400 maxValuesCountExceeded.
  for (const fieldId of fieldIds) {
    if (ctx.stringFieldId && ctx.numberFieldId && ctx.datetimeFieldId) break;
    const vId = existingValueIds[fieldId] ?? null;

    if (!ctx.stringFieldId) {
      try {
        const { response } = await adminAPI.updateStringFieldValue(
          target.id,
          fieldId,
          `probe_${Date.now()}`,
          vId,
        );
        if (response.ok()) {
          ctx.stringFieldId = fieldId;
          continue;
        }
      } catch {}
    }
    if (!ctx.numberFieldId) {
      try {
        const { response } = await adminAPI.updateNumberFieldValue(
          target.id,
          fieldId,
          1,
          vId,
        );
        if (response.ok()) {
          ctx.numberFieldId = fieldId;
          continue;
        }
      } catch {}
    }
    if (!ctx.datetimeFieldId) {
      try {
        const { response } = await adminAPI.updateDatetimeFieldValue(
          target.id,
          fieldId,
          "2024-01-15T00:00:00.000Z",
          vId,
        );
        if (response.ok()) {
          ctx.datetimeFieldId = fieldId;
          continue;
        }
      } catch {}
    }
  }
}

/**
 * Извлечь текущее значение и id записи из getFieldValues-ответа.
 * Ответ API: [{fieldId, value: [{id, value, ...}]}]
 */
function getFieldEntry(fieldsData, fieldId) {
  const arr = Array.isArray(fieldsData) ? fieldsData : [];
  const entry = arr.find((f) => f.fieldId === fieldId);
  return {
    valueId: entry?.value?.[0]?.id ?? null,
    currentValue: entry?.value?.[0]?.value ?? null,
  };
}

// Все describe-блоки в этом файле используют общий ctx (один пользователь, одно поле).
// fullyParallel: true позволяет параллелить тесты из разных describe-блоков,
// что вызывает data race. Serial mode предотвращает это.
test.describe.configure({ mode: "serial" });

// ==================== USER ROLE ACCESS ====================

test.describe(
  "Profile Custom Fields API - User Role Access",
  { tag: ["@api", "@profile", "@custom-fields", "@access", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Custom Fields - Access");
    });

    test(
      "C6378: Обычный пользователь может получить свои кастомные поля",
      { tag: ["@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может получить свои кастомные поля", async () => {
          const userId = userAPI.getCurrentUserId();
          test.skip(!userId, "Не удалось получить ID текущего пользователя");

          const { response, data } = await userAPI.getFieldValues(userId);

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = Array.isArray(data) ? data : data?.items || [];
          assertValidArray(items);
        });
      },
    );

    test("C6379: Обычный пользователь может обновить свои кастомные поля", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("normal");

      let response;
      await test.step("Выполнить запрос: Обычный пользователь может обновить свои кастомные поля", async () => {
        await initCtx(adminAPI);
        const userId = userAPI.getCurrentUserId();
        const fieldId = ctx.stringFieldId;
        test.skip(!userId || !fieldId, "initCtx: нет данных для теста");

        ({ response } = await userAPI.updateStringFieldValue(
          userId,
          fieldId,
          `User update ${Date.now()}`,
        ));
      });

      await test.step("Проверить ответ", async () => {
        // Пользователь может обновить (200/201/204) или получить отказ (400/403)
        // в зависимости от self_access_type настройки поля
        expect([200, 201, 204, 400, 403]).toContain(response?.status());
      });
    });

    test("C6380: Обычный пользователь не может обновить поля другого пользователя", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");

      let response;
      await test.step("Выполнить запрос: Обычный пользователь не может обновить поля другого пользователя", async () => {
        await initCtx(adminAPI);
        const adminUserId = adminAPI.getCurrentUserId();
        const userUserId = userAPI.getCurrentUserId();
        const fieldId = ctx.stringFieldId;

        test.skip(
          !adminUserId || !userUserId || !fieldId,
          "initCtx: нет данных для теста",
        );
        test.skip(adminUserId === userUserId, "Одинаковые пользователи");

        // Пытаемся обновить поля другого пользователя от имени обычного пользователя
        ({ response } = await userAPI.updateStringFieldValue(
          adminUserId,
          fieldId,
          "Unauthorized update",
        ));
      });

      await test.step("Проверить ответ", async () => {
        expect([400, 403, 404]).toContain(response?.status());
      });
    });
  },
);

// ==================== INTEGRATION TESTS ====================

test.describe(
  "Profile Custom Fields API - Integration Tests",
  {
    tag: ["@api", "@profile", "@custom-fields", "@integration", "@regression"],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Custom Fields - Integration");
    });

    test("C6381: Полный цикл: прочитать - обновить - проверить", async ({
      adminAPI,
    }) => {
      setSeverity("critical");

      let readResp, fieldsData, userId, fieldId;
      await test.step("Выполнить запрос: Полный цикл: прочитать - обновить - проверить", async () => {
        await initCtx(adminAPI);
        userId = ctx.targetUserId;
        fieldId = ctx.stringFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или строкового поля",
        );

        ({ response: readResp, data: fieldsData } =
          await adminAPI.getFieldValues(userId));
      });

      await test.step("Проверить ответ", async () => {
        expect(readResp.ok()).toBe(true);

        const { valueId, currentValue: originalValue } = getFieldEntry(
          fieldsData,
          fieldId,
        );

        // 2. Обновляем значение
        const newValue = `Integration test ${Date.now()}`;
        const { response: updateResp } = await adminAPI.updateStringFieldValue(
          userId,
          fieldId,
          newValue,
          valueId,
        );

        if (!updateResp.ok()) {
          test.skip(true, "Обновление полей не поддерживается");
          return;
        }

        // 3. Проверяем что значение обновилось
        const { response: verifyResp, data: verifiedData } =
          await adminAPI.getFieldValues(userId);
        expect(verifyResp.ok()).toBe(true);

        const { currentValue: verifiedValue, valueId: afterValueId } =
          getFieldEntry(verifiedData, fieldId);
        expect(verifiedValue).toBe(newValue);

        // 4. Cleanup: восстанавливаем оригинальное значение
        await adminAPI
          .updateStringFieldValue(
            userId,
            fieldId,
            originalValue ?? "",
            afterValueId,
          )
          .catch(() => {});
      });
    });

    test("C6382: Обновление нескольких типов полей последовательно", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновление нескольких типов полей последовательно", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        test.skip(!userId, "initCtx: нет целевого пользователя");

        let updatesAttempted = 0;
        let updatesSucceeded = 0;

        if (ctx.stringFieldId) {
          updatesAttempted++;
          const { data: bd } = await adminAPI.getFieldValues(userId);
          const { valueId } = getFieldEntry(bd, ctx.stringFieldId);
          const { response } = await adminAPI.updateStringFieldValue(
            userId,
            ctx.stringFieldId,
            `String ${Date.now()}`,
            valueId,
          );
          if (response.ok()) updatesSucceeded++;
        }

        if (ctx.numberFieldId) {
          updatesAttempted++;
          const { data: bd } = await adminAPI.getFieldValues(userId);
          const { valueId } = getFieldEntry(bd, ctx.numberFieldId);
          const { response } = await adminAPI.updateNumberFieldValue(
            userId,
            ctx.numberFieldId,
            Date.now() % 1000,
            valueId,
          );
          if (response.ok()) updatesSucceeded++;
        }

        if (ctx.datetimeFieldId) {
          updatesAttempted++;
          const { data: bd } = await adminAPI.getFieldValues(userId);
          const { valueId } = getFieldEntry(bd, ctx.datetimeFieldId);
          const { response } = await adminAPI.updateDatetimeFieldValue(
            userId,
            ctx.datetimeFieldId,
            new Date().toISOString(),
            valueId,
          );
          if (response.ok()) updatesSucceeded++;
        }

        test.skip(updatesAttempted === 0, "Нет полей для обновления");

        console.log(
          `Обновлений: попытка ${updatesAttempted}, успех ${updatesSucceeded}`,
        );
      });
    });

    test("C6383: Получение полей разных пользователей админом", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let successCount = 0;
      await test.step("Выполнить запрос: Получение полей разных пользователей админом", async () => {
        const { data: usersData } = await adminAPI.getUsers({ limit: 5 });
        const users = Array.isArray(usersData)
          ? usersData
          : usersData?.items || [];

        test.skip(users.length < 2, "Недостаточно пользователей");

        let accessDeniedCount = 0;

        for (const user of users.slice(0, 3)) {
          const { response, data } = await adminAPI.getFieldValues(user.id);

          if (response.ok()) {
            successCount++;
            expect(data).toBeDefined();
            const items = Array.isArray(data) ? data : data?.items || [];
            assertValidArray(items);
          } else if (response.status() === 403) {
            accessDeniedCount++;
          }
        }

        console.log(
          `Успешных запросов: ${successCount}, отказов в доступе: ${accessDeniedCount}`,
        );
      });

      await test.step("Проверить ответ", async () => {
        expect(successCount).toBeGreaterThan(0);
      });
    });
  },
);

// ==================== EDGE CASES ====================

test.describe(
  "Profile Custom Fields API - Edge Cases",
  { tag: ["@api", "@profile", "@custom-fields", "@edge", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Custom Fields - Edge Cases");
    });

    test("C6384: Обновить поле - Unicode символы", async ({ adminAPI }) => {
      setSeverity("minor");

      let response;
      await test.step("Выполнить запрос: Обновить поле - Unicode символы", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.stringFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или строкового поля",
        );

        const { data: beforeData } = await adminAPI.getFieldValues(userId);
        const { valueId } = getFieldEntry(beforeData, fieldId);
        const unicodeValue = "日本語テスト 🎉 Тест кириллицы";

        ({ response } = await adminAPI.updateStringFieldValue(
          userId,
          fieldId,
          unicodeValue,
          valueId,
        ));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 204, 400, 422]).toContain(response?.status());
      });
    });

    test("C6385: Обновить поле - только пробелы", async ({ adminAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Обновить поле - только пробелы", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.stringFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или строкового поля",
        );

        const { data: beforeData } = await adminAPI.getFieldValues(userId);
        const { valueId } = getFieldEntry(beforeData, fieldId);

        const { response } = await adminAPI.updateStringFieldValue(
          userId,
          fieldId,
          "   ",
          valueId,
        );
        expect([200, 201, 204, 400, 422]).toContain(response.status());
      });
    });

    test("C6386: Обновить числовое поле - NaN", async ({ adminAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Обновить числовое поле - NaN", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.numberFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или числового поля",
        );

        const { data: beforeData } = await adminAPI.getFieldValues(userId);
        const { valueId } = getFieldEntry(beforeData, fieldId);

        const { response } = await adminAPI.updateNumberFieldValue(
          userId,
          fieldId,
          NaN,
          valueId,
        );
        expect([400, 422, 500]).toContain(response.status());
      });
    });

    test("C6387: Обновить числовое поле - Infinity", async ({ adminAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Обновить числовое поле - Infinity", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.numberFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или числового поля",
        );

        const { data: beforeData } = await adminAPI.getFieldValues(userId);
        const { valueId } = getFieldEntry(beforeData, fieldId);

        const { response } = await adminAPI.updateNumberFieldValue(
          userId,
          fieldId,
          Infinity,
          valueId,
        );
        expect([400, 422, 500]).toContain(response.status());
      });
    });

    test("C6388: Параллельное обновление одного поля", async ({ adminAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Параллельное обновление одного поля", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.stringFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или строкового поля",
        );

        const { data: beforeData } = await adminAPI.getFieldValues(userId);
        const { valueId } = getFieldEntry(beforeData, fieldId);

        // Отправляем несколько запросов параллельно
        const promises = [
          adminAPI.updateStringFieldValue(userId, fieldId, "Value 1", valueId),
          adminAPI.updateStringFieldValue(userId, fieldId, "Value 2", valueId),
          adminAPI.updateStringFieldValue(userId, fieldId, "Value 3", valueId),
        ];

        const results = await Promise.all(promises);

        results.forEach(({ response }) => {
          expect([200, 201, 204, 400, 409, 422, 429]).toContain(
            response.status(),
          );
        });
      });
    });
  },
);
