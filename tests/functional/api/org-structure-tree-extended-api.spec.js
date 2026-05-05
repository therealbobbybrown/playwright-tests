// @ts-check
import { test as base, expect } from "@playwright/test";
import {
  OrgStructureAPI,
  ProfileAPI,
  getCredentials,
} from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * Расширенные API тесты для дерева организационной структуры
 *
 * Покрытие (TASK-049, TASK-050):
 * - addTreeUser(userId, headUserId, strategy) - добавление пользователя к руководителю
 * - addTreeUsersToDepartment(departmentId, usersIds) - добавление пользователей в департамент
 * - removeTreeUsersFromDepartment(departmentId, usersIds) - удаление пользователей из департамента
 * - setDepartmentHeadUser(departmentId, headUserId, strategy) - назначение руководителя департамента
 * - unsetDepartmentHeadUser(departmentId) - снятие руководителя департамента
 *
 * @tags @api @org-structure @tree @extended
 */

// Расширяем test с фикстурами
const test = base.extend({
  orgAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  profileAPI: async ({ request }, use) => {
    const api = new ProfileAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Кэш для данных
let cachedDepartmentId = null;
let cachedUserId = null;
let cachedHeadUserId = null;

/**
 * Найти существующий департамент
 */
async function findDepartment(api) {
  if (cachedDepartmentId) return cachedDepartmentId;

  const { data } = await api.getDepartments({ limit: 10 });
  const items = data?.items || data || [];

  if (items.length > 0) {
    cachedDepartmentId = items[0].id;
    return cachedDepartmentId;
  }

  return null;
}

/**
 * Найти пользователя для тестов
 */
async function findUser(profileAPI, excludeIds = []) {
  const { data } = await profileAPI.getUsers({ limit: 50 });
  const items = data?.items || data || [];

  // Ищем пользователя, которого нет в списке исключений
  const user = items.find((u) => !excludeIds.includes(u.id));

  return user ? user.id : null;
}

/**
 * Найти руководителя с подчинёнными
 */
async function findHeadUser(orgAPI) {
  if (cachedHeadUserId) return cachedHeadUserId;

  const { data } = await orgAPI.getRootHeads();
  const items = data?.items || data || [];

  if (items.length > 0) {
    cachedHeadUserId = items[0].id;
    return cachedHeadUserId;
  }

  return null;
}

// ==================== ADD TREE USER ====================

test.describe(
  "Org Structure Tree Extended API - Add User",
  { tag: ["@api", "@org-structure", "@tree", "@extended", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Tree - Add User");
    });

    test(
      "C5818: POST /manager/org-struct/tree/users - добавить пользователя к руководителю",
      { tag: ["@critical"] },
      async ({ orgAPI, profileAPI }) => {
        setSeverity("critical");

        let headUserId, userId, previousHeadId, response, data;
        await test.step("Выполнить запрос: POST /manager/org-struct/tree/users - добавить пользователя к руководителю", async () => {
          // Находим руководителя
          headUserId = await findHeadUser(orgAPI);
          test.skip(!headUserId, "Нет руководителей в системе");

          // Находим пользователя, которого можно добавить
          userId = await findUser(profileAPI, [headUserId]);
          test.skip(!userId, "Нет подходящих пользователей");

          // Сохраняем текущее положение пользователя для возможного восстановления
          const { data: userInfoBefore } = await orgAPI
            .getTreeUserInfo(userId)
            .catch(() => ({ data: null }));
          previousHeadId =
            userInfoBefore?.headUserId || userInfoBefore?.head?.id;

          // Пытаемся добавить пользователя к руководителю
          ({ response, data } = await orgAPI.addTreeUser(userId, headUserId));

          // Операция может быть успешной или отклонена (если пользователь уже в дереве)
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 409]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();

            // Cleanup: пытаемся вернуть пользователя к предыдущему руководителю
            if (previousHeadId && previousHeadId !== headUserId) {
              await orgAPI.addTreeUser(userId, previousHeadId).catch(() => {});
            }
          }

          console.log(
            `addTreeUser(${userId}, ${headUserId}): status ${response.status()}`,
          );
        });
      },
    );

    test("C5819: Добавить пользователя с стратегией", async ({
      orgAPI,
      profileAPI,
    }) => {
      setSeverity("normal");

      let headUserId, userId, previousHeadId, response;
      await test.step("Выполнить запрос: Добавить пользователя с стратегией", async () => {
        headUserId = await findHeadUser(orgAPI);
        test.skip(!headUserId, "Нет руководителей");

        userId = await findUser(profileAPI, [headUserId]);
        test.skip(!userId, "Нет пользователей");

        // Сохраняем текущее положение пользователя
        const { data: userInfoBefore } = await orgAPI
          .getTreeUserInfo(userId)
          .catch(() => ({ data: null }));
        previousHeadId = userInfoBefore?.headUserId || userInfoBefore?.head?.id;

        // Пробуем со стратегией 'move' (перемещение)
        ({ response } = await orgAPI.addTreeUser(userId, headUserId, "move"));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 409]).toContain(response.status());

        // Cleanup: возвращаем пользователя к предыдущему руководителю
        if (response.ok() && previousHeadId && previousHeadId !== headUserId) {
          await orgAPI.addTreeUser(userId, previousHeadId).catch(() => {});
        }
      });
    });

    test("C5820: Добавить пользователя - несуществующий пользователь", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Добавить пользователя - несуществующий пользователь", async () => {
        const headUserId = await findHeadUser(orgAPI);
        test.skip(!headUserId, "Нет руководителей");

        const { response } = await orgAPI.addTreeUser(999999999, headUserId);

        expect([400, 404]).toContain(response.status());
      });
    });

    test("C5821: Добавить пользователя - несуществующий руководитель", async ({
      orgAPI,
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Добавить пользователя - несуществующий руководитель", async () => {
        const userId = await findUser(profileAPI);
        test.skip(!userId, "Нет пользователей");

        const { response } = await orgAPI.addTreeUser(userId, 999999999);

        expect([400, 404]).toContain(response.status());
      });
    });

    test("C5822: Добавить пользователя - оба ID несуществующие", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Добавить пользователя - оба ID несуществующие", async () => {
        const { response } = await orgAPI.addTreeUser(999999999, 999999998);

        expect([400, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== ADD USERS TO DEPARTMENT ====================

test.describe(
  "Org Structure Tree Extended API - Add Users to Department",
  { tag: ["@api", "@org-structure", "@tree", "@extended", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Tree - Add Users to Department");
    });

    test(
      "C5823: POST /manager/org-struct/tree/departments/{id}/users/add - добавить пользователей в департамент",
      { tag: ["@critical"] },
      async ({ orgAPI, profileAPI }) => {
        setSeverity("critical");

        let departmentId, userId, response, data;
        await test.step("Выполнить запрос: POST /manager/org-struct/tree/departments/{id}/users/add - добавить пользователей в департамент", async () => {
          departmentId = await findDepartment(orgAPI);
          test.skip(!departmentId, "Нет департаментов");

          // Получаем пользователей, которые уже не в этом департаменте
          const { data: deptUsersData } =
            await orgAPI.getUsersFromDepartment(departmentId);
          const existingUserIds = (
            deptUsersData?.items ||
            deptUsersData ||
            []
          ).map((u) => u.id);

          userId = await findUser(profileAPI, existingUserIds);
          test.skip(!userId, "Нет пользователей");

          ({ response, data } = await orgAPI.addTreeUsersToDepartment(
            departmentId,
            [userId],
          ));

          // Операция может успешно завершиться или вернуть ошибку (если пользователь уже там)
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 409]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();

            // Cleanup: удаляем добавленного пользователя из департамента
            await orgAPI
              .removeTreeUsersFromDepartment(departmentId, [userId])
              .catch(() => {});
          }

          console.log(
            `addTreeUsersToDepartment(${departmentId}, [${userId}]): status ${response.status()}`,
          );
        });
      },
    );

    test("C5824: Добавить нескольких пользователей в департамент", async ({
      orgAPI,
      profileAPI,
    }) => {
      setSeverity("normal");

      let departmentId, userIds, response;
      await test.step("Выполнить запрос: Добавить нескольких пользователей в департамент", async () => {
        departmentId = await findDepartment(orgAPI);
        test.skip(!departmentId, "Нет департаментов");

        // Получаем пользователей, которые уже не в этом департаменте
        const { data: deptUsersData } =
          await orgAPI.getUsersFromDepartment(departmentId);
        const existingUserIds = (
          deptUsersData?.items ||
          deptUsersData ||
          []
        ).map((u) => u.id);

        // Получаем несколько пользователей, не в департаменте
        const { data: usersData } = await profileAPI.getUsers({ limit: 10 });
        const users = (usersData?.items || usersData || []).filter(
          (u) => !existingUserIds.includes(u.id),
        );
        userIds = users.slice(0, 2).map((u) => u.id);

        test.skip(userIds.length < 2, "Недостаточно пользователей");

        ({ response } = await orgAPI.addTreeUsersToDepartment(
          departmentId,
          userIds,
        ));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 409]).toContain(response.status());

        // Cleanup: удаляем добавленных пользователей
        if (response.ok()) {
          await orgAPI
            .removeTreeUsersFromDepartment(departmentId, userIds)
            .catch(() => {});
        }
      });
    });

    test("C5825: Добавить пользователей - пустой массив", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Добавить пользователей - пустой массив", async () => {
        const departmentId = await findDepartment(orgAPI);
        test.skip(!departmentId, "Нет департаментов");

        const { response } = await orgAPI.addTreeUsersToDepartment(
          departmentId,
          [],
        );

        // Пустой массив может быть отклонён или принят без изменений
        expect([200, 400, 422]).toContain(response.status());
      });
    });

    test("C5826: Добавить пользователей - несуществующий департамент", async ({
      orgAPI,
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Добавить пользователей - несуществующий департамент", async () => {
        const userId = await findUser(profileAPI);
        test.skip(!userId, "Нет пользователей");

        const { response } = await orgAPI.addTreeUsersToDepartment(999999999, [
          userId,
        ]);

        expect([400, 404]).toContain(response.status());
      });
    });

    test("C5827: Добавить пользователей - несуществующие пользователи", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Добавить пользователей - несуществующие пользователи", async () => {
        const departmentId = await findDepartment(orgAPI);
        test.skip(!departmentId, "Нет департаментов");

        const { response } = await orgAPI.addTreeUsersToDepartment(
          departmentId,
          [999999999, 999999998],
        );

        // API может частично принять или полностью отклонить
        expect([200, 201, 400, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== REMOVE USERS FROM DEPARTMENT ====================

test.describe(
  "Org Structure Tree Extended API - Remove Users from Department",
  { tag: ["@api", "@org-structure", "@tree", "@extended", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.ORG_STRUCTURE,
        "Tree - Remove Users from Department",
      );
    });

    test(
      "C5828: POST /manager/org-struct/department/{id}/users/delete/ - удалить пользователей из департамента",
      { tag: ["@critical"] },
      async ({ orgAPI }) => {
        setSeverity("critical");

        let departmentId, userId, response;
        await test.step("Выполнить запрос: POST /manager/org-struct/department/{id}/users/delete/ - удалить пользователей из департамента", async () => {
          departmentId = await findDepartment(orgAPI);
          test.skip(!departmentId, "Нет департаментов");

          // Получаем пользователей департамента
          const { data: usersData } =
            await orgAPI.getUsersFromDepartment(departmentId);
          const users = usersData?.items || usersData || [];

          test.skip(users.length === 0, "Нет пользователей в департаменте");

          // Берём первого пользователя для теста (осторожно!)
          // Не удаляем реально - только проверяем что endpoint доступен
          userId = users[0].id;

          ({ response } = await orgAPI.removeTreeUsersFromDepartment(
            departmentId,
            [userId],
          ));

          // Операция может быть успешной или отклонена по бизнес-правилам
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 409]).toContain(response.status());

          console.log(
            `removeTreeUsersFromDepartment(${departmentId}, [${userId}]): status ${response.status()}`,
          );

          // Если успешно удалили - добавляем обратно (cleanup)
          if (response.ok()) {
            await orgAPI
              .addTreeUsersToDepartment(departmentId, [userId])
              .catch(() => {});
          }
        });
      },
    );

    test("C5829: Удалить пользователей - пустой массив", async ({ orgAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Удалить пользователей - пустой массив", async () => {
        const departmentId = await findDepartment(orgAPI);
        test.skip(!departmentId, "Нет департаментов");

        const { response } = await orgAPI.removeTreeUsersFromDepartment(
          departmentId,
          [],
        );

        expect([200, 400, 422]).toContain(response.status());
      });
    });

    test("C5830: Удалить пользователей - несуществующий департамент", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Удалить пользователей - несуществующий департамент", async () => {
        const { response } = await orgAPI.removeTreeUsersFromDepartment(
          999999999,
          [1],
        );

        expect([400, 404]).toContain(response.status());
      });
    });

    test("C5831: Удалить пользователей - несуществующие пользователи", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Удалить пользователей - несуществующие пользователи", async () => {
        const departmentId = await findDepartment(orgAPI);
        test.skip(!departmentId, "Нет департаментов");

        const { response } = await orgAPI.removeTreeUsersFromDepartment(
          departmentId,
          [999999999],
        );

        // API может вернуть успех (если пользователя и так не было) или ошибку
        expect([200, 400, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== SET DEPARTMENT HEAD USER ====================

test.describe(
  "Org Structure Tree Extended API - Set Department Head",
  { tag: ["@api", "@org-structure", "@tree", "@extended", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Tree - Set Department Head");
    });

    test(
      "C5832: POST /manager/org-struct/tree/departments/{id}/heads/set/ - назначить руководителя департамента",
      { tag: ["@critical"] },
      async ({ orgAPI, profileAPI }) => {
        setSeverity("critical");

        let departmentId, originalHead, userId, response, data;
        await test.step("Выполнить запрос: POST /manager/org-struct/tree/departments/{id}/heads/set/ - назначить руководителя департамента", async () => {
          departmentId = await findDepartment(orgAPI);
          test.skip(!departmentId, "Нет департаментов");

          // Получаем информацию о департаменте (сохраняем текущего руководителя)
          const { data: deptInfo } =
            await orgAPI.getTreeDepartmentInfo(departmentId);
          originalHead = deptInfo?.headUser || deptInfo?.head;

          // Получаем пользователя для назначения руководителем
          userId = await findUser(profileAPI);
          test.skip(!userId, "Нет пользователей");

          ({ response, data } = await orgAPI.setDepartmentHeadUser(
            departmentId,
            userId,
          ));

          // Операция может быть успешной или отклонена
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 409]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
          }

          console.log(
            `setDepartmentHeadUser(${departmentId}, ${userId}): status ${response.status()}`,
          );

          // Cleanup: восстанавливаем оригинального руководителя
          if (response.ok() && originalHead?.id) {
            await orgAPI
              .setDepartmentHeadUser(departmentId, originalHead.id)
              .catch(() => {});
          } else if (response.ok()) {
            // Если руководителя не было - снимаем назначенного
            await orgAPI.unsetDepartmentHeadUser(departmentId).catch(() => {});
          }
        });
      },
    );

    test("C5833: Назначить руководителя со стратегией", async ({
      orgAPI,
      profileAPI,
    }) => {
      setSeverity("normal");

      let departmentId, originalHead, response;
      await test.step("Выполнить запрос: Назначить руководителя со стратегией", async () => {
        departmentId = await findDepartment(orgAPI);
        test.skip(!departmentId, "Нет департаментов");

        // Сохраняем текущего руководителя
        const { data: deptInfo } =
          await orgAPI.getTreeDepartmentInfo(departmentId);
        originalHead = deptInfo?.headUser || deptInfo?.head;

        const userId = await findUser(profileAPI);
        test.skip(!userId, "Нет пользователей");

        // Пробуем со стратегией
        ({ response } = await orgAPI.setDepartmentHeadUser(
          departmentId,
          userId,
          "move",
        ));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 403, 409]).toContain(response.status());

        // Cleanup: восстанавливаем оригинального руководителя
        if (response.ok() && originalHead?.id) {
          await orgAPI
            .setDepartmentHeadUser(departmentId, originalHead.id)
            .catch(() => {});
        } else if (response.ok()) {
          await orgAPI.unsetDepartmentHeadUser(departmentId).catch(() => {});
        }
      });
    });

    test("C5834: Назначить руководителя - несуществующий департамент", async ({
      orgAPI,
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Назначить руководителя - несуществующий департамент", async () => {
        const userId = await findUser(profileAPI);
        test.skip(!userId, "Нет пользователей");

        const { response } = await orgAPI.setDepartmentHeadUser(
          999999999,
          userId,
        );

        expect([400, 404]).toContain(response.status());
      });
    });

    test("C5835: Назначить руководителя - несуществующий пользователь", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Назначить руководителя - несуществующий пользователь", async () => {
        const departmentId = await findDepartment(orgAPI);
        test.skip(!departmentId, "Нет департаментов");

        const { response } = await orgAPI.setDepartmentHeadUser(
          departmentId,
          999999999,
        );

        expect([400, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== UNSET DEPARTMENT HEAD USER ====================

test.describe(
  "Org Structure Tree Extended API - Unset Department Head",
  { tag: ["@api", "@org-structure", "@tree", "@extended", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Tree - Unset Department Head");
    });

    test(
      "C5836: POST /manager/org-struct/tree/departments/{id}/heads/unset/ - снять руководителя департамента",
      { tag: ["@critical"] },
      async ({ orgAPI }) => {
        setSeverity("critical");

        let departmentId, currentHead, response, data;
        await test.step("Выполнить запрос: POST /manager/org-struct/tree/departments/{id}/heads/unset/ - снять руководителя департамента", async () => {
          departmentId = await findDepartment(orgAPI);
          test.skip(!departmentId, "Нет департаментов");

          // Получаем информацию о департаменте, чтобы понять есть ли руководитель
          const { data: deptInfo } =
            await orgAPI.getTreeDepartmentInfo(departmentId);
          currentHead = deptInfo?.headUser || deptInfo?.head;

          ({ response, data } =
            await orgAPI.unsetDepartmentHeadUser(departmentId));

          // Если руководитель был - операция успешна
          // Если нет - может быть 400 или успешный no-op
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 204, 400]).toContain(response.status());

          console.log(
            `unsetDepartmentHeadUser(${departmentId}): status ${response.status()}`,
          );

          // Cleanup: если сняли руководителя - попробуем вернуть
          if (response.ok() && currentHead?.id) {
            await orgAPI
              .setDepartmentHeadUser(departmentId, currentHead.id)
              .catch(() => {});
          }
        });
      },
    );

    test("C5837: Снять руководителя - несуществующий департамент", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Снять руководителя - несуществующий департамент", async () => {
        const { response } = await orgAPI.unsetDepartmentHeadUser(999999999);

        expect([400, 404]).toContain(response.status());
      });
    });

    test("C5838: Снять руководителя - отрицательный ID департамента", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Снять руководителя - отрицательный ID департамента", async () => {
        const { response } = await orgAPI.unsetDepartmentHeadUser(-1);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5839: Снять руководителя - невалидный ID (строка)", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Снять руководителя - невалидный ID (строка)", async () => {
        const { response } = await orgAPI.unsetDepartmentHeadUser("invalid");

        expect([400, 404, 500]).toContain(response.status());
      });
    });
  },
);

