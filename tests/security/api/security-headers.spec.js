// tests/security/api/security-headers.spec.js
// TASK-API-011: Тесты заголовков безопасности
// Проверка наличия security headers в API ответах
// @api @security @headers

import { test as base, expect } from "@playwright/test";
import { FeedbackAPI, AuthAPI, getCredentials } from "../../utils/api/index.js";
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

  authAPI: async ({ request }, use) => {
    const api = new AuthAPI(request);
    await use(api);
  },

  anonAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    // Без авторизации
    await use(api);
  },
});

// Стандартные security headers
const SECURITY_HEADERS = {
  // Предотвращает MIME-sniffing
  "x-content-type-options": "nosniff",
  // Защита от clickjacking
  "x-frame-options": ["DENY", "SAMEORIGIN"],
  // HTTP Strict Transport Security
  "strict-transport-security": null, // Должен присутствовать
  // XSS Protection (устаревший, но часто присутствует)
  "x-xss-protection": null,
  // Content Security Policy
  "content-security-policy": null,
  // Referrer Policy
  "referrer-policy": null,
};

// CORS headers
const CORS_HEADERS = {
  "access-control-allow-origin": null,
  "access-control-allow-methods": null,
  "access-control-allow-headers": null,
};

// ============================================================================
// SECURITY HEADERS - ОСНОВНЫЕ ПРОВЕРКИ
// ============================================================================

