#!/usr/bin/env node
/**
 * Upload Text Characteristics test cases to TestRail
 *
 * Usage:
 *   node scripts/testrail/upload-text-characteristics.cjs [--dry-run]
 */

const client = require("./client.cjs");
const config = require("./config.cjs");
const { sanitizeStepContent } = require("./step-utils.cjs");

const DRY_RUN = process.argv.includes("--dry-run");

// Performance Review module section for P1 tests
const PR_P1_SECTION = config.MODULES["performance-review"].p1; // 647

// Test cases to upload
const TEST_CASES = [
  // === settings-text-characteristics-regression.spec.js (8 tests) ===
  {
    title:
      'SET-REG-001: Тогл "Указать текстовые характеристики" виден в модалке настроек',
    priority: 3, // P1
    preconditions:
      "Авторизован как администратор. PR с заполненными анкетами существует.",
    steps: [
      {
        content: 'Открыть страницу PR → вкладка "Результаты"',
        expected: 'Вкладка "Результаты" открыта',
      },
      {
        content: "Нажать кнопку настроек (шестерёнка)",
        expected: 'Модальное окно "Настройка статистики" открыто',
      },
      {
        content: 'Найти секцию "Характеристики оценки"',
        expected: "Секция видна",
      },
      {
        content: 'Проверить наличие тогла "Указать текстовые характеристики"',
        expected: "Тогл виден и доступен для взаимодействия",
      },
    ],
  },
  {
    title:
      'SET-REG-002: Можно включить тогл "Указать текстовые характеристики"',
    priority: 3,
    preconditions:
      "Авторизован как администратор. PR существует. Тогл текстовых характеристик выключен.",
    steps: [
      {
        content: "Открыть модальное окно настроек статистики",
        expected: "Модалка открыта",
      },
      {
        content: 'Кликнуть на тогл "Указать текстовые характеристики"',
        expected: 'Тогл переключился в состояние "включено"',
      },
      {
        content: "Проверить появление полей диапазонов",
        expected:
          "Появились поля для ввода диапазонов и названий характеристик",
      },
    ],
  },
  {
    title:
      'SET-REG-003: Можно выключить тогл "Указать текстовые характеристики"',
    priority: 3,
    preconditions:
      "Авторизован как администратор. PR существует. Тогл текстовых характеристик включён.",
    steps: [
      {
        content: "Открыть модальное окно настроек статистики",
        expected: "Модалка открыта, тогл включён",
      },
      {
        content: "Кликнуть на тогл для выключения",
        expected: 'Тогл переключился в состояние "выключено"',
      },
      {
        content: "Проверить скрытие полей диапазонов",
        expected: "Поля диапазонов скрылись",
      },
    ],
  },
  {
    title:
      "SET-REG-004: Настройка текстовых характеристик сохраняется через API",
    priority: 3,
    preconditions: "Авторизован как администратор. PR существует.",
    steps: [
      {
        content: "Включить тогл текстовых характеристик",
        expected: "Тогл включён",
      },
      { content: 'Нажать кнопку "Сохранить"', expected: "Модалка закрылась" },
      {
        content: "Выполнить GET /statistics/settings/",
        expected: "API возвращает enableCustomCharacteristics = true",
      },
    ],
  },
  {
    title: "SET-REG-005: Настройка загружается после перезагрузки страницы",
    priority: 3,
    preconditions:
      "Авторизован как администратор. PR с включёнными текстовыми характеристиками.",
    steps: [
      { content: "Перезагрузить страницу PR", expected: "Страница загружена" },
      {
        content: "Открыть модальное окно настроек",
        expected: "Модалка открыта",
      },
      {
        content: "Проверить состояние тогла",
        expected: 'Тогл находится в состоянии "включено"',
      },
    ],
  },
  {
    title: "SET-REG-006: DB верификация - настройка сохраняется в БД",
    priority: 3,
    preconditions: "Авторизован как администратор. Доступ к БД настроен.",
    steps: [
      {
        content: "Включить текстовые характеристики через UI",
        expected: "Настройка сохранена",
      },
      {
        content:
          "Проверить запись в таблице performance_review_statistics_settings",
        expected: "Запись enableCustomCharacteristics = 1 найдена",
      },
      {
        content: "Выключить текстовые характеристики",
        expected: "Настройка сохранена",
      },
      {
        content: "Проверить обновление записи в БД",
        expected: "Запись enableCustomCharacteristics = 0",
      },
    ],
  },
  {
    title:
      "SET-REG-007: Полный цикл - включить, сохранить, перезагрузить, проверить",
    priority: 3,
    preconditions: "Авторизован как администратор. PR существует.",
    steps: [
      {
        content: "Открыть настройки и включить текстовые характеристики",
        expected: "Тогл включён",
      },
      { content: "Сохранить настройки", expected: "Модалка закрылась" },
      { content: "Перезагрузить страницу", expected: "Страница загружена" },
      {
        content: "Открыть настройки и проверить состояние",
        expected: "Тогл остался включённым",
      },
      {
        content: "Проверить API",
        expected: "enableCustomCharacteristics = true",
      },
    ],
  },
  {
    title: "SET-REG-008: При выключении тогла диапазоны скрываются",
    priority: 3,
    preconditions:
      "Авторизован как администратор. Текстовые характеристики включены с 3 диапазонами.",
    steps: [
      {
        content: "Проверить видимость полей диапазонов",
        expected: "Видно 3 поля",
      },
      {
        content: "Выключить тогл текстовых характеристик",
        expected: "Тогл выключен",
      },
      {
        content: "Проверить видимость полей",
        expected: "Поля диапазонов скрыты (0 видимых)",
      },
    ],
  },

  // === settings-show-only-custom.spec.js (19 tests) ===
  {
    title:
      'SET-001: Чек-бокс "Показывать только текстовую характеристику" виден при включённых характеристиках',
    priority: 3,
    preconditions:
      "Авторизован как администратор. PR с включённой калибровкой.",
    steps: [
      { content: "Открыть настройки статистики", expected: "Модалка открыта" },
      {
        content: 'Включить тогл "Указать текстовые характеристики"',
        expected: "Тогл включён",
      },
      {
        content:
          'Проверить видимость чек-бокса "Показывать только текстовую характеристику"',
        expected: "Чек-бокс виден под полями диапазонов",
      },
    ],
  },
  {
    title:
      'SET-002: Чек-бокс "Показывать только текстовую характеристику" скрыт при выключенных характеристиках',
    priority: 3,
    preconditions:
      "Авторизован как администратор. PR с включённой калибровкой.",
    steps: [
      { content: "Открыть настройки статистики", expected: "Модалка открыта" },
      {
        content: "Убедиться что тогл характеристик выключен",
        expected: "Тогл выключен",
      },
      {
        content: "Проверить видимость чек-бокса",
        expected:
          'Чек-бокс "Показывать только текстовую характеристику" НЕ виден',
      },
    ],
  },
  {
    title:
      "SET-003: API возвращает enableOnlyCustomCharacteristics в настройках",
    priority: 3,
    preconditions: "Авторизован как администратор. PR существует.",
    steps: [
      {
        content: "Выполнить GET /statistics/settings/",
        expected: "Ответ получен",
      },
      {
        content: "Проверить наличие поля enableOnlyCustomCharacteristics",
        expected: "Поле присутствует в ответе (boolean)",
      },
    ],
  },
  {
    title: "SET-004: enableOnlyCustomCharacteristics можно изменить через API",
    priority: 3,
    preconditions: "Авторизован как администратор. PR существует.",
    steps: [
      {
        content: "Выполнить POST с enableOnlyCustomCharacteristics = true",
        expected: "Запрос успешен (200)",
      },
      {
        content: "Выполнить GET и проверить значение",
        expected: "enableOnlyCustomCharacteristics = true",
      },
      {
        content: "Выполнить POST с enableOnlyCustomCharacteristics = false",
        expected: "Запрос успешен (200)",
      },
      {
        content: "Выполнить GET и проверить значение",
        expected: "enableOnlyCustomCharacteristics = false",
      },
    ],
  },
  {
    title:
      "SET-005: При enableCustomCharacteristics=true в таблице появляются текстовые характеристики",
    priority: 3,
    preconditions:
      "Авторизован как администратор. PR с заполненными анкетами. Калибровка включена.",
    steps: [
      {
        content:
          "Включить текстовые характеристики (enableCustomCharacteristics=true)",
        expected: "Настройка сохранена",
      },
      {
        content: "Добавить 3 характеристики: Низко, Средне, Высоко",
        expected: "Характеристики добавлены",
      },
      {
        content: 'Перейти на вкладку "Результаты"',
        expected: "Таблица результатов отображается",
      },
      {
        content: "Проверить ячейки итоговой оценки в верхней таблице",
        expected: "Ячейки содержат текст характеристики рядом с числом",
      },
      {
        content: "Проверить нижнюю таблицу сотрудников",
        expected: 'Формат: "число + текст" (например "4.3Высоко")',
      },
    ],
  },
  {
    title:
      "SET-006: При enableOnlyCustomCharacteristics=true числовая оценка скрывается",
    priority: 3,
    preconditions:
      "Авторизован как администратор. PR с текстовыми характеристиками.",
    steps: [
      {
        content: 'Включить "Показывать только текстовую характеристику"',
        expected: "Чек-бокс включён",
      },
      { content: "Сохранить настройки", expected: "Настройки сохранены" },
      {
        content: "Проверить таблицу результатов",
        expected: 'Ячейки содержат ТОЛЬКО текст без числа (например "Высоко")',
      },
    ],
  },
  {
    title:
      "SET-007: Модалка калибровки показывает текстовую характеристику (enableCustomCharacteristics=true)",
    priority: 3,
    preconditions:
      "Авторизован как администратор. PR с калибровкой и текстовыми характеристиками.",
    steps: [
      {
        content: "Открыть модальное окно калибровки сотрудника",
        expected: "Модалка открыта",
      },
      { content: "Найти поле итоговой оценки", expected: "Поле найдено" },
      {
        content: "Проверить отображение",
        expected: "Виден бейдж с текстовой характеристикой",
      },
    ],
  },
  {
    title:
      "SET-008: Модалка калибровки — только текст (enableOnlyCustomCharacteristics=true)",
    priority: 3,
    preconditions:
      'Авторизован как администратор. PR с "только текстовая характеристика".',
    steps: [
      {
        content: "Открыть модальное окно калибровки сотрудника",
        expected: "Модалка открыта",
      },
      {
        content: "Проверить отображение итоговой оценки",
        expected: "Виден ТОЛЬКО текст характеристики (без числа)",
      },
    ],
  },
  {
    title:
      "SET-009: Модалка калибровки — числовая оценка скрывается при enableOnlyCustomCharacteristics",
    priority: 3,
    preconditions:
      "Авторизован как администратор. PR с калибровкой. enableOnlyCustomCharacteristics=true.",
    steps: [
      {
        content: "Открыть модальное окно калибровки",
        expected: "Модалка открыта",
      },
      {
        content: "Проверить видимость числовой оценки",
        expected: "Числовая оценка НЕ видна",
      },
      {
        content: "Проверить видимость текстовой характеристики",
        expected: "Текстовая характеристика видна",
      },
    ],
  },
  {
    title: 'SET-010: Хитмэп показывает колонку "Характеристика"',
    priority: 3,
    preconditions:
      "Авторизован как администратор. PR с текстовыми характеристиками.",
    steps: [
      {
        content: 'Перейти на вкладку "Результаты"',
        expected: "Вкладка открыта",
      },
      { content: "Найти хитмэп (карту компетенций)", expected: "Хитмэп виден" },
      {
        content: 'Проверить наличие колонки "Характеристика"',
        expected: 'Колонка "Характеристика" присутствует в таблице',
      },
    ],
  },
  {
    title: "SET-011: Результаты сотрудника — числовая оценка + текст",
    priority: 3,
    preconditions:
      "Авторизован как администратор. PR с заполненными анкетами и текстовыми характеристиками.",
    steps: [
      {
        content: "Открыть страницу результатов конкретного сотрудника",
        expected: "Страница открыта",
      },
      { content: "Найти бейдж итоговой оценки", expected: "Бейдж найден" },
      {
        content: "Проверить формат отображения",
        expected: 'Формат: "число + текст" (например "4.5Высоко")',
      },
    ],
  },
  {
    title: "SET-012: Результаты сотрудника — только текст",
    priority: 3,
    preconditions:
      "Авторизован как администратор. enableOnlyCustomCharacteristics=true.",
    steps: [
      {
        content: "Открыть страницу результатов сотрудника",
        expected: "Страница открыта",
      },
      { content: "Найти бейдж итоговой оценки", expected: "Бейдж найден" },
      {
        content: "Проверить формат отображения",
        expected: "Только текст характеристики (без числа)",
      },
    ],
  },
  {
    title:
      "SET-013: Результаты сотрудника — только число (характеристики выключены)",
    priority: 3,
    preconditions:
      "Авторизован как администратор. enableCustomCharacteristics=false.",
    steps: [
      {
        content: "Открыть страницу результатов сотрудника",
        expected: "Страница открыта",
      },
      {
        content: "Проверить бейдж итоговой оценки",
        expected: 'Только числовая оценка (например "4.5")',
      },
    ],
  },
  {
    title:
      "SET-014: Расшаренные результаты — только число (характеристики выключены)",
    priority: 3,
    preconditions:
      "Авторизован как администратор. Доступ к результатам расшарен оцениваемому.",
    steps: [
      {
        content: "Выключить текстовые характеристики",
        expected: "Настройка сохранена",
      },
      {
        content: "Расшарить доступ к результатам сотруднику",
        expected: "Доступ открыт",
      },
      {
        content: "Войти под оцениваемым сотрудником",
        expected: "Авторизация успешна",
      },
      {
        content: "Открыть расшаренные результаты",
        expected: "Страница результатов открыта",
      },
      {
        content: "Проверить формат оценки",
        expected: 'Только число (например "4.3")',
      },
    ],
  },
  {
    title: "SET-015: Расшаренные результаты — число + текст",
    priority: 3,
    preconditions:
      "Авторизован как администратор. enableCustomCharacteristics=true, enableOnlyCustomCharacteristics=false.",
    steps: [
      {
        content: "Настроить отображение: число + текст",
        expected: "Настройка сохранена",
      },
      {
        content: "Расшарить результаты и войти под оцениваемым",
        expected: "Страница открыта",
      },
      {
        content: "Проверить формат оценки",
        expected: 'Число + текст (например "4.3Высоко")',
      },
    ],
  },
  {
    title: "SET-016: Расшаренные результаты — только текст",
    priority: 3,
    preconditions:
      "Авторизован как администратор. enableOnlyCustomCharacteristics=true.",
    steps: [
      {
        content: "Настроить отображение: только текст",
        expected: "Настройка сохранена",
      },
      {
        content: "Расшарить результаты и войти под оцениваемым",
        expected: "Страница открыта",
      },
      {
        content: "Проверить формат оценки",
        expected: 'Только текст (например "Высоко")',
      },
    ],
  },
  {
    title: 'SET-017: Дашборд "Моя команда" — итоговая оценка только число',
    priority: 3,
    preconditions:
      "Авторизован как руководитель. PR без текстовых характеристик.",
    steps: [
      { content: 'Открыть дашборд "Моя команда"', expected: "Дашборд открыт" },
      { content: "Выбрать PR в селекторе", expected: "PR выбран" },
      {
        content: 'Проверить колонку "Характеристика" на хитмэпе',
        expected: "Колонка НЕ видна",
      },
      {
        content: "Проверить бейдж оценки в таблице",
        expected: 'Только число (например "4.3")',
      },
      {
        content: "Открыть модалку калибровки сотрудника",
        expected: "Числовая оценка видна, текстовая - нет",
      },
    ],
  },
  {
    title: 'SET-018: Дашборд "Моя команда" — итоговая оценка число + текст',
    priority: 3,
    preconditions:
      "Авторизован как руководитель. PR с текстовыми характеристиками.",
    steps: [
      { content: 'Открыть дашборд "Моя команда"', expected: "Дашборд открыт" },
      { content: "Выбрать PR с характеристиками", expected: "PR выбран" },
      {
        content: 'Проверить колонку "Характеристика"',
        expected: "Колонка видна",
      },
      {
        content: "Проверить бейдж оценки",
        expected: 'Число + текст (например "4.7Высоко")',
      },
      {
        content: "Открыть модалку калибровки",
        expected: "И числовая, и текстовая оценка видны",
      },
    ],
  },
  {
    title: 'SET-019: Дашборд "Моя команда" — итоговая оценка только текст',
    priority: 3,
    preconditions:
      "Авторизован как руководитель. PR с enableOnlyCustomCharacteristics=true.",
    steps: [
      { content: 'Открыть дашборд "Моя команда"', expected: "Дашборд открыт" },
      { content: 'Выбрать PR с "только текст"', expected: "PR выбран" },
      {
        content: 'Проверить колонку "Характеристика"',
        expected: "Колонка видна",
      },
      {
        content: "Проверить бейдж оценки",
        expected: 'Только текст (например "Высоко")',
      },
      {
        content: "Открыть модалку калибровки",
        expected: "Текстовая характеристика видна",
      },
    ],
  },

  // === settings-negative-scenarios.spec.js (5 tests) ===
  {
    title:
      "SET-NEG-001: При выключенной калибровке структура таблицы другая — нет колонки калибровки",
    priority: 3,
    preconditions:
      "Авторизован как администратор. PR с заполненными анкетами. Калибровка ВЫКЛЮЧЕНА.",
    steps: [
      {
        content: "Выключить калибровку через API (enableCalibration=false)",
        expected: "Калибровка выключена",
      },
      {
        content: 'Открыть страницу PR → вкладка "Результаты"',
        expected: "Вкладка открыта",
      },
      {
        content: "Проверить структуру таблицы",
        expected: 'Колонка "Итоговая оценка после калибровки" ОТСУТСТВУЕТ',
      },
      {
        content: "Проверить наличие текстовых характеристик",
        expected:
          "Текстовые бейджи НЕ показываются (характеристики недоступны без калибровки)",
      },
    ],
  },
  {
    title:
      'SET-NEG-002: При выключении тогла характеристик чекбокс "только текст" скрывается',
    priority: 3,
    preconditions:
      'Авторизован как администратор. PR с включёнными текстовыми характеристиками и чекбоксом "только текст".',
    steps: [
      {
        content: "Открыть модальное окно настроек статистики",
        expected: "Модалка открыта",
      },
      {
        content: 'Проверить что чекбокс "только текст" виден',
        expected: "Чекбокс виден",
      },
      {
        content: 'Выключить тогл "Указать текстовые характеристики"',
        expected: "Тогл выключен",
      },
      {
        content: 'Проверить состояние чекбокса "только текст"',
        expected: "Чекбокс СКРЫТ (не виден при выключенных характеристиках)",
      },
    ],
  },
  {
    title:
      "SET-NEG-003: После выключения характеристик в таблице видны только числа",
    priority: 3,
    preconditions:
      "Авторизован как администратор. PR с ранее включёнными текстовыми характеристиками.",
    steps: [
      {
        content: "Выключить текстовые характеристики через API",
        expected: "enableCustomCharacteristics=false",
      },
      {
        content: 'Открыть страницу PR → вкладка "Результаты"',
        expected: "Вкладка открыта",
      },
      {
        content: "Проверить ячейки с итоговыми оценками",
        expected: "Видны ТОЛЬКО числовые оценки (4.2, 3.8 и т.д.)",
      },
      {
        content: "Проверить отсутствие текстовых бейджей",
        expected: 'Текстовые бейджи "Низко", "Средне", "Высоко" ОТСУТСТВУЮТ',
      },
    ],
  },
  {
    title:
      "SET-NEG-004: Модалка калибровки недоступна при выключенной калибровке",
    priority: 3,
    preconditions:
      "Авторизован как администратор. PR с заполненными анкетами. Калибровка ВЫКЛЮЧЕНА.",
    steps: [
      {
        content: "Выключить калибровку через API",
        expected: "enableCalibration=false, enableResponsesOverwriting=false",
      },
      {
        content: 'Открыть страницу PR → вкладка "Результаты"',
        expected: "Вкладка открыта",
      },
      {
        content: 'Проверить наличие колонки "после калибровки"',
        expected: "Колонка ОТСУТСТВУЕТ",
      },
      {
        content: "Проверить наличие кнопки редактирования (карандаш)",
        expected: "Кнопка ОТСУТСТВУЕТ — модалка калибровки недоступна",
      },
    ],
  },
  {
    title:
      "SET-NEG-005: Дашборд не показывает текстовые характеристики при выключенных настройках",
    priority: 3,
    preconditions:
      "Авторизован как руководитель. PR с ВЫКЛЮЧЕННЫМИ текстовыми характеристиками.",
    steps: [
      {
        content: "Выключить текстовые характеристики через API",
        expected: "enableCustomCharacteristics=false",
      },
      { content: 'Открыть дашборд "Моя команда"', expected: "Дашборд открыт" },
      {
        content: "Найти карточку сотрудника с оценкой из данного PR",
        expected: "Карточка найдена",
      },
      {
        content: "Проверить бейдж итоговой оценки",
        expected:
          'Текстовые характеристики ("Низко", "Средне", "Высоко") ОТСУТСТВУЮТ',
      },
    ],
  },
];

