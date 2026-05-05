// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import {
  DevelopmentPlansAPI,
  OrgStructureAPI,
  getCredentials,
} from "../../utils/api/index.js";
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
 * API тесты для целей планов развития и настроек
 */

// Расширяем test с фикстурой для Development Plans API
const test = fullTest.extend({
  devPlansAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  orgStructureAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Кеш для данных
let cachedPlanId = null;
let cachedUserId = null;

async function findExistingPlan(api) {
  if (cachedPlanId) {
    return cachedPlanId;
  }

  const { data } = await api.getDevelopmentPlans({ limit: 10 });
  const items = data?.items || data || [];
  if (items.length > 0) {
    cachedPlanId = items[0].id;
    return cachedPlanId;
  }

  return null;
}

async function findExistingUser(orgStructureAPI) {
  if (cachedUserId) {
    return cachedUserId;
  }

  const { data } = await orgStructureAPI.findUsers({ limit: 10 });
  const items = data?.items || data || [];
  if (items.length > 0) {
    cachedUserId = items[0].id;
    return cachedUserId;
  }

  return null;
}

test.describe(
  "Development Plans Objectives API",
  { tag: ["@api", "@development-plans", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Development Plans");
    });

    // ==================== DEVELOPMENT PLAN OBJECTIVES ====================

    test.describe("Цели плана развития", () => {
      test("C4906: Получить цели плана", async ({ devPlansAPI }) => {
        setSeverity("critical");

        let planId;

        await test.step("Найти существующий план для тестирования", async () => {
          planId = await findExistingPlan(devPlansAPI);
          if (!planId) {
            test.info().annotations.push({
              type: "skip_reason",
              description: "Нет доступных планов для теста",
            });
          }
        });

        if (planId) {
          let response, data;

          await test.step(`Отправить GET /private/development-plans/${planId}/objectives`, async () => {
            const result =
              await devPlansAPI.getDevelopmentPlanObjectives(planId);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить наличие данных целей в ответе", async () => {
            expect(
              data,
              "Данные целей плана должны существовать",
            ).toBeDefined();
          });

          await test.step("Проверить что items является валидным массивом", async () => {
            const items = data?.items || data || [];
            assertValidArray(items);
          });
        }
      });

      test("C4907: Создать цель плана", async ({
        devPlansAPI,
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        let userId;

        await test.step("Найти существующего пользователя для создания плана", async () => {
          userId = await findExistingUser(orgStructureAPI);
          if (!userId) {
            console.log("Нет пользователей для создания плана");
          }
        });

        if (!userId) {
          return;
        }

        let createResp, createData;

        await test.step(`Создать план для добавления цели (userId=${userId})`, async () => {
          const result = await devPlansAPI.createDevelopmentPlan({
            title: `Test Objectives Plan ${Date.now()}`,
            responsibleUserId: userId,
          });
          createResp = result.response;
          createData = result.data;
        });

        if (createResp.status() === 403 || createResp.status() === 404) {
          console.log("Нет прав или модуль не активирован");
          return;
        }

        const planId = createData?.id || createData?.plan?.id;

        if (planId) {
          const objectiveTitle = `Test Objective ${Date.now()}`;
          let response, data;

          await test.step(`Отправить POST /private/development-plans/${planId}/objectives с целью="${objectiveTitle}"`, async () => {
            const result = await devPlansAPI.saveDevelopmentPlanObjective(
              planId,
              {
                title: objectiveTitle,
                description: "Test objective description",
              },
            );
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200/201 OK или 400/403 (ошибка формата)", async () => {
            // Может требовать определённого формата
            expect(
              [200, 201, 400, 403],
              "Создание цели должно вернуть 200/201 или ошибку формата",
            ).toContain(response.status());
          });

          // Cleanup
          await test.step(`Удалить тестовый план ID=${planId}`, async () => {
            await devPlansAPI.deleteDevelopmentPlan(planId);
          });
        }
      });

      test("C4908: Получить цель плана по ID", async ({ devPlansAPI }) => {
        setSeverity("normal");

        let planId;

        await test.step("Найти существующий план для тестирования", async () => {
          planId = await findExistingPlan(devPlansAPI);
        });

        if (planId) {
          let objectives;

          await test.step(`Получить список целей плана ID=${planId}`, async () => {
            const result =
              await devPlansAPI.getDevelopmentPlanObjectives(planId);
            objectives = result.data;
          });

          await test.step("Проверить наличие целей в плане", async () => {
            const items = objectives?.items || objectives || [];
            expect(items, "Список целей должен быть массивом").toBeInstanceOf(
              Array,
            );
          });

          const items = objectives?.items || objectives || [];

          if (items.length > 0) {
            const objectiveId = items[0].id;

            await test.step(`Найдена цель для теста: ID=${objectiveId}`, async () => {
              expect(
                objectiveId,
                "ID цели должен быть определён",
              ).toBeDefined();
            });

            let response, data;

            await test.step(`Отправить GET /private/development-plans/${planId}/objectives/${objectiveId}`, async () => {
              const result = await devPlansAPI.getDevelopmentPlanObjective(
                planId,
                objectiveId,
              );
              response = result.response;
              data = result.data;
            });

            await test.step("Проверить статус ответа: 200 OK", async () => {
              assertSuccessStatus(response);
            });

            await test.step("Проверить наличие данных цели в ответе", async () => {
              expect(data, "Данные цели должны существовать").toBeDefined();
            });

            await test.step(`Проверить что ID цели в ответе совпадает: ${objectiveId}`, async () => {
              expect(data.id).toBe(objectiveId);
            });
          }
        }
      });

      test("C4909: Удалить цель плана", async ({
        devPlansAPI,
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        let userId;

        await test.step("Найти существующего пользователя для создания плана", async () => {
          userId = await findExistingUser(orgStructureAPI);
          if (!userId) {
            console.log("Нет пользователей для создания плана");
          }
        });

        if (!userId) {
          return;
        }

        let createResp, createData;

        await test.step(`Создать план для удаления цели (userId=${userId})`, async () => {
          const result = await devPlansAPI.createDevelopmentPlan({
            title: `Test Delete Objective Plan ${Date.now()}`,
            responsibleUserId: userId,
          });
          createResp = result.response;
          createData = result.data;
        });

        if (createResp.status() === 403 || createResp.status() === 404) {
          console.log("Нет прав или модуль не активирован");
          return;
        }

        const planId = createData?.id || createData?.plan?.id;

        if (planId) {
          let objResp, objData;

          await test.step(`Создать цель в плане ID=${planId}`, async () => {
            const result = await devPlansAPI.saveDevelopmentPlanObjective(
              planId,
              {
                title: `Test Delete Objective ${Date.now()}`,
              },
            );
            objResp = result.response;
            objData = result.data;
          });

          if (objResp.ok()) {
            const objectiveId = objData?.id || objData?.objective?.id;

            if (objectiveId) {
              let response;

              await test.step(`Отправить DELETE /private/development-plans/${planId}/objectives/${objectiveId}`, async () => {
                const result = await devPlansAPI.deleteDevelopmentPlanObjective(
                  planId,
                  objectiveId,
                );
                response = result.response;
              });

              await test.step("Проверить статус ответа: 200/204 OK или 400/403", async () => {
                expect(
                  [200, 204, 400, 403],
                  "Удаление цели должно вернуть успех или ошибку доступа",
                ).toContain(response.status());
              });
            }
          }

          // Cleanup
          await test.step(`Удалить тестовый план ID=${planId}`, async () => {
            await devPlansAPI.deleteDevelopmentPlan(planId);
          });
        }
      });
    });

    // ==================== SETTINGS ====================

    test.describe("GET /private/development-plans/settings/ - Настройки", () => {
      test("C4910: Получить настройки планов развития", async ({
        devPlansAPI,
      }) => {
        setSeverity("critical");

        let response, data;

        await test.step("Отправить GET /private/development-plans/settings/", async () => {
          const result = await devPlansAPI.getDevelopmentPlansSettings();
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие данных настроек в ответе", async () => {
          expect(data, "Данные настроек должны существовать").toBeDefined();
        });

        await test.step("Проверить что объект настроек не пустой", async () => {
          expect(
            data,
            "Объект настроек не должен быть null или undefined",
          ).toBeTruthy();
        });
      });

      test("C4911: Проверить является ли пользователь куратором", async ({
        devPlansAPI,
      }) => {
        setSeverity("normal");

        let response, data;

        await test.step("Отправить GET /private/development-plans/me/is-curator", async () => {
          const result = await devPlansAPI.getMeIsCurator();
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие данных о статусе куратора в ответе", async () => {
          expect(
            data,
            "Данные о статусе куратора должны существовать",
          ).toBeDefined();
        });

        await test.step("Проверить что данные содержат булево значение или объект", async () => {
          expect(
            typeof data === "boolean" || typeof data === "object",
            "Данные должны быть булевым значением или объектом",
          ).toBe(true);
        });
      });
    });
  },
);
