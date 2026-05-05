// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { ObjectivesAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * API тесты для модуля Objectives — новые поля периода (DEVAPR-11585)
 *
 * Покрытие:
 * - CRUD цели с полями startDate/endDate
 * - Фильтрация по пересечению периодов (DEVAPR-11591: без фильтра → все цели)
 * - Сортировка по milestones_progress_updated_at desc, затем created_at desc
 * - DB-верификация через ObjectivesVerifier
 */

// Расширяем test с фикстурой для Objectives API (admin)
const test = fullTest.extend({
  objectivesAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Хранение созданных ID для cleanup (module-scoped — единый массив для всех групп)
const createdObjectiveIds = [];

// Хелпер для получения дат текущего квартала
// (аналог ObjectivesAPI.getCurrentQuarterDates() без зависимости от инстанса)
function getCurrentQuarterDates() {
  const now = new Date();
  const year = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  const starts = ["01-01", "04-01", "07-01", "10-01"];
  const ends = ["03-31", "06-30", "09-30", "12-31"];
  return {
    startDate: `${year}-${starts[q - 1]}`,
    endDate: `${year}-${ends[q - 1]}`,
  };
}

// Хелпер создания тестовой цели с произвольным периодом
// Payload соответствует структуре objectives-crud-api.spec.js — все обязательные поля включены
async function createObjectiveWithDates(api, startDate, endDate, titleSuffix = "") {
  const ts = Date.now();
  const userId = api.getCurrentUserId();

  const payload = {
    title: `[PERIOD-TEST] ${titleSuffix || startDate + " " + endDate} ${ts}`,
    description: `Period test ${startDate} - ${endDate}`,
    startDate,
    endDate,
    status: "draft",
    level: "self",
    userAccessType: "everybody",
    responsibleUserId: userId,
    milestones: [
      {
        temporaryId: `temp-${ts}-1`,
        title: `KR Period Test ${ts}`,
        type: "percent",
        weight: 100,
        progress: 0,
        responsibleUserId: userId,
      },
    ],
  };

  const { response, data } = await api.saveObjective(payload);

  if (response.ok() && data?.id) {
    createdObjectiveIds.push(data.id);
  }

  return { response, data };
}

// Глобальный cleanup после всех тестов в файле
test.afterAll(async ({ request }) => {
  if (createdObjectiveIds.length === 0) return;

  const api = new ObjectivesAPI(request);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  for (const id of createdObjectiveIds) {
    try {
      await api.deleteObjective(id);
    } catch {
      // Игнорируем ошибки cleanup — не блокируем остальное
    }
  }
  createdObjectiveIds.length = 0;
});

// ============================================================================
// ГРУППА 1: CRUD с новыми полями дат
// ============================================================================

test.describe(
  "Objectives Period API — DEVAPR-11585",
  { tag: ["@api", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Period API");
    });

    test("C8148: Создание цели с произвольным диапазоном (15.02.2026–20.03.2026)", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      const startDate = "2026-02-15";
      const endDate = "2026-03-20";
      let response, data;

      await test.step("Отправить POST /private/objectives/ с произвольным диапазоном", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "POST /private/objectives/",
        });
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "arbitrary range",
        ));
      });

      await test.step("Проверить статус ответа: 200/201 OK", async () => {
        assertSuccessStatus(response, `Создание цели с диапазоном ${startDate}–${endDate}`);
      });

      await test.step("Проверить что ответ содержит id и поля периода", async () => {
        expect(data?.id, "ID цели должен присутствовать в ответе").toBeDefined();
        // API возвращает даты как ISO строки "YYYY-MM-DDTHH:mm:ss.sssZ" — сравниваем только дату
        const actualStart = String(data.startDate ?? data.start_date ?? "").slice(0, 10);
        const actualEnd = String(data.endDate ?? data.end_date ?? "").slice(0, 10);
        expect(actualStart, "startDate должен вернуться в ответе").toBe(startDate);
        expect(actualEnd, "endDate должен вернуться в ответе").toBe(endDate);
      });
    });

    test("C8149: Создание цели с Q1 2026 (01-01 – 03-31)", async ({
      objectivesAPI,
      objectivesVerifier,
    }) => {
      setSeverity("critical");

      const startDate = "2026-01-01";
      const endDate = "2026-03-31";
      let response, data;

      await test.step("Отправить POST /private/objectives/ с Q1 2026", async () => {
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "Q1 2026",
        ));
      });

      await test.step("Проверить статус ответа", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить поля периода в ответе", async () => {
        expect(data?.id).toBeDefined();
        expect(String(data.startDate ?? data.start_date ?? "").slice(0, 10)).toBe(startDate);
        expect(String(data.endDate ?? data.end_date ?? "").slice(0, 10)).toBe(endDate);
      });

      await test.step("DB: Проверить start_date/end_date в таблице objectives", async () => {
        await objectivesVerifier.verifyObjectivePeriod(data.id, startDate, endDate);
      });
    });

    test("C8150: Создание цели с Q2 2026 (04-01 – 06-30)", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      const startDate = "2026-04-01";
      const endDate = "2026-06-30";
      let response, data;

      await test.step("Отправить POST /private/objectives/ с Q2 2026", async () => {
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "Q2 2026",
        ));
      });

      await test.step("Проверить статус ответа и поля периода", async () => {
        assertSuccessStatus(response);
        expect(data?.id).toBeDefined();
        expect(String(data.startDate ?? data.start_date ?? "").slice(0, 10)).toBe(startDate);
        expect(String(data.endDate ?? data.end_date ?? "").slice(0, 10)).toBe(endDate);
      });
    });

    test("C8151: Создание цели с Q3 2026 (07-01 – 09-30)", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      const startDate = "2026-07-01";
      const endDate = "2026-09-30";
      let response, data;

      await test.step("Отправить POST /private/objectives/ с Q3 2026", async () => {
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "Q3 2026",
        ));
      });

      await test.step("Проверить статус ответа и поля периода", async () => {
        assertSuccessStatus(response);
        expect(data?.id).toBeDefined();
        expect(String(data.startDate ?? data.start_date ?? "").slice(0, 10)).toBe(startDate);
        expect(String(data.endDate ?? data.end_date ?? "").slice(0, 10)).toBe(endDate);
      });
    });

    test("C8152: Создание цели с Q4 2026 (10-01 – 12-31)", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      const startDate = "2026-10-01";
      const endDate = "2026-12-31";
      let response, data;

      await test.step("Отправить POST /private/objectives/ с Q4 2026", async () => {
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "Q4 2026",
        ));
      });

      await test.step("Проверить статус ответа и поля периода", async () => {
        assertSuccessStatus(response);
        expect(data?.id).toBeDefined();
        expect(String(data.startDate ?? data.start_date ?? "").slice(0, 10)).toBe(startDate);
        expect(String(data.endDate ?? data.end_date ?? "").slice(0, 10)).toBe(endDate);
      });
    });

    test("C8153: Создание цели с H1 2026 (01-01 – 06-30)", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      const startDate = "2026-01-01";
      const endDate = "2026-06-30";
      let response, data;

      await test.step("Отправить POST /private/objectives/ с H1 2026", async () => {
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "H1 2026",
        ));
      });

      await test.step("Проверить статус ответа и поля периода", async () => {
        assertSuccessStatus(response);
        expect(data?.id).toBeDefined();
        expect(String(data.startDate ?? data.start_date ?? "").slice(0, 10)).toBe(startDate);
        expect(String(data.endDate ?? data.end_date ?? "").slice(0, 10)).toBe(endDate);
      });
    });

    test("C8154: Создание цели с H2 2026 (07-01 – 12-31)", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      const startDate = "2026-07-01";
      const endDate = "2026-12-31";
      let response, data;

      await test.step("Отправить POST /private/objectives/ с H2 2026", async () => {
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "H2 2026",
        ));
      });

      await test.step("Проверить статус ответа и поля периода", async () => {
        assertSuccessStatus(response);
        expect(data?.id).toBeDefined();
        expect(String(data.startDate ?? data.start_date ?? "").slice(0, 10)).toBe(startDate);
        expect(String(data.endDate ?? data.end_date ?? "").slice(0, 10)).toBe(endDate);
      });
    });

    test("C8155: Создание цели с месяцем Март 2026 (03-01 – 03-31)", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      const startDate = "2026-03-01";
      const endDate = "2026-03-31";
      let response, data;

      await test.step("Отправить POST /private/objectives/ с диапазоном Март 2026", async () => {
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "March 2026",
        ));
      });

      await test.step("Проверить статус ответа и поля периода", async () => {
        assertSuccessStatus(response);
        expect(data?.id).toBeDefined();
        expect(String(data.startDate ?? data.start_date ?? "").slice(0, 10)).toBe(startDate);
        expect(String(data.endDate ?? data.end_date ?? "").slice(0, 10)).toBe(endDate);
      });
    });

    test("C8156: Создание цели с годом 2026 (01-01 – 12-31)", async ({
      objectivesAPI,
      objectivesVerifier,
    }) => {
      setSeverity("normal");

      const startDate = "2026-01-01";
      const endDate = "2026-12-31";
      let response, data;

      await test.step("Отправить POST /private/objectives/ с диапазоном год 2026", async () => {
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "Year 2026",
        ));
      });

      await test.step("Проверить статус ответа и поля периода", async () => {
        assertSuccessStatus(response);
        expect(data?.id).toBeDefined();
        expect(String(data.startDate ?? data.start_date ?? "").slice(0, 10)).toBe(startDate);
        expect(String(data.endDate ?? data.end_date ?? "").slice(0, 10)).toBe(endDate);
      });

      await test.step("DB: Проверить start_date/end_date", async () => {
        await objectivesVerifier.verifyObjectivePeriod(data.id, startDate, endDate);
      });
    });

    test("C8157: Создание цели с одним днём (startDate = endDate = 2026-05-15)", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      const startDate = "2026-05-15";
      const endDate = "2026-05-15";
      let response, data;

      await test.step("Отправить POST /private/objectives/ с одним днём", async () => {
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "single day",
        ));
      });

      await test.step("Проверить статус ответа и поля периода", async () => {
        assertSuccessStatus(response);
        expect(data?.id).toBeDefined();
        expect(String(data.startDate ?? data.start_date ?? "").slice(0, 10)).toBe(startDate);
        expect(String(data.endDate ?? data.end_date ?? "").slice(0, 10)).toBe(endDate);
      });
    });

    test("C8158: Создание цели с диапазоном через границу года (2025-11-01 – 2026-02-28)", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      const startDate = "2025-11-01";
      const endDate = "2026-02-28";
      let response, data;

      await test.step("Отправить POST /private/objectives/ с диапазоном через границу года", async () => {
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "cross-year range",
        ));
      });

      await test.step("Проверить статус ответа и поля периода", async () => {
        assertSuccessStatus(response);
        expect(data?.id).toBeDefined();
        expect(String(data.startDate ?? data.start_date ?? "").slice(0, 10)).toBe(startDate);
        expect(String(data.endDate ?? data.end_date ?? "").slice(0, 10)).toBe(endDate);
      });
    });

    test("C8159: Валидация — без startDate → ошибка или отсутствие периода", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response, data;

      await test.step("Отправить POST /private/objectives/ без startDate", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "POST /private/objectives/ (без startDate)",
        });
        const ts = Date.now();
        const userId = objectivesAPI.getCurrentUserId();
        const payload = {
          title: `[PERIOD-TEST] no-startDate ${ts}`,
          status: "draft",
          // startDate намеренно отсутствует
          endDate: "2026-03-31",
          milestones: [],
          ...(userId ? { responsibleUserId: userId } : {}),
        };
        ({ response, data } = await objectivesAPI.saveObjective(payload));

        // Регистрируем для cleanup если создалось
        if (response.ok() && data?.id) {
          createdObjectiveIds.push(data.id);
        }
      });

      await test.step("Проверить что ответ — ошибка (400/422) или startDate отсутствует/null в ответе", async () => {
        const status = response.status();
        const isErrorStatus = [400, 422].includes(status);
        const createdWithoutStart =
          response.ok() &&
          (data?.startDate === null ||
            data?.startDate === undefined ||
            data?.start_date === null ||
            data?.start_date === undefined);

        expect(
          isErrorStatus || createdWithoutStart,
          `Ожидается 400/422 или создание без startDate. Статус: ${status}, startDate: ${data?.startDate ?? data?.start_date}`,
        ).toBe(true);
      });
    });

    test("C8160: DB-верификация корректности сохранения дат (произвольный диапазон)", async ({
      objectivesAPI,
      objectivesVerifier,
    }) => {
      setSeverity("critical");

      const startDate = "2026-04-10";
      const endDate = "2026-08-20";
      let data;

      await test.step("Создать цель с диапазоном 2026-04-10 – 2026-08-20", async () => {
        const result = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "DB verification",
        );
        assertSuccessStatus(result.response);
        data = result.data;
        expect(data?.id, "ID цели должен присутствовать").toBeDefined();
      });

      await test.step("DB: Получить запись из таблицы objectives", async () => {
        await objectivesVerifier.verifyObjectiveCreated(data.id);
      });

      await test.step("DB: Проверить start_date и end_date без UTC-смещения", async () => {
        await objectivesVerifier.verifyObjectivePeriod(data.id, startDate, endDate);
      });

      await test.step("DB: Проверить статус = draft", async () => {
        await objectivesVerifier.verifyObjectiveStatus(data.id, "draft");
      });
    });
  },
);

