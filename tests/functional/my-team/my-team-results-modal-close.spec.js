// tests/functional/my-team/my-team-results-modal-close.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import { EmployeeResultsModal } from "../../../pages/EmployeeResultsModal.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Моя команда — Закрытие модалки результатов",
  { tag: ["@ui", "@regression", "@my-team"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test("C3663: При закрытии модалки остаёмся на дашборде", async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("critical");

      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);
      const modal = new EmployeeResultsModal(page, testInfo);

      await test.step('Открыть дашборд "Моя команда"', async () => {
        await sideMenu.openMyTeam();
        await myTeamPage.assertOpened();
      });

      const urlBeforeModal = page.url();

      await test.step("Открыть модалку результатов", async () => {
        await myTeamPage.clickResultsForEmployee(0);
        await modal.assertModalOpened();
      });

      await test.step("Закрыть модалку", async () => {
        await modal.closeModal();
      });

      await test.step("Проверить, что остались на дашборде", async () => {
        await myTeamPage.assertOpened();
        const urlAfterClose = page.url();
        expect(urlAfterClose).toBe(urlBeforeModal);
        console.log("✓ URL не изменился после закрытия модалки");
      });
    });
  },
);
