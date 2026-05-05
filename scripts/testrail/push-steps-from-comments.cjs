#!/usr/bin/env node
/**
 * Push test steps to TestRail by extracting them from inline comments + expects.
 *
 * For tests that don't use test.step() but have structured comments like:
 *   // Открыть панель фильтра
 *   await tab.openGroupFilter();
 *   // Панель должна быть видима
 *   await expect(tab.groupPanel).toBeVisible();
 *
 * This script extracts comment blocks as step actions and expect lines as expected results.
 *
 * Usage:
 *   node scripts/testrail/push-steps-from-comments.cjs <glob-pattern> [--dry-run]
 *
 * Example:
 *   node scripts/testrail/push-steps-from-comments.cjs "tests/functional/my-team/score-distribution/*.spec.js" --dry-run
 */

const fs = require("fs");
const path = require("path");
const glob = require("glob");
const client = require("./client.cjs");
const { generateExpected, capitalizeFirst } = require("./step-utils.cjs");

const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");
const pattern = process.argv.find(
  (a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1],
);

if (!pattern) {
  console.log(
    'Usage: node scripts/testrail/push-steps-from-comments.cjs "<glob>" [--dry-run] [--verbose]',
  );
  process.exit(1);
}

/**
 * Extract C-ID from test title like 'C7120: Title...'
 */
function extractCId(title) {
  const m = title.match(/C(\d+):/);
  return m ? parseInt(m[1]) : null;
}

/**
 * Parse a spec file and extract tests with their steps from comments.
 * Returns array of { cId, title, steps: [{ action, expected }] }
 */
function parseSpecFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const results = [];

  // Find test(...) blocks
  // Pattern: test('C####: Title', ... async (...) => {
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Match test declaration
    const testMatch = line.match(/test\(\s*["'`](C\d+:\s*[^"'`]+)["'`]/);
    if (!testMatch) {
      i++;
      continue;
    }

    const title = testMatch[1];
    const cId = extractCId(title);
    if (!cId) {
      i++;
      continue;
    }

    // Find the opening brace of async function body
    let braceDepth = 0;
    let bodyStart = -1;
    let j = i;

    // Scan forward to find 'async' and opening '{' of the test body
    while (j < lines.length) {
      const scanLine = lines[j];
      if (scanLine.includes("async")) {
        // Find the '{' after async (...) =>
        for (let k = j; k < Math.min(j + 5, lines.length); k++) {
          const idx = lines[k].indexOf("{");
          if (idx !== -1) {
            bodyStart = k;
            // Count braces up to this point
            for (let m = i; m <= k; m++) {
              for (const ch of lines[m]) {
                if (ch === "{") braceDepth++;
                if (ch === "}") braceDepth--;
              }
            }
            break;
          }
        }
        break;
      }
      j++;
    }

    if (bodyStart === -1) {
      i++;
      continue;
    }

    // Find the end of test body by tracking braces
    let bodyEnd = bodyStart + 1;
    while (bodyEnd < lines.length && braceDepth > 0) {
      for (const ch of lines[bodyEnd]) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }
      if (braceDepth > 0) bodyEnd++;
    }

    // Extract body lines
    const bodyLines = lines.slice(bodyStart + 1, bodyEnd);

    // Parse comments and expects into steps
    const steps = extractStepsFromBody(bodyLines);

    if (steps.length > 0) {
      results.push({ cId, title, steps });
    }

    i = bodyEnd + 1;
  }

  return results;
}

/**
 * Extract steps from test body lines.
 * Groups by comments, collects expects as expected results.
 */
function extractStepsFromBody(bodyLines) {
  const steps = [];
  let currentAction = null;
  let currentExpects = [];

  for (const line of bodyLines) {
    const trimmed = line.trim();

    // Skip empty lines, setSeverity, markAsUITest
    if (
      !trimmed ||
      trimmed.startsWith("setSeverity") ||
      trimmed.startsWith("markAsUITest")
    ) {
      continue;
    }

    // Comment line = new step action
    if (trimmed.startsWith("//")) {
      // Save previous step if exists
      if (currentAction) {
        steps.push({
          action: currentAction,
          expected:
            currentExpects.length > 0
              ? currentExpects.join("; ")
              : generateExpectedFromAction(currentAction),
        });
      }

      currentAction = trimmed.replace(/^\/\/\s*/, "").trim();
      currentExpects = [];
      continue;
    }

    // expect() line = expected result for current step
    if (trimmed.includes("expect(") && currentAction) {
      const expectedText = extractExpectedFromExpectLine(trimmed);
      if (expectedText) {
        currentExpects.push(expectedText);
      }
      continue;
    }

    // test.skip line
    if (trimmed.startsWith("test.skip") || trimmed.startsWith("return;")) {
      continue;
    }
  }

  // Save last step
  if (currentAction) {
    steps.push({
      action: currentAction,
      expected:
        currentExpects.length > 0
          ? currentExpects.join("; ")
          : generateExpectedFromAction(currentAction),
    });
  }

  // Filter out trivial steps
  return steps.filter(
    (s) => s.action && !s.action.match(/^(if|for|const|let|var|try|catch)\b/),
  );
}

/**
 * Extract human-readable expected result from an expect() line.
 */
function extractExpectedFromExpectLine(line) {
  const trimmed = line.trim();

  // toBeVisible / not.toBeVisible
  if (trimmed.includes("toBeVisible")) {
    if (trimmed.includes("not.toBeVisible")) return "Элемент не отображается";
    return "Элемент отображается";
  }

  // toHaveText
  const textMatch = trimmed.match(/toHaveText\(\s*["'`]([^"'`]+)/);
  if (textMatch) return `Текст: "${textMatch[1]}"`;

  // toContainText
  const containMatch = trimmed.match(/toContainText\(\s*["'`]([^"'`]+)/);
  if (containMatch) return `Содержит: "${containMatch[1]}"`;

  // toBe
  const toBeMatch = trimmed.match(/toBe\(\s*["'`]([^"'`]+)/);
  if (toBeMatch) return `Значение = "${toBeMatch[1]}"`;
  if (trimmed.includes("toBe(true)")) return "Результат: true";
  if (trimmed.includes("toBe(false)")) return "Результат: false";

  // toBeGreaterThan / toBeGreaterThanOrEqual
  if (trimmed.includes("toBeGreaterThan")) return "Количество > 0";

  // toBeTruthy
  if (trimmed.includes("toBeTruthy")) return "Значение непустое";

  // toHaveURL / toContain for URLs
  if (trimmed.includes("toHaveURL") || trimmed.includes("toContain")) {
    const urlMatch = trimmed.match(
      /(?:toHaveURL|toContain)\(\s*["'`]?([^"'`\)]+)/,
    );
    if (urlMatch) return `URL содержит: ${urlMatch[1].substring(0, 50)}`;
  }

  // toHaveCount
  const countMatch = trimmed.match(/toHaveCount\(\s*(\d+)/);
  if (countMatch) return `Количество = ${countMatch[1]}`;

  // Generic expect with .not
  if (trimmed.includes(".not.")) return "Проверка отсутствия — пройдена";

  return "Проверка пройдена";
}

/**
 * Generate expected result from action comment text
 */
function generateExpectedFromAction(action) {
  return generateExpected(action);
}

async function main() {
  const files = glob.sync(pattern, {
    cwd: path.resolve(__dirname, "../.."),
    absolute: true,
  });

  if (files.length === 0) {
    console.log(`No files matching: ${pattern}`);
    process.exit(1);
  }

  console.log(`\nParsing ${files.length} files...`);

  let totalPushed = 0;
  let totalSkipped = 0;

  for (const file of files) {
    const relPath = path.relative(path.resolve(__dirname, "../.."), file);
    const tests = parseSpecFile(file);

    if (tests.length === 0) continue;

    for (const t of tests) {
      // Build steps for TestRail
      const trSteps = t.steps.map((s) => ({
        content: s.action,
        expected: s.expected,
        additional_info: "",
        refs: "",
      }));

      if (DRY_RUN) {
        console.log(`  [DRY] C${t.cId}: would push ${trSteps.length} steps`);
        if (VERBOSE) {
          for (const s of trSteps) {
            console.log(`    Шаг: ${s.content}`);
            console.log(`    Ожидание: ${s.expected}`);
          }
        }
        totalPushed++;
      } else {
        try {
          await client.updateCase(t.cId, {
            template_id: 2, // Test Case (Steps)
            custom_steps_separated: trSteps,
          });
          console.log(`  C${t.cId}: pushed ${trSteps.length} steps`);
          totalPushed++;
        } catch (e) {
          console.log(`  [error] C${t.cId}: ${e.message}`);
        }
      }
    }
  }

  console.log(
    `\n${DRY_RUN ? "[DRY RUN] " : ""}Summary: ${totalPushed} pushed, ${totalSkipped} skipped (already have steps)`,
  );
}

main().catch(console.error);