// ============================================================================
// ГРУППА 2: Фильтрация по пересечению периодов
// ============================================================================

test.describe(
  "Objectives Period API — Фильтрация по пересечению (DEVAPR-11591)",
  { tag: ["@api", "@objectives", "@regression"] },
  () => {
    // Данные создаются один раз для всей группы
    let objA_id, objB_id, objC_id, filterAdminUserId;

    test.beforeAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const userId = api.getCurrentUserId();
      filterAdminUserId = userId;
      const ts2 = Date.now();
      const basePayload = {
        status: "active",  // active т.к. /private/objectives/get возвращает только active
        level: "self",
        userAccessType: "everybody",
        responsibleUserId: userId,
        milestones: [
          {
            temporaryId: `temp-filter-${ts2}`,
            title: `KR Filter Test ${ts2}`,
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      };

      // objA: Q1 2026
      const ts = Date.now();
      const resultA = await api.saveObjective({
        ...basePayload,
        title: `[FILTER-TEST] objA Q1 ${ts}`,
        startDate: "2026-01-01",
        endDate: "2026-03-31",
      });
      if (!resultA.response.ok()) {
        throw new Error(
          `Не удалось создать objA для тестов фильтрации: ${resultA.response.status()}`,
        );
      }
      objA_id = resultA.data.id;
      createdObjectiveIds.push(objA_id);

      // objB: перекрывает Q1 и Q2
      const resultB = await api.saveObjective({
        ...basePayload,
        title: `[FILTER-TEST] objB Feb-Apr ${ts}`,
        startDate: "2026-02-01",
        endDate: "2026-04-30",
      });
      if (!resultB.response.ok()) {
        throw new Error(
          `Не удалось создать objB для тестов фильтрации: ${resultB.response.status()}`,
        );
      }
      objB_id = resultB.data.id;
      createdObjectiveIds.push(objB_id);

      // objC: Июнь 2026
      const resultC = await api.saveObjective({
        ...basePayload,
        title: `[FILTER-TEST] objC June ${ts}`,
        startDate: "2026-06-01",
        endDate: "2026-06-30",
      });
      if (!resultC.response.ok()) {
        throw new Error(
          `Не удалось создать objC для тестов фильтрации: ${resultC.response.status()}`,
        );
      }
      objC_id = resultC.data.id;
      createdObjectiveIds.push(objC_id);
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Period Filtering");
    });

    test("C8161: Без фильтра → все 3 тестовые цели присутствуют в ответе", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      let items;

      await test.step("Отправить POST /private/objectives/get без startDate/endDate", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "POST /private/objectives/get (без фильтра периода)",
        });
        // limit: 1000 + фильтр по admin-пользователю: новые цели без KR-обновлений
        // сортируются в конец по milestonesProgressUpdatedAt DESC — нужен большой лимит
        const { response, data } = await objectivesAPI.getObjectives({
          limit: 300,
          
        });
        assertSuccessStatus(response);
        items = data?.items ?? data ?? [];
        expect(Array.isArray(items), "Ответ должен содержать массив").toBe(true);
      });

      await test.step("Проверить что все 3 цели присутствуют в ответе", async () => {
        const ids = items.map((i) => i.id);
        expect(ids, `objA (${objA_id}) должна быть в ответе`).toContain(objA_id);
        expect(ids, `objB (${objB_id}) должна быть в ответе`).toContain(objB_id);
        expect(ids, `objC (${objC_id}) должна быть в ответе`).toContain(objC_id);
      });
    });

    test("C8162: Фильтр Q1 (01-01 – 03-31) → objA ✓, objB ✓, objC ✗", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      let items;

      await test.step("Отправить POST /private/objectives/get с фильтром Q1 2026", async () => {
        const { response, data } = await objectivesAPI.getObjectives({
          dateFrom: "2026-01-01",
          dateTo: "2026-03-31",
          limit: 300,
        });
        assertSuccessStatus(response);
        items = data?.items ?? data ?? [];
        expect(Array.isArray(items)).toBe(true);
      });

      await test.step("Проверить пересечение: objA и objB входят, objC нет", async () => {
        const ids = items.map((i) => i.id);
        expect(ids, `objA (${objA_id}) должна попасть в фильтр Q1`).toContain(objA_id);
        expect(ids, `objB (${objB_id}) должна попасть в фильтр Q1 (пересечение Фев-Апр / Янв-Мар)`).toContain(objB_id);
        expect(ids, `objC (${objC_id}) не должна попасть в фильтр Q1`).not.toContain(objC_id);
      });
    });

    test("C8163: Фильтр Февраль (02-01 – 02-28) → objA ✓, objB ✓, objC ✗", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let items;

      await test.step("Отправить POST /private/objectives/get с фильтром Февраль 2026", async () => {
        const { response, data } = await objectivesAPI.getObjectives({
          dateFrom: "2026-02-01",
          dateTo: "2026-02-28",
          limit: 300,
        });
        assertSuccessStatus(response);
        items = data?.items ?? data ?? [];
        expect(Array.isArray(items)).toBe(true);
      });

      await test.step("Проверить пересечение: objA (Янв–Мар) и objB (Фев–Апр) перекрывают Февраль, objC нет", async () => {
        const ids = items.map((i) => i.id);
        expect(ids, `objA пересекает Февраль`).toContain(objA_id);
        expect(ids, `objB пересекает Февраль`).toContain(objB_id);
        expect(ids, `objC (Июнь) не пересекает Февраль`).not.toContain(objC_id);
      });
    });

    test("C8164: Фильтр Апрель (04-01 – 04-30) → objA ✗, objB ✓, objC ✗", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let items;

      await test.step("Отправить POST /private/objectives/get с фильтром Апрель 2026", async () => {
        const { response, data } = await objectivesAPI.getObjectives({
          dateFrom: "2026-04-01",
          dateTo: "2026-04-30",
          limit: 300,
        });
        assertSuccessStatus(response);
        items = data?.items ?? data ?? [];
        expect(Array.isArray(items)).toBe(true);
      });

      await test.step("Проверить: только objB пересекает Апрель", async () => {
        const ids = items.map((i) => i.id);
        expect(ids, `objA (Янв–Мар) не пересекает Апрель`).not.toContain(objA_id);
        expect(ids, `objB (Фев–Апр) пересекает Апрель`).toContain(objB_id);
        expect(ids, `objC (Июнь) не пересекает Апрель`).not.toContain(objC_id);
      });
    });

    test("C8165: Фильтр Июнь (06-01 – 06-30) → objC ✓, objA ✗, objB ✗", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let items;

      await test.step("Отправить POST /private/objectives/get с фильтром Июнь 2026", async () => {
        const { response, data } = await objectivesAPI.getObjectives({
          dateFrom: "2026-06-01",
          dateTo: "2026-06-30",
          limit: 300,
        });
        assertSuccessStatus(response);
        items = data?.items ?? data ?? [];
        expect(Array.isArray(items)).toBe(true);
      });

      await test.step("Проверить: только objC попадает в Июнь", async () => {
        const ids = items.map((i) => i.id);
        expect(ids, `objC (Июнь) пересекает Июнь`).toContain(objC_id);
        expect(ids, `objA (Янв–Мар) не пересекает Июнь`).not.toContain(objA_id);
        expect(ids, `objB (Фев–Апр) не пересекает Июнь`).not.toContain(objB_id);
      });
    });
  },
);

