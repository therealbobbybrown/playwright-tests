// tests/functional/my-team/my-team-filter-modal-open.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  'Моя команда — Модалка "Результаты для": открытие',
  { tag: ["@ui", "@regression", "@my-team"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test('C3970: Модалка "Результаты для" открывается и содержит все элементы', async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");

      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);

      await test.step('Открыть дашборд "Моя команда"', async () => {
        await sideMenu.openMyTeam();
        await myTeamPage.assertOpened();
      });

      await test.step('Нажать кнопку "Результаты для" и дождаться открытия модалки', async () => {
        await myTeamPage.openResultsForModal();
      });

      await test.step("Проверить наличие всех элементов модалки", async () => {
        const { tabs, searchInput, applyButton } =
          await myTeamPage.assertResultsForModalOpened();

        await expect(tabs.employeesTab).toBeVisible();
        await expect(tabs.departmentsTab).toBeVisible();
        await expect(tabs.groupsTab).toBeVisible();
        await expect(searchInput).toBeVisible();
        await expect(applyButton).toBeVisible();
      });

      await test.step("Проверить, что список сотрудников не пуст", async () => {
        const items = await myTeamPage.getItemsInResultsForModal();
        expect(
          items.length,
          "В модалке должен быть хотя бы один сотрудник",
        ).toBeGreaterThanOrEqual(1);
      });

      await test.step("Закрыть модалку и убедиться, что дашборд остаётся доступным", async () => {
        await myTeamPage.closeResultsForModal();
        await myTeamPage.assertOpened();
      });
    });
  },
);
