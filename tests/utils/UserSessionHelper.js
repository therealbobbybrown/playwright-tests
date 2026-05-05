// tests/utils/UserSessionHelper.js
// Хелпер для управления сессиями разных пользователей в E2E тестах
import { LoginPage } from "../../pages/LoginPage.js";
import { TEST_DATA } from "./constants.js";
import { TokenManager, InvalidPasswordError } from "./auth/TokenManager.js";

/**
 * Хелпер для выполнения действий под разными пользователями
 * Создаёт отдельный browser context для каждого пользователя
 */
export class UserSessionHelper {
  /**
   * @param {import('@playwright/test').Browser} browser
   * @param {import('@playwright/test').TestInfo} testInfo
   */
  constructor(browser, testInfo) {
    this.browser = browser;
    this.testInfo = testInfo;
    this.baseUrl = process.env.BASE_URL;

    if (!this.baseUrl) {
      throw new Error("BASE_URL не задан в .env");
    }
  }

  /**
   * Выполнить действие под указанным пользователем
   * Создаёт новый контекст браузера, логинится, выполняет действие и закрывает контекст
   *
   * @param {Object} user - Объект пользователя {name, email}
   * @param {string} [password] - Пароль (по умолчанию TEST_DATA.DEFAULT_PASSWORD)
   * @param {(page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext) => Promise<T>} action - Функция для выполнения
   * @returns {Promise<T>}
   * @template T
   */
  async runAs(user, password, action) {
    // Если password - функция, значит он пропущен
    if (typeof password === "function") {
      action = password;
      password = TEST_DATA.DEFAULT_PASSWORD;
    }

    const context = await this.browser.newContext();
    const page = await context.newPage();

    const debugAuth = process.env.AUTH_DEBUG === "1";

    try {
      let loggedIn = false;

      // Быстрый путь: API signIn → cookie injection → single navigation
      const authStart = Date.now();
      const loginOptions = user.userId ? { targetUserId: user.userId } : {};
      try {
        loggedIn = await TokenManager.loginViaApi(
          page,
          user.email,
          password,
          loginOptions,
        );
        if (loggedIn && debugAuth)
          console.log(
            `[runAs] ${user.name}: API OK (${Date.now() - authStart}ms)`,
          );
      } catch (e) {
        // InvalidPasswordError — неверный пароль, UI fallback бесполезен
        if (e instanceof InvalidPasswordError) {
          throw e;
        }
        console.warn(
          `[runAs] ${user.name}: API error: ${e.message}, fallback to UI`,
        );
      }

      // Fallback: очистка + полный UI логин (с retry)
      if (!loggedIn) {
        if (debugAuth)
          console.log(`[runAs] ${user.name}: API → /login, fallback UI`);
        const MAX_UI_ATTEMPTS = 2;
        for (let attempt = 1; attempt <= MAX_UI_ATTEMPTS; attempt++) {
          await context.clearCookies();
          try {
            await page.evaluate(() => localStorage.removeItem("fingerPrint"));
          } catch {}
          const loginPage = new LoginPage(page, this.testInfo);
          try {
            await loginPage.goto();
            await loginPage.login(user.email, password);
            await loginPage.assertLoggedIn();
            break; // success
          } catch (e) {
            if (attempt === MAX_UI_ATTEMPTS) throw e;
            console.warn(
              `[runAs] ${user.name}: UI attempt ${attempt}/${MAX_UI_ATTEMPTS} failed: ${e.message}, retrying…`,
            );
          }
        }
      }

      return await action(page, context);
    } finally {
      await context.close();
    }
  }

  /**
   * Выполнить действие под несколькими пользователями последовательно
   *
   * @param {Array<{user: Object, action: Function}>} tasks - Массив задач
   * @param {string} [password] - Общий пароль для всех
   */
  async runSequentially(tasks, password = TEST_DATA.DEFAULT_PASSWORD) {
    for (const task of tasks) {
      await this.runAs(task.user, password, task.action);
    }
  }
}

/**
 * Проверить пароль одного пользователя через API signIn.
 * Не создаёт браузерный контекст — использует только HTTP запрос.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<boolean>} true если пароль верный
 */
async function checkPassword(email, password) {
  const apiBaseUrl = process.env.API_BASE_URL;
  if (!apiBaseUrl) return true; // без API_BASE_URL нельзя проверить — пропускаем

  const { createHash } = await import("crypto");
  const fingerPrint = createHash("md5")
    .update(Date.now().toString() + email)
    .digest("hex");

  try {
    const resp = await fetch(`${apiBaseUrl}/auth/account/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, fingerPrint, permissions: [] }),
    });
    return resp.ok;
  } catch {
    return true; // при сетевой ошибке — оптимистично пропускаем
  }
}

/** Пользователи с уникальными паролями — нельзя использовать в сценариях */
const EXCLUDED_EMAILS = new Set(["excludeduser+976@example.org"]);

/**
 * Отфильтровать пользователей, у которых пароль невалиден.
 * Полезно перед назначением ролей, чтобы runAs не падал на invalidPassword.
 *
 * @param {Array<{name: string, email: string}>} users
 * @param {string} [password] - пароль для проверки (по умолчанию TEST_USER_PASSWORD)
 * @returns {Promise<Array<{name: string, email: string}>>} только валидные пользователи
 */
export async function filterValidUsers(
  users,
  password = TEST_DATA.DEFAULT_PASSWORD,
) {
  const filtered = users.filter((user) => {
    if (EXCLUDED_EMAILS.has(user.email)) {
      console.warn(
        `[filterValidUsers] ⛔ ${user.name} (${user.email}) — в блоклисте, исключён`,
      );
      return false;
    }
    return true;
  });

  const results = await Promise.all(
    filtered.map(async (user) => {
      const valid = await checkPassword(user.email, password);
      if (!valid) {
        console.warn(
          `[filterValidUsers] ⚠️ ${user.name} (${user.email}) — неверный пароль, исключён`,
        );
      }
      return { user, valid };
    }),
  );
  return results.filter((r) => r.valid).map((r) => r.user);
}

/**
 * Создать экземпляр UserSessionHelper
 * @param {import('@playwright/test').Browser} browser
 * @param {import('@playwright/test').TestInfo} testInfo
 */
export function createUserSession(browser, testInfo) {
  return new UserSessionHelper(browser, testInfo);
}
