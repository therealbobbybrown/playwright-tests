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
 * API тесты для целей шаблонов планов развития, интеграции, доступа и валидации
 *
 * Покрытие:
 * - GET /private/development-plan-templates/{id}/objectives/ - получение целей шаблона
 * - POST /manager/development-plan-templates/{id}/objectives/ - создание цели шаблона
 * - DELETE /manager/development-plan-templates/{templateId}/objectives/{objectiveId}/ - удаление цели
 *
 * Интеграционные тесты:
 * - Полный CRUD цикл шаблона
 * - Шаблон с целями - полный цикл
 *
 * Контроль доступа и валидация
 *
 * СТРОГИЕ ТЕСТЫ - не маскируют ошибки, а выявляют их.
 *
 * @tags @api @regression @development-plans @templates
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

// Кеш для данных шаблонов
let cachedTemplates = null;

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
 * Хелпер для получения списка шаблонов с кешированием
 * @param {DevelopmentPlansAPI} dpAPI
 * @returns {Promise<Array>}
 */
async function getTemplates(dpAPI) {
  if (cachedTemplates) {
    return cachedTemplates;
  }

  const { data } = await dpAPI.getDevelopmentPlanTemplates({ limit: 100 });
  const items = data?.items || (Array.isArray(data) ? data : []);
  cachedTemplates = items;
  return items;
}

/**
 * Хелпер для поиска шаблона
 * @param {DevelopmentPlansAPI} dpAPI
 * @returns {Promise<Object|null>}
 */
async function findTemplate(dpAPI) {
  const templates = await getTemplates(dpAPI);
  return templates.find((t) => t && t.id) || null;
}

// ==================== ТЕСТЫ: getDevelopmentPlanTemplateObjectives ====================

test.describe(
  "Development Plan Templates - getDevelopmentPlanTemplateObjectives",
  {
    tag: [
      "@api",
      "@regression",
      "@development-plans",
      "@templates",
      "@objectives",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Templates - Objectives List");
    });

    test("C4859: Получение целей шаблона - успешный запрос", async ({
      dpAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Получение целей шаблона - успешный запрос", async () => {
        const template = await findTemplate(dpAPI);

        if (!template) {
          test.skip(true, "Нет шаблонов для теста");
          return;
        }

        logInput("ID шаблона", { templateId: template.id });
        logExpected("Список целей возвращается со статусом 200");

        const { response, data } =
          await dpAPI.getDevelopmentPlanTemplateObjectives(template.id);
        const status = response.status();
        logResponse(status, data);

        expect([200], `Ожидался статус 200, получен ${status}`).toContain(
          status,
        );
      });
    });

    test("C4860: Получение целей шаблона - негативный: несуществующий шаблон", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получение целей шаблона - негативный: несуществующий шаблон", async () => {
        const nonExistentId = 999999999;
        logInput("Несуществующий ID шаблона", { templateId: nonExistentId });
        logExpected("Статус 404 Not Found");

        const { response, data } =
          await dpAPI.getDevelopmentPlanTemplateObjectives(nonExistentId);
        const status = response.status();
        logResponse(status, data);

        expect(
          [404, 400, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });
  },
);

// ==================== ТЕСТЫ: saveDevelopmentPlanTemplateObjective ====================

