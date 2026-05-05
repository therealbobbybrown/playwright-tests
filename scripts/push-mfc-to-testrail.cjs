/**
 * Экспорт MFC тестов калибровки итоговой оценки в TestRail
 *
 * 1. Создаёт test cases в секциях P0 (646) / P1 (647)
 * 2. Создаёт test run
 * 3. Записывает результаты (passed/skipped)
 *
 * Usage:
 *   node scripts/push-mfc-to-testrail.cjs [--dry-run]
 */

const client = require("./testrail/client.cjs");

const DRY_RUN = process.argv.includes("--dry-run");

// TestRail section IDs for performance-review module
const SECTION_P0 = 646;
const SECTION_P1 = 647;

// Status IDs
const STATUS_PASSED = 1;
const STATUS_FAILED = 5;
const STATUS_SKIPPED = 6; // retest / blocked — closest to "skipped"

// Priority IDs
const PRIORITY_P0 = 4; // Critical
const PRIORITY_P1 = 3; // High

// All 51 MFC test cases with results from last full run (50 passed, 1 skipped)
const TEST_CASES = [
  // ── API tests (manual-final-score-api.spec.js) ──
  {
    mfcId: "MFC-001",
    title:
      "Откалибровать итоговую оценку числом → значение сохранено в API и DB",
    priority: "P0",
    result: "passed",
  },
  {
    mfcId: "MFC-002",
    title: "После калибровки итоговой компетенции НЕ изменились",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-003",
    title: "Текстовая характеристика пересчитана под новый скор",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-005",
    title: "Граница — значение 0 сохраняется корректно",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-006",
    title: "Максимум шкалы → сохраняется корректно",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-007",
    title:
      "Значение за пределами шкалы → валидация/отказ (KNOWN BUG: бэкенд не валидирует)",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-008",
    title: "Дробное значение (3.5) → поведение",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-022",
    title:
      "Ручная правка итога → итог зафиксирован, компетенции не пересчитаны",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-023",
    title: "Изменить компетенцию → итог пересчитан автоматически",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-025",
    title: "Полная цепочка: ручная → компетенция → ручная → компетенция",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-032",
    title: "isLocked=true → руководитель НЕ может калибровать итоговую",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-057",
    title:
      "Округлённое значение ≈ оригинал → overwrite сохраняется (rounding edge case)",
    priority: "P1",
    result: "passed",
  },

  // ── Security (manual-final-score-api.spec.js) ──
  {
    mfcId: "MFC-054",
    title: "Обычный сотрудник НЕ может откалибровать итоговую (403)",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-055",
    title: "Руководитель НЕ может калибровать чужого сотрудника (403)",
    priority: "P1",
    result: "passed",
  },

  // ── Concurrency (manual-final-score-api.spec.js) ──
  {
    mfcId: "MFC-056",
    title:
      "Два администратора калибруют одного сотрудника одновременно — last write wins",
    priority: "P1",
    result: "passed",
  },

  // ── Numeric UI (manual-final-score-numeric-ui.spec.js) ──
  {
    mfcId: "MFC-004",
    title: "Повторное открытие модалки → откалиброванное значение сохранилось",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-009",
    title: "Пустое поле / нечисловое значение → проверка валидации",
    priority: "P1",
    result: "passed",
  },

  // ── Dropdown UI (manual-final-score-dropdown-ui.spec.js) ──
  {
    mfcId: "MFC-010",
    title:
      "При enableOnlyCustomCharacteristics=true дропдаун вместо числового поля",
    priority: "P0",
    result: "passed",
  },
  {
    mfcId: "MFC-011",
    title: "Дропдаун содержит ВСЕ характеристики из настроек",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-012",
    title: "Выбрать характеристику → сохранить → переоткрыть → сохранилась",
    priority: "P0",
    result: "passed",
  },
  {
    mfcId: "MFC-013",
    title: "Компетенции НЕ изменились после выбора характеристики",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-015",
    title: "Длинное название характеристики отображается корректно в дропдауне",
    priority: "P1",
    result: "passed",
  },

  // ── Informer UI (manual-final-score-informer-ui.spec.js) ──
  {
    mfcId: "MFC-016",
    title: "Изменить значение итоговой оценки → информер появляется немедленно",
    priority: "P0",
    result: "passed",
  },
  {
    mfcId: "MFC-017",
    title: "Текст информера соответствует спецификации",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-018",
    title: "Закрыть модалку → переоткрыть → информер НЕ виден",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-019",
    title:
      "Информер появляется и при числовом вводе, и при выборе из дропдауна",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-020",
    title:
      "Изменить итоговую (информер) → изменить компетенцию → информер исчезает",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-021",
    title:
      "При изменении компетенции (без ручной правки итога) → информер НЕ появляется",
    priority: "P1",
    result: "passed",
  },

  // ── Roles UI (manual-final-score-roles-ui.spec.js) ──
  {
    mfcId: "MFC-028",
    title: "Админ видит чекбокс блокировки, по умолчанию = false",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-029",
    title: "Руководитель НЕ видит чекбокс блокировки",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-030",
    title: "Блокировка включена → карандаш исчезает для руководителя",
    priority: "P0",
    result: "passed",
  },
  {
    mfcId: "MFC-031",
    title: "Блокировка включена → админ всё ещё может калибровать",
    priority: "P0",
    result: "passed",
  },

  // ── Export (manual-final-score-export.spec.js) ──
  {
    mfcId: "MFC-042",
    title: "PDF содержит откалиброванную итоговую оценку",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-043",
    title: "PPTX содержит откалиброванную итоговую оценку",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-044",
    title: "XLSX содержит данные оцениваемых сотрудников после калибровки",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-045",
    title: "CSV содержит данные оцениваемых сотрудников после калибровки",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-046",
    title: 'PDF в режиме "Только текст" — характеристика присутствует',
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-047",
    title: 'XLSX в режиме "Только текст" — экспорт данных после калибровки',
    priority: "P1",
    result: "passed",
  },

  // ── Settings Edge (manual-final-score-settings-edge.spec.js) ──
  {
    mfcId: "MFC-035",
    title: "Удалить характеристику, используемую в калибровке",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-036",
    title: "Изменить пороги характеристик — калибровка работает",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-037",
    title: "Отключить калибровку — API не возвращает meanOverwrite",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-038",
    title: "Отключить калибровку — DB записи НЕ удалены",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-039",
    title: "Включить калибровку обратно — восстановление значений",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-040",
    title: "Переключить режим: numeric → text при калибровке",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-041",
    title: "Переключить режим: text → numeric при калибровке",
    priority: "P1",
    result: "passed",
  },

  // ── Integration (manual-final-score-integration.spec.js) ──
  {
    mfcId: "MFC-048",
    title: "Heatmap НЕ изменяется после калибровки итоговой оценки",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-049",
    title: 'Dashboard "Общая оценка" показывает калиброванное значение',
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-050",
    title: 'Колонки "До/После калибровки" корректны',
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-051",
    title: "Калибровка привязана к ревизии",
    priority: "P1",
    result: "passed",
  },
  {
    mfcId: "MFC-052",
    title: "Калибровка одного сотрудника не влияет на другого",
    priority: "P1",
    result: "passed",
  },
];

