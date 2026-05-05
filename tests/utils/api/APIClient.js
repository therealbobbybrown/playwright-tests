// tests/utils/api/APIClient.js
// Базовый API клиент для тестирования Appraise API

import { allure } from "allure-playwright";

/**
 * API Client для работы с Appraise API
 * Base URL: из process.env.API_BASE_URL
 *
 * Все методы возвращают { response, data } для удобства и логирования в Allure
 */
/** Shared throttle state across all APIClient instances */
const _throttle = {
  lastRequestTime: 0,
  delayMs: parseInt(process.env.API_THROTTLE_MS || "0", 10),
};

export class APIClient {
  /**
   * @param {import('@playwright/test').APIRequestContext} request - Playwright request context
   * @param {string} [token] - Bearer token для авторизации
   */
  constructor(request, token = null) {
    this.request = request;
    if (!process.env.API_BASE_URL) {
      throw new Error(
        "API_BASE_URL is not set in .env — cannot create APIClient",
      );
    }
    this.baseURL = process.env.API_BASE_URL;
    this.token = token;
    this.enableLogging = true; // Логирование в Allure по умолчанию включено
  }

  /**
   * Throttle — минимальная задержка между API-вызовами.
   * Включается через API_THROTTLE_MS=100 в .env (по умолчанию выключен).
   * Предотвращает перегрузку стенда при большом параллельном прогоне.
   */
  async _throttle() {
    if (_throttle.delayMs <= 0) return;
    const now = Date.now();
    const elapsed = now - _throttle.lastRequestTime;
    if (elapsed < _throttle.delayMs) {
      await new Promise((r) => setTimeout(r, _throttle.delayMs - elapsed));
    }
    _throttle.lastRequestTime = Date.now();
  }

  /**
   * Логирует API вызов в Allure
   * @param {string} method - HTTP метод
   * @param {string} endpoint - Эндпоинт
   * @param {Object} options - Опции
   */
  logToAllure(
    method,
    endpoint,
    { requestBody, status, responseBody, duration },
  ) {
    if (!this.enableLogging) return;

    try {
      const statusEmoji =
        status >= 200 && status < 300 ? "✅" : status >= 400 ? "❌" : "⚠️";
      const durationStr = duration ? ` (${duration}ms)` : "";

      allure.step(
        `${statusEmoji} ${method} ${endpoint} → ${status}${durationStr}`,
        () => {
          if (
            requestBody !== undefined &&
            requestBody !== null &&
            Object.keys(requestBody).length > 0
          ) {
            allure.attachment(
              "Request Body",
              JSON.stringify(requestBody, null, 2),
              "application/json",
            );
          }
          if (responseBody !== undefined && responseBody !== null) {
            allure.attachment(
              "Response Body",
              JSON.stringify(responseBody, null, 2),
              "application/json",
            );
          }
        },
      );
    } catch {
      // Игнорируем ошибки логирования (например, вне контекста теста)
    }
  }

