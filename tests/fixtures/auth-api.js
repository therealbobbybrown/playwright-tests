// tests/fixtures/auth-api.js
// Комбинированные фикстуры: браузерный UI (adminAuth) + API клиенты (objectivesAPI и др.)
// Используется для UI тестов, которым нужно создавать тестовые данные через API

import { mergeTests } from "@playwright/test";
import { test as authTest, expect } from "./auth.js";
import { test as apiTest } from "./api.js";

/**
 * Комбинированные фикстуры для UI тестов с подготовкой данных через API
 *
 * Объединяет:
 * - auth.js: adminAuth, page (браузер + авторизация)
 * - api.js: objectivesAPI, feedbackAPI, surveyAPI и др. (headless API клиенты)
 *
 * @example
 * import { test, expect } from '../fixtures/auth-api.js';
 *
 * test.beforeAll(async ({ objectivesAPI }) => {
 *   // Создать тестовые данные через API
 * });
 *
 * test('E2E тест', async ({ adminAuth, page, objectivesAPI }) => {
 *   // UI-взаимодействие + API cleanup
 * });
 */
export const test = mergeTests(authTest, apiTest);

export { expect };
