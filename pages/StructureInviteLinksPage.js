// pages/StructureInviteLinksPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { SideMenu } from "./SideMenu.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";

export class StructureInviteLinksPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.title = this.page
      .getByText("Пригласите сотрудников по ссылке")
      .first();
    this.description = this.page
      .getByText("Отправьте ссылку сотрудникам любым удобным способом.")
      .first();
    this.copyButton = this.page
      .locator('button[class*="StructureInviteLinks_create-button__"]')
      .filter({ hasText: /Скопировать ссылку-приглашение/i })
      .first();
    this.hint = this.page
      .locator('div[class*="StructureInviteLinks_hint__"]')
      .first();
  }

  async openFromSideMenu() {
    await this._step(
      'Открыть "Пригласить по ссылке" через боковое меню',
      async () => {
        const sideMenu = new SideMenu(this.page, this.testInfo);
        await sideMenu.openStructureInviteLinks();
        await this.assertOpened();
      },
    );
  }

  async assertOpened() {
    await this._step(
      "Проверить, что открыта страница приглашения по ссылке",
      async () => {
        await this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.LONG })
          .catch(() => null);
        await this.title.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.description.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.copyButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.hint.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });

        await this.page
          .waitForURL(URL_PATTERNS.STRUCTURE_INVITE_LINKS, {
            timeout: TIMEOUTS.SHORT,
          })
          .catch(() => null);
      },
    );
  }

  async assertMainElementsVisible() {
    await this._step(
      "Проверить основные элементы страницы приглашения",
      async () => {
        await expect(this.title).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        await expect(this.description).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(this.copyButton).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        await expect(this.hint).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      },
    );
  }

  async copyInviteLink() {
    await this._step('Нажать "Скопировать ссылку-приглашение"', async () => {
      await this.copyButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.copyButton.click();
    });
  }
}
