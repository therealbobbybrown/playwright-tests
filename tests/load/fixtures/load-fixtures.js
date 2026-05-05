// tests/load/fixtures/load-fixtures.js
// Фикстуры для нагрузочных тестов

import { test as base } from "@playwright/test";
import { PerformanceReviewAPI } from "../../utils/api/PerformanceReviewAPI.js";
import { SurveyAPI } from "../../utils/api/SurveyAPI.js";
import { OrgStructureAPI } from "../../utils/api/OrgStructureAPI.js";
import { ProfileAPI } from "../../utils/api/ProfileAPI.js";
import { NotificationsAPI } from "../../utils/api/NotificationsAPI.js";
import { FeedbackAPI } from "../../utils/api/FeedbackAPI.js";
import { KarmaAPI } from "../../utils/api/KarmaAPI.js";
import { getCredentials } from "../../utils/api/AuthAPI.js";
import { LOAD_TEST_CONFIG, checkDataReadiness } from "../seed/seed-config.js";

/**
 * Базовые фикстуры для load тестов
 */
export const test = base.extend({
  // API клиенты с авторизацией
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  orgAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  profileAPI: async ({ request }, use) => {
    const api = new ProfileAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  notificationsAPI: async ({ request }, use) => {
    const api = new NotificationsAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  feedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  karmaAPI: async ({ request }, use) => {
    const api = new KarmaAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  // Конфигурация нагрузочных тестов
  loadConfig: async ({}, use) => {
    await use(LOAD_TEST_CONFIG);
  },

  // Пороговые значения
  thresholds: async ({}, use) => {
    await use(LOAD_TEST_CONFIG.thresholds);
  },

  // Проверка готовности данных
  dataReadiness: async ({}, use) => {
    const readiness = checkDataReadiness();
    await use(readiness);
  },

  // ID большого PR (если настроен)
  largePrId: async ({}, use) => {
    await use(LOAD_TEST_CONFIG.largePrId);
  },

  // ID большого опроса (если настроен)
  largeSurveyId: async ({}, use) => {
    await use(LOAD_TEST_CONFIG.largeSurveyId);
  },

  // ID большого департамента (если настроен)
  largeDeptId: async ({}, use) => {
    await use(LOAD_TEST_CONFIG.largeDeptId);
  },

  // ID большого PR с заполненными анкетами (для тестов экспорта)
  largePrWithAnswersId: async ({}, use) => {
    await use(LOAD_TEST_CONFIG.largePrWithAnswersId);
  },

  // ID ревизии большого PR с ответами
  largePrWithAnswersRevisionId: async ({}, use) => {
    await use(LOAD_TEST_CONFIG.largePrWithAnswersRevisionId);
  },
});

export { expect } from "@playwright/test";
export { LOAD_TEST_CONFIG };
