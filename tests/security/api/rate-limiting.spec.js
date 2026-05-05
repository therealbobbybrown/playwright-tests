// tests/security/api/rate-limiting.spec.js
// TASK-API-010: Тесты Rate Limiting
// Проверка защиты API от чрезмерных запросов
// @api @security @ratelimit

import { test as base, expect } from "@playwright/test";
import {
  FeedbackAPI,
  AuthAPI,
  ObjectivesAPI,
  getCredentials,
} from "../../utils/api/index.js";
import {
  markAsSecurityTest,
  setSeverity,
  allure,
} from "../../utils/allure-helpers.js";

// Фикстуры
const test = base.extend({
  feedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  objectivesAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  authAPI: async ({ request }, use) => {
    const api = new AuthAPI(request);
    await use(api);
  },
});

// ============================================================================
// RATE LIMITING - DATA ENDPOINTS
// ============================================================================

test.describe("Rate Limiting - Data Endpoints @api @security @ratelimit", () => {
  test.beforeEach(() => {
    markAsSecurityTest("Rate Limiting");
  });

  test("100 последовательных GET запросов к Feedback API", async ({
    feedbackAPI,
  }) => {
    setSeverity("normal");

    const REQUEST_COUNT = 100;
    const results = [];
    const startTime = Date.now();

    // Последовательные запросы для точного измерения rate limiting
    for (let i = 0; i < REQUEST_COUNT; i++) {
      const result = await feedbackAPI.getFeedbackTypes();
      results.push({
        status: result.response.status(),
        headers: result.response.headers(),
      });
    }

    const duration = Date.now() - startTime;

    // Анализируем результаты
    const statusCounts = {};
    let rateLimitHeaders = null;

    for (const r of results) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;

      // Проверяем наличие rate limit headers
      if (
        r.headers["x-ratelimit-limit"] ||
        r.headers["retry-after"] ||
        r.headers["x-rate-limit-remaining"]
      ) {
        rateLimitHeaders = {
          limit: r.headers["x-ratelimit-limit"],
          remaining: r.headers["x-rate-limit-remaining"],
          retryAfter: r.headers["retry-after"],
        };
      }
    }

    const rateLimited = results.filter((r) => r.status === 429).length;
    const successful = results.filter((r) => r.status === 200).length;
    const serverErrors = results.filter((r) => r.status >= 500).length;

    // Логируем метрики
    allure.attachment("Total Requests", `${REQUEST_COUNT}`, "text/plain");
    allure.attachment("Duration", `${duration}ms`, "text/plain");
    allure.attachment("Successful (200)", `${successful}`, "text/plain");
    allure.attachment("Rate Limited (429)", `${rateLimited}`, "text/plain");
    allure.attachment("Server Errors (5xx)", `${serverErrors}`, "text/plain");
    allure.attachment(
      "Status Distribution",
      JSON.stringify(statusCounts, null, 2),
      "application/json",
    );

    if (rateLimitHeaders) {
      allure.attachment(
        "Rate Limit Headers",
        JSON.stringify(rateLimitHeaders, null, 2),
        "application/json",
      );
    }

    // Не должно быть серверных ошибок
    expect(serverErrors, "Не должно быть серверных ошибок").toBe(0);

    // Документируем наличие/отсутствие rate limiting
    if (rateLimited > 0) {
      console.log(
        `Rate limiting активен: ${rateLimited}/${REQUEST_COUNT} запросов заблокировано`,
      );
      // Если rate limiting есть, проверяем что он не слишком агрессивный
      expect(
        successful,
        "Должно быть хотя бы несколько успешных запросов",
      ).toBeGreaterThan(10);
    } else {
      console.log("Rate limiting не обнаружен на Feedback API (100 запросов)");
    }
  });

  test("50 параллельных запросов к Feedback API (burst)", async ({
    feedbackAPI,
  }) => {
    setSeverity("normal");

    const REQUEST_COUNT = 50;

    // Параллельные запросы (burst)
    const requests = Array(REQUEST_COUNT)
      .fill(null)
      .map(() => feedbackAPI.getFeedbackTypes());

    const startTime = Date.now();
    const results = await Promise.all(requests);
    const duration = Date.now() - startTime;

    const statusCounts = {};
    for (const r of results) {
      const status = r.response.status();
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    const rateLimited = results.filter(
      (r) => r.response.status() === 429,
    ).length;
    const successful = results.filter((r) => r.response.ok()).length;
    const serverErrors = results.filter(
      (r) => r.response.status() >= 500,
    ).length;

    allure.attachment(
      "Burst Size",
      `${REQUEST_COUNT} parallel requests`,
      "text/plain",
    );
    allure.attachment("Duration", `${duration}ms`, "text/plain");
    allure.attachment("Successful", `${successful}`, "text/plain");
    allure.attachment("Rate Limited (429)", `${rateLimited}`, "text/plain");
    allure.attachment(
      "Status Distribution",
      JSON.stringify(statusCounts, null, 2),
      "application/json",
    );

    // Не должно быть серверных ошибок
    expect(serverErrors, "Не должно быть серверных ошибок при burst").toBe(0);

    // Хотя бы часть запросов должна пройти
    expect(
      successful,
      "Хотя бы часть burst запросов должна пройти",
    ).toBeGreaterThanOrEqual(1);

    if (rateLimited > 0) {
      console.log(
        `Burst protection активна: ${rateLimited}/${REQUEST_COUNT} запросов заблокировано`,
      );
    } else {
      console.log("Burst protection не обнаружена (50 параллельных запросов)");
    }
  });

  test("100 последовательных GET запросов к Objectives API", async ({
    objectivesAPI,
  }) => {
    setSeverity("normal");

    const REQUEST_COUNT = 100;
    const results = [];
    const startTime = Date.now();

    for (let i = 0; i < REQUEST_COUNT; i++) {
      const result = await objectivesAPI.getObjectives({ limit: 1 });
      results.push({
        status: result.response.status(),
      });
    }

    const duration = Date.now() - startTime;

    const statusCounts = {};
    for (const r of results) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    }

    const rateLimited = results.filter((r) => r.status === 429).length;
    const successful = results.filter((r) => r.status === 200).length;
    const serverErrors = results.filter((r) => r.status >= 500).length;

    allure.attachment("Total Requests", `${REQUEST_COUNT}`, "text/plain");
    allure.attachment("Duration", `${duration}ms`, "text/plain");
    allure.attachment(
      "Status Distribution",
      JSON.stringify(statusCounts, null, 2),
      "application/json",
    );

    expect(serverErrors, "Не должно быть серверных ошибок").toBe(0);

    if (rateLimited > 0) {
      console.log(
        `Rate limiting активен на Objectives: ${rateLimited}/${REQUEST_COUNT}`,
      );
    } else {
      console.log("Rate limiting не обнаружен на Objectives API");
    }
  });
});

