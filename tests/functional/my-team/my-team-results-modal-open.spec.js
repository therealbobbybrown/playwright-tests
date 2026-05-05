// tests/functional/my-team/my-team-results-modal-open.spec.js
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
  "Моя команда — Открытие модалки результатов",
  { tag: ["@ui", "@regression", "@my-team"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      'C3994: Открытие модалки через кнопку "Результаты"',
      { tag: [] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);
        const modal = new EmployeeResultsModal(page, testInfo);

        await test.step('Открыть дашборд "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Проверить наличие сотрудников в таблице", async () => {
          const count = await myTeamPage.getEmployeesCount();
          expect(
            count,
            "В таблице должен быть хотя бы один сотрудник. Проверьте наличие активного PR с target users.",
          ).toBeGreaterThan(0);
        });

        await test.step('Нажать "Результаты" для первого сотрудника', async () => {
          await myTeamPage.clickResultsForEmployee(0);
        });

        await test.step("Проверить, что модалка открылась", async () => {
          await modal.assertModalOpened();
          const employeeName = await modal.getEmployeeName();
          console.log(`✓ Модалка открыта для: ${employeeName}`);
        });

        await test.step("Закрыть модалку и остаться на дашборде", async () => {
          await modal.closeModal();
          await myTeamPage.assertOpened();
        });
      },
    );
  },
);
