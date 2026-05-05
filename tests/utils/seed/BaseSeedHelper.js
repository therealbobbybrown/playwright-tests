/**
 * Базовый класс для всех Seed хелперов
 *
 * Предоставляет общую функциональность:
 * - Хранение request контекста
 * - Паттерн инициализации API
 * - Отслеживание созданных ID
 */

import { getCredentials } from "../api/index.js";
import { TestDataHelper } from "../TestDataHelper.js";

export class BaseSeedHelper {
  /**
   * @param {import('@playwright/test').APIRequestContext} request
   */
  constructor(request) {
    this.request = request;
    this.apiClient = null;
    this.createdIds = {};
  }

  /**
   * Инициализировать API с авторизацией.
   * Должен быть переопределён в дочерних классах для создания конкретного API клиента.
   * @param {'admin' | 'user' | 'manager'} role
   */
  async init(role = "admin") {
    throw new Error("Метод init() должен быть реализован в дочернем классе");
  }

  /**
   * Получить учётные данные для роли
   * @param {'admin' | 'user' | 'manager'} role
   * @returns {{email: string, password: string}}
   */
  getCredentials(role) {
    return getCredentials(role);
  }

  /**
   * Генерация уникального имени с E2E_ префиксом
   * @param {string} prefix
   * @returns {string}
   */
  generateUniqueName(prefix = "Test") {
    return TestDataHelper.generateUniqueName(prefix);
  }

  /**
   * Проверить, что хелпер инициализирован
   * @param {string} [helperName] - Имя хелпера для сообщения об ошибке
   */
  assertInitialized(helperName = "SeedHelper") {
    if (!this.apiClient) {
      throw new Error(
        `${helperName} не инициализирован. Вызовите init() первым.`,
      );
    }
  }

  /**
   * Добавить ID в отслеживание
   * @param {string} category - Категория (surveys, feedbacks, etc.)
   * @param {string|number} id - ID созданного объекта
   */
  trackCreatedId(category, id) {
    if (!this.createdIds[category]) {
      this.createdIds[category] = [];
    }
    this.createdIds[category].push(id);
  }

  /**
   * Получить все созданные ID
   * @returns {Object}
   */
  getCreatedIds() {
    return this.createdIds;
  }

  /**
   * Очистить список отслеживаемых ID
   */
  clearCreatedIds() {
    this.createdIds = {};
  }

  /**
   * Создать полный набор тестовых данных.
   * Должен быть реализован в дочерних классах.
   * @returns {Promise<Object>}
   */
  async seedAll() {
    throw new Error("Метод seedAll() должен быть реализован в дочернем классе");
  }

  /**
   * Очистить все созданные тестовые данные.
   * Должен быть реализован в дочерних классах.
   */
  async cleanup() {
    console.warn("Метод cleanup() не реализован в этом хелпере");
    this.clearCreatedIds();
  }

  /**
   * Проверить существующие данные.
   * Может быть переопределён в дочерних классах.
   * @returns {Promise<{hasData: boolean, counts: Object}>}
   */
  async checkExistingData() {
    return { hasData: false, counts: {} };
  }
}