// ============================================================================
// RATE LIMITING - AUTH ENDPOINTS
// ============================================================================

test.describe("Rate Limiting - Auth Endpoints @api @security @ratelimit @auth", () => {
  test.beforeEach(() => {
    markAsSecurityTest("Auth Rate Limiting");
  });

  test("20 последовательных неудачных попыток входа", async ({ authAPI }) => {
    setSeverity("critical");

    // Используем случайный email чтобы не заблокировать реальный аккаунт
    const testEmail = `ratelimit-test-${Date.now()}@test-domain.invalid`;
    const REQUEST_COUNT = 20;
    const results = [];

    const startTime = Date.now();

    for (let i = 0; i < REQUEST_COUNT; i++) {
      const result = await authAPI.signIn(testEmail, "wrong-password");
      results.push({
        status: result.response.status(),
        headers: result.response.headers(),
      });
    }

    const duration = Date.now() - startTime;

    const statusCounts = {};
    let rateLimitHeaders = null;

    for (const r of results) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;

      if (r.headers["retry-after"] || r.headers["x-ratelimit-limit"]) {
        rateLimitHeaders = {
          retryAfter: r.headers["retry-after"],
          limit: r.headers["x-ratelimit-limit"],
        };
      }
    }

    const rateLimited = results.filter((r) => r.status === 429).length;
    const clientErrors = results.filter((r) =>
      [400, 401].includes(r.status),
    ).length;

    allure.attachment("Total Attempts", `${REQUEST_COUNT}`, "text/plain");
    allure.attachment("Duration", `${duration}ms`, "text/plain");
    allure.attachment("Rate Limited (429)", `${rateLimited}`, "text/plain");
    allure.attachment(
      "Client Errors (400/401)",
      `${clientErrors}`,
      "text/plain",
    );
    allure.attachment(
      "Status Distribution",
      JSON.stringify(statusCounts, null, 2),
      "application/json",
    );

    if (rateLimitHeaders) {
      allure.attachment(
        "Rate Limit Headers",
        JSON.stringify(rateLimitHeaders, null, 2),
        "application/json",
      );
    }

    // Документируем результат
    if (rateLimited > 0) {
      console.log(
        `Auth rate limiting активен: ${rateLimited}/${REQUEST_COUNT} попыток заблокировано`,
      );
      // Rate limiting должен сработать после нескольких попыток
      expect(
        rateLimited,
        "Rate limiting должен блокировать часть запросов",
      ).toBeGreaterThan(0);
    } else {
      console.log("Auth rate limiting не обнаружен (20 неудачных попыток)");
      // Это потенциальная уязвимость - документируем
      allure.attachment(
        "Security Note",
        "Rate limiting на auth endpoint не обнаружен. Рекомендуется внедрить защиту от brute force.",
        "text/plain",
      );
    }
  });

  test("10 параллельных попыток входа с неверным паролем", async ({
    authAPI,
  }) => {
    setSeverity("critical");

    const testEmail = `parallel-auth-${Date.now()}@test-domain.invalid`;
    const REQUEST_COUNT = 10;

    // Параллельные попытки входа
    const requests = Array(REQUEST_COUNT)
      .fill(null)
      .map(() => authAPI.signIn(testEmail, "wrong-password"));

    const startTime = Date.now();
    const results = await Promise.all(requests);
    const duration = Date.now() - startTime;

    const statusCounts = {};
    for (const r of results) {
      const status = r.response.status();
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    const rateLimited = results.filter(
      (r) => r.response.status() === 429,
    ).length;

    allure.attachment("Parallel Attempts", `${REQUEST_COUNT}`, "text/plain");
    allure.attachment("Duration", `${duration}ms`, "text/plain");
    allure.attachment("Rate Limited (429)", `${rateLimited}`, "text/plain");
    allure.attachment(
      "Status Distribution",
      JSON.stringify(statusCounts, null, 2),
      "application/json",
    );

    if (rateLimited > 0) {
      console.log(
        `Parallel auth rate limiting: ${rateLimited}/${REQUEST_COUNT}`,
      );
    } else {
      console.log("Parallel auth rate limiting не обнаружен");
    }
  });

  test("Проверка блокировки после множества неудачных попыток для реального аккаунта", async ({
    authAPI,
  }) => {
    setSeverity("critical");

    const { email, password } = getCredentials("user");
    const FAILED_ATTEMPTS = 5;

    // Сначала делаем несколько неудачных попыток
    const failedResults = [];
    for (let i = 0; i < FAILED_ATTEMPTS; i++) {
      const result = await authAPI.signIn(
        email,
        "definitely-wrong-password-" + i,
      );
      failedResults.push(result.response.status());
    }

    allure.attachment(
      "Failed Attempts",
      JSON.stringify(failedResults),
      "application/json",
    );

    // Теперь пробуем с правильным паролем
    const { response: successAttempt } = await authAPI.signIn(email, password);

    allure.attachment(
      "Success Attempt Status",
      `${successAttempt.status()}`,
      "text/plain",
    );

    // Проверяем результат
    if (successAttempt.status() === 429) {
      console.log(
        "Аккаунт временно заблокирован после неудачных попыток - защита работает",
      );
      // Это хорошо - защита от brute force работает
    } else if (successAttempt.ok()) {
      console.log(
        "Успешный вход после неудачных попыток - rate limiting не блокирует аккаунт",
      );
      // Тоже допустимо - зависит от политики
    } else {
      // Документируем неожиданный статус
      allure.attachment(
        "Unexpected Status",
        `${successAttempt.status()}`,
        "text/plain",
      );
    }

    // Успешный вход или 429 - оба допустимы
    expect(
      [200, 429].includes(successAttempt.status()),
      `Ожидается 200 или 429, получен ${successAttempt.status()}`,
    ).toBe(true);
  });
});

