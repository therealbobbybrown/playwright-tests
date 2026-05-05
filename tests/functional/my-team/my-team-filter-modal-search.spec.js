import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  'Моя команда — Фильтр "Результаты для"',
  { tag: ["@ui", "@regression", "@my-team"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test("C3974: Поиск сотрудника в модалке фильтра", async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");

      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);

      await test.step('Открыть раздел "Моя команда"', async () => {
        await sideMenu.openMyTeam();
        await myTeamPage.assertOpened();
      });

      let initialItems;
      await test.step("Открыть модалку фильтра и запомнить исходный список", async () => {
        await myTeamPage.openResultsForModal();
        initialItems = await myTeamPage.getItemsInResultsForModal();
        expect(
          initialItems.length,
          "Исходный список сотрудников должен быть не пуст",
        ).toBeGreaterThanOrEqual(1);
      });

      let searchQuery;
      await test.step("Получить поисковый запрос из первого сотрудника в таблице", async () => {
        await myTeamPage.closeResultsForModal();
        const firstName = await myTeamPage.getEmployeeNameByIndex(0);
        // Берём первое слово из имени (до пробела) для более точного поиска
        const firstWord = firstName.trim().split(/\s+/)[0];
        searchQuery = firstWord.length > 4 ? firstWord.slice(0, 5) : firstWord;
        expect(
          searchQuery.length,
          "Поисковый запрос должен быть не пустым",
        ).toBeGreaterThanOrEqual(1);
      });

      let filteredItems;
      await test.step("Открыть модалку и выполнить поиск по частичному имени", async () => {
        await myTeamPage.openResultsForModal();
        await myTeamPage.searchInResultsForModal(searchQuery);
        filteredItems = await myTeamPage.getItemsInResultsForModal();
        expect(
          filteredItems.length,
          "Результаты поиска должны содержать хотя бы один элемент",
        ).toBeGreaterThanOrEqual(1);
      });

      await test.step("Проверить, что все результаты поиска содержат поисковый запрос", async () => {
        const queryLower = searchQuery.toLowerCase();
        for (const item of filteredItems) {
          expect(item.toLowerCase()).toContain(queryLower);
        }
      });

      await test.step("Очистить поиск и проверить, что полный список восстановился", async () => {
        await myTeamPage.searchInResultsForModal("");
        const restoredItems = await myTeamPage.getItemsInResultsForModal();
        expect(restoredItems.length).toBe(initialItems.length);
      });
    });
  },
);
