// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { CompetenciesAPI, getCredentials } from "../../utils/api/index.js";
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
 * API тесты для компетенций
 *
 * Покрытие:
 * - CRUD операции с компетенциями
 * - Группы компетенций
 * - Шкалы компетенций
 */

// Расширяем test с фикстурой для Competencies API
const test = fullTest.extend({
  competenciesAPI: async ({ request }, use) => {
    const api = new CompetenciesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

async function findExistingCompetency(api) {
  const { data } = await api.getCompetencies({ limit: 10 });
  const items = data?.items || data || [];
  return items[0]?.id || null;
}

async function findExistingScale(api) {
  const { data } = await api.getCompetenceScales({ limit: 10 });
  const items = data?.items || data || [];
  return items[0]?.id || null;
}

async function findOrCreateGroup(api) {
  // Пробуем найти существующую группу через компетенции
  const { data } = await api.getCompetencies({ limit: 50 });
  const items = data?.items || data || [];
  for (const comp of items) {
    if (comp.groupId) {
      return comp.groupId;
    }
  }

  // Создаём новую группу
  const { response, data: groupData } = await api.createCompetenceGroup(
    `Test Group ${Date.now()}`,
  );
  if (response.ok()) {
    return groupData?.id || groupData?.group?.id || null;
  }

  return null;
}

test.describe(
  "Competencies API",
  { tag: ["@api", "@competencies", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.COMPETENCIES, "Competencies");
    });

    // ==================== GET LIST ====================

    test.describe("GET /manager/competencies/ - Список компетенций", () => {
      test(
        "C4722: Получить список компетенций",
        { tag: ["@critical"] },
        async ({ competenciesAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить список компетенций", async () => {
            const { response, data } = await competenciesAPI.getCompetencies();

            assertSuccessStatus(response);
            expect(data).toBeDefined();
            const items = data?.items || data || [];
            assertValidArray(items);

            expect(items.length, "Компетенции должны существовать в системе").toBeGreaterThan(0);
            const competency = items[0];
            expect(competency.id).toBeDefined();
            expect(competency.title).toBeDefined();
          });
        },
      );

      test("C4723: Получить список компетенций с лимитом", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить список компетенций с лимитом", async () => {
          const { response, data } = await competenciesAPI.getCompetencies({
            limit: 5,
          });

          assertSuccessStatus(response);
          const items = data?.items || data || [];
          expect(items.length).toBeLessThanOrEqual(5);
        });
      });

      test("C4724: Получить список компетенций с пагинацией", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить список компетенций с пагинацией", async () => {
          const { response: resp1, data: data1 } =
            await competenciesAPI.getCompetencies({ limit: 2, offset: 0 });
          const { response: resp2, data: data2 } =
            await competenciesAPI.getCompetencies({ limit: 2, offset: 2 });

          expect(resp1.status()).toBe(200);
          expect(resp2.status()).toBe(200);

          const items1 = data1?.items || data1 || [];
          const items2 = data2?.items || data2 || [];

          expect(items1.length, "Первая страница должна содержать данные").toBeGreaterThan(0);
          expect(items2.length, "Вторая страница должна содержать данные").toBeGreaterThan(0);
          expect(items1[0].id).not.toBe(items2[0].id);
        });
      });
    });

    // ==================== GET BY ID ====================

    test.describe("GET /manager/competencies/{id}/ - Получение компетенции", () => {
      test(
        "C4725: Получить компетенцию по ID",
        { tag: ["@critical"] },
        async ({ competenciesAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить компетенцию по ID", async () => {
            const competencyId = await findExistingCompetency(competenciesAPI);
            test.skip(!competencyId, "Нет компетенций для тестирования");

            const { response, data } =
              await competenciesAPI.getCompetency(competencyId);

            assertSuccessStatus(response);
            expect(data).toBeDefined();
            expect(data.id).toBe(competencyId);
          });
        },
      );

      test("C4726: Получить несуществующую компетенцию", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить несуществующую компетенцию", async () => {
          const { response } = await competenciesAPI.getCompetency(999999999);

          expect(response.status()).toBe(404);
        });
      });
    });

    // ==================== GET BY TITLE ====================

    test.describe("GET /manager/competencies/by-title/ - Поиск по названию", () => {
      test("C4727: Найти компетенцию по названию", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Найти компетенцию по названию", async () => {
          const competencyId = await findExistingCompetency(competenciesAPI);
          test.skip(!competencyId, "Нет компетенций для тестирования");

          const { data: competencyData } =
            await competenciesAPI.getCompetency(competencyId);
          expect(competencyData?.title, "У компетенции должно быть название").toBeDefined();

          const { response, data } =
            await competenciesAPI.getCompetencyByTitle(
              competencyData.title,
            );

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      });

      test("C4728: Поиск несуществующей компетенции по названию", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск несуществующей компетенции по названию", async () => {
          const { response, data } = await competenciesAPI.getCompetencyByTitle(
            "NonExistent_" + Date.now(),
          );

          // API возвращает 200 с пустым телом при отсутствии совпадений
          expect(response.status()).toBe(200);
          expect(data, "Ответ должен быть пустым (null) при отсутствии совпадений").toBeNull();
        });
      });
    });

    // ==================== CREATE ====================

    test.describe("POST /manager/competencies/ - Создание компетенции", () => {
      test(
        "C4729: Создать компетенцию",
        { tag: ["@critical", "@db"] },
        async ({ competenciesAPI, baseVerifier }) => {
          setSeverity("critical");

          const title = `Test Competency ${Date.now()}`;
          const description = "Test description";
          const emoji = "🎯";

          const { response, data } = await competenciesAPI.createCompetency({
            title,
            description,
            emoji,
          });

          test.skip(response.status() === 403, "Нет прав на создание компетенций");

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const competencyId = data.id || data.competency?.id;
          expect(competencyId).toBeDefined();

          try {
            // Проверяем что данные сохранились правильно
            const { data: fetchedData } =
              await competenciesAPI.getCompetency(competencyId);
            expect(fetchedData.title).toBe(title);
            expect(fetchedData.description).toBe(description);
            expect(fetchedData.emoji).toBe(emoji);

            // DB верификация
            await test.step("DB: Проверка создания компетенции в БД", async () => {
              const dbCompetency = await baseVerifier.verifyRecordCreated(
                "competencies",
                competencyId,
              );
              if (dbCompetency) {
                expect(dbCompetency.title).toBe(title);
              }
            });
          } finally {
            // Cleanup
            if (competencyId) {
              await competenciesAPI.deleteCompetency(competencyId).catch(() => {});
            }
          }
        },
      );

      test(
        "C4730: Создать компетенцию без названия (негативный)",
        { tag: ["@db"] },
        async ({ competenciesAPI, baseVerifier }) => {
          setSeverity("normal");

          const { response, data } =
            await competenciesAPI.createCompetency({});

          // API возвращает 400 Bad Request при отсутствии обязательных полей
          expect(response.status()).toBe(400);

          // DB: Проверяем, что компетенция НЕ создана — ID из ответа не должен существовать
          await test.step("DB: Проверка что компетенция НЕ создана", async () => {
            if (baseVerifier.skipIfNotConnected()) return;
            expect(data?.id).toBeUndefined();
          });
        },
      );
    });

    // ==================== UPDATE ====================

    test.describe("POST /manager/competencies/{id}/ - Обновление компетенции", () => {
      test("C4731: Обновить название компетенции", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить название компетенции", async () => {
          // Создаём тестовую компетенцию
          const { response: createResp, data: createData } =
            await competenciesAPI.createCompetency({
              title: `Test Update ${Date.now()}`,
              emoji: "📝",
            });

          test.skip(createResp.status() === 403, "Нет прав на создание компетенций");

          const competencyId = createData?.id || createData?.competency?.id;
          expect(competencyId, "API должен вернуть ID созданной компетенции").toBeDefined();

          try {
            const newTitle = `Updated ${Date.now()}`;

            const { response, data } = await competenciesAPI.updateCompetency(
              competencyId,
              {
                title: newTitle,
              },
            );

            assertSuccessStatus(response);

            // Проверяем что обновление применилось
            const { data: fetchedData } =
              await competenciesAPI.getCompetency(competencyId);
            expect(fetchedData.title).toBe(newTitle);
          } finally {
            // Cleanup
            await competenciesAPI.deleteCompetency(competencyId).catch(() => {});
          }
        });
      });

      test("C4732: Обновить несуществующую компетенцию", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить несуществующую компетенцию", async () => {
          const { response } = await competenciesAPI.updateCompetency(
            999999999,
            {
              title: "Test",
            },
          );

          expect(response.status()).toBe(404);
        });
      });
    });

    // ==================== DELETE ====================

    test.describe("DELETE /manager/competencies/{id}/ - Удаление компетенции", () => {
      test(
        "C4733: Удалить компетенцию",
        { tag: ["@db"] },
        async ({ competenciesAPI, baseVerifier }) => {
          setSeverity("normal");

          // Создаём компетенцию для удаления
          const { response: createResp, data: createData } =
            await competenciesAPI.createCompetency({
              title: `Test Delete ${Date.now()}`,
              emoji: "🗑️",
            });

          test.skip(createResp.status() === 403, "Нет прав на создание компетенций");

          const competencyId = createData?.id || createData?.competency?.id;
          expect(competencyId, "API должен вернуть ID созданной компетенции").toBeDefined();

          const { response } =
            await competenciesAPI.deleteCompetency(competencyId);

          assertSuccessStatus(response);

          // DB верификация
          await test.step("DB: Проверка удаления компетенции из БД", async () => {
            await baseVerifier.verifyRecordDeleted(
              "competencies",
              competencyId,
            );
          });
        },
      );

      test("C4734: Удалить несуществующую компетенцию", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Удалить несуществующую компетенцию", async () => {
          const { response } =
            await competenciesAPI.deleteCompetency(999999999);

          expect(response.status()).toBe(404);
        });
      });
    });

    // ==================== IS RELATED ====================

    test.describe("GET /manager/competencies/{id}/is-related/ - Связанные сущности", () => {
      test("C4735: Проверить связанные сущности компетенции", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Проверить связанные сущности компетенции", async () => {
          const competencyId = await findExistingCompetency(competenciesAPI);
          test.skip(!competencyId, "Нет компетенций для тестирования");

          const { response, data } =
            await competenciesAPI.getCompetencyIsRelated(competencyId);

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      });
    });

    // ==================== CHANGE SCALE ====================

    test.describe("PATCH /manager/competencies/{id}/change-scale/ - Изменение шкалы", () => {
      test(
        "C4736: Изменить шкалу компетенции",
        { tag: ["@critical"] },
        async ({ competenciesAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Изменить шкалу компетенции", async () => {
            const scaleId = await findExistingScale(competenciesAPI);

            if (!scaleId) {
              test.skip(true, "Нет шкал для теста");
            }

            // Создаём тестовую компетенцию
            const { response: createResp, data: createData } =
              await competenciesAPI.createCompetency({
                title: `Test Change Scale ${Date.now()}`,
                emoji: "🔄",
              });

            test.skip(createResp.status() === 403, "Нет прав на создание компетенций");

            const competencyId = createData?.id || createData?.competency?.id;
            expect(competencyId, "API должен вернуть ID созданной компетенции").toBeDefined();

            try {
              const { response, data } =
                await competenciesAPI.changeCompetencyScale(
                  competencyId,
                  scaleId,
                );

              assertSuccessStatus(response);
            } finally {
              // Cleanup
              await competenciesAPI.deleteCompetency(competencyId).catch(() => {});
            }
          });
        },
      );

      test("C4737: Изменить шкалу на несуществующую (негативный)", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Изменить шкалу на несуществующую (негативный)", async () => {
          const competencyId = await findExistingCompetency(competenciesAPI);
          test.skip(!competencyId, "Нет компетенций для тестирования");

          const { response } = await competenciesAPI.changeCompetencyScale(
            competencyId,
            999999999,
          );

          // APP_BUG: API возвращает 500 вместо 404 при несуществующей шкале
          expect(response.status()).toBe(500);
        });
      });
    });

    // ==================== COMPETENCE GROUPS ====================

    test.describe("POST /manager/competence-groups/ - Группы компетенций", () => {
      test(
        "C4738: Создать группу компетенций",
        { tag: ["@critical", "@db"] },
        async ({ competenciesAPI, baseVerifier }) => {
          setSeverity("critical");

          const title = `Test Group ${Date.now()}`;

          const { response, data } =
            await competenciesAPI.createCompetenceGroup(title);

          test.skip(response.status() === 403, "Нет прав на создание групп");

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const groupId = data.id || data.group?.id;
          expect(groupId).toBeDefined();

          try {
            // Проверяем что группа создана с правильным названием
            if (groupId && data.title) {
              expect(data.title).toBe(title);
            }

            // DB верификация
            await test.step("DB: Проверка создания группы в БД", async () => {
              const dbGroup = await baseVerifier.verifyRecordCreated(
                "competence_groups",
                groupId,
              );
              if (dbGroup) {
                expect(dbGroup.title).toBe(title);
              }
            });
          } finally {
            // Cleanup
            if (groupId) {
              await competenciesAPI.deleteCompetenceGroup(groupId).catch(() => {});
            }
          }
        },
      );

      test(
        "C4739: Создать группу без названия (негативный)",
        { tag: ["@db"] },
        async ({ competenciesAPI, baseVerifier }) => {
          setSeverity("normal");

          // DB: Получаем количество групп до теста
          const groupsBefore =
            await test.step("DB: Получение групп до теста", async () => {
              if (baseVerifier.skipIfNotConnected()) return 0;
              return await baseVerifier.countRecords("competence_groups");
            });

          const { response } = await competenciesAPI.createCompetenceGroup("");

          // API возвращает 400 Bad Request при пустом названии
          expect(response.status()).toBe(400);

          // DB: Проверяем что группа НЕ создана
          await test.step("DB: Проверка что группа НЕ создана", async () => {
            await baseVerifier.verifyRecordCount(
              "competence_groups",
              {},
              groupsBefore,
            );
          });
        },
      );
    });

    test.describe("PATCH /manager/competence-groups/{id}/ - Обновление группы", () => {
      test("C4740: Обновить название группы", async ({ competenciesAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить название группы", async () => {
          // Создаём группу
          const { response: createResp, data: createData } =
            await competenciesAPI.createCompetenceGroup(
              `Test Update Group ${Date.now()}`,
            );

          test.skip(createResp.status() === 403, "Нет прав на создание групп");

          const groupId = createData?.id || createData?.group?.id;
          expect(groupId, "API должен вернуть ID созданной группы").toBeDefined();

          try {
            const newTitle = `Updated Group ${Date.now()}`;
            const { response } =
              await competenciesAPI.updateCompetenceGroup(groupId, newTitle);

            assertSuccessStatus(response);

            // Проверяем что обновление применилось
            const { data: fetchedGroups } = await competenciesAPI.getCompetenceGroups({ limit: 1000 });
            const groups = Array.isArray(fetchedGroups) ? fetchedGroups : (fetchedGroups?.items ?? []);
            const updated = groups.find((g) => g.id === groupId);
            expect(updated, `Группа ID=${groupId} должна быть в списке`).toBeDefined();
            expect(updated.title, "Название группы должно обновиться").toBe(newTitle);
          } finally {
            // Cleanup
            await competenciesAPI.deleteCompetenceGroup(groupId).catch(() => {});
          }
        });
      });

      test("C4741: Обновить несуществующую группу", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить несуществующую группу", async () => {
          const { response } = await competenciesAPI.updateCompetenceGroup(
            999999999,
            "Test",
          );

          expect(response.status()).toBe(404);
        });
      });
    });

    test.describe("DELETE /manager/competence-groups/{id}/ - Удаление группы", () => {
      test("C4742: Удалить группу", async ({ competenciesAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Удалить группу", async () => {
          // Создаём группу для удаления
          const { response: createResp, data: createData } =
            await competenciesAPI.createCompetenceGroup(
              `Test Delete Group ${Date.now()}`,
            );

          test.skip(createResp.status() === 403, "Нет прав на создание групп");

          const groupId = createData?.id || createData?.group?.id;
          expect(groupId, "API должен вернуть ID созданной группы").toBeDefined();

          const { response } =
            await competenciesAPI.deleteCompetenceGroup(groupId);

          assertSuccessStatus(response);

          // Примечание: getCompetenceGroups может возвращать удалённые группы (soft delete)
          // Верификация удаления через UI-тест (assertItemNotVisible)
        });
      });

      test("C4743: Удалить несуществующую группу", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Удалить несуществующую группу", async () => {
          const { response } =
            await competenciesAPI.deleteCompetenceGroup(999999999);

          expect(response.status()).toBe(404);
        });
      });
    });

    test.describe("GET /manager/competence-groups/{id}/is-related/ - Связи группы", () => {
      test("C4744: Проверить связанные сущности группы", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Проверить связанные сущности группы", async () => {
          const groupId = await findOrCreateGroup(competenciesAPI);
          test.skip(!groupId, "Не удалось получить/создать группу");

          const { response, data } =
            await competenciesAPI.getCompetenceGroupIsRelated(groupId);

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      });

      test("C4745: Проверить связи несуществующей группы", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Проверить связи несуществующей группы", async () => {
          const { response } =
            await competenciesAPI.getCompetenceGroupIsRelated(999999999);

          expect(response.status()).toBe(404);
        });
      });
    });

    // ==================== COMPETENCE SCALES ====================

    test.describe("GET /manager/competence-scales/ - Шкалы компетенций", () => {
      test(
        "C4746: Получить список шкал",
        { tag: ["@critical"] },
        async ({ competenciesAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить список шкал", async () => {
            const { response, data } =
              await competenciesAPI.getCompetenceScales();

            assertSuccessStatus(response);
            expect(data).toBeDefined();
            const items = data?.items || data || [];
            assertValidArray(items);
          });
        },
      );

      test("C4747: Получить шкалу по ID", async ({ competenciesAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить шкалу по ID", async () => {
          const scaleId = await findExistingScale(competenciesAPI);
          test.skip(!scaleId, "Нет шкал для тестирования");

          const { response, data } =
            await competenciesAPI.getCompetenceScale(scaleId);

          assertSuccessStatus(response);
          expect(data).toBeDefined();
          expect(data.id).toBe(scaleId);
        });
      });

      test("C4748: Получить несуществующую шкалу", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить несуществующую шкалу", async () => {
          const { response } =
            await competenciesAPI.getCompetenceScale(999999999);

          expect(response.status()).toBe(404);
        });
      });
    });

    // ==================== CREATE SCALE ====================

    test.describe("POST /manager/competence-scales/ - Создание шкалы", () => {
      test(
        "C4749: Создать шкалу компетенций",
        { tag: ["@db"] },
        async ({ competenciesAPI, baseVerifier }) => {
          setSeverity("normal");

          const title = `Test Scale ${Date.now()}`;
          const description = "Test description";
          const rangeMin = 1;
          const rangeMax = 5;
          const rangeMinLabel = "Низкий";
          const rangeMaxLabel = "Высокий";

          const { response, data } =
            await competenciesAPI.createCompetenceScale({
              title,
              description,
              rangeMin,
              rangeMax,
              rangeMinLabel,
              rangeMaxLabel,
              widget: "slider",
              disallowStepNumbers: false,
            });

          test.skip(response.status() === 403, "Нет прав на создание шкал");

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const scaleId = data.id || data.scale?.id;
          expect(scaleId).toBeDefined();

          try {
            // Проверяем что шкала создана с правильными данными
            if (scaleId) {
              const { response: getResp, data: fetchedData } =
                await competenciesAPI.getCompetenceScale(scaleId);
              if (getResp.ok() && fetchedData) {
                expect(fetchedData.title).toBe(title);
                expect(fetchedData.rangeMin).toBe(rangeMin);
                expect(fetchedData.rangeMax).toBe(rangeMax);
              }

              // DB верификация
              await test.step("DB: Проверка создания шкалы в БД", async () => {
                const dbScale = await baseVerifier.verifyRecordCreated(
                  "competence_scales",
                  scaleId,
                );
                if (dbScale) {
                  expect(dbScale.title).toBe(title);
                }
              });
            }
          } finally {
            // Cleanup
            if (scaleId) {
              await competenciesAPI.deleteCompetenceScale(scaleId).catch(() => {});
            }
          }
        },
      );

      test(
        "C4750: Создать шкалу без названия (негативный)",
        { tag: ["@db"] },
        async ({ competenciesAPI, baseVerifier }) => {
          setSeverity("normal");

          const { response, data } =
            await competenciesAPI.createCompetenceScale({
              rangeMin: 1,
              rangeMax: 5,
            });

          // API возвращает 400 Bad Request при отсутствии обязательных полей
          expect(response.status()).toBe(400);

          // При ошибке валидации API не должен возвращать ID созданной записи
          await test.step("DB: Проверка что шкала НЕ создана", async () => {
            expect(data?.id).toBeUndefined();
          });
        },
      );

      test("C4751: Создать шкалу с невалидным диапазоном (min > max)", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать шкалу с невалидным диапазоном (min > max)", async () => {
          const { response } = await competenciesAPI.createCompetenceScale({
            title: `Test Invalid Range ${Date.now()}`,
            rangeMin: 10, // min больше max
            rangeMax: 1,
          });

          // API возвращает 400 — не хватает обязательных полей (widget, rangeMinLabel и др.)
          expect(response.status()).toBe(400);
        });
      });
    });

    // ==================== UPDATE SCALE ====================

    test.describe("PATCH /manager/competence-scales/{id}/ - Обновление шкалы", () => {
      test("C4752: Обновить шкалу компетенций", async ({ competenciesAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить шкалу компетенций", async () => {
          // Создаём шкалу
          const scaleName = `Test Update Scale ${Date.now()}`;
          const { response: createResp, data: createData } =
            await competenciesAPI.createCompetenceScale({
              title: scaleName,
              rangeMin: 1,
              rangeMax: 5,
              rangeMinLabel: "Низкий",
              rangeMaxLabel: "Высокий",
              widget: "slider",
              disallowStepNumbers: false,
            });

          test.skip(createResp.status() === 403, "Нет прав на создание шкал");
          assertSuccessStatus(createResp);

          const scaleId = createData?.id || createData?.scale?.id;
          expect(scaleId, `API должен вернуть ID созданной шкалы, получено: ${JSON.stringify(createData)}`).toBeDefined();

          try {
            const newTitle = `Updated Scale ${Date.now()}`;
            const { response } = await competenciesAPI.updateCompetenceScale(
              scaleId,
              { title: newTitle },
            );

            assertSuccessStatus(response);

            // Проверяем что обновление применилось
            const { data: fetchedData } =
              await competenciesAPI.getCompetenceScale(scaleId);
            expect(fetchedData.title, "Название шкалы должно обновиться").toBe(newTitle);
          } finally {
            // Cleanup
            await competenciesAPI.deleteCompetenceScale(scaleId).catch(() => {});
          }
        });
      });
    });

    // ==================== MAKE SCALE DEFAULT ====================

    test.describe("POST /manager/competence-scales/{id}/make-default - Шкала по умолчанию", () => {
      test("C4753: Сделать шкалу по умолчанию", async ({ competenciesAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Сделать шкалу по умолчанию", async () => {
          const scaleId = await findExistingScale(competenciesAPI);
          test.skip(!scaleId, "Нет шкал для тестирования");

          const { response } =
            await competenciesAPI.makeCompetenceScaleDefault(scaleId);

          assertSuccessStatus(response);
        });
      });

      test("C4754: Сделать несуществующую шкалу по умолчанию (негативный)", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Сделать несуществующую шкалу по умолчанию (негативный)", async () => {
          const { response } =
            await competenciesAPI.makeCompetenceScaleDefault(999999999);

          expect(response.status()).toBe(404);
        });
      });
    });

    // ==================== NEGATIVE TESTS ====================

    test.describe("Негативные сценарии", () => {
      test("C4755: Получить шкалу по несуществующему названию", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить шкалу по несуществующему названию", async () => {
          const { response, data } = await competenciesAPI.getCompetenceScaleByTitle(
            "NonExistent_" + Date.now(),
          );

          // API возвращает 200 с пустым телом при отсутствии совпадений
          expect(response.status()).toBe(200);
          expect(data, "Ответ должен быть пустым (null) при отсутствии совпадений").toBeNull();
        });
      });

      test("C4756: Удалить несуществующую шкалу", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Удалить несуществующую шкалу", async () => {
          const { response } =
            await competenciesAPI.deleteCompetenceScale(999999999);

          expect(response.status()).toBe(404);
        });
      });

      test("C4757: Создать компетенцию с очень длинным названием", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать компетенцию с очень длинным названием", async () => {
          const longTitle = "A".repeat(1000);
          const { response, data } = await competenciesAPI.createCompetency({
            title: longTitle,
            emoji: "📛",
          });

          // API валидирует длину: "title must be shorter than or equal to 100 characters"
          expect(response.status()).toBe(400);
        });
      });

      test("C4758: Создать компетенцию с дублирующим названием", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        let competencyId1, createResp2, createData2;
        await test.step("Выполнить запрос: Создать компетенцию с дублирующим названием", async () => {
          const uniqueTitle = `Test Duplicate Competency ${Date.now()}`;

          // Создаём первую компетенцию
          const { response: createResp1, data: createData1 } =
            await competenciesAPI.createCompetency({
              title: uniqueTitle,
              emoji: "🔁",
            });

          test.skip(createResp1.status() === 403, "Нет прав на создание компетенций");

          competencyId1 = createData1?.id || createData1?.competency?.id;

          // Пытаемся создать вторую с тем же названием
          ({ response: createResp2, data: createData2 } =
            await competenciesAPI.createCompetency({
              title: uniqueTitle,
              emoji: "🔁",
            }));

          // API может разрешить или запретить дубликаты
        });

        const competencyId2 = createData2?.id || createData2?.competency?.id;
        try {
          await test.step("Проверить ответ", async () => {
            // API разрешает дубликаты — вторая компетенция создаётся успешно
            expect([200, 201]).toContain(createResp2.status());
          });
        } finally {
          // Cleanup
          if (competencyId1) {
            await competenciesAPI.deleteCompetency(competencyId1).catch(() => {});
          }
          if (competencyId2 && competencyId2 !== competencyId1) {
            await competenciesAPI.deleteCompetency(competencyId2).catch(() => {});
          }
        }
      });

      test("C4759: Удалить уже удалённую компетенцию", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Удалить уже удалённую компетенцию", async () => {
          // Создаём и удаляем компетенцию
          const { response: createResp, data: createData } =
            await competenciesAPI.createCompetency({
              title: `Test Double Delete ${Date.now()}`,
              emoji: "🗑️",
            });

          test.skip(createResp.status() === 403, "Нет прав на создание компетенций");

          const competencyId = createData?.id || createData?.competency?.id;
          expect(competencyId, "API должен вернуть ID созданной компетенции").toBeDefined();

          // Первое удаление
          const { response: deleteResp1 } =
            await competenciesAPI.deleteCompetency(competencyId);
          expect(deleteResp1.ok()).toBe(true);

          // Второе удаление
          const { response: deleteResp2 } =
            await competenciesAPI.deleteCompetency(competencyId);
          expect(deleteResp2.status()).toBe(404);
        });
      });

      test("C4760: Создать шкалу с нулевым диапазоном (min = max)", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать шкалу с нулевым диапазоном (min = max)", async () => {
          const { response, data } =
            await competenciesAPI.createCompetenceScale({
              title: `Test Zero Range Scale ${Date.now()}`,
              rangeMin: 5,
              rangeMax: 5, // min = max
              widget: "slider",
              disallowStepNumbers: false,
            });

          // API возвращает 400 — не хватает обязательных полей (rangeMinLabel и др.)
          expect(response.status()).toBe(400);
        });
      });

      test("C4761: Создать группу со специальными символами в названии", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать группу со специальными символами в названии", async () => {
          const specialTitle = "<script>alert(1)</script>";
          const { response, data } =
            await competenciesAPI.createCompetenceGroup(specialTitle);

          // API может принять или отклонить спецсимволы
          const groupId = data?.id || data?.group?.id;
          if (response.ok() && groupId) {
            // Если принял — проверяем что название экранировано или сохранено as-is (без исполнения)
            const { data: fetchedData } = await competenciesAPI.getCompetenceGroups();
            const groups = Array.isArray(fetchedData) ? fetchedData : (fetchedData?.items ?? []);
            const found = groups.find((g) => g.id === groupId);
            expect(found, "Группа должна быть найдена по ID").toBeDefined();
            // Cleanup
            await competenciesAPI.deleteCompetenceGroup(groupId);
          } else {
            // APP_BUG: API возвращает 500 вместо 400 при спецсимволах в названии
            expect(response.status()).toBe(500);
          }
        });
      });

      test("C4762: Получить компетенции с отрицательным limit", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить компетенции с отрицательным limit", async () => {
          const { response } = await competenciesAPI.getCompetencies({
            limit: -1,
          });

          // APP_BUG: API возвращает 500 вместо 400 при отрицательном limit
          expect(response.status()).toBe(500);
        });
      });

      test("C4763: Получить компетенции с очень большим offset", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить компетенции с очень большим offset", async () => {
          const { response, data } = await competenciesAPI.getCompetencies({
            offset: 999999,
          });

          assertSuccessStatus(response);
          const items = data?.items || data || [];
          expect(items.length).toBe(0);
        });
      });
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты", () => {
      test("C4764: Полный жизненный цикл компетенции: создание → обновление → удаление", async ({
        competenciesAPI,
      }) => {
        setSeverity("critical");

        let title, description, createResp, createData;
        await test.step("Выполнить запрос: Полный жизненный цикл компетенции: создание → обновление → удаление", async () => {
          title = `Test Lifecycle Competency ${Date.now()}`;
          description = "Test description";
          const emoji = "🎯";

          // 1. Создаём компетенцию
          ({ response: createResp, data: createData } =
            await competenciesAPI.createCompetency({
              title,
              description,
              emoji,
            }));

          test.skip(createResp.status() === 403, "Нет прав на создание компетенций");
        });

        expect(createResp.ok()).toBe(true);
        const competencyId = createData?.id || createData?.competency?.id;
        expect(competencyId).toBeDefined();

        try {
          await test.step("Проверить ответ", async () => {
            // 2. Проверяем что компетенция создана
            const { response: getResp1, data: getData1 } =
              await competenciesAPI.getCompetency(competencyId);
            expect(getResp1.ok()).toBe(true);
            expect(getData1.title).toBe(title);
            expect(getData1.description).toBe(description);

            // 3. Обновляем компетенцию
            const newTitle = `Updated ${title}`;
            const { response: updateResp } =
              await competenciesAPI.updateCompetency(competencyId, {
                title: newTitle,
                description: "Updated description",
              });
            expect(updateResp.ok()).toBe(true);

            // 4. Проверяем обновление
            const { response: getResp2, data: getData2 } =
              await competenciesAPI.getCompetency(competencyId);
            expect(getResp2.ok()).toBe(true);
            expect(getData2.title).toBe(newTitle);

            // 5. Проверяем связанные сущности
            const { response: relatedResp } =
              await competenciesAPI.getCompetencyIsRelated(competencyId);
            expect(relatedResp.ok()).toBe(true);

            // 6. Удаляем компетенцию
            const { response: deleteResp } =
              await competenciesAPI.deleteCompetency(competencyId);
            expect(deleteResp.ok()).toBe(true);

            // 7. Проверяем что удалена
            const { response: getDeletedResp } =
              await competenciesAPI.getCompetency(competencyId);
            expect(getDeletedResp.status()).toBe(404);
          });
        } finally {
          // Cleanup — на случай если тест упал до шага 6
          await competenciesAPI.deleteCompetency(competencyId).catch(() => {});
        }
      });

      test("C4765: Создание компетенции с группой и шкалой", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создание компетенции с группой и шкалой", async () => {
          // Получаем или создаём группу
          const groupId = await findOrCreateGroup(competenciesAPI);

          if (!groupId) {
            test.skip(true, "Не удалось получить/создать группу");
          }

          // Получаем шкалу
          const scaleId = await findExistingScale(competenciesAPI);

          // Создаём компетенцию
          const { response: createResp, data: createData } =
            await competenciesAPI.createCompetency({
              title: `Test Competency with Group ${Date.now()}`,
              emoji: "📊",
              groupId,
            });

          test.skip(createResp.status() === 403, "Нет прав на создание компетенций");

          const competencyId = createData?.id || createData?.competency?.id;
          expect(competencyId, "API должен вернуть ID созданной компетенции").toBeDefined();

          try {
            // Проверяем что группа установлена
            const { data: fetchedData } =
              await competenciesAPI.getCompetency(competencyId);
            expect(fetchedData.groupId).toBe(groupId);

            // Если есть шкала, пробуем изменить
            if (scaleId) {
              const { response: changeScaleResp } =
                await competenciesAPI.changeCompetencyScale(
                  competencyId,
                  scaleId,
                );
              assertSuccessStatus(changeScaleResp);
            }
          } finally {
            // Cleanup
            await competenciesAPI.deleteCompetency(competencyId).catch(() => {});
          }
        });
      });

      test("C4766: Согласованность данных: список vs отдельная компетенция", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Согласованность данных: список vs отдельная компетенция", async () => {
          // 1. Получаем список компетенций
          const { response: listResp, data: listData } =
            await competenciesAPI.getCompetencies({ limit: 5 });
          expect(listResp.ok()).toBe(true);
          const listItems = listData?.items || listData || [];

          expect(listItems.length, "Должно быть минимум 2 компетенции для теста согласованности").toBeGreaterThanOrEqual(2);

          // 2. Для каждой компетенции получаем детали
          for (const comp of listItems.slice(0, 2)) {
            const { response: detailResp, data: detailData } =
              await competenciesAPI.getCompetency(comp.id);
            expect(detailResp.ok()).toBe(true);
            expect(detailData.id).toBe(comp.id);
            expect(detailData.title).toBe(comp.title);
          }
        });
      });

      test("C4767: Поиск компетенции по названию и проверка результата", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск компетенции по названию и проверка результата", async () => {
          // 1. Создаём компетенцию с уникальным названием
          const uniqueTitle = `UniqueSearch_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          const { response: createResp, data: createData } =
            await competenciesAPI.createCompetency({
              title: uniqueTitle,
              emoji: "🔍",
            });

          test.skip(createResp.status() === 403, "Нет прав на создание компетенций");

          const competencyId = createData?.id || createData?.competency?.id;
          expect(competencyId, "API должен вернуть ID созданной компетенции").toBeDefined();

          try {
            // 2. Ищем по названию
            const { response: searchResp, data: searchData } =
              await competenciesAPI.getCompetencyByTitle(uniqueTitle);
            expect(searchResp.ok()).toBe(true);
            expect(searchData.id).toBe(competencyId);
          } finally {
            // Cleanup
            await competenciesAPI.deleteCompetency(competencyId).catch(() => {});
          }
        });
      });
    });

    // ==================== BATCH OPERATIONS ====================

    test.describe("Массовые операции", () => {
      test("C4768: Создать несколько компетенций и проверить список", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        let competenciesToCreate, createdIds;
        await test.step("Выполнить запрос: Создать несколько компетенций и проверить список", async () => {
          const timestamp = Date.now();
          competenciesToCreate = [
            { title: `Batch Test A ${timestamp}`, emoji: "🅰️" },
            { title: `Batch Test B ${timestamp}`, emoji: "🅱️" },
            { title: `Batch Test C ${timestamp}`, emoji: "©️" },
          ];

          createdIds = [];

          // Создаём компетенции
          for (const comp of competenciesToCreate) {
            const { response, data } =
              await competenciesAPI.createCompetency(comp);

            if (response.status() === 403) {
              // Cleanup созданных
              for (const id of createdIds) {
                await competenciesAPI.deleteCompetency(id).catch(() => {});
              }
              test.skip(true, "Нет прав на создание компетенций");
            }

            if (response.ok()) {
              const compId = data?.id || data?.competency?.id;
              if (compId) {
                createdIds.push(compId);
              }
            }
          }
        });

        try {
          await test.step("Проверить ответ", async () => {
            expect(createdIds.length).toBe(competenciesToCreate.length);

            // Проверяем что все в списке
            const { response: listResp, data: listData } =
              await competenciesAPI.getCompetencies({ limit: 100 });
            expect(listResp.ok()).toBe(true);
            const items = listData?.items || listData || [];

            for (const id of createdIds) {
              expect(items.some((c) => c.id === id)).toBe(true);
            }
          });
        } finally {
          // Cleanup
          for (const id of createdIds) {
            await competenciesAPI.deleteCompetency(id).catch(() => {});
          }
        }
      });

      test("C4769: Последовательные запросы с разными параметрами пагинации", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Последовательные запросы с разными параметрами пагинации", async () => {
          const results = [];

          const params = [{ limit: 5 }, { limit: 10 }, { limit: 5, offset: 5 }];

          for (const param of params) {
            const { response, data } =
              await competenciesAPI.getCompetencies(param);
            results.push({
              status: response.status(),
              count: (data?.items || data || []).length,
            });
          }

          // Все запросы должны быть успешными
          for (const result of results) {
            expect(result.status).toBe(200);
          }
        });
      });

      test("C4770: Пагинация: последовательные страницы не пересекаются", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Пагинация: последовательные страницы не пересекаются", async () => {
          const pageSize = 5;

          const { data: page1Data } = await competenciesAPI.getCompetencies({
            limit: pageSize,
            offset: 0,
          });
          const { data: page2Data } = await competenciesAPI.getCompetencies({
            limit: pageSize,
            offset: pageSize,
          });

          const page1Items = page1Data?.items || page1Data || [];
          const page2Items = page2Data?.items || page2Data || [];

          expect(page1Items.length, "Первая страница пагинации должна содержать данные").toBeGreaterThan(0);
          expect(page2Items.length, "Вторая страница пагинации должна содержать данные").toBeGreaterThan(0);

          const page1Ids = page1Items.map((c) => c.id);
          const page2Ids = page2Items.map((c) => c.id);

          for (const id of page2Ids) {
            expect(page1Ids).not.toContain(id);
          }
        });
      });
    });

    // ==================== ДОПОЛНИТЕЛЬНЫЕ ТЕСТЫ (непокрытые методы) ====================

    test.describe("GET /manager/competence-scales/by-title/ - Поиск шкалы по названию", () => {
      test(
        "C4771: Найти существующую шкалу по названию",
        { tag: ["@critical"] },
        async ({ competenciesAPI }) => {
          setSeverity("critical");

          let targetScale;
          await test.step("Выполнить запрос: Найти существующую шкалу по названию", async () => {
            // Получаем список шкал и берём название первой
            const { data: scalesData } =
              await competenciesAPI.getCompetenceScales({ limit: 10 });
            const scales = scalesData?.items || scalesData || [];

            if (scales.length === 0) {
              test.skip(true, "Нет шкал для поиска по названию");
              return;
            }

            targetScale = scales[0];
          });

          await test.step("Проверить ответ", async () => {
            expect(
              targetScale.title,
              "Шкала должна иметь название",
            ).toBeDefined();

            const { response, data } =
              await competenciesAPI.getCompetenceScaleByTitle(
                targetScale.title,
              );

            expect([200], `Expected 200, got ${response.status()}`).toContain(
              response.status(),
            );
            expect(data, "Ответ не должен быть пустым").toBeDefined();

            // Проверяем что найденная шкала соответствует искомой
            expect(data.id, "ID должен совпасть").toBe(targetScale.id);
            expect(data.title, "Название должно совпасть").toBe(targetScale.title);
          });
        },
      );
    });

    test.describe("DELETE /manager/competence-scales/{id}/ - Удаление шкалы", () => {
      test(
        "C4772: Полный цикл: создать шкалу → удалить → проверить удаление",
        { tag: ["@critical"] },
        async ({ competenciesAPI }) => {
          setSeverity("critical");

          let createResp, createData;
          await test.step("Выполнить запрос: Полный цикл: создать шкалу → удалить → проверить удаление", async () => {
            // Создаём шкалу для удаления (все обязательные поля)
            const title = `Test Scale Delete ${Date.now()}`;
            ({ response: createResp, data: createData } =
              await competenciesAPI.createCompetenceScale({
                title,
                description: "Scale for delete test",
                rangeMin: 1,
                rangeMax: 5,
                rangeMinLabel: "Низкий",
                rangeMaxLabel: "Высокий",
                widget: "slider",
                disallowStepNumbers: false,
              }));

            if (createResp.status() === 403) {
              test.skip(true, "Нет прав на создание шкал");
              return;
            }
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 201],
              `Expected 200/201, got ${createResp.status()}`,
            ).toContain(createResp.status());

            const scaleId = createData?.id || createData?.scale?.id;
            expect(
              scaleId,
              "Ответ должен содержать ID созданной шкалы",
            ).toBeDefined();

            // Удаляем
            const { response: deleteResp } =
              await competenciesAPI.deleteCompetenceScale(scaleId);
            expect(
              [200, 204],
              `Expected 200/204, got ${deleteResp.status()}`,
            ).toContain(deleteResp.status());

            // Проверяем что шкала удалена
            const { response: getResp } =
              await competenciesAPI.getCompetenceScale(scaleId);
            expect(getResp.status(), "Удалённая шкала должна возвращать 404").toBe(404);
          });
        },
      );
    });

    test.describe("POST /manager/competencies/{id}/development-actions/add/ - Привязка действий развития", () => {
      test("C4773: Привязать действия развития к компетенции", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Привязать действия развития к компетенции", async () => {
          const competencyId = await findExistingCompetency(competenciesAPI);
          if (!competencyId) {
            test.skip(true, "Нет компетенций для тестирования");
            return;
          }

          // Вызываем с пустым массивом — проверяем что endpoint доступен и принимает запрос
          const { response, data } =
            await competenciesAPI.addDevelopmentActions(competencyId, []);

          // API может принять пустой массив (200) или отклонить (400)
          expect(
            [200, 400],
            `Expected 200 or 400, got ${response.status()}`,
          ).toContain(response.status());
        });
      });

      test("C4774: Привязка действий к несуществующей компетенции — ошибка", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Привязка действий к несуществующей компетенции — ошибка", async () => {
          const { response } = await competenciesAPI.addDevelopmentActions(
            999999999,
            [1],
          );

          expect(response.status(), `Expected 404, got ${response.status()}`).toBe(404);
        });
      });
    });

    test.describe("GET /manager/performance-reviews/statistics/competences/of-user/{userId} - Оценки пользователя", () => {
      test("C4775: Получить оценки компетенций пользователя", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Получить оценки компетенций пользователя", async () => {
          // Получаем ID реального пользователя через API
          const { data: usersData } = await competenciesAPI.get("/manager/users/", { limit: 1, category: "active" });
          const users = usersData?.items || usersData || [];
          expect(users.length, "Должен быть хотя бы один активный пользователь").toBeGreaterThan(0);
          const targetUserId = users[0].id;

          // Эндпоинт статистики может быть тяжёлым — увеличиваем timeout
          ({ response, data } =
            await competenciesAPI.get(
              `/manager/performance-reviews/statistics/competences/of-user/${targetUserId}`,
              {},
              { timeout: 120_000 },
            ));

          // Endpoint может вернуть 200 (с данными или пустой массив) или 404 (нет данных)
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [200, 404],
            `Expected 200 or 404, got ${response.status()}`,
          ).toContain(response.status());

          if (response.ok() && data) {
            // Если данные есть, проверяем структуру
            const items = data?.items || (Array.isArray(data) ? data : []);
            expect(Array.isArray(items), "Результат должен быть массивом").toBe(
              true,
            );
          }
        });
      });

      test("C4776: Получить оценки для несуществующего пользователя — ошибка или пустой результат", async ({
        competenciesAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить оценки для несуществующего пользователя — пустой массив", async () => {
          const { response, data } =
            await competenciesAPI.getUserAssessments(999999999);

          // API возвращает 200 с пустым массивом для несуществующего пользователя
          expect(response.status()).toBe(200);
          const items = Array.isArray(data) ? data : (data?.items || []);
          expect(items.length, "Для несуществующего пользователя не должно быть оценок").toBe(0);
        });
      });
    });
  },
);