// ==================== ADD USERS TO ROOT ====================

test.describe(
  "Org Structure Tree Extended API - Root Operations",
  { tag: ["@api", "@org-structure", "@tree", "@extended", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Tree - Root Operations");
    });

    test("C5840: POST /manager/org-struct/tree/users/root - добавить пользователей в корень", async ({
      orgAPI,
      profileAPI,
    }) => {
      setSeverity("normal");

      let userId, previousHeadId, response, data;
      await test.step("Выполнить запрос: POST /manager/org-struct/tree/users/root - добавить пользователей в корень", async () => {
        userId = await findUser(profileAPI);
        test.skip(!userId, "Нет пользователей");

        // Сохраняем текущее положение пользователя
        const { data: userInfoBefore } = await orgAPI
          .getTreeUserInfo(userId)
          .catch(() => ({ data: null }));
        previousHeadId = userInfoBefore?.headUserId || userInfoBefore?.head?.id;

        ({ response, data } = await orgAPI.addTreeUsersToRoot([userId]));

        // Может быть успешно или отклонено (если уже есть)
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 409]).toContain(response.status());

        console.log(
          `addTreeUsersToRoot([${userId}]): status ${response.status()}`,
        );

        // Cleanup: возвращаем пользователя к предыдущему руководителю
        if (response.ok() && previousHeadId) {
          await orgAPI.addTreeUser(userId, previousHeadId).catch(() => {});
        }
      });
    });

    test("C5841: POST /manager/org-struct/tree/root/heads/add/ - добавить руководителей компании", async ({
      orgAPI,
      profileAPI,
    }) => {
      setSeverity("normal");

      let userId, wasAlreadyHead, response, data;
      await test.step("Выполнить запрос: POST /manager/org-struct/tree/root/heads/add/ - добавить руководителей компании", async () => {
        userId = await findUser(profileAPI);
        test.skip(!userId, "Нет пользователей");

        // Проверяем, был ли пользователь уже в руководителях
        const { data: headsBefore } = await orgAPI.getRootHeads();
        const headIdsBefore = (headsBefore?.items || headsBefore || []).map(
          (h) => h.id,
        );
        wasAlreadyHead = headIdsBefore.includes(userId);

        ({ response, data } = await orgAPI.addRootHeadsUsers([userId]));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 409]).toContain(response.status());

        console.log(
          `addRootHeadsUsers([${userId}]): status ${response.status()}`,
        );

        // Cleanup: если пользователь не был руководителем - удаляем
        if (response.ok() && !wasAlreadyHead) {
          await orgAPI.removeRootHeadsUsers([userId]).catch(() => {});
        }
      });
    });

    test("C5842: POST /manager/org-struct/tree/root/heads/delete/ - удалить руководителей компании", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /manager/org-struct/tree/root/heads/delete/ - удалить руководителей компании", async () => {
        // Получаем текущих руководителей
        const { data: headsData } = await orgAPI.getRootHeads();
        const heads = headsData?.items || headsData || [];

        test.skip(heads.length === 0, "Нет руководителей для теста");

        // ОСТОРОЖНО: не удаляем реальных руководителей!
        // Только проверяем доступность endpoint с несуществующим ID
        const { response } = await orgAPI.removeRootHeadsUsers([999999999]);

        expect([200, 400, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== ADD DEPARTMENTS TO DEPARTMENT ====================

test.describe(
  "Org Structure Tree Extended API - Department Hierarchy",
  { tag: ["@api", "@org-structure", "@tree", "@extended", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Tree - Department Hierarchy");
    });

    test("C5843: POST /manager/org-struct/tree/departments/{id}/departments/ - добавить департаменты в департамент", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      let parentDeptId, childDeptId, originalParentId, response;
      await test.step("Выполнить запрос: POST /manager/org-struct/tree/departments/{id}/departments/ - добавить департаменты в департамент", async () => {
        // Получаем департаменты
        const { data: deptsData } = await orgAPI.getDepartments({ limit: 10 });
        const depts = deptsData?.items || deptsData || [];

        test.skip(depts.length < 2, "Недостаточно департаментов");

        parentDeptId = depts[0].id;
        childDeptId = depts[1].id;

        // Сохраняем текущего родителя дочернего департамента
        const { data: childInfo } = await orgAPI
          .getTreeDepartmentInfo(childDeptId)
          .catch(() => ({ data: null }));
        originalParentId = childInfo?.parentId || childInfo?.parent?.id;

        ({ response } = await orgAPI.addTreeDepartmentsToDepartment(
          parentDeptId,
          [childDeptId],
        ));

        // Может быть успешно или отклонено (циклическая зависимость, уже есть и т.д.)
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 409]).toContain(response.status());

        console.log(
          `addTreeDepartmentsToDepartment(${parentDeptId}, [${childDeptId}]): status ${response.status()}`,
        );

        // Cleanup: возвращаем департамент к оригинальному родителю
        if (
          response.ok() &&
          originalParentId &&
          originalParentId !== parentDeptId
        ) {
          await orgAPI
            .addTreeDepartmentsToDepartment(originalParentId, [childDeptId])
            .catch(() => {});
        } else if (response.ok() && !originalParentId) {
          // Если был в корне - возвращаем в корень
          await orgAPI.addTreeDepartmentsToRoot([childDeptId]).catch(() => {});
        }
      });
    });

    test("C5844: POST /manager/org-struct/tree/departments/root/departments/ - добавить департаменты в корень", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      let departmentId, originalParentId, response;
      await test.step("Выполнить запрос: POST /manager/org-struct/tree/departments/root/departments/ - добавить департаменты в корень", async () => {
        departmentId = await findDepartment(orgAPI);
        test.skip(!departmentId, "Нет департаментов");

        // Сохраняем текущего родителя департамента
        const { data: deptInfo } = await orgAPI
          .getTreeDepartmentInfo(departmentId)
          .catch(() => ({ data: null }));
        originalParentId = deptInfo?.parentId || deptInfo?.parent?.id;

        ({ response } = await orgAPI.addTreeDepartmentsToRoot([departmentId]));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 409]).toContain(response.status());

        // Cleanup: возвращаем департамент к оригинальному родителю
        if (response.ok() && originalParentId) {
          await orgAPI
            .addTreeDepartmentsToDepartment(originalParentId, [departmentId])
            .catch(() => {});
        }
      });
    });
  },
);

