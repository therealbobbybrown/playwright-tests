// tests/functional/objectives/objective-filters-extended.spec.js
// TestRail: C3622 - Расширенная фильтрация целей (комбинированная)

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
  "Расширенная фильтрация целей (OKR)",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test(
      "C3622: Фильтрация по периоду, уровню и комбинированная фильтрация",
      { tag: ["@normal"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        testInfo.setTimeout(180_000);

        const sideMenu = new SideMenu(page, testInfo);
        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
        const settingsPage = new ObjectivesSettingsPage(page, testInfo);

        await test.step('Открыть страницу "Все цели"', async () => {
          const hasAllObjectives = await sideMenu.hasObjectivesAllItem();

          if (!hasAllObjectives) {
            await sideMenu.openObjectivesSettings();
            await settingsPage.assertOpened();
            await settingsPage.enableOkrIfDisabled();
          }

          await sideMenu.openObjectivesAll();
          await objectivesAllPage.assertOpened();
        });

        await test.step("Проверить отсутствие старых дропдаунов год/квартал", async () => {
          await objectivesAllPage.assertOldDropdownsRemoved();
        });

        let initialRowCount = 0;

        await test.step("Запомнить начальное количество целей на вкладке «Все цели»", async () => {
          await objectivesAllPage.switchToTab("all");
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          initialRowCount = await objectivesAllPage.tableRows.count();
          console.log(`Начальное количество целей: ${initialRowCount}`);
        });

        await test.step("Фильтрация по периоду (Q1 2026) через датапикер", async () => {
          const dp = objectivesAllPage.periodFilter;
          await dp.anchor.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          await dp.selectQuarter(2026, 1);
          const expectedValue = ObjectivesDatepickerHelper.getExpectedQuarterValue(2026, 1);
          await dp.assertValue(expectedValue);

          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          const filteredCount = await objectivesAllPage.tableRows.count();
          console.log(
            `Количество целей после фильтра Q1 2026: ${filteredCount}`,
          );
        });

        await test.step("Сбросить фильтр периода и проверить", async () => {
          // Сбрасываем через навигацию (кнопка × пока не реализована)
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({
            state: "visible",
            timeout: TIMEOUTS.LONG,
          });
          await objectivesAllPage.switchToTab("all");
          await objectivesAllPage.assertPeriodFilterEmpty();
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          console.log("Фильтр периода сброшен — поле пустое");
        });

        await test.step("Фильтрация по уровню цели", async () => {
          await objectivesAllPage.levelFilter.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          await objectivesAllPage.levelFilter.click();

          // Ждём открытия дропдауна с опциями
          await objectivesAllPage.levelOptions.first().waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });

          const levelTexts = await objectivesAllPage.levelOptions.allInnerTexts();
          console.log("Доступные уровни:", levelTexts);

          // Проверяем что в списке есть нужные уровни
          const hasIndividual = levelTexts.some((t) =>
            /Индивидуальн/i.test(t),
          );
          expect(
            hasIndividual,
            "Уровень «Индивидуальные цели» должен присутствовать в фильтре",
          ).toBe(true);

          // Выбираем "Индивидуальные цели"
          const individualOption = objectivesAllPage.levelOptions
            .filter({ hasText: /Индивидуальн/i })
            .first();
          await individualOption.click();
          console.log("Применён фильтр уровня: Индивидуальные цели");

          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          const filteredCount = await objectivesAllPage.tableRows.count();
          console.log(`Количество целей после фильтра уровня: ${filteredCount}`);
        });

        await test.step("Комбинированная фильтрация: период + уровень", async () => {
          // Сбрасываем через перезагрузку
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({
            state: "visible",
            timeout: TIMEOUTS.LONG,
          });
          await objectivesAllPage.switchToTab("all");
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          // Применяем фильтр периода Q2 2026
          const dp = objectivesAllPage.periodFilter;
          await dp.selectQuarter(2026, 2);
          await dp.assertValue(
            ObjectivesDatepickerHelper.getExpectedQuarterValue(2026, 2),
          );
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          // Применяем фильтр уровня "Цели команд"
          await objectivesAllPage.levelFilter.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          await objectivesAllPage.levelFilter.click();

          const teamOption = objectivesAllPage.levelOptions
            .filter({ hasText: /Цели команд|Командн/i })
            .first();

          let hasTeamOption = false;
          try {
            await teamOption.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            hasTeamOption = true;
          } catch {}

          if (hasTeamOption) {
            await teamOption.click();
            console.log("Комбинированная фильтрация применена (Q2 2026 + Цели команд)");

            await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

            const combinedCount = await objectivesAllPage.tableRows.count();
            console.log(
              `Результатов комбинированной фильтрации: ${combinedCount}`,
            );
          } else {
            await page.keyboard.press("Escape");
            console.log("Опция «Цели команд» не найдена в фильтре уровня");
          }
        });

        await test.step("Поиск + фильтр одновременно", async () => {
          // Сбрасываем фильтры через навигацию
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({
            state: "visible",
            timeout: TIMEOUTS.LONG,
          });
          await objectivesAllPage.switchToTab("all");

          // Поле поиска
          const searchInput = page.getByPlaceholder(/Найти|Поиск/i).first();
          await searchInput.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          await searchInput.fill("цель");
          await expect(searchInput).toHaveValue("цель");

          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          const searchCount = await objectivesAllPage.tableRows.count();
          console.log(`Поиск «цель»: найдено ${searchCount} целей`);

          // Очищаем поиск
          await searchInput.clear();
          await expect(searchInput).toHaveValue("");
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });
      },
    );
  },
);