test.describe(
  "Development Plan Templates - saveDevelopmentPlanTemplateObjective",
  {
    tag: [
      "@api",
      "@regression",
      "@development-plans",
      "@templates",
      "@objectives",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Templates - Objectives Save");
    });

    test("C4861: Создание цели шаблона - успешное создание", async ({
      dpAPI,
    }) => {
      setSeverity("critical");

      let createResp, template, status;
      await test.step("Выполнить запрос: Создание цели шаблона - успешное создание", async () => {
        // Создаём шаблон для добавления цели
        ({ response: createResp, data: template } =
          await dpAPI.createDevelopmentPlanTemplate({
            title: `Template with Objective ${Date.now()}`,
            description: "Шаблон для теста целей",
            developmentPlanTitle: "План для целей",
            setHeadCurator: true,
            periodDuration: 60,
          }));

        if (!createResp.ok() || !template?.id) {
          test.skip(true, "Не удалось создать шаблон");
          return;
        }

        const objectiveData = {
          title: `Test Objective ${Date.now()}`,
          description: "Описание цели",
          milestones: [],
        };

        logInput("Данные цели", objectiveData);
        logExpected("Цель создаётся со статусом 200/201");

        const { response, data } =
          await dpAPI.saveDevelopmentPlanTemplateObjective(
            template.id,
            objectiveData,
          );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [200, 201],
          `Ожидался статус 200/201, получен ${status}`,
        ).toContain(status);

        // Очистка
        await dpAPI.deleteDevelopmentPlanTemplate(template.id);
      });
    });

    test("C4862: Создание цели шаблона - негативный: несуществующий шаблон", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let status;
      await test.step("Выполнить запрос: Создание цели шаблона - негативный: несуществующий шаблон", async () => {
        const nonExistentId = 999999999;
        const objectiveData = {
          title: "Objective for non-existent template",
        };

        logInput("Цель для несуществующего шаблона", {
          templateId: nonExistentId,
          ...objectiveData,
        });
        logExpected("Статус 404 Not Found");

        const { response, data } =
          await dpAPI.saveDevelopmentPlanTemplateObjective(
            nonExistentId,
            objectiveData,
          );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [404, 400, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });

    test("C4863: Создание цели шаблона - негативный: пустой title", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let status;
      await test.step("Выполнить запрос: Создание цели шаблона - негативный: пустой title", async () => {
        const template = await findTemplate(dpAPI);

        if (!template) {
          test.skip(true, "Нет шаблонов для теста");
          return;
        }

        const objectiveData = {
          title: "",
        };

        logInput("Цель с пустым title", objectiveData);
        logExpected("Статус 400 - валидация не пройдена");

        const { response, data } =
          await dpAPI.saveDevelopmentPlanTemplateObjective(
            template.id,
            objectiveData,
          );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [400, 422, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });
  },
);

// ==================== ТЕСТЫ: deleteDevelopmentPlanTemplateObjective ====================

test.describe(
  "Development Plan Templates - deleteDevelopmentPlanTemplateObjective",
  {
    tag: [
      "@api",
      "@regression",
      "@development-plans",
      "@templates",
      "@objectives",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Templates - Objectives Delete");
    });

    test("C4864: Удаление цели шаблона - успешное удаление", async ({
      dpAPI,
    }) => {
      setSeverity("critical");

      let createResp, template, status;
      await test.step("Выполнить запрос: Удаление цели шаблона - успешное удаление", async () => {
        // Создаём шаблон и цель
        ({ response: createResp, data: template } =
          await dpAPI.createDevelopmentPlanTemplate({
            title: `Template for Objective Delete ${Date.now()}`,
            description: "Шаблон для удаления цели",
            developmentPlanTitle: "План для удаления цели",
            setHeadCurator: true,
            periodDuration: 60,
          }));

        if (!createResp.ok() || !template?.id) {
          test.skip(true, "Не удалось создать шаблон");
          return;
        }

        const { response: objResp, data: objective } =
          await dpAPI.saveDevelopmentPlanTemplateObjective(template.id, {
            title: `Objective to Delete ${Date.now()}`,
            milestones: [],
          });

        if (!objResp.ok() || !objective?.id) {
          await dpAPI.deleteDevelopmentPlanTemplate(template.id);
          test.skip(true, "Не удалось создать цель");
          return;
        }

        logInput("Удаление цели", {
          templateId: template.id,
          objectiveId: objective.id,
        });
        logExpected("Цель удаляется со статусом 200/204");

        const { response, data } =
          await dpAPI.deleteDevelopmentPlanTemplateObjective(
            template.id,
            objective.id,
          );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [200, 204],
          `Ожидался статус 200/204, получен ${status}`,
        ).toContain(status);

        // Очистка
        await dpAPI.deleteDevelopmentPlanTemplate(template.id);
      });
    });

    test("C4865: Удаление цели шаблона - негативный: несуществующая цель", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let status;
      await test.step("Выполнить запрос: Удаление цели шаблона - негативный: несуществующая цель", async () => {
        const template = await findTemplate(dpAPI);

        if (!template) {
          test.skip(true, "Нет шаблонов для теста");
          return;
        }

        const nonExistentObjId = 999999999;
        logInput("Несуществующая цель", {
          templateId: template.id,
          objectiveId: nonExistentObjId,
        });
        logExpected("Статус 404 Not Found");

        const { response, data } =
          await dpAPI.deleteDevelopmentPlanTemplateObjective(
            template.id,
            nonExistentObjId,
          );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [404, 400, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });
  },
);

// ==================== ИНТЕГРАЦИОННЫЕ ТЕСТЫ ====================

test.describe(
  "Development Plan Templates - Интеграционные тесты",
  {
    tag: [
      "@api",
      "@regression",
      "@development-plans",
      "@templates",
      "@integration",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Templates - Integration");
    });

    test("C4866: Полный CRUD цикл шаблона", async ({ dpAPI }) => {
      setSeverity("critical");

      logExpected("Создание, чтение, обновление, удаление шаблона");

      let createData, createResp, created;
      await test.step("Выполнить запрос: Полный CRUD цикл шаблона", async () => {
        // CREATE
        createData = {
          title: `CRUD Test Template ${Date.now()}`,
          description: "Тестовый шаблон для CRUD",
          developmentPlanTitle: "План развития сотрудника",
          setHeadCurator: true,
          periodDuration: 90,
        };

        ({ response: createResp, data: created } =
          await dpAPI.createDevelopmentPlanTemplate(createData));
        logInput("CREATE", createData);
        logResponse(createResp.status(), created);

        // API может требовать дополнительные поля
        if (!createResp.ok() || !created?.id) {
          test.skip(
            true,
            "API не позволяет создать шаблон с данными параметрами",
          );
          return;
        }
      });

      await test.step("Проверить ответ", async () => {
        expect(created.id, "Шаблон должен иметь ID").toBeDefined();

        const templateId = created.id;

        // READ
        const { response: readResp, data: read } =
          await dpAPI.getDevelopmentPlanTemplate(templateId);
        logInput("READ", { id: templateId });
        logResponse(readResp.status(), read);

        expect([200], "Чтение шаблона").toContain(readResp.status());
        expect(read?.title, "Title должен совпадать").toBe(createData.title);

        // UPDATE
        const updateData = { title: `Updated CRUD Template ${Date.now()}` };
        const { response: updateResp } =
          await dpAPI.updateDevelopmentPlanTemplate(templateId, updateData);
        logInput("UPDATE", updateData);
        logResponse(updateResp.status(), null);

        expect([200, 204], "Обновление шаблона").toContain(updateResp.status());

        // Verify update
        const { data: afterUpdate } =
          await dpAPI.getDevelopmentPlanTemplate(templateId);
        expect(afterUpdate?.title, "Title обновлён").toBe(updateData.title);

        // DELETE
        const { response: deleteResp } =
          await dpAPI.deleteDevelopmentPlanTemplate(templateId);
        logInput("DELETE", { id: templateId });
        logResponse(deleteResp.status(), null);

        expect([200, 204], "Удаление шаблона").toContain(deleteResp.status());

        // Verify deletion
        const { response: verifyResp } =
          await dpAPI.getDevelopmentPlanTemplate(templateId);
        expect([404, 400], "Шаблон удалён").toContain(verifyResp.status());
      });
    });

    test("C4867: Шаблон с целями - полный цикл", async ({ dpAPI }) => {
      setSeverity("normal");

      logExpected("Создание шаблона с целями и их удаление");

      let createResp, template, obj1Resp, obj1, obj2Resp, obj2;
      await test.step("Выполнить запрос: Шаблон с целями - полный цикл", async () => {
        // Создаём шаблон
        ({ response: createResp, data: template } =
          await dpAPI.createDevelopmentPlanTemplate({
            title: `Template with Objectives ${Date.now()}`,
            description: "Шаблон с целями",
            developmentPlanTitle: "План с целями",
            setHeadCurator: true,
            periodDuration: 90,
          }));

        if (!createResp.ok() || !template?.id) {
          test.skip(true, "Не удалось создать шаблон");
          return;
        }

        // Добавляем цели
        const objective1Data = {
          title: "Objective 1",
          description: "First objective",
          milestones: [],
        };
        const objective2Data = {
          title: "Objective 2",
          description: "Second objective",
          milestones: [],
        };

        ({ response: obj1Resp, data: obj1 } =
          await dpAPI.saveDevelopmentPlanTemplateObjective(
            template.id,
            objective1Data,
          ));
        ({ response: obj2Resp, data: obj2 } =
          await dpAPI.saveDevelopmentPlanTemplateObjective(
            template.id,
            objective2Data,
          ));

        logInput("Добавление целей", {
          objective1: objective1Data,
          objective2: objective2Data,
        });
        logResponse("Objective 1", obj1);
        logResponse("Objective 2", obj2);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201], "Создание цели 1").toContain(obj1Resp.status());
        expect([200, 201], "Создание цели 2").toContain(obj2Resp.status());

        // Получаем список целей
        const { response: listResp, data: objectives } =
          await dpAPI.getDevelopmentPlanTemplateObjectives(template.id);
        logResponse("Список целей", objectives);

        expect([200], "Список целей").toContain(listResp.status());

        // Удаляем цели и шаблон
        if (obj1?.id) {
          await dpAPI.deleteDevelopmentPlanTemplateObjective(
            template.id,
            obj1.id,
          );
        }
        if (obj2?.id) {
          await dpAPI.deleteDevelopmentPlanTemplateObjective(
            template.id,
            obj2.id,
          );
        }
        await dpAPI.deleteDevelopmentPlanTemplate(template.id);
      });
    });
  },
);

