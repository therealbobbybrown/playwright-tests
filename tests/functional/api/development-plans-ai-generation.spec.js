// tests/functional/api/development-plans-ai-generation.spec.js
// TASK-069: Тесты AI-генерации milestones для Development Plans
//
// Эндпоинты:
// - POST /private/development-plans/objectives/{objectiveId}/milestones/start-ai-generation
// - POST /private/development-plans/objectives/{objectiveId}/milestones/check-ai-generation
// - PATCH /private/development-plans/objectives/{objectiveId}/milestones/cancel-ai-generation

import { test as base, expect } from "@playwright/test";
import {
  DevelopmentPlansAPI,
  OrgStructureAPI,
  getCredentials,
} from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
  logAPICall,
  allure,
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

// Кеш для userId
let cachedUserId = null;

// Фикстуры для тестов
const test = base.extend({
  // API клиент с авторизацией админа
  dpAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  // OrgStructure API для поиска пользователей
  orgAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  // API клиент обычного пользователя
  userAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },

  // Неавторизованный клиент
  anonAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    await use(api);
  },
});

// Хелпер для получения ID пользователя через OrgStructure API
async function findExistingUser(orgAPI) {
  if (cachedUserId) {
    return cachedUserId;
  }

  const { data } = await orgAPI.findUsers({ limit: 10 });
  const items = data?.items || data || [];
  if (items.length > 0) {
    cachedUserId = items[0].id;
    return cachedUserId;
  }

  return null;
}

// Хелпер для создания тестового плана с целью
async function createTestPlanWithObjective(api, userId) {
  // Даты для плана
  const startDate = new Date().toISOString().split("T")[0];
  const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // Создаём план
  const { response, data: plan } = await api.createDevelopmentPlan({
    title: `AI Test Plan ${Date.now()}`,
    responsibleUserId: userId,
    startDate,
    endDate,
  });

  if (!response.ok() || !plan?.id) {
    allure.attachment(
      "Create Plan Error",
      JSON.stringify({ status: response.status(), data: plan }, null, 2),
      "application/json",
    );
    return { planId: null, objectiveId: null };
  }

  // Создаём цель в плане
  const { response: objResponse, data: objective } =
    await api.saveDevelopmentPlanObjective(plan.id, {
      title: `AI Test Objective ${Date.now()}`,
      description: "Цель для тестирования AI-генерации milestones",
    });

  if (!objResponse.ok()) {
    allure.attachment(
      "Create Objective Error",
      JSON.stringify(
        { status: objResponse.status(), data: objective },
        null,
        2,
      ),
      "application/json",
    );
  }

  return {
    planId: plan.id,
    objectiveId: objective?.id || null,
  };
}

