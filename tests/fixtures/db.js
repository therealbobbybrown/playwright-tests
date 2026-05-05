// tests/fixtures/db.js
// Фикстуры для работы с базой данных

import { test as base, expect } from "@playwright/test";
import {
  DatabaseClient,
  BaseVerifier,
  SurveyVerifier,
  UserVerifier,
  FeedbackVerifier,
  PerformanceReviewVerifier,
  ObjectivesVerifier,
  DevelopmentPlanVerifier,
  KarmaVerifier,
  RoleVerifier,
  OrgStructureVerifier,
  NineBoxVerifier,
} from "../utils/db/index.js";
import { DB_CONFIG } from "../utils/db/config.js";

/**
 * Расширенные фикстуры с поддержкой верификации данных в БД
 *
 * @example
 * // Использование в тесте
 * import { test, expect } from '../fixtures/db.js';
 *
 * test('проверка данных в БД', async ({ db, surveyVerifier }) => {
 *   // Прямой SQL запрос
 *   const users = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
 *
 *   // Использование верификатора
 *   const survey = await surveyVerifier.verifySurveyCreated(surveyId);
 * });
 */
export const test = base.extend({
  /**
   * Database Client - базовый клиент для SQL запросов
   * Автоматически подключается перед тестом и отключается после
   *
   * В строгом режиме (DB_STRICT=true) тест падает при недоступной БД
   */
  db: async ({}, use) => {
    const client = new DatabaseClient();

    try {
      await client.connect();
    } catch (error) {
      if (DB_CONFIG.STRICT) {
        throw new Error(
          `[DB_STRICT] Не удалось подключиться к БД: ${error.message}. ` +
            "Убедитесь что DB_HOST, DB_USER, DB_PASSWORD, DB_NAME настроены в .env",
        );
      }
      console.warn("[db fixture] Не удалось подключиться к БД:", error.message);
      console.warn(
        "[db fixture] Убедитесь что DB_HOST, DB_USER, DB_PASSWORD, DB_NAME настроены в .env",
      );
      // Graceful mode: не прерываем тест - пусть проверки в тесте решают что делать
    }

    await use(client);

    await client.disconnect();
  },

  /**
   * Base Verifier - generic верификатор для таблиц без специализированных верификаторов
   * Используйте для competencies, assessments, gift-shop и т.д.
   *
   * @example
   * await baseVerifier.verifyRecordCreated('competencies', competencyId);
   * await baseVerifier.verifyRecordField('competencies', id, 'title', 'Test');
   * await baseVerifier.verifyRecordCount('competencies', {}, 10);
   */
  baseVerifier: async ({ db }, use) => {
    const verifier = new BaseVerifier(db);
    await use(verifier);
  },

  /**
   * Survey Verifier - верификация опросов в БД
   * Зависит от фикстуры db
   */
  surveyVerifier: async ({ db }, use) => {
    const verifier = new SurveyVerifier(db);
    await use(verifier);
  },

  /**
   * User Verifier - верификация пользователей в БД
   * Зависит от фикстуры db
   */
  userVerifier: async ({ db }, use) => {
    const verifier = new UserVerifier(db);
    await use(verifier);
  },

  /**
   * Feedback Verifier - верификация обратной связи в БД
   * Зависит от фикстуры db
   */
  feedbackVerifier: async ({ db }, use) => {
    const verifier = new FeedbackVerifier(db);
    await use(verifier);
  },

  /**
   * Performance Review Verifier - верификация PR в БД
   * Зависит от фикстуры db
   */
  prVerifier: async ({ db }, use) => {
    const verifier = new PerformanceReviewVerifier(db);
    await use(verifier);
  },

  /**
   * Objectives Verifier - верификация целей (OKR) в БД
   * Зависит от фикстуры db
   */
  objectivesVerifier: async ({ db }, use) => {
    const verifier = new ObjectivesVerifier(db);
    await use(verifier);
  },

  /**
   * Development Plan Verifier - верификация планов развития в БД
   * Зависит от фикстуры db
   */
  dpVerifier: async ({ db }, use) => {
    const verifier = new DevelopmentPlanVerifier(db);
    await use(verifier);
  },

  /**
   * Karma Verifier - верификация кармы/бонусов в БД
   * Зависит от фикстуры db
   */
  karmaVerifier: async ({ db }, use) => {
    const verifier = new KarmaVerifier(db);
    await use(verifier);
  },

  /**
   * Role Verifier - верификация ролей и разрешений в БД
   * Зависит от фикстуры db
   */
  roleVerifier: async ({ db }, use) => {
    const verifier = new RoleVerifier(db);
    await use(verifier);
  },

  /**
   * Org Structure Verifier - верификация оргструктуры (департаменты, группы) в БД
   * Зависит от фикстуры db
   */
  orgVerifier: async ({ db }, use) => {
    const verifier = new OrgStructureVerifier(db);
    await use(verifier);
  },

  /**
   * NineBox Verifier - верификация матрицы потенциала 9-box в БД
   * Зависит от фикстуры db
   */
  nineboxVerifier: async ({ db }, use) => {
    const verifier = new NineBoxVerifier(db);
    await use(verifier);
  },

  /**
   * DB Step Helper - унифицированный wrapper для DB верификации
   * Автоматически пропускает шаг если нет подключения к БД
   *
   * @example
   * await dbStep('Проверка создания опроса', surveyVerifier, async () => {
   *   await surveyVerifier.verifySurveyCreated(surveyId);
   *   await surveyVerifier.verifySurveyStatus(surveyId, 'active');
   * });
   */
  dbStep: async ({ db }, use) => {
    /**
     * Выполнить DB верификацию в test.step с проверкой подключения
     * @param {string} name - Название шага
     * @param {import('../utils/db/verifiers/BaseVerifier.js').BaseVerifier} verifier - Верификатор
     * @param {Function} fn - Функция с проверками
     * @returns {Promise<*>} Результат функции или null если пропущено
     */
    const helper = async (name, verifier, fn) => {
      return base.step(`DB: ${name}`, async () => {
        if (!verifier.isConnected()) {
          if (DB_CONFIG.STRICT) {
            throw new Error(
              `[DB_STRICT] Требуется подключение к БД для: ${name}`,
            );
          }
          console.log(`[DB] Пропуск: ${name}`);
          return null;
        }
        return fn();
      });
    };
    await use(helper);
  },
});

export { expect };
