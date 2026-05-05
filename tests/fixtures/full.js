// tests/fixtures/full.js
// Комбинированные фикстуры: API + DB

import { mergeTests } from "@playwright/test";
import { test as apiTest, expect } from "./api.js";
import { test as dbTest } from "./db.js";

/**
 * Комбинированные фикстуры для тестов с API и верификацией в БД
 *
 * Объединяет все API фикстуры (из api.js) и DB фикстуры (из db.js):
 *
 * API фикстуры:
 * - apiClient, authAPI - неавторизованные клиенты
 * - adminAPI, userAPI, managerAPI - авторизованные клиенты по ролям
 * - surveyAPI, prAPI, feedbackAPI и др. - специализированные API клиенты
 * - surveySeed, prSeed - seed helpers
 *
 * DB фикстуры:
 * - db - DatabaseClient для SQL запросов
 * - surveyVerifier - верификация опросов
 * - userVerifier - верификация пользователей
 * - feedbackVerifier - верификация обратной связи
 *
 * @example
 * import { test, expect } from '../fixtures/full.js';
 *
 * test('создание опроса с верификацией в БД', async ({
 *   surveyAPI,      // API клиент для создания
 *   surveyVerifier, // Верификатор для проверки в БД
 * }) => {
 *   // Создаём через API
 *   const { data } = await surveyAPI.createDraft({ title: 'Test Survey' });
 *
 *   // Проверяем в БД
 *   const dbSurvey = await surveyVerifier.verifySurveyCreated(data.id);
 *   expect(dbSurvey.status).toBe('draft');
 * });
 */
export const test = mergeTests(apiTest, dbTest);

export { expect };
