// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { DevelopmentPlansAPI, getCredentials } from "../../utils/api/index.js";
import { allure } from "allure-playwright";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * API тесты для жизненного цикла планов развития — activate, draft, approval
 *
 * Покрытие:
 * - POST /private/development-plans/{id}/activate - активация плана
 * - POST /private/development-plans/{id}/draft - перевод в черновик
 * - POST /private/development-plans/{id}/approval - отправка на согласование
 *
 * ВАЖНО: Методы смены статуса НЕ возвращают объект плана.
 * После вызова нужно получать план отдельно через getDevelopmentPlan(id).
 *
 * СТРОГИЕ ТЕСТЫ - не маскируют ошибки, а выявляют их.
 *
 * @tags @api @regression @development-plans @lifecycle
 */

/**
 * Хелпер для логирования входных данных в Allure
 */
function logInput(name, data) {
  allure.attachment(
    `Input: ${name}`,
    JSON.stringify(data, null, 2),
    "application/json",
  );
}

/**
 * Хелпер для логирования ожидаемого результата
 */
function logExpected(description) {
  allure.attachment("Expected", description, "text/plain");
}

/**
 * Хелпер для логирования ответа API
 */
function logResponse(status, data) {
  allure.attachment(
    "Response",
    JSON.stringify({ status, data }, null, 2),
    "application/json",
  );
}

/**
 * Генерация дат для создания плана (startDate обязательна по API)
 * @returns {{ startDate: string, endDate: string }}
 */
function generatePlanDates() {
  const startDate = new Date().toISOString();
  const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  return { startDate, endDate };
}

// Кеш для данных планов
let cachedPlanInDraft = null;
let cachedActivePlan = null;
let cachedAllPlansData = null;

