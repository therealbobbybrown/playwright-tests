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
  "Моя команда → Распределение оценок → Фильтр «Группа»",
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
      await tab.open();
    });

    test(
      "C7120: Дефолтное состояние фильтра «Группа» — не выбраны",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        await test.step("Проверить текст кнопки фильтра «Группа» и наличие строк в таблице", async () => {
          // Кнопка фильтра должна показывать "Группа" без индикатора выбора
          const filterButtonText = await tab.groupFilterButton.textContent();
          expect(filterButtonText.trim()).toBe("Группа");

          // Таблица должна показывать сотрудников
          const rowCount = await tab.getRowCount();
          expect(rowCount).toBeGreaterThan(0);
        });

        await test.step("Сверить количество строк с API без фильтра по группе", async () => {
          // === API-сверка: total без фильтра по группе совпадает с UI ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          const { data: apiUsers } = await api.getDistributionUsers({
            usersSubset: "all",
            userGroupIds: [],
            limit: 20,
            offset: 0,
          });
          const rowCount = await tab.getRowCount();
          expect(apiUsers.total).toBeGreaterThan(0);
          expect(rowCount).toBe(Math.min(apiUsers.total, 20));
        });
      },
    );

    test(
      "C7121: Панель выбора группы открывается по клику",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        await test.step("Открыть панель фильтра и проверить её содержимое", async () => {
          // Открыть панель фильтра
          await tab.openGroupFilter();

          // Панель должна быть видима
          await expect(tab.groupPanel).toBeVisible();

          // Заголовок панели должен быть "Выберите группу"
          await expect(tab.groupPanelTitle).toBeVisible();
          const titleText = await tab.groupPanelTitle.textContent();
          expect(titleText.trim()).toBe("Выберите группу");

          // Должны быть элементы групп
          const groupNames = await tab.getGroupNames();
          expect(
            groupNames.length,
            "Панель фильтра должна содержать хотя бы одну группу",
          ).toBeGreaterThanOrEqual(1);
        });

        await test.step("Закрыть панель фильтра и проверить, что она скрыта", async () => {
          // Панель можно закрыть
          await tab.closeGroupFilter();
          await expect(tab.groupPanel).not.toBeVisible();
        });
      },
    );

    test(
      "C7122: Список групп в панели совпадает с API",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        let apiGroupTitles;

        await test.step("Получить список групп через API", async () => {
          // === API: получаем список групп ===
          const orgApi = new OrgStructureAPI(request);
          const { email, password } = getCredentials("admin");
          await orgApi.signIn(email, password);
          const { data: apiGroups } = await orgApi.getUserGroups({
            limit: 100,
            offset: 0,
          });

          apiGroupTitles = new Set(
            (apiGroups?.items || apiGroups || [])
              .map((g) => g.title || g.name)
              .filter(Boolean),
          );
        });

        await test.step("Открыть панель фильтра и сверить список групп с API", async () => {
          // Открыть панель фильтра
          await tab.openGroupFilter();

          // Получить список групп из UI
          const uiGroupNames = await tab.getGroupNames();

          if (apiGroupTitles.size === 0) {
            expect(uiGroupNames.length).toBe(0);
            await tab.closeGroupFilter();
            return;
          }

          // UI должен показывать хотя бы одну группу
          expect(uiGroupNames.length).toBeGreaterThan(0);

          // Каждая UI-группа должна существовать в API
          for (const uiName of uiGroupNames) {
            expect(apiGroupTitles.has(uiName)).toBe(true);
          }

          // UI может фильтровать пустые группы, но не должно быть БОЛЬШЕ чем в API
          expect(uiGroupNames.length).toBeLessThanOrEqual(apiGroupTitles.size);

          // Закрыть панель
          await tab.closeGroupFilter();
        });
      },
    );

    test(
      "C7123: Выбор группы фильтрует таблицу — API-сверка данных",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        let selectedGroup;
        let initialCount;
        let uiFilteredCount;
        let uiFilteredNames = [];

        await test.step("Получить группы через API и запомнить начальное количество строк", async () => {
          // === API: получаем группы с ID ===
          const orgApi = new OrgStructureAPI(request);
          const { email, password } = getCredentials("admin");
          await orgApi.signIn(email, password);
          const { data: apiGroups } = await orgApi.getUserGroups({
            limit: 100,
            offset: 0,
            withUsersIds: true,
          });
          const groups = apiGroups?.items || apiGroups || [];
          expect(
            groups.length,
            "beforeAll seed должен был создать группы — нет групп для фильтрации",
          ).toBeGreaterThan(0);

          // Запоминаем начальное количество
          initialCount = await tab.getRowCount();
          expect(initialCount).toBeGreaterThan(0);

          // Открыть панель и получить имена
          await tab.openGroupFilter();
          const uiGroupNames = await tab.getGroupNames();
          expect(
            uiGroupNames.length,
            "UI должен показывать группы — панель фильтра пустая",
          ).toBeGreaterThan(0);

          // Выбрать первую группу
          const firstGroupName = uiGroupNames[0];

          // Найти ID выбранной группы в API-данных
          selectedGroup = groups.find(
            (g) => (g.title || g.name) === firstGroupName,
          );
          expect(selectedGroup).toBeTruthy();

          await tab.selectGroup(firstGroupName);
          await tab.applyGroupFilter();
        });

        await test.step("Применить фильтр по группе и проверить обновление таблицы", async () => {
          // Ждём обновления таблицы (данные перезагружаются)
          await page.waitForLoadState("networkidle");

          await expect(async () => {
            uiFilteredNames = await tab.getEmployeeNames();
            // Таблица должна загрузиться (>0) и количество не больше исходного
            expect(uiFilteredNames.length).toBeGreaterThan(0);
            expect(uiFilteredNames.length).toBeLessThanOrEqual(initialCount);
          }).toPass({ timeout: 15000 });

          uiFilteredCount = uiFilteredNames.length;

          // Кнопка сброса должна быть видна
          await expect(tab.resetButton).toBeVisible({ timeout: 5000 });
        });

        await test.step("Сверить отфильтрованные данные с API", async () => {
          // === API-сверка: запрос с userGroupIds должен вернуть те же данные ===
          const { email, password } = getCredentials("admin");
          const dashApi = new DashboardTeamAPI(request);
          await dashApi.signIn(email, password);
          const { data: apiFiltered } = await dashApi.getDistributionUsers({
            usersSubset: "all",
            userGroupIds: [selectedGroup.id],
            limit: 20,
            offset: 0,
          });

          // Total из API должен быть >= UI (UI показывает первую страницу)
          expect(apiFiltered.total).toBeGreaterThanOrEqual(uiFilteredCount);
          // UI показывает min(total, 20) строк
          expect(uiFilteredCount).toBe(Math.min(apiFiltered.total, 20));

          // Имена из UI должны совпадать с первой страницей API
          const apiNames = (apiFiltered.items || []).map((u) => {
            const full = `${u.firstName || ""} ${u.lastName || ""}`.trim();
            return full;
          });
          for (const uiName of uiFilteredNames) {
            const found = apiNames.some(
              (apiName) => uiName.includes(apiName) || apiName.includes(uiName),
            );
            expect(found).toBe(true);
          }
        });
      },
    );

    test(
      "C7124: Закрытие панели без применения не меняет фильтр",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        let initialCount;
        let initialEmployees;

        await test.step("Запомнить начальное состояние таблицы", async () => {
          // Получить начальное количество сотрудников
          initialCount = await tab.getRowCount();
          initialEmployees = await tab.getEmployeeNames();
        });

        await test.step("Открыть панель, выбрать группу, но закрыть без применения", async () => {
          // Открыть панель фильтра
          await tab.openGroupFilter();

          // Получить список групп
          const groupNames = await tab.getGroupNames();

          expect(
            groupNames.length,
            "UI должен показывать группы — beforeAll seed должен был создать их",
          ).toBeGreaterThan(0);

          // Выбрать группу (но НЕ применять)
          const firstGroup = groupNames[0];
          await tab.selectGroup(firstGroup);

          // Закрыть панель БЕЗ применения
          await tab.closeGroupFilter();

          // Дождаться закрытия панели
          await expect(tab.groupPanel).not.toBeVisible();
        });

        await test.step("Проверить, что таблица и фильтр не изменились", async () => {
          // Количество сотрудников должно остаться прежним
          const newCount = await tab.getRowCount();
          expect(newCount).toBe(initialCount);

          // Список сотрудников должен остаться прежним
          const newEmployees = await tab.getEmployeeNames();
          expect(newEmployees).toEqual(initialEmployees);

          // Кнопка фильтра должна показывать "Группа" (без выбора)
          const filterButtonText = await tab.groupFilterButton.textContent();
          expect(filterButtonText.trim()).toBe("Группа");
        });
      },
    );
  },
);