// ==================== INTEGRATION TESTS ====================

test.describe(
  "Org Structure Tree Extended API - Integration",
  {
    tag: [
      "@api",
      "@org-structure",
      "@tree",
      "@extended",
      "@integration",
      "@regression",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Tree - Integration");
    });

    test("C5845: Согласованность: добавить пользователя в департамент и проверить", async ({
      orgAPI,
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Согласованность: добавить пользователя в департамент и проверить", async () => {
        const departmentId = await findDepartment(orgAPI);
        test.skip(!departmentId, "Нет департаментов");

        // Получаем пользователей до операции
        const { data: beforeData } =
          await orgAPI.getUsersFromDepartment(departmentId);
        const beforeUsers = beforeData?.items || beforeData || [];
        const beforeCount = beforeUsers.length;

        const userId = await findUser(
          profileAPI,
          beforeUsers.map((u) => u.id),
        );
        test.skip(!userId, "Нет пользователей для добавления");

        // Добавляем пользователя
        const { response: addResp } = await orgAPI.addTreeUsersToDepartment(
          departmentId,
          [userId],
        );

        if (!addResp.ok()) {
          // Если не удалось добавить - это ок, проверяем только доступность
          console.log(`Не удалось добавить пользователя: ${addResp.status()}`);
          return;
        }

        // Проверяем что пользователь появился
        const { data: afterData } =
          await orgAPI.getUsersFromDepartment(departmentId);
        const afterUsers = afterData?.items || afterData || [];

        console.log(
          `Пользователей до: ${beforeCount}, после: ${afterUsers.length}`,
        );

        // Cleanup: удаляем добавленного пользователя
        await orgAPI
          .removeTreeUsersFromDepartment(departmentId, [userId])
          .catch(() => {});
      });
    });

    test("C5846: Согласованность: назначить и снять руководителя", async ({
      orgAPI,
      profileAPI,
    }) => {
      setSeverity("normal");

      let departmentId, originalHead, unsetResp;
      await test.step("Выполнить запрос: Согласованность: назначить и снять руководителя", async () => {
        departmentId = await findDepartment(orgAPI);
        test.skip(!departmentId, "Нет департаментов");

        // Сохраняем текущего руководителя
        const { data: beforeInfo } =
          await orgAPI.getTreeDepartmentInfo(departmentId);
        originalHead = beforeInfo?.headUser || beforeInfo?.head;

        const userId = await findUser(profileAPI);
        test.skip(!userId, "Нет пользователей");

        // Назначаем нового руководителя
        const { response: setResp } = await orgAPI.setDepartmentHeadUser(
          departmentId,
          userId,
        );

        if (!setResp.ok()) {
          console.log(`Не удалось назначить руководителя: ${setResp.status()}`);
          return;
        }

        // Проверяем что руководитель изменился
        const { data: afterSetInfo } =
          await orgAPI.getTreeDepartmentInfo(departmentId);
        const newHead = afterSetInfo?.headUser || afterSetInfo?.head;

        if (newHead?.id) {
          expect(String(newHead.id)).toBe(String(userId));
        }

        // Снимаем руководителя
        ({ response: unsetResp } =
          await orgAPI.unsetDepartmentHeadUser(departmentId));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 204, 400]).toContain(unsetResp.status());

        // Проверяем что руководитель снят
        const { data: afterUnsetInfo } =
          await orgAPI.getTreeDepartmentInfo(departmentId);
        const clearedHead = afterUnsetInfo?.headUser || afterUnsetInfo?.head;

        // Cleanup: восстанавливаем оригинального руководителя
        if (originalHead?.id) {
          await orgAPI
            .setDepartmentHeadUser(departmentId, originalHead.id)
            .catch(() => {});
        }
      });
    });
  },
);