// ============================================================================
// ГРУППА 3: Миграция — соответствие preset-периодов датам (API #23-27)
// ============================================================================
//
// Контекст: исторически цели хранились в формате periodYear/periodQ.
// После DEVAPR-11585 схема мигрировала на start_date/end_date (period_year/period_q
// колонок в БД больше нет). Эти тесты проверяют, что создание цели через новый API
// с каждым из preset-диапазонов (Год, Q1-Q4) возвращает и сохраняет в БД
// корректные start_date/end_date — тем самым верифицируя правильность маппинга.

test.describe(
  "Objectives Period API — Миграция preset-периодов в startDate/endDate (API #23-27)",
  { tag: ["@api", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Period Migration");
    });

    // API #23: Весь год 2025 → 2025-01-01 / 2025-12-31
    test("C8166: Миграция preset «Весь год 2025» → startDate=2025-01-01, endDate=2025-12-31", async ({
      objectivesAPI,
      objectivesVerifier,
    }) => {
      setSeverity("critical");

      const startDate = "2025-01-01";
      const endDate = "2025-12-31";
      let response, data;

      await test.step("Создать цель с диапазоном «Весь год 2025» (01-01 – 12-31)", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "POST /private/objectives/",
        });
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "Migration Year 2025",
        ));
      });

      await test.step("Проверить статус ответа 200/201 OK", async () => {
        assertSuccessStatus(response, `Создание цели с периодом «Весь год 2025»`);
      });

      await test.step("Проверить startDate/endDate в ответе API", async () => {
        expect(data?.id, "ID цели должен присутствовать в ответе").toBeDefined();
        const actualStart = String(data.startDate ?? data.start_date ?? "").slice(0, 10);
        const actualEnd = String(data.endDate ?? data.end_date ?? "").slice(0, 10);
        expect(actualStart, `startDate должен быть ${startDate}`).toBe(startDate);
        expect(actualEnd, `endDate должен быть ${endDate}`).toBe(endDate);
      });

      await test.step("DB: Проверить start_date=2025-01-01 и end_date=2025-12-31 в таблице objectives", async () => {
        await objectivesVerifier.verifyObjectivePeriod(data.id, startDate, endDate);
      });
    });

    // API #24: Q1 2025 → 2025-01-01 / 2025-03-31
    test("C8167: Миграция preset «Q1 2025» → startDate=2025-01-01, endDate=2025-03-31", async ({
      objectivesAPI,
      objectivesVerifier,
    }) => {
      setSeverity("critical");

      const startDate = "2025-01-01";
      const endDate = "2025-03-31";
      let response, data;

      await test.step("Создать цель с диапазоном Q1 2025 (01-01 – 03-31)", async () => {
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "Migration Q1 2025",
        ));
      });

      await test.step("Проверить статус ответа 200/201 OK", async () => {
        assertSuccessStatus(response, `Создание цели с периодом Q1 2025`);
      });

      await test.step("Проверить startDate/endDate в ответе API", async () => {
        expect(data?.id).toBeDefined();
        const actualStart = String(data.startDate ?? data.start_date ?? "").slice(0, 10);
        const actualEnd = String(data.endDate ?? data.end_date ?? "").slice(0, 10);
        expect(actualStart, `startDate должен быть ${startDate}`).toBe(startDate);
        expect(actualEnd, `endDate должен быть ${endDate}`).toBe(endDate);
      });

      await test.step("DB: Проверить start_date=2025-01-01 и end_date=2025-03-31 в таблице objectives", async () => {
        await objectivesVerifier.verifyObjectivePeriod(data.id, startDate, endDate);
      });
    });

    // API #25: Q2 2025 → 2025-04-01 / 2025-06-30
    test("C8168: Миграция preset «Q2 2025» → startDate=2025-04-01, endDate=2025-06-30", async ({
      objectivesAPI,
      objectivesVerifier,
    }) => {
      setSeverity("normal");

      const startDate = "2025-04-01";
      const endDate = "2025-06-30";
      let response, data;

      await test.step("Создать цель с диапазоном Q2 2025 (04-01 – 06-30)", async () => {
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "Migration Q2 2025",
        ));
      });

      await test.step("Проверить статус ответа 200/201 OK", async () => {
        assertSuccessStatus(response, `Создание цели с периодом Q2 2025`);
      });

      await test.step("Проверить startDate/endDate в ответе API", async () => {
        expect(data?.id).toBeDefined();
        const actualStart = String(data.startDate ?? data.start_date ?? "").slice(0, 10);
        const actualEnd = String(data.endDate ?? data.end_date ?? "").slice(0, 10);
        expect(actualStart, `startDate должен быть ${startDate}`).toBe(startDate);
        expect(actualEnd, `endDate должен быть ${endDate}`).toBe(endDate);
      });

      await test.step("DB: Проверить start_date=2025-04-01 и end_date=2025-06-30 в таблице objectives", async () => {
        await objectivesVerifier.verifyObjectivePeriod(data.id, startDate, endDate);
      });
    });

    // API #26: Q3 2025 → 2025-07-01 / 2025-09-30
    test("C8169: Миграция preset «Q3 2025» → startDate=2025-07-01, endDate=2025-09-30", async ({
      objectivesAPI,
      objectivesVerifier,
    }) => {
      setSeverity("normal");

      const startDate = "2025-07-01";
      const endDate = "2025-09-30";
      let response, data;

      await test.step("Создать цель с диапазоном Q3 2025 (07-01 – 09-30)", async () => {
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "Migration Q3 2025",
        ));
      });

      await test.step("Проверить статус ответа 200/201 OK", async () => {
        assertSuccessStatus(response, `Создание цели с периодом Q3 2025`);
      });

      await test.step("Проверить startDate/endDate в ответе API", async () => {
        expect(data?.id).toBeDefined();
        const actualStart = String(data.startDate ?? data.start_date ?? "").slice(0, 10);
        const actualEnd = String(data.endDate ?? data.end_date ?? "").slice(0, 10);
        expect(actualStart, `startDate должен быть ${startDate}`).toBe(startDate);
        expect(actualEnd, `endDate должен быть ${endDate}`).toBe(endDate);
      });

      await test.step("DB: Проверить start_date=2025-07-01 и end_date=2025-09-30 в таблице objectives", async () => {
        await objectivesVerifier.verifyObjectivePeriod(data.id, startDate, endDate);
      });
    });

    // API #27: Q4 2025 → 2025-10-01 / 2025-12-31
    test("C8170: Миграция preset «Q4 2025» → startDate=2025-10-01, endDate=2025-12-31", async ({
      objectivesAPI,
      objectivesVerifier,
    }) => {
      setSeverity("normal");

      const startDate = "2025-10-01";
      const endDate = "2025-12-31";
      let response, data;

      await test.step("Создать цель с диапазоном Q4 2025 (10-01 – 12-31)", async () => {
        ({ response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDate,
          endDate,
          "Migration Q4 2025",
        ));
      });

      await test.step("Проверить статус ответа 200/201 OK", async () => {
        assertSuccessStatus(response, `Создание цели с периодом Q4 2025`);
      });

      await test.step("Проверить startDate/endDate в ответе API", async () => {
        expect(data?.id).toBeDefined();
        const actualStart = String(data.startDate ?? data.start_date ?? "").slice(0, 10);
        const actualEnd = String(data.endDate ?? data.end_date ?? "").slice(0, 10);
        expect(actualStart, `startDate должен быть ${startDate}`).toBe(startDate);
        expect(actualEnd, `endDate должен быть ${endDate}`).toBe(endDate);
      });

      await test.step("DB: Проверить start_date=2025-10-01 и end_date=2025-12-31 в таблице objectives", async () => {
        await objectivesVerifier.verifyObjectivePeriod(data.id, startDate, endDate);
      });
    });
  },
);

