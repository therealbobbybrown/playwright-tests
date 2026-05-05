/**
 * URL паттерны для waitForURL и проверок навигации
 *
 * Использование:
 * import { URL_PATTERNS } from '../tests/utils/urls.js';
 * await page.waitForURL(URL_PATTERNS.HOME, { timeout: TIMEOUTS.PAGE_LOAD });
 */

export const URL_PATTERNS = {
  // ========================
  // Общие
  // ========================
  /** Главная страница после логина /ru */
  HOME: /\/ru(\/|$|\?)/,
  /** Дашборд */
  DASHBOARD: /\/dashboard\/?($|\?)/,
  /** Статистика */
  STATISTICS: /\/statistics\/?($|\?)/,

  // ========================
  // Авторизация / Профиль
  // ========================
  /** Страница профиля (главная вкладка) */
  PROFILE_MAIN: /\/profile\/(\d+\/)?\?tab=main/i,
  /** Настройки аккаунта */
  ACCOUNT_SETTINGS: /\/profile\/settings\//,

  // ========================
  // Цели (OKR)
  // ========================
  /** Все цели */
  OBJECTIVES_ALL: /objectives\/all/i,
  /** Цели (общая) */
  OBJECTIVES: /\/objectives(\/|\?|$)/,
  /** Добавление новой цели */
  OBJECTIVES_ADD: /\/objectives\/new\/add\/?/,

  // ========================
  // Фидбек
  // ========================
  /** Страница просмотра фидбека /feedbacks/{id}/ */
  FEEDBACK_VIEW: /\/feedbacks\/\d+\/?/,
  /** Добавление фидбека */
  FEEDBACK_ADD: /\/feedbacks\/add\/?/,
  /** Добавление запроса фидбека */
  FEEDBACK_REQUEST_ADD: /\/requests\/add\/?/,

  // ========================
  // Опросы
  // ========================
  /** Список опросов */
  SURVEYS_LIST: /\/manager\/company\/surveys(\/|\?|$)/,
  /** Конструктор опроса (add или {id}) */
  SURVEY_CONSTRUCTOR: /\/manager\/company\/surveys\/(add\/|[0-9]+\/?)/,
  /** Добавление опроса */
  SURVEY_ADD: /\/manager\/company\/surveys\/add\/?/,
  /** Шаблоны опросов */
  SURVEY_TEMPLATES: /\/manager\/company\/surveys\/templates\/?/,
  /** Настройки публикации опроса */
  SURVEY_PUBLICATION: /\/surveys\/\d+\/publication/i,

  // ========================
  // Performance Review
  // ========================
  /** Список Performance Reviews */
  PR_LIST: /\/manager\/performance-reviews/,
  /** Конструктор/конфигурация PR (add или {id}) */
  PR_CONFIG: /\/manager\/performance-reviews\/(add\/|\d+)/,
  /** Карточка PR по ID */
  PR_CARD: /\/manager\/performance-reviews\/\d+/,
  /** Результаты PR */
  PR_RESULTS: /\/performance-reviews\/\d+\/results/,

  // ========================
  // Орг. структура
  // ========================
  /** Конструктор структуры */
  STRUCTURE_CONSTRUCTOR: /\/manager\/structure\/constructor(\/|\?|$)/,
  /** Настройка отделов */
  STRUCTURE_DEPARTMENTS: /\/manager\/structure\/departments(\/|\?|$)/,
  /** Список сотрудников */
  STRUCTURE_USERS: /\/manager\/structure\/users(\/|\?|$)/,
  /** Добавление сотрудника */
  STRUCTURE_USER_ADD: /\/manager\/structure\/users\/add(\/|\?|$)/,
  /** Группы пользователей */
  STRUCTURE_USER_GROUPS: /\/manager\/structure\/user-groups/i,
  /** Карточка группы пользователей */
  STRUCTURE_USER_GROUP_CARD: /\/manager\/structure\/user-groups\/\d+/i,
  /** Приглашение по ссылке */
  STRUCTURE_INVITE_LINKS: /\/manager\/structure\/invite-links(\/|\?|$)/,
  /** Импорт сотрудников */
  STRUCTURE_IMPORT: /\/manager\/structure\/import(\/|\?|$)/,

  // ========================
  // Магазин подарков / Валюта
  // ========================
  /** Магазин подарков */
  GIFT_SHOP: /\/gift-shop(\/|\?|$)/,
  /** Настройки магазина */
  GIFT_SHOP_SETTINGS: /\/manager\/gift-shop\/settings(\/|\?|$)/,
  /** История операций (karma transactions) */
  OPERATIONS_HISTORY: /\/manager\/karma\/transactions(\/|\?|$)/,
  /** Депозит виртуальной валюты */
  VIRTUAL_CURRENCY_DEPOSIT: /\/ru\/manager\/karma\/transfers\/deposit\/?/,

  // ========================
  // Настройки компании
  // ========================
  /** Брендирование */
  BRAND_SETTINGS: /\/manager\/company\/brand\/?($|\?)/,

  // ========================
  // Орг. структура (детали)
  // ========================
  /** Страница конкретного отдела */
  STRUCTURE_DEPARTMENT_CARD:
    /\/manager\/structure\/departments\/department\/\d+\/?/i,

  // ========================
  // Фидбек (доп.)
  // ========================
  /** Страница "Отправлено" или ID фидбека */
  FEEDBACK_SENT_OR_VIEW: /\/feedbacks\/sent|\/feedbacks\/\d+\/?/,

  // ========================
  // Роли и разрешения
  // ========================
  /** Список ролей */
  ROLES_LIST: /\/manager\/company\/roles(\/|\?|$)/,
  /** Редактирование роли */
  ROLE_EDIT: /\/manager\/company\/roles\/\d+\/?/,

  // ========================
  // Сценарии (Workflows)
  // ========================
  /** Список сценариев */
  SCENARIOS_LIST: /\/manager\/scenarios(\/|\?|$)/,
  /** Создание сценария */
  SCENARIOS_ADD: /\/manager\/scenarios\/add\/?/,
  /** Просмотр/редактирование сценария */
  SCENARIOS_VIEW: /\/manager\/scenarios\/\d+\/?/,
};
