// pages/ObjectivesSettingsPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

export class ObjectivesSettingsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.title = this.page.getByRole("heading", {
      level: 1,
      name: "Настройки целей",
    });

    this.enableOkrButton = this.page.getByRole("button", {
      name: "Включить цели OKR",
    });
    this.disableOkrButton = this.page.getByRole("button", {
      name: "Выключить цели OKR",
    });

    // Утверждение целей (DEVAPR-11722)
    // Чекбокс привязан к секции "Утверждение целей" — не брать page.getByRole('checkbox') глобально
    this.approvalSection = this.page.locator('h2').filter({ hasText: 'Утверждение целей' }).locator('..');
    this.approvalCheckbox = this.approvalSection.getByRole('checkbox');
    this.approvalLabel = this.page.locator('[class*="ObjectivesSettings"], [class*="Settings"]')
      .filter({ has: this.approvalCheckbox })
      .locator('span, label, div')
      .filter({ hasText: /утверждение целей/i })
      .first();
    this.approvalVideoSection = this.page.getByText('Подробно о процессе утверждения целей:');
  }

  async assertOpened() {
    await this._step('Проверка страницы "Настройки целей"', async () => {
      // Network idle может не наступить из-за фоновых запросов, поэтому ждём DOM
      // и даём короткий best-effort на idle, затем проверяем заголовок.
      await this.page
        .waitForLoadState("domcontentloaded", {
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        })
        .catch(() => {});
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});
      await this.title.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /** Возвращает 'enabled' или 'disabled' */
  async getOkrState() {
    const disableVisible = await this.disableOkrButton
      .isVisible()
      .catch(() => false);
    if (disableVisible) return "enabled";

    const enableVisible = await this.enableOkrButton
      .isVisible()
      .catch(() => false);
    if (enableVisible) return "disabled";

    throw new Error("Не удалось определить состояние OKR-кнопки");
  }

  async clickEnable() {
    await this._step('Нажать "Включить цели OKR"', async () => {
      await this.enableOkrButton.click();
    });
  }

  async clickDisable() {
    await this._step('Нажать "Выключить цели OKR"', async () => {
      await this.disableOkrButton.click();
    });
  }

  async waitForEnabled() {
    await this._step("Дождаться состояния OKR: включены", async () => {
      await this.disableOkrButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  async waitForDisabled() {
    await this._step("Дождаться состояния OKR: выключены", async () => {
      await this.enableOkrButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /** Удобные обёртки, с проверкой статуса перед кликом */
  async enableOkrIfDisabled() {
    await this._step("Включить OKR, если они выключены", async () => {
      const state = await this.getOkrState();
      if (state === "enabled") return;
      await this.clickEnable();
      await this.waitForEnabled();
    });
  }

  async disableOkrIfEnabled() {
    await this._step("Выключить OKR, если они включены", async () => {
      const state = await this.getOkrState();
      if (state === "disabled") return;
      await this.clickDisable();
      await this.waitForDisabled();
    });
  }

  /** Проверить что утверждение включено */
  async assertApprovalEnabled() {
    await this._step('Проверить что утверждение целей включено', async () => {
      await expect(this.approvalCheckbox).toBeChecked();
      const labelText = this.page.locator('span, div').filter({ hasText: /выключить утверждение целей/i }).first();
      await expect(labelText).toBeVisible();
    });
  }

  /** Проверить что утверждение выключено */
  async assertApprovalDisabled() {
    await this._step('Проверить что утверждение целей выключено', async () => {
      await expect(this.approvalCheckbox).not.toBeChecked();
      const labelText = this.page.locator('span, div').filter({ hasText: /включить утверждение целей/i }).first();
      await expect(labelText).toBeVisible();
    });
  }

  /** Включить утверждение целей (если выключено) */
  async enableApproval() {
    await this._step('Включить утверждение целей', async () => {
      const isChecked = await this.approvalCheckbox.isChecked().catch(() => false);
      if (isChecked) return;
      await this.approvalCheckbox.click();
      // Дождаться тоста "Настройки сохранены"
      await this.page.getByText('Настройки сохранены').first().waitFor({ state: 'visible', timeout: TIMEOUTS.MEDIUM });
    });
  }

  /** Выключить утверждение целей (если включено) */
  async disableApproval() {
    await this._step('Выключить утверждение целей', async () => {
      const isChecked = await this.approvalCheckbox.isChecked().catch(() => false);
      if (!isChecked) return;
      await this.approvalCheckbox.click();
      // Всегда появляется попап подтверждения — ждём его с достаточным таймаутом
      const confirmBtn = this.page.getByRole('dialog').getByRole('button', { name: /выключить/i }).last();
      await confirmBtn.waitFor({ state: 'visible', timeout: TIMEOUTS.ELEMENT_VISIBLE });
      await confirmBtn.click();
      // Ждём закрытия диалога перед поиском тоста
      await this.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: TIMEOUTS.ELEMENT_VISIBLE });
      await this.page.getByText('Настройки сохранены').first().waitFor({ state: 'visible', timeout: TIMEOUTS.MEDIUM });
    });
  }

  /** Получить текущее состояние утверждения */
  async getApprovalState() {
    const isChecked = await this.approvalCheckbox.isChecked().catch(() => false);
    return isChecked ? 'enabled' : 'disabled';
  }

  /** Проверить видимость видео секции */
  async assertVideoSectionVisible() {
    await this._step('Проверить видимость видео секции', async () => {
      await expect(this.approvalVideoSection).toBeVisible();
    });
  }
}
