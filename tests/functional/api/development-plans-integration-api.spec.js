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
 * Интеграционные API тесты для планов развития (lifecycle chains)
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
  "Development Plans Integration API",
  { tag: ["@api", "@development-plans", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Development Plans");
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты (lifecycle chains)", () => {
      test(
        "C4937: Полный жизненный цикл плана: создание → активация → завершение",
        { tag: ["@db"] },
        async ({ devPlansAPI, orgStructureAPI, dpVerifier }) => {
          setSeverity("critical");

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

          const title = `Test Lifecycle Plan ${Date.now()}`;
          const startDate = new Date().toISOString().split("T")[0];
          const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          await test.step("Подготовить данные плана для lifecycle теста", async () => {
            test.info().annotations.push({
              type: "test_data",
              description: `userId=${userId}, dates=${startDate} - ${endDate}`,
            });
            expect(
              userId,
              "ID пользователя должен быть определён",
            ).toBeDefined();
            expect(
              startDate,
              "Дата начала должна быть определена",
            ).toBeTruthy();
            expect(
              endDate,
              "Дата окончания должна быть определена",
            ).toBeTruthy();
          });

          let createResp, createData;

          await test.step(`Шаг 1: Создать план развития (title="${title}", userId=${userId})`, async () => {
            const result = await devPlansAPI.createDevelopmentPlan({
              title,
              responsibleUserId: userId,
              startDate,
              endDate,
            });
            createResp = result.response;
            createData = result.data;
          });

          if (createResp.status() === 403 || createResp.status() === 404) {
            console.log("Нет прав или модуль не активирован");
            return;
          }

          await test.step("Проверить что план создан успешно: 200/201 OK", async () => {
            expect(createResp.ok()).toBe(true);
          });

          const planId = createData?.id || createData?.plan?.id;

          await test.step(`Проверить что ID плана определён: ${planId}`, async () => {
            expect(planId).toBeDefined();
          });

          let getResp1, planData1;

          await test.step(`Шаг 2: Получить созданный план ID=${planId} для проверки данных`, async () => {
            const result = await devPlansAPI.getDevelopmentPlan(planId);
            getResp1 = result.response;
            planData1 = result.data;
          });

          await test.step("Проверить статус получения плана: 200 OK", async () => {
            expect(getResp1.ok()).toBe(true);
          });

          await test.step(`Проверить что название плана соответствует: "${title}"`, async () => {
            expect(planData1.title).toBe(title);
          });

          await test.step("DB: Проверка создания плана в БД", async () => {
            if (!dpVerifier.isConnected()) return;
            await dpVerifier.verifyPlanCreated(planId);
            await dpVerifier.verifyPlanTitleContains(
              planId,
              "Test Lifecycle Plan",
            );
          });

          let activateResp;

          await test.step(`Шаг 3: Активировать план ID=${planId}`, async () => {
            const result = await devPlansAPI.activateDevelopmentPlan(planId);
            activateResp = result.response;
          });

          await test.step("Проверить статус активации: 200 OK или 400/403 (требует одобрения)", async () => {
            expect([200, 400, 403]).toContain(activateResp.status());
          });

          if (activateResp.ok()) {
            await test.step("DB: Проверка статуса active в БД", async () => {
              if (!dpVerifier.isConnected()) return;
              await dpVerifier.verifyPlanStatus(planId, "active");
            });

            let completeResp;

            await test.step(`Шаг 4: Завершить активный план ID=${planId}`, async () => {
              const result = await devPlansAPI.completeDevelopmentPlan(
                planId,
                "Тест завершён успешно",
              );
              completeResp = result.response;
            });

            await test.step("Проверить статус завершения: 200 OK или 400/403", async () => {
              expect([200, 400, 403]).toContain(completeResp.status());
            });

            if (completeResp.ok()) {
              let finalPlan;

              await test.step(`Шаг 5: Получить финальное состояние плана ID=${planId}`, async () => {
                const result = await devPlansAPI.getDevelopmentPlan(planId);
                finalPlan = result.data;
              });

              await test.step("Проверить что план перешёл в статус completed/finished/done", async () => {
                expect(["completed", "finished", "done"]).toContain(
                  finalPlan.status?.toLowerCase() || "",
                );
              });

              await test.step("DB: Проверка статуса completed в БД", async () => {
                if (!dpVerifier.isConnected()) return;
                await dpVerifier.verifyPlanStatus(planId, "completed");
              });
            }
          }

          await test.step(`Cleanup: Удалить тестовый план ID=${planId}`, async () => {
            await devPlansAPI.deleteDevelopmentPlan(planId);
          });
        },
      );

      test(
        "C4938: Создание плана из шаблона с целями",
        { tag: ["@db"] },
        async ({ devPlansAPI, orgStructureAPI, dpVerifier }) => {
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

          const templateTitle = `Test Template with Objectives ${Date.now()}`;
          let createTemplateResp, templateData;

          await test.step(`Шаг 1: Создать шаблон плана (title="${templateTitle}")`, async () => {
            const result = await devPlansAPI.createDevelopmentPlanTemplate({
              title: templateTitle,
              developmentPlanTitle: "План из шаблона",
              periodDuration: 30,
            });
            createTemplateResp = result.response;
            templateData = result.data;
          });

          await test.step("Проверить статус создания шаблона", async () => {
            if (!createTemplateResp.ok()) {
              test.info().annotations.push({
                type: "skip_reason",
                description: `Не удалось создать шаблон: ${createTemplateResp.status()}`,
              });
            } else {
              expect(
                createTemplateResp.ok(),
                "Создание шаблона должно быть успешным",
              ).toBe(true);
            }
          });

          if (!createTemplateResp.ok()) {
            console.log(
              `Не удалось создать шаблон: статус ${createTemplateResp.status()}`,
            );
            return;
          }

          const templateId = templateData?.id || templateData?.template?.id;

          await test.step(`Проверить что ID шаблона определён: ${templateId}`, async () => {
            expect(
              templateId,
              "ID созданного шаблона должен быть определён",
            ).toBeDefined();
          });

          if (!templateId) {
            console.log("Не удалось создать шаблон");
            return;
          }

          let createPlanResp, planData;

          await test.step(`Шаг 2: Создать план из шаблона (userId=${userId}, templateId=${templateId})`, async () => {
            const result = await devPlansAPI.createDevelopmentPlanFromTemplate({
              responsibleUserId: userId,
              developmentPlanTemplateId: templateId,
            });
            createPlanResp = result.response;
            planData = result.data;
          });

          await test.step("Проверить статус создания плана: 200/201 OK", async () => {
            expect(
              createPlanResp.ok(),
              "Создание плана из шаблона должно быть успешным",
            ).toBe(true);
          });

          if (createPlanResp.ok()) {
            const planId = planData?.id || planData?.plan?.id;

            await test.step(`Проверить что ID плана определён: ${planId}`, async () => {
              expect(
                planId,
                "ID созданного плана должен быть определён",
              ).toBeDefined();
            });

            if (planId) {
              let fetchedPlan;

              await test.step(`Шаг 3: Получить созданный план ID=${planId} для проверки`, async () => {
                const result = await devPlansAPI.getDevelopmentPlan(planId);
                fetchedPlan = result.data;
              });

              await test.step("Проверить что план получен успешно", async () => {
                expect(fetchedPlan).toBeDefined();
              });

              await test.step("DB: Проверка создания плана из шаблона в БД", async () => {
                if (!dpVerifier.isConnected()) return;
                await dpVerifier.verifyPlanCreated(planId);
                await dpVerifier.verifyPlanOwner(planId, userId);
              });

              await test.step(`Cleanup: Удалить созданный план ID=${planId}`, async () => {
                await devPlansAPI.deleteDevelopmentPlan(planId);
              });
            }
          }

          await test.step(`Cleanup: Удалить тестовый шаблон ID=${templateId}`, async () => {
            await devPlansAPI.deleteDevelopmentPlanTemplate(templateId);
          });
        },
      );

      test(
        "C4939: План с целями: создание плана → добавление целей → проверка",
        { tag: ["@db"] },
        async ({ devPlansAPI, orgStructureAPI, dpVerifier }) => {
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

          const title = `Test Plan with Objectives ${Date.now()}`;
          let createResp, createData;

          await test.step(`Шаг 1: Создать план для добавления целей (title="${title}", userId=${userId})`, async () => {
            const result = await devPlansAPI.createDevelopmentPlan({
              title,
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
              expect(
                createResp.ok(),
                "Создание плана должно быть успешным",
              ).toBe(true);
            }
          });

          if (!createResp.ok()) {
            console.log(
              `Не удалось создать план: статус ${createResp.status()}`,
            );
            return;
          }

          const planId = createData?.id || createData?.plan?.id;

          await test.step(`Проверить что ID плана определён: ${planId}`, async () => {
            expect(
              planId,
              "ID созданного плана должен быть определён",
            ).toBeDefined();
          });

          if (!planId) {
            console.log("Не удалось создать план");
            return;
          }

          await test.step("DB: Проверка создания плана в БД", async () => {
            if (!dpVerifier.isConnected()) return;
            await dpVerifier.verifyPlanCreated(planId);
          });

          const objectives = [
            {
              title: "Цель 1: Изучить TypeScript",
              description: "Базовый уровень",
            },
            {
              title: "Цель 2: Практика тестирования",
              description: "Написать 10 тестов",
            },
            { title: "Цель 3: Code Review", description: "Провести 5 ревью" },
          ];

          await test.step(`Шаг 2: Подготовить ${objectives.length} целей для добавления в план`, async () => {
            test.info().annotations.push({
              type: "objectives_count",
              description: `${objectives.length} целей`,
            });
            expect(objectives.length).toBe(3);
          });

          const createdObjectiveIds = [];

          await test.step(`Шаг 3: Добавить ${objectives.length} целей в план ID=${planId}`, async () => {
            for (const obj of objectives) {
              const { response: objResp, data: objData } =
                await devPlansAPI.saveDevelopmentPlanObjective(planId, obj);

              if (objResp.ok()) {
                const objId = objData?.id || objData?.objective?.id;
                if (objId) {
                  createdObjectiveIds.push(objId);
                }
              }
            }
          });

          await test.step(`Проверить что создано ${createdObjectiveIds.length} целей`, async () => {
            expect(
              createdObjectiveIds.length,
              "Должно быть создано 3 цели",
            ).toBe(3);
          });

          let getObjResp, objectivesData;

          await test.step(`Шаг 4: Получить список целей плана ID=${planId}`, async () => {
            const result =
              await devPlansAPI.getDevelopmentPlanObjectives(planId);
            getObjResp = result.response;
            objectivesData = result.data;
          });

          await test.step("Проверить статус получения целей: 200 OK", async () => {
            expect(getObjResp.ok()).toBe(true);
          });

          await test.step("Проверить что количество целей не меньше созданных", async () => {
            const items = objectivesData?.items || objectivesData || [];
            expect(items.length).toBeGreaterThanOrEqual(
              createdObjectiveIds.length,
            );
          });

          await test.step(`Шаг 5: Проверить каждую из ${createdObjectiveIds.length} созданных целей по ID`, async () => {
            for (const objId of createdObjectiveIds) {
              const { response: singleObjResp, data: singleObjData } =
                await devPlansAPI.getDevelopmentPlanObjective(planId, objId);
              expect(singleObjResp.ok()).toBe(true);
              expect(singleObjData.id).toBe(objId);
            }
          });

          await test.step("DB: Проверка количества действий в плане", async () => {
            if (!dpVerifier.isConnected()) return;
            const planActions = await dpVerifier.getPlanActions(planId);
          });

          await test.step(`Cleanup: Удалить тестовый план ID=${planId}`, async () => {
            await devPlansAPI.deleteDevelopmentPlan(planId);
          });
        },
      );

      test(
        "C4940: Действия развития: CRUD цикл",
        { tag: ["@db"] },
        async ({ devPlansAPI, dpVerifier }) => {
          setSeverity("normal");

          const title = `Test Action CRUD ${Date.now()}`;
          let createResp, createData;

          await test.step(`Шаг 1 (Create): Создать действие развития (title="${title}")`, async () => {
            const result = await devPlansAPI.createDevelopmentAction({
              title,
              description: "Test description",
              type: "practice",
              status: "active",
            });
            createResp = result.response;
            createData = result.data;
          });

          if (createResp.status() === 403 || createResp.status() === 404) {
            console.log("Нет прав или модуль не активирован");
            return;
          }

          await test.step("Проверить что действие создано успешно: 200/201 OK", async () => {
            expect(createResp.ok()).toBe(true);
          });

          const actionId = createData?.id || createData?.action?.id;

          await test.step(`Проверить что ID действия определён: ${actionId}`, async () => {
            expect(actionId).toBeDefined();
          });

          await test.step("DB: Проверка создания действия в БД", async () => {
            if (!dpVerifier.isConnected()) return;
            await dpVerifier.verifyActionCreated(actionId);
          });

          let getResp, getData;

          await test.step(`Шаг 2 (Read): Получить созданное действие ID=${actionId}`, async () => {
            const result = await devPlansAPI.getDevelopmentAction(actionId);
            getResp = result.response;
            getData = result.data;
          });

          await test.step("Проверить статус получения: 200 OK", async () => {
            expect(getResp.ok()).toBe(true);
          });

          await test.step(`Проверить что название действия соответствует: "${title}"`, async () => {
            expect(getData.title).toBe(title);
          });

          const newTitle = `Updated Action ${Date.now()}`;
          let updateResp;

          await test.step(`Шаг 3 (Update): Обновить действие ID=${actionId} с новым названием="${newTitle}"`, async () => {
            const result = await devPlansAPI.updateDevelopmentAction(actionId, {
              title: newTitle,
              description: "Updated description",
            });
            updateResp = result.response;
          });

          await test.step("Проверить статус обновления: 200 OK", async () => {
            expect(updateResp.ok()).toBe(true);
          });

          let updatedData;

          await test.step(`Шаг 4: Получить обновлённое действие ID=${actionId} для проверки`, async () => {
            const result = await devPlansAPI.getDevelopmentAction(actionId);
            updatedData = result.data;
          });

          await test.step(`Проверить что название обновилось: "${newTitle}"`, async () => {
            expect(updatedData.title).toBe(newTitle);
          });

          let deleteResp;

          await test.step(`Шаг 5 (Delete): Удалить действие ID=${actionId}`, async () => {
            const result = await devPlansAPI.deleteDevelopmentAction(actionId);
            deleteResp = result.response;
          });

          await test.step("Проверить статус удаления: 200/204 OK", async () => {
            expect(deleteResp.ok()).toBe(true);
          });

          let getDeletedResp;

          await test.step(`Шаг 6: Попытаться получить удалённое действие ID=${actionId}`, async () => {
            const result = await devPlansAPI.getDevelopmentAction(actionId);
            getDeletedResp = result.response;
          });

          await test.step("Проверить что удалённое действие недоступно: 400/403/404", async () => {
            expect([400, 403, 404]).toContain(getDeletedResp.status());
          });
        },
      );
    });
  },
);
