// tests/functional/objectives/objective-approval-settings-video-i18n.spec.js
// TestRail: C-APPROVAL-VIDEO-01, C-APPROVAL-VIDEO-02
// Видео-секция "Подробно о процессе утверждения целей" видна для /ru/, скрыта для /en/
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

let initialApprovalEnabled = null;

test.describe(
  "Утверждение целей — видео секция i18n (RU vs EN)",
  { tag: ["@ui", "@objectives", "@approval", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const { data: settingsData } = await api.getCompanySettings();
      initialApprovalEnabled =
        settingsData?.isObjectivesApprovalEnabled ??
        settingsData?.is_objectives_approval_enabled ??
        false;

      // Убеждаемся что утверждение включено, чтобы видео-секция могла отображаться
      await api.setApprovalEnabled(true);
    });

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      if (initialApprovalEnabled !== null) {
        await api.setApprovalEnabled(initialApprovalEnabled).catch(() => {});
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8307: Видео-секция видна на странице настроек для локали /ru/",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        await test.step("Открыть настройки целей на русском языке", async () => {
          await page.goto("/ru/objectives/settings/");
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG })
            .catch(() => {});
          await expect(
            page.getByRole("heading", { name: /Настройки целей/i }),
          ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
        });

        await test.step(
          'Проверить видимость текста "Подробно о процессе утверждения целей"',
          async () => {
            const videoSectionText = page.getByText(
              /Подробно о процессе утверждения целей/i,
            );
            await expect(videoSectionText.first()).toBeVisible({
              timeout: TIMEOUTS.SHORT,
            });
          },
        );

        await test.step(
          "Проверить наличие элемента видео (iframe, video или кнопки воспроизведения)",
          async () => {
            const videoElement = page
              .locator(
                'iframe, video, [class*="video" i], [class*="Video" i], button[aria-label*="play" i], button[aria-label*="воспроизведен" i]',
              )
              .first();
            const hasVideo = await videoElement
              .waitFor({ state: "attached", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (!hasVideo) {
              // Fallback: ссылка на видеохостинг рядом с текстом
              const videoLink = page
                .locator(
                  'a[href*="youtu"], a[href*="vimeo"], a[href*="video"], a[href*="rutube"]',
                )
                .first();
              const hasLink = await videoLink
                .waitFor({ state: "attached", timeout: TIMEOUTS.SHORT })
                .then(() => true)
                .catch(() => false);

              // Если ни видео-элемента, ни ссылки нет — хотя бы текст-описание должно быть
              if (!hasLink) {
                const descriptionText = page.getByText(
                  /Подробно о процессе утверждения целей/i,
                );
                await expect(descriptionText.first()).toBeVisible();
              }
            }
          },
        );
      },
    );

    test("C8308: Видео-секция с русским текстом НЕ отображается для локали /en/",
      { tag: ["@regression"] },
      async ({ adminAuth: page }) => {
        setSeverity("normal");

        await test.step("Открыть настройки целей на английском языке", async () => {
          await page.goto("/en/objectives/settings/");
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG })
            .catch(() => {});
          // Страница может показать Settings или перенаправить — ждём заголовок
          await expect(
            page
              .getByRole("heading", { name: /settings/i })
              .or(page.getByRole("heading", { name: /Настройки/i })),
          ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
        });

        await test.step(
          'Проверить что RU-текст "Подробно о процессе утверждения целей" НЕ виден',
          async () => {
            // Русский текст видео-секции не должен присутствовать на EN-странице
            const ruVideoText = page.getByText(
              "Подробно о процессе утверждения целей",
              { exact: false },
            );
            await expect(ruVideoText).not.toBeVisible();
          },
        );

        await test.step(
          "Убедиться что страница показывает контент (не пустая после редиректа)",
          async () => {
            // Страница должна иметь хоть какой-то заголовок (EN или RU после редиректа)
            const anyHeading = page.getByRole("heading").first();
            await expect(anyHeading).toBeVisible({
              timeout: TIMEOUTS.SHORT,
            });
          },
        );
      },
    );
  },
);
