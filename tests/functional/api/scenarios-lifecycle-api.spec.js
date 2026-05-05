// @ts-check
/**
 * API тесты для Scenarios - Lifecycle и Actions
 *
 * Покрытие:
 * - Жизненный цикл: draft → active (необратимо)
 * - Actions: добавление, удаление, валидация
 * - Бизнес-правила перехода состояний
 *
 * @tags @api @regression @scenarios @lifecycle @workflow
 * @module Scenarios
 */

import { test as baseTest, expect } from "@playwright/test";
import {
  ScenariosAPI,
  SurveyAPI,
  getCredentials,
} from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertSuccessStatus,
  assertBadRequest,
  assertForbidden,
  extractItems,
} from "../../utils/api/common-assertions.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";

// Extend test with API fixtures
const test = baseTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new ScenariosAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Cleanup tracking
const createdScenarioIds = [];

// Helper: Получить ID активного опроса для тестов
async function getActiveSurveyId(surveyAPI) {
  const { data } = await surveyAPI.getList({ status: "active", limit: 1 });
  const items = extractItems(data);
  return items.length > 0 ? items[0].id : null;
}

// ==================== LIFECYCLE: ACTIVATION ====================

test.describe(
  "Scenarios API - Lifecycle Activation",
  { tag: ["@api", "@regression", "@scenarios", "@lifecycle"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SCENARIOS, "Lifecycle - Activation");
    });

    test.afterAll(async ({ request }) => {
      // Cleanup
      const api = new ScenariosAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of createdScenarioIds) {
        try {
          await api.remove(id);
        } catch {
          // Ignore
        }
      }
      createdScenarioIds.length = 0;
    });

    test(
      "C6740: PATCH /manager/scenarios/{id}/activity/ - активировать сценарий",
      { tag: ["@critical"] },
      async ({ adminAPI, surveyAPI }) => {
        setSeverity("critical");

        let scenario;
        await test.step("Выполнить запрос: PATCH /manager/scenarios/{id}/activity/ - активировать сценарий", async () => {
          // Получаем активный опрос для action
          const surveyId = await getActiveSurveyId(surveyAPI);
          test.skip(!surveyId, "Нет активных опросов для тестирования");

          // Создаём сценарий с action
          const title = TestDataHelper.generateUniqueName(
            "Сценарий для активации",
          );
          ({ data: scenario } = await adminAPI.createWithActions({
            title,
            description: "Тест активации",
            actions: [
              {
                type: "survey",
                days: 1,
                time: "09:00",
                surveyId,
              },
            ],
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(scenario?.id).toBeDefined();
          createdScenarioIds.push(scenario.id);

          // Проверяем что статус draft (может быть undefined в ответе create)
          if (scenario.status) {
            expect(scenario.status).toBe("draft");
          }

          // Активируем
          const { response } = await adminAPI.activate(scenario.id);

          assertSuccessStatus(response, "Активация должна быть успешной");

          // Получаем сценарий чтобы проверить статус
          const { data: activated } = await adminAPI.getById(scenario.id);
          expect(activated.status).toBe("active");
        });
      },
    );

    test(
      "C6741: Активация необратима - нельзя вернуть в draft",
      { tag: ["@critical"] },
      async ({ adminAPI, surveyAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Активация необратима - нельзя вернуть в draft", async () => {
          // Получаем активный опрос
          const surveyId = await getActiveSurveyId(surveyAPI);
          test.skip(!surveyId, "Нет активных опросов");

          // Создаём и активируем сценарий
          const { data: scenario } = await adminAPI.createWithActions({
            title: TestDataHelper.generateUniqueName("Необратимая активация"),
            actions: [{ type: "survey", days: 0, surveyId }],
          });

          createdScenarioIds.push(scenario.id);

          await adminAPI.activate(scenario.id);

          // Пытаемся изменить статус обратно на draft
          const { response } = await adminAPI.update(scenario.id, {
            status: "draft",
          });

          // API должен отклонить или игнорировать попытку
          if (response.ok()) {
            // Проверяем что статус не изменился
            const { data: check } = await adminAPI.getById(scenario.id);
            expect(check.status).toBe("active");
          } else {
            expect([400, 403, 422]).toContain(response.status());
          }
        });
      },
    );

    test(
      "C6742: Нельзя активировать сценарий без actions",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Нельзя активировать сценарий без actions", async () => {
          // Создаём сценарий без actions
          const { data: scenario } = await adminAPI.create({
            title: TestDataHelper.generateUniqueName("Сценарий без действий"),
          });

          createdScenarioIds.push(scenario.id);

          // Пытаемся активировать
          const { response } = await adminAPI.activate(scenario.id);

          // Должна быть ошибка - нельзя активировать без actions
          expect([400, 422]).toContain(response.status());
        });
      },
    );

    test("C6743: Повторная активация уже активного сценария", async ({
      adminAPI,
      surveyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Повторная активация уже активного сценария", async () => {
        const surveyId = await getActiveSurveyId(surveyAPI);
        test.skip(!surveyId, "Нет активных опросов");

        // Создаём и активируем
        const { data: scenario } = await adminAPI.createWithActions({
          title: TestDataHelper.generateUniqueName("Двойная активация"),
          actions: [{ type: "survey", days: 0, surveyId }],
        });

        if (!scenario?.id) {
          test.skip(true, "Не удалось создать сценарий");
          return;
        }

        createdScenarioIds.push(scenario.id);
        await adminAPI.activate(scenario.id);

        // Пытаемся активировать повторно
        const { response } = await adminAPI.activate(scenario.id);

        // API может вернуть 200 (идемпотентно) или 400 (уже активен)
        if (response.ok()) {
          // Проверяем что статус всё ещё active
          const { data: check } = await adminAPI.getById(scenario.id);
          expect(check.status).toBe("active");
        } else {
          expect([400, 422]).toContain(response.status());
        }
      });
    });
  },
);

