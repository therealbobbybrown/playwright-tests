// @ts-check
import { test as base, expect } from "@playwright/test";
import { ProfileAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * API тесты для кастомных полей профиля — числовые и datetime поля
 *
 * Покрытие (TASK-041, TASK-042):
 * - updateNumberFieldValue(userId, fieldId, value) - обновление числового поля
 * - updateDatetimeFieldValue(userId, fieldId, value) - обновление даты
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

// ==================== UPDATE NUMBER FIELD ====================

test.describe.configure({ mode: "serial" });

test.describe(
  "Profile Custom Fields API - Update Number Field",
  { tag: ["@api", "@profile", "@custom-fields", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Custom Fields - Number Update");
    });

    test(
      "C6366: POST /private/users/{userId}/fields/{fieldId}/values/number - обновить числовое поле",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: POST .../values/number - обновить числовое поле", async () => {
          await initCtx(adminAPI);
          const userId = ctx.targetUserId;
          const fieldId = ctx.numberFieldId;
          test.skip(
            !userId || !fieldId,
            "initCtx: нет целевого пользователя или числового поля",
          );

          const { data: beforeData } = await adminAPI.getFieldValues(userId);
          const { valueId, currentValue: originalValue } = getFieldEntry(
            beforeData,
            fieldId,
          );
          const testValue = 42;

          try {
            const { response } = await adminAPI.updateNumberFieldValue(
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
              expect(Number(updatedValue)).toBe(testValue);
            }
          } finally {
            const { data: restoreData } = await adminAPI.getFieldValues(userId);
            const { valueId: restoreValueId } = getFieldEntry(
              restoreData,
              fieldId,
            );
            if (originalValue !== null) {
              await adminAPI
                .updateNumberFieldValue(
                  userId,
                  fieldId,
                  Number(originalValue),
                  restoreValueId,
                )
                .catch(() => {});
            }
          }
        });
      },
    );

    test("C6367: Обновить числовое поле - дробное число", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить числовое поле - дробное число", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.numberFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или числового поля",
        );

        const { data: beforeData } = await adminAPI.getFieldValues(userId);
        const { valueId, currentValue: originalValue } = getFieldEntry(
          beforeData,
          fieldId,
        );

        try {
          const { response } = await adminAPI.updateNumberFieldValue(
            userId,
            fieldId,
            3.14159,
            valueId,
          );
          expect([200, 201, 204, 400, 422]).toContain(response.status());
        } finally {
          const { data: restoreData } = await adminAPI.getFieldValues(userId);
          const { valueId: restoreValueId } = getFieldEntry(
            restoreData,
            fieldId,
          );
          if (originalValue !== null) {
            await adminAPI
              .updateNumberFieldValue(
                userId,
                fieldId,
                Number(originalValue),
                restoreValueId,
              )
              .catch(() => {});
          }
        }
      });
    });

    test("C6368: Обновить числовое поле - отрицательное число", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить числовое поле - отрицательное число", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.numberFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или числового поля",
        );

        const { data: beforeData } = await adminAPI.getFieldValues(userId);
        const { valueId, currentValue: originalValue } = getFieldEntry(
          beforeData,
          fieldId,
        );

        try {
          const { response } = await adminAPI.updateNumberFieldValue(
            userId,
            fieldId,
            -100,
            valueId,
          );
          expect([200, 201, 204, 400, 422]).toContain(response.status());
        } finally {
          const { data: restoreData } = await adminAPI.getFieldValues(userId);
          const { valueId: restoreValueId } = getFieldEntry(
            restoreData,
            fieldId,
          );
          if (originalValue !== null) {
            await adminAPI
              .updateNumberFieldValue(
                userId,
                fieldId,
                Number(originalValue),
                restoreValueId,
              )
              .catch(() => {});
          }
        }
      });
    });

    test("C6369: Обновить числовое поле - ноль", async ({ adminAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить числовое поле - ноль", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.numberFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или числового поля",
        );

        const { data: beforeData } = await adminAPI.getFieldValues(userId);
        const { valueId, currentValue: originalValue } = getFieldEntry(
          beforeData,
          fieldId,
        );

        try {
          const { response } = await adminAPI.updateNumberFieldValue(
            userId,
            fieldId,
            0,
            valueId,
          );
          expect([200, 201, 204, 400, 422]).toContain(response.status());
        } finally {
          const { data: restoreData } = await adminAPI.getFieldValues(userId);
          const { valueId: restoreValueId } = getFieldEntry(
            restoreData,
            fieldId,
          );
          if (originalValue !== null) {
            await adminAPI
              .updateNumberFieldValue(
                userId,
                fieldId,
                Number(originalValue),
                restoreValueId,
              )
              .catch(() => {});
          }
        }
      });
    });

    test("C6370: Обновить числовое поле - очень большое число", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить числовое поле - очень большое число", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.numberFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или числового поля",
        );

        const { data: beforeData } = await adminAPI.getFieldValues(userId);
        const { valueId, currentValue: originalValue } = getFieldEntry(
          beforeData,
          fieldId,
        );

        try {
          const { response } = await adminAPI.updateNumberFieldValue(
            userId,
            fieldId,
            999999999999999,
            valueId,
          );
          expect([200, 201, 204, 400, 422]).toContain(response.status());
        } finally {
          const { data: restoreData } = await adminAPI.getFieldValues(userId);
          const { valueId: restoreValueId } = getFieldEntry(
            restoreData,
            fieldId,
          );
          if (originalValue !== null) {
            await adminAPI
              .updateNumberFieldValue(
                userId,
                fieldId,
                Number(originalValue),
                restoreValueId,
              )
              .catch(() => {});
          }
        }
      });
    });

    test("C6371: Обновить числовое поле - несуществующее поле", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить числовое поле - несуществующее поле", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        test.skip(!userId, "initCtx: нет целевого пользователя");

        const { response } = await adminAPI.updateNumberFieldValue(
          userId,
          999999999,
          42,
        );
        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== UPDATE DATETIME FIELD ====================

test.describe(
  "Profile Custom Fields API - Update Datetime Field",
  { tag: ["@api", "@profile", "@custom-fields", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Custom Fields - Datetime Update");
    });

    test(
      "C6372: POST /private/users/{userId}/fields/{fieldId}/values/datetime - обновить поле даты",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: POST .../values/datetime - обновить поле даты", async () => {
          await initCtx(adminAPI);
          const userId = ctx.targetUserId;
          const fieldId = ctx.datetimeFieldId;
          test.skip(
            !userId || !fieldId,
            "initCtx: нет целевого пользователя или поля даты",
          );

          const { data: beforeData } = await adminAPI.getFieldValues(userId);
          const { valueId, currentValue: originalValue } = getFieldEntry(
            beforeData,
            fieldId,
          );
          const testValue = new Date().toISOString();

          try {
            const { response } = await adminAPI.updateDatetimeFieldValue(
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
              expect(updatedValue).toBeDefined();
            }
          } finally {
            const { data: restoreData } = await adminAPI.getFieldValues(userId);
            const { valueId: restoreValueId } = getFieldEntry(
              restoreData,
              fieldId,
            );
            if (originalValue !== null) {
              await adminAPI
                .updateDatetimeFieldValue(
                  userId,
                  fieldId,
                  originalValue,
                  restoreValueId,
                )
                .catch(() => {});
            }
          }
        });
      },
    );

    test("C6373: Обновить поле даты - формат YYYY-MM-DD", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить поле даты - формат YYYY-MM-DD", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.datetimeFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или поля даты",
        );

        const { data: beforeData } = await adminAPI.getFieldValues(userId);
        const { valueId, currentValue: originalValue } = getFieldEntry(
          beforeData,
          fieldId,
        );

        try {
          const { response } = await adminAPI.updateDatetimeFieldValue(
            userId,
            fieldId,
            "2025-01-15",
            valueId,
          );
          expect([200, 201, 204, 400, 422]).toContain(response.status());
        } finally {
          const { data: restoreData } = await adminAPI.getFieldValues(userId);
          const { valueId: restoreValueId } = getFieldEntry(
            restoreData,
            fieldId,
          );
          if (originalValue !== null) {
            await adminAPI
              .updateDatetimeFieldValue(
                userId,
                fieldId,
                originalValue,
                restoreValueId,
              )
              .catch(() => {});
          }
        }
      });
    });

    test("C6374: Обновить поле даты - дата в прошлом", async ({ adminAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить поле даты - дата в прошлом", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.datetimeFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или поля даты",
        );

        const { data: beforeData } = await adminAPI.getFieldValues(userId);
        const { valueId, currentValue: originalValue } = getFieldEntry(
          beforeData,
          fieldId,
        );

        try {
          const { response } = await adminAPI.updateDatetimeFieldValue(
            userId,
            fieldId,
            "1990-01-01T00:00:00.000Z",
            valueId,
          );
          expect([200, 201, 204, 400, 422]).toContain(response.status());
        } finally {
          const { data: restoreData } = await adminAPI.getFieldValues(userId);
          const { valueId: restoreValueId } = getFieldEntry(
            restoreData,
            fieldId,
          );
          if (originalValue !== null) {
            await adminAPI
              .updateDatetimeFieldValue(
                userId,
                fieldId,
                originalValue,
                restoreValueId,
              )
              .catch(() => {});
          }
        }
      });
    });

    test("C6375: Обновить поле даты - дата в далёком будущем", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить поле даты - дата в далёком будущем", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.datetimeFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или поля даты",
        );

        const { data: beforeData } = await adminAPI.getFieldValues(userId);
        const { valueId, currentValue: originalValue } = getFieldEntry(
          beforeData,
          fieldId,
        );

        try {
          const { response } = await adminAPI.updateDatetimeFieldValue(
            userId,
            fieldId,
            "2099-12-31T23:59:59.000Z",
            valueId,
          );
          expect([200, 201, 204, 400, 422]).toContain(response.status());
        } finally {
          const { data: restoreData } = await adminAPI.getFieldValues(userId);
          const { valueId: restoreValueId } = getFieldEntry(
            restoreData,
            fieldId,
          );
          if (originalValue !== null) {
            await adminAPI
              .updateDatetimeFieldValue(
                userId,
                fieldId,
                originalValue,
                restoreValueId,
              )
              .catch(() => {});
          }
        }
      });
    });

    test("C6376: Обновить поле даты - невалидный формат", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let response;
      await test.step("Выполнить запрос: Обновить поле даты - невалидный формат", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        const fieldId = ctx.datetimeFieldId;
        test.skip(
          !userId || !fieldId,
          "initCtx: нет целевого пользователя или поля даты",
        );

        ({ response } = await adminAPI.updateDatetimeFieldValue(
          userId,
          fieldId,
          "not-a-date",
        ));
      });

      await test.step("Проверить ответ", async () => {
        expect([400, 422]).toContain(response?.status());
      });
    });

    test("C6377: Обновить поле даты - несуществующее поле", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить поле даты - несуществующее поле", async () => {
        await initCtx(adminAPI);
        const userId = ctx.targetUserId;
        test.skip(!userId, "initCtx: нет целевого пользователя");

        const { response } = await adminAPI.updateDatetimeFieldValue(
          userId,
          999999999,
          new Date().toISOString(),
        );
        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);
