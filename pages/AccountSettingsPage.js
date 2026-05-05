// pages/AccountSettingsPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";

export class AccountSettingsPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.headerAvatarButton = this.page
      .locator("button", {
        has: this.page.locator('span[class*="Header_userAvatar"]'),
      })
      .first();

    this.manageAccountLink = this.page
      .getByRole("link", { name: /Управление аккаунтом/i })
      .first();

    this.sectionTitle = (nameRe) =>
      this.page
        .locator('div[class*="Section_section-title__"]')
        .or(this.page.getByText(nameRe))
        .filter({ hasText: nameRe })
        .first();

    this.applicationSectionTitle = this.sectionTitle(
      /^(Настройки приложения|Application settings)$/i,
    );

    this.emailRowTitle = this.page.getByText(/^Ваш e-mail$/i).first();
    this.telegramRowTitle = this.page.getByText(/^Telegram$/i).first();
    this.languageRowTitle = this.page.getByText(/^Язык$/i).first();
    this.changePasswordLink = this.page
      .locator('a[href*="/profile/settings/password"]')
      .first();

    // Ищем строку с "Язык" и рядом "Русский" или "English"
    this.languageRowTitle = this.page.getByText(/^(Язык|Language)$/i).first();

    // Значение языка — текст "Русский" или "English" — sibling после "Язык"
    this.languageValue = this.page.getByText(/^(Русский|English)$/i).first();

    // Кнопка открытия модалки — ближайшая button после строки с языком
    // Используем xpath: находим элемент "Язык", поднимаемся к контейнеру и ищем button
    this.languageChangeButton = this.page
      .locator("div")
      .filter({ hasText: /^(Язык|Language)$/ })
      .filter({ hasText: /^(Русский|English)$/ })
      .locator(
        "xpath=ancestor::div[1]/following-sibling::button | ancestor::div[2]//button",
      )
      .first();

    this.notificationsSection = this.sectionTitle("Настройки уведомлений");
    this.notificationsBlock = (name) =>
      this.page
        .locator('div[class*="SettingsBlock_container"]')
        .filter({ has: this.page.getByText(new RegExp(`^${name}$`, "i")) })
        .first();

    this.pushToggler = this.page
      .locator('input[name="push-notifications-toggler"]')
      .first();

    this.usersSection = this.sectionTitle("Управление пользователями");
    this.userCard = this.page.locator('div[class*="UserItem_user__"]').first();
    this.logoutItemTitle = this.page.getByText(/^Выйти$/i).first();

    this.localeSheet = this.page
      .locator('div[class*="SheetModal_content__"]')
      .first();
    this.localeButton = (code) =>
      this.page
        .locator('button[class*="Locale_button__"][data-locale="' + code + '"]')
        .first();
    this.selectedLocaleButton = this.page
      .locator('button[class*="Locale_button--selected__"]')
      .first();
  }

  /** Открыть "Управление аккаунтом" через аватар в шапке */
  async openFromHeader() {
    await this._step(
      'Открыть "Управление аккаунтом" через аватар в шапке',
      async () => {
        await this.headerAvatarButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.headerAvatarButton.scrollIntoViewIfNeeded();
        await this.headerAvatarButton.click();

        await this.manageAccountLink
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(async () => {
            // иногда меню не открылось с первого клика
            await this.headerAvatarButton.click().catch(() => null);
            await this.manageAccountLink.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
          });

        await Promise.all([
          this.page
            .waitForURL(URL_PATTERNS.ACCOUNT_SETTINGS, {
              timeout: TIMEOUTS.URL_CHANGE,
            })
            .catch(() => null),
          this.manageAccountLink.click(),
        ]);

        await this.page
          .waitForLoadState("domcontentloaded", {
            timeout: TIMEOUTS.URL_CHANGE,
          })
          .catch(() => null);

        // fallback: если заголовок не появился, пробуем прямой переход
        try {
          await this.sectionTitle("Аккаунт").waitFor({
            state: "visible",
            timeout: TIMEOUTS.PAGE_LOAD,
          });
        } catch {
          await this.page.goto("/ru/profile/settings/", {
            waitUntil: "domcontentloaded",
          });
          await this.sectionTitle("Аккаунт").waitFor({
            state: "visible",
            timeout: TIMEOUTS.PAGE_LOAD,
          });
        }
      },
    );
  }

  /** Проверить основные секции и элементы управления аккаунтом */
  async assertSettingsUi() {
    await this._step(
      "Управление аккаунтом: проверить разделы и ключевые элементы",
      async () => {
        await this.sectionTitle("Аккаунт").waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        await this.emailRowTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.telegramRowTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await this.sectionTitle("Настройки приложения").waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        await this.languageRowTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.changePasswordLink.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await this.notificationsSection.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        const notifNames = [
          "Фидбек",
          "Опросы",
          "Оценка сотрудников",
          "Цели",
          "Развитие",
        ];
        for (const name of notifNames) {
          const block = this.notificationsBlock(name);
          await block.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        }
        await this.pushToggler.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        const pushType = await this.pushToggler.getAttribute("type");
        expect(pushType).toBe("checkbox");

        await this.usersSection.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
        await this.userCard.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.logoutItemTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      },
    );
  }

  /** Переключить язык на указанный код (ru/en) */
  async changeLanguage(targetCode) {
    await this._step(`Изменить язык на ${targetCode}`, async () => {
      await this._openLanguageModal();

      const targetBtn = this.localeButton(targetCode);
      await targetBtn.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // Проверяем, не выбран ли уже этот язык (у выбранной кнопки pointer-events: none)
      const isAlreadySelected = await targetBtn.evaluate((el) =>
        [...el.classList].some((c) => c.includes("button--selected")),
      );

      if (isAlreadySelected) {
        // Язык уже выбран — просто закрываем модалку
        await this.page.keyboard.press("Escape").catch(() => null);
        await this.localeSheet
          .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
          .catch(() => null);
        return;
      }

      await targetBtn.click();

      await this.localeSheet
        .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
        .catch(() => null);
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => null);
    });
  }

  /** Получить текущий код языка из выбранной кнопки в модалке */
  async getCurrentLocaleCode() {
    await this._openLanguageModal();

    const selected =
      await this.selectedLocaleButton.getAttribute("data-locale");

    await this.page.keyboard.press("Escape").catch(() => null);
    await this.localeSheet
      .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
      .catch(() => null);
    return selected;
  }

  /** Получить отображаемое значение языка в строке "Язык" */
  async getLanguageValueText() {
    const text = await this.languageValue.textContent({
      timeout: TIMEOUTS.MEDIUM,
    });
    return (text ?? "").trim();
  }

  /** Определить код языка по отображаемому значению */
  async getLanguageCodeFromValue() {
    const value = (await this.getLanguageValueText()).toLowerCase();
    if (value.includes("english") || value === "en") return "en";
    if (
      value.includes("русский") ||
      value.includes("russian") ||
      value === "ru"
    )
      return "ru";
    return "";
  }

  /** Подождать, пока отображаемый язык станет целевым (ru/en) */
  async waitForLanguageApplied(targetCode) {
    const targetText = targetCode === "en" ? "English" : "Русский";

    await expect
      .poll(async () => this.getLanguageValueText(), {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
        message: "Ожидаем обновление текста языка",
      })
      .toBe(targetText);

    await this.page
      .waitForFunction(
        (expected) => document.documentElement.lang === expected,
        targetCode,
        { timeout: TIMEOUTS.ELEMENT_VISIBLE },
      )
      .catch(() => null);
  }

  /** Открыть модалку выбора языка */
  async _openLanguageModal() {
    await this.applicationSectionTitle.waitFor({
      state: "visible",
      timeout: TIMEOUTS.URL_CHANGE,
    });

    await this.languageRowTitle.waitFor({
      state: "visible",
      timeout: TIMEOUTS.ELEMENT_VISIBLE,
    });
    await this.languageRowTitle.scrollIntoViewIfNeeded();

    // Находим кнопку рядом с "Язык" — она в соседнем div
    const langButton = this.page
      .locator("div")
      .filter({ has: this.languageRowTitle })
      .filter({ has: this.languageValue })
      .locator(
        'xpath=following-sibling::button | ../button | ancestor::div[contains(@class,"SectionItem")]/button',
      )
      .first();

    await langButton
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .catch(async () => {
        // fallback: ищем любую button после "Язык"
        await this.languageValue.scrollIntoViewIfNeeded().catch(() => null);
      });

    try {
      await langButton.click({ timeout: TIMEOUTS.SHORT });
    } catch {
      // Если не удалось найти button, кликаем на сам элемент с языком
      await this.languageValue.click({ timeout: TIMEOUTS.SHORT });
    }

    await this.localeSheet.waitFor({
      state: "visible",
      timeout: TIMEOUTS.MEDIUM,
    });
  }
}