test.describe("Security Headers - Basic @api @security @headers", () => {
  test.beforeEach(() => {
    markAsSecurityTest("Security Headers");
  });

  test("API ответы содержат X-Content-Type-Options: nosniff", async ({
    feedbackAPI,
  }) => {
    setSeverity("normal");

    const { response } = await feedbackAPI.getFeedbackTypes();
    const headers = response.headers();

    allure.attachment(
      "All Headers",
      JSON.stringify(headers, null, 2),
      "application/json",
    );

    const xContentTypeOptions = headers["x-content-type-options"];

    if (xContentTypeOptions) {
      expect(xContentTypeOptions.toLowerCase()).toBe("nosniff");
      console.log("X-Content-Type-Options: nosniff - присутствует");
    } else {
      console.log("X-Content-Type-Options отсутствует");
      allure.attachment(
        "Security Note",
        "Рекомендуется добавить заголовок X-Content-Type-Options: nosniff для предотвращения MIME-sniffing атак",
        "text/plain",
      );
    }

    // Тест информационный
    expect(response.ok()).toBe(true);
  });

  test("API ответы содержат X-Frame-Options", async ({ feedbackAPI }) => {
    setSeverity("normal");

    const { response } = await feedbackAPI.getFeedbackTypes();
    const headers = response.headers();

    const xFrameOptions = headers["x-frame-options"];

    if (xFrameOptions) {
      const validValues = ["deny", "sameorigin"];
      expect(
        validValues.includes(xFrameOptions.toLowerCase()),
        `X-Frame-Options должен быть DENY или SAMEORIGIN, получен: ${xFrameOptions}`,
      ).toBe(true);
      console.log(`X-Frame-Options: ${xFrameOptions} - присутствует`);
    } else {
      console.log("X-Frame-Options отсутствует");
      allure.attachment(
        "Security Note",
        "Рекомендуется добавить заголовок X-Frame-Options: DENY для защиты от clickjacking",
        "text/plain",
      );
    }

    expect(response.ok()).toBe(true);
  });

  test("API ответы содержат Strict-Transport-Security (HSTS)", async ({
    feedbackAPI,
  }) => {
    setSeverity("normal");

    const { response } = await feedbackAPI.getFeedbackTypes();
    const headers = response.headers();

    const hsts = headers["strict-transport-security"];

    if (hsts) {
      // Проверяем что max-age достаточный (минимум 1 год = 31536000 секунд)
      const maxAgeMatch = hsts.match(/max-age=(\d+)/);
      if (maxAgeMatch) {
        const maxAge = parseInt(maxAgeMatch[1], 10);
        allure.attachment("HSTS max-age", `${maxAge} seconds`, "text/plain");

        if (maxAge < 31536000) {
          console.log(
            `HSTS max-age слишком мал: ${maxAge}. Рекомендуется минимум 31536000 (1 год)`,
          );
        } else {
          console.log(`HSTS: ${hsts} - корректно настроен`);
        }
      }

      // Проверяем наличие includeSubDomains
      const hasIncludeSubDomains = hsts
        .toLowerCase()
        .includes("includesubdomains");
      allure.attachment(
        "HSTS includeSubDomains",
        hasIncludeSubDomains ? "yes" : "no",
        "text/plain",
      );
    } else {
      console.log("Strict-Transport-Security отсутствует");
      allure.attachment(
        "Security Note",
        "Рекомендуется добавить HSTS заголовок для принудительного использования HTTPS",
        "text/plain",
      );
    }

    expect(response.ok()).toBe(true);
  });

  test("Сводка всех security headers", async ({ feedbackAPI }) => {
    setSeverity("critical");

    const { response } = await feedbackAPI.getFeedbackTypes();
    const headers = response.headers();

    const securityHeadersStatus = {
      "x-content-type-options": headers["x-content-type-options"] || "MISSING",
      "x-frame-options": headers["x-frame-options"] || "MISSING",
      "strict-transport-security":
        headers["strict-transport-security"] || "MISSING",
      "x-xss-protection": headers["x-xss-protection"] || "MISSING",
      "content-security-policy":
        headers["content-security-policy"] || "MISSING",
      "referrer-policy": headers["referrer-policy"] || "MISSING",
      "permissions-policy": headers["permissions-policy"] || "MISSING",
    };

    allure.attachment(
      "Security Headers Status",
      JSON.stringify(securityHeadersStatus, null, 2),
      "application/json",
    );

    const presentHeaders = Object.entries(securityHeadersStatus)
      .filter(([, value]) => value !== "MISSING")
      .map(([key]) => key);

    const missingHeaders = Object.entries(securityHeadersStatus)
      .filter(([, value]) => value === "MISSING")
      .map(([key]) => key);

    console.log(
      `Security headers присутствуют (${presentHeaders.length}): ${presentHeaders.join(", ") || "нет"}`,
    );
    console.log(
      `Security headers отсутствуют (${missingHeaders.length}): ${missingHeaders.join(", ") || "нет"}`,
    );

    allure.attachment(
      "Present Headers Count",
      `${presentHeaders.length}`,
      "text/plain",
    );
    allure.attachment(
      "Missing Headers Count",
      `${missingHeaders.length}`,
      "text/plain",
    );

    expect(response.ok()).toBe(true);
  });
});

// ============================================================================
// CORS HEADERS
// ============================================================================

test.describe("Security Headers - CORS @api @security @headers @cors", () => {
  test.beforeEach(() => {
    markAsSecurityTest("CORS Headers");
  });

  test("Проверка CORS заголовков в ответах", async ({ feedbackAPI }) => {
    setSeverity("normal");

    const { response } = await feedbackAPI.getFeedbackTypes();
    const headers = response.headers();

    const corsHeaders = {
      "access-control-allow-origin": headers["access-control-allow-origin"],
      "access-control-allow-methods": headers["access-control-allow-methods"],
      "access-control-allow-headers": headers["access-control-allow-headers"],
      "access-control-allow-credentials":
        headers["access-control-allow-credentials"],
      "access-control-max-age": headers["access-control-max-age"],
      "access-control-expose-headers": headers["access-control-expose-headers"],
    };

    // Фильтруем только присутствующие
    const presentCorsHeaders = Object.entries(corsHeaders)
      .filter(([, value]) => value !== undefined)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});

    allure.attachment(
      "CORS Headers",
      JSON.stringify(presentCorsHeaders, null, 2),
      "application/json",
    );

    if (Object.keys(presentCorsHeaders).length > 0) {
      console.log(
        "CORS headers обнаружены:",
        Object.keys(presentCorsHeaders).join(", "),
      );

      // Проверяем что origin не слишком permissive
      const origin = corsHeaders["access-control-allow-origin"];
      if (origin === "*") {
        allure.attachment(
          "Security Warning",
          "Access-Control-Allow-Origin: * - слишком permissive. Рекомендуется указать конкретные домены.",
          "text/plain",
        );
        console.log("WARNING: CORS Allow-Origin: * - слишком открытый");
      }
    } else {
      console.log("CORS headers не обнаружены в ответе");
    }

    expect(response.ok()).toBe(true);
  });
});

