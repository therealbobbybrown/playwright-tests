// tests/utils/seed/dashboard-test-data.js
// Конфигурация тестовых данных для дашборда руководителя

/**
 * Статусы по направлениям оценки
 */
export const DIRECTION_STATUS = {
  COMPLETE: "complete",
  AWAITING: "awaiting",
  IN_PROGRESS: "in_progress",
  NOT_APPROVED: "not_approved", // Коллеги не утверждены
  UNKNOWN: "unknown", // Коллеги не предложены
};

/**
 * Типы направлений оценки
 */
export const DIRECTION_TYPE = {
  SELF: "self",
  MANAGER: "head", // В API называется "head"
  COLLEAGUE: "colleague",
  SUBORDINATE: "subordinate",
  CUSTOM: "custom",
};

/**
 * Тексты статусов в UI (русские)
 */
export const STATUS_TEXT = {
  [DIRECTION_STATUS.COMPLETE]: "Пройдена",
  [DIRECTION_STATUS.AWAITING]: ["В процессе", "В ожидании", "Ожидается"],
  [DIRECTION_STATUS.IN_PROGRESS]: "В процессе",
  [DIRECTION_STATUS.NOT_APPROVED]: [
    "Коллеги не утверждены",
    "Не утверждены",
    "Перейти к утверждению",
  ],
  [DIRECTION_STATUS.UNKNOWN]: [
    "Коллеги не предложены",
    "Не предложены",
    "Предложить",
  ],
};

/**
 * Паттерны названий PR для тестов статусов
 * Используются для поиска PR по названию (без хардкода ID)
 *
 * PR создаются через DashboardStatusSeed с использованием реальных подчинённых менеджера
 * v3 - версия с ограниченным fillQuestionnaires для частичного заполнения
 */
export const PR_TITLE_PATTERNS = {
  SELF_COMPLETE_MANAGER_AWAITING: "v8_Self✓_Manager",
  ALL_AWAITING: "v8_All_Awaiting",
  COLLEAGUES_NOT_APPROVED: "v8_Colleagues_NotApproved",
  ALL_COMPLETE: "v8_All_Complete",
};

/**
 * Ожидаемые статусы для каждого сценария
 */
export const EXPECTED_STATUSES = {
  SELF_COMPLETE_MANAGER_AWAITING: {
    self: DIRECTION_STATUS.COMPLETE,
    head: DIRECTION_STATUS.AWAITING,
  },
  ALL_AWAITING: {
    self: DIRECTION_STATUS.AWAITING,
    head: DIRECTION_STATUS.AWAITING,
    subordinate: DIRECTION_STATUS.AWAITING,
    colleague: DIRECTION_STATUS.AWAITING,
  },
  COLLEAGUES_NOT_APPROVED: {
    self: DIRECTION_STATUS.AWAITING,
    head: DIRECTION_STATUS.AWAITING,
    colleague: DIRECTION_STATUS.NOT_APPROVED,
  },
  ALL_COMPLETE: {
    self: DIRECTION_STATUS.COMPLETE,
    head: DIRECTION_STATUS.COMPLETE,
    colleague: DIRECTION_STATUS.COMPLETE,
  },
};

/**
 * @deprecated Используйте PR_TITLE_PATTERNS и динамический поиск вместо хардкода
 * Оставлено для обратной совместимости - будет заполняться динамически
 */
export const DASHBOARD_TEST_PRs = {
  // Будут заполнены динамически при загрузке тестов
  SELF_COMPLETE_MANAGER_AWAITING: {
    id: null,
    title: null,
    statuses: EXPECTED_STATUSES.SELF_COMPLETE_MANAGER_AWAITING,
  },
  ALL_AWAITING: {
    id: null,
    title: null,
    statuses: EXPECTED_STATUSES.ALL_AWAITING,
  },
  COLLEAGUES_NOT_APPROVED: {
    id: null,
    title: null,
    statuses: EXPECTED_STATUSES.COLLEAGUES_NOT_APPROVED,
  },
  SELF_AND_MANAGER_COMPLETE: {
    id: null,
    title: null,
    statuses: EXPECTED_STATUSES.ALL_COMPLETE,
  },
  COLLEAGUES_COMPLETE: { id: null, title: null, statuses: {} },
  WITH_CUSTOM_DIRECTIONS: { id: null, title: null, statuses: {} },
};

/**
 * Хелпер для получения PR по статусу направления
 * @param {string} directionType - Тип направления (self, head, colleague, etc.)
 * @param {string} status - Статус (complete, awaiting, unknown)
 * @returns {Object|null} PR конфигурация или null
 */
export function getPRByDirectionStatus(directionType, status) {
  for (const [, pr] of Object.entries(DASHBOARD_TEST_PRs)) {
    if (pr.statuses[directionType] === status) {
      return pr;
    }
  }
  return null;
}

/**
 * Хелпер для получения PR по ID
 * @param {number} prId - ID PR
 * @returns {Object|null} PR конфигурация или null
 */
export function getPRById(prId) {
  for (const [, pr] of Object.entries(DASHBOARD_TEST_PRs)) {
    if (pr.id === prId) {
      return pr;
    }
  }
  return null;
}

/**
 * Получить все PR с определённым статусом для определённого направления
 * @param {string} directionType - Тип направления
 * @param {string} status - Статус
 * @returns {Array} Массив PR конфигураций
 */
export function getPRsByDirectionStatus(directionType, status) {
  const result = [];
  for (const [, pr] of Object.entries(DASHBOARD_TEST_PRs)) {
    if (pr.statuses[directionType] === status) {
      result.push(pr);
    }
  }
  return result;
}

/**
 * Найти PR по паттерну названия в списке
 * @param {Array} prs - Список PRs из API
 * @param {string} pattern - Паттерн для поиска в title
 * @returns {Object|null} Найденный PR или null
 */
export function findPRByPattern(prs, pattern) {
  return prs.find((pr) => pr.title?.includes(pattern)) || null;
}

/**
 * Загрузить данные PR динамически (вызывать из beforeAll теста)
 * @param {Array} availablePRs - Список доступных PRs из API дашборда
 * @returns {Object} Объект с найденными PRs
 */
export function loadDashboardTestPRs(availablePRs) {
  const result = {};

  for (const [key, pattern] of Object.entries(PR_TITLE_PATTERNS)) {
    const pr = findPRByPattern(availablePRs, pattern);
    if (pr) {
      result[key] = {
        id: pr.id,
        title: pr.title,
        statuses: EXPECTED_STATUSES[key] || {},
      };
      // Обновляем глобальный объект для обратной совместимости
      if (DASHBOARD_TEST_PRs[key]) {
        DASHBOARD_TEST_PRs[key].id = pr.id;
        DASHBOARD_TEST_PRs[key].title = pr.title;
      }
    }
  }

  // Для SELF_AND_MANAGER_COMPLETE используем ALL_COMPLETE
  if (result.ALL_COMPLETE) {
    result.SELF_AND_MANAGER_COMPLETE = result.ALL_COMPLETE;
    DASHBOARD_TEST_PRs.SELF_AND_MANAGER_COMPLETE = { ...result.ALL_COMPLETE };
  }

  return result;
}
