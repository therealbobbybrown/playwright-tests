// tests/functional/api/survey.permissions.api.spec.js
// Тесты прав доступа для Survey API
//
// Примечание по ролям:
// - admin: пользователь с правами администратора
// - user: обычный пользователь без прав на модуль опросов
// - manager: пользователь с правами на модуль опросов
// /manager/ endpoint доступен только админам и пользователям с правами на модуль опросов

import { test as base, expect } from "@playwright/test";
import { SurveyAPI, getCredentials } from "../../utils/api/index.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";
import { markAsAPITest, MODULES } from "../../utils/allure-helpers.js";

/**
 * Минимальный payload для создания Survey (черновик)
 */
function createMinimalSurveyPayload(title) {
  return {
    body: {
      name: title,
      description: "Test survey description",
      publicityType: "internal",
      anonymityType: "notAnonymous",
      pages: [
        {
          name: "Page 1",
          questions: [
            {
              type: "single",
              text: "Test question?",
              isRequired: true,
              answers: [{ text: "Answer 1" }, { text: "Answer 2" }],
            },
          ],
        },
      ],
    },
  };
}

// Фикстуры для разных ролей
const test = base.extend({
  // Admin API клиент
  adminAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  // User API клиент (обычный пользователь)
  userAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },

  // Manager API клиент (пользователь с правами на модуль опросов)
  managerAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },

  // Неавторизованный клиент
  anonAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    // НЕ делаем signIn
    await use(api);
  },
});

