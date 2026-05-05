/**
 * TestRail Configuration
 * Module sections, P0 patterns, and other settings
 */

// Main Jinn section ID
const JINN_SECTION_ID = 628;

// Module sections mapping
// Format: module -> { parent, p0, p1 }
const MODULES = {
  auth: {
    name: "Авторизация",
    parent: 669,
    p0: 670,
    p1: 671,
  },
  home: {
    name: "Главная страница",
    parent: 672,
    p0: 673,
    p1: 674,
  },
  profile: {
    name: "Мой профиль",
    parent: 675,
    p0: 676,
    p1: 677,
  },
  "my-team": {
    name: "Моя команда",
    parent: 678,
    p0: 679,
    p1: 680,
  },
  "org-structure": {
    name: "Оргструктура",
    parent: 664,
    p0: 665,
    p1: 667,
  },
  objectives: {
    name: "Цели(OKR)",
    parent: 629,
    p0: 630,
    p1: 631,
  },
  feedback: {
    name: "Фидбек",
    parent: 651,
    p0: 652,
    p1: 666,
  },
  surveys: {
    name: "Опросы",
    parent: 641,
    p0: 642,
    p1: 661,
  },
  "performance-review": {
    name: "Оценка",
    parent: 645,
    p0: 646,
    p1: 647,
  },
  "development-plans": {
    name: "Развитие (ИПР)",
    parent: 634,
    p0: 635,
    p1: 636,
  },
  "gift-shop": {
    name: "Магазин подарков",
    parent: 681,
    p0: 682,
    p1: 683,
  },
  brand: {
    name: "Внешний вид",
    parent: 684,
    p0: 685,
    p1: 686,
  },
  settings: {
    name: "Настройка. Права пользователей",
    parent: 662,
    p0: 663,
    p1: 694,
  },
  backoffice: {
    name: "Бэкофис",
    parent: 659,
    p0: 660,
    p1: 668,
  },
  scenarios: {
    name: "Сценарии",
    parent: 655,
    p0: 656,
    p1: 657,
  },
  integrations: {
    name: "Интеграции",
    parent: 687,
    p0: 688,
    p1: 689,
  },
  notifications: {
    name: "Уведомления",
    parent: 690,
    p0: 691,
    p1: 692,
  },
  account: {
    name: "Аккаунт компании",
    parent: 702,
    p0: 703,
    p1: 704,
  },
  api: {
    name: "API тесты",
    parent: 699,
    p0: 700,
    p1: 701,
  },
  "virtual-currency": {
    name: "Виртуальная валюта",
    parent: 705,
    p0: 706,
    p1: 707,
  },
  competencies: {
    name: "Компетенции",
    parent: 865,
    p0: 866,
    p1: 867,
  },
  ninebox: {
    name: "Матрица потенциала (NineBox)",
    parent: 868,
    p0: 869,
    p1: 870,
  },
};

// File path to module mapping
// Used by `analyze` command to resolve spec files to modules
const FILE_PATHS = {
  "tests/functional/auth/": "auth",
  "tests/functional/home/": "home",
  "tests/functional/profile/": "profile",
  "tests/functional/my-team/": "my-team",
  "tests/functional/org-structure/": "org-structure",
  "tests/functional/objectives/": "objectives",
  "tests/functional/feedback/": "feedback",
  "tests/functional/surveys/": "surveys",
  "tests/functional/performance-review/": "performance-review",
  "tests/functional/development-plans/": "development-plans",
  "tests/functional/gift-shop/": "gift-shop",
  "tests/functional/brand/": "brand",
  "tests/functional/settings/": "settings",
  "tests/functional/account/": "account",
  "tests/functional/competencies/": "competencies",
  "tests/functional/api/competencies-": "competencies",
  "tests/functional/api/ninebox-": "ninebox",
  "tests/functional/ninebox/": "ninebox",
  "tests/functional/api/objectives-approval-": "objectives",
  "tests/functional/api/": "api",
  "tests/functional/roles/": "settings",
  "tests/functional/scenarios/": "scenarios",
  "tests/functional/virtual-currency/": "virtual-currency",
};

// Resolve file path to module name
function resolveModule(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  for (const [prefix, moduleName] of Object.entries(FILE_PATHS)) {
    if (normalized.includes(prefix)) return moduleName;
  }
  return null;
}

// P0 test patterns by module (partial match, case-insensitive)
const P0_PATTERNS = {
  auth: [
    "успешный вход",
    "вход по логину и паролю",
    "выход из системы",
    "редирект на логин",
  ],
  home: [
    "открывает главную через меню",
    "header отображается",
    "главная страница загружается",
    "боковое меню отображается",
  ],
  profile: ["отображение основной информации", "переход на страницу профиля"],
  "my-team": [
    "админ открывает раздел и видит",
    "открытие модалки",
    "дашборд работает",
  ],
  "org-structure": [
    "админ создаёт новый отдел",
    "админ открывает страницу импорта",
    "форму добавления сотрудника",
  ],
  objectives: ["создание цели", "редактирование цели", "удаление цели"],
  feedback: ["создание благодарности", "отправка фидбека"],
  surveys: [
    "анонимного регулярного опроса",
    "публичного регулярного опроса",
    "просмотр сводки результатов",
    "экспорт результатов опроса",
  ],
  "performance-review": ["создание ревью", "запуск цикла", "заполнение анкеты"],
  "development-plans": ["создание ипр", "редактирование плана"],
  "gift-shop": ["отображение каталога", "покупка товара"],
  account: ["управление аккаунтом", "открывает управление", "меняет язык"],
  api: [
    "smoke",
    "health",
    "crud",
    "авторизац",
    "signin",
    "signIn",
    "создание",
    "удаление",
    "обновление",
    "успешн",
    "базов",
  ],
};

// Technical step patterns to exclude from sync
const EXCLUDED_STEP_PATTERNS = [
  /^cleanup/i,
  /^очистка/i,
  /^setup/i,
  /^подготовка/i,
  /^teardown/i,
  /удалить тестов/i,
  /delete test/i,
  /clean up/i,
  /после теста/i,
  /after test/i,
];

// Priority IDs in TestRail
const PRIORITY = {
  CRITICAL: 4, // P0
  HIGH: 3, // P1
  MEDIUM: 2,
  LOW: 1,
};

// Get module config by name
function getModule(name) {
  const key = name.toLowerCase().replace(/\s+/g, "-");
  return MODULES[key] || null;
}

// Get all module names
function getModuleNames() {
  return Object.keys(MODULES);
}

// Check if test title matches P0 pattern
function isP0Test(title, moduleName) {
  const patterns = P0_PATTERNS[moduleName] || [];
  const lower = title.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

module.exports = {
  JINN_SECTION_ID,
  MODULES,
  FILE_PATHS,
  P0_PATTERNS,
  EXCLUDED_STEP_PATTERNS,
  PRIORITY,
  getModule,
  getModuleNames,
  resolveModule,
  isP0Test,
};
