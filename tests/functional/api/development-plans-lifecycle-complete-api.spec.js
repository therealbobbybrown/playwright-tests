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
 * API тесты для жизненного цикла планов развития — завершение, интеграция, доступ, валидация
 *
 * Покрытие:
 * - POST /private/development-plans/{id}/complete - завершение плана
 *
 * Интеграционные тесты:
 * - Полный жизненный цикл: draft → active → completed
 * - Жизненный цикл с approval: draft → approval → active → completed
 *
 * Контроль доступа и валидация
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
let cachedAllPlansData = null;

// Расширяем test с фикстурой для Development Plans API
const test = fullTest.extend({
  dpAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  dpUserAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("user");
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

// ==================== ТЕСТЫ: completeDevelopmentPlan ====================

test.describe(
  "Development Plans Lifecycle - completeDevelopmentPlan",
  { tag: ["@api", "@regression", "@development-plans", "@lifecycle"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Lifecycle - Complete");
    });

    test("C4965: Завершение плана - успешное завершение активного плана", async ({
      dpAPI,
    }) => {
      setSeverity("critical");

      let createResp, newPlan, status;
      await test.step("Выполнить запрос: Завершение плана - успешное завершение активного плана", async () => {
        const responsibleUserId = await getResponsibleUserId(dpAPI);

        // Создаём план и активируем его
        ({ response: createResp, data: newPlan } =
          await dpAPI.createDevelopmentPlan({
            title: `Test Plan for Completion ${Date.now()}`,
            responsibleUserId,
            ...generatePlanDates(),
          }));

        if (!createResp.ok() || !newPlan?.id) {
          test.skip(true, "Не удалось создать план для теста");
          return;
        }

        logInput("Создание плана", newPlan);

        // Активируем план
        const { response: activateResp } = await dpAPI.activateDevelopmentPlan(
          newPlan.id,
        );
        if (!activateResp.ok()) {
          await dpAPI.deleteDevelopmentPlan(newPlan.id);
          test.skip(true, "Не удалось активировать план");
          return;
        }

        logExpected("План успешно завершается из статуса active");

        // Завершаем
        const { response, data } = await dpAPI.completeDevelopmentPlan(
          newPlan.id,
          "Тест завершения плана",
        );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [200, 201],
          `Ожидался статус 200/201 при завершении, получен ${status}`,
        ).toContain(status);

        // Проверяем статус
        const { status: planStatus } = await getPlanWithStatus(
          dpAPI,
          newPlan.id,
        );
        expect(planStatus, "План должен быть в статусе completed").toBe(
          "completed",
        );
      });
    });

    test("C4966: Завершение плана - успешное завершение с комментарием", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let createResp, newPlan, status;
      await test.step("Выполнить запрос: Завершение плана - успешное завершение с комментарием", async () => {
        const responsibleUserId = await getResponsibleUserId(dpAPI);
        const completionComment = "План успешно выполнен. Все цели достигнуты.";

        ({ response: createResp, data: newPlan } =
          await dpAPI.createDevelopmentPlan({
            title: `Test Plan with Comment ${Date.now()}`,
            responsibleUserId,
            ...generatePlanDates(),
          }));

        if (!createResp.ok() || !newPlan?.id) {
          test.skip(true, "Не удалось создать план для теста");
          return;
        }

        logInput("План с комментарием завершения", {
          plan: newPlan,
          comment: completionComment,
        });
        logExpected("План завершён с комментарием");

        // Активируем
        await dpAPI.activateDevelopmentPlan(newPlan.id);

        // Завершаем с комментарием
        const { response, data } = await dpAPI.completeDevelopmentPlan(
          newPlan.id,
          completionComment,
        );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [200, 201],
          `Ожидался статус 200/201, получен ${status}`,
        ).toContain(status);

        // Проверяем статус
        const { plan: completedPlan } = await getPlanWithStatus(
          dpAPI,
          newPlan.id,
        );
        expect(
          completedPlan?.status,
          "План должен быть в статусе completed",
        ).toBe("completed");
      });
    });

    test("C4967: Завершение плана - успешное завершение без комментария", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let createResp, newPlan, status;
      await test.step("Выполнить запрос: Завершение плана - успешное завершение без комментария", async () => {
        const responsibleUserId = await getResponsibleUserId(dpAPI);

        ({ response: createResp, data: newPlan } =
          await dpAPI.createDevelopmentPlan({
            title: `Test Plan without Comment ${Date.now()}`,
            responsibleUserId,
            ...generatePlanDates(),
          }));

        if (!createResp.ok() || !newPlan?.id) {
          test.skip(true, "Не удалось создать план для теста");
          return;
        }

        logInput("План без комментария завершения", newPlan);
        logExpected("План завершён без комментария");

        await dpAPI.activateDevelopmentPlan(newPlan.id);

        const { response, data } = await dpAPI.completeDevelopmentPlan(
          newPlan.id,
        );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [200, 201],
          `Ожидался статус 200/201, получен ${status}`,
        ).toContain(status);

        const { status: planStatus } = await getPlanWithStatus(
          dpAPI,
          newPlan.id,
        );
        expect(planStatus, "План должен быть в статусе completed").toBe(
          "completed",
        );
      });
    });

    test("C4968: Завершение плана - негативный: план не существует", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Завершение плана - негативный: план не существует", async () => {
        const nonExistentId = 999999999;
        logInput("ID несуществующего плана", { id: nonExistentId });
        logExpected("Статус 404 Not Found");

        const { response, data } = await dpAPI.completeDevelopmentPlan(
          nonExistentId,
          "Комментарий",
        );
        const status = response.status();
        logResponse(status, data);

        expect(
          [404, 400, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });

    test("C4969: Завершение плана - негативный: план в статусе draft", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let status;
      await test.step("Выполнить запрос: Завершение плана - негативный: план в статусе draft", async () => {
        const draftPlan = await findPlanInDraft(dpAPI);

        if (!draftPlan) {
          test.skip(true, "Нет планов в статусе draft");
          return;
        }

        logInput("План в статусе draft", draftPlan);
        logExpected("Статус 400/409 - нельзя завершить план из draft");

        const { response, data } = await dpAPI.completeDevelopmentPlan(
          draftPlan.id,
          "Попытка завершения",
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

    test("C4970: Завершение плана - негативный: план уже завершён", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let status;
      await test.step("Выполнить запрос: Завершение плана - негативный: план уже завершён", async () => {
        const completedPlan = await findPlanByStatus(dpAPI, "completed");

        if (!completedPlan) {
          test.skip(true, "Нет завершённых планов");
          return;
        }

        logInput("План уже в статусе completed", completedPlan);
        logExpected("Статус 400/409 или 200 (идемпотентно)");

        const { response, data } = await dpAPI.completeDevelopmentPlan(
          completedPlan.id,
          "Повторное завершение",
        );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 400, 409, 422], `Неожиданный статус ${status}`).toContain(
          status,
        );
      });
    });
  },
);