async function main() {
  console.log("\n=== Upload Text Characteristics Tests to TestRail ===");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Target section: ${PR_P1_SECTION} (Performance Review P1)\n`);
  console.log(`Total cases to upload: ${TEST_CASES.length}\n`);

  let uploaded = 0;
  let errors = 0;

  for (const tc of TEST_CASES) {
    const caseData = {
      title: tc.title,
      template_id: 2, // Test Case (Steps) template - required for custom_steps_separated
      priority_id: tc.priority,
      custom_preconds: tc.preconditions,
      custom_steps_separated: tc.steps.map((s) => ({
        content: sanitizeStepContent(s.content),
        expected: s.expected,
        additional_info: "",
        refs: "",
      })),
    };

    console.log(
      `  [${uploaded + 1}/${TEST_CASES.length}] ${tc.title.substring(0, 60)}...`,
    );

    if (!DRY_RUN) {
      try {
        const result = await client.addCase(PR_P1_SECTION, caseData);
        console.log(`    ✓ Created: C${result.id}`);
        uploaded++;
        await client.delay(200); // Rate limiting
      } catch (e) {
        console.log(`    ✗ Error: ${e.message}`);
        errors++;
      }
    } else {
      uploaded++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Errors: ${errors}`);

  if (DRY_RUN) {
    console.log(
      "\n[DRY RUN] No changes made. Run without --dry-run to upload.",
    );
  }
}

main().catch((e) => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
