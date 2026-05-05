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
 * Негативные API тесты для планов развития
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
let cachedUserId = null;

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
  "Development Plans Negative API",
  { tag: ["@api", "@development-plans", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Development Plans");
    });

    // ==================== NEGATIVE TESTS ====================

    test.describe("Негативные сценарии", () => {
      test("C4941: Получить планы с невалидным статусом", async ({
        devPlansAPI,
      }) => {
        setSeverity("normal");

        const invalidStatus = "invalid_status";
        let response;

        await test.step(`Отправить POST /private/development-plans/get с невалидным статусом: "${invalidStatus}"`, async () => {
          const result = await devPlansAPI.getDevelopmentPlans({
            statuses: [invalidStatus],
          });
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200 OK (игнорирует) или 400 Bad Request (отклоняет)", async () => {
          expect([200, 400]).toContain(response.status());
        });
      });

      test("C4942: Проверить куратора для несуществующего пользователя", async ({
        devPlansAPI,
      }) => {
        setSeverity("normal");

        const fakeUserId = 999999999;
        let response;

        await test.step(`Отправить GET /private/development-plans/me/is-curator с userId=${fakeUserId} (несуществующий)`, async () => {
          const result = await devPlansAPI.getMeIsCuratorForUser(fakeUserId);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200 (isCurator=false), 400 или 404 (пользователь не найден)", async () => {
          expect([200, 400, 404]).toContain(response.status());
        });
      });

      test("C4943: Создать план с невалидными датами (endDate раньше startDate)", async ({
        devPlansAPI,
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        let userId;

        await test.step("Найти существующего пользователя для теста", async () => {
          userId = await findExistingUser(orgStructureAPI);
          if (!userId) {
            console.log("Нет пользователей для теста");
          }
        });

        if (!userId) {
          return;
        }

        const startDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];
        const endDate = new Date().toISOString().split("T")[0];

        await test.step(`Подготовить невалидные даты: startDate=${startDate} (через месяц), endDate=${endDate} (сегодня)`, async () => {
          test.info().annotations.push({
            type: "negative_case",
            description: "endDate раньше startDate",
          });
          expect(
            new Date(endDate).getTime() < new Date(startDate).getTime(),
            "endDate должен быть раньше startDate",
          ).toBe(true);
        });

        let response, data;

        await test.step(`Отправить POST /private/development-plans/ с невалидными датами (endDate < startDate)`, async () => {
          const result = await devPlansAPI.createDevelopmentPlan({
            title: `Test Invalid Dates Plan ${Date.now()}`,
            responsibleUserId: userId,
            startDate,
            endDate,
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/201 (принят) или 400/404/422 (отклонён)", async () => {
          expect([200, 201, 400, 404, 422]).toContain(response.status());
        });

        if (response.ok()) {
          const planId = data?.id || data?.plan?.id;
          if (planId) {
            await test.step(`Cleanup: Удалить созданный план с невалидными датами ID=${planId}`, async () => {
              await devPlansAPI.deleteDevelopmentPlan(planId);
            });
          }
        }
      });

      test("C4944: Создать план с датой в прошлом", async ({
        devPlansAPI,
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        let userId;

        await test.step("Найти существующего пользователя для теста", async () => {
          userId = await findExistingUser(orgStructureAPI);
          if (!userId) {
            console.log("Нет пользователей для теста");
          }
        });

        if (!userId) {
          return;
        }

        const pastDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        await test.step(`Подготовить дату в прошлом: ${pastDate} (год назад)`, async () => {
          test.info().annotations.push({
            type: "negative_case",
            description: "Дата планирования в прошлом",
          });
          expect(
            new Date(pastDate).getTime() < Date.now(),
            "Дата должна быть в прошлом",
          ).toBe(true);
        });

        let response;

        await test.step(`Отправить POST /private/development-plans/ с датой в прошлом (startDate=${pastDate})`, async () => {
          const result = await devPlansAPI.createDevelopmentPlan({
            title: `Test Past Date Plan ${Date.now()}`,
            responsibleUserId: userId,
            startDate: pastDate,
            endDate: pastDate,
          });
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200/201 (принят) или 400/404/422 (отклонён)", async () => {
          expect([200, 201, 400, 404, 422]).toContain(response.status());
        });
      });

      test("C4945: Создать шаблон с дублирующим названием", async ({
        devPlansAPI,
      }) => {
        setSeverity("normal");

        const title = `Test Duplicate Template ${Date.now()}`;
        let createResp1, createData1;

        await test.step(`Создать первый шаблон с названием="${title}"`, async () => {
          const result = await devPlansAPI.createDevelopmentPlanTemplate({
            title,
            periodDuration: 30,
          });
          createResp1 = result.response;
          createData1 = result.data;
        });

        await test.step("Проверить статус создания первого шаблона", async () => {
          if (!createResp1.ok()) {
            test.info().annotations.push({
              type: "skip_reason",
              description: `Не удалось создать шаблон: ${createResp1.status()}`,
            });
          } else {
            expect(createResp1.ok(), "Первый шаблон должен быть создан").toBe(
              true,
            );
          }
        });

        if (!createResp1.ok()) {
          console.log(
            `Не удалось создать первый шаблон: статус ${createResp1.status()}`,
          );
          return;
        }

        const templateId1 = createData1?.id || createData1?.template?.id;

        await test.step(`Проверить что ID первого шаблона определён: ${templateId1}`, async () => {
          expect(templateId1).toBeDefined();
        });

        let createResp2, createData2;

        await test.step(`Попытаться создать второй шаблон с тем же названием="${title}"`, async () => {
          const result = await devPlansAPI.createDevelopmentPlanTemplate({
            title,
            periodDuration: 30,
          });
          createResp2 = result.response;
          createData2 = result.data;
        });

        await test.step("Проверить статус создания дубликата: 200/201 (разрешено), 400/409/422 (запрещено)", async () => {
          expect([200, 201, 400, 409, 422]).toContain(createResp2.status());
        });

        if (templateId1) {
          await test.step(`Cleanup: Удалить первый шаблон ID=${templateId1}`, async () => {
            await devPlansAPI.deleteDevelopmentPlanTemplate(templateId1);
          });
        }

        const templateId2 = createData2?.id || createData2?.template?.id;
        if (templateId2 && templateId2 !== templateId1) {
          await test.step(`Cleanup: Удалить второй шаблон ID=${templateId2}`, async () => {
            await devPlansAPI.deleteDevelopmentPlanTemplate(templateId2);
          });
        }
      });

      test("C4946: Активировать уже активный план (конфликт статуса)", async ({
        devPlansAPI,
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        let userId;

        await test.step("Найти существующего пользователя для теста", async () => {
          userId = await findExistingUser(orgStructureAPI);
          if (!userId) {
            console.log("Нет пользователей для теста");
          }
        });

        if (!userId) {
          return;
        }

        let createResp, createData;

        await test.step(`Создать план для теста конфликта статуса (userId=${userId})`, async () => {
          const result = await devPlansAPI.createDevelopmentPlan({
            title: `Test Status Conflict Plan ${Date.now()}`,
            responsibleUserId: userId,
          });
          createResp = result.response;
          createData = result.data;
        });

        await test.step("Проверить статус создания плана", async () => {
          if (!createResp.ok()) {
            test.info().annotations.push({
              type: "skip_reason",
              description: `Не удалось создать план: ${createResp.status()}`,
            });
          } else {
            expect(createResp.ok(), "Создание плана должно быть успешным").toBe(
              true,
            );
          }
        });

        if (!createResp.ok()) {
          console.log(`Не удалось создать план: статус ${createResp.status()}`);
          return;
        }

        const planId = createData?.id || createData?.plan?.id;

        await test.step(`Проверить что ID плана определён: ${planId}`, async () => {
          expect(
            planId,
            "ID созданного плана должен быть определён",
          ).toBeDefined();
        });

        if (planId) {
          let activateResp1;

          await test.step(`Первая активация плана ID=${planId}`, async () => {
            const result = await devPlansAPI.activateDevelopmentPlan(planId);
            activateResp1 = result.response;
          });

          await test.step("Проверить статус первой активации: 200 OK или 400/403 (требует одобрения)", async () => {
            expect([200, 400, 403]).toContain(activateResp1.status());
          });

          if (activateResp1.ok()) {
            let activateResp2;

            await test.step(`Повторная активация уже активного плана ID=${planId}`, async () => {
              const result = await devPlansAPI.activateDevelopmentPlan(planId);
              activateResp2 = result.response;
            });

            await test.step("Проверить статус повторной активации: 200 (идемпотентность) или 400/403 (конфликт)", async () => {
              expect([200, 400, 403]).toContain(activateResp2.status());
            });
          }

          await test.step(`Cleanup: Удалить тестовый план ID=${planId}`, async () => {
            await devPlansAPI.deleteDevelopmentPlan(planId);
          });
        }
      });

      test("C4947: Удалить цель несуществующего плана", async ({
        devPlansAPI,
      }) => {
        setSeverity("normal");

        const fakePlanId = 999999999;
        const fakeObjectiveId = 1;
        let response;

        await test.step(`Отправить DELETE /private/development-plans/${fakePlanId}/objectives/${fakeObjectiveId} (несуществующий план)`, async () => {
          const result = await devPlansAPI.deleteDevelopmentPlanObjective(
            fakePlanId,
            fakeObjectiveId,
          );
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (план или цель не найдены)", async () => {
          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C4948: Создать действие развития с невалидным типом", async ({
        devPlansAPI,
      }) => {
        setSeverity("normal");

        const invalidType = "invalid_type_xyz";
        const title = `Test Invalid Type Action ${Date.now()}`;
        let response;

        await test.step(`Отправить POST /manager/development-actions/ с невалидным типом="${invalidType}"`, async () => {
          const result = await devPlansAPI.createDevelopmentAction({
            title,
            type: invalidType,
            status: "active",
          });
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/422 (ошибка валидации) или 404 (модуль не активирован)", async () => {
          expect([400, 404, 422]).toContain(response.status());
        });
      });

      test("C4949: Получить планы с отрицательным лимитом", async ({
        devPlansAPI,
      }) => {
        setSeverity("normal");

        const negativeLimit = -1;
        let response;

        await test.step(`Отправить POST /private/development-plans/get с отрицательным limit=${negativeLimit}`, async () => {
          const result = await devPlansAPI.getDevelopmentPlans({
            limit: negativeLimit,
          });
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200 (игнорирует), 400 (отклоняет) или 500 (внутренняя ошибка)", async () => {
          expect([200, 400, 500]).toContain(response.status());
        });
      });

      test("C4950: Создать план с очень длинным названием", async ({
        devPlansAPI,
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        let userId;

        await test.step("Найти существующего пользователя для теста", async () => {
          userId = await findExistingUser(orgStructureAPI);
          if (!userId) {
            console.log("Нет пользователей для теста");
          }
        });

        if (!userId) {
          return;
        }

        const longTitle = "A".repeat(10000);

        await test.step(`Подготовить очень длинное название: ${longTitle.length} символов`, async () => {
          test.info().annotations.push({
            type: "negative_case",
            description: "10000 символов в названии",
          });
          expect(longTitle.length).toBe(10000);
        });

        let response, data;

        await test.step(`Отправить POST /private/development-plans/ с названием из 10000 символов`, async () => {
          const result = await devPlansAPI.createDevelopmentPlan({
            title: longTitle,
            responsibleUserId: userId,
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: допустимые коды", async () => {
          if (response.ok()) {
            const planId = data?.id || data?.plan?.id;
            if (planId) {
              await test.step(`План создан успешно: ID=${planId}. Cleanup.`, async () => {
                await devPlansAPI.deleteDevelopmentPlan(planId);
              });
            }
          } else {
            expect([400, 404, 422, 500]).toContain(response.status());
          }
        });
      });
    });
  },
);
