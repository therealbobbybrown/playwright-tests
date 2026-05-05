import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  'Моя команда — Фильтр "Результаты для": вкладка Группы',
  { tag: ["@ui", "@regression", "@my-team"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test('C3973: Вкладка "Группы" отображает список групп', async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");

      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);

      await test.step("Открыть раздел «Моя команда»", async () => {
        await sideMenu.openMyTeam();
        await myTeamPage.assertOpened();
      });

      await test.step("Открыть модальное окно «Результаты для»", async () => {
        await myTeamPage.openResultsForModal();
      });

      await test.step("Переключиться на вкладку «Группы»", async () => {
        await myTeamPage.switchResultsForTab("groups");
      });

      await test.step("Проверить плейсхолдер поиска на вкладке «Группы»", async () => {
        const modal = myTeamPage.getResultsForModal();
        await expect(
          modal.getByRole("textbox", { name: "Название группы" }),
          "Поле поиска должно иметь плейсхолдер «Название группы»",
        ).toBeVisible();
      });

      await test.step("Проверить, что список групп не пуст", async () => {
        const groupItems = await myTeamPage.getItemsInResultsForModal();
        expect(
          groupItems.length,
          "Вкладка «Группы» должна содержать хотя бы одну группу",
        ).toBeGreaterThanOrEqual(1);
      });

      await test.step("Проверить, что модалка содержит подписи «N сотрудник(ов)»", async () => {
        const modal = myTeamPage.getResultsForModal();
        const modalText = await modal.innerText();
        expect(
          modalText,
          "Группы должны содержать подписи с количеством сотрудников",
        ).toMatch(/\d+\s+сотрудник/);
      });

      await test.step("Закрыть модальное окно", async () => {
        await myTeamPage.closeResultsForModal();
      });
    });
  },
);
