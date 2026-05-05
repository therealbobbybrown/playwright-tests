// tests/load/seed/seed-config.js
// Конфигурация для нагрузочных тестов

/**
 * Конфигурация нагрузочных тестов
 *
 * После запуска seed скриптов, ID сущностей должны быть обновлены здесь
 * или загружены из environment variables
 */
export const LOAD_TEST_CONFIG = {
  // ID сущностей для нагрузочных тестов
  // Заполняются после seed или из env переменных
  largePrId: process.env.LOAD_TEST_LARGE_PR_ID || null,
  largeSurveyId: process.env.LOAD_TEST_LARGE_SURVEY_ID || null,
  largeDeptId: process.env.LOAD_TEST_LARGE_DEPT_ID || null,

  // PR с заполненными анкетами (для тестов экспорта и дашборда)
  largePrWithAnswersId: process.env.LOAD_TEST_LARGE_PR_ANSWERS_ID || 10396,
  largePrWithAnswersRevisionId:
    process.env.LOAD_TEST_LARGE_PR_ANSWERS_REVISION_ID || 9289,

  // Массив ID для batch операций
  testUserIds: [], // Заполняется из seed
  testDeptIds: [], // Заполняется из seed

  // Требования к тестовым данным
  requirements: {
    minUsers: 10000,
    minDepartments: 100,
    minUserGroups: 50,
    minPrParticipants: 10000,
    minSurveyResponses: 10000,
  },

  // Пороговые значения времени отклика (ms)
  thresholds: {
    // Простые GET запросы
    FAST: 1000,
    // Стандартные операции, списки с малым limit
    NORMAL: 2000,
    // Списки с пагинацией, средние объёмы
    SLOW: 3000,
    // Сложные запросы, статистика, фильтрация
    COMPLEX: 5000,
    // Очень сложные запросы, Dashboard
    VERY_COMPLEX: 10000,
    // Экспорт данных
    EXPORT: 30000,
    // Массовые операции (запуск PR на 10k человек)
    BULK_OPERATION: 60000,
    // Групповой отчёт ≤50 оцениваемых
    GROUP_REPORT_SMALL: 15000,
    // Групповой отчёт 51-500 оцениваемых
    GROUP_REPORT_MEDIUM: 30000,
    // Групповой отчёт 500+ оцениваемых
    GROUP_REPORT_LARGE: 90000,
    // Дашборд с 1000+ участниками
    DASHBOARD_LARGE: 15000,
  },

  // Параметры stress-тестов
  stress: {
    // Количество параллельных запросов
    parallelRequests: {
      low: 10,
      medium: 50,
      high: 100,
    },
    // Продолжительность sustained load (ms)
    sustainedDuration: 60000,
    // Целевой RPS
    targetRPS: 20,
  },

  // UI Performance thresholds
  webVitals: {
    // Largest Contentful Paint
    lcp: {
      good: 2500,
      needsImprovement: 4000,
    },
    // First Contentful Paint
    fcp: {
      good: 1800,
      needsImprovement: 3000,
    },
    // Cumulative Layout Shift
    cls: {
      good: 0.1,
      needsImprovement: 0.25,
    },
    // Time to Interactive
    tti: {
      good: 3800,
      needsImprovement: 7300,
    },
    // Minimum acceptable FPS during scroll
    minScrollFPS: 30,
  },

  // Пагинация для тестов
  pagination: {
    defaultLimit: 50,
    limits: [10, 50, 100, 500],
    offsets: [0, 100, 1000, 5000, 9000],
  },
};

/**
 * Проверяет готовность данных для нагрузочных тестов
 * @returns {Object} Статус готовности
 */
export function checkDataReadiness() {
  const { largePrId, largeSurveyId, largeDeptId, largePrWithAnswersId } =
    LOAD_TEST_CONFIG;

  return {
    hasLargePr: !!largePrId,
    hasLargePrWithAnswers: !!largePrWithAnswersId,
    hasLargeSurvey: !!largeSurveyId,
    hasLargeDept: !!largeDeptId,
    isReady: !!(largePrId && largeSurveyId && largeDeptId),
    missing: [
      !largePrId && "largePrId",
      !largePrWithAnswersId && "largePrWithAnswersId",
      !largeSurveyId && "largeSurveyId",
      !largeDeptId && "largeDeptId",
    ].filter(Boolean),
  };
}

export default LOAD_TEST_CONFIG;
