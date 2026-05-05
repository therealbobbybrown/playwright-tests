// tests/utils/db/verifiers/BaseVerifier.js
// Базовый класс для верификации данных в БД

import { expect } from "@playwright/test";
import { DB_CONFIG, getWaitTimeout, getPollInterval } from "../config.js";

/**
 * Базовый класс для верификации данных в БД
 *
 * Предоставляет общие методы для ожидания и проверки данных.
 * Все специализированные верификаторы должны наследоваться от этого класса.
 *
 * @example
 * class SurveyVerifier extends BaseVerifier {
 *   async verifySurveyCreated(surveyId) {
 *     const survey = await this.waitForRecord('surveys', { id: surveyId });
 *     expect(survey).not.toBeNull();
 *     return survey;
 *   }
 * }
 */
export class BaseVerifier {
  /**
   * @param {import('../DatabaseClient.js').DatabaseClient} db - Database клиент
   */
  constructor(db) {
    if (!db) {
      throw new Error("DatabaseClient is required for BaseVerifier");
    }
    this.db = db;
  }

  /**
   * Проверить подключение к БД (выбрасывает ошибку если нет)
   * @throws {Error} если нет подключения
   * @deprecated Используйте skipIfNotConnected() для graceful skip
   */
  ensureConnected() {
    if (!this.db.isConnected()) {
      const error = new Error(
        "DB verification skipped: нет подключения к БД. " +
          "Проверьте DB_HOST, DB_USER, DB_PASSWORD, DB_NAME в .env",
      );
      error.name = "DBConnectionError";
      throw error;
    }
  }

  /**
   * Проверить есть ли подключение (без выброса ошибки)
   * @returns {boolean}
   */
  isConnected() {
    return this.db.isConnected();
  }

  /**
   * Пропустить проверку если нет подключения к БД
   * В строгом режиме (DB_STRICT=true) выбрасывает ошибку вместо пропуска
   * @returns {boolean} true если нужно пропустить (нет подключения)
   * @throws {Error} в строгом режиме при отсутствии подключения
   */
  skipIfNotConnected() {
    if (!this.db.isConnected()) {
      if (DB_CONFIG.STRICT) {
        throw new Error(
          "[DB_STRICT] Требуется подключение к БД. " +
            "Проверьте DB_HOST, DB_USER, DB_PASSWORD, DB_NAME в .env",
        );
      }
      console.log("[DB] Пропуск проверки: нет подключения к БД");
      return true;
    }
    return false;
  }

