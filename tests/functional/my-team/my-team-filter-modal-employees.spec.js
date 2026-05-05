// tests/functional/my-team/my-team-filter-modal-employees.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  'Моя команда — Модалка "Результаты для": вкладка "Сотрудники"',
  { tag: ["@ui", "@regression", "@my-team"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test('C3971: Вкладка "Сотрудники" отображает дерево подчинённых', async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");

      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);

      await test.step('Открыть дашборд "Моя команда"', async () => {
        await sideMenu.openMyTeam();
        await myTeamPage.assertOpened();
      });

      await test.step('Открыть модалку "Результаты для"', async () => {
        await myTeamPage.openResultsForModal();
      });

      await test.step('Убедиться, что вкладка "Сотрудники" активна по умолчанию', async () => {
        const { tabs } = await myTeamPage.assertResultsForModalOpened();
        await expect(tabs.employeesTab).toBeVisible();
      });

      let items;

      await test.step("Получить список сотрудников и проверить, что он не пуст", async () => {
        items = await myTeamPage.getItemsInResultsForModal();
        expect(
          items.length,
          "Список сотрудников во вкладке «Сотрудники» должен быть не пуст",
        ).toBeGreaterThanOrEqual(1);
      });

      await test.step("Проверить, что у каждого элемента списка есть непустое имя", async () => {
        for (const name of items) {
          expect(
            name.trim().length,
            `Имя сотрудника не должно быть пустым, получено: "${name}"`,
          ).toBeGreaterThanOrEqual(1);
        }
      });
    });
  },
);