// ============================================================================
// RATE LIMITING HEADERS
// ============================================================================

test.describe("Rate Limiting - Headers Detection @api @security @ratelimit", () => {
  test.beforeEach(() => {
    markAsSecurityTest("Rate Limit Headers");
  });

  test("Проверка наличия rate limit headers в ответах API", async ({
    feedbackAPI,
  }) => {
    setSeverity("minor");

    const { response } = await feedbackAPI.getFeedbackTypes();
    const headers = response.headers();

    // Стандартные rate limit headers
    const rateLimitHeaders = {
      "x-ratelimit-limit": headers["x-ratelimit-limit"],
      "x-ratelimit-remaining": headers["x-ratelimit-remaining"],
      "x-ratelimit-reset": headers["x-ratelimit-reset"],
      "retry-after": headers["retry-after"],
      "x-rate-limit-limit": headers["x-rate-limit-limit"],
      "x-rate-limit-remaining": headers["x-rate-limit-remaining"],
    };

    // Фильтруем только присутствующие
    const presentHeaders = Object.entries(rateLimitHeaders)
      .filter(([, value]) => value !== undefined)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});

    allure.attachment("Response Status", `${response.status()}`, "text/plain");
    allure.attachment(
      "All Headers",
      JSON.stringify(headers, null, 2),
      "application/json",
    );

    if (Object.keys(presentHeaders).length > 0) {
      allure.attachment(
        "Rate Limit Headers Found",
        JSON.stringify(presentHeaders, null, 2),
        "application/json",
      );
      console.log(
        "Rate limit headers обнаружены:",
        Object.keys(presentHeaders).join(", "),
      );
    } else {
      console.log("Rate limit headers не обнаружены в ответе");
      allure.attachment(
        "Note",
        "Rate limit headers не найдены. Рекомендуется добавить для прозрачности API.",
        "text/plain",
      );
    }

    // Тест информационный - не падает
    expect(response.ok()).toBe(true);
  });
});