  /**
   * Подождать выполнения условия (для eventual consistency)
   * @param {Function} checkFn - Асинхронная функция проверки, возвращает boolean
   * @param {Object} [options] - Опции
   * @param {number} [options.timeout] - Таймаут в миллисекундах (по умолчанию из DB_CONFIG)
   * @param {number} [options.interval] - Интервал проверки в миллисекундах (по умолчанию из DB_CONFIG)
   * @param {string} [options.message] - Сообщение об ошибке при таймауте
   * @returns {Promise<boolean>} true если условие выполнено, false если таймаут
   */
  async waitFor(checkFn, options = {}) {
    const timeout = getWaitTimeout(options.timeout);
    const interval = getPollInterval(options.interval);
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        if (await checkFn()) {
          return true;
        }
      } catch {
        // Игнорируем ошибки проверки, продолжаем ждать
      }
      await this._sleep(interval);
    }

    return false;
  }

  /**
   * Подождать появления записи в таблице
   * @param {string} table - Имя таблицы
   * @param {Object} where - Условия поиска
   * @param {number} [timeout] - Таймаут в миллисекундах (по умолчанию из DB_CONFIG)
   * @returns {Promise<Object|null>} Найденная запись или null
   */
  async waitForRecord(table, where, timeout) {
    const found = await this.waitFor(
      async () => await this.db.exists(table, where),
      { timeout: getWaitTimeout(timeout) },
    );

    if (found) {
      return this.db.findOne(table, where);
    }
    return null;
  }

  /**
   * Подождать изменения значения поля
   * @param {string} table - Имя таблицы
   * @param {Object} where - Условия поиска записи
   * @param {string} field - Имя поля
   * @param {*} expectedValue - Ожидаемое значение
   * @param {number} [timeout] - Таймаут (по умолчанию из DB_CONFIG)
   * @returns {Promise<boolean>} true если значение изменилось
   */
  async waitForFieldValue(table, where, field, expectedValue, timeout) {
    return this.waitFor(
      async () => {
        const record = await this.db.findOne(table, where);
        return record && record[field] === expectedValue;
      },
      { timeout: getWaitTimeout(timeout) },
    );
  }

  /**
   * Подождать удаления записи (или soft delete)
   * @param {string} table - Имя таблицы
   * @param {Object} where - Условия поиска
   * @param {string} [softDeleteField='deleted_at'] - Поле для soft delete
   * @param {number} [timeout] - Таймаут (по умолчанию из DB_CONFIG)
   * @returns {Promise<boolean>}
   */
  async waitForDeletion(table, where, softDeleteField = "deleted_at", timeout) {
    return this.waitFor(
      async () => {
        const record = await this.db.findOne(table, where);
        // Запись либо удалена, либо имеет soft delete timestamp
        return !record || record[softDeleteField] !== null;
      },
      { timeout: getWaitTimeout(timeout) },
    );
  }

  /**
   * Проверить что запись существует
   * @param {string} table - Имя таблицы
   * @param {Object} where - Условия
   * @param {string} [message] - Сообщение при ошибке
   * @returns {Promise<Object>} Найденная запись
   */
  async assertExists(table, where, message) {
    const record = await this.db.findOne(table, where);
    const errorMsg =
      message ||
      `Record not found in ${table} with conditions: ${JSON.stringify(where)}`;
    expect(record, errorMsg).not.toBeNull();
    return record;
  }

  /**
   * Проверить что запись не существует
   * @param {string} table - Имя таблицы
   * @param {Object} where - Условия
   * @param {string} [message] - Сообщение при ошибке
   */
  async assertNotExists(table, where, message) {
    const record = await this.db.findOne(table, where);
    const errorMsg =
      message ||
      `Record should not exist in ${table} with conditions: ${JSON.stringify(where)}`;
    expect(record, errorMsg).toBeNull();
  }

  /**
   * Проверить значение поля
   * @param {string} table - Имя таблицы
   * @param {Object} where - Условия поиска
   * @param {string} field - Имя поля
   * @param {*} expectedValue - Ожидаемое значение
   * @param {string} [message] - Сообщение при ошибке
   */
  async assertFieldValue(table, where, field, expectedValue, message) {
    const record = await this.assertExists(table, where);
    const errorMsg = message || `Field ${field} should be ${expectedValue}`;
    expect(record[field], errorMsg).toBe(expectedValue);
  }

  /**
   * Проверить количество записей
   * @param {string} table - Имя таблицы
   * @param {Object} where - Условия
   * @param {number} expectedCount - Ожидаемое количество
   * @param {string} [message] - Сообщение при ошибке
   */
  async assertCount(table, where, expectedCount, message) {
    const count = await this.db.count(table, where);
    const errorMsg =
      message || `Expected ${expectedCount} records in ${table}, got ${count}`;
    expect(count, errorMsg).toBe(expectedCount);
  }

  // ==================== GENERIC METHODS ====================
  // Для модулей без специализированных верификаторов (competencies, gift-shop, etc.)

  /**
   * Проверить что запись создана в БД (generic)
   * @param {string} table - Имя таблицы
   * @param {string|number} id - ID записи
   * @param {number} [timeout] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись или null если нет подключения
   */
  async verifyRecordCreated(table, id, timeout) {
    if (this.skipIfNotConnected()) return null;
    const record = await this.waitForRecord(table, { id }, timeout);
    expect(record, `Запись ${id} не найдена в таблице ${table}`).not.toBeNull();
    return record;
  }

  /**
   * Проверить значение поля записи (generic)
   * @param {string} table - Имя таблицы
   * @param {string|number} id - ID записи
   * @param {string} field - Имя поля
   * @param {*} expectedValue - Ожидаемое значение
   */
  async verifyRecordField(table, id, field, expectedValue) {
    if (this.skipIfNotConnected()) return;
    const record = await this.db.findOne(table, { id });
    expect(record, `Запись ${id} не найдена в таблице ${table}`).not.toBeNull();
    expect(record[field], `Поле ${field} должно быть ${expectedValue}`).toBe(
      expectedValue,
    );
  }

  /**
   * Проверить что запись удалена (generic)
   * @param {string} table - Имя таблицы
   * @param {string|number} id - ID записи
   * @param {number} [timeout] - Таймаут ожидания
   */
  async verifyRecordDeleted(table, id, timeout) {
    if (this.skipIfNotConnected()) return;
    const deleted = await this.waitForDeletion(
      table,
      { id },
      "deleted_at",
      timeout,
    );
    expect(deleted, `Запись ${id} должна быть удалена из ${table}`).toBe(true);
  }

  /**
   * Проверить что количество записей не изменилось
   * @param {string} table - Имя таблицы
   * @param {Object} where - Условия
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyRecordCount(table, where, expectedCount) {
    if (this.skipIfNotConnected()) return;
    const count = await this.db.count(table, where);
    expect(count, `Ожидалось ${expectedCount} записей в ${table}`).toBe(
      expectedCount,
    );
  }

  /**
   * Подсчитать количество записей (без assertion)
   * @param {string} table - Имя таблицы
   * @param {Object} [where={}] - Условия фильтрации
   * @returns {Promise<number>} Количество записей или 0 если нет подключения
   */
  async countRecords(table, where = {}) {
    if (this.skipIfNotConnected()) return 0;
    return this.db.count(table, where);
  }

  /**
   * Задержка выполнения
   * @private
   * @param {number} ms - Миллисекунды
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
