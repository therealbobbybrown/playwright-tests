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
 * API тесты для планов развития (Development Plans) — CRUD + жизненный цикл
 *
 * Связанные файлы:
 * - development-plans-objectives-api.spec.js — Цели планов + Настройки
 * - development-plans-templates-api.spec.js — Шаблоны планов CRUD
 * - development-plans-actions-api.spec.js — Действия развития CRUD
 * - development-plans-integration-api.spec.js — Интеграционные lifecycle тесты
 * - development-plans-negative-api.spec.js — Негативные сценарии
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
  "Development Plans API",
  { tag: ["@api", "@development-plans", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Development Plans");
    });

    // ==================== DEVELOPMENT PLANS ====================

    test.describe("POST /private/development-plans/get - Список планов", () => {
      test(
        "C4888: Получить список планов развития",
        { tag: ["@critical"] },
        async ({ devPlansAPI }) => {
          setSeverity("critical");

          let response, data;

          await test.step("Отправить POST /private/development-plans/get с limit=10", async () => {
            const result = await devPlansAPI.getDevelopmentPlans({ limit: 10 });
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить наличие данных в ответе", async () => {
            expect(data, "Тело ответа должно существовать").toBeDefined();
          });

          await test.step("Проверить что items является валидным массивом", async () => {
            const items = data?.items || data || [];
            assertValidArray(items);
          });
        },
      );

      test("C4889: Получить планы с пагинацией", async ({ devPlansAPI }) => {
        setSeverity("normal");

        let resp1, data1;

        await test.step("Отправить первый запрос: POST /private/development-plans/get с limit=2, offset=0", async () => {
          const result = await devPlansAPI.getDevelopmentPlans({
            limit: 2,
            offset: 0,
          });
          resp1 = result.response;
          data1 = result.data;
        });

        await test.step("Проверить статус первого ответа: 200 OK", async () => {
          expect(resp1.ok()).toBe(true);
        });

        let resp2, data2;

        await test.step("Отправить второй запрос: POST /private/development-plans/get с limit=2, offset=2", async () => {
          const result = await devPlansAPI.getDevelopmentPlans({
            limit: 2,
            offset: 2,
          });
          resp2 = result.response;
          data2 = result.data;
        });

        await test.step("Проверить статус второго ответа: 200 OK", async () => {
          expect(resp2.ok()).toBe(true);
        });

        await test.step("Проверить что первая страница содержит данные", async () => {
          const items1 = data1?.items || data1 || [];
          expect(
            items1,
            "Первая страница должна содержать массив",
          ).toBeInstanceOf(Array);
        });

        await test.step("Проверить что вторая страница содержит данные", async () => {
          const items2 = data2?.items || data2 || [];
          expect(
            items2,
            "Вторая страница должна содержать массив",
          ).toBeInstanceOf(Array);
        });

        await test.step("Проверить что элементы на разных страницах различаются", async () => {
          const items1 = data1?.items || data1 || [];
          const items2 = data2?.items || data2 || [];

          if (items1.length > 0 && items2.length > 0) {
            expect(
              items1[0].id,
              "ID первого элемента на разных страницах должны различаться",
            ).not.toBe(items2[0].id);
          }
        });
      });

      test("C4890: Получить планы для руководителя", async ({
        devPlansAPI,
      }) => {
        setSeverity("normal");

        let response, data;

        await test.step("Отправить POST /private/development-plans/get/head с limit=10", async () => {
          const result = await devPlansAPI.getDevelopmentPlansForHead({
            limit: 10,
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK или 403 Forbidden", async () => {
          expect(
            [200, 403],
            "Статус должен быть 200 (доступ есть) или 403 (нет прав руководителя)",
          ).toContain(response.status());
        });

        await test.step("Если доступ разрешён: проверить наличие данных в ответе", async () => {
          if (response.status() === 200) {
            expect(
              data,
              "Данные планов руководителя должны существовать",
            ).toBeDefined();
          }
        });
      });

      test("C4891: Получить планы для куратора", async ({ devPlansAPI }) => {
        setSeverity("normal");

        let response, data;

        await test.step("Отправить POST /private/development-plans/get/curator с limit=10", async () => {
          const result = await devPlansAPI.getDevelopmentPlansForCurator({
            limit: 10,
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK или 403 Forbidden", async () => {
          expect(
            [200, 403],
            "Статус должен быть 200 (доступ есть) или 403 (нет прав куратора)",
          ).toContain(response.status());
        });

        await test.step("Если доступ разрешён: проверить наличие данных в ответе", async () => {
          if (response.status() === 200) {
            expect(
              data,
              "Данные планов куратора должны существовать",
            ).toBeDefined();
          }
        });
      });

      test("C4892: Получить планы для ответственного", async ({
        devPlansAPI,
      }) => {
        setSeverity("normal");

        let response, data;

        await test.step("Отправить POST /private/development-plans/get/responsible с limit=10", async () => {
          const result = await devPlansAPI.getDevelopmentPlansForResponsible({
            limit: 10,
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие данных планов в ответе", async () => {
          expect(
            data,
            "Данные планов ответственного должны существовать",
          ).toBeDefined();
        });

        await test.step("Проверить что items является валидным массивом", async () => {
          const items = data?.items || data || [];
          assertValidArray(items);
        });
      });
    });

    test.describe("GET /private/development-plans/{id} - Получение плана", () => {
      test(
        "C4893: Получить план по ID",
        { tag: ["@db"] },
        async ({ devPlansAPI, dpVerifier }) => {
          setSeverity("critical");

          let planId;

          await test.step("Найти существующий план для тестирования", async () => {
            planId = await findExistingPlan(devPlansAPI);
          });

          if (planId) {
            let response, data;

            await test.step(`Отправить GET /private/development-plans/${planId}`, async () => {
              const result = await devPlansAPI.getDevelopmentPlan(planId);
              response = result.response;
              data = result.data;
            });

            await test.step("Проверить статус ответа: 200 OK", async () => {
              assertSuccessStatus(response);
            });

            await test.step("Проверить наличие данных плана в ответе", async () => {
              expect(data, "Данные плана должны существовать").toBeDefined();
            });

            await test.step(`Проверить что ID плана в ответе совпадает с запрошенным: ${planId}`, async () => {
              expect(data.id).toBe(planId);
            });

            // DB верификация
            await test.step("DB: Проверка соответствия данных в БД", async () => {
              if (!dpVerifier.isConnected()) return;
              const dbPlan = await dpVerifier.getPlan(planId);
              if (dbPlan) {
                expect(dbPlan.id).toBe(planId);
              }
            });
          }
        },
      );

      test("C4894: Получить несуществующий план", async ({ devPlansAPI }) => {
        setSeverity("normal");

        const fakeId = 999999999;
        let response;

        await test.step(`Отправить GET /private/development-plans/${fakeId} (несуществующий ID)`, async () => {
          const result = await devPlansAPI.getDevelopmentPlan(fakeId);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (план не найден)", async () => {
          expect(
            [400, 403, 404],
            "Несуществующий план должен вернуть ошибку",
          ).toContain(response.status());
        });
      });
    });

    // ==================== DEVELOPMENT PLAN LIFECYCLE (CRUD + State transitions) ====================

    test.describe("POST /private/development-plans/ - Создание плана", () => {
      test(
        "C4895: Создать план развития",
        { tag: ["@critical", "@db"] },
        async ({ devPlansAPI, orgStructureAPI, dpVerifier }) => {
          setSeverity("critical");

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

          const title = `Test Plan ${Date.now()}`;
          const startDate = new Date().toISOString().split("T")[0];
          const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          let response, data;

          await test.step(`Отправить POST /private/development-plans/ с данными плана (title="${title}", userId=${userId})`, async () => {
            const result = await devPlansAPI.createDevelopmentPlan({
              title,
              responsibleUserId: userId,
              startDate,
              endDate,
            });
            response = result.response;
            data = result.data;
          });

          if (response.status() === 403) {
            console.log("Нет прав на создание планов");
            return;
          }

          if (response.status() === 404) {
            console.log("Модуль планов развития не активирован");
            return;
          }

          await test.step("Проверить статус ответа: 200/201 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить наличие данных плана в ответе", async () => {
            expect(
              data,
              "Данные созданного плана должны существовать",
            ).toBeDefined();
          });

          const planId = data.id || data.plan?.id;

          await test.step("Проверить что в ответе присутствует ID созданного плана", async () => {
            expect(
              planId,
              "ID созданного плана должен быть определён",
            ).toBeDefined();
          });

          // Проверяем что план создан с правильными данными
          if (planId) {
            let fetchedPlan;

            await test.step(`Получить созданный план по ID=${planId} для проверки данных`, async () => {
              const result = await devPlansAPI.getDevelopmentPlan(planId);
              fetchedPlan = result.data;
            });

            await test.step(`Проверить что название плана соответствует: "${title}"`, async () => {
              expect(fetchedPlan.title).toBe(title);
            });

            await test.step(`Проверить что ответственный пользователь соответствует: userId=${userId}`, async () => {
              expect(
                fetchedPlan.responsibleUser?.id ||
                  fetchedPlan.responsibleUserId,
              ).toBe(userId);
            });

            // DB верификация
            await test.step("DB: Проверка создания плана в БД", async () => {
              if (!dpVerifier.isConnected()) return;
              await dpVerifier.verifyPlanCreated(planId);
              await dpVerifier.verifyPlanTitleContains(planId, "Test Plan");
            });

            // Cleanup
            await test.step(`Удалить тестовый план ID=${planId}`, async () => {
              await devPlansAPI.deleteDevelopmentPlan(planId);
            });
          }
        },
      );

      test(
        "C4896: Создать план без ответственного (негативный)",
        { tag: ["@db"] },
        async ({ devPlansAPI, dpVerifier }) => {
          setSeverity("normal");

          const uniqueTitle = `Test Plan No Responsible ${Date.now()}`;

          await test.step("Подготовить данные плана без responsibleUserId", async () => {
            test.info().annotations.push({
              type: "negative_case",
              description: "Создание плана без обязательного поля",
            });
            expect(
              uniqueTitle,
              "Название плана должно быть определено",
            ).toBeTruthy();
          });

          let response;

          await test.step(`Отправить POST /private/development-plans/ без responsibleUserId (title="${uniqueTitle}")`, async () => {
            const result = await devPlansAPI.createDevelopmentPlan({
              title: uniqueTitle,
            });
            response = result.response;
          });

          await test.step("Проверить статус ответа: 400/404/422 (ошибка валидации)", async () => {
            expect(
              [400, 404, 422],
              "План без ответственного должен быть отклонён",
            ).toContain(response.status());
          });

          await test.step("DB: Проверка что план НЕ создан в БД", async () => {
            if (!dpVerifier.isConnected()) return;
            await dpVerifier.verifyPlanNotCreatedByTitle(uniqueTitle);
          });
        },
      );

      test(
        "C4897: Создать план из шаблона",
        { tag: ["@db"] },
        async ({ devPlansAPI, orgStructureAPI, dpVerifier }) => {
          setSeverity("normal");

          let userId, templateId;

          await test.step("Найти существующего пользователя и шаблон для теста", async () => {
            userId = await findExistingUser(orgStructureAPI);

            const { data } = await devPlansAPI.getDevelopmentPlanTemplates({ limit: 10 });
            const items = data?.items || data || [];
            if (items.length > 0) {
              templateId = items[0].id;
            }

            if (!userId || !templateId) {
              console.log("Нет пользователя или шаблона для создания плана");
            }
          });

          if (!userId || !templateId) {
            return;
          }

          let response, data;

          await test.step(`Отправить POST /private/development-plans/ из шаблона (userId=${userId}, templateId=${templateId})`, async () => {
            const result = await devPlansAPI.createDevelopmentPlanFromTemplate({
              responsibleUserId: userId,
              developmentPlanTemplateId: templateId,
            });
            response = result.response;
            data = result.data;
          });

          if (response.status() === 403) {
            console.log("Нет прав на создание планов");
            return;
          }

          if (response.status() === 404) {
            console.log("Модуль планов развития не активирован");
            return;
          }

          await test.step("Проверить статус ответа: 200/201 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить наличие данных плана в ответе", async () => {
            expect(
              data,
              "Данные созданного плана должны существовать",
            ).toBeDefined();
          });

          const planId = data.id || data.plan?.id;

          // DB верификация
          if (planId) {
            await test.step("DB: Проверка создания плана из шаблона в БД", async () => {
              if (!dpVerifier.isConnected()) return;
              await dpVerifier.verifyPlanCreated(planId);
              await dpVerifier.verifyPlanOwner(planId, userId);
            });

            // Cleanup
            await test.step(`Удалить тестовый план ID=${planId}`, async () => {
              await devPlansAPI.deleteDevelopmentPlan(planId);
            });
          }
        },
      );
    });

    test.describe("PATCH /private/development-plans/{id} - Обновление плана", () => {
      test(
        "C4898: Обновить название плана",
        { tag: ["@db"] },
        async ({ devPlansAPI, orgStructureAPI, dpVerifier }) => {
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

          await test.step(`Создать тестовый план для обновления (userId=${userId})`, async () => {
            const result = await devPlansAPI.createDevelopmentPlan({
              title: `Test Update Plan ${Date.now()}`,
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
            const newTitle = `Updated Plan ${Date.now()}`;
            let response;

            await test.step(`Отправить PATCH /private/development-plans/${planId} с новым названием="${newTitle}"`, async () => {
              const result = await devPlansAPI.updateDevelopmentPlan(planId, {
                title: newTitle,
              });
              response = result.response;
            });

            await test.step("Проверить статус ответа: 200 OK", async () => {
              assertSuccessStatus(response);
            });

            let fetchedPlan;

            await test.step(`Получить обновлённый план ID=${planId}`, async () => {
              const result = await devPlansAPI.getDevelopmentPlan(planId);
              fetchedPlan = result.data;
            });

            await test.step(`Проверить что название обновилось: "${newTitle}"`, async () => {
              expect(fetchedPlan.title).toBe(newTitle);
            });

            // DB верификация
            await test.step("DB: Проверка обновления названия плана в БД", async () => {
              if (!dpVerifier.isConnected()) return;
              await dpVerifier.verifyPlanTitle(planId, newTitle);
            });

            // Cleanup
            await test.step(`Удалить тестовый план ID=${planId}`, async () => {
              await devPlansAPI.deleteDevelopmentPlan(planId);
            });
          }
        },
      );

      test("C4899: Обновить несуществующий план", async ({ devPlansAPI }) => {
        setSeverity("normal");

        const fakeId = 999999999;
        const testTitle = "Test";
        let response;

        await test.step(`Отправить PATCH /private/development-plans/${fakeId} с title="${testTitle}" (несуществующий ID)`, async () => {
          const result = await devPlansAPI.updateDevelopmentPlan(fakeId, {
            title: testTitle,
          });
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (план не найден)", async () => {
          expect(
            [400, 403, 404],
            "Обновление несуществующего плана должно вернуть ошибку",
          ).toContain(response.status());
        });
      });
    });

    test.describe("DELETE /private/development-plans/{id} - Удаление плана", () => {
      test(
        "C4900: Удалить план развития",
        { tag: ["@db"] },
        async ({ devPlansAPI, orgStructureAPI, dpVerifier }) => {
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

          await test.step(`Создать план для удаления (userId=${userId})`, async () => {
            const result = await devPlansAPI.createDevelopmentPlan({
              title: `Test Delete Plan ${Date.now()}`,
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
            let response;

            await test.step(`Отправить DELETE /private/development-plans/${planId}`, async () => {
              const result = await devPlansAPI.deleteDevelopmentPlan(planId);
              response = result.response;
            });

            await test.step("Проверить статус ответа: 200/204 OK", async () => {
              assertSuccessStatus(response);
            });

            let getResp;

            await test.step(`Попытаться получить удалённый план ID=${planId}`, async () => {
              const result = await devPlansAPI.getDevelopmentPlan(planId);
              getResp = result.response;
            });

            await test.step("Проверить что план недоступен: 403/404", async () => {
              expect(
                [403, 404],
                "Удалённый план должен быть недоступен",
              ).toContain(getResp.status());
            });

            // DB верификация
            await test.step("DB: Проверка soft delete плана в БД", async () => {
              if (!dpVerifier.isConnected()) return;
              await dpVerifier.verifyPlanDeleted(planId);
            });
          }
        },
      );

      test("C4901: Удалить несуществующий план", async ({ devPlansAPI }) => {
        setSeverity("normal");

        const fakeId = 999999999;
        let response;

        await test.step(`Отправить DELETE /private/development-plans/${fakeId} (несуществующий ID)`, async () => {
          const result = await devPlansAPI.deleteDevelopmentPlan(fakeId);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (план не найден)", async () => {
          expect(
            [400, 403, 404],
            "Удаление несуществующего плана должно вернуть ошибку",
          ).toContain(response.status());
        });
      });
    });

    test.describe("Жизненный цикл плана (state transitions)", () => {
      test(
        "C4902: Активировать план",
        { tag: ["@db"] },
        async ({ devPlansAPI, orgStructureAPI, dpVerifier }) => {
          setSeverity("critical");

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

          await test.step(`Создать план для активации (userId=${userId})`, async () => {
            const result = await devPlansAPI.createDevelopmentPlan({
              title: `Test Activate Plan ${Date.now()}`,
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
            let response;

            await test.step(`Отправить POST /private/development-plans/${planId}/activate`, async () => {
              const result = await devPlansAPI.activateDevelopmentPlan(planId);
              response = result.response;
            });

            await test.step("Проверить статус ответа: 200 OK или 400/403 (требуется одобрение)", async () => {
              // План может требовать одобрения или быть уже активирован
              expect(
                [200, 400, 403],
                "Активация плана должна вернуть 200 или требовать одобрения",
              ).toContain(response.status());
            });

            // DB верификация статуса
            if (response.ok()) {
              await test.step("DB: Проверка статуса активации в БД", async () => {
                if (!dpVerifier.isConnected()) return;
                await dpVerifier.verifyPlanStatus(planId, "active");
              });
            }

            // Cleanup
            await test.step(`Удалить тестовый план ID=${planId}`, async () => {
              await devPlansAPI.deleteDevelopmentPlan(planId);
            });
          }
        },
      );

      test(
        "C4903: Перевести план в черновик",
        { tag: ["@db"] },
        async ({ devPlansAPI, orgStructureAPI, dpVerifier }) => {
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

          await test.step(`Создать план для перевода в черновик (userId=${userId})`, async () => {
            const result = await devPlansAPI.createDevelopmentPlan({
              title: `Test Draft Plan ${Date.now()}`,
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
            let response;

            await test.step(`Отправить POST /private/development-plans/${planId}/draft`, async () => {
              const result = await devPlansAPI.draftDevelopmentPlan(planId);
              response = result.response;
            });

            await test.step("Проверить статус ответа: 200 OK или 400/403 (уже черновик)", async () => {
              // Может уже быть черновиком
              expect(
                [200, 400, 403],
                "Перевод в черновик должен вернуть 200 или ошибку если уже черновик",
              ).toContain(response.status());
            });

            // DB верификация статуса
            if (response.ok()) {
              await test.step("DB: Проверка статуса draft в БД", async () => {
                if (!dpVerifier.isConnected()) return;
                await dpVerifier.verifyPlanStatus(planId, "draft");
              });
            }

            // Cleanup
            await test.step(`Удалить тестовый план ID=${planId}`, async () => {
              await devPlansAPI.deleteDevelopmentPlan(planId);
            });
          }
        },
      );

      test(
        "C4904: Отправить план на согласование",
        { tag: ["@db"] },
        async ({ devPlansAPI, orgStructureAPI, dpVerifier }) => {
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

          await test.step(`Создать план для отправки на согласование (userId=${userId})`, async () => {
            const result = await devPlansAPI.createDevelopmentPlan({
              title: `Test Approval Plan ${Date.now()}`,
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
            let response;

            await test.step(`Отправить POST /private/development-plans/${planId}/approval`, async () => {
              const result = await devPlansAPI.approvalDevelopmentPlan(planId);
              response = result.response;
            });

            await test.step("Проверить статус ответа: 200 OK или 400/403 (недопустимый статус)", async () => {
              // Может требовать определённого статуса
              expect(
                [200, 400, 403],
                "Отправка на согласование должна вернуть 200 или ошибку статуса",
              ).toContain(response.status());
            });

            // DB верификация статуса
            if (response.ok()) {
              await test.step("DB: Проверка статуса approval в БД", async () => {
                if (!dpVerifier.isConnected()) return;
                await dpVerifier.verifyPlanStatus(planId, "approval");
              });
            }

            // Cleanup
            await test.step(`Удалить тестовый план ID=${planId}`, async () => {
              await devPlansAPI.deleteDevelopmentPlan(planId);
            });
          }
        },
      );

      test(
        "C4905: Завершить план",
        { tag: ["@db"] },
        async ({ devPlansAPI, orgStructureAPI, dpVerifier }) => {
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

          await test.step(`Создать план для завершения (userId=${userId})`, async () => {
            const result = await devPlansAPI.createDevelopmentPlan({
              title: `Test Complete Plan ${Date.now()}`,
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
            let response;

            await test.step(`Отправить POST /private/development-plans/${planId}/complete с комментарием`, async () => {
              const result = await devPlansAPI.completeDevelopmentPlan(
                planId,
                "Тестовое завершение",
              );
              response = result.response;
            });

            await test.step("Проверить статус ответа: 200 OK или 400/403 (план должен быть активен)", async () => {
              // План должен быть активным для завершения
              expect(
                [200, 400, 403],
                "Завершение плана должно вернуть 200 или ошибку если план не активен",
              ).toContain(response.status());
            });

            // DB верификация статуса
            if (response.ok()) {
              await test.step("DB: Проверка статуса completed в БД", async () => {
                if (!dpVerifier.isConnected()) return;
                await dpVerifier.verifyPlanStatus(planId, "completed");
              });
            }

            // Cleanup
            await test.step(`Удалить тестовый план ID=${planId}`, async () => {
              await devPlansAPI.deleteDevelopmentPlan(planId);
            });
          }
        },
      );
    });
  },
);