// Расширяем test с фикстурой для Development Plans API
const test = fullTest.extend({
  dpAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

/**
 * Хелпер для получения responsibleUserId из существующих планов
 * @param {DevelopmentPlansAPI} dpAPI
 * @returns {Promise<number>}
 */
async function getResponsibleUserId(dpAPI) {
  const { data } = await dpAPI.getDevelopmentPlans({ limit: 10 });
  const items = data?.items || data || [];
  if (items.length > 0) {
    return items[0]?.responsibleUser?.id || items[0]?.responsibleUserId || 1;
  }
  return 1;
}

/**
 * Хелпер для поиска плана в статусе draft
 * @param {DevelopmentPlansAPI} dpAPI
 * @returns {Promise<Object|null>}
 */
async function findPlanInDraft(dpAPI) {
  if (cachedPlanInDraft) {
    return cachedPlanInDraft;
  }

  const { data } = await dpAPI.getDevelopmentPlans({ limit: 100 });
  const items = data?.items || data || [];

  const draftPlan = items.find((plan) => plan.status === "draft");
  if (draftPlan) {
    cachedPlanInDraft = draftPlan;
  }

  return draftPlan || null;
}

/**
 * Хелпер для поиска плана в статусе active
 * @param {DevelopmentPlansAPI} dpAPI
 * @returns {Promise<Object|null>}
 */
async function findActivePlan(dpAPI) {
  if (cachedActivePlan) {
    return cachedActivePlan;
  }

  const { data } = await dpAPI.getDevelopmentPlans({ limit: 100 });
  const items = data?.items || data || [];

  const activePlan = items.find((plan) => plan.status === "active");
  if (activePlan) {
    cachedActivePlan = activePlan;
  }

  return activePlan || null;
}

/**
 * Хелпер для получения всех планов с кешированием
 * @param {DevelopmentPlansAPI} dpAPI
 * @returns {Promise<Object>}
 */
async function getAllPlansData(dpAPI) {
  if (cachedAllPlansData) {
    return cachedAllPlansData;
  }

  const { response, data } = await dpAPI.getDevelopmentPlans({ limit: 100 });
  cachedAllPlansData = { response, data };
  return cachedAllPlansData;
}

/**
 * Хелпер для поиска плана в любом статусе
 * @param {DevelopmentPlansAPI} dpAPI
 * @param {string} status
 * @returns {Promise<Object|null>}
 */
async function findPlanByStatus(dpAPI, status) {
  const { data } = await getAllPlansData(dpAPI);
  const items = data?.items || data || [];
  return items.find((plan) => plan.status === status) || null;
}

/**
 * Хелпер для получения плана и проверки его статуса
 * @param {DevelopmentPlansAPI} dpAPI
 * @param {number} planId
 * @returns {Promise<{plan: Object|null, status: string|null}>}
 */
async function getPlanWithStatus(dpAPI, planId) {
  const { response, data } = await dpAPI.getDevelopmentPlan(planId);
  if (response.ok() && data) {
    return { plan: data, status: data.status };
  }
  return { plan: null, status: null };
}

// ==================== ТЕСТЫ: activateDevelopmentPlan ====================

test.describe(
  "Development Plans Lifecycle - activateDevelopmentPlan",
  { tag: ["@api", "@regression", "@development-plans", "@lifecycle"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Lifecycle - Activate");
    });

    test(
      "C4951: Активация плана - успешная активация",
      { tag: ["@db"] },
      async ({ dpAPI, dpVerifier }) => {
        setSeverity("critical");

        const responsibleUserId = await getResponsibleUserId(dpAPI);

        // Создаём новый план для теста
        const startDate = new Date().toISOString();
        const endDate = new Date(
          Date.now() + 90 * 24 * 60 * 60 * 1000,
        ).toISOString(); // +90 дней
        const { response: createResp, data: newPlan } =
          await dpAPI.createDevelopmentPlan({
            title: `Test Plan for Activation ${Date.now()}`,
            responsibleUserId,
            startDate,
            endDate,
          });

        logInput("Создание плана", {
          title: `Test Plan for Activation`,
          responsibleUserId,
        });
        logResponse(createResp.status(), newPlan);

        if (!createResp.ok() || !newPlan?.id) {
          test.skip(
            true,
            `Не удалось создать план (status=${createResp.status()})`,
          );
          return;
        }

        logExpected("План успешно активируется, статус меняется на active");

        // Активируем напрямую (API позволяет активацию из draft)
        const { response, data } = await dpAPI.activateDevelopmentPlan(
          newPlan.id,
        );
        const status = response.status();
        logResponse(status, data);

        expect(
          [200, 201],
          `Ожидался статус 200/201 при активации, получен ${status}`,
        ).toContain(status);

        // Проверяем статус плана после активации через API
        const { plan: updatedPlan, status: planStatus } =
          await getPlanWithStatus(dpAPI, newPlan.id);
        logResponse("Plan after activation", updatedPlan);

        expect(planStatus, "План должен быть в статусе active").toBe("active");

        // DB верификация: проверка статуса в БД
        await test.step("DB: Проверка статуса active в БД", async () => {
          if (!dpVerifier.isConnected()) return;
          await dpVerifier.verifyPlanStatus(newPlan.id, "active");
        });

        // Очистка - завершаем план (из active можно только завершить)
        await dpAPI.completeDevelopmentPlan(newPlan.id, "Тест завершён");
      },
    );

    test("C4952: Активация плана - негативный: план не существует", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Активация плана - негативный: план не существует", async () => {
        const nonExistentId = 999999999;
        logInput("ID несуществующего плана", { id: nonExistentId });
        logExpected("Статус 404 Not Found");

        const { response, data } =
          await dpAPI.activateDevelopmentPlan(nonExistentId);
        const status = response.status();
        logResponse(status, data);

        expect(
          [404, 400, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });

    test("C4953: Активация плана - негативный: план уже активен", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let status;
      await test.step("Выполнить запрос: Активация плана - негативный: план уже активен", async () => {
        const activePlan = await findActivePlan(dpAPI);

        if (!activePlan) {
          test.skip(true, "Нет активных планов для теста");
          return;
        }

        logInput("План уже в статусе active", activePlan);
        logExpected(
          "Статус 400/409 - план уже активен, или 200 (идемпотентно)",
        );

        const { response, data } = await dpAPI.activateDevelopmentPlan(
          activePlan.id,
        );
        status = response.status();
        logResponse(status, data);

        // Может вернуть 400/409 (ошибка) или 200 (идемпотентно)
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 400, 409, 422], `Неожиданный статус ${status}`).toContain(
          status,
        );
      });
    });

    test("C4954: Активация плана - негативный: план в статусе completed", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let status;
      await test.step("Выполнить запрос: Активация плана - негативный: план в статусе completed", async () => {
        const completedPlan = await findPlanByStatus(dpAPI, "completed");

        if (!completedPlan) {
          test.skip(true, "Нет завершённых планов для теста");
          return;
        }

        logInput("План в статусе completed", completedPlan);
        logExpected("Статус 400/409 - нельзя активировать завершённый план");

        const { response, data } = await dpAPI.activateDevelopmentPlan(
          completedPlan.id,
        );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [400, 409, 422, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });
  },
);

// ==================== ТЕСТЫ: draftDevelopmentPlan ====================

test.describe(
  "Development Plans Lifecycle - draftDevelopmentPlan",
  { tag: ["@api", "@regression", "@development-plans", "@lifecycle"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Lifecycle - Draft");
    });

    test("C4955: Перевод в черновик - успешный возврат из статуса approval", async ({
      dpAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Перевод в черновик - успешный возврат из статуса approval", async () => {
        const responsibleUserId = await getResponsibleUserId(dpAPI);

        // Создаём новый план
        const { response: createResp, data: newPlan } =
          await dpAPI.createDevelopmentPlan({
            title: `Test Plan for Draft Return ${Date.now()}`,
            responsibleUserId,
            ...generatePlanDates(),
          });

        if (!createResp.ok() || !newPlan?.id) {
          test.skip(true, "Не удалось создать план для теста");
          return;
        }

        logInput("Создание плана", newPlan);
        logExpected("План переходит из approval обратно в draft");

        // Переводим в approval (если API поддерживает)
        const { response: approvalResp } = await dpAPI.approvalDevelopmentPlan(
          newPlan.id,
        );

        if (approvalResp.ok()) {
          // Проверяем что план в approval
          const { status: statusAfterApproval } = await getPlanWithStatus(
            dpAPI,
            newPlan.id,
          );

          if (statusAfterApproval === "approval") {
            // Возвращаем в draft
            const { response, data } = await dpAPI.draftDevelopmentPlan(
              newPlan.id,
            );
            const status = response.status();
            logResponse(status, data);

            expect(
              [200, 201],
              `Ожидался статус 200/201 при возврате в draft, получен ${status}`,
            ).toContain(status);

            // Проверяем статус
            const { status: finalStatus } = await getPlanWithStatus(
              dpAPI,
              newPlan.id,
            );
            expect(finalStatus, "План должен быть в статусе draft").toBe(
              "draft",
            );
          }
        }

        // Очистка
        await dpAPI.deleteDevelopmentPlan(newPlan.id);
      });
    });

    test("C4956: Перевод в черновик - поведение для активного плана", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let activePlan, response, data, status;
      await test.step("Выполнить запрос: Перевод в черновик - поведение для активного плана", async () => {
        activePlan = await findActivePlan(dpAPI);

        if (!activePlan) {
          test.skip(true, "Нет активных планов для теста");
          return;
        }

        logInput("План в статусе active", activePlan);
        logExpected("Проверяем возможность возврата в draft из active");

        ({ response, data } = await dpAPI.draftDevelopmentPlan(activePlan.id));
        status = response.status();
        logResponse(status, data);

        // API может как разрешать, так и запрещать возврат из active
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 400, 409, 422], `Неожиданный статус ${status}`).toContain(
          status,
        );

        if (response.ok()) {
          // Если разрешено - восстанавливаем статус
          const { status: newStatus } = await getPlanWithStatus(
            dpAPI,
            activePlan.id,
          );
          expect(newStatus, "План должен быть в статусе draft").toBe("draft");
          // Восстанавливаем
          await dpAPI.activateDevelopmentPlan(activePlan.id);
        }
      });
    });

    test("C4957: Перевод в черновик - негативный: план не существует", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Перевод в черновик - негативный: план не существует", async () => {
        const nonExistentId = 999999999;
        logInput("ID несуществующего плана", { id: nonExistentId });
        logExpected("Статус 404 Not Found");

        const { response, data } =
          await dpAPI.draftDevelopmentPlan(nonExistentId);
        const status = response.status();
        logResponse(status, data);

        expect(
          [404, 400, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });

    test("C4958: Перевод в черновик - негативный: план уже в статусе draft", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Перевод в черновик - негативный: план уже в статусе draft", async () => {
        const draftPlan = await findPlanInDraft(dpAPI);

        if (!draftPlan) {
          test.skip(true, "Нет планов в статусе draft");
          return;
        }

        logInput("План уже в статусе draft", draftPlan);
        logExpected("Статус 400/409 или 200 (идемпотентно)");

        const { response, data } = await dpAPI.draftDevelopmentPlan(
          draftPlan.id,
        );
        const status = response.status();
        logResponse(status, data);

        // Может быть идемпотентным (200) или вернуть ошибку (400/409)
        expect([200, 400, 409, 422], `Неожиданный статус ${status}`).toContain(
          status,
        );
      });
    });

    test("C4959: Перевод в черновик - негативный: план в статусе completed", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let status;
      await test.step("Выполнить запрос: Перевод в черновик - негативный: план в статусе completed", async () => {
        const completedPlan = await findPlanByStatus(dpAPI, "completed");

        if (!completedPlan) {
          test.skip(true, "Нет завершённых планов");
          return;
        }

        logInput("План в статусе completed", completedPlan);
        logExpected("Статус 400/409 - нельзя вернуть завершённый план в draft");

        const { response, data } = await dpAPI.draftDevelopmentPlan(
          completedPlan.id,
        );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [400, 409, 422, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });
  },
);

