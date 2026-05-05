// pages/LoginPage.js
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { getCredentials } from "../tests/utils/credentials.js";

export class LoginPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.emailInput = this.page.locator("#form-login-email");
    this.passwordInput = this.page.locator("#form-login-password");
    this.emailSubmit = this.page.locator(
      'form:has(#form-login-email) button[type="submit"]',
    );
    this.passwordSubmit = this.page.locator(
      'form:has(#form-login-password) button[type="submit"]',
    );

    this.h1Todos = this.page.getByRole("heading", {
      level: 1,
      name: /Список дел/i,
    });

    // Альтернативные методы входа
    this.googleAuthButton = this.page.getByRole("button", {
      name: /Войти через Google/i,
    });
    this.ssoLink = this.page.getByText(/Войти через SSO/i).first();

    // Ссылки
    this.forgotPasswordLink = this.page.getByText(/Забыли пароль\??/i).first();
    this.privacyPolicyLink = this.page.getByRole("link", {
      name: /Политика конфиденциальности/i,
    });
    this.termsLink = this.page.getByRole("link", {
      name: /Условия обслуживания/i,
    });

    // Сообщения об ошибках
    this.errorMessage = this.page
      .locator('[class*="error"], [class*="Error"], [role="alert"]')
      .first();

    // Ссылка/кнопка "Назад" (возврат к email)
    this.backButton = this.page.getByText(/^Назад$/i).first();
  }

  async goto() {
    await this._step("Открыть страницу логина", async () => {
      const base = process.env.BASE_URL || process.env.STAND_URL;
      if (!base) {
        throw new Error("BASE_URL или STAND_URL не заданы в .env");
      }

      const normalizedBase = base.replace(/\/$/, "");
      const hasLoginPath = /\/login($|[/?#])/i.test(normalizedBase);
      const loginUrl = hasLoginPath
        ? normalizedBase
        : `${normalizedBase}/ru/login`;

      await this.page.goto(loginUrl, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUTS.EXTRA_LONG,
      });
      await this.emailInput.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  async login(email, password, options = {}) {
    // Fallback to centralized credentials if not provided
    if (!email || !password) {
      const role = options.role || "admin";
      const creds = getCredentials(role);
      email = email || creds.email;
      password = password || creds.password;
    }

    // Если фикстура передала undefined – подставляем креды по умолчанию (админ)
    let finalEmail = email;
    let finalPassword = password;

    if (typeof finalEmail !== "string" || typeof finalPassword !== "string") {
      // Приоритетно ADMIN_*, затем старые LOGIN/PASSWORD (на всякий случай)
      finalEmail = process.env.ADMIN_LOGIN ?? process.env.LOGIN;
      finalPassword = process.env.ADMIN_PASSWORD ?? process.env.PASSWORD;
    }

    if (typeof finalEmail !== "string" || typeof finalPassword !== "string") {
      throw new Error(
        `[LoginPage.login] Не удалось получить логин/пароль. email=${String(
          finalEmail,
        )}, password=${String(
          finalPassword,
        )}. Проверь .env и фикстуру авторизации.`,
      );
    }

    await this._step("Ввод email и переход к паролю", async () => {
      await this.emailInput.fill(finalEmail);
      await this.emailSubmit.click();
      // Двухшаговая форма: ждём появления поля пароля после submit email
      await this.passwordInput.waitFor({ state: "visible", timeout: 15_000 });
    });

    await this._step("Ввод пароля и логин", async () => {
      await this.passwordInput.fill(finalPassword);
      await this.passwordSubmit.click();
    });
  }

  async assertLoggedIn() {
    await this._step("Проверка успешного логина", async () => {
      // Ждём что URL изменился с /login на домашнюю страницу
      // Увеличенный таймаут 90 секунд для медленных серверов
      await this.page.waitForURL(
        /\/(ru\/)?(profile|dashboard|objectives|surveys|feedback|todos|$)/,
        {
          timeout: 90_000,
        },
      );
      await this.page.waitForLoadState("domcontentloaded", {
        timeout: TIMEOUTS.LONG,
      });

      // Проверяем что мы НЕ на странице логина
      const stillOnLogin = await this.emailInput
        .waitFor({ state: "visible", timeout: 1000 })
        .then(() => true)
        .catch(() => false);
      if (stillOnLogin) {
        throw new Error(
          "[assertLoggedIn] Логин не удался - всё ещё на странице входа",
        );
      }

      // Проверяем что мы залогинены - ищем заголовок "Список дел" или навигационное меню
      const hasH1 = await this.h1Todos
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .then(() => true)
        .catch(() => false);

      if (!hasH1) {
        // Альтернативная проверка - ищем боковое меню или профиль пользователя
        const navMenu = this.page
          .locator('nav, [class*="SideMenu"], [class*="Navigation"]')
          .first();
        const profileLink = this.page.locator('a[href*="/profile/"]').first();

        const hasNav = await navMenu
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);
        const hasProfile = await profileLink
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);

        if (!hasNav && !hasProfile) {
          // Последняя попытка - ищем любой элемент приложения
          const anyAppElement = this.page
            .locator(
              '[class*="App"], [class*="Layout"], main, [class*="Container"]',
            )
            .first();
          try {
            await anyAppElement.waitFor({
              state: "visible",
              timeout: TIMEOUTS.LONG,
            });
          } catch {
            // Всё ещё не удалось - проверяем URL
            const currentUrl = this.page.url();
            if (currentUrl.includes("/login")) {
              throw new Error(
                "[assertLoggedIn] Логин не удался - URL всё ещё содержит /login",
              );
            }
            // Если URL изменился - считаем что логин успешен
          }
        }
      }
    });
  }

  /**
   * Ввод email и клик "Продолжить" (без ввода пароля)
   * @param {string} email
   */
  async submitEmail(email) {
    await this._step(`Ввод email: ${email}`, async () => {
      await this.emailInput.fill(email);
      await this.emailSubmit.click();
    });
  }

  /**
   * Проверка что шаг с паролем отображается
   */
  async assertPasswordStepVisible() {
    await this._step("Проверка отображения шага с паролем", async () => {
      await this.passwordInput.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      await this.passwordSubmit.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /**
   * Проверка сообщения об ошибке
   * @param {string|RegExp} [expectedText] - Ожидаемый текст ошибки (опционально)
   */
  async assertErrorVisible(expectedText) {
    await this._step("Проверка сообщения об ошибке", async () => {
      await this.errorMessage.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      if (expectedText) {
        const text = await this.errorMessage.textContent();
        const matches =
          expectedText instanceof RegExp
            ? expectedText.test(text)
            : text.includes(expectedText);
        if (!matches) {
          throw new Error(
            `Ожидался текст ошибки "${expectedText}", получен "${text}"`,
          );
        }
      }
    });
  }

  /**
   * Проверка что мы остались на странице логина (логин не удался)
   */
  async assertStillOnLoginPage() {
    await this._step("Проверка что остались на странице логина", async () => {
      const url = this.page.url();
      if (!url.includes("/login")) {
        throw new Error(`Ожидалось остаться на /login, но URL: ${url}`);
      }
    });
  }

  /**
   * Клик по ссылке "Забыли пароль?"
   */
  async clickForgotPassword() {
    await this._step('Клик по "Забыли пароль?"', async () => {
      await this.forgotPasswordLink.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      await this.forgotPasswordLink.click();
    });
  }

  /**
   * Клик по кнопке "Войти через Google"
   */
  async clickGoogleAuth() {
    await this._step('Клик по "Войти через Google"', async () => {
      await this.googleAuthButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      await this.googleAuthButton.click();
    });
  }

  /**
   * Проверка что SSO-экран (форма ввода корпоративного email) отображается
   */
  async assertSSOScreenVisible() {
    await this._step("Проверка отображения SSO-экрана", async () => {
      await this.emailInput.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      await this.emailSubmit.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /**
   * Клик по ссылке "Войти через SSO"
   */
  async clickSSO() {
    await this._step('Клик по "Войти через SSO"', async () => {
      await this.ssoLink.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      await this.ssoLink.click();
    });
  }

  /**
   * Проверка отображения формы восстановления пароля
   */
  async assertPasswordRecoveryVisible() {
    await this._step("Проверка отображения формы восстановления пароля", async () => {
      const recoveryHeading = this.page
        .getByText(/Восстановление пароля/i)
        .first();
      const recoveryButton = this.page.getByRole("button", {
        name: /Восстановить пароль/i,
      });

      await recoveryHeading.waitFor({ state: "visible", timeout: 10000 });
      await recoveryButton.waitFor({ state: "visible", timeout: 5000 });
    });
  }

  /**
   * Проверка отображения SSO-формы (заголовок + корп. email)
   */
  async assertSSOFormVisible() {
    await this._step("Проверка отображения SSO-формы", async () => {
      const ssoHeading = this.page.getByText(/Войти.*через SSO/i).first();
      const ssoEmailLabel = this.page.getByText(/Корпоративный e-mail/i).first();

      await ssoHeading.waitFor({ state: "visible", timeout: 10000 });
      await ssoEmailLabel.waitFor({ state: "visible", timeout: 5000 });
    });
  }

  /**
   * Клик по кнопке "Назад" (возврат к email)
   */
  async clickBack() {
    await this._step('Клик по кнопке "Назад"', async () => {
      await this.backButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      await this.backButton.click();
    });
  }

  /**
   * Проверка что кнопка "Назад" существует
   * @returns {Promise<boolean>}
   */
  async hasBackButton() {
    return this.backButton
      .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
      .then(() => true)
      .catch(() => false);
  }
}