  /**
   * Получить заголовки для запроса
   * @returns {Object} Headers
   */
  getHeaders() {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-lang": "ru",
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Выполнить GET запрос с логированием
   * @param {string} endpoint - API endpoint (например, '/health')
   * @param {Object} [params] - Query параметры
   * @param {Object} [options] - Дополнительные опции (timeout и др.)
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: any}>}
   */
  async get(endpoint, params = {}, options = {}) {
    await this._throttle();
    const { timeout = 60_000, ...restOptions } = options;
    const url = `${this.baseURL}${endpoint}`;
    const start = Date.now();
    const response = await this.request.get(url, {
      headers: this.getHeaders(),
      params,
      timeout,
      ...restOptions,
    });
    const duration = Date.now() - start;
    const data = await response.json().catch(() => null);

    this.logToAllure("GET", endpoint, {
      requestBody: Object.keys(params).length > 0 ? params : undefined,
      status: response.status(),
      responseBody: data,
      duration,
    });

    return { response, data };
  }

  /**
   * Выполнить POST запрос с логированием
   * @param {string} endpoint - API endpoint
   * @param {Object} [data] - Request body
   * @param {Object} [options] - Дополнительные опции (timeout и др.)
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: any}>}
   */
  async post(endpoint, requestData = {}, options = {}) {
    await this._throttle();
    const { timeout = 60_000, ...restOptions } = options;
    const url = `${this.baseURL}${endpoint}`;
    const start = Date.now();
    const response = await this.request.post(url, {
      headers: this.getHeaders(),
      data: requestData,
      timeout,
      ...restOptions,
    });
    const duration = Date.now() - start;
    const data = await response.json().catch(() => null);

    this.logToAllure("POST", endpoint, {
      requestBody: requestData,
      status: response.status(),
      responseBody: data,
      duration,
    });

    return { response, data };
  }

  /**
   * Выполнить PUT запрос с логированием
   * @param {string} endpoint - API endpoint
   * @param {Object} [data] - Request body
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: any}>}
   */
  async put(endpoint, requestData = {}, options = {}) {
    await this._throttle();
    const { timeout = 30_000, ...restOptions } = options;
    const url = `${this.baseURL}${endpoint}`;
    const start = Date.now();
    const response = await this.request.put(url, {
      headers: this.getHeaders(),
      data: requestData,
      timeout,
      ...restOptions,
    });
    const duration = Date.now() - start;
    const data = await response.json().catch(() => null);

    this.logToAllure("PUT", endpoint, {
      requestBody: requestData,
      status: response.status(),
      responseBody: data,
      duration,
    });

    return { response, data };
  }

  /**
   * Выполнить PATCH запрос с логированием
   * @param {string} endpoint - API endpoint
   * @param {Object} [data] - Request body
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: any}>}
   */
  async patch(endpoint, requestData = {}, options = {}) {
    const { timeout = 30_000, ...restOptions } = options;
    const url = `${this.baseURL}${endpoint}`;
    const start = Date.now();
    const response = await this.request.patch(url, {
      headers: this.getHeaders(),
      data: requestData,
      timeout,
      ...restOptions,
    });
    const duration = Date.now() - start;
    const data = await response.json().catch(() => null);

    this.logToAllure("PATCH", endpoint, {
      requestBody: requestData,
      status: response.status(),
      responseBody: data,
      duration,
    });

    return { response, data };
  }

  /**
   * Выполнить POST запрос с multipart/form-data (для загрузки файлов)
   * @param {string} endpoint - API endpoint
   * @param {Object} multipartData - Multipart данные (ключ: значение или { name, mimeType, buffer })
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: any}>}
   */
  async postMultipart(endpoint, multipartData = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      Accept: "application/json",
      "x-lang": "ru",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const start = Date.now();
    const response = await this.request.post(url, {
      headers,
      multipart: multipartData,
    });
    const duration = Date.now() - start;
    const data = await response.json().catch(() => null);

    this.logToAllure("POST (multipart)", endpoint, {
      requestBody: Object.keys(multipartData).reduce((acc, key) => {
        const val = multipartData[key];
        acc[key] = val?.buffer ? `[File: ${val.name}]` : val;
        return acc;
      }, {}),
      status: response.status(),
      responseBody: data,
      duration,
    });

    return { response, data };
  }

  /**
   * Выполнить DELETE запрос с логированием
   * @param {string} endpoint - API endpoint
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: any}>}
   */
  async delete(endpoint, options = {}) {
    await this._throttle();
    const { timeout = 30_000, ...restOptions } = options;
    const url = `${this.baseURL}${endpoint}`;
    const start = Date.now();
    const response = await this.request.delete(url, {
      headers: this.getHeaders(),
      timeout,
      ...restOptions,
    });
    const duration = Date.now() - start;
    const data = await response.json().catch(() => null);

    this.logToAllure("DELETE", endpoint, {
      status: response.status(),
      responseBody: data,
      duration,
    });

    return { response, data };
  }

  /**
   * Установить токен авторизации
   * @param {string} token - Bearer token
   */
  setToken(token) {
    this.token = token;
  }

  /**
   * Проверить, авторизован ли клиент
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!this.token;
  }

  /**
   * Включить/выключить логирование в Allure
   * @param {boolean} enabled
   */
  setLogging(enabled) {
    this.enableLogging = enabled;
  }
}
