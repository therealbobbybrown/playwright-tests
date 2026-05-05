// pages/FeedbackSentPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";

const SENT_SCREEN_TIMEOUT_MS = TIMEOUTS.EXTRA_LONG;
const SENT_SCREEN_TOTAL_TIMEOUT_MS = 90_000; // 1.5 мин - особый случай

export class FeedbackSentPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок "Фидбек отправлен" (div с этим текстом)
    this.heading = this.page
      .getByText("Фидбек отправлен", { exact: false })
      .first();

    // Бейдж "Вам начислено 2 💎"
    this.pointsInfo = this.page
      .getByText("Вам начислено", { exact: false })
      .first();

    // Кнопка "Перейти к фидбеку"
    this.goToFeedbackButton = this.page
      .getByRole("button", { name: "Перейти к фидбеку" })
      .first();

    // Тост об успешной отправке (fallback, если экран загружается долго)
    this.successToast = this.page.locator(".Toastify__toast").first();
  }

  /** Проверить, что открыт экран "Фидбек отправлен" */
  async assertOpened() {
    await this._step('Открыт экран "Фидбек отправлен"', async () => {
      const startedAt = Date.now();
      let headingVisible = false;
      let buttonVisible = false;

      try {
        await this.heading.waitFor({
          state: "visible",
          timeout: SENT_SCREEN_TIMEOUT_MS,
        });
        headingVisible = true;
      } catch (e) {
        // продолжаем: попробуем дождаться кнопки/тоста/URL
      }

      const remainingForButton = Math.max(
        SENT_SCREEN_TIMEOUT_MS - (Date.now() - startedAt),
        5_000,
      );

      try {
        await this.goToFeedbackButton.waitFor({
          state: "visible",
          timeout: remainingForButton,
        });
        buttonVisible = true;
      } catch (e) {
        // продолжаем к фоллбеку
      }

      if (!headingVisible && !buttonVisible) {
        // Фоллбек: ждём тост или URL редиректа
        const remaining = Math.max(
          SENT_SCREEN_TOTAL_TIMEOUT_MS - (Date.now() - startedAt),
          5_000,
        );

        await Promise.race([
          this.successToast
            .waitFor({ state: "visible", timeout: remaining })
            .catch(() => null),
          this.page
            .waitForURL(URL_PATTERNS.FEEDBACK_SENT_OR_VIEW, {
              timeout: remaining,
            })
            .catch(() => null),
        ]);
      }

      if (headingVisible) {
        await expect(this.heading).toContainText("Фидбек отправлен");
      }

      if (!headingVisible && !buttonVisible) {
        throw new Error(
          'Экран "Фидбек отправлен" не появился: ни заголовок, ни кнопка не отобразились',
        );
      }
    });
  }

  /** Опционально: проверить, что начислено нужное количество баллов */
  async assertPointsAdded(points) {
    await this._step("Проверить начисленные баллы", async () => {
      await this.pointsInfo.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await expect(this.pointsInfo).toContainText(String(points));
    });
  }

  /** Нажать "Перейти к фидбеку" */
  async goToFeedback() {
    await this._step('Нажать "Перейти к фидбеку"', async () => {
      await this.goToFeedbackButton.waitFor({
        state: "visible",
        timeout: SENT_SCREEN_TIMEOUT_MS,
      });

      await Promise.all([
        // URL вида /feedbacks/123/
        this.page.waitForURL(URL_PATTERNS.FEEDBACK_VIEW, {
          timeout: TIMEOUTS.LONG,
        }),
        this.goToFeedbackButton.click(),
      ]);
    });
  }

  // ------- ВСПОМОГАТЕЛЬНОЕ -------
}
