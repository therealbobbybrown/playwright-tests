#!/usr/bin/env node
/**
 * Upload Dashboard Filters test cases to TestRail
 *
 * Usage:
 *   node scripts/testrail/upload-dashboard-filters.cjs [--dry-run]
 */

const client = require("./client.cjs");
const config = require("./config.cjs");
const { sanitizeStepContent } = require("./step-utils.cjs");

const DRY_RUN = process.argv.includes("--dry-run");

// My Team module section for P1 tests
const MY_TEAM_P1_SECTION = config.MODULES["my-team"].p1; // 680

// Test cases to upload
const TEST_CASES = [
  {
    title:
      'DASH-FILTER-001: Модалка "Результаты для" открывается и содержит все элементы',
    priority: 4, // P0 - Critical
    preconditions:
      "Авторизован как менеджер с подчинёнными. PR с заполненными анкетами.",
    steps: [
      {
        content: 'Открыть дашборд "Моя команда"',
        expected: "Страница открыта",
      },
      {
        content: 'Переключиться на вкладку "Оценка команды"',
        expected: "Вкладка активна",
      },
      {
        content: 'Проверить кнопку фильтра "Результаты для"',
        expected: 'Кнопка видна, содержит текст "Результаты для"',
      },
      {
        content: "Кликнуть на кнопку фильтра",
        expected: "Открывается модалка",
      },
      {
        content: "Проверить вкладки (Сотрудники/Отделы/Группы)",
        expected: "Вкладки присутствуют (опционально, зависит от прав)",
      },
      {
        content: "Проверить поле поиска",
        expected: "Поле поиска присутствует",
      },
      {
        content: 'Проверить кнопку "Применить"',
        expected: "Кнопка присутствует",
      },
      {
        content: "Проверить список сотрудников",
        expected: "Список не пустой, содержит ФИО",
      },
      { content: "Нажать Escape", expected: "Модалка закрывается" },
    ],
  },
  {
    title:
      'DASH-FILTER-002: Вкладка "Сотрудники" отображает дерево подчинённых',
    priority: 3, // P1
    preconditions: "Авторизован как администратор.",
    steps: [
      {
        content: 'Открыть дашборд → "Оценка команды"',
        expected: "Страница открыта",
      },
      {
        content: 'Открыть модалку "Результаты для"',
        expected: "Модалка открыта",
      },
      {
        content: 'Проверить вкладку "Сотрудники"',
        expected: "Вкладка активна по умолчанию",
      },
      {
        content: "Проверить список",
        expected: "Отображаются ФИО сотрудников, количество > 0",
      },
    ],
  },
  {
    title: 'DASH-FILTER-003: Вкладка "Отделы" отображает структуру организации',
    priority: 3,
    preconditions: "Авторизован как администратор.",
    steps: [
      {
        content: 'Открыть модалку "Результаты для"',
        expected: "Модалка открыта",
      },
      {
        content: 'Запомнить содержимое вкладки "Сотрудники"',
        expected: "Список запомнен",
      },
      {
        content: 'Переключиться на вкладку "Отделы"',
        expected: "Вкладка активна",
      },
      {
        content: "Проверить список",
        expected: "Отображаются отделы/подразделения",
      },
      {
        content: 'Сравнить с вкладкой "Сотрудники"',
        expected: "Контент отличается",
      },
    ],
  },
  {
    title: 'DASH-FILTER-004: Вкладка "Группы" отображает список групп',
    priority: 3,
    preconditions: "Авторизован как администратор. Есть группы пользователей.",
    steps: [
      {
        content: 'Открыть модалку "Результаты для"',
        expected: "Модалка открыта",
      },
      {
        content: 'Переключиться на вкладку "Группы"',
        expected: "Вкладка активна",
      },
      {
        content: "Проверить список",
        expected: "Отображаются названия групп (не только ФИО)",
      },
    ],
  },
  {
    title: "DASH-FILTER-005: Поиск сотрудника в модалке фильтра",
    priority: 3,
    preconditions: "Авторизован как администратор.",
    steps: [
      {
        content: 'Открыть модалку "Результаты для"',
        expected: "Модалка открыта",
      },
      { content: "Запомнить начальный список", expected: "Список запомнен" },
      {
        content: "Ввести часть имени в поле поиска",
        expected: "Список фильтруется",
      },
      {
        content: "Проверить результаты",
        expected: "Все результаты содержат поисковый запрос",
      },
      {
        content: "Очистить поле поиска",
        expected: "Восстанавливается полный список",
      },
    ],
  },
  {
    title: "DASH-FILTER-006: Выбор сотрудника в фильтре обновляет таблицу",
    priority: 4, // P0 - Critical
    preconditions: "Авторизован как администратор. В таблице есть сотрудники.",
    steps: [
      {
        content: 'Открыть дашборд "Оценка команды"',
        expected: "Страница открыта",
      },
      {
        content: "Запомнить количество строк в таблице",
        expected: "Количество запомнено",
      },
      {
        content: 'Открыть модалку "Результаты для"',
        expected: "Модалка открыта",
      },
      { content: 'Нажать "Сбросить все"', expected: "Все чекбоксы сняты" },
      { content: "Выбрать одного сотрудника", expected: "Чекбокс отмечен" },
      { content: 'Нажать "Применить"', expected: "Модалка закрывается" },
      {
        content: "Проверить таблицу",
        expected: "В таблице только выбранный сотрудник",
      },
      {
        content: "Проверить кнопку фильтра",
        expected: "Текст содержит имя выбранного",
      },
    ],
  },
  {
    title: "DASH-FILTER-007: Сброс фильтра восстанавливает полный список",
    priority: 3,
    preconditions: "Авторизован как администратор. В таблице > 1 сотрудника.",
    steps: [
      {
        content: "Запомнить начальное количество в таблице",
        expected: "Количество запомнено",
      },
      {
        content: "Применить фильтр на одного сотрудника",
        expected: "В таблице 1 сотрудник",
      },
      {
        content: "Открыть модалку и выбрать всех сотрудников",
        expected: "Все чекбоксы отмечены",
      },
      { content: 'Нажать "Применить"', expected: "Модалка закрывается" },
      { content: "Проверить таблицу", expected: "Количество = начальному" },
    ],
  },
  {
    title: "DASH-FILTER-008: Мультиселект — выбор нескольких сотрудников",
    priority: 3,
    preconditions: "Авторизован как администратор. В таблице >= 2 сотрудников.",
    steps: [
      {
        content: 'Открыть модалку "Результаты для"',
        expected: "Модалка открыта",
      },
      { content: 'Нажать "Сбросить все"', expected: "Все чекбоксы сняты" },
      {
        content: "Выбрать 2 сотрудников",
        expected: 'Счётчик показывает "Выбрано: 2"',
      },
      { content: 'Нажать "Применить"', expected: "Модалка закрывается" },
      {
        content: "Проверить таблицу",
        expected: "В таблице ровно 2 выбранных сотрудника",
      },
      {
        content: "Проверить кнопку фильтра",
        expected: "Текст содержит имена выбранных",
      },
    ],
  },
];

async function main() {
  console.log("\n=== Upload Dashboard Filters Tests to TestRail ===");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Target section: ${MY_TEAM_P1_SECTION} (Моя команда P1)\n`);
  console.log(`Total cases to upload: ${TEST_CASES.length}\n`);

  let uploaded = 0;
  let errors = 0;

  for (const tc of TEST_CASES) {
    const caseData = {
      title: tc.title,
      template_id: 2, // Test Case (Steps) template
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
        const result = await client.addCase(MY_TEAM_P1_SECTION, caseData);
        console.log(`    ✓ Created: C${result.id}`);
        uploaded++;
        await client.delay(200);
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
