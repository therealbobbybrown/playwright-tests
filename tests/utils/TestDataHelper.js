/**
 * Хелпер для генерации уникальных тестовых данных
 */

export class TestDataHelper {
  /**
   * Генерирует уникальное имя с префиксом
   * @param {string} prefix - Префикс для имени (например, 'Опрос', 'Департамент')
   * @returns {string} Уникальное имя
   */
  static generateUniqueName(prefix) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const HH = String(now.getHours()).padStart(2, "0");
    const MM = String(now.getMinutes()).padStart(2, "0");
    const rand = Math.random().toString(36).substring(2, 6);
    return `E2E_${prefix}_${mm}${dd}_${HH}${MM}_${rand}`;
  }

  /**
   * Генерирует уникальный email
   * @param {string} [domain='test.com'] - Домен для email
   * @returns {string} Уникальный email
   */
  static generateUniqueEmail(domain = "test.com") {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `e2e_${timestamp}_${random}@${domain}`;
  }

  /**
   * Генерирует случайное число в диапазоне
   * @param {number} min - Минимальное значение
   * @param {number} max - Максимальное значение
   * @returns {number} Случайное число
   */
  static getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Генерирует случайный элемент из массива
   * @param {Array} array - Массив элементов
   * @returns {*} Случайный элемент
   */
  static getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Генерирует текущую дату в формате DD.MM.YYYY
   * @returns {string} Дата в формате DD.MM.YYYY
   */
  static getCurrentDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    return `${day}.${month}.${year}`;
  }

  /**
   * Генерирует дату через N дней в формате DD.MM.YYYY
   * @param {number} days - Количество дней
   * @returns {string} Дата в формате DD.MM.YYYY
   */
  static getFutureDate(days) {
    const now = new Date();
    now.setDate(now.getDate() + days);
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    return `${day}.${month}.${year}`;
  }

  /**
   * Проверяет, соответствует ли имя тестовому префиксу
   * @param {string} name - Имя для проверки
   * @returns {boolean} True если это тестовое имя
   */
  static isTestData(name) {
    return name && typeof name === "string" && name.startsWith("E2E_");
  }
}
