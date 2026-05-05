import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
// pages/FeedbackViewPage.js

import { expect } from "@playwright/test";

export class FeedbackViewPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок страницы "Фидбек"
    this.heading = this.page
      .locator("h1, h2")
      .filter({ hasText: /Фидбек/i })
      .first();

    // Тело фидбека
    this.body = this.page.locator('[class*="Feedback_body__"]').first();

    // Вкладка "Участники"
    this.participantsTab = this.page
      .getByRole("button", { name: "Участники" })
      .first();

    // Элемент "Все сотрудники компании" на вкладке "Участники"
    this.allCompanyMember = this.page
      .locator("b", { hasText: /Все сотрудники компании/i })
      .first();
  }

  /** Проверить, что открыта карточка фидбека */
  async assertOpened() {
    await this._step("Открыта карточка фидбека", async () => {
      await this.heading.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      // URL вида /feedbacks/123/
      await expect(this.page).toHaveURL(/\/feedbacks\/\d+\/?/);

      await this.body.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /** Проверить, что текст в теле фидбека содержит подстроку */
  async assertBodyContains(text) {
    await this._step("Проверить текст фидбека", async () => {
      await this.body.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.body).toContainText(text);
    });
  }

  /** Открыть вкладку "Участники" */
  async openParticipantsTab() {
    await this._step('Открыть вкладку "Участники"', async () => {
      await this.participantsTab.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.participantsTab.click();
    });
  }

  /** Проверить, что есть запись "Все сотрудники компании" */
  async assertAllCompanyMemberVisible() {
    await this._step(
      'Проверить, что виден блок "Все сотрудники компании"',
      async () => {
        await this.allCompanyMember.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(this.allCompanyMember).toBeVisible();
      },
    );
  }

  // ------- ВСПОМОГАТЕЛЬНОЕ -------
}
