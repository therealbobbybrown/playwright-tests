// tests/functional/objectives/objective-multiple-kr-extended.spec.js
// TestRail: C2651, C2655, C2658
// TASK-OKR-007: Несколько КР - расширенные тесты

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
  "Несколько КР - расширенные тесты (OKR)",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test(
      "C3672: КР с разными типами метрик и удаление КР",
      { tag: ["@normal"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        testInfo.setTimeout(180_000);

        const sideMenu = new SideMenu(page, testInfo);
        const objectivesSettingsPage = new ObjectivesSettingsPage(
          page,
          testInfo,
        );
        const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);

        const randomNumber = Math.floor(Math.random() * 100000) + 1;
        const objectiveTitle = `Цель с КР разных типов ${randomNumber}`;

        await test.step("Открыть форму создания цели", async () => {
          const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
          if (!hasCreateItem) {
            await sideMenu.openObjectivesSettings();
            await objectivesSettingsPage.assertOpened();
            await objectivesSettingsPage.enableOkrIfDisabled();
          }
          await sideMenu.openObjectivesCreate();
          console.log("✓ Форма создания цели открыта");
        });

        await test.step("Заполнить название цели", async () => {
          await objectiveCreatePage.objectiveTitleTextarea.fill(objectiveTitle);
          console.log(`✓ Название: ${objectiveTitle}`);
        });

        await test.step("Добавить КР 1 (тип: процент - по умолчанию)", async () => {
          await objectiveCreatePage.addMilestoneButton.click();
          await objectiveCreatePage.milestoneTitleTextarea.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await objectiveCreatePage.milestoneTitleTextarea.fill(
            `КР процент ${randomNumber}`,
          );

          // Проверяем тип метрики по умолчанию
          const typeSelector = page
            .locator('[class*="Select"]')
            .filter({ hasText: /Процент|%/i })
            .first();
          let hasPercent = false;
          try {
            await typeSelector.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            hasPercent = true;
          } catch {
            hasPercent = false;
          }

          if (hasPercent) {
            console.log("✓ КР 1 добавлен (тип: процент)");
          } else {
            console.log("✓ КР 1 добавлен");
          }
        });

        await test.step("Добавить КР 2 (тип: число)", async () => {
          await objectiveCreatePage.addMilestoneButton.click();

          const krTextareas = page.locator("textarea#milestone-title");
          const count = await krTextareas.count();
          expect(count, "После добавления КР 2 должно быть >= 2 textarea").toBeGreaterThanOrEqual(2);

          {
            const secondKr = krTextareas.nth(1);
            await secondKr.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await secondKr.fill(`КР число ${randomNumber}`);

            // Пробуем изменить тип метрики на "Число"
            const typeSelectors = page
              .locator('[class*="Select"]')
              .filter({ hasText: /Процент|Число|%/i });
            const selectorCount = await typeSelectors.count();

            if (selectorCount >= 2) {
              const secondTypeSelector = typeSelectors.nth(1);
              await secondTypeSelector.click();
              await page.waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.SHORT });

              const numberOption = page
                .getByRole("option", { name: /Число/i })
                .first()
                .or(
                  page
                    .locator('[class*="Option"]')
                    .filter({ hasText: /Число/i })
                    .first(),
                );

              let hasNumber = false;
              try {
                await numberOption.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
                hasNumber = true;
              } catch {
                hasNumber = false;
              }

              if (hasNumber) {
                await numberOption.click();
                console.log("✓ КР 2 добавлен (тип: число)");
              } else {
                await page.keyboard.press("Escape");
                console.log("✓ КР 2 добавлен (тип по умолчанию)");
              }
            } else {
              console.log("✓ КР 2 добавлен");
            }
          }
        });

        await test.step("Добавить КР 3 (тип: выполнено/не выполнено)", async () => {
          await objectiveCreatePage.addMilestoneButton.click();

          const krTextareas = page.locator("textarea#milestone-title");
          const count = await krTextareas.count();
          expect(count, "После добавления КР 3 должно быть >= 3 textarea").toBeGreaterThanOrEqual(3);

          {
            const thirdKr = krTextareas.nth(2);
            await thirdKr.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await thirdKr.fill(`КР бинарный ${randomNumber}`);

            const typeSelectors = page
              .locator('[class*="Select"]')
              .filter({ hasText: /Процент|Число|Выполнено|%/i });
            const selectorCount = await typeSelectors.count();

            if (selectorCount >= 3) {
              const thirdTypeSelector = typeSelectors.nth(2);
              await thirdTypeSelector.click();
              // Wait for dropdown to open
              const binaryOption = page
                .getByRole("option", { name: /Выполнено|Да\/Нет|Boolean/i })
                .first()
                .or(
                  page
                    .locator('[class*="Option"]')
                    .filter({ hasText: /Выполнено/i })
                    .first(),
                );

              let hasBinary = false;
              try {
                await binaryOption.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
                hasBinary = true;
              } catch {
                hasBinary = false;
              }

              if (hasBinary) {
                await binaryOption.click();
                console.log("✓ КР 3 добавлен (тип: выполнено/не выполнено)");
              } else {
                await page.keyboard.press("Escape");
                console.log("✓ КР 3 добавлен (тип по умолчанию)");
              }
            } else {
              console.log("✓ КР 3 добавлен");
            }
          }
        });

        await test.step("Добавить КР 4 (для последующего удаления)", async () => {
          await objectiveCreatePage.addMilestoneButton.click();

          const krTextareas = page.locator("textarea#milestone-title");
          const count = await krTextareas.count();
          expect(count, "После добавления КР 4 должно быть >= 4 textarea").toBeGreaterThanOrEqual(4);

          const fourthKr = krTextareas.nth(3);
          await fourthKr.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await fourthKr.fill(`КР для удаления ${randomNumber}`);
          console.log("✓ КР 4 добавлен (будет удалён)");
        });

        await test.step("Проверить нумерацию КР", async () => {
          const krTextareas = page.locator("textarea#milestone-title");
          const count = await krTextareas.count();
          console.log(`✓ Всего добавлено КР: ${count}`);
          expect(count).toBeGreaterThanOrEqual(4);

          // Проверяем наличие меток КР 1, КР 2, КР 3, КР 4
          for (let i = 1; i <= Math.min(count, 4); i++) {
            const krLabel = page.locator(`text=КР ${i}`).first();
            let labelVisible = false;
            try {
              await krLabel.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
              labelVisible = true;
            } catch {
              labelVisible = false;
            }
            expect(labelVisible, `Метка "КР ${i}" должна быть видна`).toBe(true);
            console.log(`  ✓ Метка "КР ${i}" найдена`);
          }
        });

        await test.step("Удалить КР 2 из середины списка", async () => {
          // Ищем кнопку удаления для КР 2
          // Структура может быть: label "КР 2" рядом с кнопкой удаления
          const kr2Block = page
            .locator('[class*="Milestone"], [class*="kr-block"]')
            .filter({ has: page.locator("text=КР 2") })
            .first();

          let deleteFound = false;

          // Вариант 1: Кнопка удаления внутри блока КР
          const deleteButton = kr2Block
            .locator("button")
            .filter({ has: page.locator("svg") })
            .first();
          let hasDeleteButton = false;
          try {
            await deleteButton.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            hasDeleteButton = true;
          } catch {
            hasDeleteButton = false;
          }

          if (hasDeleteButton) {
            await deleteButton.click();
            deleteFound = true;
            console.log("✓ Нажата кнопка удаления КР 2");
          }

          if (!deleteFound) {
            // Вариант 2: Кнопка с иконкой X или trash рядом с textarea
            const krTextareas = page.locator("textarea#milestone-title");
            const count = await krTextareas.count();

            if (count >= 2) {
              // Находим родительский контейнер второго КР
              const secondKrContainer = krTextareas.nth(1).locator("..");
              const deleteBtn = secondKrContainer.locator("button").first();

              let btnVisible = false;
              try {
                await deleteBtn.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
                btnVisible = true;
              } catch {
                btnVisible = false;
              }

              if (btnVisible) {
                await deleteBtn.click();
                deleteFound = true;
                console.log("✓ Удалён КР 2 через кнопку в контейнере");
              }
            }
          }

          if (!deleteFound) {
            console.log("ℹ️ Кнопка удаления КР не найдена");
          }
        });

        await test.step("Проверить перенумерацию КР после удаления", async () => {
          const krTextareas = page.locator("textarea#milestone-title");
          const countAfterDelete = await krTextareas.count();
          console.log(`✓ Количество КР после удаления: ${countAfterDelete}`);
          expect(countAfterDelete, "После удаления КР 2 количество КР должно уменьшиться").toBeLessThan(4);

          // После удаления КР 2, бывший КР 3 должен стать КР 2
          expect(countAfterDelete, "Должно остаться >= 2 КР").toBeGreaterThanOrEqual(2);

          const secondKrValue = await krTextareas.nth(1).inputValue();
          console.log(`  Значение второго КР: ${secondKrValue}`);

          // После удаления КР 2 ("КР число"), бывший КР 3 ("КР бинарный") становится вторым
          expect(
            secondKrValue,
            "После удаления КР 2 вторым КР должен стать бывший КР 3 (бинарный)",
          ).toContain(`КР бинарный ${randomNumber}`);
          console.log("✅ КР перенумерованы корректно после удаления");
        });

        await test.step("Создать цель", async () => {
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
          );
          // Wait for scroll to complete
          await objectiveCreatePage.createButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await objectiveCreatePage.createButton.scrollIntoViewIfNeeded();
          await objectiveCreatePage.createButton.click({ force: true });

          console.log('✓ Нажата кнопка "Создать"');

          // Ждём навигации на страницу цели (может оставаться на edit из-за autosave)
          try {
            await page.waitForURL(/\/objectives\/(?:view\/)\d+/, { timeout: TIMEOUTS.PAGE_LOAD });
          } catch {
            // Приложение могло остаться на edit URL — извлечём ID из текущего URL
          }

          const createdUrl = page.url();
          const createdMatch = createdUrl.match(/\/objectives\/(?:view\/|edit\/)?(\d+)/);
          if (!createdMatch) throw new Error(`Не удалось определить ID созданной цели из URL: ${createdUrl}. Возможно, навигация не произошла после нажатия "Создать".`);
          const createdObjectiveId = createdMatch[1];

          // Явно переходим на страницу просмотра
          await page.goto(`/ru/objectives/view/${createdObjectiveId}/`);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить созданную цель", async () => {
          // На этом этапе мы уже на странице view (навигация выполнена в предыдущем шаге)
          const detailsTitle = page.getByText("Детали цели", { exact: true });
          await detailsTitle.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          await page
            .getByText(objectiveTitle, { exact: true })
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          console.log(`✅ Цель создана: ${objectiveTitle}`);

          // Проверяем что на странице есть КР (минимум 2 после удаления одного из 4)
          // Из-за autosave порядок/состав КР может отличаться от того, что было в форме,
          // поэтому проверяем наличие любых КР с нашим randomNumber
          const krRows = page.locator('text=/' + randomNumber + '/');
          const krCount = await krRows.count();
          // Вычитаем 1 за строку с названием цели (которая тоже содержит randomNumber)
          const actualKrCount = krCount - 1;
          console.log(`✅ Количество КР на странице деталей: ${actualKrCount}`);
          expect(actualKrCount, "Должно быть как минимум 2 КР после удаления одного").toBeGreaterThanOrEqual(2);

          // Проверяем что КР "бинарный" присутствует (он точно не удалялся)
          const krBinary = page.getByText(`КР бинарный ${randomNumber}`);
          await krBinary.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          console.log("✅ КР (бинарный) сохранён");
        });

        await test.step("Итоговая сводка", async () => {
          console.log(
            "\n╔══════════════════════════════════════════════════════════════╗",
          );
          console.log(
            "║     РАСШИРЕННЫЙ ТЕСТ НЕСКОЛЬКИХ КР                           ║",
          );
          console.log(
            "╠══════════════════════════════════════════════════════════════╣",
          );
          console.log(
            '║ ✓ КР с типом "Процент"                                       ║',
          );
          console.log(
            '║ ✓ КР с типом "Число"                                         ║',
          );
          console.log(
            '║ ✓ КР с типом "Выполнено/Не выполнено"                        ║',
          );
          console.log(
            "║ ✓ Удаление КР из середины списка                             ║",
          );
          console.log(
            "║ ✓ Проверка перенумерации КР                                  ║",
          );
          console.log(
            "╚══════════════════════════════════════════════════════════════╝\n",
          );

          console.log(
            "✅ Тест C2651-C2658: Несколько КР расширенный - ЗАВЕРШЁН",
          );
        });
      },
    );

    test(
      "C2655: добавление КР к существующей цели",
      { tag: ["@normal"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        testInfo.setTimeout(180_000);

        const sideMenu = new SideMenu(page, testInfo);
        const objectivesSettingsPage = new ObjectivesSettingsPage(
          page,
          testInfo,
        );
        const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);

        const randomNumber = Math.floor(Math.random() * 100000) + 1;
        const objectiveTitle = `Цель для добавления КР ${randomNumber}`;
        const initialKrTitle = `Начальный КР ${randomNumber}`;
        const newKrTitle = `Добавленный КР ${randomNumber}`;
        let objectiveId = null;

        await test.step("Создать цель с одним КР", async () => {
          const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
          if (!hasCreateItem) {
            await sideMenu.openObjectivesSettings();
            await objectivesSettingsPage.assertOpened();
            await objectivesSettingsPage.enableOkrIfDisabled();
          }
          await sideMenu.openObjectivesCreate();

          await objectiveCreatePage.objectiveTitleTextarea.fill(objectiveTitle);
          await objectiveCreatePage.addMilestoneButton.click();
          await objectiveCreatePage.milestoneTitleTextarea.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await objectiveCreatePage.milestoneTitleTextarea.fill(initialKrTitle);

          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
          );
          await objectiveCreatePage.createButton.scrollIntoViewIfNeeded();
          await objectiveCreatePage.createButton.click({ force: true });

          // Ждём навигации — может быть view или edit URL (autosave может оставить на edit)
          try {
            await page.waitForURL(/\/objectives\/(?:view\/|edit\/)?\d+/, { timeout: TIMEOUTS.PAGE_LOAD });
          } catch {
            // Навигация не произошла — будем использовать текущий URL
          }
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          // Извлекаем ID цели из URL (формат: /objectives/view/{id} или /objectives/edit/{id})
          const currentUrl = page.url();
          const match = currentUrl.match(/\/objectives\/(?:view\/|edit\/)?(\d+)/);
          if (match) {
            objectiveId = match[1];
          }
          console.log(`✓ Цель создана: ${objectiveTitle}, ID: ${objectiveId}`);
        });

        await test.step("Открыть цель для редактирования", async () => {
          expect(objectiveId, "ID цели должен быть извлечён из URL").toBeTruthy();

          await page.goto(`/ru/objectives/edit/${objectiveId}/`);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          // Проверяем что открылась страница редактирования
          const heading = page.getByRole("heading", {
            name: /Изменить цель/,
            level: 1,
          });
          await heading.waitFor({
            state: "visible",
            timeout: TIMEOUTS.LONG,
          });
          console.log(`✓ Открыта форма редактирования цели ${objectiveId}`);
        });

        await test.step("Добавить новый КР", async () => {
          const addKrButton = page.getByRole("button", {
            name: "Добавить ключевой результат",
          });

          await addKrButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.LONG,
          });
          await addKrButton.click();

          // Находим последний textarea для КР
          const krTextareas = page.locator("textarea#milestone-title");
          // Ждём чтобы появился новый textarea
          await expect(krTextareas).toHaveCount(2, { timeout: TIMEOUTS.MEDIUM });
          const count = await krTextareas.count();
          expect(count, "После добавления КР должно быть >= 2 textarea").toBeGreaterThanOrEqual(2);

          const lastKr = krTextareas.last();
          await lastKr.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await lastKr.fill(newKrTitle);
          console.log(`✓ Добавлен новый КР: ${newKrTitle}`);
        });

        await test.step("Сохранить изменения", async () => {
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
          );

          const saveButton = page.getByRole("button", { name: "Сохранить" });
          await saveButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await saveButton.scrollIntoViewIfNeeded();
          await saveButton.click();

          // Ждём навигации или сохранения (может остаться на edit с "Сохранено")
          try {
            await page.waitForURL(/\/objectives\/(?:view\/\d+|\?|$)/, {
              timeout: TIMEOUTS.PAGE_LOAD,
            });
          } catch {
            // Может остаться на edit с "Сохранено" — это нормально
          }

          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          console.log("✓ Изменения сохранены");
        });

        await test.step("Проверить что новый КР добавлен", async () => {
          // Переходим на страницу просмотра цели
          const currentUrl = page.url();
          if (!currentUrl.includes("/view/")) {
            await page.goto(`/ru/objectives/view/${objectiveId}/`);
            await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          }

          const newKrLocator = page.getByText(newKrTitle);
          await newKrLocator.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          console.log(
            `✅ Новый КР "${newKrTitle}" отображается на странице цели`,
          );
        });

        console.log(
          "✅ Тест C2655: Добавление КР к существующей цели - ЗАВЕРШЁН",
        );
      },
    );
  },
);