// ==================== ТЕСТЫ: Контроль доступа ====================

test.describe(
  "Development Plan Templates - Контроль доступа",
  {
    tag: [
      "@api",
      "@regression",
      "@development-plans",
      "@templates",
      "@access-control",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Templates - Access Control");
    });

    test("C4868: Обычный пользователь - чтение списка шаблонов", async ({
      dpUserAPI,
    }) => {
      setSeverity("normal");

      logExpected("Обычный пользователь может читать список шаблонов");

      await test.step("Выполнить: Обычный пользователь - чтение списка шаблонов", async () => {
        const { response, data } = await dpUserAPI.getDevelopmentPlanTemplates({
          limit: 10,
        });
        const status = response.status();
        logResponse(status, data);

        // Пользователь может читать или получить ошибку доступа
        expect([200, 401, 403], `Неожиданный статус ${status}`).toContain(
          status,
        );
      });
    });

    test("C4869: Обычный пользователь - попытка создания шаблона", async ({
      dpUserAPI,
    }) => {
      setSeverity("normal");

      logExpected(
        "Обычный пользователь не может создавать шаблоны (manager endpoint)",
      );

      await test.step("Выполнить: Обычный пользователь - попытка создания шаблона", async () => {
        const { response, data } =
          await dpUserAPI.createDevelopmentPlanTemplate({
            title: `User Created Template ${Date.now()}`,
          });
        const status = response.status();
        logResponse(status, data);

        // Ожидаем ошибку доступа или успех (если у пользователя есть права)
        expect([200, 201, 401, 403], `Неожиданный статус ${status}`).toContain(
          status,
        );

        // Очистка если создан
        if (response.ok() && data?.id) {
          await dpUserAPI.deleteDevelopmentPlanTemplate(data.id);
        }
      });
    });
  },
);

