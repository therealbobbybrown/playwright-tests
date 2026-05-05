import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { OrgStructureAPI } from "../../../utils/api/OrgStructureAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Распределение оценок — пересечение фильтров с группами",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    let tab;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(60_000);
      const orgApi = new OrgStructureAPI(request);
      const { email, password } = getCredentials("admin");
      await orgApi.signIn(email, password);

      const { data: groupsData } = await orgApi.getUserGroups({
        limit: 50,
        offset: 0,
      });
      const groups = groupsData?.items || groupsData || [];

      let hasGroupWithUsers = false;
      for (const group of groups) {
        const { data: usersData } = await orgApi.getUserGroupUsers(group.id, {
          limit: 1,
        });
        const users = Array.isArray(usersData)
          ? usersData
          : (usersData?.items || []);
        if (users.length > 0) {
          hasGroupWithUsers = true;
          break;
        }
      }

      if (!hasGroupWithUsers) {
        console.log(
          "[beforeAll] Нет групп с пользователями — создаём тестовую группу",
        );
        const { data: newGroup } = await orgApi.createUserGroup({
          title: "Тестовая группа (auto-seed)",
        });
        const { data: availableUsers } = await orgApi.getUsers({
          limit: 5,
          category: "active",
        });
        const userIds = (availableUsers?.items || availableUsers || [])
          .slice(0, 3)
          .map((u) => u.id);
        if (userIds.length > 0) {
          await orgApi.addUsersToUserGroup(newGroup.id, userIds);
          console.log(
            `[beforeAll] Создана группа ${newGroup.id} с ${userIds.length} пользователями`,
          );
        }
      }
    });

    test.beforeEach(async ({ adminAuth: page }) => {
      markAsUITest(MODULES.MY_TEAM);
      tab = new ScoreDistributionTab(page);
    });

    test(
      "C7210: Прямые подчинённые + группа → таблица содержит только пересечение (API-сверка)",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        let targetGroup;
        let expectedApiCount;
        let apiIntersection;

        await test.step("Найти группу с пользователями через API", async () => {
          // === API: найти группу с пользователями ===
          const orgApi = new OrgStructureAPI(request);
          const { email, password } = getCredentials("admin");
          await orgApi.signIn(email, password);

          const { data: groupsData } = await orgApi.getUserGroups({
            limit: 50,
            offset: 0,
            withUsersIds: true,
          });
          expect(groupsData, "API getUserGroups должен вернуть данные").toBeTruthy();
          const groups = Array.isArray(groupsData)
            ? groupsData
            : (groupsData?.items || groupsData?.results || []);
          expect(
            groups.length,
            "API getUserGroups должен вернуть хотя бы одну группу",
          ).toBeGreaterThanOrEqual(1);

          // Найти группу с пользователями
          targetGroup = null;
          for (const group of groups) {
            const { data: groupUsersData } = await orgApi.getUserGroupUsers(
              group.id,
              { limit: 1 },
            );
            const groupUsers = Array.isArray(groupUsersData)
              ? groupUsersData
              : (groupUsersData?.items || groupUsersData?.results || []);
            if (groupUsers.length > 0) {
              targetGroup = group;
              break;
            }
          }

          expect(
            targetGroup,
            "beforeAll seed должен был создать группу с пользователями — не найдено групп с пользователями",
          ).toBeTruthy();
        });

        await test.step("Получить через API пересечение прямых подчинённых и группы", async () => {
          // === API: получить пересечение (прямые подчинённые + группа) ===
          const dashboardApi = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await dashboardApi.signIn(email, password);

          const result = await dashboardApi.getDistributionUsers({
            usersSubset: "directSubordinates",
            userGroupIds: [targetGroup.id],
            limit: 20,
            offset: 0,
          });
          apiIntersection = result.data;

          expectedApiCount = Math.min(apiIntersection.total, 20);
        });

        await test.step("Открыть вкладку и переключить фильтр на «Прямые подчиненные»", async () => {
          // === UI: открыть вкладку ===
          await tab.open();
          await page.waitForLoadState("networkidle");

          // UI: переключить на «Прямые подчинённые»
          await tab.selectEmployeesOption("Прямые подчиненные");
          await page.waitForLoadState("networkidle");

          // Убедиться, что фильтр переключился
          await expect(async () => {
            const filterValue = await tab.getEmployeesFilterValue();
            expect(filterValue).toBe("Прямые подчиненные");
          }).toPass({ timeout: 5000 });
        });

        await test.step("Применить фильтр по группе и дождаться обновления таблицы", async () => {
          // UI: открыть панель групп
          await tab.openGroupFilter();

          // Проверить, что группа доступна
          const groupNames = await tab.getGroupNames();
          expect(groupNames).toContain(targetGroup.title);

          // UI: выбрать группу и применить
          await tab.selectGroup(targetGroup.title);
          await tab.applyGroupFilter();

          // Дождаться обновления таблицы
          await page.waitForLoadState("networkidle");
        });

        await test.step("Проверить количество строк и наличие совпадающих имён с API", async () => {
          // === UI: проверить количество строк ===
          if (expectedApiCount > 0) {
            await expect(async () => {
              const uiCount = await tab.getRowCount();
              expect(uiCount).toBeGreaterThan(0);
              expect(uiCount).toBe(expectedApiCount);
            }).toPass({ timeout: 15000 });

            // Проверить, что хотя бы одно имя из API есть в UI
            const uiNames = await tab.getEmployeeNames();
            const apiNames = (apiIntersection.items || []).map(
              (u) => u.fullName || `${u.firstName} ${u.lastName}`.trim(),
            );

            let foundMatch = false;
            for (const apiName of apiNames) {
              if (uiNames.includes(apiName)) {
                foundMatch = true;
                break;
              }
            }
            expect(
              foundMatch,
              `Хотя бы одно API-имя должно совпадать с UI: API=${apiNames.join(", ")}, UI=${uiNames.join(", ")}`,
            ).toBe(true);
          } else {
            // API вернул 0 результатов — UI должен показать пустое состояние
            await expect(async () => {
              const uiCount = await tab.getRowCount();
              expect(uiCount).toBe(0);
            }).toPass({ timeout: 10000 });
          }
        });
      },
    );

    test(
      "C7211: Тройное пересечение Сотрудники × Группа × Период → API корректный результат",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        let targetGroup;
        let apiIntersection;

        await test.step("Найти группу с пользователями через API", async () => {
          // === API: найти группу с пользователями ===
          const orgApi = new OrgStructureAPI(request);
          const { email, password } = getCredentials("admin");
          await orgApi.signIn(email, password);

          const { data: groupsData } = await orgApi.getUserGroups({
            limit: 50,
            offset: 0,
          });
          expect(groupsData, "API getUserGroups должен вернуть данные").toBeTruthy();
          const groups = Array.isArray(groupsData)
            ? groupsData
            : (groupsData?.items || groupsData?.results || []);
          expect(
            groups.length,
            "API getUserGroups должен вернуть хотя бы одну группу",
          ).toBeGreaterThanOrEqual(1);

          // Найти группу с пользователями
          targetGroup = null;
          for (const group of groups) {
            const { data: groupUsersData } = await orgApi.getUserGroupUsers(
              group.id,
              { limit: 1 },
            );
            const groupUsers = Array.isArray(groupUsersData)
              ? groupUsersData
              : (groupUsersData?.items || groupUsersData?.results || []);
            if (groupUsers.length > 0) {
              targetGroup = group;
              break;
            }
          }

          expect(
            targetGroup,
            "beforeAll seed должен был создать группу с пользователями — не найдено групп с пользователями",
          ).toBeTruthy();
        });

        await test.step("Получить через API пересечение прямых подчинённых и группы", async () => {
          // === API: получить пересечение (прямые подчинённые + группа) ===
          const dashboardApi = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await dashboardApi.signIn(email, password);

          const result = await dashboardApi.getDistributionUsers({
            usersSubset: "directSubordinates",
            userGroupIds: [targetGroup.id],
            limit: 100,
            offset: 0,
          });
          apiIntersection = result.data;

          expect(apiIntersection.total).toBeGreaterThanOrEqual(0);
        });

        await test.step("Получить результаты с периодом и проверить структуру ответа", async () => {
          // === API: получить результаты с периодом ===
          if (apiIntersection.total > 0) {
            const dashboardApi = new DashboardTeamAPI(request);
            const { email, password } = getCredentials("admin");
            await dashboardApi.signIn(email, password);

            const userIds = (apiIntersection.items || []).map((u) => u.id);

            // Период: последние 3 месяца
            const now = new Date();
            const start = new Date(
              now.getFullYear(),
              now.getMonth() - 3,
              1,
            ).getTime();
            const end = now.getTime();

            const { data: resultsData } =
              await dashboardApi.getDistributionLastResults(userIds, {
                period: { start, end },
              });

            // Проверить, что результат валиден (даже если пустой)
            expect(resultsData).toBeDefined();

            // Результаты должны быть объектом (ключи — индексы, значения — данные)
            const resultsArray = Object.values(resultsData || {});

            // Если есть результаты, проверить их структуру
            if (resultsArray.length > 0) {
              const firstResult = resultsArray[0];
              expect(firstResult).toHaveProperty("targetUserId");
              expect(firstResult.targetUserId).toBeDefined();
            }
          }
        });

        await test.step("Проверить что пересечение не превышает количество прямых подчинённых", async () => {
          // === API: проверить, что пересечение <= всех прямых подчинённых ===
          const dashboardApi = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await dashboardApi.signIn(email, password);

          const { data: apiAllDirect } =
            await dashboardApi.getDistributionUsers({
              usersSubset: "directSubordinates",
              limit: 1,
              offset: 0,
            });

          expect(apiIntersection.total).toBeLessThanOrEqual(apiAllDirect.total);
        });
      },
    );

    test(
      "C7212: Группа без подчинённых → пустая таблица или 0 сотрудников",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        let groupWithoutSubordinates;

        await test.step("Найти через API группу без пересечения с прямыми подчинёнными", async () => {
          // === API: получить все группы ===
          const orgApi = new OrgStructureAPI(request);
          const { email, password } = getCredentials("admin");
          await orgApi.signIn(email, password);

          const { data: groupsData } = await orgApi.getUserGroups({
            limit: 50,
            offset: 0,
          });
          expect(groupsData, "API getUserGroups должен вернуть данные").toBeTruthy();
          const groups = Array.isArray(groupsData)
            ? groupsData
            : (groupsData?.items || groupsData?.results || []);
          expect(groups.length).toBeGreaterThan(0);

          // === API: получить всех прямых подчинённых ===
          const dashboardApi = new DashboardTeamAPI(request);
          await dashboardApi.signIn(email, password);

          const { data: directSubordinatesData } =
            await dashboardApi.getDistributionUsers({
              usersSubset: "directSubordinates",
              limit: 500,
              offset: 0,
            });

          const directSubordinatesIds = (
            directSubordinatesData?.items || []
          ).map((u) => u.id);
          expect(
            directSubordinatesIds.length,
            "У админа должны быть прямые подчинённые",
          ).toBeGreaterThanOrEqual(1);

          // === API: найти группу без пересечения с прямыми подчинёнными ===
          groupWithoutSubordinates = null;

          for (const group of groups) {
            const { data: groupUsersData } = await orgApi.getUserGroupUsers(
              group.id,
              { limit: 500 },
            );
            const groupUserIds = (groupUsersData?.items || groupUsersData || [])
              .map((u) => u.id)
              .filter(Boolean);

            // Проверить пересечение
            const intersection = groupUserIds.filter((id) =>
              directSubordinatesIds.includes(id),
            );

            if (intersection.length === 0 && groupUserIds.length > 0) {
              // Группа есть, пользователи есть, но ни один не является прямым подчинённым
              groupWithoutSubordinates = group;
              break;
            }
          }

          // Альтернативный способ: использовать API пересечения напрямую
          if (!groupWithoutSubordinates) {
            for (const group of groups) {
              const { data: apiIntersection } =
                await dashboardApi.getDistributionUsers({
                  usersSubset: "directSubordinates",
                  userGroupIds: [group.id],
                  limit: 1,
                });

              if (apiIntersection.total === 0) {
                groupWithoutSubordinates = group;
                break;
              }
            }
          }

          if (!groupWithoutSubordinates) {
            throw new Error(
              "Не найдено группы без пересечения с прямыми подчинёнными. " +
              "Создайте вручную группу, в которую не входит ни один прямой подчинённый админа.",
            );
          }
        });

        await test.step("Открыть вкладку, переключить на прямых подчинённых и выбрать группу", async () => {
          // === UI: проверить, что выбор этой группы даёт пустую таблицу ===
          await tab.open();
          await page.waitForLoadState("networkidle");

          // Переключить на «Прямые подчинённые»
          await tab.selectEmployeesOption("Прямые подчиненные");
          await page.waitForLoadState("networkidle");

          // Открыть панель групп
          await tab.openGroupFilter();

          // Выбрать группу без подчинённых
          await tab.selectGroup(groupWithoutSubordinates.title);
          await tab.applyGroupFilter();

          // Дождаться обновления
          await page.waitForLoadState("networkidle");
        });

        await test.step("Проверить что таблица пустая после применения фильтра", async () => {
          // Проверить, что таблица пустая
          await expect(async () => {
            const rowCount = await tab.getRowCount();
            expect(rowCount).toBe(0);
          }).toPass({ timeout: 10000 });

          // Можно также проверить наличие пустого состояния
          const isEmpty = await tab.isEmptyState();
          expect(
            isEmpty,
            "Таблица должна показывать пустое состояние при отсутствии пересечения",
          ).toBe(true);
        });
      },
    );
  },
);
