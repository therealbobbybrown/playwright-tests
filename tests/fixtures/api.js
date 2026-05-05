// tests/fixtures/api.js
// Фикстуры для API тестов

import { test as base, expect } from "@playwright/test";
import {
  APIClient,
  AuthAPI,
  PerformanceReviewAPI,
  SurveyAPI,
  FeedbackAPI,
  ObjectivesAPI,
  DevelopmentPlansAPI,
  NineBoxAPI,
  GiftShopAPI,
  getCredentials,
  createAuthenticatedClient,
} from "../utils/api/index.js";
import { getWorkerAdminRole } from "../utils/credentials.js";
import {
  SurveySeedHelper,
  PerformanceReviewSeedHelper,
  NineBoxSeedHelper,
} from "../utils/seed/index.js";

/**
 * Расширенные фикстуры для API тестов
 */
export const test = base.extend({
  /**
   * Неавторизованный API клиент
   * Используется для тестов публичных эндпоинтов
   */
  apiClient: async ({ request }, use) => {
    const client = new APIClient(request);
    await use(client);
  },

  /**
   * API клиент для аутентификации
   * Используется для тестов авторизации
   */
  authAPI: async ({ request }, use) => {
    const client = new AuthAPI(request);
    await use(client);
  },

  /**
   * Авторизованный API клиент под админом (worker-aware)
   */
  adminAPI: async ({ request }, use, testInfo) => {
    const role = getWorkerAdminRole(testInfo.parallelIndex);
    const client = await createAuthenticatedClient(request, role);
    await use(client);
  },

  /**
   * Авторизованный API клиент под пользователем
   */
  userAPI: async ({ request }, use) => {
    const client = await createAuthenticatedClient(request, "user");
    await use(client);
  },

  /**
   * Авторизованный API клиент под менеджером
   */
  managerAPI: async ({ request }, use) => {
    const client = await createAuthenticatedClient(request, "manager");
    await use(client);
  },

  /**
   * Performance Review API клиент (авторизованный под админом)
   * Для тестов Performance Review модуля
   */
  prAPI: async ({ request }, use, testInfo) => {
    const role = getWorkerAdminRole(testInfo.parallelIndex);
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials(role);
    await api.signIn(email, password);
    await use(api);
  },

  /**
   * Survey API клиент (авторизованный под админом)
   * Для тестов модуля опросов
   */
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  /**
   * Survey Seed Helper - создаёт тестовые данные для опросов
   * Автоматически проверяет наличие данных и создаёт при необходимости
   * Очищает созданные данные после использования
   */
  surveySeed: async ({ request }, use) => {
    const seedHelper = new SurveySeedHelper(request);
    await seedHelper.init("admin");

    // Проверяем существующие данные
    const { hasData } = await seedHelper.checkExistingData();

    // Если данных нет - создаём
    let seededData = null;
    if (!hasData) {
      console.log("[surveySeed] Создание тестовых данных для Survey...");
      seededData = await seedHelper.seedAll();
    }

    await use({ seedHelper, seededData, hasData });

    // Очистка созданных данных после тестов
    if (seededData) {
      console.log("[surveySeed] Очистка созданных данных...");
      await seedHelper.cleanup();
    }
  },

  /**
   * Performance Review Seed Helper - создаёт тестовые данные для PR
   * Автоматически проверяет наличие данных и создаёт при необходимости
   */
  prSeed: async ({ request }, use, testInfo) => {
    const role = getWorkerAdminRole(testInfo.parallelIndex);
    const seedHelper = new PerformanceReviewSeedHelper(request);
    await seedHelper.init(role);

    // Проверяем существующие данные
    const { hasData } = await seedHelper.checkExistingData();

    // Если данных нет - создаём
    let seededData = null;
    if (!hasData) {
      console.log(
        "[prSeed] Создание тестовых данных для Performance Review...",
      );
      seededData = await seedHelper.seedAll();
    }

    await use({ seedHelper, seededData, hasData });

    // Очистка не выполняется автоматически для PR (требует ручного указания ID)
  },

  /**
   * Feedback API клиент (авторизованный под админом)
   * Для тестов модуля обратной связи
   */
  feedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  /**
   * Feedback API клиент под обычным пользователем
   * Для тестов от имени обычного пользователя
   */
  feedbackUserAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },

  /**
   * NineBox API клиент (авторизованный под админом)
   */
  nineBoxAPI: async ({ request }, use) => {
    const api = new NineBoxAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  /**
   * NineBox Seed Helper (авторизованный под админом, с автоочисткой)
   * Автоматически вызывает cleanup() после теста
   */
  nineboxSeed: async ({ request }, use) => {
    const seed = new NineBoxSeedHelper(request);
    await seed.init("admin");
    await use(seed);
    await seed.cleanup();
  },

  /**
   * Gift Shop API клиент (авторизованный под админом)
   */
  giftShopAPI: async ({ request }, use) => {
    const api = new GiftShopAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  // =========================================================================
  // IDOR Test Fixtures - Two-user setup for security testing
  // =========================================================================

  /**
   * Objectives API клиент (авторизованный под админом)
   */
  objectivesAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  /**
   * Objectives API клиент под обычным пользователем
   */
  objectivesUserAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },

  /**
   * Development Plans API клиент (авторизованный под админом)
   */
  devPlansAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  /**
   * Development Plans API клиент под обычным пользователем
   */
  devPlansUserAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },

  // =========================================================================
  // IDOR Two-User Fixtures (User A = admin, User B = user)
  // =========================================================================

  /**
   * User A Feedback API - создаёт ресурсы (admin)
   */
  userAFeedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  /**
   * User B Feedback API - пытается получить доступ к ресурсам User A (user)
   */
  userBFeedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },

  /**
   * User A Objectives API (admin)
   */
  userAObjectivesAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  /**
   * User B Objectives API (user)
   */
  userBObjectivesAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },

  /**
   * User A Development Plans API (admin)
   */
  userADevPlansAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  /**
   * User B Development Plans API (user)
   */
  userBDevPlansAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

export { expect };
