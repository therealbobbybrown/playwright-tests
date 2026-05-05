// tests/functional/my-team/my-team-results-modal-tabs.spec.js
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import { EmployeeResultsModal } from "../../../pages/EmployeeResultsModal.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Моя команда — Табы в модалке результатов",
  { tag: ["@ui", "@regression", "@my-team"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test('C3995: Переключение между табами "Результаты оценки" и "AI саммари"', async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");

      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);
      const modal = new EmployeeResultsModal(page, testInfo);

      await test.step("Открыть модалку результатов", async () => {
        await sideMenu.openMyTeam();
        await myTeamPage.assertOpened();
        await myTeamPage.clickResultsForEmployee(0);
        await modal.assertModalOpened();
      });

      await test.step('Проверить таб "Результаты оценки" (по умолчанию)', async () => {
        await modal.switchToResultsTab();
        await modal.assertResultsTabContent();
      });

      await test.step('Переключиться на "AI саммари"', async () => {
        await modal.switchToAiSummaryTab();
        await modal.assertAiSummaryTabContent();
      });

      await test.step('Вернуться на "Результаты оценки"', async () => {
        await modal.switchToResultsTab();
        await modal.assertResultsTabContent();
      });

      await test.step("Закрыть модалку", async () => {
        await modal.closeModal();
      });
    });
  },
);