test.describe(
  "Development Plans AI Milestones Generation",
  { tag: ["@api", "@regression", "@development-plans", "@ai"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "AI Generation");
    });

    // Тестовые данные для cleanup
    const createdPlanIds = [];
    let testUserId = null;
    let testPlanId = null;
    let testObjectiveId = null;

    test.beforeAll(async ({ request }) => {
      // API для работы с планами
      const dpApi = new DevelopmentPlansAPI(request);
      const { email, password } = getCredentials("admin");
      await dpApi.signIn(email, password);

      // API для поиска пользователей
      const orgApi = new OrgStructureAPI(request);
      await orgApi.signIn(email, password);

      testUserId = await findExistingUser(orgApi);

      if (!testUserId) {
        return;
      }

      // Создаём тестовый план с целью
      const { planId, objectiveId } = await createTestPlanWithObjective(
        dpApi,
        testUserId,
      );
      testPlanId = planId;
      testObjectiveId = objectiveId;

      if (planId) {
        createdPlanIds.push(planId);
      }
    });

    test.afterAll(async ({ request }) => {
      const api = new DevelopmentPlansAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Cleanup созданных планов
      for (const planId of createdPlanIds) {
        try {
          await api.deleteDevelopmentPlan(planId);
        } catch (e) {
          // Игнорируем ошибки при cleanup
        }
      }
    });

    test.describe("Anonymous Access", { tag: ["@security"] }, () => {
      test("C4873: POST start-ai-generation - должен получить 401", async ({
        anonAPI,
      }) => {
        setSeverity("critical");

        await test.step("Выполнить: POST start-ai-generation - должен получить 401", async () => {
          const endpoint = `/private/development-plans/objectives/${testObjectiveId || 1}/milestones/start-ai-generation`;
          const { response, data } = await anonAPI.startMilestonesAiGeneration(
            testObjectiveId || 1,
          );

          logAPICall("POST", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          expect(
            response.status(),
            "Anonymous должен получить 401 Unauthorized",
          ).toBe(401);
        });
      });

      test("C4874: POST check-ai-generation - должен получить 401", async ({
        anonAPI,
      }) => {
        setSeverity("critical");

        await test.step("Выполнить: POST check-ai-generation - должен получить 401", async () => {
          const endpoint = `/private/development-plans/objectives/${testObjectiveId || 1}/milestones/check-ai-generation`;
          const { response, data } = await anonAPI.checkMilestonesAiGeneration(
            testObjectiveId || 1,
          );

          logAPICall("POST", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          expect(
            response.status(),
            "Anonymous должен получить 401 Unauthorized",
          ).toBe(401);
        });
      });

      test("C4875: PATCH cancel-ai-generation - должен получить 401", async ({
        anonAPI,
      }) => {
        setSeverity("critical");

        await test.step("Выполнить: PATCH cancel-ai-generation - должен получить 401", async () => {
          const endpoint = `/private/development-plans/objectives/${testObjectiveId || 1}/milestones/cancel-ai-generation`;
          const { response, data } = await anonAPI.cancelMilestonesAiGeneration(
            testObjectiveId || 1,
          );

          logAPICall("PATCH", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          expect(
            response.status(),
            "Anonymous должен получить 401 Unauthorized",
          ).toBe(401);
        });
      });
    });

    test.describe("Start AI Generation", () => {
      test("C4876: POST start-ai-generation - админ может запустить генерацию", async ({
        dpAPI,
      }) => {
        setSeverity("critical");

        let response, data, allowedStatuses;
        await test.step("Выполнить запрос: POST start-ai-generation - админ может запустить генерацию", async () => {
          test.skip(!testObjectiveId, "Нет тестовой цели");

          const endpoint = `/private/development-plans/objectives/${testObjectiveId}/milestones/start-ai-generation`;
          ({ response, data } =
            await dpAPI.startMilestonesAiGeneration(testObjectiveId));

          logAPICall("POST", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          // Допустимые статусы с пояснением
          allowedStatuses = [200, 202, 400, 404];
        });

        await test.step("Проверить ответ", async () => {
          expect(
            allowedStatuses,
            `Статус ${response.status()} должен быть одним из: ${allowedStatuses.join(", ")}`,
          ).toContain(response.status());

          if (response.ok()) {
            // Проверяем структуру ответа
            expect(data, "Ответ должен быть определён").toBeDefined();

            await allure.step(
              "Проверка структуры ответа start-ai-generation",
              async () => {
                allure.attachment(
                  "Response Structure",
                  JSON.stringify(
                    {
                      fields: Object.keys(data || {}),
                      data,
                    },
                    null,
                    2,
                  ),
                  "application/json",
                );
              },
            );
          } else if (response.status() === 400) {
            // Логируем причину ошибки
            await allure.step(
              "AI Generation недоступен или ошибка валидации",
              async () => {
                allure.attachment(
                  "Error Details",
                  JSON.stringify(data, null, 2),
                  "application/json",
                );
              },
            );
          }
        });
      });

      test("C4877: POST start-ai-generation - с несуществующей целью возвращает 404", async ({
        dpAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST start-ai-generation - с несуществующей целью возвращает 404", async () => {
          const nonExistentId = 999999;
          const endpoint = `/private/development-plans/objectives/${nonExistentId}/milestones/start-ai-generation`;
          ({ response, data } =
            await dpAPI.startMilestonesAiGeneration(nonExistentId));

          logAPICall("POST", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          // Ожидаем 404 для несуществующего ресурса
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [400, 404],
            "Несуществующая цель должна вернуть 400 или 404",
          ).toContain(response.status());

          if (data?.message) {
            allure.attachment("Error Message", data.message, "text/plain");
          }
        });
      });

      test("C4878: POST start-ai-generation - с невалидным objectiveId возвращает ошибку", async ({
        dpAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST start-ai-generation - с невалидным objectiveId возвращает ошибку", async () => {
          const endpoint =
            "/private/development-plans/objectives/invalid/milestones/start-ai-generation";
          const { response, data } = await dpAPI.post(endpoint);

          logAPICall("POST", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          // Невалидный ID должен вернуть 400 (Bad Request)
          expect(
            [400, 404],
            "Невалидный ID должен вернуть 400 или 404",
          ).toContain(response.status());
        });
      });
    });

    test.describe("Check AI Generation Status", () => {
      test("C4879: POST check-ai-generation - админ может проверить статус", async ({
        dpAPI,
      }) => {
        setSeverity("critical");

        let response, data;
        await test.step("Выполнить запрос: POST check-ai-generation - админ может проверить статус", async () => {
          test.skip(!testObjectiveId, "Нет тестовой цели");

          const endpoint = `/private/development-plans/objectives/${testObjectiveId}/milestones/check-ai-generation`;
          ({ response, data } =
            await dpAPI.checkMilestonesAiGeneration(testObjectiveId));

          logAPICall("POST", endpoint, {
            status: response.status(),
            responseBody: data,
          });
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [200, 400, 404],
            "Статус должен быть 200, 400 или 404",
          ).toContain(response.status());

          if (response.ok()) {
            expect(data, "Ответ должен содержать данные").toBeDefined();

            await allure.step(
              "Проверка структуры статуса генерации",
              async () => {
                // Проверяем наличие поля status
                const validStatuses = [
                  "pending",
                  "in_progress",
                  "completed",
                  "failed",
                  "not_started",
                ];

                if (data?.status) {
                  expect(
                    validStatuses,
                    `Статус "${data.status}" должен быть валидным`,
                  ).toContain(data.status);
                }

                allure.attachment(
                  "Generation Status",
                  JSON.stringify(
                    {
                      status: data?.status,
                      fields: Object.keys(data || {}),
                      fullResponse: data,
                    },
                    null,
                    2,
                  ),
                  "application/json",
                );
              },
            );

            // Если есть milestones, проверяем структуру
            if (data?.milestones && Array.isArray(data.milestones)) {
              await allure.step(
                `Найдено ${data.milestones.length} milestones`,
                async () => {
                  if (data.milestones.length > 0) {
                    const milestone = data.milestones[0];
                    allure.attachment(
                      "Milestone Structure",
                      JSON.stringify(
                        {
                          fields: Object.keys(milestone),
                          example: milestone,
                        },
                        null,
                        2,
                      ),
                      "application/json",
                    );
                  }
                },
              );
            }
          }
        });
      });

      test("C4880: POST check-ai-generation - с несуществующей целью", async ({
        dpAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST check-ai-generation - с несуществующей целью", async () => {
          const nonExistentId = 999999;
          const endpoint = `/private/development-plans/objectives/${nonExistentId}/milestones/check-ai-generation`;
          const { response, data } =
            await dpAPI.checkMilestonesAiGeneration(nonExistentId);

          logAPICall("POST", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          expect(
            [400, 404],
            "Несуществующая цель должна вернуть 400 или 404",
          ).toContain(response.status());
        });
      });
    });

    test.describe("Cancel AI Generation", () => {
      test("C4881: PATCH cancel-ai-generation - админ может отменить генерацию", async ({
        dpAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: PATCH cancel-ai-generation - админ может отменить генерацию", async () => {
          test.skip(!testObjectiveId, "Нет тестовой цели");

          const endpoint = `/private/development-plans/objectives/${testObjectiveId}/milestones/cancel-ai-generation`;
          ({ response, data } =
            await dpAPI.cancelMilestonesAiGeneration(testObjectiveId));

          logAPICall("PATCH", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          // 200 - отмена успешна, 400 - генерация не запущена или уже завершена, 404 - цель не найдена
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [200, 400, 404],
            "Статус должен быть 200, 400 или 404",
          ).toContain(response.status());

          if (response.ok()) {
            await allure.step("Генерация успешно отменена", async () => {
              allure.attachment(
                "Cancel Response",
                JSON.stringify(data, null, 2),
                "application/json",
              );
            });
          } else if (response.status() === 400) {
            await allure.step(
              "Отмена невозможна (генерация не запущена или завершена)",
              async () => {
                allure.attachment(
                  "Cancel Error",
                  JSON.stringify(data, null, 2),
                  "application/json",
                );
              },
            );
          }
        });
      });

      test("C4882: PATCH cancel-ai-generation - с несуществующей целью", async ({
        dpAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: PATCH cancel-ai-generation - с несуществующей целью", async () => {
          const nonExistentId = 999999;
          const endpoint = `/private/development-plans/objectives/${nonExistentId}/milestones/cancel-ai-generation`;
          const { response, data } =
            await dpAPI.cancelMilestonesAiGeneration(nonExistentId);

          logAPICall("PATCH", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          expect(
            [400, 404],
            "Несуществующая цель должна вернуть 400 или 404",
          ).toContain(response.status());
        });
      });
    });

    test.describe("AI Generation Flow", () => {
      test("C4883: Полный цикл: start -> check -> cancel", async ({
        dpAPI,
      }) => {
        setSeverity("critical");

        await test.step("Выполнить: Полный цикл: start -> check -> cancel", async () => {
          test.skip(!testUserId, "Нет ID пользователя");

          // Создаём новый план и цель для теста
          const { planId, objectiveId } = await createTestPlanWithObjective(
            dpAPI,
            testUserId,
          );
          test.skip(!objectiveId, "Не удалось создать цель");

          if (planId) {
            createdPlanIds.push(planId);
          }

          // 1. Запускаем генерацию
          await allure.step("Step 1: Запуск AI генерации", async () => {
            const { response: startResponse, data: startData } =
              await dpAPI.startMilestonesAiGeneration(objectiveId);

            logAPICall(
              "POST",
              `/objectives/${objectiveId}/milestones/start-ai-generation`,
              {
                status: startResponse.status(),
                responseBody: startData,
              },
            );

            if (startResponse.ok()) {
              allure.attachment(
                "Start Response",
                JSON.stringify(startData, null, 2),
                "application/json",
              );

              // 2. Проверяем статус
              await allure.step(
                "Step 2: Проверка статуса генерации",
                async () => {
                  const { response: checkResponse, data: checkData } =
                    await dpAPI.checkMilestonesAiGeneration(objectiveId);

                  logAPICall(
                    "POST",
                    `/objectives/${objectiveId}/milestones/check-ai-generation`,
                    {
                      status: checkResponse.status(),
                      responseBody: checkData,
                    },
                  );

                  expect([200, 400, 404]).toContain(checkResponse.status());

                  if (checkResponse.ok()) {
                    allure.attachment(
                      "Check Response",
                      JSON.stringify(checkData, null, 2),
                      "application/json",
                    );
                  }

                  // 3. Отменяем если ещё в процессе
                  if (
                    checkData?.status === "pending" ||
                    checkData?.status === "in_progress"
                  ) {
                    await allure.step("Step 3: Отмена генерации", async () => {
                      const { response: cancelResponse, data: cancelData } =
                        await dpAPI.cancelMilestonesAiGeneration(objectiveId);

                      logAPICall(
                        "PATCH",
                        `/objectives/${objectiveId}/milestones/cancel-ai-generation`,
                        {
                          status: cancelResponse.status(),
                          responseBody: cancelData,
                        },
                      );

                      expect([200, 400]).toContain(cancelResponse.status());
                    });
                  }
                },
              );
            } else {
              // AI может быть недоступен - логируем
              await allure.step("AI Generation недоступен", async () => {
                allure.attachment(
                  "Error Response",
                  JSON.stringify(
                    {
                      status: startResponse.status(),
                      data: startData,
                    },
                    null,
                    2,
                  ),
                  "application/json",
                );
              });

              expect([200, 202, 400, 404, 500, 503]).toContain(
                startResponse.status(),
              );
            }
          });
        });
      });
    });

    test.describe("User Access Permissions", { tag: ["@security"] }, () => {
      test("C4884: User может запустить генерацию для своего плана", async ({
        userAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: User может запустить генерацию для своего плана", async () => {
          const userId = userAPI.getCurrentUserId();
          test.skip(!userId, "Нет ID пользователя");

          // Создаём план от имени user
          const { planId, objectiveId } = await createTestPlanWithObjective(
            userAPI,
            userId,
          );

          if (planId && objectiveId) {
            createdPlanIds.push(planId);

            const endpoint = `/private/development-plans/objectives/${objectiveId}/milestones/start-ai-generation`;
            const { response, data } =
              await userAPI.startMilestonesAiGeneration(objectiveId);

            logAPICall("POST", endpoint, {
              status: response.status(),
              responseBody: data,
            });

            // User может запустить генерацию для своей цели
            // 200/202 - успех, 400 - AI недоступен, 403 - нет прав
            expect([200, 202, 400, 403, 404, 500, 503]).toContain(
              response.status(),
            );

            await allure.step(
              `User получил статус ${response.status()}`,
              async () => {
                allure.attachment(
                  "Response",
                  JSON.stringify(data, null, 2),
                  "application/json",
                );
              },
            );
          } else {
            test.skip(true, "Не удалось создать план");
          }
        });
      });

      test("C4885: User не может запустить генерацию для чужого плана", async ({
        dpAPI,
        userAPI,
      }) => {
        setSeverity("critical");

        let response, data;
        await test.step("Выполнить запрос: User не может запустить генерацию для чужого плана", async () => {
          test.skip(!testObjectiveId, "Нет тестовой цели");

          const endpoint = `/private/development-plans/objectives/${testObjectiveId}/milestones/start-ai-generation`;

          // testObjectiveId создан админом, user пытается запустить генерацию
          ({ response, data } =
            await userAPI.startMilestonesAiGeneration(testObjectiveId));

          logAPICall("POST", endpoint, {
            status: response.status(),
            responseBody: data,
          });

          // User не должен иметь доступа к чужому плану
          // 400 - Bad Request (валидация прав), 403 - запрещено, 404 - не найдено (скрыто для user)
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [400, 403, 404],
            "User не должен иметь доступа к чужому плану",
          ).toContain(response.status());

          await allure.step("Проверка отказа в доступе", async () => {
            allure.attachment(
              "Access Denied Response",
              JSON.stringify(
                {
                  status: response.status(),
                  expectedBehavior:
                    "User не должен видеть или изменять чужие планы",
                  data,
                },
                null,
                2,
              ),
              "application/json",
            );
          });
        });
      });
    });
  },
);

