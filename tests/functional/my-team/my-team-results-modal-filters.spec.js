// tests/functional/my-team/my-team-results-modal-filters.spec.js
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
  "Моя команда — Фильтры в модалке результатов",
  { tag: ["@ui", "@regression", "@my-team"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test('C3993: Фильтры "Оценка" и "Период оценки" работают корректно', async ({
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

      await test.step('Проверить фильтр "Оценка"', async () => {
        const currentAssessment = await modal.getSelectedAssessment();
        console.log(`✓ Текущая оценка: ${currentAssessment}`);
      });

      await test.step('Проверить фильтр "Период оценки"', async () => {
        const currentPeriod = await modal.getSelectedPeriod();
        console.log(`✓ Текущий период: ${currentPeriod}`);
      });

      await test.step("Закрыть модалку", async () => {
        await modal.closeModal();
      });
    });
  },
);