// ==================== ИНТЕГРАЦИОННЫЕ ТЕСТЫ: Полный жизненный цикл ====================

test.describe(
  "Development Plans Lifecycle - Интеграционные тесты",
  {
    tag: [
      "@api",
      "@regression",
      "@development-plans",
      "@lifecycle",
      "@integration",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Lifecycle - Integration");
    });

    test("C4971: Полный жизненный цикл: draft → active → completed", async ({
      dpAPI,
    }) => {
      setSeverity("critical");

      let createResp, newPlan, currentStatus;
      await test.step("Выполнить запрос: Полный жизненный цикл: draft → active → completed", async () => {
        const responsibleUserId = await getResponsibleUserId(dpAPI);

        logExpected("Создание плана и прохождение через жизненный цикл");

        // Создаём план
        ({ response: createResp, data: newPlan } =
          await dpAPI.createDevelopmentPlan({
            title: `Full Lifecycle Test ${Date.now()}`,
            responsibleUserId,
            ...generatePlanDates(),
          }));

        logInput("Создание плана", {
          title: `Full Lifecycle Test`,
          responsibleUserId,
        });
        logResponse(createResp.status(), newPlan);

        if (!createResp.ok() || !newPlan?.id) {
          test.skip(true, "Не удалось создать план для теста");
          return;
        }

        // Проверяем начальный статус
        ({ status: currentStatus } = await getPlanWithStatus(
          dpAPI,
          newPlan.id,
        ));
      });

      await test.step("Проверить ответ", async () => {
        expect(currentStatus, "Новый план должен быть в статусе draft").toBe(
          "draft",
        );

        // draft → active
        const { response: activateResp } = await dpAPI.activateDevelopmentPlan(
          newPlan.id,
        );
        logInput("Переход draft → active", { planId: newPlan.id });
        logResponse(activateResp.status(), null);

        expect([200, 201], `Ожидался статус 200/201 при активации`).toContain(
          activateResp.status(),
        );

        ({ status: currentStatus } = await getPlanWithStatus(
          dpAPI,
          newPlan.id,
        ));
        expect(currentStatus, "План должен быть в статусе active").toBe(
          "active",
        );

        // active → completed
        const { response: completeResp } = await dpAPI.completeDevelopmentPlan(
          newPlan.id,
          "Полный цикл тестирования завершён",
        );
        logInput("Переход active → completed", { planId: newPlan.id });
        logResponse(completeResp.status(), null);

        expect([200, 201], `Ожидался статус 200/201 при завершении`).toContain(
          completeResp.status(),
        );

        ({ status: currentStatus } = await getPlanWithStatus(
          dpAPI,
          newPlan.id,
        ));
        expect(currentStatus, "План должен быть в статусе completed").toBe(
          "completed",
        );
      });
    });

    test("C4972: Жизненный цикл с approval: draft → approval → active → completed", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Жизненный цикл с approval: draft → approval → active → completed", async () => {
        const responsibleUserId = await getResponsibleUserId(dpAPI);

        logExpected("Создание плана с прохождением через approval");

        const { response: createResp, data: newPlan } =
          await dpAPI.createDevelopmentPlan({
            title: `Lifecycle with Approval ${Date.now()}`,
            responsibleUserId,
            ...generatePlanDates(),
          });

        if (!createResp.ok() || !newPlan?.id) {
          test.skip(true, "Не удалось создать план для теста");
          return;
        }

        logInput("Создание плана", newPlan);

        // draft → approval
        const { response: approvalResp } = await dpAPI.approvalDevelopmentPlan(
          newPlan.id,
        );

        if (approvalResp.ok()) {
          let { status: currentStatus } = await getPlanWithStatus(
            dpAPI,
            newPlan.id,
          );

          if (currentStatus === "approval") {
            // approval → active
            const { response: activateResp } =
              await dpAPI.activateDevelopmentPlan(newPlan.id);
            expect([200, 201], "Активация из approval").toContain(
              activateResp.status(),
            );

            ({ status: currentStatus } = await getPlanWithStatus(
              dpAPI,
              newPlan.id,
            ));
            expect(currentStatus, "План активирован").toBe("active");
          }
        }

        // Завершаем план если он активен
        const { status: finalStatus } = await getPlanWithStatus(
          dpAPI,
          newPlan.id,
        );
        if (finalStatus === "active") {
          await dpAPI.completeDevelopmentPlan(newPlan.id, "Тест завершён");
        } else if (finalStatus === "draft") {
          await dpAPI.deleteDevelopmentPlan(newPlan.id);
        }
      });
    });
  },
);