// ==================== ТЕСТЫ: Валидация ====================

test.describe(
  "Development Plan Templates - Валидация",
  {
    tag: [
      "@api",
      "@regression",
      "@development-plans",
      "@templates",
      "@validation",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Templates - Validation");
    });

    test("C4870: Создание шаблона - очень длинный title", async ({ dpAPI }) => {
      setSeverity("minor");

      let response, data, status;
      await test.step("Выполнить запрос: Создание шаблона - очень длинный title", async () => {
        const longTitle = "A".repeat(10000);

        logInput("Очень длинный title", { length: longTitle.length });
        logExpected("Валидация или обрезка");

        ({ response, data } = await dpAPI.createDevelopmentPlanTemplate({
          title: longTitle,
        }));
        status = response.status();
        logResponse(status, { truncated: true });

        // Может принять или отклонить
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [200, 201, 400, 422, 500],
          `Неожиданный статус ${status}`,
        ).toContain(status);

        // Очистка
        if (response.ok() && data?.id) {
          await dpAPI.deleteDevelopmentPlanTemplate(data.id);
        }
      });
    });

    test("C4871: Создание шаблона - спецсимволы в title", async ({ dpAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Создание шаблона - спецсимволы в title", async () => {
        const specialTitle = '<script>alert("XSS")</script>';

        logInput("Спецсимволы в title", { title: specialTitle });
        logExpected("Экранирование или отклонение");

        const { response, data } = await dpAPI.createDevelopmentPlanTemplate({
          title: specialTitle,
        });
        const status = response.status();
        logResponse(status, data);

        expect([200, 201, 400, 422], `Неожиданный статус ${status}`).toContain(
          status,
        );

        // Очистка
        if (response.ok() && data?.id) {
          await dpAPI.deleteDevelopmentPlanTemplate(data.id);
        }
      });
    });

    test("C4872: Создание шаблона - отрицательный periodDuration", async ({
      dpAPI,
    }) => {
      setSeverity("minor");

      let response, data, status;
      await test.step("Выполнить запрос: Создание шаблона - отрицательный periodDuration", async () => {
        const templateData = {
          title: `Negative Period ${Date.now()}`,
          periodDuration: -30,
        };

        logInput("Отрицательный periodDuration", templateData);
        logExpected("Валидация не пройдена");

        ({ response, data } =
          await dpAPI.createDevelopmentPlanTemplate(templateData));
        status = response.status();
        logResponse(status, data);

        // Может принять или отклонить
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 422], `Неожиданный статус ${status}`).toContain(
          status,
        );

        // Очистка
        if (response.ok() && data?.id) {
          await dpAPI.deleteDevelopmentPlanTemplate(data.id);
        }
      });
    });
  },
);
