// tests/functional/my-team/my-team-results-modal-dev-plan.spec.js
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
  "Моя команда — Создание плана развития из модалки",
  { tag: ["@ui", "@regression", "@my-team"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test("C3664: Редирект на создание плана развития", async ({
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

      const employeeName =
        await test.step("Запомнить имя сотрудника", async () => {
          return modal.getEmployeeName();
        });

      await test.step('Нажать "Создать план развития"', async () => {
        await modal.clickCreateDevelopmentPlan();
      });

      await test.step("Проверить редирект на страницу создания плана", async () => {
        const currentUrl = page.url();
        expect(currentUrl).toMatch(/development-plan|plan/i);
        console.log(`✓ Редирект выполнен для сотрудника: ${employeeName}`);
      });
    });
  },
);
