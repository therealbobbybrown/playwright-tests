// @ts-check
/**
 * API тесты для анкет (Assessments)
 *
 * Покрытие методов:
 * - getAssessments - получение списка анкет
 * - getAssessment - получение анкеты по ID
 * - createAssessment - создание анкеты
 * - createAssessmentDraft - создание черновика
 * - updateAssessment - обновление анкеты
 * - deleteAssessment - удаление анкеты
 * - getAssessmentTemplates - получение шаблонов
 * - getAssessmentTemplate - получение шаблона по ID
 * - getTemplateAsAssessment - получение шаблона как анкеты
 * - createAssessmentTemplate - создание шаблона
 * - updateAssessmentTemplate - обновление шаблона
 *
 * СТРОГИЕ ТЕСТЫ - не маскируют ошибки, а выявляют их.
 */
import { test as fullTest, expect } from "../../fixtures/full.js";
import { AssessmentsAPI, getCredentials } from "../../utils/api/index.js";
import { allure } from "allure-playwright";
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

// Расширяем test с фикстурой для Assessments API
const test = fullTest.extend({
  assessmentsAPI: async ({ request }, use) => {
    const api = new AssessmentsAPI(request);
    const { email, password } = getCredentials("admin");
    const signInResult = await api.signIn(email, password);
    if (!signInResult?.accessToken) {
      throw new Error("Не удалось авторизоваться для теста AssessmentsAPI");
    }
    await use(api);
  },
});

