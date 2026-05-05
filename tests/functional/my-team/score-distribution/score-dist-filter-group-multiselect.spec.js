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
  "Распределение оценок — Мульти-селект групп",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
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

      // Need at least 2 groups with users for multiselect tests
      let groupsWithUsers = 0;
      for (const group of groups) {
        const { data: usersData } = await orgApi.getUserGroupUsers(group.id, {
          limit: 1,
        });
        const users = Array.isArray(usersData)
          ? usersData
          : (usersData?.items || []);
        if (users.length > 0) groupsWithUsers++;
        if (groupsWithUsers >= 2) break;
      }

      if (groupsWithUsers < 2) {
        console.log(
          `[beforeAll] Только ${groupsWithUsers} групп с пользователями — создаём недостающие`,
        );
        const { data: availableUsers } = await orgApi.getUsers({
          limit: 10,
          category: "active",
        });
        const allUserIds = (availableUsers?.items || availableUsers || []).map(
          (u) => u.id,
        );

        for (let i = groupsWithUsers; i < 2; i++) {
          const { data: newGroup } = await orgApi.createUserGroup({
            title: `Тестовая группа ${i + 1} (auto-seed)`,
          });
          const userIds = allUserIds.slice(i * 3, i * 3 + 3);
          if (userIds.length > 0) {
            await orgApi.addUsersToUserGroup(newGroup.id, userIds);
            console.log(
              `[beforeAll] Создана группа ${newGroup.id} с ${userIds.length} пользователями`,
            );
          }
        }
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7213: Выбор двух групп — объединение сотрудников (API-сверка)",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        let group1 = null;
        let group2 = null;
        let group1Total = 0;
        let group2Total = 0;
        let multiGroupTotal = 0;

        await test.step("Найти две группы с пользователями и получить ожидаемые данные через API", async () => {
          // ─── API: найти 2 группы, каждая с хотя бы 1 юзером ───
          const orgApi = new OrgStructureAPI(request);
          const { email, password } = getCredentials("admin");
          await orgApi.signIn(email, password);

          const { data: groupsData } = await orgApi.getUserGroups({
            limit: 100,
            offset: 0,
          });
          const allGroups = groupsData?.items || [];

          for (const group of allGroups) {
            const { data: usersData } = await orgApi.getUserGroupUsers(
              group.id,
              {
                limit: 1,
                offset: 0,
              },
            );
            const userCount = usersData?.total || 0;

            if (userCount > 0) {
              if (!group1) {
                group1 = group;
                group1Total = userCount;
              } else if (!group2) {
                group2 = group;
                group2Total = userCount;
                break;
              }
            }
          }

          expect(
            group1,
            "beforeAll seed должен был создать минимум 2 группы с пользователями — не найдена первая группа",
          ).toBeTruthy();
          expect(
            group2,
            "beforeAll seed должен был создать минимум 2 группы с пользователями — не найдена вторая группа",
          ).toBeTruthy();

          // ─── API: получить данные по каждой группе отдельно ───
          const dashboardApi = new DashboardTeamAPI(request);
          await dashboardApi.signIn(email, password);

          const { data: apiGroup1 } = await dashboardApi.getDistributionUsers({
            userGroupIds: [group1.id],
            usersSubset: "all",
            limit: 100,
            offset: 0,
          });
          group1Total = apiGroup1?.total || 0;

          const { data: apiGroup2 } = await dashboardApi.getDistributionUsers({
            userGroupIds: [group2.id],
            usersSubset: "all",
            limit: 100,
            offset: 0,
          });
          group2Total = apiGroup2?.total || 0;

          // ─── API: получить данные по обеим группам вместе ───
          const { data: apiMultiGroup } =
            await dashboardApi.getDistributionUsers({
              userGroupIds: [group1.id, group2.id],
              usersSubset: "all",
              limit: 100,
              offset: 0,
            });
          multiGroupTotal = apiMultiGroup?.total || 0;

          // Проверки: объединение как минимум равно максимальной группе
          // и не превышает сумму (т.к. пользователи могут пересекаться)
          expect(multiGroupTotal).toBeGreaterThanOrEqual(
            Math.max(group1Total, group2Total),
          );
          expect(multiGroupTotal).toBeLessThanOrEqual(
            group1Total + group2Total,
          );
        });

        await test.step("Применить фильтр двух групп в UI и проверить количество строк", async () => {
          // ─── UI: открыть вкладку и применить фильтр двух групп ───
          const tab = new ScoreDistributionTab(page);
          await tab.open();

          await tab.openGroupFilter();
          await tab.selectGroup(group1.title);
          await tab.selectGroup(group2.title);
          await tab.applyGroupFilter();

          await page.waitForLoadState("networkidle");

          // UI показывает первую страницу (limit=20)
          // Ждём загрузки данных с retry-логикой
          const expectedCount = Math.min(multiGroupTotal, 20);
          let uiRowCount = 0;

          if (expectedCount > 0) {
            await expect(async () => {
              uiRowCount = await tab.getRowCount();
              expect(uiRowCount).toBeGreaterThan(0);
              expect(uiRowCount).toBe(expectedCount);
            }).toPass({ timeout: 15000 });
          } else {
            // Если данных нет, ждём загрузки пустой таблицы
            await page.waitForLoadState("networkidle");
            uiRowCount = await tab.getRowCount();
            expect(uiRowCount).toBe(0);
          }
        });
      },
    );

    test(
      "C7214: Сотрудник в нескольких группах отображается один раз",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        let overlappingUser = null;
        let userGroups = [];

        await test.step("Найти сотрудника, состоящего в двух группах, и проверить отсутствие дубликатов в API", async () => {
          // ─── API: найти пользователя, который состоит в 2+ группах ───
          const orgApi = new OrgStructureAPI(request);
          const { email, password } = getCredentials("admin");
          await orgApi.signIn(email, password);

          const { data: groupsData } = await orgApi.getUserGroups({
            limit: 100,
            offset: 0,
          });
          const allGroups = groupsData?.items || [];

          // Собираем карту пользователь -> список групп
          const userToGroups = new Map();

          for (const group of allGroups) {
            const { data: usersData } = await orgApi.getUserGroupUsers(
              group.id,
              {
                limit: 100,
                offset: 0,
              },
            );
            const users = usersData?.items || [];

            for (const user of users) {
              if (!userToGroups.has(user.id)) {
                userToGroups.set(user.id, []);
              }
              userToGroups.get(user.id).push(group);
            }
          }

          // Найти пользователя в 2+ группах
          for (const [userId, groups] of userToGroups.entries()) {
            if (groups.length >= 2) {
              // Найти объект пользователя
              const { data: usersData } = await orgApi.getUserGroupUsers(
                groups[0].id,
                { limit: 100, offset: 0 },
              );
              const users = usersData?.items || [];
              overlappingUser = users.find((u) => u.id === userId);
              userGroups = groups.slice(0, 2); // берём первые две группы
              break;
            }
          }

          expect(
            overlappingUser,
            "Должен существовать пользователь, состоящий в двух или более группах — добавьте одного пользователя в 2 разные группы",
          ).toBeTruthy();
          expect(
            userGroups.length,
            "Должно быть найдено минимум 2 группы с одним общим пользователем",
          ).toBeGreaterThanOrEqual(2);

          // ─── API: проверить, что API возвращает пользователя один раз ───
          const dashboardApi = new DashboardTeamAPI(request);
          await dashboardApi.signIn(email, password);

          const { data: apiMultiGroup } =
            await dashboardApi.getDistributionUsers({
              userGroupIds: [userGroups[0].id, userGroups[1].id],
              usersSubset: "all",
              limit: 100,
              offset: 0,
            });

          const userIds = (apiMultiGroup?.items || []).map((u) => u.id);
          const uniqueUserIds = [...new Set(userIds)];

          // API не должно возвращать дубликатов
          expect(userIds.length).toBe(uniqueUserIds.length);
        });

        await test.step("Применить фильтр двух групп в UI и проверить, что сотрудник отображается один раз", async () => {
          // ─── UI: выбрать обе группы и проверить, что пользователь появляется один раз ───
          const tab = new ScoreDistributionTab(page);
          await tab.open();

          await tab.openGroupFilter();
          await tab.selectGroup(userGroups[0].title);
          await tab.selectGroup(userGroups[1].title);
          await tab.applyGroupFilter();

          await page.waitForLoadState("networkidle");

          // Ждём загрузки таблицы после применения фильтра
          await expect(async () => {
            const rowCount = await tab.getRowCount();
            expect(rowCount).toBeGreaterThan(0);
          }).toPass({ timeout: 15000 });

          // Попробовать найти пользователя через поиск
          const userName =
            `${overlappingUser.firstName || ""} ${overlappingUser.lastName || ""}`.trim();
          await tab.searchEmployee(userName);

          // Ждём результатов поиска
          let matchingNames = [];
          await expect(async () => {
            const names = await tab.getEmployeeNames();
            matchingNames = names.filter((name) => name.includes(userName));
            expect(matchingNames.length).toBeGreaterThan(0);
          }).toPass({ timeout: 10000 });

          // Пользователь должен появиться ровно один раз
          expect(matchingNames.length).toBe(1);
        });
      },
    );
  },
);
