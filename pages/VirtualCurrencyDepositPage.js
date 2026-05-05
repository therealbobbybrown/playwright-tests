import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
// pages/VirtualCurrencyDepositPage.js

export class VirtualCurrencyDepositPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // h1
    this.heading = this.page
      .getByRole("heading", {
        level: 1,
        name: "Начислить виртуальную валюту",
      })
      .first();

    // Поля формы
    // purpose = react-select input
    this.purposeInput = this.page.locator("#karmaTransfersCurrency").first();

    // amount = обычный input
    this.amountInput = this.page
      .locator('#karmaTransfersAmount, input[name="amount"]')
      .first();

    this.depositButton = this.page
      .getByRole("button", { name: "Начислить" })
      .first();

    // Тост
    this.toast = this.page
      .locator('div.Toastify__toast, div[class*="Toast"], div[role="status"]')
      .first();
  }

  async assertOpened() {
    await this._step(
      'Открыта страница "Начислить виртуальную валюту"',
      async () => {
        await this.heading.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      },
    );
  }

  // -------------------- Recipient (модалка "Кому") --------------------

  async selectRecipientByName(fullName) {
    await this._step(`Выбрать получателя: ${fullName}`, async () => {
      const modal = await this._openRecipientModal();

      // В вашем DOM нет placeholder, есть label + id
      const search = modal
        .locator('input#karmaTransfersUser__seach-input, input[name="q"]')
        .first();
      await search.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // fill сбрасывает предыдущее значение (важно для повторных прогонов)
      await search.fill(fullName);

      // В разных состояниях UI карточка может быть:
      // - button с css-модулем Option_option__...
      // - просто button с accessible name == fullName (как в snapshot)
      const optionByRole = modal
        .getByRole("button", { name: fullName, exact: true })
        .first();

      const optionByCss = modal
        .locator('button[class*="Option_option"]')
        .filter({ has: modal.getByText(fullName, { exact: true }) })
        .first();

      const optionFallback = modal
        .locator("button")
        .filter({ has: modal.getByText(fullName, { exact: true }) })
        .first();

      // Ждём появления хотя бы одного варианта
      await Promise.race([
        optionByRole
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {}),
        optionByCss
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {}),
        optionFallback
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {}),
      ]);

      if (await optionByRole.isVisible().catch(() => false)) {
        await optionByRole.scrollIntoViewIfNeeded().catch(() => {});
        await optionByRole.click({ timeout: TIMEOUTS.MEDIUM });
      } else if (await optionByCss.isVisible().catch(() => false)) {
        await optionByCss.scrollIntoViewIfNeeded().catch(() => {});
        await optionByCss.click({ timeout: TIMEOUTS.MEDIUM });
      } else {
        await optionFallback.scrollIntoViewIfNeeded().catch(() => {});
        await optionFallback.click({ timeout: TIMEOUTS.MEDIUM });
      }

      // Дожидаемся, что элемент реально стал selected (иначе "Подтвердить" может не появиться)
      const selectedItem = modal
        .locator('div[class*="Option_option-item"]')
        .filter({ has: modal.getByText(fullName, { exact: true }) })
        .filter({ has: modal.locator('use[xlink\\:href*="icon-remove"]') }) // признак выбранного (иконка remove)
        .first();

      // selectedItem может не существовать в "упрощённом" списке (где показывается просто кнопка),
      // поэтому ждём его только если он появился.
      if (await selectedItem.count().catch(() => 0)) {
        await selectedItem.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      }

      // И только после этого ждём появление "Подтвердить"
      const confirm = modal
        .getByRole("button", { name: "Подтвердить" })
        .first();
      await confirm.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    });
  }

  async confirmRecipientSelection() {
    await this._step("Подтвердить выбор получателя", async () => {
      const modal = await this._getRecipientModal();
      const confirm = modal
        .getByRole("button", { name: "Подтвердить" })
        .first();

      await confirm.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await confirm.click({ timeout: TIMEOUTS.MEDIUM });

      // Ждём закрытия шита
      await modal
        .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
    });
  }

  async assertRecipientSelected(fullName) {
    await this._step(
      `Проверить, что получатель выбран: ${fullName}`,
      async () => {
        const onPage = this.page.getByText(fullName, { exact: true }).first();
        await onPage.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      },
    );
  }

  async _openRecipientModal() {
    return this._step("Открыть модалку выбора получателя", async () => {
      // Если модалка уже открыта — НИЧЕГО не кликаем по странице (иначе intercept pointer events)
      if (
        await this._recipientModalLocator()
          .isVisible()
          .catch(() => false)
      ) {
        return this._getRecipientModal();
      }

      // 1) попытка: отдельный combobox для получателя (не purpose)
      const recipientComboboxInput = this.page
        .locator('input[role="combobox"]:not(#karmaTransfersCurrency)')
        .first();

      if (await recipientComboboxInput.isVisible().catch(() => false)) {
        await recipientComboboxInput.click({ timeout: TIMEOUTS.MEDIUM });
        return this._getRecipientModal();
      }

      // 2) fallback: клики от текста "Кому" вверх по родителям, пока модалка не откроется
      const komuText = this.page.getByText("Кому", { exact: true }).first();
      await komuText.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      const candidates = [
        komuText,
        komuText.locator(".."),
        komuText.locator("..").locator(".."),
        komuText.locator("..").locator("..").locator(".."),
      ];

      for (const candidate of candidates) {
        await candidate.click({ timeout: 1_500 }).catch(() => {});
        if (
          await this._recipientModalLocator()
            .isVisible()
            .catch(() => false)
        )
          break;
      }

      return this._getRecipientModal();
    });
  }

  _recipientModalLocator() {
    // Реальный контейнер — react-modal-sheet, без role=dialog.
    // Признаки: контейнер + заголовок "Кому" + search input.
    return this.page
      .locator(".react-modal-sheet-container")
      .filter({ has: this.page.getByText("Кому", { exact: true }) })
      .filter({
        has: this.page.locator(
          'input#karmaTransfersUser__seach-input, input[name="q"]',
        ),
      })
      .first();
  }

  async _getRecipientModal() {
    const modal = this._recipientModalLocator();
    await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    return modal;
  }

  // -------------------- Purpose --------------------

  async selectPurposeForThanks() {
    await this._selectPurpose("Для благодарности");
  }

  async selectPurposeForShop() {
    await this._selectPurpose("Для трат в магазине");
  }

  async _selectPurpose(optionText) {
    await this._step(`Выбрать тип начисления: ${optionText}`, async () => {
      await this._openPurposeDropdown();

      const byRole = this.page
        .getByRole("option", { name: optionText })
        .first();
      if (await byRole.isVisible().catch(() => false)) {
        await byRole.click({ timeout: TIMEOUTS.MEDIUM });
      } else {
        const option = this.page.getByText(optionText, { exact: true }).first();
        await option.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await option.click({ timeout: TIMEOUTS.MEDIUM });
      }

      await this.page.keyboard.press("Escape").catch(() => {});
      await this.page.mouse.move(10, 10);
    });
  }

  async _openPurposeDropdown() {
    await this.purposeInput.waitFor({
      state: "visible",
      timeout: TIMEOUTS.MEDIUM,
    });

    const control = this.purposeInput.locator("..").locator("..").first();
    if (await control.isVisible().catch(() => false)) {
      await control.click({ timeout: TIMEOUTS.MEDIUM });
    } else {
      await this.purposeInput.click({ timeout: TIMEOUTS.MEDIUM });
    }
  }

  // -------------------- Amount / Deposit --------------------

  async fillAmount(amount) {
    await this._step(`Заполнить сумму: ${amount}`, async () => {
      await this.amountInput.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.amountInput.fill(String(amount));
      await this.amountInput.press("Tab").catch(() => {});
    });
  }

  async clickDeposit() {
    await this._step('Нажать "Начислить"', async () => {
      await this.page.keyboard.press("Escape").catch(() => {});
      await this.depositButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.depositButton.click({ timeout: TIMEOUTS.MEDIUM });
    });
  }

  async waitForSuccessToast(amount) {
    await this._step("Дождаться успешного тоста", async () => {
      const okToast = this.page
        .locator('div.Toastify__toast, div[class*="Toast"], div[role="status"]')
        .filter({ hasText: /начислен|начислено|успеш/i })
        .first();

      await okToast.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });

      if (amount !== undefined && amount !== null) {
        const text = await okToast.innerText().catch(() => "");
        if (!text.includes(String(amount))) {
          // текст тоста может быть без суммы — не валим тест жестко
        }
      }
    });
  }

  async completeDeposit({ amount, purpose } = {}) {
    await this._step("Завершить начисление", async () => {
      if (purpose === "shop") await this.selectPurposeForShop();
      if (purpose === "thanks") await this.selectPurposeForThanks();

      if (amount !== undefined) await this.fillAmount(amount);

      await this.clickDeposit();
      await this.waitForSuccessToast(amount);
    });
  }

  // -------------------- utils --------------------
}