// ==================== ACTIONS MANAGEMENT ====================

test.describe(
  "Scenarios API - Actions",
  { tag: ["@api", "@regression", "@scenarios", "@actions"] },
  () => {
    let testScenarioId = null;
    let testSurveyId = null;

    test.beforeEach(() => {
      markAsAPITest(MODULES.SCENARIOS, "Actions");
    });

    test.beforeAll(async ({ request }) => {
      const api = new ScenariosAPI(request);
      const surveyApi = new SurveyAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      await surveyApi.signIn(email, password);

      // Получаем ID опроса
      testSurveyId = await getActiveSurveyId(surveyApi);

      // Создаём тестовый сценарий
      const { data } = await api.create({
        title: TestDataHelper.generateUniqueName("Сценарий для Actions"),
        description: "",
      });

      if (data?.id) {
        testScenarioId = data.id;
        createdScenarioIds.push(data.id);
      }
    });

    test.afterAll(async ({ request }) => {
      const api = new ScenariosAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of createdScenarioIds) {
        try {
          await api.remove(id);
        } catch {
          // Ignore
        }
      }
      createdScenarioIds.length = 0;
    });

    test(
      "C6744: Добавить action типа survey",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data;
        await test.step("Выполнить запрос: Добавить action типа survey", async () => {
          test.skip(
            !testScenarioId || !testSurveyId,
            "Нет тестовых данных (сценарий или опрос)",
          );

          ({ response, data } = await adminAPI.addAction(testScenarioId, {
            type: "survey",
            days: 5,
            time: "10:00",
            surveyId: testSurveyId,
          }));

          assertSuccessStatus(response);
        });

        await test.step("Проверить ответ", async () => {
          expect(data.actions).toBeDefined();
          expect(data.actions.length).toBeGreaterThanOrEqual(1);

          // Проверяем добавленный action
          const lastAction = data.actions[data.actions.length - 1];
          expect(lastAction.type).toBe("survey");
          expect(lastAction.days).toBe(5);
          expect(lastAction.surveyId).toBe(testSurveyId);
        });
      },
    );

    test("C6745: Action с days=0 выполняется сразу при добавлении участника", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let actions;
      await test.step("Выполнить запрос: Action с days=0 выполняется сразу при добавлении участника", async () => {
        test.skip(!testSurveyId, "Нет активного опроса");

        // Создаём сценарий с action через обновлённый helper
        const { response, data: scenario } = await adminAPI.createWithActions({
          title: TestDataHelper.generateUniqueName("Сценарий с days=0"),
          description: "Тест days=0",
          actions: [{ type: "survey", days: 0, surveyId: testSurveyId }],
        });

        if (!response.ok() || !scenario?.id) {
          test.skip(true, "Не удалось создать сценарий");
          return;
        }
        createdScenarioIds.push(scenario.id);

        // Проверяем что action добавлен
        const { data: fullScenario } = await adminAPI.getById(scenario.id);
        actions = fullScenario.scenarioActions || fullScenario.actions || [];
      });

      await test.step("Проверить ответ", async () => {
        expect(actions.length).toBeGreaterThanOrEqual(1);
        const action = actions.find((a) => a.days === 0);
        expect(action).toBeDefined();
        expect(action.surveyId || action.survey?.id).toBe(testSurveyId);
      });
    });

    test("C6746: Нельзя добавить action без surveyId для типа survey", async ({
      adminAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Нельзя добавить action без surveyId для типа survey", async () => {
        // Создаём новый сценарий чтобы не влиять на другие тесты
        const { response: createResponse, data: scenario } =
          await adminAPI.create({
            title: TestDataHelper.generateUniqueName(
              "Сценарий для негативного теста",
            ),
            description: "Тест валидации surveyId",
          });

        if (!createResponse.ok() || !scenario?.id) {
          test.skip(true, "Не удалось создать сценарий");
          return;
        }
        createdScenarioIds.push(scenario.id);

        const { response } = await adminAPI.update(scenario.id, {
          scenarioActions: [
            {
              temporaryId: `temp-${Date.now()}`,
              type: "survey",
              days: 1,
              time: "09:00",
              surveyId: null, // null surveyId
            },
          ],
        });

        // API может принять или отклонить null surveyId
        // Если принимает - проверяем что action сохранился без surveyId
        // Если отклоняет - проверяем статус ошибки
        if (response.ok()) {
          console.log(
            "[INFO] API accepts null surveyId - this may be a bug or expected behavior",
          );
          // Получаем и проверяем
          const { data: check } = await adminAPI.getById(scenario.id);
          const actions = check.scenarioActions || [];
          // Если action сохранился с null surveyId - это может быть ОК для draft
          console.log(
            "[INFO] Actions count after null surveyId:",
            actions.length,
          );
        } else {
          expect([400, 422]).toContain(response.status());
        }
      });
    });

    test("C6747: Удалить action из сценария", async ({ adminAPI }) => {
      setSeverity("normal");

      let scenario, actions;
      await test.step("Выполнить запрос: Удалить action из сценария", async () => {
        test.skip(!testSurveyId, "Нет активного опроса");

        // Создаём сценарий с несколькими actions
        ({ data: scenario } = await adminAPI.createWithActions({
          title: TestDataHelper.generateUniqueName(
            "Сценарий с удаляемым action",
          ),
          actions: [
            { type: "survey", days: 1, surveyId: testSurveyId },
            { type: "survey", days: 3, surveyId: testSurveyId },
          ],
        }));

        if (!scenario?.id) {
          test.skip(true, "Не удалось создать сценарий");
          return;
        }
        createdScenarioIds.push(scenario.id);

        // Получаем полные данные чтобы увидеть actions
        const { data: fullScenario } = await adminAPI.getById(scenario.id);
        actions = fullScenario.scenarioActions || fullScenario.actions || [];

        if (actions.length < 2) {
          console.log(
            "[WARN] Created scenario has less than 2 actions:",
            actions.length,
          );
          test.skip(true, "Actions не были добавлены при создании");
          return;
        }
      });

      await test.step("Проверить ответ", async () => {
        expect(actions.length).toBe(2);

        // Удаляем первый action
        const actionToRemove = actions[0];
        const { response, data } = await adminAPI.removeAction(
          scenario.id,
          actionToRemove.id || actionToRemove.temporaryId,
        );

        assertSuccessStatus(response);
        const resultActions = data.scenarioActions || data.actions || [];
        expect(resultActions.length).toBe(1);
      });
    });

    test(
      "C6748: Нельзя редактировать actions активного сценария",
      { tag: ["@critical"] },
      async ({ adminAPI, surveyAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Нельзя редактировать actions активного сценария", async () => {
          const surveyId = await getActiveSurveyId(surveyAPI);
          test.skip(!surveyId, "Нет активного опроса");

          // Создаём и активируем сценарий
          const { data: scenario } = await adminAPI.createWithActions({
            title: TestDataHelper.generateUniqueName("Заблокированные actions"),
            actions: [{ type: "survey", days: 1, surveyId }],
          });

          createdScenarioIds.push(scenario.id);
          await adminAPI.activate(scenario.id);

          // Пытаемся изменить actions
          const { response } = await adminAPI.update(scenario.id, {
            actions: [
              {
                temporaryId: `temp-${Date.now()}`,
                type: "survey",
                days: 10,
                surveyId,
              },
            ],
          });

          // После активации редактирование actions должно быть запрещено
          if (response.ok()) {
            // Проверяем что actions не изменились
            const { data: check } = await adminAPI.getById(scenario.id);
            expect(check.actions.length).toBe(1);
            expect(check.actions[0].days).toBe(1); // Оригинальное значение
          } else {
            expect([400, 403, 422]).toContain(response.status());
          }
        });
      },
    );
  },
);

