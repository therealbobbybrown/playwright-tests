// tests/fixtures/auth.js (ESM)
import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../../pages/LoginPage.js";
import { getCredentials, getWorkerAdminRole } from "../utils/credentials.js";
import {
  PerformanceReviewSeedHelper,
  ReviewAdminSeedHelper,
} from "../utils/seed/index.js";
import { TokenManager } from "../utils/auth/TokenManager.js";
import fs from "node:fs/promises";
import path from "node:path";

const AUTH_DIR = "test-results/.auth";

/**
 * Получить путь к файлу storageState для роли
 */
function getStorageStatePath(role) {
  return path.join(AUTH_DIR, `${role}.json`);
}

/**
 * Проверить авторизацию на странице (уже авторизован и токен не истёк)
 */
async function checkIfAlreadyLoggedIn(page) {
  const currentUrl = page.url();

  // Если уже на странице приложения (не логин) - проверяем cookie + валидность JWT
  if (!currentUrl.includes("/login") && !currentUrl.includes("about:blank")) {
    const cookiePrefix = process.env.AUTH_COOKIE_PREFIX || "staging_auth";
    const tokenCookieName = `${cookiePrefix}_access_token`;
    const cookies = await page.context().cookies();
    const tokenCookie = cookies.find((c) => c.name === tokenCookieName);
    if (!tokenCookie) return false;

    // Decode JWT exp and check it's still valid (with 2min buffer)
    try {
      const parts = tokenCookie.value.split(".");
      if (parts.length !== 3) return false;
      let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      const payload = JSON.parse(Buffer.from(b64, "base64").toString());
      if (payload.exp && payload.exp * 1000 - Date.now() < 2 * 60 * 1000) {
        return false; // token expires within 2 min — re-login
      }
    } catch {
      return false; // can't decode — re-login to be safe
    }

    return true;
  }

  return false;
}

/**
 * Основная функция авторизации с API fast path + UI fallback
 */
async function loginAs(page, testInfo, role = "admin") {
  const { email, password } = getCredentials(role);
  const debugAuth = process.env.AUTH_DEBUG === "1";

  if (debugAuth) {
    console.log(`[FX] loginAs(${role})`, email);
    page.on("console", (m) => console.log("[BROWSER]", m.type(), m.text()));
  }

  // 1. Проверяем не авторизован ли уже (для случая переиспользования контекста)
  if (await checkIfAlreadyLoggedIn(page)) {
    if (debugAuth) console.log("[FX] Already logged in, skipping login");
    return page;
  }

  // 2. Быстрый путь: API signIn → cookie injection → single navigation
  const authStart = Date.now();
  try {
    const ok = await TokenManager.loginViaApi(page, email, password);
    if (ok) {
      if (debugAuth) {
        console.log(`[loginAs] ${role}: API OK (${Date.now() - authStart}ms)`);
      }
      return page;
    }
    console.warn(
      `[loginAs] ${role}: API path → /login redirect, fallback to UI`,
    );
  } catch (e) {
    console.warn(`[loginAs] ${role}: API error: ${e.message}, fallback to UI`);
  }

  // 3. Fallback: очистка + полный UI логин (с retry)
  const MAX_UI_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_UI_ATTEMPTS; attempt++) {
    await page.context().clearCookies();
    try {
      await page.evaluate(() => localStorage.removeItem("fingerPrint"));
    } catch {}

    const loginPage = new LoginPage(page, testInfo);
    try {
      await loginPage.goto();
      await loginPage.login(email, password);
      await loginPage.assertLoggedIn();
      break; // success
    } catch (e) {
      if (attempt === MAX_UI_ATTEMPTS) throw e;
      console.warn(
        `[loginAs] ${role}: UI attempt ${attempt}/${MAX_UI_ATTEMPTS} failed: ${e.message}, retrying…`,
      );
    }
  }

  // 4. Сохраняем storageState для последующих тестов
  try {
    await fs.mkdir(AUTH_DIR, { recursive: true });
    await page.context().storageState({ path: getStorageStatePath(role) });
  } catch {}

  return page;
}

export const test = base.extend({
  // логин под админом (worker-aware: worker 0 → admin, worker 1 → admin2)
  adminAuth: async ({ page }, use, testInfo) => {
    const role = getWorkerAdminRole(testInfo.parallelIndex);
    await loginAs(page, testInfo, role);
    await use(page);
  },

  /**
   * Фикстура для логина под обычным пользователем.
   */
  userAuth: async ({ page }, use, testInfo) => {
    await loginAs(page, testInfo, "user");
    await use(page);
  },

  /**
   * Фикстура для логина под руководителем.
   */
  managerAuth: async ({ page }, use, testInfo) => {
    await loginAs(page, testInfo, "manager");
    await use(page);
  },

  // логин под head (только прямые подчинённые)
  headAuth: async ({ page }, use, testInfo) => {
    await loginAs(page, testInfo, "head");
    await use(page);
  },

  // логин под техподдержкой (частично заполненный профиль)
  supportAuth: async ({ page }, use, testInfo) => {
    await loginAs(page, testInfo, "support");
    await use(page);
  },

  /**
   * Performance Review Seed Helper для UI тестов
   * Позволяет искать/создавать тестовые данные через API
   */
  prSeed: async ({ request }, use, testInfo) => {
    const role = getWorkerAdminRole(testInfo.parallelIndex);
    const seedHelper = new PerformanceReviewSeedHelper(request);
    await seedHelper.init(role);
    await use(seedHelper);
  },

  /**
   * Фикстура для review_admin: seed (роль + назначение администратором PR) → login → cleanup.
   * Делает всё динамически через API, НЕ использует .env переменные для review_admin.
   *
   * В тесте доступно: page._reviewAdminSetup = { userId, roleId, prId, email, ... }
   */
  reviewAdminAuth: async ({ page, request }, use) => {
    const helper = new ReviewAdminSeedHelper(request);
    await helper.init("admin");

    let setupData = null;
    try {
      setupData = await helper.seedFullSetup();

      // Инвалидируем кеш токена — роли только что изменились
      TokenManager.invalidate(setupData.email);

      // Логин как review_admin через TokenManager (свежий signIn)
      const testUserPassword =
        process.env.TEST_USER_PASSWORD || "DemoPass_7421!";
      await TokenManager.loginViaApi(page, setupData.email, testUserPassword);

      // Добавить данные сетапа в page для использования в тестах
      page._reviewAdminSetup = setupData;

      await use(page);
    } finally {
      if (setupData) {
        await helper.cleanup(setupData);
      }
    }
  },
});

export { expect, loginAs };