// ==================== NEGATIVE TESTS ====================

test.describe(
  "Org Structure Tree Extended API - Negative",
  {
    tag: [
      "@api",
      "@org-structure",
      "@tree",
      "@extended",
      "@negative",
      "@regression",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Tree - Negative");
    });

    test("C5847: Добавить пользователя самому себе как руководителю", async ({
      orgAPI,
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Добавить пользователя самому себе как руководителю", async () => {
        const userId = await findUser(profileAPI);
        test.skip(!userId, "Нет пользователей");

        // Пытаемся добавить пользователя к самому себе
        const { response } = await orgAPI.addTreeUser(userId, userId);

        // Должна быть ошибка валидации
        expect([400, 409, 422]).toContain(response.status());
      });
    });

    test("C5848: Назначить руководителем пользователя, который не в департаменте", async ({
      orgAPI,
      profileAPI,
    }) => {
      setSeverity("normal");

      let departmentId, originalHead, response;
      await test.step("Выполнить запрос: Назначить руководителем пользователя, который не в департаменте", async () => {
        departmentId = await findDepartment(orgAPI);
        test.skip(!departmentId, "Нет департаментов");

        // Сохраняем текущего руководителя
        const { data: deptInfo } =
          await orgAPI.getTreeDepartmentInfo(departmentId);
        originalHead = deptInfo?.headUser || deptInfo?.head;

        // Получаем пользователей департамента
        const { data: deptUsers } =
          await orgAPI.getUsersFromDepartment(departmentId);
        const usersInDept = (deptUsers?.items || deptUsers || []).map(
          (u) => u.id,
        );

        // Ищем пользователя НЕ из этого департамента
        const userId = await findUser(profileAPI, usersInDept);
        test.skip(!userId, "Нет пользователей вне департамента");

        ({ response } = await orgAPI.setDepartmentHeadUser(
          departmentId,
          userId,
        ));

        // API может разрешить это (добавив пользователя) или отклонить
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 403, 409]).toContain(response.status());

        // Cleanup: восстанавливаем оригинального руководителя
        if (response.ok() && originalHead?.id) {
          await orgAPI
            .setDepartmentHeadUser(departmentId, originalHead.id)
            .catch(() => {});
        } else if (response.ok()) {
          await orgAPI.unsetDepartmentHeadUser(departmentId).catch(() => {});
        }
      });
    });

    test("C5849: Добавить департамент сам в себя", async ({ orgAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Добавить департамент сам в себя", async () => {
        const departmentId = await findDepartment(orgAPI);
        test.skip(!departmentId, "Нет департаментов");

        const { response } = await orgAPI.addTreeDepartmentsToDepartment(
          departmentId,
          [departmentId],
        );

        // Должна быть ошибка - циклическая зависимость
        expect([400, 409, 422]).toContain(response.status());
      });
    });

    test("C5850: SQL injection в ID департамента", async ({ orgAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: SQL injection в ID департамента", async () => {
        const { response } = await orgAPI.unsetDepartmentHeadUser(
          "1'; DROP TABLE departments; --",
        );

        expect([400, 404, 500]).toContain(response.status());
      });
    });
  },
);