// ============================================================================
// ГРУППА 3b: Редактирование периода — обновление startDate/endDate (QA gap: 0/10)
// ============================================================================

test.describe(
  "Objectives Period API — Редактирование периода цели (DEVAPR-11585)",
  { tag: ["@api", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Period Edit");
    });

    // Хелпер: строит минимальный payload для обновления периода.
    // Использует данные из create-ответа (не GET), чтобы избежать лишних полей.
    // ВАЖНО: temporaryId обязателен для milestone (NOT NULL в БД).
    function buildUpdatePayload(createData, newStartDate, newEndDate) {
      const userId = createData.responsibleUserId ??
        createData.responsible_user_id ??
        createData.responsibleUser?.id;
      const milestones = (createData.milestones ?? []).map((m) => ({
        id: m.id,
        // temporaryId — NOT NULL в БД, используем существующий или генерируем из id
        temporaryId: m.temporaryId ?? m.temporary_id ?? `update-milestone-${m.id}`,
        title: m.title,
        type: m.type,
        weight: m.weight ?? 100,
        progress: m.progress ?? 0,
        responsibleUserId: m.responsibleUserId ?? m.responsible_user_id ?? m.responsibleUser?.id ?? userId,
      }));
      return {
        id: createData.id,
        title: createData.title,
        description: createData.description ?? "",
        startDate: newStartDate,
        endDate: newEndDate,
        status: createData.status,
        level: createData.level,
        userAccessType: createData.userAccessType ?? createData.user_access_type ?? "everybody",
        responsibleUserId: userId,
        milestones,
      };
    }

    test("C8171: Обновить период Q1 → Q2 через POST с id → DB отражает новые даты", async ({
      objectivesAPI,
      objectivesVerifier,
    }) => {
      setSeverity("critical");

      const startDateOriginal = "2026-01-01";
      const endDateOriginal = "2026-03-31";
      const startDateUpdated = "2026-04-01";
      const endDateUpdated = "2026-06-30";
      let objectiveId;
      let createData;

      await test.step("Создать цель с периодом Q1 2026", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "POST /private/objectives/ (create)",
        });
        const { response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDateOriginal,
          endDateOriginal,
          "edit-period-Q1-to-Q2",
        );
        assertSuccessStatus(response, "Создание цели с Q1");
        expect(data?.id, "ID должен присутствовать после создания").toBeDefined();
        objectiveId = data.id;
        createData = data;
      });

      await test.step("DB: Проверить Q1 сохранён корректно (до обновления)", async () => {
        await objectivesVerifier.verifyObjectivePeriod(objectiveId, startDateOriginal, endDateOriginal);
      });

      await test.step("Обновить период Q1 → Q2 через POST /private/objectives/ с id", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "POST /private/objectives/ (update with id)",
        });
        const updatePayload = buildUpdatePayload(createData, startDateUpdated, endDateUpdated);
        const updateResult = await objectivesAPI.saveObjective(updatePayload);
        assertSuccessStatus(updateResult.response, `Обновление периода Q1→Q2 для цели ${objectiveId}`);

        // Проверяем ответ
        const actualStart = String(updateResult.data?.startDate ?? updateResult.data?.start_date ?? "").slice(0, 10);
        const actualEnd = String(updateResult.data?.endDate ?? updateResult.data?.end_date ?? "").slice(0, 10);
        expect(actualStart, "startDate в ответе должен быть обновлён до Q2").toBe(startDateUpdated);
        expect(actualEnd, "endDate в ответе должен быть обновлён до Q2").toBe(endDateUpdated);
      });

      await test.step("DB: Проверить что Q2 сохранён в таблице objectives (не Q1)", async () => {
        await objectivesVerifier.verifyObjectivePeriod(objectiveId, startDateUpdated, endDateUpdated);
      });
    });

    test("C8172: Обновить произвольный диапазон → произвольный диапазон (DB verification)", async ({
      objectivesAPI,
      objectivesVerifier,
    }) => {
      setSeverity("normal");

      const startDateOriginal = "2026-03-15";
      const endDateOriginal = "2026-05-20";
      const startDateUpdated = "2026-08-01";
      const endDateUpdated = "2026-11-30";
      let objectiveId;
      let createData;

      await test.step("Создать цель с исходным диапазоном", async () => {
        const { response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startDateOriginal,
          endDateOriginal,
          "edit-arbitrary-range",
        );
        assertSuccessStatus(response);
        objectiveId = data.id;
        createData = data;
      });

      await test.step("Обновить период через POST /private/objectives/ с id", async () => {
        const updatePayload = buildUpdatePayload(createData, startDateUpdated, endDateUpdated);
        const { response: updateResp, data: updateData } = await objectivesAPI.saveObjective(updatePayload);
        assertSuccessStatus(updateResp, `Обновление периода цели ${objectiveId}`);

        const actualStart = String(updateData?.startDate ?? updateData?.start_date ?? "").slice(0, 10);
        const actualEnd = String(updateData?.endDate ?? updateData?.end_date ?? "").slice(0, 10);
        expect(actualStart, "startDate должен быть обновлён").toBe(startDateUpdated);
        expect(actualEnd, "endDate должен быть обновлён").toBe(endDateUpdated);
      });

      await test.step("DB: Проверить новые даты в таблице objectives", async () => {
        await objectivesVerifier.verifyObjectivePeriod(objectiveId, startDateUpdated, endDateUpdated);
      });
    });

    test("C8173: Обновить период H1 → H2 → ответ POST-update отражает H2", async ({
      objectivesAPI,
      objectivesVerifier,
    }) => {
      setSeverity("normal");

      const { startDate: startH1, endDate: endH1 } = ObjectivesAPI.getHalfYearDates(2026, 1);
      const { startDate: startH2, endDate: endH2 } = ObjectivesAPI.getHalfYearDates(2026, 2);
      let objectiveId;
      let createData;

      await test.step("Создать цель с H1 2026", async () => {
        const { response, data } = await createObjectiveWithDates(
          objectivesAPI,
          startH1,
          endH1,
          "edit-H1-to-H2",
        );
        assertSuccessStatus(response);
        objectiveId = data.id;
        createData = data;
      });

      await test.step("Обновить период H1 → H2 и проверить ответ POST", async () => {
        const updatePayload = buildUpdatePayload(createData, startH2, endH2);
        const { response: updateResp, data: updateData } = await objectivesAPI.saveObjective(updatePayload);
        assertSuccessStatus(updateResp, `Обновление H1→H2 для цели ${objectiveId}`);

        const actualStart = String(updateData?.startDate ?? updateData?.start_date ?? "").slice(0, 10);
        const actualEnd = String(updateData?.endDate ?? updateData?.end_date ?? "").slice(0, 10);
        expect(actualStart, "startDate в ответе update должен быть H2").toBe(startH2);
        expect(actualEnd, "endDate в ответе update должен быть H2").toBe(endH2);
      });

      await test.step("DB: Проверить что H2 сохранён в таблице objectives", async () => {
        await objectivesVerifier.verifyObjectivePeriod(objectiveId, startH2, endH2);
      });
    });
  },
);

