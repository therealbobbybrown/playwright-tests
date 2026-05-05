/**
 * Извлечение test.step() из MFC spec-файлов и пуш в TestRail
 *
 * Usage:
 *   node scripts/push-mfc-steps.cjs [--dry-run]
 */

const fs = require("fs");
const path = require("path");
const client = require("./testrail/client.cjs");
const { buildTestRailSteps } = require("./testrail/step-utils.cjs");
const { EXCLUDED_STEP_PATTERNS } = require("./testrail/config.cjs");

const DRY_RUN = process.argv.includes("--dry-run");

// MFC → TestRail case ID mapping (from push-mfc-to-testrail.cjs run)
const MFC_TO_CASE = {
  "MFC-001": 4447,
  "MFC-002": 4448,
  "MFC-003": 4449,
  "MFC-005": 4450,
  "MFC-006": 4451,
  "MFC-007": 4452,
  "MFC-008": 4453,
  "MFC-022": 4454,
  "MFC-023": 4455,
  "MFC-025": 4456,
  "MFC-032": 4457,
  "MFC-057": 4458,
  "MFC-054": 4459,
  "MFC-055": 4460,
  "MFC-056": 4461,
  "MFC-004": 4462,
  "MFC-009": 4463,
  "MFC-010": 4464,
  "MFC-011": 4465,
  "MFC-012": 4466,
  "MFC-013": 4467,
  "MFC-015": 4468,
  "MFC-016": 4469,
  "MFC-017": 4470,
  "MFC-018": 4471,
  "MFC-019": 4472,
  "MFC-020": 4473,
  "MFC-021": 4474,
  "MFC-028": 4475,
  "MFC-029": 4476,
  "MFC-030": 4477,
  "MFC-031": 4478,
  "MFC-042": 4479,
  "MFC-043": 4480,
  "MFC-044": 4481,
  "MFC-045": 4482,
  "MFC-046": 4483,
  "MFC-047": 4484,
  "MFC-035": 4485,
  "MFC-036": 4486,
  "MFC-037": 4487,
  "MFC-038": 4488,
  "MFC-039": 4489,
  "MFC-040": 4490,
  "MFC-041": 4491,
  "MFC-048": 4492,
  "MFC-049": 4493,
  "MFC-050": 4494,
  "MFC-051": 4495,
  "MFC-052": 4496,
};

const SPEC_DIR = path.resolve(
  __dirname,
  "../tests/functional/performance-review/calibration",
);
const SPEC_FILES = [
  "manual-final-score-api.spec.js",
  "manual-final-score-numeric-ui.spec.js",
  "manual-final-score-dropdown-ui.spec.js",
  "manual-final-score-informer-ui.spec.js",
  "manual-final-score-roles-ui.spec.js",
  "manual-final-score-export.spec.js",
  "manual-final-score-settings-edge.spec.js",
  "manual-final-score-integration.spec.js",
];

/**
 * Extract test.step() titles grouped by MFC ID from a spec file.
 * Returns Map<mfcId, string[]>
 */
function extractStepsFromFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const result = new Map();

  let currentMfcId = null;

  for (const line of lines) {
    // Detect test('MFC-###: ...')
    const testMatch = line.match(/test\(\s*['"](?:test\.)?\s*(MFC-\d+):/);
    if (testMatch) {
      currentMfcId = testMatch[1];
      if (!result.has(currentMfcId)) {
        result.set(currentMfcId, []);
      }
    }

    // Detect test.step('...')
    if (currentMfcId) {
      const stepMatch = line.match(
        /(?:await\s+)?test\.step\(\s*['"`]([^'"`]+)['"`]/,
      );
      if (stepMatch) {
        result.get(currentMfcId).push(stepMatch[1]);
      }
      // Also catch template literals with ${...}
      const templateMatch = line.match(/(?:await\s+)?test\.step\(\s*`([^`]+)`/);
      if (templateMatch && !stepMatch) {
        // Clean template expressions: ${varName} → (var)
        const cleaned = templateMatch[1].replace(/\$\{[^}]+\}/g, "(...)");
        result.get(currentMfcId).push(cleaned);
      }
    }

    // End of test — detect closing });
    // Simple heuristic: if we see another test( or describe( at same level, reset
    if (currentMfcId && /^\s*\}\);/.test(line)) {
      // This might close the test — we'll keep collecting until next test
    }
    if (
      currentMfcId &&
      /^\s*test\(/.test(line) &&
      !line.includes(currentMfcId)
    ) {
      const newMatch = line.match(/test\(\s*['"](?:test\.)?\s*(MFC-\d+):/);
      if (newMatch) {
        currentMfcId = newMatch[1];
        if (!result.has(currentMfcId)) {
          result.set(currentMfcId, []);
        }
      }
    }
  }

  return result;
}

async function main() {
  console.log(
    `\n=== Пуш шагов MFC тестов в TestRail ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`,
  );

  // Step 1: Extract steps from all files
  const allSteps = new Map(); // mfcId → string[]

  for (const file of SPEC_FILES) {
    const filePath = path.join(SPEC_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠ Файл не найден: ${file}`);
      continue;
    }
    const fileSteps = extractStepsFromFile(filePath);
    for (const [mfcId, steps] of fileSteps) {
      allSteps.set(mfcId, steps);
    }
    console.log(
      `  📄 ${file}: ${fileSteps.size} тестов, ${[...fileSteps.values()].reduce((a, b) => a + b.length, 0)} шагов`,
    );
  }

  console.log(`\nВсего тестов с шагами: ${allSteps.size}`);
  const totalSteps = [...allSteps.values()].reduce((a, b) => a + b.length, 0);
  console.log(`Всего шагов: ${totalSteps}\n`);

  // Step 2: Push steps to TestRail
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const [mfcId, stepTitles] of allSteps) {
    const caseId = MFC_TO_CASE[mfcId];
    if (!caseId) {
      console.warn(`  ⚠ ${mfcId}: нет маппинга → пропуск`);
      skipped++;
      continue;
    }

    if (stepTitles.length === 0) {
      console.log(`  ⏭️  ${mfcId} (C${caseId}): нет шагов`);
      skipped++;
      continue;
    }

    // Build TestRail-formatted steps
    const trSteps = buildTestRailSteps(stepTitles, EXCLUDED_STEP_PATTERNS);

    if (trSteps.length === 0) {
      console.log(`  ⏭️  ${mfcId} (C${caseId}): все шаги отфильтрованы`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] C${caseId} ${mfcId}: ${trSteps.length} шагов`);
      for (const s of trSteps) {
        console.log(`        Шаг: ${s.content}`);
        console.log(`        Ожид: ${s.expected}`);
      }
      updated++;
      continue;
    }

    try {
      await client.withRetry(() =>
        client.updateCase(caseId, {
          custom_steps_separated: trSteps,
        }),
      );
      console.log(`  ✅ C${caseId} ${mfcId}: ${trSteps.length} шагов`);
      updated++;
      await client.delay(250);
    } catch (err) {
      console.error(`  ❌ C${caseId} ${mfcId}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n── Итого ──`);
  console.log(`  Обновлено: ${updated}`);
  console.log(`  Пропущено: ${skipped}`);
  console.log(`  Ошибок: ${errors}`);
  console.log();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