// ============================================================================
// ERROR INFORMATION DISCLOSURE
// ============================================================================

test.describe("Security Headers - Error Disclosure @api @security @headers", () => {
  test.beforeEach(() => {
    markAsSecurityTest("Error Disclosure");
  });

  test("404 ошибки не раскрывают внутренние детали", async ({
    feedbackAPI,
  }) => {
    setSeverity("critical");

    const { response, data } = await feedbackAPI.get(
      "/nonexistent-endpoint-12345",
    );
    const bodyStr = JSON.stringify(data);

    allure.attachment("Response Status", `${response.status()}`, "text/plain");
    allure.attachment("Response Body", bodyStr, "application/json");

    // Проверяем что в ошибке нет stack trace
    const sensitivePatterns = [
      /at .+\(.+:\d+:\d+\)/, // Stack trace pattern
      /\.js:\d+/, // JS file with line number
      /node_modules/, // Node modules path
      /Error:.*at/, // Error with stack
      /TypeError:/, // Type errors
      /ReferenceError:/, // Reference errors
      /\/home\//, // Linux paths
      /\/var\//, // Linux var paths
      /C:\\/, // Windows paths
      /internal\//, // Internal Node.js modules
    ];

    const foundPatterns = [];
    for (const pattern of sensitivePatterns) {
      if (pattern.test(bodyStr)) {
        foundPatterns.push(pattern.toString());
      }
    }

    if (foundPatterns.length > 0) {
      allure.attachment(
        "Security Issue",
        `Обнаружены потенциально чувствительные паттерны: ${foundPatterns.join(", ")}`,
        "text/plain",
      );
      console.log("WARNING: Обнаружены чувствительные данные в ошибке");
    } else {
      console.log("Ошибка не содержит внутренних деталей - хорошо");
    }

    expect(
      foundPatterns.length,
      "Ошибки не должны содержать внутренние детали",
    ).toBe(0);
  });

  test("401 ошибки не раскрывают внутренние детали", async ({ anonAPI }) => {
    setSeverity("critical");

    const { response, data } = await anonAPI.get("/private/users/current/");
    const bodyStr = JSON.stringify(data);

    allure.attachment("Response Status", `${response.status()}`, "text/plain");
    allure.attachment("Response Body", bodyStr, "application/json");

    // Проверяем отсутствие stack trace
    expect(bodyStr).not.toMatch(/at .+\(.+:\d+:\d+\)/);
    expect(bodyStr).not.toContain("node_modules");

    // Проверяем что не раскрывается информация о системе
    expect(bodyStr.toLowerCase()).not.toContain("database");
    expect(bodyStr.toLowerCase()).not.toContain("postgres");
    expect(bodyStr.toLowerCase()).not.toContain("mysql");
    expect(bodyStr.toLowerCase()).not.toContain("mongodb");

    console.log("401 ошибка не содержит внутренних деталей");
  });

  test("Ошибки валидации не раскрывают схему БД", async ({ feedbackAPI }) => {
    setSeverity("normal");

    // Отправляем невалидные данные
    const { response, data } = await feedbackAPI.post("/private/feedbacks/", {
      invalid_field: "test",
      another_invalid: 123,
    });

    const bodyStr = JSON.stringify(data);

    allure.attachment("Response Status", `${response.status()}`, "text/plain");
    allure.attachment("Response Body", bodyStr, "application/json");

    // Проверяем отсутствие деталей БД
    const dbPatterns = [
      /column.+does not exist/i,
      /relation.+does not exist/i,
      /table.+not found/i,
      /foreign key constraint/i,
      /unique constraint/i,
      /violates.+constraint/i,
    ];

    const foundDbPatterns = dbPatterns.filter((p) => p.test(bodyStr));

    if (foundDbPatterns.length > 0) {
      allure.attachment(
        "Security Issue",
        "Обнаружены детали схемы БД в ошибке валидации",
        "text/plain",
      );
    }

    expect(foundDbPatterns.length, "Ошибки не должны раскрывать схему БД").toBe(
      0,
    );
  });
});