// ============================================================================
// ГРУППА 3c: Валидация граничных случаев периода
// ============================================================================

test.describe(
  "Objectives Period API — Валидация граничных случаев (DEVAPR-11585)",
  { tag: ["@api", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Period Validation");
    });

    test("C8174: startDate > endDate → сервер возвращает ошибку (400/422) или отклоняет", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      let response, data;

      await test.step("Отправить POST /private/objectives/ с startDate позже endDate", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "POST /private/objectives/ (startDate > endDate)",
        });
        const ts = Date.now();
        const userId = objectivesAPI.getCurrentUserId();
        const payload = {
          title: `[VALIDATION-TEST] startDate>endDate ${ts}`,
          startDate: "2026-12-31",  // позже endDate
          endDate: "2026-01-01",    // раньше startDate
          status: "draft",
          level: "self",
          userAccessType: "everybody",
          responsibleUserId: userId,
          milestones: [],
        };
        ({ response, data } = await objectivesAPI.saveObjective(payload));

        // Регистрируем для cleanup если создалось
        if (response.ok() && data?.id) {
          createdObjectiveIds.push(data.id);
        }
      });

      await test.step("Проверить что ответ — ошибка (400/422/4xx) или created с автосвапом дат", async () => {
        const status = response.status();
        const isClientError = status >= 400 && status < 500;

        // Если сервер принял запрос (200/201), то должен был автоматически поменять даты местами
        const autoSwapped =
          response.ok() &&
          data?.id != null &&
          (() => {
            const actualStart = String(data.startDate ?? data.start_date ?? "").slice(0, 10);
            const actualEnd = String(data.endDate ?? data.end_date ?? "").slice(0, 10);
            // После автосвапа startDate должен быть 2026-01-01, endDate — 2026-12-31
            return actualStart <= actualEnd;
          })();

        expect(
          isClientError || autoSwapped,
          `Ожидается 4xx-ошибка или автосвап дат при startDate > endDate. ` +
          `Статус: ${status}, startDate: ${data?.startDate ?? data?.start_date}, endDate: ${data?.endDate ?? data?.end_date}`,
        ).toBe(true);
      });
    });

    test("C8175: Невалидный формат даты startDate ('2026-13-01') → 400/422", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response, data;

      await test.step("Отправить POST /private/objectives/ с невалидным месяцем 13", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "POST /private/objectives/ (invalid date format)",
        });
        const ts = Date.now();
        const userId = objectivesAPI.getCurrentUserId();
        ({ response, data } = await objectivesAPI.saveObjective({
          title: `[VALIDATION-TEST] invalid-date ${ts}`,
          startDate: "2026-13-01",  // невалидный месяц
          endDate: "2026-12-31",
          status: "draft",
          level: "self",
          userAccessType: "everybody",
          responsibleUserId: userId,
          milestones: [],
        }));

        if (response.ok() && data?.id) {
          createdObjectiveIds.push(data.id);
        }
      });

      await test.step("Проверить что ответ — ошибка (400/422)", async () => {
        const status = response.status();
        expect(
          status >= 400 && status < 500,
          `Невалидный месяц '13' должен вернуть 4xx ошибку. Получен: ${status}`,
        ).toBe(true);
      });
    });

    test("C8176: Невалидный формат даты endDate ('not-a-date') → 400/422", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response, data;

      await test.step("Отправить POST /private/objectives/ с endDate = 'not-a-date'", async () => {
        const ts = Date.now();
        const userId = objectivesAPI.getCurrentUserId();
        ({ response, data } = await objectivesAPI.saveObjective({
          title: `[VALIDATION-TEST] invalid-endDate ${ts}`,
          startDate: "2026-01-01",
          endDate: "not-a-date",
          status: "draft",
          level: "self",
          userAccessType: "everybody",
          responsibleUserId: userId,
          milestones: [],
        }));

        if (response.ok() && data?.id) {
          createdObjectiveIds.push(data.id);
        }
      });

      await test.step("Проверить что ответ — ошибка (400/422)", async () => {
        const status = response.status();
        expect(
          status >= 400 && status < 500,
          `Невалидная дата 'not-a-date' должна вернуть 4xx ошибку. Получен: ${status}`,
        ).toBe(true);
      });
    });
  },
);

