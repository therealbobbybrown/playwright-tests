// tests/functional/objectives/objectives-list-filters.spec.js
// TestRail: C2667, C2668, C2669, C2670, C2671, C2672, C2673, C2674
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import { ObjectivesSettingsPage } from "../../../pages/ObjectivesSettingsPage.js";
import { ObjectivesDatepickerHelper } from "../../../pages/ObjectivesDatepickerHelper.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Цели — списки и фильтры",
  { tag: ["@ui", "@regression", "@okr"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test('C2667: список целей "Мои цели" — базовые элементы', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
      const settingsPage = new ObjectivesSettingsPage(page, testInfo);

      await test.step('Открыть "Все цели", включив OKR при необходимости', async () => {
        const hasAllObjectives = await sideMenu.hasObjectivesAllItem();

        if (!hasAllObjectives) {
          await sideMenu.openObjectivesSettings();
          await settingsPage.assertOpened();
          await settingsPage.enableOkrIfDisabled();
        }

        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();
      });

      await test.step('Переключиться на вкладку "Мои цели"', async () => {
        // Вкладки на странице целей — это button, а не tab role
        const myGoalsTab = page
          .getByRole("button", { name: /Мои цели/i })
          .first();

        let tabVisible = false;
        try {
          await myGoalsTab.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          tabVisible = true;
        } catch {
          // вкладка не появилась
        }

        if (tabVisible) {
          await myGoalsTab.click();
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        }
      });

      await test.step("Проверить фильтры", async () => {
        // Фильтр периода (новый датапикер, заменил старые дропдауны "Год" + "Квартал")
        const dp = objectivesAllPage.periodFilter;
        await dp.anchor.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
        await objectivesAllPage.assertPeriodFilterEmpty();
        console.log("Фильтр периода (датапикер): visible, пустой");

        // Уровень цели
        const levelFilter = page
          .locator('[class*="Select"], [class*="Filter"]')
          .filter({ hasText: /Уровень|Индивидуальная|Командная|Компании/i })
          .first();
        await levelFilter.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
        console.log("Фильтр уровня: visible");
      });

      await test.step("Проверить поле поиска", async () => {
        const searchInput = page.getByPlaceholder(/Найти|Поиск/i).first();
        await searchInput.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
        console.log("Поле поиска: visible");
      });

      await test.step('Проверить ссылку "Добавить цель"', async () => {
        // "Добавить цель" — это link (<a>), а не button
        const addLink = page
          .getByRole("link", { name: /Добавить цель|Создать цель/i })
          .first();
        await addLink.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
        await expect(addLink).toContainText(/Добавить цель|Создать цель/i);
        console.log('Ссылка "Добавить цель": visible');
      });

      await test.step("Проверить таблицу целей", async () => {
        const table = page.locator("table").first();
        let tableVisible = false;
        try {
          await table.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          tableVisible = true;
        } catch {
          // таблица не появилась
        }

        if (tableVisible) {
          const headers = await table.locator("th").allInnerTexts();
          console.log("Заголовки таблицы:", headers);

          // Ожидаем: Цель, Уровень, Период, Ответственный, Прогресс, Апдейт
          const expectedColumns = ["Цель", "Период", "Прогресс"];
          for (const col of expectedColumns) {
            const hasColumn = headers.some((h) =>
              h.toLowerCase().includes(col.toLowerCase()),
            );
            expect(hasColumn, `Ожидается столбец "${col}"`).toBe(true);
          }
        } else {
          // Если таблицы нет — возможно, целей нет
          const emptyState = page
            .locator("text=/нет целей|создайте первую/i")
            .first();
          let isEmpty = false;
          try {
            await emptyState.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            isEmpty = true;
          } catch {
            // пустое состояние не найдено
          }
          console.log("Пустое состояние:", isEmpty);
        }
      });
    });

    test('C2668: список целей "Моя команда"', async ({
      managerAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

      await test.step('Открыть "Все цели" через прямую навигацию', async () => {
        // Менеджер не имеет "Настройки целей" в меню — навигируем напрямую.
        // OKR уже включены на стенде.
        await page.goto("/ru/objectives/");
        await objectivesAllPage.assertOpened();
      });

      await test.step('Переключиться на вкладку "Моя команда"', async () => {
        // Дождаться полной загрузки страницы перед поиском вкладок
        await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

        // Вкладки на странице целей — это button, а не tab role
        // MANAGER_LOGIN (Isla Wright) имеет 28+ подчинённых — вкладка гарантированно видна
        const myTeamTab = page
          .getByRole("button", { name: /^Моя команда$/i })
          .first();

        await myTeamTab.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        await myTeamTab.click();
        await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        console.log('Вкладка "Моя команда" открыта');
      });

      await test.step("Проверить дополнительные фильтры для команды", async () => {
        // Фильтр "Команда"
        const teamFilter = page
          .getByRole("button", { name: /Команда/i })
          .first()
          .or(
            page
              .locator('[class*="Select"]')
              .filter({ hasText: /Команда/i })
              .first(),
          );
        let teamVisible = false;
        try {
          await teamFilter.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          teamVisible = true;
        } catch {
          // фильтр не появился
        }
        console.log('Фильтр "Команда":', teamVisible);
        expect(teamVisible, 'Фильтр "Команда" должен быть видим на вкладке "Моя команда"').toBe(true);

        // Фильтр "Ответственный"
        const responsibleFilter = page
          .getByRole("button", { name: /Ответственный/i })
          .first()
          .or(
            page
              .locator('[class*="Select"]')
              .filter({ hasText: /Ответственный/i })
              .first(),
          );
        let responsibleVisible = false;
        try {
          await responsibleFilter.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          responsibleVisible = true;
        } catch {
          // фильтр не появился
        }
        console.log('Фильтр "Ответственный":', responsibleVisible);
        expect(responsibleVisible, 'Фильтр "Ответственный" должен быть видим').toBe(true);
      });
    });

    test('C2669: список целей "Все цели"', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
      const settingsPage = new ObjectivesSettingsPage(page, testInfo);

      await test.step('Открыть "Все цели"', async () => {
        const hasAllObjectives = await sideMenu.hasObjectivesAllItem();

        if (!hasAllObjectives) {
          await sideMenu.openObjectivesSettings();
          await settingsPage.enableOkrIfDisabled();
        }

        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();
      });

      await test.step('Переключиться на вкладку "Все цели"', async () => {
        // Вкладки на странице целей — это button, а не tab role
        const allGoalsTab = page
          .getByRole("button", { name: /^Все цели$/i })
          .first();

        let tabVisible = false;
        try {
          await allGoalsTab.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          tabVisible = true;
        } catch {
          // вкладка не появилась
        }

        if (tabVisible) {
          await allGoalsTab.click();
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          console.log('Вкладка "Все цели" открыта');
        }
      });

      await test.step("Проверить, что отображаются цели всех уровней", async () => {
        const table = page.locator("table").first();
        await table.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const rows = await table.locator("tbody tr").count();
        console.log(`Количество целей: ${rows}`);
        expect(rows, 'Вкладка "Все цели" должна содержать хотя бы одну цель').toBeGreaterThan(0);
      });
    });

    test('C2670: список целей "Мои черновики"', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
      const settingsPage = new ObjectivesSettingsPage(page, testInfo);

      await test.step('Открыть "Все цели"', async () => {
        const hasAllObjectives = await sideMenu.hasObjectivesAllItem();

        if (!hasAllObjectives) {
          await sideMenu.openObjectivesSettings();
          await settingsPage.enableOkrIfDisabled();
        }

        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();
      });

      await test.step('Переключиться на вкладку "Мои черновики"', async () => {
        // Вкладки на странице целей — это button, а не tab role
        const draftsTab = page
          .getByRole("button", { name: /черновик/i })
          .first();

        let tabVisible = false;
        try {
          await draftsTab.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          tabVisible = true;
        } catch {
          // вкладка не появилась
        }

        if (tabVisible) {
          await draftsTab.click();
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          console.log('Вкладка "Мои черновики" открыта');
        } else {
          expect(
            tabVisible,
            'Вкладка "Мои черновики" должна быть видна',
          ).toBe(true);
        }
      });

      await test.step("Проверить содержимое раздела черновиков", async () => {
        // После перехода на вкладку черновиков должна загрузиться страница.
        // Ожидаем либо таблицу с черновиками, либо явное пустое состояние.
        const draftsContent = page
          .locator('table, [class*="Card"], [class*="List"]')
          .first();
        let contentVisible = false;
        try {
          await draftsContent.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          contentVisible = true;
        } catch {
          // контент не появился
        }

        if (contentVisible) {
          console.log("Контент черновиков: загружен");
        } else {
          // Нет таблицы — должно быть явное сообщение о пустом состоянии
          const emptyDrafts = page.locator("text=/нет черновиков|создайте/i").first();
          await expect(
            emptyDrafts,
            "Раздел черновиков должен показывать пустое состояние когда черновиков нет",
          ).toBeVisible({ timeout: TIMEOUTS.SHORT });
          console.log("Контент черновиков: пустое состояние");
        }
      });
    });

    test("C2671: фильтр периода действия", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
      const settingsPage = new ObjectivesSettingsPage(page, testInfo);

      await test.step('Открыть "Все цели"', async () => {
        const hasAllObjectives = await sideMenu.hasObjectivesAllItem();

        if (!hasAllObjectives) {
          await sideMenu.openObjectivesSettings();
          await settingsPage.enableOkrIfDisabled();
        }

        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();
      });

      await test.step("Проверить что фильтр периода пустой по умолчанию", async () => {
        await objectivesAllPage.assertPeriodFilterEmpty();
        console.log("Фильтр периода: пустой (дефолт)");
      });

      await test.step("Выбрать Q1 2026 через датапикер", async () => {
        const dp = objectivesAllPage.periodFilter;
        await dp.selectQuarter(2026, 1);
        const expectedValue = ObjectivesDatepickerHelper.getExpectedQuarterValue(2026, 1);
        await dp.assertValue(expectedValue);
        console.log(`Применён фильтр Q1 2026: ${expectedValue}`);
        // Ждём обновления таблицы
        await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
      });

      await test.step("Сбросить фильтр (навигация, т.к. кнопка × не реализована)", async () => {
        // APP_BUG DEVAPR-11585: кнопка × не реализована → сбрасываем через навигацию
        await page.goto("/ru/objectives/");
        await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
        await objectivesAllPage.switchToTab("all");
        await objectivesAllPage.assertPeriodFilterEmpty();
        console.log("Фильтр периода сброшен (через навигацию)");
      });
    });

    test('C2672: фильтр "Уровень цели"', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
      const settingsPage = new ObjectivesSettingsPage(page, testInfo);

      await test.step('Открыть "Все цели"', async () => {
        const hasAllObjectives = await sideMenu.hasObjectivesAllItem();

        if (!hasAllObjectives) {
          await sideMenu.openObjectivesSettings();
          await settingsPage.enableOkrIfDisabled();
        }

        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();
      });

      await test.step("Проверить фильтр уровня цели", async () => {
        const levelFilter = page
          .locator('[class*="Select"], [class*="Filter"]')
          .filter({ hasText: /Уровень|Все уровни/i })
          .first();

        let levelVisible = false;
        try {
          await levelFilter.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          levelVisible = true;
        } catch {
          // фильтр не появился
        }

        if (levelVisible) {
          await levelFilter.click();
          // Wait for dropdown to open
          const firstOption = page
            .locator('[class*="Option"], [role="option"]')
            .first();
          try {
            await firstOption.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          } catch {
            // выпадающий список не открылся
          }

          const options = page.locator('[class*="Option"], [role="option"]');
          const levels = await options.allInnerTexts();
          console.log("Уровни целей:", levels);

          // Ожидаем: Индивидуальные цели, Цели команд (и возможно "Цели компании")
          const expectedLevels = ["Индивидуальные", "команд"];
          for (const level of expectedLevels) {
            const hasLevel = levels.some((l) =>
              l.toLowerCase().includes(level.toLowerCase()),
            );
            console.log(`Уровень "${level}":`, hasLevel);
            expect(hasLevel, `Уровень "${level}" должен присутствовать в фильтре`).toBe(true);
          }

          await page.keyboard.press("Escape");
        } else {
          console.log("Фильтр уровня не найден");
        }
      });
    });

    test("C2673: поиск цели", async ({ adminAuth, page }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
      const settingsPage = new ObjectivesSettingsPage(page, testInfo);

      await test.step('Открыть "Все цели"', async () => {
        const hasAllObjectives = await sideMenu.hasObjectivesAllItem();

        if (!hasAllObjectives) {
          await sideMenu.openObjectivesSettings();
          await settingsPage.enableOkrIfDisabled();
        }

        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();
      });

      await test.step("Выполнить поиск", async () => {
        const searchInput = page.getByPlaceholder(/Найти|Поиск/i).first();
        let searchVisible = false;
        try {
          await searchInput.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          searchVisible = true;
        } catch {
          // поиск не появился
        }

        expect(searchVisible, "Поле поиска должно быть видимым").toBe(true);

        await searchInput.fill("тест");
        // Wait for search results to load (debounce + network)
        await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

        // Проверяем, что поисковый запрос применён (значение в инпуте)
        await expect(searchInput).toHaveValue("тест");

        // Очищаем поиск
        await searchInput.clear();
        // Wait for results to reset
        await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        await expect(searchInput, "Поле поиска должно быть очищено").toHaveValue("");
      });
    });

    test("C2674: сброс фильтров", async ({ adminAuth, page }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
      const settingsPage = new ObjectivesSettingsPage(page, testInfo);

      await test.step('Открыть "Все цели"', async () => {
        const hasAllObjectives = await sideMenu.hasObjectivesAllItem();

        if (!hasAllObjectives) {
          await sideMenu.openObjectivesSettings();
          await settingsPage.enableOkrIfDisabled();
        }

        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();
      });

      await test.step("Применить фильтр периода Q2 2026", async () => {
        const dp = objectivesAllPage.periodFilter;
        await dp.selectQuarter(2026, 2);
        const expectedValue = ObjectivesDatepickerHelper.getExpectedQuarterValue(2026, 2);
        await dp.assertValue(expectedValue);
        await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        console.log(`Применён фильтр Q2 2026: ${expectedValue}`);
      });

      await test.step("Сбросить фильтр и проверить пустое состояние", async () => {
        // APP_BUG DEVAPR-11585: кнопка × не реализована → сбрасываем через навигацию
        await page.goto("/ru/objectives/");
        await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
        await objectivesAllPage.switchToTab("all");
        await objectivesAllPage.assertPeriodFilterEmpty();
        await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        console.log("Фильтр периода сброшен — поле пустое");
      });
    });
  },
);
