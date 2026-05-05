import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  'Моя команда — Фильтр "Результаты для": вкладка Отделы',
  { tag: ["@ui", "@regression", "@my-team"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test('C3972: Вкладка "Отделы" отображает структуру организации', async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");

      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);

      let employeeItems;

      await test.step("Открыть раздел «Моя команда»", async () => {
        await sideMenu.openMyTeam();
        await myTeamPage.assertOpened();
      });

      await test.step("Открыть модальное окно «Результаты для»", async () => {
        await myTeamPage.openResultsForModal();
      });

      await test.step("Запомнить содержимое вкладки «Сотрудники»", async () => {
        employeeItems = await myTeamPage.getItemsInResultsForModal();
        expect(
          employeeItems.length,
          "Список сотрудников должен быть не пуст",
        ).toBeGreaterThanOrEqual(1);
      });

      await test.step("Переключиться на вкладку «Отделы»", async () => {
        await myTeamPage.switchResultsForTab("departments");
      });

      await test.step("Проверить плейсхолдер поиска на вкладке «Отделы»", async () => {
        const modal = myTeamPage.getResultsForModal();
        await expect(
          modal.getByRole("textbox", { name: "Название отдела" }),
          "Поле поиска должно иметь плейсхолдер «Название отдела»",
        ).toBeVisible();
      });

      await test.step("Проверить, что список отделов не пуст", async () => {
        const departmentItems = await myTeamPage.getItemsInResultsForModal();
        expect(
          departmentItems.length,
          "Вкладка «Отделы» должна содержать хотя бы один отдел",
        ).toBeGreaterThanOrEqual(1);
      });

      await test.step("Проверить, что содержимое вкладки «Отделы» отличается от вкладки «Сотрудники»", async () => {
        const departmentItems = await myTeamPage.getItemsInResultsForModal();
        const hasDifferentContent = departmentItems.some(
          (item) => !employeeItems.includes(item),
        );
        expect(hasDifferentContent).toBe(true);
      });

      await test.step("Закрыть модальное окно", async () => {
        await myTeamPage.closeResultsForModal();
      });
    });
  },
);