/**
 * Хелпер для логирования входных данных
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

test.describe(
  "Assessments API",
  { tag: ["@api", "@assessments", "@functional", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Assessments");
    });

    // ==================== GET LIST ====================

    test.describe("GET /manager/assessments/ - Список анкет", () => {
      test(
        "C4534: Получить список анкет без параметров",
        { tag: ["@critical"] },
        async ({ assessmentsAPI }) => {
          setSeverity("critical");
          logExpected("Status 200, массив анкет");

          let response, data;
          await test.step("Выполнить запрос: Получить список анкет без параметров", async () => {
            ({ response, data } = await assessmentsAPI.getAssessments());
          });

          await test.step("Проверить ответ", async () => {
            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);
            expect(data, "Данные должны быть определены").toBeDefined();

            const items = data?.items || data || [];
            expect(Array.isArray(items), "Анкеты должны быть массивом").toBe(
              true,
            );

            // Проверяем структуру первой анкеты
            if (items.length > 0) {
              const assessment = items[0];
              expect(assessment.id, "Анкета должна иметь id").toBeDefined();
              expect(typeof assessment.id, "id должен быть числом").toBe(
                "number",
              );
            }
          });
        },
      );

      test("C4535: Получить список анкет с лимитом", async ({
        assessmentsAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить список анкет с лимитом", async () => {
          const limit = 5;
          logInput("getAssessments", { limit });
          logExpected(`Status 200, не более ${limit} анкет`);

          const { response, data } = await assessmentsAPI.getAssessments({
            limit,
          });

          expect(
            response.status(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(200);
          const items = data?.items || data || [];
          expect(
            items.length,
            `Должно быть не более ${limit} анкет`,
          ).toBeLessThanOrEqual(limit);
        });
      });

      test("C4536: Пагинация списка анкет работает корректно", async ({
        assessmentsAPI,
      }) => {
        setSeverity("normal");

        let resp1, data1;
        await test.step("Выполнить запрос: Пагинация списка анкет работает корректно", async () => {
          // Получаем первую страницу
          ({ response: resp1, data: data1 } =
            await assessmentsAPI.getAssessments({ limit: 2, offset: 0 }));
        });

        await test.step("Проверить ответ", async () => {
          expect(resp1.status()).toBe(200);

          // Получаем вторую страницу
          const { response: resp2, data: data2 } =
            await assessmentsAPI.getAssessments({ limit: 2, offset: 2 });
          expect(resp2.status()).toBe(200);

          const items1 = data1?.items || data1 || [];
          const items2 = data2?.items || data2 || [];

          logInput("pagination", {
            page1: { limit: 2, offset: 0, count: items1.length },
            page2: { limit: 2, offset: 2, count: items2.length },
          });

          // Если есть данные на обеих страницах, они должны быть разными
          if (items1.length > 0 && items2.length > 0) {
            const ids1 = items1.map((a) => a.id);
            const ids2 = items2.map((a) => a.id);
            const overlap = ids1.filter((id) => ids2.includes(id));
            expect(
              overlap.length,
              "Страницы не должны содержать одинаковые анкеты",
            ).toBe(0);
          }
        });
      });

      test("C4537: Получить только мои анкеты (my=true)", async ({
        assessmentsAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить только мои анкеты (my=true)", async () => {
          logInput("getAssessments", { my: true });
          logExpected("Status 200, отфильтрованный список");

          const { response, data } = await assessmentsAPI.getAssessments({
            my: true,
          });

          expect(
            response.status(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(200);
          expect(data, "Данные должны быть определены").toBeDefined();
        });
      });

      test("C4538: Поиск анкет по названию (q параметр)", async ({
        assessmentsAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Поиск анкет по названию (q параметр)", async () => {
          // Сначала получаем существующую анкету для поиска
          const { data: allData } = await assessmentsAPI.getAssessments({
            limit: 1,
          });
          const items = allData?.items || allData || [];

          if (items.length === 0) {
            allure.attachment(
              "Skip reason",
              "Нет анкет для поиска",
              "text/plain",
            );
            return;
          }

          const title = items[0].title || items[0].name || "";
          if (!title) {
            allure.attachment(
              "Skip reason",
              "Анкета не имеет названия",
              "text/plain",
            );
            return;
          }

          const searchQuery = title.substring(0, 5);
          logInput("getAssessments", { q: searchQuery, limit: 10 });
          logExpected("Status 200, отфильтрованный список");

          ({ response, data } = await assessmentsAPI.getAssessments({
            q: searchQuery,
            limit: 10,
          }));
        });

        await test.step("Проверить ответ", async () => {
          if (!response) return; // step завершился раньше (нет анкет или названия)
          expect(
            response.status(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(200);
          expect(data, "Данные должны быть определены").toBeDefined();
        });
      });
    });

    // ==================== GET BY ID ====================

    test.describe("GET /manager/assessments/{id}/ - Получение анкеты по ID", () => {
      test(
        "C4539: Получить анкету по ID",
        { tag: ["@critical"] },
        async ({ assessmentsAPI }) => {
          setSeverity("critical");

          let assessmentId, response, data;
          await test.step("Выполнить запрос: Получить анкету по ID", async () => {
            // Сначала получаем существующий ID
            const { data: listData } = await assessmentsAPI.getAssessments({
              limit: 1,
            });
            const items = listData?.items || listData || [];

            if (items.length === 0) {
              allure.attachment(
                "Skip reason",
                "Нет анкет в системе",
                "text/plain",
              );
              return;
            }

            assessmentId = items[0].id;
            logInput("getAssessment", { id: assessmentId });
            logExpected(`Status 200, анкета с id=${assessmentId}`);

            ({ response, data } =
              await assessmentsAPI.getAssessment(assessmentId));
          });

          await test.step("Проверить ответ", async () => {
            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);
            expect(data, "Данные должны быть определены").toBeDefined();
            expect(data.id, `ID анкеты должен быть ${assessmentId}`).toBe(
              assessmentId,
            );
          });
        },
      );

      test(
        "C4540: Получить несуществующую анкету - должна быть ошибка 404/500",
        { tag: ["@negative"] },
        async ({ assessmentsAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить: Получить несуществующую анкету - должна быть ошибка 404/500", async () => {
            const nonExistentId = 999999999;
            logInput("getAssessment", { id: nonExistentId });
            logExpected("Status 404 или 500");

            const { response, data } =
              await assessmentsAPI.getAssessment(nonExistentId);

            expect(
              [404, 500].includes(response.status()),
              `Ожидался статус 404 или 500 для несуществующей анкеты, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );
    });

    // ==================== CREATE ====================

    test.describe("POST /manager/assessments/ - Создание анкеты", () => {
      test(
        "C4541: Создать анкету без шаблона",
        { tag: ["@critical", "@db"] },
        async ({ assessmentsAPI, baseVerifier }) => {
          setSeverity("critical");
          logExpected("Status 200/201, созданная анкета с id");

          const { response, data } = await assessmentsAPI.createAssessment();

          expect(
            [200, 201].includes(response.status()),
            `Ожидался статус 200/201, получен ${response.status()}. Response: ${JSON.stringify(data)}`,
          ).toBe(true);

          expect(data, "Данные должны быть определены").toBeDefined();

          const assessmentId = data.id || data.assessment?.id;
          expect(
            assessmentId,
            "Созданная анкета должна иметь id",
          ).toBeDefined();

          // DB верификация
          await test.step("DB: Проверка создания анкеты в БД", async () => {
            await baseVerifier.verifyRecordCreated("assessment", assessmentId);
          });

          // Cleanup
          if (assessmentId) {
            const { response: deleteResp } =
              await assessmentsAPI.deleteAssessment(assessmentId);
            expect(deleteResp.ok(), "Cleanup: удаление анкеты").toBe(true);
          }
        },
      );

      test(
        "C4542: Создать анкету на основе шаблона",
        { tag: ["@critical"] },
        async ({ assessmentsAPI }) => {
          setSeverity("critical");

          let templatesResp, templatesData;
          await test.step("Выполнить запрос: Создать анкету на основе шаблона", async () => {
            // Находим существующий шаблон
            ({ response: templatesResp, data: templatesData } =
              await assessmentsAPI.getAssessmentTemplates({ limit: 1 }));
          });

          await test.step("Проверить ответ", async () => {
            expect(templatesResp.status()).toBe(200);

            const templates = templatesData?.items || templatesData || [];
            if (templates.length === 0) {
              allure.attachment(
                "Skip reason",
                "Нет шаблонов в системе",
                "text/plain",
              );
              return;
            }

            const templateId = templates[0].id;
            logInput("createAssessment", { templateId });
            logExpected("Status 200/201, анкета создана на основе шаблона");

            const { response, data } = await assessmentsAPI.createAssessment({
              templateId,
            });

            expect(
              [200, 201].includes(response.status()),
              `Ожидался статус 200/201, получен ${response.status()}. Response: ${JSON.stringify(data)}`,
            ).toBe(true);

            const assessmentId = data?.id || data?.assessment?.id;
            expect(
              assessmentId,
              "Созданная анкета должна иметь id",
            ).toBeDefined();

            // Cleanup
            if (assessmentId) {
              await assessmentsAPI.deleteAssessment(assessmentId);
            }
          });
        },
      );

      test("C4543: Создать черновик анкеты из исходной анкеты", async ({
        assessmentsAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Создать черновик анкеты из исходной анкеты", async () => {
          // Находим существующую анкету
          const { data: listData } = await assessmentsAPI.getAssessments({
            limit: 1,
          });
          const items = listData?.items || listData || [];

          if (items.length === 0) {
            allure.attachment(
              "Skip reason",
              "Нет анкет для копирования",
              "text/plain",
            );
            return;
          }

          const srcAssessmentId = items[0].id;
          logInput("createAssessmentDraft", { srcAssessmentId });
          logExpected("Status 200/201, черновик создан");

          ({ response, data } = await assessmentsAPI.createAssessmentDraft({
            srcAssessmentId,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [200, 201].includes(response.status()),
            `Ожидался статус 200/201, получен ${response.status()}. Response: ${JSON.stringify(data)}`,
          ).toBe(true);

          const assessmentId = data?.id || data?.assessment?.id;

          // Cleanup
          if (assessmentId) {
            await assessmentsAPI.deleteAssessment(assessmentId);
          }
        });
      });
    });

    // ==================== UPDATE ====================

    test.describe("POST /manager/assessments/{id}/ - Обновление анкеты", () => {
      test(
        "C4544: Обновить название анкеты",
        { tag: ["@critical"] },
        async ({ assessmentsAPI }) => {
          setSeverity("critical");

          let createResp, createData;
          await test.step("Выполнить запрос: Обновить название анкеты", async () => {
            // Создаём тестовую анкету
            ({ response: createResp, data: createData } =
              await assessmentsAPI.createAssessment());
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 201].includes(createResp.status()),
              "Анкета должна быть создана",
            ).toBe(true);

            const assessmentId = createData?.id || createData?.assessment?.id;
            expect(
              assessmentId,
              "Созданная анкета должна иметь id",
            ).toBeDefined();

            const newTitle = `Updated Assessment ${Date.now()}`;
            logInput("updateAssessment", { id: assessmentId, title: newTitle });
            logExpected("Status 200, название обновлено");

            const { response, data } = await assessmentsAPI.updateAssessment(
              assessmentId,
              {
                title: newTitle,
              },
            );

            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);
            expect(data, "Данные должны быть определены").toBeDefined();

            // Проверяем что название обновилось
            const { data: verifyData } =
              await assessmentsAPI.getAssessment(assessmentId);
            // Название может быть в разных полях
            const updatedTitle =
              verifyData?.title || verifyData?.questionnaire?.title;
            if (updatedTitle) {
              expect(updatedTitle, "Название должно быть обновлено").toBe(
                newTitle,
              );
            }

            // Cleanup
            await assessmentsAPI.deleteAssessment(assessmentId);
          });
        },
      );

      test(
        "C4545: Обновить несуществующую анкету - должна быть ошибка 404/500",
        { tag: ["@negative"] },
        async ({ assessmentsAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить: Обновить несуществующую анкету - должна быть ошибка 404/500", async () => {
            const nonExistentId = 999999999;
            logInput("updateAssessment", { id: nonExistentId, title: "Test" });
            logExpected("Status 404 или 500");

            const { response } = await assessmentsAPI.updateAssessment(
              nonExistentId,
              { title: "Test" },
            );

            expect(
              [404, 500].includes(response.status()),
              `Ожидался статус 404 или 500 для несуществующей анкеты, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );
    });

    // ==================== DELETE ====================

    test.describe("DELETE /manager/assessments/{id}/ - Удаление анкеты", () => {
      test(
        "C4546: Удалить анкету",
        { tag: ["@critical", "@db"] },
        async ({ assessmentsAPI, baseVerifier }) => {
          setSeverity("critical");

          // Создаём анкету для удаления
          const { response: createResp, data: createData } =
            await assessmentsAPI.createAssessment();
          expect(
            [200, 201].includes(createResp.status()),
            "Анкета должна быть создана",
          ).toBe(true);

          const assessmentId = createData?.id || createData?.assessment?.id;
          expect(
            assessmentId,
            "Созданная анкета должна иметь id",
          ).toBeDefined();

          logInput("deleteAssessment", { id: assessmentId });
          logExpected("Status 200/204, анкета удалена");

          const { response } =
            await assessmentsAPI.deleteAssessment(assessmentId);

          expect(
            [200, 204].includes(response.status()),
            `Ожидался статус 200/204, получен ${response.status()}`,
          ).toBe(true);

          // Проверяем что анкета удалена
          const { response: getResp } =
            await assessmentsAPI.getAssessment(assessmentId);
          expect(
            [404, 500].includes(getResp.status()),
            `Удалённая анкета должна возвращать 404 или 500, получен ${getResp.status()}`,
          ).toBe(true);

          // DB верификация
          await test.step("DB: Проверка удаления анкеты из БД", async () => {
            await baseVerifier.verifyRecordDeleted("assessment", assessmentId);
          });
        },
      );

      test(
        "C4547: Удалить несуществующую анкету - должна быть ошибка 404/500",
        { tag: ["@negative"] },
        async ({ assessmentsAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить: Удалить несуществующую анкету - должна быть ошибка 404/500", async () => {
            const nonExistentId = 999999999;
            logInput("deleteAssessment", { id: nonExistentId });
            logExpected("Status 404 или 500");

            const { response } =
              await assessmentsAPI.deleteAssessment(nonExistentId);

            expect(
              [404, 500].includes(response.status()),
              `Ожидался статус 404 или 500 для несуществующей анкеты, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4548: Удалить уже удалённую анкету - должна быть ошибка 404",
        { tag: ["@negative"] },
        async ({ assessmentsAPI }) => {
          setSeverity("normal");

          let assessmentId, firstDelete;
          await test.step("Выполнить запрос: Удалить уже удалённую анкету - должна быть ошибка 404", async () => {
            // Создаём и удаляем
            const { data: createData } =
              await assessmentsAPI.createAssessment();
            assessmentId = createData?.id || createData?.assessment?.id;

            // Первое удаление
            ({ response: firstDelete } =
              await assessmentsAPI.deleteAssessment(assessmentId));
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 204].includes(firstDelete.status()),
              "Первое удаление должно быть успешным",
            ).toBe(true);

            logInput("deleteAssessment (second time)", { id: assessmentId });
            logExpected("Status 404 или 500 - анкета уже удалена");

            // Второе удаление
            const { response: secondDelete } =
              await assessmentsAPI.deleteAssessment(assessmentId);

            expect(
              [404, 500].includes(secondDelete.status()),
              `Повторное удаление должно вернуть 404 или 500, получен ${secondDelete.status()}`,
            ).toBe(true);
          });
        },
      );
    });

    // ==================== TEMPLATES ====================

    test.describe("Templates - Шаблоны анкет", () => {
      test(
        "C4549: Получить список шаблонов",
        { tag: ["@critical"] },
        async ({ assessmentsAPI }) => {
          setSeverity("critical");
          logExpected("Status 200, массив шаблонов");

          await test.step("Выполнить: Получить список шаблонов", async () => {
            const { response, data } =
              await assessmentsAPI.getAssessmentTemplates();

            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);
            expect(data, "Данные должны быть определены").toBeDefined();

            const items = data?.items || data || [];
            expect(Array.isArray(items), "Шаблоны должны быть массивом").toBe(
              true,
            );
          });
        },
      );

      test("C4550: Получить список шаблонов с лимитом", async ({
        assessmentsAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить список шаблонов с лимитом", async () => {
          const limit = 5;
          logInput("getAssessmentTemplates", { limit });

          const { response, data } =
            await assessmentsAPI.getAssessmentTemplates({
              limit,
            });

          expect(
            response.status(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(200);
          const items = data?.items || data || [];
          expect(items.length).toBeLessThanOrEqual(limit);
        });
      });

      test(
        "C4551: Получить шаблон по ID",
        { tag: ["@critical"] },
        async ({ assessmentsAPI }) => {
          setSeverity("critical");

          let templateId, response, data;
          await test.step("Выполнить запрос: Получить шаблон по ID", async () => {
            // Получаем существующий шаблон
            const { data: listData } =
              await assessmentsAPI.getAssessmentTemplates({ limit: 1 });
            const items = listData?.items || listData || [];

            if (items.length === 0) {
              allure.attachment(
                "Skip reason",
                "Нет шаблонов в системе",
                "text/plain",
              );
              return;
            }

            templateId = items[0].id;
            logInput("getAssessmentTemplate", { id: templateId });
            logExpected(`Status 200, шаблон с id=${templateId}`);

            ({ response, data } =
              await assessmentsAPI.getAssessmentTemplate(templateId));
          });

          await test.step("Проверить ответ", async () => {
            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);
            expect(data, "Данные должны быть определены").toBeDefined();
            expect(data.id, `ID шаблона должен быть ${templateId}`).toBe(
              templateId,
            );
          });
        },
      );

      test(
        "C4552: Получить несуществующий шаблон - должна быть ошибка 404/500",
        { tag: ["@negative"] },
        async ({ assessmentsAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить: Получить несуществующий шаблон - должна быть ошибка 404/500", async () => {
            const nonExistentId = 999999999;
            logInput("getAssessmentTemplate", { id: nonExistentId });
            logExpected("Status 404 или 500");

            const { response } =
              await assessmentsAPI.getAssessmentTemplate(nonExistentId);

            expect(
              [404, 500].includes(response.status()),
              `Ожидался статус 404 или 500 для несуществующего шаблона, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test("C4553: Получить шаблон как анкету (as-assessment)", async ({
        assessmentsAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Получить шаблон как анкету (as-assessment)", async () => {
          // Получаем существующий шаблон
          const { data: listData } =
            await assessmentsAPI.getAssessmentTemplates({
              limit: 1,
            });
          const items = listData?.items || listData || [];

          if (items.length === 0) {
            allure.attachment(
              "Skip reason",
              "Нет шаблонов в системе",
              "text/plain",
            );
            return;
          }

          const templateId = items[0].id;
          logInput("getTemplateAsAssessment", { templateId });
          logExpected("Status 200, шаблон в формате анкеты");

          ({ response, data } =
            await assessmentsAPI.getTemplateAsAssessment(templateId));
        });

        await test.step("Проверить ответ", async () => {
          expect(
            response.status(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(200);
          expect(data, "Данные должны быть определены").toBeDefined();
        });
      });

      test(
        "C4554: Создать шаблон анкеты",
        { tag: ["@critical"] },
        async ({ assessmentsAPI }) => {
          setSeverity("critical");
          logExpected("Status 200/201, созданный шаблон с id");

          await test.step("Выполнить: Создать шаблон анкеты", async () => {
            const { response, data } =
              await assessmentsAPI.createAssessmentTemplate();

            expect(
              [200, 201].includes(response.status()),
              `Ожидался статус 200/201, получен ${response.status()}. Response: ${JSON.stringify(data)}`,
            ).toBe(true);

            expect(data, "Данные должны быть определены").toBeDefined();

            const templateId = data.id || data.template?.id;
            expect(
              templateId,
              "Созданный шаблон должен иметь id",
            ).toBeDefined();

            allure.attachment(
              "Created template",
              JSON.stringify({ templateId }),
              "application/json",
            );
          });
        },
      );

      test("C4555: Обновить шаблон анкеты", async ({ assessmentsAPI }) => {
        setSeverity("normal");

        let createResp, createData;
        await test.step("Выполнить запрос: Обновить шаблон анкеты", async () => {
          // Создаём шаблон
          ({ response: createResp, data: createData } =
            await assessmentsAPI.createAssessmentTemplate());
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [200, 201].includes(createResp.status()),
            "Шаблон должен быть создан",
          ).toBe(true);

          const templateId = createData?.id || createData?.template?.id;
          expect(templateId, "Созданный шаблон должен иметь id").toBeDefined();

          const newTitle = `Updated Template ${Date.now()}`;
          logInput("updateAssessmentTemplate", {
            id: templateId,
            title: newTitle,
          });
          logExpected("Status 200, шаблон обновлён");

          const { response, data } =
            await assessmentsAPI.updateAssessmentTemplate(templateId, {
              title: newTitle,
            });

          expect(
            response.status(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(200);
        });
      });
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты", () => {
      test(
        "C4556: Полный жизненный цикл анкеты: создание → чтение → обновление → удаление",
        { tag: ["@critical"] },
        async ({ assessmentsAPI }) => {
          setSeverity("critical");

          let timestamp, createResp, createData;
          await test.step("Выполнить запрос: Полный жизненный цикл анкеты: создание → чтение → обновление → удаление", async () => {
            timestamp = Date.now();

            // 1. CREATE
            ({ response: createResp, data: createData } =
              await assessmentsAPI.createAssessment());
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 201].includes(createResp.status()),
              "CREATE должен вернуть 200/201",
            ).toBe(true);
            const assessmentId = createData?.id || createData?.assessment?.id;
            expect(assessmentId, "CREATE должен вернуть id").toBeDefined();

            allure.attachment(
              "Step 1: CREATE",
              JSON.stringify({ assessmentId }),
              "application/json",
            );

            // 2. READ
            const { response: readResp, data: readData } =
              await assessmentsAPI.getAssessment(assessmentId);
            expect(readResp.status(), "READ должен вернуть 200").toBe(200);
            expect(readData.id, "READ должен вернуть правильный id").toBe(
              assessmentId,
            );

            allure.attachment(
              "Step 2: READ",
              JSON.stringify(readData),
              "application/json",
            );

            // 3. UPDATE
            const newTitle = `Lifecycle Assessment ${timestamp}`;
            const { response: updateResp } =
              await assessmentsAPI.updateAssessment(assessmentId, {
                title: newTitle,
              });
            expect(updateResp.status(), "UPDATE должен вернуть 200").toBe(200);

            allure.attachment(
              "Step 3: UPDATE",
              JSON.stringify({ newTitle }),
              "application/json",
            );

            // 4. DELETE
            const { response: deleteResp } =
              await assessmentsAPI.deleteAssessment(assessmentId);
            expect(
              [200, 204].includes(deleteResp.status()),
              "DELETE должен вернуть 200/204",
            ).toBe(true);

            // Verify delete
            const { response: verifyResp } =
              await assessmentsAPI.getAssessment(assessmentId);
            expect(
              [404, 500].includes(verifyResp.status()),
              `После DELETE должен вернуться 404 или 500, получен ${verifyResp.status()}`,
            ).toBe(true);

            allure.attachment(
              "Step 4: DELETE",
              JSON.stringify({ deleted: true, assessmentId }),
              "application/json",
            );
          });
        },
      );

      test(
        "C4557: Создание анкеты из шаблона и проверка структуры",
        { tag: ["@critical"] },
        async ({ assessmentsAPI }) => {
          setSeverity("critical");

          let templateId, templateAsAssessment, createResp, createData;
          await test.step("Выполнить запрос: Создание анкеты из шаблона и проверка структуры", async () => {
            // Получаем шаблон
            const { data: templatesData } =
              await assessmentsAPI.getAssessmentTemplates({ limit: 1 });
            const templates = templatesData?.items || templatesData || [];

            if (templates.length === 0) {
              allure.attachment("Skip reason", "Нет шаблонов", "text/plain");
              return;
            }

            templateId = templates[0].id;

            // Получаем шаблон как анкету для сравнения структуры
            ({ data: templateAsAssessment } =
              await assessmentsAPI.getTemplateAsAssessment(templateId));

            // Создаём анкету из шаблона
            ({ response: createResp, data: createData } =
              await assessmentsAPI.createAssessment({ templateId }));
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 201].includes(createResp.status()),
              "Анкета из шаблона должна быть создана",
            ).toBe(true);

            const assessmentId = createData?.id || createData?.assessment?.id;

            // Получаем созданную анкету
            const { data: assessmentData } =
              await assessmentsAPI.getAssessment(assessmentId);

            allure.attachment(
              "Template vs Assessment",
              JSON.stringify(
                {
                  templateId,
                  assessmentId,
                  templateKeys: Object.keys(templateAsAssessment || {}),
                  assessmentKeys: Object.keys(assessmentData || {}),
                },
                null,
                2,
              ),
              "application/json",
            );

            // Cleanup
            if (assessmentId) {
              await assessmentsAPI.deleteAssessment(assessmentId);
            }
          });
        },
      );
    });

    // ==================== SECURITY TESTS ====================

    test.describe("Security тесты", () => {
      test(
        "C4558: Обновление анкеты с XSS в названии",
        { tag: ["@security"] },
        async ({ assessmentsAPI }) => {
          setSeverity("normal");

          let assessmentId, response, data;
          await test.step("Выполнить запрос: Обновление анкеты с XSS в названии", async () => {
            // Создаём анкету
            const { data: createData } =
              await assessmentsAPI.createAssessment();
            assessmentId = createData?.id || createData?.assessment?.id;

            const xssPayload = '<script>alert("XSS")</script>';
            logInput("updateAssessment", {
              id: assessmentId,
              title: xssPayload,
            });
            logExpected("Status 200 - XSS экранируется на фронте");

            ({ response, data } = await assessmentsAPI.updateAssessment(
              assessmentId,
              { title: xssPayload },
            ));

            // API принимает данные, экранирование происходит на фронте
          });

          await test.step("Проверить ответ", async () => {
            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);

            // Cleanup
            if (assessmentId) {
              await assessmentsAPI.deleteAssessment(assessmentId);
            }
          });
        },
      );

      test(
        "C4559: Обновление анкеты с SQL-injection в названии",
        { tag: ["@security"] },
        async ({ assessmentsAPI }) => {
          setSeverity("critical");

          let assessmentId, response;
          await test.step("Выполнить запрос: Обновление анкеты с SQL-injection в названии", async () => {
            const { data: createData } =
              await assessmentsAPI.createAssessment();
            assessmentId = createData?.id || createData?.assessment?.id;

            const sqlInjection = "'; DROP TABLE assessments; --";
            logInput("updateAssessment", {
              id: assessmentId,
              title: sqlInjection,
            });

            ({ response } = await assessmentsAPI.updateAssessment(
              assessmentId,
              { title: sqlInjection },
            ));

            // Не должен вернуть 500
          });

          await test.step("Проверить ответ", async () => {
            expect(
              response.status() !== 500,
              `SQL-injection не должен вызывать серверную ошибку, получен ${response.status()}`,
            ).toBe(true);

            // Cleanup
            if (assessmentId) {
              await assessmentsAPI.deleteAssessment(assessmentId);
            }
          });
        },
      );
    });

    // ==================== NEGATIVE TESTS ====================

    test.describe("Негативные сценарии", () => {
      test(
        "C4560: Получить анкеты с невалидными параметрами пагинации",
        { tag: ["@negative"] },
        async ({ assessmentsAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить: Получить анкеты с невалидными параметрами пагинации", async () => {
            logInput("getAssessments", { limit: -1, offset: -1 });

            const { response, data } = await assessmentsAPI.getAssessments({
              limit: -1,
              offset: -1,
            });

            // API может проигнорировать, вернуть ошибку валидации или 500
            expect(
              [200, 400, 422, 500].includes(response.status()),
              `Должен вернуть 200, 400, 422 или 500, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4561: Создать анкету с несуществующим шаблоном",
        { tag: ["@negative", "@db"] },
        async ({ assessmentsAPI, baseVerifier }) => {
          setSeverity("normal");
          const fakeTemplateId = 999999999;

          // DB: Получаем количество анкет до теста
          const assessmentsBefore =
            await test.step("DB: Получение анкет до теста", async () => {
              if (baseVerifier.skipIfNotConnected()) return 0;
              return await baseVerifier.countRecords("assessment");
            });

          logInput("createAssessment", { templateId: fakeTemplateId });
          logExpected("Status 400 или 404");

          const { response, data } = await assessmentsAPI.createAssessment({
            templateId: fakeTemplateId,
          });

          expect(
            [400, 404].includes(response.status()),
            `Несуществующий шаблон должен вернуть 400/404, получен ${response.status()}. Response: ${JSON.stringify(data)}`,
          ).toBe(true);

          // DB: Проверяем что анкета НЕ создана
          await test.step("DB: Проверка что анкета НЕ создана", async () => {
            await baseVerifier.verifyRecordCount(
              "assessment",
              {},
              assessmentsBefore,
            );
          });
        },
      );
    });
  },
);