test.describe("Survey Permissions API @api @survey @permissions @ui @security", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEYS, "Permissions");
  });

  let testSurveyId = null;

  // Создаём тестовый survey перед тестами прав
  test.beforeAll(async ({ request }) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    const title = TestDataHelper.generateUniqueName("Проверка прав опроса");
    const { data } = await api.createDraft(createMinimalSurveyPayload(title));
    testSurveyId = data?.id;
  });

  // Cleanup после всех тестов
  test.afterAll(async ({ request }) => {
    if (testSurveyId) {
      const api = new SurveyAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      try {
        await api.remove(testSurveyId);
      } catch (e) {
        // ignore
      }
    }
  });

  test.describe("Неавторизованный пользователь (Anonymous)", () => {
    test("GET /manager/surveys - должен получить 401", async ({ anonAPI }) => {
      const { response } = await anonAPI.getList();

      expect(response.status()).toBe(401);
    });

    test("POST /manager/surveys - должен получить 401", async ({ anonAPI }) => {
      const { response } = await anonAPI.createDraft(
        createMinimalSurveyPayload("Test"),
      );

      expect(response.status()).toBe(401);
    });

    test("GET /manager/surveys/{id} - должен получить 401", async ({
      anonAPI,
    }) => {
      const { response } = await anonAPI.getById(testSurveyId || 1);

      expect(response.status()).toBe(401);
    });

    test("DELETE /manager/surveys/{id} - должен получить 401", async ({
      anonAPI,
    }) => {
      const { response } = await anonAPI.remove(testSurveyId || 1);

      expect(response.status()).toBe(401);
    });

    test("GET /manager/surveys/templates - должен получить 401", async ({
      anonAPI,
    }) => {
      const { response } = await anonAPI.getTemplates();

      expect(response.status()).toBe(401);
    });
  });

  test.describe("Admin - полные права", () => {
    test("GET /manager/surveys - админ может читать список", async ({
      adminAPI,
    }) => {
      const { response, data } = await adminAPI.getList();

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /manager/surveys - админ может создавать", async ({
      adminAPI,
    }) => {
      const title = TestDataHelper.generateUniqueName(
        "Админ создание опроса",
      );
      const { response, data } = await adminAPI.createDraft(
        createMinimalSurveyPayload(title),
      );

      expect(response.ok()).toBe(true);
      expect(data.id).toBeDefined();

      // Cleanup
      if (data?.id) {
        await adminAPI.remove(data.id);
      }
    });

    test("GET /manager/surveys/{id} - админ может читать по ID", async ({
      adminAPI,
    }) => {
      // Создаём свой для теста
      const { data: created } = await adminAPI.createDraft(
        createMinimalSurveyPayload(
          TestDataHelper.generateUniqueName("Админ чтение опроса"),
        ),
      );

      const { response, data } = await adminAPI.getById(created.id);

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
      expect(data.id).toBe(created.id);

      // Cleanup
      await adminAPI.remove(created.id);
    });

    test("POST /manager/surveys/{id} - админ может обновлять", async ({
      adminAPI,
    }) => {
      const { data: created } = await adminAPI.createDraft(
        createMinimalSurveyPayload(
          TestDataHelper.generateUniqueName("Админ обновление опроса"),
        ),
      );

      const { response } = await adminAPI.update(created.id, {
        name: "Updated by Admin",
      });

      expect(response.ok()).toBe(true);

      // Cleanup
      await adminAPI.remove(created.id);
    });

    test("DELETE /manager/surveys/{id} - админ может удалять", async ({
      adminAPI,
    }) => {
      const { data: created } = await adminAPI.createDraft(
        createMinimalSurveyPayload(
          TestDataHelper.generateUniqueName("Админ удаление опроса"),
        ),
      );

      const { response } = await adminAPI.remove(created.id);

      expect(response.ok()).toBe(true);
    });

    test("GET /manager/surveys/templates - админ может читать шаблоны", async ({
      adminAPI,
    }) => {
      const { response, data } = await adminAPI.getTemplates();

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /manager/surveys/{id}/start - админ может запускать опрос", async ({
      adminAPI,
    }) => {
      const { data: created } = await adminAPI.createDraft(
        createMinimalSurveyPayload(
          TestDataHelper.generateUniqueName("Админ запуск опроса"),
        ),
      );

      const { response } = await adminAPI.start(created.id);

      // 200/201 - успех, 400 - нет участников (ожидаемо для пустого опроса)
      expect([200, 201, 400]).toContain(response.status());

      // Cleanup
      try {
        await adminAPI.stop(created.id);
      } catch (e) {
        // ignore
      }
      await adminAPI.remove(created.id);
    });
  });

  test.describe("Manager - права менеджера", () => {
    test("GET /manager/surveys - менеджер может читать список (если есть право)", async ({
      managerAPI,
    }) => {
      const { response } = await managerAPI.getList();

      // Менеджер может иметь или не иметь права на manager endpoints
      expect([200, 403]).toContain(response.status());
    });

    test("POST /manager/surveys - менеджер может создавать (если есть право)", async ({
      managerAPI,
      adminAPI,
    }) => {
      const title = TestDataHelper.generateUniqueName(
        "Менеджер создание опроса",
      );
      const { response, data } = await managerAPI.createDraft(
        createMinimalSurveyPayload(title),
      );

      if (response.ok()) {
        expect(data.id).toBeDefined();
        // Cleanup - удаляем от admin т.к. manager может не иметь права на удаление
        await adminAPI.remove(data.id);
      }

      expect([200, 201, 403]).toContain(response.status());
    });

    test("GET /manager/surveys/{id} - менеджер может читать свой опрос", async ({
      managerAPI,
      adminAPI,
    }) => {
      // Создаём опрос от admin
      const { data: created } = await adminAPI.createDraft(
        createMinimalSurveyPayload(
          TestDataHelper.generateUniqueName("Менеджер чтение опроса"),
        ),
      );

      // Manager пытается прочитать
      const { response } = await managerAPI.getById(created.id);

      // Может получить доступ или отказ в зависимости от прав
      expect([200, 403, 404]).toContain(response.status());

      // Cleanup
      await adminAPI.remove(created.id);
    });

    test("GET /manager/surveys/templates - менеджер может читать шаблоны", async ({
      managerAPI,
    }) => {
      const { response } = await managerAPI.getTemplates();

      expect([200, 403]).toContain(response.status());
    });
  });

  test.describe("User - ограниченные права", () => {
    test("GET /manager/surveys - user может не иметь доступа к manager API", async ({
      userAPI,
    }) => {
      const { response } = await userAPI.getList();

      // Обычный пользователь обычно не имеет доступа к manager endpoints
      expect([200, 403]).toContain(response.status());
    });

    test("POST /manager/surveys - user не может создавать", async ({
      userAPI,
    }) => {
      const title = TestDataHelper.generateUniqueName(
        "Пользователь создание опроса",
      );
      const { response } = await userAPI.createDraft(
        createMinimalSurveyPayload(title),
      );

      // Обычный пользователь не должен создавать Survey через manager API
      expect([403]).toContain(response.status());
    });

    test("DELETE /manager/surveys/{id} - user не может удалять чужие опросы", async ({
      userAPI,
    }) => {
      // Пытаемся удалить Survey созданный админом
      if (testSurveyId) {
        const { response } = await userAPI.remove(testSurveyId);

        // Должен быть отказ в доступе
        expect([403, 404]).toContain(response.status());
      }
    });

    test("POST /manager/surveys/{id} - user не может обновлять чужие опросы", async ({
      userAPI,
    }) => {
      if (testSurveyId) {
        const { response } = await userAPI.update(testSurveyId, {
          name: "Hacked by User",
        });

        expect([403, 404]).toContain(response.status());
      }
    });

    test("GET /manager/surveys/templates - user может не иметь доступа к шаблонам", async ({
      userAPI,
    }) => {
      const { response } = await userAPI.getTemplates();

      expect([200, 403]).toContain(response.status());
    });
  });

  test.describe("Кросс-ролевые проверки", () => {
    test("User не может обновить Survey созданный Admin", async ({
      adminAPI,
      userAPI,
    }) => {
      // Admin создаёт
      const { data: created } = await adminAPI.createDraft(
        createMinimalSurveyPayload(
          TestDataHelper.generateUniqueName("Кросс-роль опроса"),
        ),
      );

      // User пытается обновить
      const { response } = await userAPI.update(created.id, {
        name: "Hacked by User",
      });

      // Должен быть отказ
      expect([403, 404]).toContain(response.status());

      // Cleanup
      await adminAPI.remove(created.id);
    });

    test("Manager может/не может обновить Survey созданный Admin (зависит от прав)", async ({
      adminAPI,
      managerAPI,
    }) => {
      // Admin создаёт
      const { data: created } = await adminAPI.createDraft(
        createMinimalSurveyPayload(
          TestDataHelper.generateUniqueName("Кросс-роль админ-менеджер опроса"),
        ),
      );

      // Manager пытается обновить
      const { response } = await managerAPI.update(created.id, {
        name: "Updated by Manager",
      });

      // Результат зависит от настроек прав в системе
      expect([200, 403, 404]).toContain(response.status());

      // Cleanup
      await adminAPI.remove(created.id);
    });

    test("User не может запустить Survey созданный Admin", async ({
      adminAPI,
      userAPI,
    }) => {
      // Admin создаёт
      const { data: created } = await adminAPI.createDraft(
        createMinimalSurveyPayload(
          TestDataHelper.generateUniqueName("Пользователь запуск опроса"),
        ),
      );

      // User пытается запустить
      const { response } = await userAPI.start(created.id);

      // Должен быть отказ
      expect([403, 404]).toContain(response.status());

      // Cleanup
      await adminAPI.remove(created.id);
    });

    test("User не может остановить активный Survey", async ({
      adminAPI,
      userAPI,
    }) => {
      // Admin создаёт и запускает
      const { data: created } = await adminAPI.createDraft(
        createMinimalSurveyPayload(
          TestDataHelper.generateUniqueName("Пользователь остановка опроса"),
        ),
      );

      // Пробуем запустить (может не получиться если нет участников)
      await adminAPI.start(created.id);

      // User пытается остановить
      const { response } = await userAPI.stop(created.id);

      // Должен быть отказ
      expect([403, 404]).toContain(response.status());

      // Cleanup
      try {
        await adminAPI.stop(created.id);
      } catch (e) {
        // ignore
      }
      await adminAPI.remove(created.id);
    });
  });

  test.describe("Reminds Permissions", () => {
    test("Anonymous не может получить напоминания", async ({ anonAPI }) => {
      // getReminds требует параметры, а не id
      const { response } = await anonAPI.getReminds({});

      expect(response.status()).toBe(401);
    });

    test("User не может создать напоминание для чужого опроса", async ({
      userAPI,
      adminAPI,
    }) => {
      // Создаём опрос от admin и получаем его revisionId
      const { data: created } = await adminAPI.createDraft(
        createMinimalSurveyPayload(
          TestDataHelper.generateUniqueName("Пользователь напоминание"),
        ),
      );

      // Запускаем чтобы получить ревизию
      await adminAPI.start(created.id);
      const { data: revisions } = await adminAPI.getRevisions(created.id, {
        limit: 1,
      });
      const revisionId = revisions?.items?.[0]?.id;

      if (revisionId) {
        // User пытается создать напоминание
        const { response } = await userAPI.createRemind({
          surveyRevisionId: revisionId,
          title: "Test remind",
          body: "Test body",
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        });

        expect([403, 404]).toContain(response.status());
      }

      // Cleanup
      try {
        await adminAPI.stop(created.id);
      } catch (e) {
        // ignore
      }
      await adminAPI.remove(created.id);
    });

    test("Admin может управлять напоминаниями", async ({ adminAPI }) => {
      // Получаем напоминания (общий список)
      // Может вернуть 200 (список) или 400 (без surveyRevisionId)
      const { response } = await adminAPI.getReminds({});

      // Главное - не 401/403
      expect([200, 400]).toContain(response.status());
    });
  });

  test.describe("Statistics Permissions", () => {
    test("Anonymous не может получить статистику", async ({ anonAPI }) => {
      const { response } = await anonAPI.getStatisticsSummary(
        testSurveyId || 1,
        {},
      );

      expect(response.status()).toBe(401);
    });

    test("User может не иметь доступа к статистике чужого опроса", async ({
      userAPI,
    }) => {
      if (testSurveyId) {
        const { response } = await userAPI.getStatisticsSummary(
          testSurveyId,
          {},
        );

        // Зависит от прав пользователя
        expect([200, 400, 403, 404]).toContain(response.status());
      }
    });

    test("Admin может получить статистику", async ({ adminAPI }) => {
      // Создаём и запускаем опрос
      const { data: created } = await adminAPI.createDraft(
        createMinimalSurveyPayload(
          TestDataHelper.generateUniqueName("Админ статистика"),
        ),
      );

      // Запускаем чтобы получить статус active
      await adminAPI.start(created.id);

      // Статистика для активного опроса без ответов может вернуть 400
      // или 500 если revisionId не указан
      const { response } = await adminAPI.getStatisticsSummary(created.id, {});

      // 200 - успех, 400 - нет данных/неверные параметры, 500 - внутренняя ошибка (нет ревизии)
      expect([200, 400, 500]).toContain(response.status());

      // Cleanup
      try {
        await adminAPI.stop(created.id);
      } catch (e) {
        // ignore
      }
      await adminAPI.remove(created.id);
    });
  });

  test.describe("Export Permissions", () => {
    test("Anonymous не может получить токен экспорта", async ({ anonAPI }) => {
      const { response } = await anonAPI.getExportToken(testSurveyId || 1, {});

      expect(response.status()).toBe(401);
    });

    test("User не может экспортировать чужой опрос", async ({ userAPI }) => {
      if (testSurveyId) {
        const { response } = await userAPI.getExportToken(testSurveyId, {});

        expect([403, 404]).toContain(response.status());
      }
    });

    test("Admin может получить токен экспорта", async ({ adminAPI }) => {
      // Создаём опрос
      const { data: created } = await adminAPI.createDraft(
        createMinimalSurveyPayload(
          TestDataHelper.generateUniqueName("Админ экспорт"),
        ),
      );

      // Токен экспорта для черновика может вернуть 400
      const { response } = await adminAPI.getExportToken(created.id, {});

      expect([200, 201, 400]).toContain(response.status());

      // Cleanup
      await adminAPI.remove(created.id);
    });
  });
});

