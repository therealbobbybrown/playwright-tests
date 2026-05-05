import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
// pages/SurveyTemplatePage.js

export class SurveyTemplatePage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Ссылка "Использовать шаблон"
    this.useTemplateLink = this.page.getByRole("link", {
      name: "Использовать шаблон",
    });
  }

  async assertOpened() {
    await this._step("Страница шаблона опроса открыта", async () => {
      await this.useTemplateLink.first().waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  async clickUseTemplate() {
    await this._step('Нажать "Использовать шаблон"', async () => {
      await Promise.all([
        // После клика можем попасть либо на /add/?templateId=...,
        // либо сразу на /surveys/{id}/
        this.page.waitForURL(/\/manager\/company\/surveys\/(add\/|[0-9]+\/?)/, {
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        }),
        this.useTemplateLink.first().click(),
      ]);
    });
  }
}
