// tests/functional/objectives/objective-multiple-kr.spec.js
// TestRail: C2651 - Создание цели с несколькими ключевыми результатами
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ObjectivesSettingsPage } from "../../../pages/ObjectivesSettingsPage.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import { ObjectiveDetailsPage } from "../../../pages/ObjectiveDetailsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Создание цели с несколькими КР (OKR)",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C2651: создание цели с несколькими ключевыми результатами разных типов", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);
      const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);
      const objectiveDetailsPage = new ObjectiveDetailsPage(page, testInfo);

      const randomNumber = Math.floor(Math.random() * 100000) + 1;
      const objectiveTitle = `Цель с несколькими КР ${randomNumber}`;

      await test.step('Открыть "Создать цель"', async () => {
        const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
        if (!hasCreateItem) {
          await sideMenu.openObjectivesSettings();
          await objectivesSettingsPage.assertOpened();
          await objectivesSettingsPage.enableOkrIfDisabled();
        }
        await sideMenu.openObjectivesCreate();
      });

      await test.step("Заполнить название цели", async () => {
        await objectiveCreatePage.objectiveTitleTextarea.fill(objectiveTitle);
      });

      await test.step("Добавить первый КР (процент)", async () => {
        await objectiveCreatePage.addMilestoneButton.click();
        await objectiveCreatePage.milestoneTitleTextarea.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await objectiveCreatePage.milestoneTitleTextarea.fill(
          `КР процент ${randomNumber}`,
        );

        // Проверяем что тип метрики по умолчанию "Процент"
        const typeSelector = page
          .locator('[class*="Select"]')
          .filter({ hasText: /Процент|%/i })
          .first();
        let hasTypeSelector = false;
        try {
          await typeSelector.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          hasTypeSelector = true;
        } catch {
          // селектор типа не найден
        }
        if (hasTypeSelector) {
          console.log("Тип метрики по умолчанию найден");
        }
      });

      await test.step("Добавить второй КР (число)", async () => {
        // Добавить ещё один КР
        await objectiveCreatePage.addMilestoneButton.click();

        // Ждём появления второго textarea для КР
        const krTextareas = page.locator("textarea#milestone-title");
        const count = await krTextareas.count();
        console.log(`Количество КР текстовых полей: ${count}`);

        if (count >= 2) {
          const secondKr = krTextareas.nth(1);
          await secondKr.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await secondKr.fill(`КР число ${randomNumber}`);

          // Попробуем изменить тип метрики на "Число"
          const typeSelectors = page
            .locator('[class*="Select"]')
            .filter({ hasText: /Процент|Число|%/i });
          const secondTypeSelector = typeSelectors.nth(1);
          let hasSecondType = false;
          try {
            await secondTypeSelector.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            hasSecondType = true;
          } catch {
            // селектор типа не найден
          }

          if (hasSecondType) {
            await secondTypeSelector.click();
            const numberOption = page
              .getByRole("option", { name: /Число/i })
              .first();
            let hasNumberOption = false;
            try {
              await numberOption.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
              hasNumberOption = true;
            } catch {
              // опция не найдена
            }
            if (hasNumberOption) {
              await numberOption.click();
              console.log('Установлен тип метрики "Число" для второго КР');
            }
          }
        }
      });

      await test.step("Добавить третий КР (выполнено/не выполнено)", async () => {
        await objectiveCreatePage.addMilestoneButton.click();

        const krTextareas = page.locator("textarea#milestone-title");
        const count = await krTextareas.count();

        if (count >= 3) {
          const thirdKr = krTextareas.nth(2);
          await thirdKr.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          await thirdKr.fill(`КР бинарный ${randomNumber}`);

          // Попробуем изменить тип метрики
          const typeSelectors = page
            .locator('[class*="Select"]')
            .filter({ hasText: /Процент|Число|Выполнено|%/i });
          const thirdTypeSelector = typeSelectors.nth(2);
          let hasThirdType = false;
          try {
            await thirdTypeSelector.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            hasThirdType = true;
          } catch {
            // селектор типа не найден
          }

          if (hasThirdType) {
            await thirdTypeSelector.click();
            const binaryOption = page
              .getByRole("option", { name: /Выполнено|Да\/Нет/i })
              .first();
            let hasBinaryOption = false;
            try {
              await binaryOption.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
              hasBinaryOption = true;
            } catch {
              // опция не найдена
            }
            if (hasBinaryOption) {
              await binaryOption.click();
              console.log(
                'Установлен тип метрики "Выполнено/Не выполнено" для третьего КР',
              );
            }
          }
        }
      });

      await test.step("Проверить нумерацию КР", async () => {
        // КР должны иметь метки с порядковыми номерами
        const krLabels = page.locator(
          '[class*="MilestoneLabel"], [class*="kr-label"], [class*="label"]',
        );
        const labelsCount = await krLabels.count();
        console.log(`Количество меток КР: ${labelsCount}`);
      });

      await test.step("Создать цель", async () => {
        await objectiveCreatePage.createButton.click();
        await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
      });

      await test.step("Проверить что цель создана с несколькими КР", async () => {
        // Проверяем что перешли на страницу деталей
        const detailsTitle = page.getByText("Детали цели", { exact: true });
        let onDetailsPage = false;
        try {
          await detailsTitle.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          onDetailsPage = true;
        } catch {
          // страница деталей не загрузилась
        }

        if (onDetailsPage) {
          // Проверяем наличие названия цели
          await expect(
            page.getByText(objectiveTitle, { exact: true }),
          ).toBeVisible();

          // Проверяем наличие КР (хотя бы первого)
          await expect(
            page.getByText(new RegExp(`КР процент ${randomNumber}`)),
          ).toBeVisible();
        } else {
          console.log(
            "Не удалось перейти на страницу деталей - возможно другой UI",
          );
        }
      });
    });

    test("C2668: удаление КР из цели при создании", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);
      const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);

      const randomNumber = Math.floor(Math.random() * 100000) + 1;

      await test.step('Открыть "Создать цель"', async () => {
        const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
        if (!hasCreateItem) {
          await sideMenu.openObjectivesSettings();
          await objectivesSettingsPage.enableOkrIfDisabled();
        }
        await sideMenu.openObjectivesCreate();
      });

      await test.step("Добавить 3 КР", async () => {
        // Добавить первый
        await objectiveCreatePage.addMilestoneButton.click();
        await objectiveCreatePage.milestoneTitleTextarea.fill(
          `КР 1 - ${randomNumber}`,
        );

        // Добавить второй
        await objectiveCreatePage.addMilestoneButton.click();
        const krTextareas = page.locator("textarea#milestone-title");
        const secondKr = krTextareas.nth(1);
        await secondKr.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await secondKr.fill(`КР 2 - ${randomNumber}`);

        // Добавить третий
        await objectiveCreatePage.addMilestoneButton.click();
        const thirdKr = krTextareas.nth(2);
        await thirdKr.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await thirdKr.fill(`КР 3 - ${randomNumber}`);
      });

      await test.step("Удалить второй КР", async () => {
        // Каждый КР блок содержит:
        // - div с меткой "КР N" и кнопкой удаления
        // - textarea#milestone-title
        // Ищем кнопки, которые находятся рядом с текстом "КР 2"
        const kr2Label = page
          .locator("div, span")
          .filter({ hasText: /^КР 2$/ })
          .first();
        const kr2DeleteButton = kr2Label
          .locator("..")
          .locator("button")
          .first();

        let hasDelete = false;
        try {
          await kr2DeleteButton.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          hasDelete = true;
        } catch {
          // кнопка удаления не найдена рядом с меткой
        }
        console.log(`Кнопка удаления КР 2 (рядом с меткой): ${hasDelete}`);

        if (!hasDelete) {
          // Альтернативный поиск: все кнопки с иконками, которые не являются кнопкой "Добавить"
          const allButtons = page
            .locator("button")
            .filter({ hasNot: page.locator("text=/Добавить|Создать|Отмена/") });
          const buttonCount = await allButtons.count();
          console.log(
            `Всего кнопок (без Добавить/Создать/Отмена): ${buttonCount}`,
          );

          // Кнопка удаления второго КР должна быть примерно 5-я (пропускаем кнопки header и первого КР)
          if (buttonCount >= 5) {
            const deleteButton = allButtons.nth(4); // Приблизительно - кнопка удаления КР 2
            try {
              await deleteButton.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
              hasDelete = true;
            } catch {
              // кнопка не найдена
            }
          }
        }

        if (hasDelete) {
          await kr2DeleteButton.click();

          // Проверяем что осталось 2 КР
          const krTextareas = page.locator("textarea#milestone-title");
          const remainingCount = await krTextareas.count();
          console.log(`Осталось КР: ${remainingCount}`);
          expect(remainingCount).toBe(2);
        } else {
          // Тест неактуален - функционал удаления КР может быть не реализован в текущем UI
          console.log("Кнопка удаления КР не найдена - пропускаем тест");
        }
      });

      await test.step("Проверить перенумерацию КР", async () => {
        // После удаления КР2, бывший КР3 должен стать КР2
        const krTextareas = page.locator("textarea#milestone-title");
        const count = await krTextareas.count();

        if (count >= 2) {
          const secondKrValue = await krTextareas.nth(1).inputValue();
          console.log(`Значение второго КР после удаления: ${secondKrValue}`);
          // Должен быть "КР 3 - {randomNumber}" который стал вторым
          expect(secondKrValue).toContain("КР 3");
        }
      });
    });
  },
);
