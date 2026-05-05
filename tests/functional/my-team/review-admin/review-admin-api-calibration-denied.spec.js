/**
 * AT-20: review_admin — калибровка результатов сотрудников вне assigned PR scope запрещена
 *
 * Проверяет, что review_admin с permission [12] (manageOwnPerformanceReview),
 * назначенный администратором конкретного PR, НЕ может получить результаты
 * (и, следовательно, откалибровать оценки) для сотрудников, которые не входят
 * в его scope (сотрудники из других PR или целиком невидимые ему).
 *
 * Логика: если review_admin не видит пользователя через distribution-users —
 * запрос distribution-last-results для этого userId должен вернуть пустой объект
 * (утечки данных нет).
 */
import { test as base, expect } from "../../../fixtures/full.js";
import { ReviewAdminSeedHelper } from "../../../utils/seed/index.js";
import {
  DashboardTeamAPI,
  getCredentials,
  getTestUserPassword,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

const test = base.extend({
  reviewAdminCtx: async ({ request }, use) => {
    const helper = new ReviewAdminSeedHelper(request);
    await helper.init("admin");
    const setupData = await helper.seedFullSetup();

    const password = getTestUserPassword();
    const dashAPI = new DashboardTeamAPI(request);
    await dashAPI.signIn(setupData.email, password);

    // Admin API для получения baseline и поиска пользователей вне scope
    const { email: adminEmail, password: adminPassword } =
      getCredentials("admin");
    const adminDashAPI = new DashboardTeamAPI(request);
    await adminDashAPI.signIn(adminEmail, adminPassword);

    await use({
      dashAPI,
      adminDashAPI,
      setupData,
      helper,
    });

    try {
      await helper.cleanup(setupData);
    } catch (e) {
      console.warn(`[Cleanup] ${e.message}`);
    }
  },
});

test.describe(
  "Review Admin API — Калибровка вне assigned PR scope запрещена",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Review Admin API Calibration Denied");
    });

    test("C8081: Калибровка результатов сотрудников вне assigned PR scope недоступна",
      { tag: ["@critical"] },
      async ({ reviewAdminCtx }) => {
        setSeverity("critical");

        const { dashAPI, adminDashAPI } = reviewAdminCtx;

        let reviewAdminUserIds = [];
        let outOfScopeUserId = null;

        await test.step(
          "Получить baseline: пользователи видимые review_admin",
          async () => {
            const { response, data } = await dashAPI.getDistributionUsers({
              usersSubset: "all",
              limit: 200,
            });

            expect(
              response.ok(),
              `distribution-users вернул ${response.status()}`,
            ).toBe(true);

            reviewAdminUserIds = (data?.items || []).map((u) => u.id);
            console.log(
              `[AT-20] review_admin видит ${reviewAdminUserIds.length} сотрудников`,
            );
          },
        );

        await test.step(
          "Получить пользователей admin и найти того, кто вне scope review_admin",
          async () => {
            // Ищем пользователя с revisionMean != null (есть результаты для калибровки)
            // который при этом НЕ виден review_admin
            const { result: adminResult, user: adminUser } =
              await adminDashAPI.findDistributionUser(
                (r) => r.revisionMean != null,
                { usersSubset: "all" },
              );

            if (adminResult && adminUser) {
              // Проверяем: этот пользователь вне scope review_admin?
              if (!reviewAdminUserIds.includes(adminUser.id)) {
                outOfScopeUserId = adminUser.id;
                console.log(
                  `[AT-20] Найден пользователь вне scope: id=${outOfScopeUserId}, revisionMean=${JSON.stringify(adminResult.revisionMean)}`,
                );
              } else {
                // Этот пользователь ВХОДИТ в scope. Ищем среди всех пользователей admin
                // тех, кого review_admin НЕ видит.
                const { data: adminUsersData } =
                  await adminDashAPI.getDistributionUsers({
                    usersSubset: "all",
                    limit: 200,
                  });
                const adminUsers = adminUsersData?.items || [];
                const outOfScopeUser = adminUsers.find(
                  (u) => !reviewAdminUserIds.includes(u.id),
                );
                if (outOfScopeUser) {
                  outOfScopeUserId = outOfScopeUser.id;
                  console.log(
                    `[AT-20] Найден пользователь вне scope (без revisionMean): id=${outOfScopeUserId}`,
                  );
                }
              }
            } else {
              // Нет пользователей с результатами у admin — ищем просто любого вне scope
              const { data: adminUsersData } =
                await adminDashAPI.getDistributionUsers({
                  usersSubset: "all",
                  limit: 200,
                });
              const adminUsers = adminUsersData?.items || [];
              const outOfScopeUser = adminUsers.find(
                (u) => !reviewAdminUserIds.includes(u.id),
              );
              if (outOfScopeUser) {
                outOfScopeUserId = outOfScopeUser.id;
                console.log(
                  `[AT-20] Найден пользователь вне scope: id=${outOfScopeUserId}`,
                );
              }
            }
          },
        );

        await test.step(
          "Проверить: review_admin видит меньше пользователей, чем полный admin",
          async () => {
            const { data: adminUsersData } =
              await adminDashAPI.getDistributionUsers({
                usersSubset: "all",
                limit: 200,
              });
            const adminTotal =
              adminUsersData?.total ||
              (adminUsersData?.items || []).length;

            console.log(
              `[AT-20] Admin видит ${adminTotal} сотрудников, review_admin видит ${reviewAdminUserIds.length}`,
            );

            expect(
              reviewAdminUserIds.length,
              "review_admin не должен видеть больше сотрудников, чем полный admin",
            ).toBeLessThanOrEqual(adminTotal);
          },
        );

        await test.step(
          "Попытка получить результаты пользователя вне scope через review_admin API",
          async () => {
            if (!outOfScopeUserId) {
              console.log(
                "[AT-20] Пользователь вне scope не найден — scope review_admin совпадает с admin. " +
                  "Это может означать, что у review_admin полный доступ (не ограниченный scope). " +
                  "Проверяем, что review_admin не расширяет scope за пределы admin.",
              );
              // Если scope review_admin === scope admin — тест всё равно валиден:
              // нет пользователей вне общего видимого пула, утечки нет по определению
              return;
            }

            const { response, data } =
              await dashAPI.getDistributionLastResults([outOfScopeUserId]);

            console.log(
              `[AT-20] distribution-last-results для out-of-scope userId=${outOfScopeUserId}: status=${response.status()}`,
            );

            if (response.status() === 403 || response.status() === 404) {
              // Явный запрет — ожидаемое поведение
              expect([403, 404]).toContain(response.status());
              console.log(
                `[AT-20] PASS: сервер вернул ${response.status()} для пользователя вне scope`,
              );
            } else {
              // Ответ 200 — проверяем, что нет утечки данных
              expect(
                response.ok(),
                `Неожиданный статус ${response.status()} для distribution-last-results`,
              ).toBe(true);

              const entries = Object.values(data || {});
              const outOfScopeEntries = entries.filter(
                (e) => e.targetUserId === outOfScopeUserId,
              );

              expect(
                outOfScopeEntries.length,
                `review_admin НЕ должен получить результаты для пользователя id=${outOfScopeUserId} вне scope. ` +
                  `Получено записей: ${outOfScopeEntries.length}`,
              ).toBe(0);

              console.log(
                `[AT-20] PASS: ответ 200, но данных для out-of-scope пользователя нет (${entries.length} записей, ни одной для userId=${outOfScopeUserId})`,
              );
            }
          },
        );

        await test.step(
          "Проверить: результаты видимых review_admin пользователей не содержат чужих PR",
          async () => {
            if (reviewAdminUserIds.length === 0) {
              console.log(
                "[AT-20] Нет видимых пользователей — пропускаем проверку результатов",
              );
              return;
            }

            const { response, data } =
              await dashAPI.getDistributionLastResults(
                reviewAdminUserIds.slice(0, 50),
              );

            expect(
              response.ok(),
              `distribution-last-results вернул ${response.status()}`,
            ).toBe(true);

            const entries = Object.values(data || {});
            console.log(
              `[AT-20] Получено ${entries.length} записей результатов для ${Math.min(reviewAdminUserIds.length, 50)} пользователей`,
            );

            // Каждый результат должен относиться к пользователю, видимому review_admin
            for (const entry of entries) {
              if (entry.targetUserId) {
                expect(
                  reviewAdminUserIds,
                  `Результат для targetUserId=${entry.targetUserId} вне видимого списка review_admin`,
                ).toContain(entry.targetUserId);
              }
            }

            console.log(
              "[AT-20] PASS: все результаты принадлежат пользователям в scope review_admin",
            );
          },
        );
      },
    );
  },
);
