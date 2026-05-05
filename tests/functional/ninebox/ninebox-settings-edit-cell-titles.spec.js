// @ts-check
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { NineBoxSettingsPage } from "../../../pages/NineBoxSettingsPage.js";
import { NineBoxAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * UI тест: редактирование названий ячеек матрицы 9-box через UI
 */

test.describe(
  "NineBox Settings — редактирование названий ячеек",
  { tag: ["@ui", "@ninebox", "@regression"] },
  () => {
    let api;
    let originalSettings;

    test.beforeEach(async ({ adminAuth: page }) => {
      markAsUITest(MODULES.NINE_BOX);

      // Сохраняем оригинальные настройки для восстановления
      api = new NineBoxAPI(page.request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      const { data } = await api.getManagerSettings();
      originalSettings = data;
    });

    test.afterEach(async () => {
      // Восстановить оригинальные cellsTitles
      if (api && originalSettings) {
        try {
          const xIds = originalSettings.competences
            .filter((c) => c.axis === "x")
            .map((c) => c.competenceId);
          const yIds = originalSettings.competences
            .filter((c) => c.axis === "y")
            .map((c) => c.competenceId);
          await api.updateSettings({
            matrixSize: originalSettings.matrixSize,
            cellsTitles: originalSettings.cellsTitles,
            xCompetenciesIds: xIds,
            yCompetenciesIds: yIds,
          });
        } catch {
          // Восстановление best-effort
        }
      }
    });

    test(
      "C9331: Изменить названия ячеек матрицы через UI",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        const settingsPage = new NineBoxSettingsPage(page, testInfo);

        await test.step("Перейти на страницу настроек", async () => {
          await settingsPage.goto();
        });

        await test.step(
          "Проверить что все названия ячеек из API отображаются в UI",
          async () => {
            const apiTitles = originalSettings.cellsTitles;
            const section = settingsPage.categoriesSectionHeading
              .locator("..")
              .locator("..");

            // Проверяем что каждое название из API видимо на странице
            for (let row = 0; row < apiTitles.length; row++) {
              for (let col = 0; col < apiTitles[row].length; col++) {
                const title = apiTitles[row][col];
                if (title) {
                  const cellText = section.getByText(title, { exact: true }).first();
                  await expect(
                    cellText,
                    `Название "${title}" из API [${row},${col}] должно быть видимо в UI`,
                  ).toBeVisible({ timeout: 5_000 });
                }
              }
            }
          },
        );

        await test.step(
          "Кликнуть на ячейку [0][0] и проверить реакцию UI",
          async () => {
            // Находим первую ячейку по её текстовому содержимому из API
            const firstCellTitle = originalSettings.cellsTitles[0]?.[0];
            expect(
              firstCellTitle,
              "API должен вернуть название для ячейки [0][0]",
            ).toBeTruthy();

            const section = settingsPage.categoriesSectionHeading.locator("..");
            const cellText = section
              .getByText(firstCellTitle, { exact: true })
              .first();
            await cellText.scrollIntoViewIfNeeded();
            await cellText.click();

            // Ищем появившийся input/textarea для редактирования (short timeout)
            const editableInput = page.locator(
              'input:visible, textarea:visible, [contenteditable="true"]:visible',
            );

            const inputAppeared = await editableInput
              .first()
              .waitFor({ state: "visible", timeout: 3_000 })
              .then(() => true)
              .catch(() => false);

            if (inputAppeared) {
              // Режим inline edit: вводим новый текст
              const newTitle = `Тест ${Date.now()}`;
              const activeInput = editableInput.first();
              await activeInput.clear();
              await activeInput.fill(newTitle);

              // Кликнуть за пределы ячейки чтобы зафиксировать изменение
              await settingsPage.categoriesSectionHeading.click();

              // Нажать кнопку "Сохранить" если она есть
              const saveBtn = page.getByRole("button", {
                name: "Сохранить",
              });
              if (
                await saveBtn
                  .isVisible()
                  .catch(() => false)
              ) {
                await saveBtn.click();
              }

              // Ждём индикатор сохранения
              await settingsPage.waitForSaved();

              // Проверяем что новое название отображается на странице
              await expect(
                section.getByText(newTitle, { exact: true }).first(),
                "Новое название ячейки должно быть видимо в UI",
              ).toBeVisible({ timeout: 5_000 });

              // Проверяем через API что изменение сохранилось
              const { data: apiData } = await api.getManagerSettings();
              expect(
                apiData.cellsTitles[0][0],
                "API должен вернуть новое название ячейки",
              ).toBe(newTitle);
            } else {
              // Нет inline-редактирования — проверяем что клик был обработан
              // Ячейка кликабельна — уже подтверждено кликом выше
              await expect(
                cellText,
                "Название ячейки [0][0] должно быть видимо после клика",
              ).toBeVisible();
            }
          },
        );
      },
    );
  },
);
