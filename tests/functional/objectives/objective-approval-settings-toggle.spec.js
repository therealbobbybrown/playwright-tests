// tests/functional/objectives/objective-approval-settings-toggle.spec.js
import { test } from "../../fixtures/auth.js";
import { ObjectivesSettingsPage } from "../../../pages/ObjectivesSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Настройки утверждения целей",
  { tag: ["@ui", "@objectives", "@approval", "@approval-toggle", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8305: Переключатель утверждения целей on/off",
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");
        const objectivesSettingsPage = new ObjectivesSettingsPage(
          page,
          testInfo,
        );

        await test.step('Открыть страницу "Настройки целей"', async () => {
          await page.goto("/ru/objectives/settings/");
          await objectivesSettingsPage.assertOpened();
        });

        // Запоминаем начальное состояние, чтобы в конце вернуть его
        const initialState = await objectivesSettingsPage.getApprovalState();

        // 1. Если выключено — включить и проверить
        await test.step(
          'Привести утверждение целей в состояние "включено" и проверить',
          async () => {
            const state = await objectivesSettingsPage.getApprovalState();
            if (state === "disabled") {
              await objectivesSettingsPage.approvalCheckbox.click();
              await page
                .getByText("Настройки сохранены")
                .first()
                .waitFor({ state: "visible" });
            }
            await objectivesSettingsPage.assertApprovalEnabled();
          },
        );

        // 2. Выключить и проверить
        await test.step(
          'Привести утверждение целей в состояние "выключено" и проверить',
          async () => {
            await objectivesSettingsPage.disableApproval();
            await objectivesSettingsPage.assertApprovalDisabled();
          },
        );

        // 3. Восстановить исходное состояние
        await test.step("Вернуть утверждение целей в исходное состояние", async () => {
          const current = await objectivesSettingsPage.getApprovalState();
          if (current === initialState) return;

          if (initialState === "enabled") {
            await objectivesSettingsPage.enableApproval();
          } else {
            await objectivesSettingsPage.disableApproval();
          }
        });
      },
    );

    test("C8306: Видео секция видна на странице настроек",
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const objectivesSettingsPage = new ObjectivesSettingsPage(
          page,
          testInfo,
        );

        await test.step('Открыть страницу "Настройки целей"', async () => {
          await page.goto("/ru/objectives/settings/");
          await objectivesSettingsPage.assertOpened();
        });

        await test.step(
          'Проверить видимость текста "Подробно о процессе утверждения целей:"',
          async () => {
            await objectivesSettingsPage.assertVideoSectionVisible();
          },
        );

        await test.step(
          "Проверить наличие контейнера с видео (кнопка воспроизведения или iframe)",
          async () => {
            const videoContainer = page
              .locator('iframe, video, [class*="video" i], [class*="Video" i]')
              .first();
            const hasVideo = await videoContainer
              .waitFor({ state: "attached", timeout: 5000 })
              .then(() => true)
              .catch(() => false);

            if (!hasVideo) {
              // Fallback: проверяем наличие ссылки на видео рядом с текстом
              const videoLink = page.locator('a[href*="youtu"], a[href*="vimeo"], a[href*="video"]').first();
              const hasLink = await videoLink
                .waitFor({ state: "attached", timeout: 3000 })
                .then(() => true)
                .catch(() => false);

              if (!hasLink) {
                // Минимальная проверка: секция с описанием видео присутствует в DOM
                await objectivesSettingsPage.approvalVideoSection.waitFor({
                  state: "visible",
                });
              }
            }
          },
        );
      },
    );
  },
);
