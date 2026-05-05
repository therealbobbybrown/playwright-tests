// tests/functional/my-team/my-team-filter-modal-multiselect.spec.js
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
  'Моя команда — Фильтр "Результаты для": мультиселект',
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

    test("C3977: Мультиселект — выбор нескольких сотрудников", async ({
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

      await test.step("Проверить, что в таблице не менее 2 сотрудников", async () => {
        const count = await myTeamPage.getEmployeesCount();
        expect(count).toBeGreaterThanOrEqual(2);
      });

      let firstName;
      let secondName;
      await test.step("Получить имена первых двух сотрудников из таблицы", async () => {
        firstName = await myTeamPage.getEmployeeNameByIndex(0);
        secondName = await myTeamPage.getEmployeeNameByIndex(1);
      });

      await test.step("Открыть модалку, сбросить выбор и выбрать двух сотрудников", async () => {
        await myTeamPage.openResultsForModal();
        await myTeamPage.resetAllInResultsForModal();
        await myTeamPage.selectItemInResultsForModal(firstName);
        await myTeamPage.selectItemInResultsForModal(secondName);
      });

      await test.step("Проверить, что модалка показывает счётчик 2 выбранных и кнопку «Применить»", async () => {
        const modal = myTeamPage.getResultsForModal();

        // «Выбрано: 2» появляется при частичном выборе (2 из 3+).
        // Если в PR ровно 2 сотрудника — выбор обоих переключает UI на «Выбраны все»
        // и в футере появляется кнопка «Посмотреть выбранных (2)».
        const hasPartialCounter = await modal
          .getByText(/Выбрано:\s*2/)
          .isVisible();
        const hasAllSelected = await modal
          .getByText(/Выбраны все/i)
          .isVisible();
        const hasFooterCounter = await modal
          .getByRole("button", { name: /Посмотреть выбранных \(2\)/i })
          .isVisible();

        expect(
          hasPartialCounter || hasAllSelected || hasFooterCounter,
          "Должно быть видно 2 выбранных («Выбрано: 2», «Выбраны все» или «Посмотреть выбранных (2)»)",
        ).toBeTruthy();

        // Кнопка «Применить» в футере
        const applyButton = modal
          .getByRole("button", { name: /Применить/i })
          .first();
        await expect(
          applyButton,
          "Кнопка «Применить» должна быть видна",
        ).toBeVisible();
      });

      await test.step("Применить фильтр", async () => {
        await myTeamPage.applyResultsForFilter();
      });

      await test.step("Убедиться, что в таблице ровно 2 строки", async () => {
        const count = await myTeamPage.getEmployeesCount();
        expect(
          count,
          "После выбора двух сотрудников в таблице должно быть ровно 2 строки",
        ).toBe(2);
      });

      await test.step("Убедиться, что кнопка фильтра содержит имена обоих сотрудников", async () => {
        const filterText = await myTeamPage.getSelectedResultsFor();
        expect(
          filterText,
          `Кнопка фильтра должна содержать имя первого сотрудника: "${firstName}"`,
        ).toContain(firstName);
        expect(
          filterText,
          `Кнопка фильтра должна содержать имя второго сотрудника: "${secondName}"`,
        ).toContain(secondName);
      });
    });
  },
);