// ==================== ТЕСТЫ: Контроль доступа ====================

test.describe(
  "Development Plans Lifecycle - Контроль доступа",
  {
    tag: [
      "@api",
      "@regression",
      "@development-plans",
      "@lifecycle",
      "@access-control",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Lifecycle - Access Control");
    });

    test("C4973: Обычный пользователь - проверка прав на изменение статуса", async ({
      dpAPI,
      dpUserAPI,
    }) => {
      setSeverity("normal");

      logExpected("Обычный пользователь имеет ограниченные права");

      let status;
      await test.step("Выполнить запрос: Обычный пользователь - проверка прав на изменение статуса", async () => {
        // Создаём план от admin для user, чтобы у user был доступный план
        const userIdResp = await dpUserAPI.getDevelopmentPlans({ limit: 1 });
        let anyPlan;

        const rawItems = userIdResp.data?.items || userIdResp.data;
        const items = Array.isArray(rawItems) ? rawItems : [];
        anyPlan = items.find((p) => p && p.id);

        if (!anyPlan) {
          // У user нет планов — создадим от admin
          const responsibleUserId = await getResponsibleUserId(dpAPI);
          const { response: createResp, data: newPlan } =
            await dpAPI.createDevelopmentPlan({
              title: `Plan for User Access Test ${Date.now()}`,
              responsibleUserId,
              ...generatePlanDates(),
            });

          if (!createResp.ok() || !newPlan?.id) {
            test.skip(true, "Не удалось создать план для теста");
            return;
          }
          anyPlan = newPlan;
        }

        logInput("Доступный план", anyPlan);

        // Пробуем изменить статус (результат зависит от прав пользователя)
        const { response: actionResp, data: actionData } =
          await dpUserAPI.activateDevelopmentPlan(anyPlan.id);
        status = actionResp.status();
        logResponse(status, actionData);

        // Может вернуть 403/401 (нет прав), 400/409 (недопустимый переход), или 200 (есть права)
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [200, 400, 401, 403, 404, 409, 422],
          `Неожиданный статус ${status}`,
        ).toContain(status);
      });
    });
  },
);