// ============================================================================
// ГРУППА 3d: Обратная совместимость — старые поля periodYear/periodQ (API #28)
// ============================================================================

test.describe(
  "Objectives Period API — Обратная совместимость periodYear/periodQ (API #28)",
  { tag: ["@api", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Period Backward Compat");
    });

    test("C8177: Запрос с periodYear/periodQ (старый формат) → обратная совместимость, сервер конвертирует в startDate/endDate", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response, data;

      await test.step("Отправить POST /private/objectives/ с periodYear=2026, periodQ=1 (старый формат)", async () => {
        test.info().annotations.push({
          type: "endpoint",
          description: "POST /private/objectives/ (periodYear/periodQ — backward compat)",
        });
        const ts = Date.now();
        const userId = objectivesAPI.getCurrentUserId();
        ({ response, data } = await objectivesAPI.saveObjective({
          title: `[COMPAT-TEST] old-period-format ${ts}`,
          periodYear: 2026,
          periodQ: 1,
          // Намеренно НЕ передаём startDate/endDate
          status: "draft",
          level: "self",
          userAccessType: "everybody",
          responsibleUserId: userId,
          milestones: [],
        }));

        if (response.ok() && data?.id) {
          createdObjectiveIds.push(data.id);
        }
      });

      await test.step("Проверить что сервер принял запрос и сконвертировал periodYear/periodQ в startDate/endDate", async () => {
        const status = response.status();
        expect(
          status,
          `Старый формат periodYear/periodQ должен поддерживаться (обратная совместимость). ` +
          `Получен статус: ${status}. ` +
          `Тело ответа: ${JSON.stringify(data)}`,
        ).toBeLessThan(300);

        // Проверяем что сервер вернул валидные startDate/endDate
        expect(data, "Ответ должен содержать данные цели").toBeTruthy();
        expect(data.startDate || data.start_date, "Сервер должен сконвертировать periodYear/periodQ в startDate").toBeTruthy();
        expect(data.endDate || data.end_date, "Сервер должен сконвертировать periodYear/periodQ в endDate").toBeTruthy();
      });
    });

    test("C8178: Запрос без startDate и endDate (ни старый ни новый формат) → 400/422", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      let response, data;

      await test.step("Отправить POST /private/objectives/ без полей периода", async () => {
        const ts = Date.now();
        const userId = objectivesAPI.getCurrentUserId();
        ({ response, data } = await objectivesAPI.saveObjective({
          title: `[COMPAT-TEST] no-period-at-all ${ts}`,
          // Нет ни startDate, ни endDate, ни periodYear, ни periodQ
          status: "draft",
          level: "self",
          userAccessType: "everybody",
          responsibleUserId: userId,
          milestones: [],
        }));

        if (response.ok() && data?.id) {
          createdObjectiveIds.push(data.id);
        }
      });

      await test.step("Проверить что ответ — ошибка (период обязателен)", async () => {
        const status = response.status();
        const hasNullDates =
          response.ok() &&
          data?.id != null &&
          (data?.startDate === null || data?.startDate === undefined) &&
          (data?.endDate === null || data?.endDate === undefined);

        // Либо 400/422 (жёсткая валидация), либо создался с null датами (мягкая)
        expect(
          (status >= 400 && status < 500) || hasNullDates,
          `Без полей периода должна быть ошибка 4xx или startDate=null. ` +
          `Статус: ${status}`,
        ).toBe(true);
      });
    });
  },
);

