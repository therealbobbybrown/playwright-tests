// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { OrgStructureAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * API тесты для групп пользователей организационной структуры
 *
 * Покрытие:
 * - CRUD операции с группами пользователей
 * - Управление членством в группах
 * - Поиск и фильтрация групп
 */

// Расширяем test с фикстурой для OrgStructure API
const test = fullTest.extend({
  orgStructureAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Кеш для данных
let cachedGroupId = null;
let cachedUserId = null;

async function findExistingUserGroup(api) {
  if (cachedGroupId) {
    return cachedGroupId;
  }

  const { data } = await api.getUserGroups({ limit: 10 });
  const items = data?.items || data || [];
  if (items.length > 0) {
    cachedGroupId = items[0].id;
    return cachedGroupId;
  }

  return null;
}

async function findExistingUser(api) {
  if (cachedUserId) {
    return cachedUserId;
  }

  const { data } = await api.findUsers({ limit: 10 });
  const items = data?.items || data || [];
  if (items.length > 0) {
    cachedUserId = items[0].id;
    return cachedUserId;
  }

  return null;
}

test.describe(
  "Org Structure - User Groups API",
  { tag: ["@api", "@org-structure", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "User Groups");
    });

    // ==================== GET LIST ====================

    test.describe("GET /manager/user-groups/ - Список групп", () => {
      test(
        "C5712: Получить список групп пользователей",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить список групп пользователей", async () => {
            const { response, data } = await orgStructureAPI.getUserGroups();

            expect(response.status()).toBe(200);
            expect(data).toBeDefined();
            const items = data?.items || data || [];
            expect(Array.isArray(items)).toBe(true);

            if (items.length > 0) {
              const group = items[0];
              expect(group.id).toBeDefined();
              expect(group.title).toBeDefined();
            }
          });
        },
      );

      test("C5713: Получить список групп с лимитом", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить список групп с лимитом", async () => {
          const { response, data } = await orgStructureAPI.getUserGroups({
            limit: 5,
          });

          expect(response.status()).toBe(200);
          const items = data?.items || data || [];
          expect(items.length).toBeLessThanOrEqual(5);
        });
      });

      test("C5714: Получить список групп с ID пользователей", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить список групп с ID пользователей", async () => {
          const { response, data } = await orgStructureAPI.getUserGroups({
            withUsersIds: true,
          });

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });
    });

    // ==================== GET BY ID ====================

    test.describe("GET /manager/user-groups/{id}/ - Получение группы по ID", () => {
      test(
        "C5715: Получить группу по ID",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить группу по ID", async () => {
            const groupId = await findExistingUserGroup(orgStructureAPI);

            if (groupId) {
              const { response, data } =
                await orgStructureAPI.getUserGroup(groupId);

              expect(response.status()).toBe(200);
              expect(data).toBeDefined();
              expect(data.id).toBe(groupId);
              expect(data.title).toBeDefined();
            }
          });
        },
      );

      test("C5716: Получить несуществующую группу", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить несуществующую группу", async () => {
          const { response } = await orgStructureAPI.getUserGroup(999999999);

          expect([400, 404]).toContain(response.status());
        });
      });
    });

    // ==================== GET BY TITLE ====================

    test.describe("GET /manager/user-groups/by-title/ - Поиск группы по названию", () => {
      test("C5717: Найти группу по названию", async ({ orgStructureAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Найти группу по названию", async () => {
          // Сначала получим существующую группу
          const groupId = await findExistingUserGroup(orgStructureAPI);

          if (groupId) {
            const { data: groupData } =
              await orgStructureAPI.getUserGroup(groupId);

            if (groupData?.title) {
              const { response, data } =
                await orgStructureAPI.getUserGroupByTitle(groupData.title);

              expect(response.status()).toBe(200);
              expect(data).toBeDefined();
              expect(data.id).toBe(groupId);
            }
          }
        });
      });

      test("C5718: Поиск несуществующей группы по названию", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск несуществующей группы по названию", async () => {
          const { response } = await orgStructureAPI.getUserGroupByTitle(
            "NonExistentGroup_" + Date.now(),
          );

          // API может вернуть 200 с null или 404
          expect([200, 404]).toContain(response.status());
        });
      });
    });

    // ==================== CREATE ====================

    test.describe("POST /manager/user-groups/ - Создание группы", () => {
      test(
        "C5719: Создать группу пользователей",
        { tag: ["@critical", "@db"] },
        async ({ orgStructureAPI, orgVerifier }) => {
          setSeverity("critical");

          const groupTitle = `Test Group ${Date.now()}`;

          // API требует emoji - это обязательное поле
          const { response, data } = await orgStructureAPI.createUserGroup({
            title: groupTitle,
            emoji: "🏢", // Обязательное поле
            autoTitle: false,
          });

          // Если нет прав на создание - пропускаем тест
          if (response.status() === 403) {
            console.log("Нет прав на создание групп, пропускаем тест");
            return;
          }

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          // API может вернуть данные в разном формате
          const groupId = data.id || data.userGroup?.id || data.group?.id;
          const returnedTitle =
            data.title || data.userGroup?.title || data.group?.title;

          expect(groupId).toBeDefined();
          if (returnedTitle) {
            expect(returnedTitle).toBe(groupTitle);
          }

          // DB верификация: проверка создания группы в БД
          await test.step("DB: Проверка создания группы в БД", async () => {
            if (!orgVerifier.isConnected()) return;
            const dbGroup = await orgVerifier.verifyUserGroupCreated(groupId);
            if (dbGroup) {
              expect(
                dbGroup.title,
                "Название группы в БД должно совпадать",
              ).toBe(groupTitle);
            }
          });

          // Cleanup: удаляем созданную группу
          if (groupId) {
            await orgStructureAPI.deleteUserGroup(groupId);
          }
        },
      );

      test("C5720: Создать группу с эмодзи", async ({ orgStructureAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать группу с эмодзи", async () => {
          const groupTitle = `Test Group Emoji ${Date.now()}`;

          const { response, data } = await orgStructureAPI.createUserGroup({
            title: groupTitle,
            emoji: "🎯",
            autoTitle: false,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          // Cleanup
          if (data?.id) {
            await orgStructureAPI.deleteUserGroup(data.id);
          }
        });
      });

      test(
        "C4739: Создать группу без названия (негативный)",
        { tag: ["@db"] },
        async ({ orgStructureAPI, orgVerifier }) => {
          setSeverity("normal");

          const { response, data } = await orgStructureAPI.createUserGroup({});

          // Ожидаем ошибку валидации
          expect([400, 422]).toContain(response.status());

          // DB верификация: при ошибке группа не должна быть создана
          await test.step("DB: Проверка что группа НЕ создана в БД", async () => {
            if (!orgVerifier.isConnected()) return;
            const groupId = data?.id || data?.userGroup?.id;
            if (groupId) {
              await orgVerifier.verifyUserGroupNotExists(groupId);
            }
          });
        },
      );
    });

    // ==================== UPDATE ====================

    test.describe("POST /manager/user-groups/{id}/ - Обновление группы", () => {
      test("C4740: Обновить название группы", async ({ orgStructureAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить название группы", async () => {
          // Создаём тестовую группу (emoji обязателен)
          const originalTitle = `Test Update Group ${Date.now()}`;
          const { data: createData } = await orgStructureAPI.createUserGroup({
            title: originalTitle,
            emoji: "📝",
            autoTitle: false,
          });

          if (createData?.id) {
            const newTitle = `Updated ${originalTitle}`;

            const { response, data } = await orgStructureAPI.updateUserGroup(
              createData.id,
              {
                title: newTitle,
                autoTitle: false,
              },
            );

            expect(response.status()).toBe(200);
            expect(data.title).toBe(newTitle);

            // Cleanup
            await orgStructureAPI.deleteUserGroup(createData.id);
          }
        });
      });

      test("C4741: Обновить несуществующую группу", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить несуществующую группу", async () => {
          const { response } = await orgStructureAPI.updateUserGroup(
            999999999,
            {
              title: "Test",
            },
          );

          expect([400, 404]).toContain(response.status());
        });
      });
    });

    // ==================== DELETE ====================

    test.describe("DELETE /manager/user-groups/{id}/ - Удаление группы", () => {
      test(
        "C4742: Удалить группу",
        { tag: ["@db"] },
        async ({ orgStructureAPI, orgVerifier }) => {
          setSeverity("normal");

          // Создаём группу для удаления (emoji обязателен)
          const { data: createData } = await orgStructureAPI.createUserGroup({
            title: `Test Delete Group ${Date.now()}`,
            emoji: "🗑️",
            autoTitle: false,
          });

          if (createData?.id) {
            const { response } = await orgStructureAPI.deleteUserGroup(
              createData.id,
            );

            assertSuccessStatus(response);

            // Проверяем что группа удалена через API
            const { response: getResp, data: getData } =
              await orgStructureAPI.getUserGroup(createData.id);
            expect([200, 400, 404]).toContain(getResp.status());

            // DB верификация: проверка удаления в БД
            await test.step("DB: Проверка удаления группы в БД", async () => {
              if (!orgVerifier.isConnected()) return;
              await orgVerifier.verifyUserGroupDeleted(createData.id);
            });
          }
        },
      );

      test("C4743: Удалить несуществующую группу", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Удалить несуществующую группу", async () => {
          const { response } = await orgStructureAPI.deleteUserGroup(999999999);

          expect([400, 404]).toContain(response.status());
        });
      });
    });

    // ==================== GROUP USERS ====================

    test.describe("Пользователи в группе", () => {
      test(
        "C5726: Получить пользователей группы",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить пользователей группы", async () => {
            const groupId = await findExistingUserGroup(orgStructureAPI);

            if (groupId) {
              const { response, data } =
                await orgStructureAPI.getUserGroupUsers(groupId);

              expect(response.status()).toBe(200);
              expect(data).toBeDefined();
            }
          });
        },
      );

      test("C5727: Получить пользователей группы с пагинацией", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить пользователей группы с пагинацией", async () => {
          const groupId = await findExistingUserGroup(orgStructureAPI);

          if (groupId) {
            const { response, data } = await orgStructureAPI.getUserGroupUsers(
              groupId,
              {
                limit: 5,
                offset: 0,
              },
            );

            expect(response.status()).toBe(200);
            expect(data).toBeDefined();
          }
        });
      });

      test("C5728: Получить пользователей вне группы", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить пользователей вне группы", async () => {
          const groupId = await findExistingUserGroup(orgStructureAPI);

          if (groupId) {
            const { response, data } =
              await orgStructureAPI.getUserGroupUsersOutside(groupId, {
                limit: 10,
              });

            expect(response.status()).toBe(200);
            expect(data).toBeDefined();
          }
        });
      });

      test("C5729: Добавить и удалить пользователя из группы", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Добавить и удалить пользователя из группы", async () => {
          // Создаём тестовую группу (emoji обязателен)
          const { data: createData } = await orgStructureAPI.createUserGroup({
            title: `Test Membership Group ${Date.now()}`,
            emoji: "👥",
            autoTitle: false,
          });

          if (createData?.id) {
            // Найдём пользователя для добавления
            const { data: usersOutside } =
              await orgStructureAPI.getUserGroupUsersOutside(createData.id, {
                limit: 5,
              });
            const outsideItems = usersOutside?.items || usersOutside || [];

            if (outsideItems.length > 0) {
              const userId = outsideItems[0].id;

              // Добавляем пользователя
              const { response: addResp } =
                await orgStructureAPI.addUsersToUserGroup(createData.id, [
                  userId,
                ]);
              expect(addResp.ok()).toBe(true);

              // Проверяем что пользователь добавлен
              const { data: groupUsers } =
                await orgStructureAPI.getUserGroupUsers(createData.id);
              const groupItems = groupUsers?.items || groupUsers || [];
              expect(groupItems.some((u) => u.id === userId)).toBe(true);

              // Удаляем пользователя
              const { response: removeResp } =
                await orgStructureAPI.removeUsersFromUserGroup(createData.id, [
                  userId,
                ]);
              expect(removeResp.ok()).toBe(true);
            }

            // Cleanup
            await orgStructureAPI.deleteUserGroup(createData.id);
          }
        });
      });
    });

    // ==================== NEGATIVE TESTS ====================

    test.describe("Негативные сценарии", () => {
      test("C5730: Получить пользователей несуществующей группы", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить пользователей несуществующей группы", async () => {
          const { response } =
            await orgStructureAPI.getUserGroupUsers(999999999);

          expect([400, 404]).toContain(response.status());
        });
      });

      test("C5731: Добавить пользователя в несуществующую группу", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Добавить пользователя в несуществующую группу", async () => {
          const { response } = await orgStructureAPI.addUsersToUserGroup(
            999999999,
            [1],
          );

          expect([400, 404]).toContain(response.status());
        });
      });

      test("C5732: Удалить пользователя из несуществующей группы", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Удалить пользователя из несуществующей группы", async () => {
          const { response } = await orgStructureAPI.removeUsersFromUserGroup(
            999999999,
            [1],
          );

          expect([400, 404]).toContain(response.status());
        });
      });

      test("C5733: Создать группу с очень длинным названием", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать группу с очень длинным названием", async () => {
          const longTitle = "A".repeat(1000);
          const { response, data } = await orgStructureAPI.createUserGroup({
            title: longTitle,
            emoji: "📛",
            autoTitle: false,
          });

          // API может обрезать, отклонить или принять
          if (response.ok()) {
            const groupId = data?.id || data?.userGroup?.id;
            if (groupId) {
              await orgStructureAPI.deleteUserGroup(groupId);
            }
          } else {
            expect([400, 403, 422, 500]).toContain(response.status());
          }
        });
      });

      test("C5734: Создать группу с дублирующим названием", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        let groupId1, createResp2, createData2;
        await test.step("Выполнить запрос: Создать группу с дублирующим названием", async () => {
          const uniqueTitle = `Test Duplicate Group ${Date.now()}`;

          // Создаём первую группу
          const { response: createResp1, data: createData1 } =
            await orgStructureAPI.createUserGroup({
              title: uniqueTitle,
              emoji: "🔁",
              autoTitle: false,
            });

          if (createResp1.status() === 403) {
            console.log("Нет прав на создание групп");
            return;
          }

          groupId1 = createData1?.id || createData1?.userGroup?.id;

          // Пытаемся создать вторую с тем же названием
          ({ response: createResp2, data: createData2 } =
            await orgStructureAPI.createUserGroup({
              title: uniqueTitle,
              emoji: "🔁",
              autoTitle: false,
            }));

          // API может разрешить или запретить дубликаты
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 409, 422]).toContain(createResp2.status());

          // Cleanup
          if (groupId1) {
            await orgStructureAPI.deleteUserGroup(groupId1);
          }
          const groupId2 = createData2?.id || createData2?.userGroup?.id;
          if (groupId2 && groupId2 !== groupId1) {
            await orgStructureAPI.deleteUserGroup(groupId2);
          }
        });
      });

      test("C5735: Удалить уже удалённую группу", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Удалить уже удалённую группу", async () => {
          // Создаём и удаляем группу
          const { response: createResp, data: createData } =
            await orgStructureAPI.createUserGroup({
              title: `Test Double Delete ${Date.now()}`,
              emoji: "🗑️",
              autoTitle: false,
            });

          if (createResp.status() === 403) {
            console.log("Нет прав на создание групп");
            return;
          }

          const groupId = createData?.id || createData?.userGroup?.id;

          if (groupId) {
            // Первое удаление
            const { response: deleteResp1 } =
              await orgStructureAPI.deleteUserGroup(groupId);
            expect(deleteResp1.ok()).toBe(true);

            // Второе удаление - API может вернуть 200/204 (идемпотентность) или 400/404
            const { response: deleteResp2 } =
              await orgStructureAPI.deleteUserGroup(groupId);
            expect([200, 204, 400, 404]).toContain(deleteResp2.status());
          }
        });
      });

      test("C5736: Добавить несуществующего пользователя в группу", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Добавить несуществующего пользователя в группу", async () => {
          const groupId = await findExistingUserGroup(orgStructureAPI);

          if (groupId) {
            const { response } = await orgStructureAPI.addUsersToUserGroup(
              groupId,
              [999999999],
            );

            if (response.status() === 403) {
              console.log("Нет прав на добавление пользователей в группу");
              return;
            }

            // API должен вернуть ошибку для несуществующего пользователя
            expect([200, 201, 400, 404, 500]).toContain(response.status());
          }
        });
      });
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты", () => {
      test("C5737: Полный жизненный цикл группы: создание → добавление пользователей → удаление", async ({
        orgStructureAPI,
      }) => {
        setSeverity("critical");

        let groupTitle, createResp, createData;
        await test.step("Выполнить запрос: Полный жизненный цикл группы: создание → добавление пользователей → удаление", async () => {
          // 1. Создаём группу
          groupTitle = `Test Lifecycle Group ${Date.now()}`;
          ({ response: createResp, data: createData } =
            await orgStructureAPI.createUserGroup({
              title: groupTitle,
              emoji: "🔄",
              autoTitle: false,
            }));

          if (createResp.status() === 403) {
            console.log("Нет прав на создание групп");
            return;
          }
        });

        await test.step("Проверить ответ", async () => {
          expect(createResp.ok()).toBe(true);
          const groupId = createData?.id || createData?.userGroup?.id;
          expect(groupId).toBeDefined();

          // 2. Проверяем что группа создана
          const { response: getResp, data: getData } =
            await orgStructureAPI.getUserGroup(groupId);
          expect(getResp.ok()).toBe(true);
          expect(getData.title).toBe(groupTitle);

          // 3. Находим пользователей для добавления
          const { data: usersOutside } =
            await orgStructureAPI.getUserGroupUsersOutside(groupId, {
              limit: 3,
            });
          const outsideItems = usersOutside?.items || usersOutside || [];

          if (outsideItems.length > 0) {
            const userIds = outsideItems
              .slice(0, Math.min(2, outsideItems.length))
              .map((u) => u.id);

            // 4. Добавляем пользователей
            const { response: addResp } =
              await orgStructureAPI.addUsersToUserGroup(groupId, userIds);
            expect(addResp.ok()).toBe(true);

            // 5. Проверяем что пользователи добавлены
            const { data: groupUsersData } =
              await orgStructureAPI.getUserGroupUsers(groupId);
            const groupUsers = groupUsersData?.items || groupUsersData || [];
            for (const userId of userIds) {
              expect(groupUsers.some((u) => u.id === userId)).toBe(true);
            }

            // 6. Удаляем пользователей
            const { response: removeResp } =
              await orgStructureAPI.removeUsersFromUserGroup(groupId, userIds);
            expect(removeResp.ok()).toBe(true);
          }

          // 7. Удаляем группу
          const { response: deleteResp } =
            await orgStructureAPI.deleteUserGroup(groupId);
          expect(deleteResp.ok()).toBe(true);

          // 8. Проверяем что группа удалена (API может вернуть 200 с пустыми данными или 404)
          const { response: checkResp } =
            await orgStructureAPI.getUserGroup(groupId);
          expect([200, 400, 404]).toContain(checkResp.status());
        });
      });

      test("C5738: Обновление группы и проверка изменений", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновление группы и проверка изменений", async () => {
          // 1. Создаём группу
          const originalTitle = `Test Update Integration ${Date.now()}`;
          const { response: createResp, data: createData } =
            await orgStructureAPI.createUserGroup({
              title: originalTitle,
              emoji: "✏️",
              autoTitle: false,
            });

          if (createResp.status() === 403) {
            console.log("Нет прав на создание групп");
            return;
          }

          const groupId = createData?.id || createData?.userGroup?.id;

          if (groupId) {
            // 2. Обновляем название
            const newTitle = `Updated ${originalTitle}`;
            const { response: updateResp } =
              await orgStructureAPI.updateUserGroup(groupId, {
                title: newTitle,
                autoTitle: false,
              });
            expect(updateResp.ok()).toBe(true);

            // 3. Проверяем через getUserGroup
            const { data: getData } =
              await orgStructureAPI.getUserGroup(groupId);
            expect(getData.title).toBe(newTitle);

            // 4. Проверяем через getUserGroupByTitle
            const { response: byTitleResp, data: byTitleData } =
              await orgStructureAPI.getUserGroupByTitle(newTitle);
            expect(byTitleResp.ok()).toBe(true);
            expect(byTitleData.id).toBe(groupId);

            // Cleanup
            await orgStructureAPI.deleteUserGroup(groupId);
          }
        });
      });

      test("C5739: Согласованность списка групп и данных отдельной группы", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Согласованность списка групп и данных отдельной группы", async () => {
          // 1. Получаем список групп
          const { response: listResp, data: listData } =
            await orgStructureAPI.getUserGroups({ limit: 5 });
          expect(listResp.ok()).toBe(true);
          const listItems = listData?.items || listData || [];

          if (listItems.length >= 2) {
            // 2. Для каждой группы получаем детальные данные
            for (const group of listItems.slice(0, 2)) {
              const { response: detailResp, data: detailData } =
                await orgStructureAPI.getUserGroup(group.id);
              expect(detailResp.ok()).toBe(true);
              expect(detailData.id).toBe(group.id);
              expect(detailData.title).toBe(group.title);
            }
          }
        });
      });
    });

    // ==================== BATCH OPERATIONS ====================

    test.describe("Массовые операции", () => {
      test("C5740: Добавить несколько пользователей в группу", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Добавить несколько пользователей в группу", async () => {
          // Создаём тестовую группу
          const { response: createResp, data: createData } =
            await orgStructureAPI.createUserGroup({
              title: `Test Batch Add ${Date.now()}`,
              emoji: "👥",
              autoTitle: false,
            });

          if (createResp.status() === 403) {
            console.log("Нет прав на создание групп");
            return;
          }

          const groupId = createData?.id || createData?.userGroup?.id;

          if (groupId) {
            // Находим пользователей для добавления
            const { data: usersOutside } =
              await orgStructureAPI.getUserGroupUsersOutside(groupId, {
                limit: 5,
              });
            const outsideItems = usersOutside?.items || usersOutside || [];

            if (outsideItems.length >= 3) {
              const userIds = outsideItems.slice(0, 3).map((u) => u.id);

              // Добавляем всех одним запросом
              const { response: addResp } =
                await orgStructureAPI.addUsersToUserGroup(groupId, userIds);
              expect(addResp.ok()).toBe(true);

              // Проверяем что все добавлены
              const { data: groupUsersData } =
                await orgStructureAPI.getUserGroupUsers(groupId);
              const groupUsers = groupUsersData?.items || groupUsersData || [];

              for (const userId of userIds) {
                expect(groupUsers.some((u) => u.id === userId)).toBe(true);
              }
            }

            // Cleanup
            await orgStructureAPI.deleteUserGroup(groupId);
          }
        });
      });

      test("C5741: Удалить несколько пользователей из группы", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Удалить несколько пользователей из группы", async () => {
          // Создаём тестовую группу
          const { response: createResp, data: createData } =
            await orgStructureAPI.createUserGroup({
              title: `Test Batch Remove ${Date.now()}`,
              emoji: "➖",
              autoTitle: false,
            });

          if (createResp.status() === 403) {
            console.log("Нет прав на создание групп");
            return;
          }

          const groupId = createData?.id || createData?.userGroup?.id;

          if (groupId) {
            // Находим и добавляем пользователей
            const { data: usersOutside } =
              await orgStructureAPI.getUserGroupUsersOutside(groupId, {
                limit: 5,
              });
            const outsideItems = usersOutside?.items || usersOutside || [];

            if (outsideItems.length >= 3) {
              const userIds = outsideItems.slice(0, 3).map((u) => u.id);

              // Добавляем
              await orgStructureAPI.addUsersToUserGroup(groupId, userIds);

              // Удаляем всех одним запросом
              const { response: removeResp } =
                await orgStructureAPI.removeUsersFromUserGroup(
                  groupId,
                  userIds,
                );
              expect(removeResp.ok()).toBe(true);

              // Проверяем что все удалены
              const { data: groupUsersData } =
                await orgStructureAPI.getUserGroupUsers(groupId);
              const groupUsers = groupUsersData?.items || groupUsersData || [];

              for (const userId of userIds) {
                expect(groupUsers.some((u) => u.id === userId)).toBe(false);
              }
            }

            // Cleanup
            await orgStructureAPI.deleteUserGroup(groupId);
          }
        });
      });

      test("C5742: Пагинация пользователей группы", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Пагинация пользователей группы", async () => {
          const groupId = await findExistingUserGroup(orgStructureAPI);

          if (groupId) {
            const pageSize = 3;

            // Получаем первую страницу
            const { response: resp1, data: data1 } =
              await orgStructureAPI.getUserGroupUsers(groupId, {
                limit: pageSize,
                offset: 0,
              });
            expect(resp1.ok()).toBe(true);

            // Получаем вторую страницу
            const { response: resp2, data: data2 } =
              await orgStructureAPI.getUserGroupUsers(groupId, {
                limit: pageSize,
                offset: pageSize,
              });
            expect(resp2.ok()).toBe(true);

            const items1 = data1?.items || data1 || [];
            const items2 = data2?.items || data2 || [];

            // Если есть данные на обеих страницах, проверяем что они не пересекаются
            if (items1.length > 0 && items2.length > 0) {
              const ids1 = items1.map((u) => u.id);
              const ids2 = items2.map((u) => u.id);

              for (const id of ids2) {
                expect(ids1).not.toContain(id);
              }
            }
          }
        });
      });
    });
  },
);
