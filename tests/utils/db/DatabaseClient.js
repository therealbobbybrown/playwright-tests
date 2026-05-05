// tests/utils/db/DatabaseClient.js
// Базовый клиент для работы с MySQL/MariaDB

import mysql from "mysql2/promise";
import { allure } from "allure-playwright";

/**
 * Database Client для верификации данных в MySQL/MariaDB
 *
 * Использует connection pooling для эффективного управления соединениями.
 * Все запросы логируются в Allure.
 *
 * @example
 * const db = new DatabaseClient();
 * await db.connect();
 *
 * // Простой запрос
 * const users = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
 *
 * // Проверка существования
 * const exists = await db.exists('surveys', { id: surveyId });
 *
 * // Поиск записи
 * const survey = await db.findOne('surveys', { id: surveyId });
 *
 * await db.disconnect();
 */
export class DatabaseClient {
  constructor() {
    this.pool = null;
    this.enableLogging = true;
  }

  /**
   * Инициализировать connection pool
   * @param {Object} [config] - Опциональная конфигурация (по умолчанию из .env)
   */
  async connect(config = {}) {
    if (this.pool) {
      return; // Уже подключены
    }

    const poolConfig = {
      host: config.host || process.env.DB_HOST,
      port: parseInt(config.port || process.env.DB_PORT || "3306", 10),
      user: config.user || process.env.DB_USER,
      password: config.password || process.env.DB_PASSWORD,
      database: config.database || process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: config.connectionLimit || 5,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: 10000,
      // Для безопасности - запрет multiple statements
      multipleStatements: false,
    };

    // Проверяем наличие обязательных параметров
    if (!poolConfig.host || !poolConfig.user || !poolConfig.database) {
      throw new Error(
        "Database configuration is incomplete. " +
          "Please set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env file.",
      );
    }

    this.pool = mysql.createPool(poolConfig);

    // Проверяем соединение
    try {
      const connection = await this.pool.getConnection();
      connection.release();
      console.log(
        `[DatabaseClient] Connected to ${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`,
      );
    } catch (error) {
      // При ошибке подключения - закрываем pool и устанавливаем null
      await this.pool.end();
      this.pool = null;
      throw error;
    }
  }

