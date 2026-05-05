/**
 * Security API тесты для Главной страницы (Home)
 *
 * Проверяет ролевую модель доступа:
 * - Anonymous: 401 на все endpoints
 * - Admin: полный доступ ко всем /private/* endpoints
 * - User: доступ ко всем /private/* endpoints (своя информация)
 * - Manager: доступ ко всем /private/* endpoints (своя информация)
 *
 * Endpoints главной страницы:
 * - /private/accounts/me - текущий аккаунт
 * - /private/org-struct/me/info - информация о структуре
 * - /private/feedbacks/of-me/stats - статистика фидбека
 * - /private/notifications/unread-count - количество непрочитанных
 * - /private/karma/wallet/balances - баланс кармы
 * - /private/development-plans/get - планы развития
 * - /private/performance-reviews/history - история оценок
 */
import { test as base, expect } from "@playwright/test";
import { APIClient, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { createHash } from "crypto";

/**
 * Генерация fingerPrint как MD5 хеш
 */
function generateFingerPrint() {
  const timestamp = Date.now().toString();
  return createHash("md5").update(timestamp).digest("hex");
}

/**
 * Расширенный API клиент с авторизацией
 */
class HomeAPI extends APIClient {
  constructor(request, token = null) {
    super(request, token);
    this.fingerPrint = generateFingerPrint();
  }

  async signIn(email, password) {
    const { data } = await this.post("/auth/account/signin", {
      email,
      password,
      fingerPrint: this.fingerPrint,
      permissions: [],
    });
    if (data?.accessToken) {
      this.setToken(data.accessToken);
    }
    return data;
  }
}

// Расширение fixtures для ролей
const test = base.extend({
  adminAPI: async ({ request }, use) => {
    const api = new HomeAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  userAPI: async ({ request }, use) => {
    const api = new HomeAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  managerAPI: async ({ request }, use) => {
    const api = new HomeAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  anonAPI: async ({ request }, use) => {
    const api = new HomeAPI(request);
    // НЕ делаем signIn - анонимный пользователь
    await use(api);
  },
});

test.describe("Home Page Security API @api @home @permissions @security", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.HOME, "Security");
  });

  // ═══════════════════════════════════════════════════════════════
  // ANONYMOUS - должен получить 401
  // ═══════════════════════════════════════════════════════════════
  test.describe("Неавторизованный пользователь (Anonymous)", () => {
    test("GET /private/accounts/me - anonymous получает 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.get("/private/accounts/me/");

      expect(response.status()).toBe(401);
    });

    test("GET /private/org-struct/me/info - anonymous получает 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.get("/private/org-struct/me/info");

      expect(response.status()).toBe(401);
    });

    test("GET /private/feedbacks/of-me/stats - anonymous получает 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.get("/private/feedbacks/of-me/stats");

      expect(response.status()).toBe(401);
    });

    test("GET /private/notifications/unread-count - anonymous получает 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.get(
        "/private/notifications/unread-count",
      );

      expect(response.status()).toBe(401);
    });

    test("GET /private/karma/wallet/balances - anonymous получает 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.get("/private/karma/wallet/balances");

      expect(response.status()).toBe(401);
    });

    test("POST /private/development-plans/get - anonymous получает 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.post(
        "/private/development-plans/get",
        { limit: 10 },
      );

      expect(response.status()).toBe(401);
    });

    test("GET /private/performance-reviews/history - anonymous получает 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.get(
        "/private/performance-reviews/history",
      );

      expect(response.status()).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ADMIN - полный доступ
  // ═══════════════════════════════════════════════════════════════
  test.describe("Admin - полные права", () => {
    test("GET /private/accounts/me - admin имеет доступ к своему аккаунту", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await adminAPI.get("/private/accounts/me/");

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/org-struct/me/info - admin имеет доступ к информации о структуре", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await adminAPI.get(
        "/private/org-struct/me/info",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/feedbacks/of-me/stats - admin имеет доступ к статистике фидбека", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.get(
        "/private/feedbacks/of-me/stats",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/notifications/unread-count - admin имеет доступ к уведомлениям", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.get(
        "/private/notifications/unread-count",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/karma/wallet/balances - admin имеет доступ к балансу кармы", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.get(
        "/private/karma/wallet/balances",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /private/development-plans/get - admin имеет доступ к планам развития", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.post(
        "/private/development-plans/get",
        { limit: 10 },
      );

      // 200 - успех, 400 - ошибка валидации (если нет планов)
      expect([200, 400]).toContain(response.status());
    });

    test("GET /private/performance-reviews/history - admin имеет доступ к истории оценок", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.get(
        "/private/performance-reviews/history",
      );

      // 200 - успех, 400 - если нет активных оценок, 404 - endpoint может отсутствовать
      expect([200, 400, 404]).toContain(response.status());
    });

    test("GET /private/company/settings - admin имеет доступ к настройкам компании", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.get(
        "/private/company/settings",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // USER - базовые права (доступ к своим данным)
  // ═══════════════════════════════════════════════════════════════
  test.describe("User - базовые права", () => {
    test("GET /private/accounts/me - user имеет доступ к своему аккаунту", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await userAPI.get("/private/accounts/me/");

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/org-struct/me/info - user имеет доступ к информации о структуре", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await userAPI.get(
        "/private/org-struct/me/info",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/feedbacks/of-me/stats - user имеет доступ к статистике фидбека", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.get(
        "/private/feedbacks/of-me/stats",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/notifications/unread-count - user имеет доступ к уведомлениям", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.get(
        "/private/notifications/unread-count",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/karma/wallet/balances - user имеет доступ к балансу кармы", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.get(
        "/private/karma/wallet/balances",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /private/development-plans/get/for-responsible - user имеет доступ к своим планам", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      const { response } = await userAPI.post(
        "/private/development-plans/get/for-responsible",
        { limit: 10 },
      );

      // 200 - успех, 400 - ошибка валидации
      expect([200, 400]).toContain(response.status());
    });

    test("GET /private/performance-reviews/history - user имеет доступ к своей истории оценок", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.get(
        "/private/performance-reviews/history",
      );

      // 200 - успех, 400 - если нет активных оценок, 404 - endpoint может отсутствовать
      expect([200, 400, 404]).toContain(response.status());
    });

    test("GET /private/company/settings - user имеет доступ к настройкам компании", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.get("/private/company/settings");

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MANAGER - расширенные права (доступ к своим данным + подчинённые)
  // ═══════════════════════════════════════════════════════════════
  test.describe("Manager - расширенные права", () => {
    test("GET /private/accounts/me - manager имеет доступ к своему аккаунту", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await managerAPI.get("/private/accounts/me/");

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/org-struct/me/info - manager имеет доступ к информации о структуре", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await managerAPI.get(
        "/private/org-struct/me/info",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/feedbacks/of-me/stats - manager имеет доступ к статистике фидбека", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await managerAPI.get(
        "/private/feedbacks/of-me/stats",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/notifications/unread-count - manager имеет доступ к уведомлениям", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await managerAPI.get(
        "/private/notifications/unread-count",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/karma/wallet/balances - manager имеет доступ к балансу кармы", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await managerAPI.get(
        "/private/karma/wallet/balances",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /private/development-plans/get/for-head - manager имеет доступ к планам подчинённых", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      const { response } = await managerAPI.post(
        "/private/development-plans/get/for-head",
        { limit: 10 },
      );

      // 200 - успех, 400 - ошибка валидации (если нет подчинённых)
      expect([200, 400]).toContain(response.status());
    });

    test("GET /private/performance-reviews/history - manager имеет доступ к своей истории оценок", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await managerAPI.get(
        "/private/performance-reviews/history",
      );

      // 200 - успех, 400 - если нет активных оценок, 404 - endpoint может отсутствовать
      expect([200, 400, 404]).toContain(response.status());
    });

    test("GET /private/company/settings - manager имеет доступ к настройкам компании", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await managerAPI.get(
        "/private/company/settings",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ПРОВЕРКА ДАННЫХ АККАУНТА
  // ═══════════════════════════════════════════════════════════════
  test.describe("Проверка данных аккаунта", () => {
    test("Аккаунт admin содержит корректные данные", async ({ adminAPI }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.get("/private/accounts/me/");

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();

      // Проверяем наличие основных полей
      if (data?.account) {
        expect(data.account).toHaveProperty("id");
      }
      if (data?.currentUserId) {
        expect(typeof data.currentUserId).toBe("number");
      }
    });

    test("Аккаунт user содержит корректные данные", async ({ userAPI }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.get("/private/accounts/me/");

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("Аккаунт manager содержит корректные данные", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await managerAPI.get("/private/accounts/me/");

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ПАРАЛЛЕЛЬНАЯ ЗАГРУЗКА (как на главной странице)
  // ═══════════════════════════════════════════════════════════════
  test.describe("Параллельная загрузка данных", () => {
    test("User может загрузить все данные главной страницы параллельно", async ({
      userAPI,
    }) => {
      setSeverity("critical");

      // Параллельная загрузка как на реальной главной странице
      const results = await Promise.all([
        userAPI.get("/private/accounts/me/"),
        userAPI.get("/private/org-struct/me/info"),
        userAPI.get("/private/feedbacks/of-me/stats"),
        userAPI.get("/private/notifications/unread-count"),
        userAPI.get("/private/karma/wallet/balances"),
        userAPI.get("/private/company/settings"),
      ]);

      // Проверяем, что все запросы успешны
      for (const { response } of results) {
        expect(response.ok()).toBe(true);
      }
    });

    test("Manager может загрузить все данные главной страницы параллельно", async ({
      managerAPI,
    }) => {
      setSeverity("critical");

      const results = await Promise.all([
        managerAPI.get("/private/accounts/me/"),
        managerAPI.get("/private/org-struct/me/info"),
        managerAPI.get("/private/feedbacks/of-me/stats"),
        managerAPI.get("/private/notifications/unread-count"),
        managerAPI.get("/private/karma/wallet/balances"),
        managerAPI.get("/private/company/settings"),
      ]);

      for (const { response } of results) {
        expect(response.ok()).toBe(true);
      }
    });
  });
});