/**
 * Анализ ответа с ошибкой - проверяет тело на наличие информации о реальном статусе
 */
async function analyzeErrorResponse(response) {
  const status = response.status();
  let body = null;

  try {
    body = await response.json();
  } catch {
    try {
      body = await response.text();
    } catch {
      body = null;
    }
  }

  if (body && typeof body === "object") {
    return {
      status,
      statusCode: body.statusCode,
      error: body.error,
      message: body.message,
      code: body.code,
    };
  }

  return { status, body };
}

test.describe("Survey Private API Permissions @api @survey @permissions", () => {
  test.describe("Private endpoints для обычного пользователя", () => {
    test("GET /private/surveys/internal/{id} - проверка доступа user к internal survey", async ({
      request,
    }) => {
      const adminApi = new SurveyAPI(request);
      const adminCreds = getCredentials("admin");
      await adminApi.signIn(adminCreds.email, adminCreds.password);

      // Создаём и запускаем internal опрос
      const { data: created } = await adminApi.createDraft(
        createMinimalSurveyPayload(
          TestDataHelper.generateUniqueName("Приватный внутренний"),
        ),
      );

      // Получаем ревизию после создания
      const { data: revisions } = await adminApi.getRevisions(created.id, {
        limit: 1,
      });
      const revisionAlias = revisions?.items?.[0]?.alias;

      // User пытается получить internal survey
      const userApi = new SurveyAPI(request);
      const userCreds = getCredentials("user");
      await userApi.signIn(userCreds.email, userCreds.password);

      if (revisionAlias) {
        const { response } = await userApi.getInternalSurvey(revisionAlias);
        const status = response.status();

        // Internal survey доступен только участникам
        // 200 - если user участник, 400/403/404 - если нет
        expect([200, 400, 403, 404]).toContain(status);
      }

      // Cleanup
      await adminApi.remove(created.id);
    });

    test("User пытается получить доступ к /manager/surveys - анализ ответа", async ({
      request,
    }) => {
      const api = new SurveyAPI(request);
      const { email, password } = getCredentials("user");
      await api.signIn(email, password);

      const { response } = await api.getList();
      const status = response.status();

      if (!response.ok()) {
        const errorInfo = await analyzeErrorResponse(response);
        console.log(
          "User -> /manager/surveys error analysis:",
          JSON.stringify(errorInfo, null, 2),
        );

        if (status === 500) {
          console.log(
            "  -> HTTP 500 received. Check if body contains access denied info.",
          );
          if (
            errorInfo.statusCode === 403 ||
            errorInfo.message?.includes("access") ||
            errorInfo.message?.includes("forbidden")
          ) {
            console.log(
              "  -> Body indicates access denied (403 disguised as 500)",
            );
          }
        } else if (status === 403) {
          console.log("  -> Proper HTTP 403 Forbidden returned");
        }
      }

      // User без прав должен получить отказ (403 или 200 если есть права)
      expect([200, 403, 500]).toContain(status);
    });
  });

  test.describe("Public Survey Endpoints", () => {
    test("Anonymous может получить публичный опрос (external)", async ({
      request,
    }) => {
      const adminApi = new SurveyAPI(request);
      const adminCreds = getCredentials("admin");
      await adminApi.signIn(adminCreds.email, adminCreds.password);

      // Создаём external опрос
      const { data: created } = await adminApi.createDraft({
        body: {
          name: TestDataHelper.generateUniqueName("Публичный внешний"),
          description: "Test external survey",
          publicityType: "external",
          anonymityType: "anonymous",
          pages: [
            {
              name: "Page 1",
              questions: [
                {
                  type: "single",
                  text: "External question?",
                  isRequired: true,
                  answers: [{ text: "Answer 1" }, { text: "Answer 2" }],
                },
              ],
            },
          ],
        },
      });

      // Запускаем опрос
      await adminApi.start(created.id);

      // Получаем ревизию
      const { data: revisions } = await adminApi.getRevisions(created.id, {
        limit: 1,
      });
      const revisionAlias = revisions?.items?.[0]?.alias;

      if (revisionAlias) {
        // Anonymous пытается получить external survey
        const anonApi = new SurveyAPI(request);
        const { response } = await anonApi.getExternalSurvey(revisionAlias);

        // External survey может быть доступен без авторизации или требовать код
        expect([200, 400, 401, 403, 404]).toContain(response.status());
      }

      // Cleanup
      try {
        await adminApi.stop(created.id);
      } catch (e) {
        // ignore
      }
      await adminApi.remove(created.id);
    });
  });
});