  /**
   * Закрыть connection pool
   */
  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log("[DatabaseClient] Disconnected");
    }
  }

  /**
   * Логировать запрос в Allure
   * @param {string} operation - Тип операции (SELECT, COUNT, EXISTS)
   * @param {Object} details - Детали операции
   */
  logToAllure(operation, { query, params, result, duration, error }) {
    if (!this.enableLogging) return;

    try {
      const statusEmoji = error ? "❌" : "✅";
      const durationStr = duration ? ` (${duration}ms)` : "";

      allure.step(`${statusEmoji} DB ${operation}${durationStr}`, () => {
        allure.attachment("SQL Query", query, "text/plain");

        if (params && params.length > 0) {
          allure.attachment(
            "Parameters",
            JSON.stringify(params, null, 2),
            "application/json",
          );
        }

        if (result !== undefined && !error) {
          const resultStr = Array.isArray(result)
            ? `${result.length} row(s) returned`
            : JSON.stringify(result, null, 2);
          allure.attachment("Result", resultStr, "text/plain");
        }

        if (error) {
          allure.attachment("Error", error.message, "text/plain");
        }
      });
    } catch {
      // Игнорируем ошибки логирования (Allure может быть недоступен)
    }
  }

  /**
   * Выполнить SQL запрос
   * @param {string} query - SQL запрос
   * @param {Array} [params] - Параметры для prepared statement
   * @returns {Promise<Array>} Результаты запроса
   */
  async query(query, params = []) {
    if (!this.pool) {
      throw new Error(
        "DatabaseClient не подключён. Вызовите connect() первым.",
      );
    }

    const start = Date.now();
    try {
      const [rows] = await this.pool.execute(query, params);
      const duration = Date.now() - start;

      this.logToAllure("SELECT", { query, params, result: rows, duration });
      return rows;
    } catch (error) {
      const duration = Date.now() - start;
      this.logToAllure("SELECT", { query, params, duration, error });
      throw error;
    }
  }

  /**
   * Получить одну запись
   * @param {string} query - SQL запрос
   * @param {Array} [params] - Параметры
   * @returns {Promise<Object|null>} Одна запись или null
   */
  async queryOne(query, params = []) {
    const rows = await this.query(query, params);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Проверить существование записи
   * @param {string} table - Имя таблицы
   * @param {Object} where - Условия {column: value}
   * @returns {Promise<boolean>}
   */
  async exists(table, where) {
    const { conditions, params } = this._buildWhereClause(where);
    const query = `SELECT 1 FROM ${this._escapeIdentifier(table)} WHERE ${conditions} LIMIT 1`;

    const start = Date.now();
    try {
      const [rows] = await this.pool.execute(query, params);
      const duration = Date.now() - start;
      const exists = rows.length > 0;

      this.logToAllure("EXISTS", { query, params, result: exists, duration });
      return exists;
    } catch (error) {
      const duration = Date.now() - start;
      this.logToAllure("EXISTS", { query, params, duration, error });
      throw error;
    }
  }

  /**
   * Получить количество записей
   * @param {string} table - Имя таблицы
   * @param {Object} [where] - Условия
   * @returns {Promise<number>}
   */
  async count(table, where = {}) {
    let query = `SELECT COUNT(*) as count FROM ${this._escapeIdentifier(table)}`;
    let params = [];

    if (Object.keys(where).length > 0) {
      const whereClause = this._buildWhereClause(where);
      query += ` WHERE ${whereClause.conditions}`;
      params = whereClause.params;
    }

    const start = Date.now();
    try {
      const [rows] = await this.pool.execute(query, params);
      const duration = Date.now() - start;
      const count = rows[0]?.count || 0;

      this.logToAllure("COUNT", { query, params, result: count, duration });
      return count;
    } catch (error) {
      const duration = Date.now() - start;
      this.logToAllure("COUNT", { query, params, duration, error });
      throw error;
    }
  }

  /**
   * Найти записи по условиям
   * @param {string} table - Имя таблицы
   * @param {Object} [where] - Условия
   * @param {Object} [options] - {limit, offset, orderBy, select}
   * @returns {Promise<Array>}
   */
  async findAll(table, where = {}, options = {}) {
    const selectClause = options.select || "*";
    let query = `SELECT ${selectClause} FROM ${this._escapeIdentifier(table)}`;
    let params = [];

    if (Object.keys(where).length > 0) {
      const whereClause = this._buildWhereClause(where);
      query += ` WHERE ${whereClause.conditions}`;
      params = whereClause.params;
    }

    if (options.orderBy) {
      query += ` ORDER BY ${options.orderBy}`;
    }

    if (options.limit) {
      query += ` LIMIT ${parseInt(options.limit, 10)}`;
    }

    if (options.offset) {
      query += ` OFFSET ${parseInt(options.offset, 10)}`;
    }

    return this.query(query, params);
  }

  /**
   * Найти одну запись
   * @param {string} table - Имя таблицы
   * @param {Object} where - Условия
   * @returns {Promise<Object|null>}
   */
  async findOne(table, where) {
    const results = await this.findAll(table, where, { limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Найти запись по ID
   * @param {string} table - Имя таблицы
   * @param {string|number} id - ID записи
   * @returns {Promise<Object|null>}
   */
  async findById(table, id) {
    return this.findOne(table, { id });
  }

  /**
   * Включить/выключить логирование
   * @param {boolean} enabled
   */
  setLogging(enabled) {
    this.enableLogging = enabled;
  }

  /**
   * Проверить активно ли подключение к БД
   * @returns {boolean}
   */
  isConnected() {
    return this.pool !== null;
  }

  /**
   * Построить WHERE условие из объекта
   * @private
   * @param {Object} where - {column: value, ...}
   * @returns {{conditions: string, params: Array}}
   */
  _buildWhereClause(where) {
    const conditions = [];
    const params = [];

    for (const [key, value] of Object.entries(where)) {
      if (value === null) {
        conditions.push(`${this._escapeIdentifier(key)} IS NULL`);
      } else if (Array.isArray(value)) {
        // IN clause
        const placeholders = value.map(() => "?").join(", ");
        conditions.push(`${this._escapeIdentifier(key)} IN (${placeholders})`);
        params.push(...value);
      } else {
        conditions.push(`${this._escapeIdentifier(key)} = ?`);
        params.push(value);
      }
    }

    return {
      conditions: conditions.join(" AND "),
      params,
    };
  }

  /**
   * Экранировать идентификатор (имя таблицы/колонки)
   * @private
   * @param {string} identifier
   * @returns {string}
   */
  _escapeIdentifier(identifier) {
    // Простая проверка на безопасность идентификатора
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
      throw new Error(`Invalid identifier: ${identifier}`);
    }
    return `\`${identifier}\``;
  }
}
