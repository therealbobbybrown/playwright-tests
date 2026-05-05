// tests/functional/my-team/my-team-filter-modal-reset.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { findPRWithMultipleEmployees } from "../../utils/helpers/findPRWithMultipleEmployees.js";

test.describe(
  'Моя команда — Фильтр "Результаты для": сброс',
  { tag: ["@ui", "@regression", "@my-team"] },
  () => {
    let prTitle;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(120_000);
      const result = await findPRWithMultipleEmployees(request, 2);
      prTitle = result.prTitle;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test("C3976: Сброс фильтра восстанавливает полный список", async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");

      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);

      await test.step('Открыть дашборд "Моя команда"', async () => {
        await sideMenu.openMyTeam();
        await myTeamPage.assertOpened();
      });

      await test.step("Выбрать оценку с несколькими сотрудниками", async () => {
        await myTeamPage.selectPRFromModal(prTitle);
      });

      let initialCount;
      await test.step("Запомнить исходное количество строк в таблице", async () => {
        initialCount = await myTeamPage.getEmployeesCount();
        expect(initialCount).toBeGreaterThanOrEqual(2);
      });

      let firstEmployeeName;
      await test.step("Открыть модалку, сбросить выбор и выбрать первого сотрудника", async () => {
        firstEmployeeName = await myTeamPage.getEmployeeNameByIndex(0);
        await myTeamPage.openResultsForModal();
        await myTeamPage.resetAllInResultsForModal();
        await myTeamPage.selectItemInResultsForModal(firstEmployeeName);
      });

      await test.step("Применить фильтр и убедиться, что в таблице 1 строка", async () => {
        await myTeamPage.applyResultsForFilter();
        const filteredCount = await myTeamPage.getEmployeesCount();
        expect(
          filteredCount,
          "После выбора одного сотрудника в таблице должна быть ровно 1 строка",
        ).toBe(1);
      });

      await test.step('Открыть модалку и выбрать "Все сотрудники" для сброса к полному списку', async () => {
        await myTeamPage.openResultsForModal();
        await myTeamPage.selectItemInResultsForModal("Все сотрудники");
      });

      await test.step("Применить фильтр и убедиться, что количество строк вернулось к исходному", async () => {
        await myTeamPage.applyResultsForFilter();
        const restoredCount = await myTeamPage.getEmployeesCount();
        expect(
          restoredCount,
          `После сброса фильтра количество строк должно вернуться к исходному (${initialCount})`,
        ).toBe(initialCount);
      });
    });
  },
);