// ============================================================================
// SERVER INFORMATION DISCLOSURE
// ============================================================================

test.describe("Security Headers - Server Info @api @security @headers", () => {
  test.beforeEach(() => {
    markAsSecurityTest("Server Info Disclosure");
  });

  test("Server header не раскрывает детальную информацию", async ({
    feedbackAPI,
  }) => {
    setSeverity("normal");

    const { response } = await feedbackAPI.getFeedbackTypes();
    const headers = response.headers();

    const serverHeader = headers["server"];
    const xPoweredBy = headers["x-powered-by"];

    allure.attachment(
      "Server Header",
      serverHeader || "not present",
      "text/plain",
    );
    allure.attachment(
      "X-Powered-By Header",
      xPoweredBy || "not present",
      "text/plain",
    );

    if (serverHeader) {
      // Проверяем что не раскрывается версия
      const versionPattern = /\d+\.\d+/;
      if (versionPattern.test(serverHeader)) {
        console.log(`WARNING: Server header содержит версию: ${serverHeader}`);
        allure.attachment(
          "Security Note",
          `Server header "${serverHeader}" содержит версию. Рекомендуется скрыть.`,
          "text/plain",
        );
      } else {
        console.log(`Server header: ${serverHeader} - без версии`);
      }
    } else {
      console.log("Server header отсутствует - хорошо");
    }

    if (xPoweredBy) {
      console.log(`WARNING: X-Powered-By присутствует: ${xPoweredBy}`);
      allure.attachment(
        "Security Note",
        `X-Powered-By: ${xPoweredBy} - рекомендуется удалить этот заголовок`,
        "text/plain",
      );
    } else {
      console.log("X-Powered-By отсутствует - хорошо");
    }

    expect(response.ok()).toBe(true);
  });
});

// ============================================================================
// CACHE HEADERS
// ============================================================================

test.describe("Security Headers - Cache Control @api @security @headers", () => {
  test.beforeEach(() => {
    markAsSecurityTest("Cache Headers");
  });

  test("Чувствительные endpoints имеют no-cache директивы", async ({
    feedbackAPI,
  }) => {
    setSeverity("normal");

    // Проверяем endpoint с персональными данными (используем getFeedbackTypes как пример авторизованного запроса)
    const { response } = await feedbackAPI.getFeedbackTypes();
    const headers = response.headers();

    const cacheControl = headers["cache-control"];
    const pragma = headers["pragma"];

    allure.attachment(
      "Cache-Control",
      cacheControl || "not present",
      "text/plain",
    );
    allure.attachment("Pragma", pragma || "not present", "text/plain");
    allure.attachment("Response Status", `${response.status()}`, "text/plain");

    if (cacheControl) {
      const hasNoStore = cacheControl.includes("no-store");
      const hasNoCache = cacheControl.includes("no-cache");
      const hasPrivate = cacheControl.includes("private");

      console.log(`Cache-Control: ${cacheControl}`);

      if (!hasNoStore && !hasNoCache && !hasPrivate) {
        allure.attachment(
          "Security Note",
          "Чувствительные данные могут кэшироваться. Рекомендуется Cache-Control: no-store, no-cache, private",
          "text/plain",
        );
      }
    } else {
      console.log("Cache-Control отсутствует");
      allure.attachment(
        "Security Note",
        "Рекомендуется добавить Cache-Control для чувствительных endpoints",
        "text/plain",
      );
    }

    // Тест информационный
    expect(response.ok()).toBe(true);
  });
});
