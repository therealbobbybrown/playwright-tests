// tests/utils/db/config.js
// Конфигурация для работы с БД в тестах

/**
 * Конфигурация DB верификации
 *
 * Переменные окружения:
 * - DB_STRICT: 'true' для строгого режима (падать при недоступной БД)
 * - DB_WAIT_TIMEOUT: таймаут ожидания записей (по умолчанию 5000ms)
 * - DB_POLL_INTERVAL: интервал polling (по умолчанию 500ms)
 *
 * @example
 * // В .env для CI:
 * DB_STRICT=true
 * DB_WAIT_TIMEOUT=10000
 */
export const DB_CONFIG = {
  /**
   * Строгий режим: тесты падают при недоступной БД
   * По умолчанию: false (graceful skip)
   */
  STRICT: process.env.DB_STRICT === "true",

  /**
   * Таймаут ожидания появления/изменения записи (мс)
   * По умолчанию: 5000ms
   */
  WAIT_TIMEOUT: parseInt(process.env.DB_WAIT_TIMEOUT) || 5000,

  /**
   * Интервал polling при ожидании (мс)
   * По умолчанию: 500ms
   */
  POLL_INTERVAL: parseInt(process.env.DB_POLL_INTERVAL) || 500,
};

/**
 * Получить таймаут с учётом переопределения
 * @param {number} [override] - Переопределённое значение
 * @returns {number}
 */
export function getWaitTimeout(override) {
  return override ?? DB_CONFIG.WAIT_TIMEOUT;
}

/**
 * Получить интервал polling с учётом переопределения
 * @param {number} [override] - Переопределённое значение
 * @returns {number}
 */
export function getPollInterval(override) {
  return override ?? DB_CONFIG.POLL_INTERVAL;
}