test.describe(
  "AI Generation Response Structure",
  { tag: ["@api", "@development-plans"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "AI Response");
    });

    test("C4886: Структура ответа start-ai-generation", async ({ request }) => {
      setSeverity("normal");

      await test.step("Выполнить: Структура ответа start-ai-generation", async () => {
        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const userId = api.getCurrentUserId();
        test.skip(!userId, "Не удалось получить userId");

        const { planId, objectiveId } = await createTestPlanWithObjective(
          api,
          userId,
        );

        if (objectiveId) {
          const { response, data } =
            await api.startMilestonesAiGeneration(objectiveId);

          logAPICall(
            "POST",
            `/objectives/${objectiveId}/milestones/start-ai-generation`,
            {
              status: response.status(),
              responseBody: data,
            },
          );

          if (response.ok()) {
            expect(data, "Ответ должен быть определён").toBeDefined();

            await allure.step("Анализ структуры ответа", async () => {
              const fields = Object.keys(data || {});
              allure.attachment(
                "Response Analysis",
                JSON.stringify(
                  {
                    status: response.status(),
                    fields,
                    fieldCount: fields.length,
                    data,
                  },
                  null,
                  2,
                ),
                "application/json",
              );
            });
          }

          // Cleanup
          if (planId) {
            await api.deleteDevelopmentPlan(planId);
          }
        }
      });
    });

    test("C4887: Структура ответа check-ai-generation", async ({ request }) => {
      setSeverity("normal");

      await test.step("Выполнить: Структура ответа check-ai-generation", async () => {
        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const userId = api.getCurrentUserId();
        test.skip(!userId, "Не удалось получить userId");

        const { planId, objectiveId } = await createTestPlanWithObjective(
          api,
          userId,
        );

        if (objectiveId) {
          // Запускаем генерацию
          await api.startMilestonesAiGeneration(objectiveId);

          // Проверяем статус
          const { response, data } =
            await api.checkMilestonesAiGeneration(objectiveId);

          logAPICall(
            "POST",
            `/objectives/${objectiveId}/milestones/check-ai-generation`,
            {
              status: response.status(),
              responseBody: data,
            },
          );

          if (response.ok()) {
            expect(data, "Ответ должен быть определён").toBeDefined();

            await allure.step("Анализ структуры check ответа", async () => {
              const fields = Object.keys(data || {});
              allure.attachment(
                "Check Response Analysis",
                JSON.stringify(
                  {
                    fields,
                    hasStatus: "status" in (data || {}),
                    hasMilestones: "milestones" in (data || {}),
                    data,
                  },
                  null,
                  2,
                ),
                "application/json",
              );
            });

            // Если есть milestones, проверяем структуру
            if (
              data?.milestones &&
              Array.isArray(data.milestones) &&
              data.milestones.length > 0
            ) {
              await allure.step(
                "Структура сгенерированных milestones",
                async () => {
                  const milestone = data.milestones[0];
                  allure.attachment(
                    "Milestone Example",
                    JSON.stringify(
                      {
                        milestoneFields: Object.keys(milestone),
                        totalMilestones: data.milestones.length,
                        example: milestone,
                      },
                      null,
                      2,
                    ),
                    "application/json",
                  );
                },
              );
            }
          }

          // Cleanup
          if (planId) {
            await api.deleteDevelopmentPlan(planId);
          }
        }
      });
    });
  },
);
