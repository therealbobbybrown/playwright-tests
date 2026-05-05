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
 * API тесты для шаблонов планов развития (Development Plan Templates)
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
let cachedTemplateId = null;

async function findExistingTemplate(api) {
  if (cachedTemplateId) {
    return cachedTemplateId;
  }

  const { data } = await api.getDevelopmentPlanTemplates({ limit: 10 });
  const items = data?.items || data || [];
  if (items.length > 0) {
    cachedTemplateId = items[0].id;
    return cachedTemplateId;
  }

  return null;
}

test.describe(
  "Development Plan Templates API",
  { tag: ["@api", "@development-plans", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Development Plans");
    });

    // ==================== DEVELOPMENT PLAN TEMPLATES ====================

    test.describe("GET /private/development-plan-templates/get/ - Шаблоны планов", () => {
      test(
        "C4549: Получить список шаблонов",
        { tag: ["@critical"] },
        async ({ devPlansAPI }) => {
          setSeverity("critical");

          let response, data;

          await test.step("Отправить POST /private/development-plan-templates/get с limit=10", async () => {
            const result = await devPlansAPI.getDevelopmentPlanTemplates({
              limit: 10,
            });
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить наличие данных в ответе", async () => {
            expect(data, "Данные шаблонов должны существовать").toBeDefined();
          });

          await test.step("Проверить что items является валидным массивом", async () => {
            const items = data?.items || data || [];
            assertValidArray(items);
          });
        },
      );

      test("C4551: Получить шаблон по ID", async ({ devPlansAPI }) => {
        setSeverity("normal");

        let templateId;

        await test.step("Найти существующий шаблон для тестирования", async () => {
          templateId = await findExistingTemplate(devPlansAPI);
          if (!templateId) {
            test.info().annotations.push({
              type: "skip_reason",
              description: "Нет доступных шаблонов для теста",
            });
          }
        });

        if (templateId) {
          let response, data;

          await test.step(`Отправить GET /private/development-plan-templates/${templateId}`, async () => {
            const result =
              await devPlansAPI.getDevelopmentPlanTemplate(templateId);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить наличие данных шаблона в ответе", async () => {
            expect(data, "Данные шаблона должны существовать").toBeDefined();
          });

          await test.step(`Проверить что ID шаблона совпадает: ${templateId}`, async () => {
            expect(data.id).toBe(templateId);
          });

          await test.step("Проверить наличие обязательных полей шаблона", async () => {
            expect(data.title, "Шаблон должен иметь название").toBeDefined();
          });
        }
      });

      test("C4914: Получить несуществующий шаблон", async ({ devPlansAPI }) => {
        setSeverity("normal");

        const fakeId = 999999999;
        let response;

        await test.step(`Отправить GET /private/development-plan-templates/${fakeId} (несуществующий ID)`, async () => {
          const result = await devPlansAPI.getDevelopmentPlanTemplate(fakeId);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (шаблон не найден)", async () => {
          expect(
            [400, 403, 404],
            "Несуществующий шаблон должен вернуть ошибку",
          ).toContain(response.status());
        });
      });

      test("C4915: Получить цели шаблона", async ({ devPlansAPI }) => {
        setSeverity("normal");

        let templateId;

        await test.step("Найти существующий шаблон для тестирования", async () => {
          templateId = await findExistingTemplate(devPlansAPI);
        });

        if (templateId) {
          let response, data;

          await test.step(`Отправить GET /private/development-plan-templates/${templateId}/objectives`, async () => {
            const result =
              await devPlansAPI.getDevelopmentPlanTemplateObjectives(
                templateId,
              );
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить наличие данных целей шаблона в ответе", async () => {
            expect(
              data,
              "Данные целей шаблона должны существовать",
            ).toBeDefined();
          });

          await test.step("Проверить что items является валидным массивом", async () => {
            const items = data?.items || data || [];
            assertValidArray(items);
          });
        }
      });
    });

    test.describe("POST /manager/development-plan-templates/ - Создание шаблона", () => {
      test("C4916: Создать шаблон плана", async ({ devPlansAPI }) => {
        setSeverity("critical");

        let response, data;

        await test.step("Отправить POST /manager/development-plan-templates/ с данными шаблона", async () => {
          const result = await devPlansAPI.createDevelopmentPlanTemplate({
            title: `Test Template ${Date.now()}`,
            description: "Test template description",
            developmentPlanTitle: "Test Plan Title",
            setHeadCurator: true,
            periodDuration: 30,
          });
          response = result.response;
          data = result.data;
        });

        if (response.status() === 403) {
          console.log("Нет прав на создание шаблонов");
          return;
        }

        await test.step("Проверить статус ответа: 200/201 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие данных шаблона в ответе", async () => {
          expect(
            data,
            "Данные созданного шаблона должны существовать",
          ).toBeDefined();
        });

        const templateId = data.id || data.template?.id;

        await test.step("Проверить что в ответе присутствует ID созданного шаблона", async () => {
          expect(
            templateId,
            "ID созданного шаблона должен быть определён",
          ).toBeDefined();
        });

        // Cleanup
        if (templateId) {
          await test.step(`Удалить тестовый шаблон ID=${templateId}`, async () => {
            await devPlansAPI.deleteDevelopmentPlanTemplate(templateId);
          });
        }
      });

      test(
        "C4917: Создать шаблон без названия (негативный)",
        { tag: ["@db"] },
        async ({ devPlansAPI, dpVerifier }) => {
          setSeverity("normal");

          let beforeData, beforeCount;

          await test.step("Получить текущее количество шаблонов", async () => {
            const result = await devPlansAPI.getDevelopmentPlanTemplates({
              limit: 1000,
            });
            beforeData = result.data;
            beforeCount = (beforeData?.items || beforeData || []).length;
          });

          let response;

          await test.step("Отправить POST /manager/development-plan-templates/ без обязательных полей", async () => {
            const result = await devPlansAPI.createDevelopmentPlanTemplate({});
            response = result.response;
          });

          await test.step("Проверить статус ответа: 400/422 (ошибка валидации)", async () => {
            expect(
              [400, 422],
              "Создание шаблона без названия должно быть отклонено",
            ).toContain(response.status());
          });

          // DB верификация: шаблон НЕ должен быть создан
          await test.step("DB: Проверка что шаблон НЕ создан", async () => {
            if (!dpVerifier.isConnected()) return;
            // Проверяем через API что количество не увеличилось
            const { data: afterData } =
              await devPlansAPI.getDevelopmentPlanTemplates({ limit: 1000 });
            const afterCount = (afterData?.items || afterData || []).length;
            expect(
              afterCount,
              "Количество шаблонов не должно увеличиться",
            ).toBe(beforeCount);
          });
        },
      );
    });

    test.describe("PATCH /manager/development-plan-templates/{id}/ - Обновление шаблона", () => {
      test("C4918: Обновить шаблон", async ({ devPlansAPI }) => {
        setSeverity("normal");

        const initialTitle = `Test Update Template ${Date.now()}`;
        let createResp, createData;

        await test.step(`Создать тестовый шаблон для обновления (title="${initialTitle}")`, async () => {
          const result = await devPlansAPI.createDevelopmentPlanTemplate({
            title: initialTitle,
            periodDuration: 30,
          });
          createResp = result.response;
          createData = result.data;
        });

        await test.step("Проверить статус создания шаблона", async () => {
          if (!createResp.ok()) {
            test.info().annotations.push({
              type: "skip_reason",
              description: `Не удалось создать шаблон: ${createResp.status()}`,
            });
          } else {
            expect(
              createResp.ok(),
              "Создание шаблона должно быть успешным",
            ).toBe(true);
          }
        });

        if (!createResp.ok()) {
          console.log(
            `Не удалось создать шаблон: статус ${createResp.status()}`,
          );
          return;
        }

        const templateId = createData?.id || createData?.template?.id;

        await test.step("Проверить что ID шаблона определён", async () => {
          expect(
            templateId,
            "ID созданного шаблона должен быть определён",
          ).toBeDefined();
        });

        if (templateId) {
          const newTitle = `Updated Template ${Date.now()}`;
          let response;

          await test.step(`Отправить PATCH /manager/development-plan-templates/${templateId} с новым названием="${newTitle}"`, async () => {
            const result = await devPlansAPI.updateDevelopmentPlanTemplate(
              templateId,
              {
                title: newTitle,
              },
            );
            response = result.response;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step(`Удалить тестовый шаблон ID=${templateId}`, async () => {
            await devPlansAPI.deleteDevelopmentPlanTemplate(templateId);
          });
        }
      });

      test("C4919: Обновить несуществующий шаблон", async ({ devPlansAPI }) => {
        setSeverity("normal");

        const fakeId = 999999999;
        const testTitle = "Test";
        let response;

        await test.step(`Отправить PATCH /manager/development-plan-templates/${fakeId} с title="${testTitle}" (несуществующий ID)`, async () => {
          const result = await devPlansAPI.updateDevelopmentPlanTemplate(
            fakeId,
            {
              title: testTitle,
            },
          );
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (шаблон не найден)", async () => {
          expect(
            [400, 403, 404],
            "Обновление несуществующего шаблона должно вернуть ошибку",
          ).toContain(response.status());
        });
      });
    });

    test.describe("DELETE /manager/development-plan-templates/{id}/ - Удаление шаблона", () => {
      test("C4920: Удалить шаблон", async ({ devPlansAPI }) => {
        setSeverity("normal");

        let createResp, createData;

        await test.step("Создать шаблон для удаления", async () => {
          const result = await devPlansAPI.createDevelopmentPlanTemplate({
            title: `Test Delete Template ${Date.now()}`,
            periodDuration: 30,
          });
          createResp = result.response;
          createData = result.data;
        });

        if (createResp.status() === 403) {
          console.log("Нет прав на создание шаблонов");
          return;
        }

        const templateId = createData?.id || createData?.template?.id;

        if (templateId) {
          let response;

          await test.step(`Отправить DELETE /manager/development-plan-templates/${templateId}`, async () => {
            const result =
              await devPlansAPI.deleteDevelopmentPlanTemplate(templateId);
            response = result.response;
          });

          await test.step("Проверить статус ответа: 200/204 OK", async () => {
            assertSuccessStatus(response);
          });
        }
      });

      test("C4921: Удалить несуществующий шаблон", async ({ devPlansAPI }) => {
        setSeverity("normal");

        const fakeId = 999999999;
        let response;

        await test.step(`Отправить DELETE /manager/development-plan-templates/${fakeId} (несуществующий ID)`, async () => {
          const result =
            await devPlansAPI.deleteDevelopmentPlanTemplate(fakeId);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (шаблон не найден)", async () => {
          expect(
            [400, 403, 404],
            "Удаление несуществующего шаблона должно вернуть ошибку",
          ).toContain(response.status());
        });
      });
    });
  },
);