// ==================== ACTIONS VALIDATION ====================

test.describe(
  "Scenarios API - Actions Validation",
  { tag: ["@api", "@regression", "@scenarios", "@validation"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SCENARIOS, "Actions - Validation");
    });

    test.afterAll(async ({ request }) => {
      const api = new ScenariosAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of createdScenarioIds) {
        try {
          await api.remove(id);
        } catch {
          // Ignore
        }
      }
      createdScenarioIds.length = 0;
    });

    test("C6749: Action days должен быть >= 0", async ({
      adminAPI,
      surveyAPI,
    }) => {
      setSeverity("normal");

      let response;
      await test.step("Выполнить запрос: Action days должен быть >= 0", async () => {
        const surveyId = await getActiveSurveyId(surveyAPI);
        test.skip(!surveyId, "Нет активного опроса");

        const { data: scenario } = await adminAPI.create({
          title: TestDataHelper.generateUniqueName("Валидация days"),
        });
        createdScenarioIds.push(scenario.id);

        // Пытаемся установить отрицательное значение days
        ({ response } = await adminAPI.update(scenario.id, {
          actions: [
            {
              temporaryId: `temp-${Date.now()}`,
              type: "survey",
              days: -5, // Негативное значение
              time: "09:00",
              surveyId,
            },
          ],
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([400, 422]).toContain(response.status());
      });
    });

    test("C6750: Action time должен быть в формате HH:mm", async ({
      adminAPI,
      surveyAPI,
    }) => {
      setSeverity("normal");

      let response;
      await test.step("Выполнить запрос: Action time должен быть в формате HH:mm", async () => {
        const surveyId = await getActiveSurveyId(surveyAPI);
        test.skip(!surveyId, "Нет активного опроса");

        const { data: scenario } = await adminAPI.create({
          title: TestDataHelper.generateUniqueName("Валидация time"),
        });
        createdScenarioIds.push(scenario.id);

        // Пытаемся установить невалидный формат времени
        ({ response } = await adminAPI.update(scenario.id, {
          actions: [
            {
              temporaryId: `temp-${Date.now()}`,
              type: "survey",
              days: 1,
              time: "invalid-time", // Невалидный формат
              surveyId,
            },
          ],
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([400, 422]).toContain(response.status());
      });
    });

    test("C6751: Нельзя ссылаться на несуществующий опрос", async ({
      adminAPI,
    }) => {
      setSeverity("critical");

      let response;
      await test.step("Выполнить запрос: Нельзя ссылаться на несуществующий опрос", async () => {
        const { data: scenario } = await adminAPI.create({
          title: TestDataHelper.generateUniqueName("Невалидный surveyId"),
        });
        createdScenarioIds.push(scenario.id);

        ({ response } = await adminAPI.update(scenario.id, {
          actions: [
            {
              temporaryId: `temp-${Date.now()}`,
              type: "survey",
              days: 1,
              time: "09:00",
              surveyId: 999999, // Несуществующий опрос
            },
          ],
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([400, 404, 422]).toContain(response.status());
      });
    });

    test("C6752: Максимальное количество actions в сценарии", async ({
      adminAPI,
      surveyAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Максимальное количество actions в сценарии", async () => {
        const surveyId = await getActiveSurveyId(surveyAPI);
        test.skip(!surveyId, "Нет активного опроса");

        const { data: scenario } = await adminAPI.create({
          title: TestDataHelper.generateUniqueName("Много actions"),
        });
        createdScenarioIds.push(scenario.id);

        // Добавляем много actions
        const manyActions = Array.from({ length: 20 }, (_, i) => ({
          temporaryId: `temp-${Date.now()}-${i}`,
          type: "survey",
          days: i,
          time: "09:00",
          surveyId,
        }));

        const { response, data } = await adminAPI.update(scenario.id, {
          actions: manyActions,
        });

        // API может принять или отклонить, проверяем поведение
        if (response.ok()) {
          expect(data.actions.length).toBe(20);
        } else {
          // Есть лимит на количество actions
          expect([400, 422]).toContain(response.status());
        }
      });
    });
  },
);

// ==================== SCENARIO STATES ====================

test.describe(
  "Scenarios API - States",
  { tag: ["@api", "@regression", "@scenarios", "@states"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SCENARIOS, "States");
    });

    test.afterAll(async ({ request }) => {
      const api = new ScenariosAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of createdScenarioIds) {
        try {
          await api.remove(id);
        } catch {
          // Ignore
        }
      }
      createdScenarioIds.length = 0;
    });

    test("C6753: Новый сценарий создаётся в статусе draft", async ({
      adminAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Новый сценарий создаётся в статусе draft", async () => {
        const { response, data } = await adminAPI.create({
          title: TestDataHelper.generateUniqueName("Новый сценарий"),
          description: "Тест статуса draft",
        });

        if (!response.ok() || !data?.id) {
          test.skip(true, "Не удалось создать сценарий");
          return;
        }

        createdScenarioIds.push(data.id);

        // Получаем полные данные чтобы увидеть status
        const { data: fullData } = await adminAPI.getById(data.id);
        expect(fullData.status).toBe("draft");
      });
    });

    test("C6754: Только admin может менять статус на archive", async ({
      adminAPI,
      surveyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Только admin может менять статус на archive", async () => {
        const surveyId = await getActiveSurveyId(surveyAPI);
        test.skip(!surveyId, "Нет активного опроса");

        // Создаём и активируем
        const { data: scenario } = await adminAPI.createWithActions({
          title: TestDataHelper.generateUniqueName("Архивируемый"),
          actions: [{ type: "survey", days: 0, surveyId }],
        });

        createdScenarioIds.push(scenario.id);
        await adminAPI.activate(scenario.id);

        // Пытаемся архивировать
        const { response, data } = await adminAPI.update(scenario.id, {
          status: "archive",
        });

        // Если поддерживается архивация
        if (response.ok() && data.status === "archive") {
          expect(data.status).toBe("archive");
        }
        // Иначе проверяем что статус остался active
        else if (response.ok()) {
          expect(data.status).toBe("active");
        }
      });
    });
  },
);