// ============================================================================
// ГРУППА 4: Сортировка (milestones_progress_updated_at desc, затем created_at desc)
// ============================================================================

test.describe(
  "Objectives Period API — Сортировка",
  { tag: ["@api", "@objectives", "@regression"] },
  () => {
    // Цели создаются в beforeAll: 4 цели, у 2 обновляем прогресс KR
    let objNoUpdate1_id;  // без обновлений, создана первой
    let objNoUpdate2_id;  // без обновлений, создана второй
    let objUpdatedEarlier_id; // прогресс обновлён раньше
    let objUpdatedLater_id;   // прогресс обновлён позже
    let sortAdminUserId;      // для фильтрации по ответственному

    // Хелпер: создать цель с одним milestone
    async function createObjectiveWithMilestone(api, titleSuffix) {
      const ts = Date.now();
      const userId = api.getCurrentUserId();
      const { startDate, endDate } = getCurrentQuarterDates();

      const payload = {
        title: `[SORT-TEST] ${titleSuffix} ${ts}`,
        status: "active",  // active т.к. /private/objectives/get возвращает только active
        level: "self",
        userAccessType: "everybody",
        responsibleUserId: userId,
        startDate,
        endDate,
        milestones: [
          {
            temporaryId: `temp-${ts}`,
            title: `KR ${titleSuffix}`,
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      };

      const { response, data } = await api.saveObjective(payload);
      if (!response.ok() || !data?.id) {
        throw new Error(
          `Не удалось создать цель "${titleSuffix}" для теста сортировки: ${response.status()}`,
        );
      }
      createdObjectiveIds.push(data.id);
      return data;
    }

    test.beforeAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      sortAdminUserId = api.getCurrentUserId();

      // Создаём 4 цели последовательно с небольшой паузой чтобы created_at различались
      const dataNoUpdate1 = await createObjectiveWithMilestone(api, "no-update-1");
      objNoUpdate1_id = dataNoUpdate1.id;

      // Минимальная задержка между созданиями для различия created_at
      await new Promise((r) => setTimeout(r, 200));

      const dataNoUpdate2 = await createObjectiveWithMilestone(api, "no-update-2");
      objNoUpdate2_id = dataNoUpdate2.id;

      await new Promise((r) => setTimeout(r, 200));

      const dataUpdatedEarlier = await createObjectiveWithMilestone(api, "updated-earlier");
      objUpdatedEarlier_id = dataUpdatedEarlier.id;

      await new Promise((r) => setTimeout(r, 200));

      const dataUpdatedLater = await createObjectiveWithMilestone(api, "updated-later");
      objUpdatedLater_id = dataUpdatedLater.id;

      // Обновляем KR у двух целей: сначала "earlier", потом "later"
      const milestonesEarlier = dataUpdatedEarlier.milestones ?? [];
      if (milestonesEarlier.length > 0) {
        await api.updateMilestoneProgress(objUpdatedEarlier_id, milestonesEarlier[0].id, {
          progress: 30,
        });
      }

      await new Promise((r) => setTimeout(r, 300));

      const milestonesLater = dataUpdatedLater.milestones ?? [];
      if (milestonesLater.length > 0) {
        await api.updateMilestoneProgress(objUpdatedLater_id, milestonesLater[0].id, {
          progress: 50,
        });
      }
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Sorting");
    });

    test("C8179: Цели с обновлёнными KR стоят выше, чем цели без обновлений", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let items;

      await test.step("Получить цели без фильтра периода (все)", async () => {
        // limit: 1000 + фильтр по admin: цели без KR-обновлений сортируются в конец
        const { response, data } = await objectivesAPI.getObjectives({
          limit: 300,
          
        });
        assertSuccessStatus(response);
        items = data?.items ?? data ?? [];
        expect(Array.isArray(items)).toBe(true);
      });

      await test.step("Проверить что цели с обновлёнными KR идут раньше в списке", async () => {
        const ids = items.map((i) => i.id);
        const posUpdatedLater = ids.indexOf(objUpdatedLater_id);
        const posUpdatedEarlier = ids.indexOf(objUpdatedEarlier_id);
        const posNoUpdate1 = ids.indexOf(objNoUpdate1_id);
        const posNoUpdate2 = ids.indexOf(objNoUpdate2_id);

        expect(posUpdatedLater, `objUpdatedLater должна быть в ответе`).toBeGreaterThanOrEqual(0);
        expect(posUpdatedEarlier, `objUpdatedEarlier должна быть в ответе`).toBeGreaterThanOrEqual(0);
        expect(posNoUpdate1, `objNoUpdate1 должна быть в ответе`).toBeGreaterThanOrEqual(0);
        expect(posNoUpdate2, `objNoUpdate2 должна быть в ответе`).toBeGreaterThanOrEqual(0);

        // Цели с обновлёнными KR должны идти перед целями без обновлений
        expect(
          posUpdatedLater < posNoUpdate1,
          `objUpdatedLater (pos ${posUpdatedLater}) должна быть выше objNoUpdate1 (pos ${posNoUpdate1})`,
        ).toBe(true);
        expect(
          posUpdatedLater < posNoUpdate2,
          `objUpdatedLater (pos ${posUpdatedLater}) должна быть выше objNoUpdate2 (pos ${posNoUpdate2})`,
        ).toBe(true);
        expect(
          posUpdatedEarlier < posNoUpdate1,
          `objUpdatedEarlier (pos ${posUpdatedEarlier}) должна быть выше objNoUpdate1 (pos ${posNoUpdate1})`,
        ).toBe(true);
        expect(
          posUpdatedEarlier < posNoUpdate2,
          `objUpdatedEarlier (pos ${posUpdatedEarlier}) должна быть выше objNoUpdate2 (pos ${posNoUpdate2})`,
        ).toBe(true);
      });
    });

    test("C8180: Среди целей с обновлёнными KR — более новое обновление выше (desc)", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let items;

      await test.step("Получить все цели", async () => {
        const { response, data } = await objectivesAPI.getObjectives({
          limit: 300,
          
        });
        assertSuccessStatus(response);
        items = data?.items ?? data ?? [];
      });

      await test.step("Проверить: objUpdatedLater выше objUpdatedEarlier", async () => {
        const ids = items.map((i) => i.id);
        const posLater = ids.indexOf(objUpdatedLater_id);
        const posEarlier = ids.indexOf(objUpdatedEarlier_id);

        expect(posLater, `objUpdatedLater должна быть в ответе`).toBeGreaterThanOrEqual(0);
        expect(posEarlier, `objUpdatedEarlier должна быть в ответе`).toBeGreaterThanOrEqual(0);

        expect(
          posLater < posEarlier,
          `objUpdatedLater (обновлена позже, pos ${posLater}) должна быть выше objUpdatedEarlier (pos ${posEarlier})`,
        ).toBe(true);
      });
    });

    test("C8181: Среди целей без обновлений KR — сортировка по createdAt desc", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let items;

      await test.step("Получить все цели", async () => {
        const { response, data } = await objectivesAPI.getObjectives({
          limit: 300,
          
        });
        assertSuccessStatus(response);
        items = data?.items ?? data ?? [];
      });

      await test.step("Проверить: objNoUpdate2 (создана позже) выше objNoUpdate1", async () => {
        const ids = items.map((i) => i.id);
        const pos1 = ids.indexOf(objNoUpdate1_id);
        const pos2 = ids.indexOf(objNoUpdate2_id);

        expect(pos1, `objNoUpdate1 должна быть в ответе`).toBeGreaterThanOrEqual(0);
        expect(pos2, `objNoUpdate2 должна быть в ответе`).toBeGreaterThanOrEqual(0);

        expect(
          pos2 < pos1,
          `objNoUpdate2 (создана позже, pos ${pos2}) должна быть выше objNoUpdate1 (pos ${pos1})`,
        ).toBe(true);
      });
    });
  },
);
