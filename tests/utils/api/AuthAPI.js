// tests/utils/api/AuthAPI.js
// API клиент для аутентификации

import { createHash } from "crypto";
import { APIClient } from "./APIClient.js";
import { getCredentials, getTestUserPassword } from "../credentials.js";

/**
 * Генерация fingerPrint как MD5 хеш (аналогично фронтенду)
 * @returns {string}
 */
function generateFingerPrint() {
  const timestamp = Date.now().toString();
  return createHash("md5").update(timestamp).digest("hex");
}

/**
 * API клиент для работы с аутентификацией
 * Endpoints: /auth/*
 */
export class AuthAPI extends APIClient {
  constructor(request, token = null) {
    super(request, token);
    // Генерируем и сохраняем fingerPrint для этого клиента
    this.fingerPrint = generateFingerPrint();
  }

  /**
   * Авторизация пользователя
   * POST /auth/account/signin
   * @param {string} email - Email пользователя
   * @param {string} password - Пароль
   * @param {Object} [options] - Дополнительные параметры
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async signIn(email, password, options = {}) {
    const {
      timeout,
      fingerPrint,
      permissions,
      retries = 1,
      retryDelay = 3000,
      ...restOptions
    } = options;
    let lastResult;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        lastResult = await this.post(
          "/auth/account/signin",
          {
            email,
            password,
            fingerPrint: fingerPrint || this.fingerPrint,
            permissions: permissions || [],
          },
          { timeout: timeout || 60_000, ...restOptions },
        );

        // Если успешно, сохраняем токен
        if (lastResult.response.ok() && lastResult.data?.accessToken) {
          this.setToken(lastResult.data.accessToken);
        }

        return lastResult;
      } catch (error) {
        if (attempt < retries) {
          console.warn(
            `[AuthAPI] signIn attempt ${attempt + 1} failed (${error.message}), retrying in ${retryDelay}ms...`,
          );
          await new Promise((r) => setTimeout(r, retryDelay));
        } else {
          throw error;
        }
      }
    }

    return lastResult;
  }

  /**
   * Обновление токена
   * POST /auth/account/refresh
   * @param {string} refreshToken - Refresh token
   * @param {string} accessToken - Access token (требуется API)
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async refresh(refreshToken, accessToken) {
    const { response, data } = await this.post("/auth/account/refresh", {
      refreshToken,
      accessToken,
    });

    if (response.ok() && data?.accessToken) {
      this.setToken(data.accessToken);
    }

    return { response, data };
  }

  /**
   * Выход из системы
   * POST /auth/account/signout
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async signOut() {
    const result = await this.post("/auth/account/signout");
    this.setToken(null);
    return result;
  }

  /**
   * Авторизация по коду
   * POST /auth/account/signin/by-code
   * @param {string} code - Код авторизации
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async signInByCode(code) {
    const { response, data } = await this.post("/auth/account/signin/by-code", {
      code,
    });

    if (response.ok() && data?.accessToken) {
      this.setToken(data.accessToken);
    }

    return { response, data };
  }

  /**
   * Получить информацию о коде
   * GET /auth/account/signin/by-code/info
   * @param {string} code - Код
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCodeInfo(code) {
    return this.get("/auth/account/signin/by-code/info", { code });
  }
}

// getCredentials и getTestUserPassword импортируются из ../credentials.js и реэкспортируются
export { getCredentials, getTestUserPassword };

/**
 * Создать авторизованный API клиент для роли
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {'admin' | 'user' | 'manager'} role
 * @returns {Promise<AuthAPI>}
 */
export async function createAuthenticatedClient(request, role = "admin") {
  const authAPI = new AuthAPI(request);
  const { email, password } = getCredentials(role);

  const { response, data } = await authAPI.signIn(email, password);

  if (!response.ok()) {
    throw new Error(
      `Не удалось авторизоваться как ${role}: ${response.status()}`,
    );
  }

  return authAPI;
}