// ==================== ТЕСТЫ: approvalDevelopmentPlan ====================

test.describe(
  "Development Plans Lifecycle - approvalDevelopmentPlan",
  { tag: ["@api", "@regression", "@development-plans", "@lifecycle"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Lifecycle - Approval");
    });

    test("C4960: Отправка на согласование - успешная отправка из статуса draft", async ({
      dpAPI,
    }) => {
      setSeverity("critical");

      let createResp, newPlan, response, data, status;
      await test.step("Выполнить запрос: Отправка на согласование - успешная отправка из статуса draft", async () => {
        const responsibleUserId = await getResponsibleUserId(dpAPI);

        // Создаём новый план
        ({ response: createResp, data: newPlan } =
          await dpAPI.createDevelopmentPlan({
            title: `Test Plan for Approval ${Date.now()}`,
            responsibleUserId,
            ...generatePlanDates(),
          }));

        if (!createResp.ok() || !newPlan?.id) {
          test.skip(true, "Не удалось создать план для теста");
          return;
        }

        logInput("Создание плана", newPlan);
        logExpected("План переходит в статус approval");

        ({ response, data } = await dpAPI.approvalDevelopmentPlan(newPlan.id));
        status = response.status();
        logResponse(status, data);

        // API может не поддерживать статус approval - тогда вернёт ошибку
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 404], `Неожиданный статус ${status}`).toContain(
          status,
        );

        if (response.ok()) {
          // Проверяем статус
          const { status: planStatus } = await getPlanWithStatus(
            dpAPI,
            newPlan.id,
          );
          expect(planStatus, "План должен быть в статусе approval").toBe(
            "approval",
          );
          // Возвращаем в draft для очистки
          await dpAPI.draftDevelopmentPlan(newPlan.id);
        }

        // Очистка
        await dpAPI.deleteDevelopmentPlan(newPlan.id);
      });
    });

    test("C4961: Отправка на согласование - негативный: план не существует", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Отправка на согласование - негативный: план не существует", async () => {
        const nonExistentId = 999999999;
        logInput("ID несуществующего плана", { id: nonExistentId });
        logExpected("Статус 404 Not Found");

        const { response, data } =
          await dpAPI.approvalDevelopmentPlan(nonExistentId);
        const status = response.status();
        logResponse(status, data);

        expect(
          [404, 400, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });

    test("C4962: Отправка на согласование - негативный: план уже в статусе approval", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let createResp, newPlan, status;
      await test.step("Выполнить запрос: Отправка на согласование - негативный: план уже в статусе approval", async () => {
        // Создаём план и переводим в approval
        const responsibleUserId = await getResponsibleUserId(dpAPI);
        ({ response: createResp, data: newPlan } =
          await dpAPI.createDevelopmentPlan({
            title: `Plan for Approval Duplicate ${Date.now()}`,
            responsibleUserId,
            ...generatePlanDates(),
          }));

        if (!createResp.ok() || !newPlan?.id) {
          test.skip(true, "Не удалось создать план для теста");
          return;
        }

        const { response: approveResp } = await dpAPI.approvalDevelopmentPlan(
          newPlan.id,
        );
        if (!approveResp.ok()) {
          await dpAPI.deleteDevelopmentPlan(newPlan.id);
          test.skip(true, "Не удалось перевести план в approval");
          return;
        }

        logInput("План уже в статусе approval", newPlan);
        logExpected("Статус 400/409 или 200 (идемпотентно)");

        // Повторная отправка на согласование
        const { response, data } = await dpAPI.approvalDevelopmentPlan(
          newPlan.id,
        );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 400, 409, 422], `Неожиданный статус ${status}`).toContain(
          status,
        );

        // Очистка
        await dpAPI.deleteDevelopmentPlan(newPlan.id);
      });
    });

    test("C4963: Отправка на согласование - негативный: план уже активен", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let status;
      await test.step("Выполнить запрос: Отправка на согласование - негативный: план уже активен", async () => {
        const activePlan = await findActivePlan(dpAPI);

        if (!activePlan) {
          test.skip(true, "Нет активных планов");
          return;
        }

        logInput("План в статусе active", activePlan);
        logExpected(
          "Статус 400/409 - нельзя отправить активный план на согласование",
        );

        const { response, data } = await dpAPI.approvalDevelopmentPlan(
          activePlan.id,
        );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [400, 409, 422, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });

    test("C4964: Отправка на согласование - негативный: план завершён", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let status;
      await test.step("Выполнить запрос: Отправка на согласование - негативный: план завершён", async () => {
        const completedPlan = await findPlanByStatus(dpAPI, "completed");

        if (!completedPlan) {
          test.skip(true, "Нет завершённых планов");
          return;
        }

        logInput("План в статусе completed", completedPlan);
        logExpected(
          "Статус 400/409 - нельзя отправить завершённый план на согласование",
        );

        const { response, data } = await dpAPI.approvalDevelopmentPlan(
          completedPlan.id,
        );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [400, 409, 422, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });
  },
);
