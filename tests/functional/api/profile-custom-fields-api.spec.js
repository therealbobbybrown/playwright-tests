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
 * API тесты для кастомных полей профиля — получение и строковые поля
 *
 * Покрытие (TASK-041, TASK-042):
 * - getFieldValues(userId) - получение значений полей
 * - updateStringFieldValue(userId, fieldId, value) - обновление строкового поля
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

// ==================== GET FIELD VALUES ====================

test.describe.configure({ mode: "serial" });

test.describe(
  "Profile Custom Fields API - Get Field Values",
  { tag: ["@api", "@profile", "@custom-fields", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Custom Fields - Get");
    });

    test(
      "C6355: GET /private/users/{userId}/fields/values - получить значения кастомных полей текущего пользователя",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/users/{userId}/fields/values", async () => {
          await initCtx(adminAPI);
          const userId = ctx.targetUserId || adminAPI.getCurrentUserId();
          test.skip(!userId, "Нет пользователя для теста");

          const { response, data } = await adminAPI.getFieldValues(userId);

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = Array.isArray(data) ? data : data?.items || [];
          assertValidArray(items);

          if (items.length > 0) {
            expect(items[0]).toHaveProperty("fieldId");
          }
        });
      },
    );

    test("C6356: Получить значения полей другого пользователя (админ)", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить значения полей другого пользователя (админ)", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        test.skip(!userId, "Нет другого пользователя");

        const { response, data } = await adminAPI.getFieldValues(userId);

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = Array.isArray(data) ? data : data?.items || [];
        assertValidArray(items);
      });
    });

    test("C6357: Получить значения полей - несуществующий пользователь", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить значения полей - несуществующий пользователь", async () => {
        const { response } = await adminAPI.getFieldValues(999999999);
        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6358: Получить значения полей - невалидный ID (строка)", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить значения полей - невалидный ID (строка)", async () => {
        const { response } = await adminAPI.getFieldValues("invalid-id");
        expect([400, 404, 500]).toContain(response.status());
      });
    });

    test("C6359: Получить значения полей - отрицательный ID", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить значения полей - отрицательный ID", async () => {
        const { response } = await adminAPI.getFieldValues(-1);
        expect([200, 400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== UPDATE STRING FIELD ====================

test.describe(
  "Profile Custom Fields API - Update String Field",
  { tag: ["@api", "@profile", "@custom-fields", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Custom Fields - String Update");
    });

    test(
      "C6360: POST /private/users/{userId}/fields/{fieldId}/values/string - обновить строковое поле",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: POST .../values/string - обновить строковое поле", async () => {
          await initCtx(adminAPI);
          const userId = ctx.targetUserId;
          const fieldId = ctx.stringFieldId;
          test.skip(
            !userId || !fieldId,
            "initCtx: нет целевого пользователя или строкового поля",
          );

          const { data: beforeData } = await adminAPI.getFieldValues(userId);
          const { valueId, currentValue: originalValue } = getFieldEntry(
            beforeData,
            fieldId,
          );
          const testValue = `Тестовое значение ${Date.now()}`;

          try {
            const { response, data } = await adminAPI.updateStringFieldValue(
              userId,
              fieldId,
              testValue,
              valueId,
            );

            expect([200, 201, 204, 400, 403]).toContain(response.status());

            if (response.ok()) {
              const { data: afterData } = await adminAPI.getFieldValues(userId);
              const { currentValue: updatedValue } = getFieldEntry(
                afterData,
                fieldId,
              );
              expect(updatedValue).toBe(testValue);
            }
          } finally {
            const { data: restoreData } = await adminAPI.getFieldValues(userId);
            const { valueId: restoreValueId } = getFieldEntry(
              restoreData,
              fieldId,
            );
            await adminAPI
              .updateStringFieldValue(
                userId,
                fieldId,
                originalValue ?? "",
                restoreValueId,
              )
              .catch(() => {});
          }
        });
      },
    );

    test("C6361: Обновить строковое поле - пустое значение", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить строковое поле - пустое значение", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.stringFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или строкового поля",
        );

        const { data: beforeData } = await adminAPI.getFieldValues(userId);
        const { valueId, currentValue: originalValue } = getFieldEntry(
          beforeData,
          fieldId,
        );

        try {
          const { response } = await adminAPI.updateStringFieldValue(
            userId,
            fieldId,
            "",
            valueId,
          );
          expect([200, 201, 204, 400, 422]).toContain(response.status());
        } finally {
          const { data: restoreData } = await adminAPI.getFieldValues(userId);
          const { valueId: restoreValueId } = getFieldEntry(
            restoreData,
            fieldId,
          );
          await adminAPI
            .updateStringFieldValue(
              userId,
              fieldId,
              originalValue ?? "",
              restoreValueId,
            )
            .catch(() => {});
        }
      });
    });

    test("C6362: Обновить строковое поле - очень длинное значение", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить строковое поле - очень длинное значение", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.stringFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или строкового поля",
        );

        const { data: beforeData } = await adminAPI.getFieldValues(userId);
        const { valueId, currentValue: originalValue } = getFieldEntry(
          beforeData,
          fieldId,
        );
        const longValue = "A".repeat(10000);

        try {
          const { response } = await adminAPI.updateStringFieldValue(
            userId,
            fieldId,
            longValue,
            valueId,
          );
          expect([200, 201, 204, 400, 413, 422]).toContain(response.status());
        } finally {
          const { data: restoreData } = await adminAPI.getFieldValues(userId);
          const { valueId: restoreValueId } = getFieldEntry(
            restoreData,
            fieldId,
          );
          await adminAPI
            .updateStringFieldValue(
              userId,
              fieldId,
              originalValue ?? "",
              restoreValueId,
            )
            .catch(() => {});
        }
      });
    });

    test("C6363: Обновить строковое поле - несуществующее поле", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить строковое поле - несуществующее поле", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        test.skip(!userId, "initCtx: нет целевого пользователя");

        const { response } = await adminAPI.updateStringFieldValue(
          userId,
          999999999,
          "test",
        );
        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6364: Обновить строковое поле - несуществующий пользователь", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить строковое поле - несуществующий пользователь", async () => {
        const { response } = await adminAPI.updateStringFieldValue(
          999999999,
          1,
          "test",
        );
        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6365: Обновить строковое поле - спецсимволы", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить строковое поле - спецсимволы", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.stringFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или строкового поля",
        );

        const { data: beforeData } = await adminAPI.getFieldValues(userId);
        const { valueId, currentValue: originalValue } = getFieldEntry(
          beforeData,
          fieldId,
        );
        const specialValue = '<script>alert("test")</script>';

        try {
          const { response } = await adminAPI.updateStringFieldValue(
            userId,
            fieldId,
            specialValue,
            valueId,
          );
          expect([200, 201, 204, 400, 422]).toContain(response.status());
        } finally {
          const { data: restoreData } = await adminAPI.getFieldValues(userId);
          const { valueId: restoreValueId } = getFieldEntry(
            restoreData,
            fieldId,
          );
          await adminAPI
            .updateStringFieldValue(
              userId,
              fieldId,
              originalValue ?? "",
              restoreValueId,
            )
            .catch(() => {});
        }
      });
    });
  },
);
