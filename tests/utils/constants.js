/**
 * Константы и таймауты для тестов
 */

import { getTestUserPassword } from "./credentials.js";

// Таймауты (в миллисекундах)
export const TIMEOUTS = {
  // Микро таймауты (для анимаций и небольших задержек)
  MICRO: 100, // 100мс - минимальная пауза
  TINY: 200, // 200мс - небольшая пауза после действий
  MINI: 300, // 300мс - для анимаций сворачивания меню
  SMALL: 500, // 500мс - для ожидания UI реакций
  ANIMATION: 1_000, // 1 сек - для анимаций и переходов

  // Базовые таймауты
  SHORT: 5_000, // 5 сек - быстрые операции
  MEDIUM: 10_000, // 10 сек - стандартные ожидания
  LONG: 30_000, // 30 сек - долгие операции
  EXTRA_LONG: 60_000, // 60 сек - очень долгие операции (login, тяжёлые страницы)

  // Специфичные таймауты
  NAVIGATION: 30_000, // Навигация между страницами
  AUTOSAVE: 10_000, // Ожидание автосохранения
  MODAL_OPEN: 5_000, // Открытие модального окна
  MODAL_CLOSE: 10_000, // Закрытие модального окна (включает API сохранение)
  NETWORK_IDLE: 10_000, // Ожидание networkidle
  ELEMENT_VISIBLE: 15_000, // Ожидание видимости элемента
  PAGE_LOAD: 20_000, // Загрузка страницы после действия
  URL_CHANGE: 25_000, // Ожидание изменения URL
};

// Тестовые данные
export const TEST_DATA = {
  get DEFAULT_PASSWORD() {
    return getTestUserPassword();
  },
  TEST_PREFIX: "E2E_Test",
  MIN_ANONYMITY_THRESHOLD: 5,
};

// ========================
// ТЕГИ ДЛЯ ТЕСТОВ
// ========================
// Справочные константы для тегирования тестов.
// Использование: добавляйте теги в названия тестов, например:
// test.describe('My Tests @surveys @creation', () => {...})
// test('my test @critical @smoke', async () => {...})

// Приоритеты тестов
export const PRIORITY = {
  CRITICAL: "@critical",
  HIGH: "@high",
  MEDIUM: "@medium",
  LOW: "@low",
};

// Типы тестов (для тегов)
export const TEST_TYPE = {
  SMOKE: "@smoke",
  REGRESSION: "@regression",
  API: "@api",
  UI: "@ui",
  E2E: "@e2e",
};

// Workflow теги
export const WORKFLOW = {
  CREATION: "@creation",
  PUBLICATION: "@publication",
  RESULTS: "@results",
  MANAGEMENT: "@management",
  FILLING: "@filling",
};
