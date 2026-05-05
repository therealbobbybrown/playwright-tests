// pages/DevelopmentPlansSettingsPage.js
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

export class DevelopmentPlansSettingsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Кнопка "Включить/Выключить планы развития" (любой из вариантов)
    this.toggleButton = this.page.getByRole("button", {
      name: /планы развития/i,
    });

    this.enableButton = this.page.getByRole("button", {
      name: "Включить планы развития",
    });

    this.disableButton = this.page.getByRole("button", {
      name: "Выключить планы развития",
    });
  }

  async assertOpened() {
    await this._step(
      'Проверить, что открыта страница "Настроить планы развития"',
      async () => {
        await this.page.waitForURL(/\/development-plans-settings\/?/, {
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });

        await this.toggleButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      },
    );
  }

  /** enabled | disabled */
  async getPlansState() {
    return this._step("Определить состояние планов развития", async () => {
      const text = (await this.toggleButton.innerText()).trim();
      if (text.includes("Выключить планы развития")) return "enabled";
      if (text.includes("Включить планы развития")) return "disabled";

      throw new Error(
        `Не удалось определить состояние планов развития по тексту кнопки: "${text}"`,
      );
    });
  }

  async clickEnable() {
    await this._step('Нажать "Включить планы развития"', async () => {
      await this.enableButton.click();
    });
  }

  async clickDisable() {
    await this._step('Нажать "Выключить планы развития"', async () => {
      await this.disableButton.click();
    });
  }

  async waitForEnabled() {
    await this._step(
      'Дождаться, что планы развития включены (есть кнопка "Выключить")',
      async () => {
        await this.disableButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
      },
    );
  }

  async waitForDisabled() {
    await this._step(
      'Дождаться, что планы развития выключены (есть кнопка "Включить")',
      async () => {
        await this.enableButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
      },
    );
  }

  /** Выключить планы развития, если они включены */
  async disablePlansIfEnabled() {
    await this._step(
      "Выключить планы развития, если они включены",
      async () => {
        const state = await this.getPlansState();
        if (state === "disabled") return;

        await this.clickDisable();
        await this.waitForDisabled();
      },
    );
  }
}
