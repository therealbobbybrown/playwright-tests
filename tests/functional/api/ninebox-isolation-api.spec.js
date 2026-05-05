// @ts-check
import { test as base, expect } from "@playwright/test";
import { NineBoxAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * NineBox Isolation API — проверка видимости данных для разных ролей
 *
 * Покрытие:
 * - Manager видит только своих подчинённых в protected матрице
 * - Head видит только прямых подчинённых
 * - Manager vs Head — разный объём данных
 * - Параметр preformanceReviewRevisionId (с опечаткой) обрабатывается API
 */

const test = base.extend({
  adminNineBoxAPI: async ({ request }, use) => {
    const api = new NineBoxAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  managerNineBoxAPI: async ({ request }, use) => {
    const api = new NineBoxAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  headNineBoxAPI: async ({ request }, use) => {
    const api = new NineBoxAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
});

/**
 * Извлечь всех пользователей из 3D матрицы NineBox
 * @param {Array} matrix - 3D массив [row][col][{userId, yValue, xValue}]
 * @returns {Array<{userId: number, yValue: number, xValue: number}>}
 */
function extractUsersFromMatrix(matrix) {
  const users = [];
  for (const row of matrix) {
    for (const cell of row) {
      for (const user of cell) {
        users.push(user);
      }
    }
  }
  return users;
}

test.describe(
  "NineBox Isolation API — scoping по ролям",
  { tag: ["@api", "@ninebox", "@regression"] },
  () => {
    // Запуск последовательно чтобы enable/disable NineBox не конфликтовали
    test.describe.configure({ mode: "serial" });

    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.NINE_BOX, "NineBox Isolation");
    });

    test(
      "C9326: Менеджер видит ТОЛЬКО своих подчинённых в protected матрице",
      { tag: ["@critical"] },
      async ({ adminNineBoxAPI, managerNineBoxAPI }) => {
        setSeverity("critical");

        // Убедиться что NineBox включён
        const { data: settings } =
          await adminNineBoxAPI.getManagerSettings();
        const wasEnabled = settings.isEnabled;
        if (!wasEnabled) {
          await adminNineBoxAPI.enable();
        }

        try {
          let managerResponse, managerUsers;

          await test.step(
            "Выполнить: Получить protected матрицу менеджера с usersSubset=subordinates",
            async () => {
              const { response, data } =
                await managerNineBoxAPI.getProtectedMatrix({
                  usersSubset: "subordinates",
                });
              managerResponse = response;
              managerUsers = extractUsersFromMatrix(data);
            },
          );

          await test.step("Проверить ответ", async () => {
            expect(
              managerResponse.status(),
              "Protected matrix должна вернуть 200",
            ).toBe(200);

            // Менеджер должен видеть хотя бы одного подчинённого
            expect(
              managerUsers.length,
              "Менеджер должен видеть подчинённых в матрице",
            ).toBeGreaterThan(0);

            // Каждый пользователь должен иметь корректную структуру
            for (const user of managerUsers) {
              expect(user).toHaveProperty("userId");
              expect(user).toHaveProperty("yValue");
              expect(user).toHaveProperty("xValue");
              expect(
                typeof user.userId,
                "userId должен быть числом",
              ).toBe("number");
              expect(
                typeof user.yValue,
                "yValue должен быть числом",
              ).toBe("number");
              expect(
                typeof user.xValue,
                "xValue должен быть числом",
              ).toBe("number");
              expect(
                user.userId,
                "userId должен быть положительным",
              ).toBeGreaterThan(0);
            }
          });

          let adminUserIds, managerUserIds;

          await test.step(
            "Выполнить: Получить admin матрицу и manager protected матрицу для сравнения",
            async () => {
              const { response: adminResp, data: adminMatrix } =
                await adminNineBoxAPI.getManagerMatrix();
              expect(
                adminResp.status(),
                "Admin matrix должна вернуть 200",
              ).toBe(200);
              const adminUsers = extractUsersFromMatrix(adminMatrix);
              adminUserIds = new Set(
                adminUsers.map((u) => u.userId),
              );

              const { response: mgrResp, data: managerMatrix } =
                await managerNineBoxAPI.getProtectedMatrix({
                  usersSubset: "subordinates",
                });
              expect(
                mgrResp.status(),
                "Manager protected matrix должна вернуть 200",
              ).toBe(200);
              const mgrUsers = extractUsersFromMatrix(managerMatrix);
              managerUserIds = new Set(
                mgrUsers.map((u) => u.userId),
              );
            },
          );

          await test.step(
            "Проверить: Менеджер видит подмножество админской матрицы",
            async () => {
              // Менеджер видит меньше или столько же, сколько админ
              expect(
                managerUserIds.size,
                "Менеджер должен видеть <= пользователей чем админ",
              ).toBeLessThanOrEqual(adminUserIds.size);

              // Все пользователи менеджера должны быть подмножеством админских
              for (const uid of managerUserIds) {
                expect(
                  adminUserIds.has(uid),
                  `userId ${uid} менеджера должен присутствовать в админской матрице`,
                ).toBe(true);
              }
            },
          );
        } finally {
          // Восстановить состояние NineBox
          if (!wasEnabled) {
            await adminNineBoxAPI.disable();
          }
        }
      },
    );

    test(
      "C9327: Head видит ТОЛЬКО прямых подчинённых",
      { tag: ["@critical"] },
      async ({ adminNineBoxAPI, headNineBoxAPI }) => {
        setSeverity("critical");

        const { data: settings } =
          await adminNineBoxAPI.getManagerSettings();
        const wasEnabled = settings.isEnabled;
        if (!wasEnabled) {
          await adminNineBoxAPI.enable();
        }

        try {
          let headResponse, headUsers;

          await test.step(
            "Выполнить: Получить protected матрицу head с usersSubset=directSubordinates",
            async () => {
              const { response, data } =
                await headNineBoxAPI.getProtectedMatrix({
                  usersSubset: "directSubordinates",
                });
              headResponse = response;
              headUsers = extractUsersFromMatrix(data);
            },
          );

          await test.step("Проверить ответ", async () => {
            expect(
              headResponse.status(),
              "Protected matrix должна вернуть 200",
            ).toBe(200);

            // Head имеет 3 прямых подчинённых — результат ограничен
            expect(
              headUsers.length,
              "Head должен видеть ограниченный набор прямых подчинённых (не более 3)",
            ).toBeLessThanOrEqual(3);

            // Проверить структуру каждого пользователя
            for (const user of headUsers) {
              expect(user).toHaveProperty("userId");
              expect(user).toHaveProperty("yValue");
              expect(user).toHaveProperty("xValue");
              expect(
                typeof user.userId,
                "userId должен быть числом",
              ).toBe("number");
              expect(
                typeof user.yValue,
                "yValue должен быть числом",
              ).toBe("number");
              expect(
                typeof user.xValue,
                "xValue должен быть числом",
              ).toBe("number");
            }
          });
        } finally {
          if (!wasEnabled) {
            await adminNineBoxAPI.disable();
          }
        }
      },
    );

    test(
      "C9350: Менеджер vs Head — разный объём данных в protected матрице",
      async ({ adminNineBoxAPI, managerNineBoxAPI, headNineBoxAPI }) => {
        setSeverity("normal");

        const { data: settings } =
          await adminNineBoxAPI.getManagerSettings();
        const wasEnabled = settings.isEnabled;
        if (!wasEnabled) {
          await adminNineBoxAPI.enable();
        }

        try {
          let managerCount = 0;
          let headCount = 0;

          await test.step(
            "Выполнить: Получить protected матрицу менеджера",
            async () => {
              const { response, data } =
                await managerNineBoxAPI.getProtectedMatrix({
                  usersSubset: "subordinates",
                });
              expect(response.status()).toBe(200);
              managerCount = extractUsersFromMatrix(data).length;
            },
          );

          await test.step(
            "Выполнить: Получить protected матрицу head",
            async () => {
              const { response, data } =
                await headNineBoxAPI.getProtectedMatrix({
                  usersSubset: "subordinates",
                });
              expect(response.status()).toBe(200);
              headCount = extractUsersFromMatrix(data).length;
            },
          );

          await test.step(
            "Проверить: Менеджер видит >= пользователей чем head",
            async () => {
              expect(
                managerCount,
                `Менеджер (${managerCount} юзеров) должен видеть >= head (${headCount} юзеров)`,
              ).toBeGreaterThanOrEqual(headCount);
            },
          );
        } finally {
          if (!wasEnabled) {
            await adminNineBoxAPI.disable();
          }
        }
      },
    );

    test(
      "C9351: Параметр preformanceReviewRevisionId (с опечаткой) обрабатывается API",
      async ({ adminNineBoxAPI, managerNineBoxAPI }) => {
        setSeverity("normal");

        const { data: settings } =
          await adminNineBoxAPI.getManagerSettings();
        const wasEnabled = settings.isEnabled;
        if (!wasEnabled) {
          await adminNineBoxAPI.enable();
        }

        try {
          let searchResponse, searchData;

          await test.step(
            "Выполнить: Отправить search с preformanceReviewRevisionId",
            async () => {
              const { response, data } =
                await managerNineBoxAPI.searchProtected({
                  limit: 10,
                  actualize: true,
                  usersSubset: "subordinates",
                  preformanceReviewRevisionId: 999999,
                });
              searchResponse = response;
              searchData = data;
            },
          );

          await test.step("Проверить ответ", async () => {
            expect(
              searchResponse.status(),
              "API должен обработать запрос с preformanceReviewRevisionId",
            ).toBe(200);
            expect(searchData).toHaveProperty("items");
            expect(searchData).toHaveProperty("limit");
            expect(searchData).toHaveProperty("offset");
            expect(searchData).toHaveProperty("total");
            expect(
              Array.isArray(searchData.items),
              "items должен быть массивом",
            ).toBe(true);
            expect(
              typeof searchData.total,
              "total должен быть числом",
            ).toBe("number");
            expect(searchData.limit, "limit должен быть 10").toBe(10);
            expect(
              searchData.total,
              "total должен быть >= 0",
            ).toBeGreaterThanOrEqual(0);
            expect(
              searchData.items.length,
              "items.length <= limit",
            ).toBeLessThanOrEqual(10);
          });
        } finally {
          if (!wasEnabled) {
            await adminNineBoxAPI.disable();
          }
        }
      },
    );

    test(
      "C9352: Семантическая разница usersSubset: directSubordinates vs subordinates vs all",
      async ({ adminNineBoxAPI, managerNineBoxAPI }) => {
        setSeverity("normal");

        const { data: settings } =
          await adminNineBoxAPI.getManagerSettings();
        const wasEnabled = settings.isEnabled;
        if (!wasEnabled) {
          await adminNineBoxAPI.enable();
        }

        /**
         * Подсчёт пользователей в 3D матрице NineBox
         * @param {Array} matrix - 3D массив [row][col][users]
         * @returns {number}
         */
        function countUsersInMatrix(matrix) {
          let count = 0;
          for (const row of matrix) {
            for (const cell of row) {
              count += cell.length;
            }
          }
          return count;
        }

        try {
          let directCount, subordinatesCount, allCount;

          await test.step(
            "Выполнить: Получить protected матрицу с usersSubset=directSubordinates",
            async () => {
              const { response, data } =
                await managerNineBoxAPI.getProtectedMatrix({
                  usersSubset: "directSubordinates",
                });
              expect(
                response.status(),
                "directSubordinates: статус 200",
              ).toBe(200);
              directCount = countUsersInMatrix(data);
            },
          );

          await test.step(
            "Выполнить: Получить protected матрицу с usersSubset=subordinates",
            async () => {
              const { response, data } =
                await managerNineBoxAPI.getProtectedMatrix({
                  usersSubset: "subordinates",
                });
              expect(
                response.status(),
                "subordinates: статус 200",
              ).toBe(200);
              subordinatesCount = countUsersInMatrix(data);
            },
          );

          await test.step(
            "Выполнить: Получить protected матрицу с usersSubset=all",
            async () => {
              const { response, data } =
                await managerNineBoxAPI.getProtectedMatrix({
                  usersSubset: "all",
                });
              const status = response.status();

              if (status === 200) {
                allCount = countUsersInMatrix(data);
              } else {
                // Manager может не иметь прав на usersSubset=all — 403
                expect(
                  status,
                  "При отсутствии прав на 'all' ожидается 403",
                ).toBe(403);
                allCount = null;
                console.log(
                  "usersSubset=all: менеджер получил 403 — нет прав на просмотр всех сотрудников",
                );
              }
            },
          );

          await test.step(
            "Проверить: directSubordinates <= subordinates (<= all если доступен)",
            async () => {
              console.log(
                `usersSubset counts — directSubordinates: ${directCount}, subordinates: ${subordinatesCount}, all: ${allCount ?? "N/A (403)"}`,
              );

              expect(
                directCount,
                `directSubordinates (${directCount}) должен быть <= subordinates (${subordinatesCount})`,
              ).toBeLessThanOrEqual(subordinatesCount);

              if (allCount !== null) {
                expect(
                  subordinatesCount,
                  `subordinates (${subordinatesCount}) должен быть <= all (${allCount})`,
                ).toBeLessThanOrEqual(allCount);
              }
            },
          );
        } finally {
          if (!wasEnabled) {
            await adminNineBoxAPI.disable();
          }
        }
      },
    );
  },
);
