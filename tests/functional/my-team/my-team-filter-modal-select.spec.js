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
  'Моя команда — Фильтр "Результаты для"',
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

    test("C3975: Выбор сотрудника в фильтре обновляет таблицу", async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");

      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);

      await test.step('Открыть раздел "Моя команда"', async () => {
        await sideMenu.openMyTeam();
        await myTeamPage.assertOpened();
      });

      await test.step("Выбрать оценку с несколькими сотрудниками", async () => {
        await myTeamPage.selectPRFromModal(prTitle);
      });

      let totalCount;
      await test.step("Запомнить количество строк в таблице", async () => {
        totalCount = await myTeamPage.getEmployeesCount();
        expect(totalCount).toBeGreaterThanOrEqual(2);
      });

      let targetEmployeeName;
      await test.step("Запомнить имя первого сотрудника в таблице", async () => {
        targetEmployeeName = await myTeamPage.getEmployeeNameByIndex(0);
        expect(
          targetEmployeeName.trim().length,
          "Имя сотрудника не должно быть пустым",
        ).toBeGreaterThanOrEqual(1);
      });

      await test.step("Открыть модалку, сбросить выбор и выбрать одного сотрудника", async () => {
        await myTeamPage.openResultsForModal();
        await myTeamPage.resetAllInResultsForModal();
        await myTeamPage.selectItemInResultsForModal(targetEmployeeName.trim());
      });

      await test.step("Применить фильтр", async () => {
        await myTeamPage.applyResultsForFilter();
      });

      await test.step("Проверить, что в таблице ровно 1 строка", async () => {
        const filteredCount = await myTeamPage.getEmployeesCount();
        expect(filteredCount).toBe(1);
      });

      await test.step("Проверить, что текст кнопки фильтра содержит имя выбранного сотрудника", async () => {
        const selectedText = await myTeamPage.getSelectedResultsFor();
        expect(selectedText).toContain(targetEmployeeName.trim());
      });
    });
  },
);