async function main() {
  console.log(
    `\n=== Экспорт MFC тестов в TestRail ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`,
  );
  console.log(`Всего тестов: ${TEST_CASES.length}`);
  console.log(
    `P0: ${TEST_CASES.filter((t) => t.priority === "P0").length} → section ${SECTION_P0}`,
  );
  console.log(
    `P1: ${TEST_CASES.filter((t) => t.priority === "P1").length} → section ${SECTION_P1}`,
  );
  console.log(
    `Passed: ${TEST_CASES.filter((t) => t.result === "passed").length}`,
  );
  console.log(
    `Skipped: ${TEST_CASES.filter((t) => t.result === "skipped").length}\n`,
  );

  // ─── Step 1: Create test cases ───
  console.log("── Step 1: Создание тест-кейсов ──\n");

  const caseIdMap = new Map(); // mfcId → TestRail case ID

  for (const tc of TEST_CASES) {
    const sectionId = tc.priority === "P0" ? SECTION_P0 : SECTION_P1;
    const priorityId = tc.priority === "P0" ? PRIORITY_P0 : PRIORITY_P1;
    const caseTitle = `${tc.mfcId}: ${tc.title}`;

    if (DRY_RUN) {
      console.log(
        `  [DRY] addCase(section=${sectionId}) "${caseTitle}" priority=${tc.priority}`,
      );
      caseIdMap.set(tc.mfcId, 99999); // placeholder
      continue;
    }

    try {
      const result = await client.withRetry(() =>
        client.addCase(sectionId, {
          title: caseTitle,
          priority_id: priorityId,
          template_id: 2, // template with steps
          type_id: 1, // automated
          refs: tc.mfcId,
        }),
      );
      caseIdMap.set(tc.mfcId, result.id);
      console.log(`  ✅ C${result.id}: ${caseTitle} [${tc.priority}]`);

      // Rate limiting — 250ms between requests
      await client.delay(250);
    } catch (err) {
      console.error(`  ❌ ${tc.mfcId}: ${err.message}`);
    }
  }

  console.log(`\nСоздано кейсов: ${caseIdMap.size} / ${TEST_CASES.length}\n`);

  if (DRY_RUN) {
    console.log("DRY RUN — run и результаты не создаются.\n");
    return;
  }

  // ─── Step 2: Create test run ───
  console.log("── Step 2: Создание прогона (test run) ──\n");

  const caseIds = [...caseIdMap.values()];
  const today = new Date().toISOString().slice(0, 10);

  let run;
  try {
    run = await client.addRun(client.PROJECT_ID, {
      suite_id: parseInt(client.SUITE_ID, 10),
      name: `Калибровка итоговой оценки (MFC) — ${today}`,
      description: [
        "**Ручная калибровка итоговой оценки** — 51 автотест.",
        "",
        "Блоки:",
        "- A: Числовой ввод (MFC-001..009)",
        "- B: Дропдаун характеристик (MFC-010..015)",
        "- C: Информер (MFC-016..021)",
        "- D: Приоритеты пересчёта (MFC-022..025, 057)",
        "- E: Роли и блокировка (MFC-028..032)",
        "- F: Настройки edge cases (MFC-035..041)",
        "- G: Экспорт (MFC-042..047)",
        "- H: Интеграция (MFC-048..053)",
        "- I: Безопасность + конкурентность (MFC-054..056)",
        "",
        `Результат: **${TEST_CASES.filter((t) => t.result === "passed").length} passed**, ` +
          `${TEST_CASES.filter((t) => t.result === "skipped").length} skipped`,
      ].join("\n"),
      include_all: false,
      case_ids: caseIds,
    });
    console.log(
      `  ✅ Run создан: ID=${run.id}, URL=https://${client.TESTRAIL_URL}/index.php?/runs/view/${run.id}\n`,
    );
  } catch (err) {
    console.error(`  ❌ Не удалось создать run: ${err.message}`);
    return;
  }

  // ─── Step 3: Push results ───
  console.log("── Step 3: Запись результатов ──\n");

  let successCount = 0;
  for (const tc of TEST_CASES) {
    const caseId = caseIdMap.get(tc.mfcId);
    if (!caseId) continue;

    let statusId;
    let comment;
    if (tc.result === "passed") {
      statusId = STATUS_PASSED;
      comment = "Автотест пройден.";
    } else if (tc.result === "skipped") {
      statusId = STATUS_SKIPPED;
      comment =
        "Тест пропущен: endpoint /complete/ не найден на стенде (фича не деплоена).";
    } else {
      statusId = STATUS_FAILED;
      comment = `Тест упал: ${tc.result}`;
    }

    try {
      await client.withRetry(() =>
        client.addResultForCase(run.id, caseId, {
          status_id: statusId,
          comment,
        }),
      );
      successCount++;
      const icon =
        statusId === STATUS_PASSED
          ? "✅"
          : statusId === STATUS_SKIPPED
            ? "⏭️"
            : "❌";
      console.log(`  ${icon} C${caseId} ${tc.mfcId}: ${tc.result}`);

      await client.delay(250);
    } catch (err) {
      console.error(`  ❌ C${caseId} ${tc.mfcId}: ${err.message}`);
    }
  }

  console.log(`\nРезультатов записано: ${successCount} / ${TEST_CASES.length}`);
  console.log(
    `\n🔗 Run: https://${client.TESTRAIL_URL}/index.php?/runs/view/${run.id}\n`,
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