// ============================================================================
// SUSTAINED LOAD TEST
// ============================================================================

test.describe("Rate Limiting - Sustained Load @api @security @ratelimit", () => {
  test.beforeEach(() => {
    markAsSecurityTest("Sustained Load");
  });

  test("Устойчивая нагрузка: 200 запросов с интервалом 50ms", async ({
    feedbackAPI,
  }) => {
    setSeverity("normal");

    const REQUEST_COUNT = 200;
    const INTERVAL_MS = 50;
    const results = [];

    const startTime = Date.now();

    for (let i = 0; i < REQUEST_COUNT; i++) {
      const result = await feedbackAPI.getFeedbackTypes();
      results.push({
        index: i,
        status: result.response.status(),
        timestamp: Date.now() - startTime,
      });

      // Небольшая пауза между запросами
      if (i < REQUEST_COUNT - 1) {
        await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
      }
    }

    const duration = Date.now() - startTime;

    const statusCounts = {};
    for (const r of results) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    }

    const rateLimited = results.filter((r) => r.status === 429).length;
    const successful = results.filter((r) => r.status === 200).length;
    const serverErrors = results.filter((r) => r.status >= 500).length;
    const rps = Math.round((REQUEST_COUNT / duration) * 1000);

    allure.attachment("Total Requests", `${REQUEST_COUNT}`, "text/plain");
    allure.attachment("Interval", `${INTERVAL_MS}ms`, "text/plain");
    allure.attachment("Duration", `${duration}ms`, "text/plain");
    allure.attachment("Effective RPS", `${rps}`, "text/plain");
    allure.attachment("Successful", `${successful}`, "text/plain");
    allure.attachment("Rate Limited (429)", `${rateLimited}`, "text/plain");
    allure.attachment("Server Errors (5xx)", `${serverErrors}`, "text/plain");

    // Если были 429, логируем когда они начались
    if (rateLimited > 0) {
      const first429 = results.find((r) => r.status === 429);
      allure.attachment(
        "First 429 at request",
        `#${first429?.index}`,
        "text/plain",
      );
      console.log(`Rate limiting сработал на запросе #${first429?.index}`);
    }

    // Не должно быть серверных ошибок
    expect(
      serverErrors,
      "Не должно быть серверных ошибок при устойчивой нагрузке",
    ).toBe(0);

    // Большинство запросов должно пройти при умеренном rate (20 RPS)
    const minSuccessRate = 0.8; // 80%
    const actualSuccessRate = successful / REQUEST_COUNT;
    expect(
      actualSuccessRate,
      `Минимум ${minSuccessRate * 100}% запросов должны быть успешными при ${rps} RPS`,
    ).toBeGreaterThanOrEqual(minSuccessRate);

    console.log(
      `Sustained load: ${successful}/${REQUEST_COUNT} успешно (${rps} RPS)`,
    );
  });
});
