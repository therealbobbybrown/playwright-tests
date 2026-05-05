// tests/functional/ninebox/ninebox-settings-expand-chips.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { NineBoxSettingsPage } from "../../../pages/NineBoxSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "NineBox — раскрытие полного списка компетенций",
  { tag: ["@ui", "@ninebox", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.NINE_BOX);
    });

    test(
      "C9385: Раскрыть полный список компетенций кнопкой Ещё",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const settingsPage = new NineBoxSettingsPage(page, testInfo);

        await test.step("Открыть страницу настроек NineBox", async () => {
          await settingsPage.goto();
        });

        const moreButton = page.getByRole("button", {
          name: /^Ещё \d+$/,
        });

        const moreButtonVisible = await moreButton
          .isVisible()
          .catch(() => false);

        if (!moreButtonVisible) {
          test.skip(
            true,
            'Кнопка "Ещё" не отображается — недостаточно компетенций для сворачивания',
          );
          return;
        }

        const visibleChipsBefore = await settingsPage.yAxisContainer
          .locator(
            "button:not(:has-text('Выбрать компетенции')):not(:has-text('Ещё'))",
          )
          .count();

        await test.step('Нажать кнопку "Ещё"', async () => {
          await moreButton.click();
        });

        await test.step(
          "Проверить что отобразилось больше чипов",
          async () => {
            const visibleChipsAfter = await settingsPage.yAxisContainer
              .locator(
                "button:not(:has-text('Выбрать компетенции')):not(:has-text('Ещё'))",
              )
              .count();
            expect(
              visibleChipsAfter,
              "После раскрытия должно быть больше видимых чипов",
            ).toBeGreaterThan(visibleChipsBefore);
          },
        );
      },
    );
  },
);