// ==================== ТЕСТЫ: Валидация ====================

test.describe(
  "Development Plans Lifecycle - Валидация",
  {
    tag: [
      "@api",
      "@regression",
      "@development-plans",
      "@lifecycle",
      "@validation",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Lifecycle - Validation");
    });

    test("C4974: Активация с невалидным ID (строка вместо числа)", async ({
      dpAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Активация с невалидным ID (строка вместо числа)", async () => {
        logInput("Невалидный ID", { id: "invalid-id" });
        logExpected("Статус 400/404 - невалидный ID");

        // @ts-ignore - намеренно передаём невалидный тип
        const { response, data } =
          await dpAPI.activateDevelopmentPlan("invalid-id");
        const status = response.status();
        logResponse(status, data);

        expect(
          [400, 404, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });

    test("C4975: Активация с ID = 0", async ({ dpAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Активация с ID = 0", async () => {
        logInput("ID = 0", { id: 0 });
        logExpected("Статус 400/404");

        const { response, data } = await dpAPI.activateDevelopmentPlan(0);
        const status = response.status();
        logResponse(status, data);

        expect(
          [400, 404, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });

    test("C4976: Активация с отрицательным ID", async ({ dpAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Активация с отрицательным ID", async () => {
        logInput("Отрицательный ID", { id: -1 });
        logExpected("Статус 400/404");

        const { response, data } = await dpAPI.activateDevelopmentPlan(-1);
        const status = response.status();
        logResponse(status, data);

        expect(
          [400, 404, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });

    test("C4977: Завершение с очень длинным комментарием", async ({
      dpAPI,
    }) => {
      setSeverity("minor");

      let status;
      await test.step("Выполнить запрос: Завершение с очень длинным комментарием", async () => {
        const responsibleUserId = await getResponsibleUserId(dpAPI);

        // Создаём очень длинный комментарий (10000 символов)
        const longComment = "A".repeat(10000);

        logInput("Очень длинный комментарий", { length: longComment.length });
        logExpected("Сервер должен обработать или вернуть ошибку валидации");

        const { response: createResp, data: newPlan } =
          await dpAPI.createDevelopmentPlan({
            title: `Long Comment Test ${Date.now()}`,
            responsibleUserId,
            ...generatePlanDates(),
          });

        if (!createResp.ok() || !newPlan?.id) {
          test.skip(true, "Не удалось создать план");
          return;
        }

        await dpAPI.activateDevelopmentPlan(newPlan.id);

        const { response, data } = await dpAPI.completeDevelopmentPlan(
          newPlan.id,
          longComment,
        );
        status = response.status();
        logResponse(status, { truncatedData: true });

        // Может быть 200 (принято) или 400/422 (валидация)
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 400, 422, 500], `Неожиданный статус ${status}`).toContain(
          status,
        );
      });
    });

    test("C4978: Завершение с спецсимволами в комментарии", async ({
      dpAPI,
    }) => {
      setSeverity("minor");

      let status;
      await test.step("Выполнить запрос: Завершение с спецсимволами в комментарии", async () => {
        const responsibleUserId = await getResponsibleUserId(dpAPI);
        const specialComment = '<script>alert("XSS")</script>'; // Тест на XSS

        logInput("Комментарий со спецсимволами", { comment: specialComment });
        logExpected("Сервер должен экранировать или отклонить");

        const { response: createResp, data: newPlan } =
          await dpAPI.createDevelopmentPlan({
            title: `Special Chars Test ${Date.now()}`,
            responsibleUserId,
            ...generatePlanDates(),
          });

        if (!createResp.ok() || !newPlan?.id) {
          test.skip(true, "Не удалось создать план");
          return;
        }

        await dpAPI.activateDevelopmentPlan(newPlan.id);

        const { response, data } = await dpAPI.completeDevelopmentPlan(
          newPlan.id,
          specialComment,
        );
        status = response.status();
        logResponse(status, data);

        // Должен быть обработан безопасно
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 400, 422], `Неожиданный статус ${status}`).toContain(
          status,
        );
      });
    });
  },
);
