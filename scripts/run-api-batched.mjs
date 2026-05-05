/**
 * Батчированный запуск API тестов.
 * Разбивает ~2500 тестов на 6 батчей по доменам с паузой между ними,
 * чтобы не перегружать стенд при большом прогоне.
 *
 * Usage:
 *   node scripts/run-api-batched.mjs [--testrail <runId>] [--pause <seconds>] [--retries <N>]
 *
 * Examples:
 *   node scripts/run-api-batched.mjs                          # Без TestRail
 *   node scripts/run-api-batched.mjs --testrail 86            # С записью в R86
 *   node scripts/run-api-batched.mjs --testrail 86 --pause 60 # Пауза 60с между батчами
 */

import { execSync } from "child_process";
import fs from "fs";
import { glob } from "glob";

// Parse args
const args = process.argv.slice(2);
const testrailRunId = args.includes("--testrail")
  ? args[args.indexOf("--testrail") + 1]
  : null;
const pauseSec = args.includes("--pause")
  ? parseInt(args[args.indexOf("--pause") + 1], 10)
  : 60;
const retries = args.includes("--retries")
  ? parseInt(args[args.indexOf("--retries") + 1], 10)
  : 1;

const BATCHES = [
  {
    name: "Batch 1: Smoke + Auth + Core",
    patterns: [
      "tests/functional/api/_example-api-test.spec.js",
      "tests/functional/api/api-*.spec.js",
      "tests/functional/api/auth-*.spec.js",
      "tests/functional/api/assessments-*.spec.js",
      "tests/functional/api/brand-api.spec.js",
      "tests/functional/api/company-api.spec.js",
      "tests/functional/api/competencies-api.spec.js",
      "tests/functional/api/home-api.spec.js",
      "tests/functional/api/gift-shop-api.spec.js",
      "tests/functional/api/karma-api.spec.js",
      "tests/functional/api/ninebox-api.spec.js",
      "tests/functional/api/notifications-api.spec.js",
      "tests/functional/api/my-team-api.spec.js",
    ],
  },
  {
    name: "Batch 2: Objectives + Org Structure",
    patterns: [
      "tests/functional/api/objectives-*.spec.js",
      "tests/functional/api/org-structure-*.spec.js",
    ],
  },
  {
    name: "Batch 3: Feedback",
    patterns: ["tests/functional/api/feedback-*.spec.js"],
  },
  {
    name: "Batch 4: Surveys",
    patterns: ["tests/functional/api/survey-*.spec.js"],
  },
  {
    name: "Batch 5: Performance Review",
    patterns: ["tests/functional/api/pr-*.spec.js"],
  },
  {
    name: "Batch 6: Profile + Roles + Scenarios + RBAC + Misc",
    patterns: [
      "tests/functional/api/profile-*.spec.js",
      "tests/functional/api/roles-*.spec.js",
      "tests/functional/api/scenarios-*.spec.js",
      "tests/functional/api/development-*.spec.js",
      "tests/functional/api/rbac/*.spec.js",
      "tests/functional/api/edge-cases/*.spec.js",
      "tests/functional/api/boundary/*.spec.js",
      "tests/functional/api/concurrency/*.spec.js",
      "tests/functional/api/contract/*.spec.js",
      "tests/functional/api/integration/*.spec.js",
      "tests/functional/api/performance/*.spec.js",
      "tests/functional/api/idempotency-api.spec.js",
      "tests/functional/api/field-limits-api.spec.js",
      "tests/functional/api/unicode-input-api.spec.js",
      "tests/functional/api/parallel-operations.spec.js",
    ],
  },
];

function sleep(sec) {
  return new Promise((resolve) => setTimeout(resolve, sec * 1000));
}

function resolvePatterns(patterns) {
  const files = new Set();
  for (const pattern of patterns) {
    for (const m of glob.sync(pattern)) {
      // Always use forward slashes — backslashes get eaten by shell on Windows
      files.add(m.replace(/\\/g, "/"));
    }
  }
  return [...files];
}

function runBatch(files, env) {
  const filesArg = files.map((f) => `"${f}"`).join(" ");
  const cmd = `npx.cmd playwright test ${filesArg} --project=regression --retries=${retries}`;

  try {
    const output = execSync(cmd, {
      encoding: "utf8",
      timeout: 600_000,
      env,
      maxBuffer: 50 * 1024 * 1024,
      shell: true,
    });
    return { output, exitCode: 0 };
  } catch (e) {
    return { output: (e.stdout || "") + (e.stderr || ""), exitCode: e.status || 1 };
  }
}

function parseResults(output) {
  const passedMatch = output.match(/(\d+) passed/);
  const failedMatch = output.match(/(\d+) failed/);
  const flakyMatch = output.match(/(\d+) flaky/);
  return {
    passed: passedMatch ? parseInt(passedMatch[1]) : 0,
    failed: failedMatch ? parseInt(failedMatch[1]) : 0,
    flaky: flakyMatch ? parseInt(flakyMatch[1]) : 0,
  };
}

async function main() {
  console.log("=".repeat(60));
  console.log("Batch API test runner");
  console.log(`   Batches: ${BATCHES.length}`);
  console.log(`   Pause: ${pauseSec}s between batches`);
  console.log(`   Retries: ${retries}`);
  if (testrailRunId) {
    console.log(`   TestRail: Run #${testrailRunId}`);
    fs.writeFileSync(".testrail-run-id", testrailRunId);
  }
  console.log("=".repeat(60));

  const results = [];
  const env = { ...process.env };
  if (testrailRunId) {
    env.TESTRAIL_REPORT = "1";
  }

  for (let i = 0; i < BATCHES.length; i++) {
    const batch = BATCHES[i];
    console.log(`\n${"~".repeat(60)}`);
    console.log(`> ${batch.name}`);
    console.log(`${"~".repeat(60)}`);

    const files = resolvePatterns(batch.patterns);
    if (files.length === 0) {
      console.log("  No files, skipping.");
      results.push({ name: batch.name, passed: 0, failed: 0, skipped: true });
      continue;
    }

    console.log(`  Files: ${files.length}`);

    const startTime = Date.now();
    const { output, exitCode } = runBatch(files, env);
    const { passed, failed, flaky } = parseResults(output);
    const duration = ((Date.now() - startTime) / 1000).toFixed(0);

    const status = failed > 0 ? "FAIL" : "OK";
    console.log(
      `  [${status}] ${passed} passed, ${failed} failed, ${flaky} flaky (${duration}s)`,
    );

    if (failed > 0) {
      // Extract failed test names from output
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.includes("failed") && line.includes("[regression]")) {
          console.log(`    ${line.trim().substring(0, 120)}`);
        }
      }
    }

    results.push({ name: batch.name, passed, failed, flaky, duration });

    // Pause between batches (except after the last one)
    if (i < BATCHES.length - 1) {
      console.log(`  Pause ${pauseSec}s...`);
      await sleep(pauseSec);
    }
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("Summary:");
  console.log("=".repeat(60));

  let totalPassed = 0;
  let totalFailed = 0;
  let totalFlaky = 0;

  for (const r of results) {
    if (r.skipped) continue;
    const status = r.failed > 0 ? "FAIL" : "  OK";
    console.log(
      `  [${status}] ${r.name}: ${r.passed}p / ${r.failed}f / ${r.flaky || 0}flaky (${r.duration}s)`,
    );
    totalPassed += r.passed;
    totalFailed += r.failed;
    totalFlaky += r.flaky || 0;
  }

  console.log(
    `\n  Total: ${totalPassed} passed, ${totalFailed} failed, ${totalFlaky} flaky`,
  );
  if (testrailRunId) {
    console.log(
      `  TestRail: https://testrail.example.org/index.php?/runs/view/${testrailRunId}`,
    );
  }
  console.log("=".repeat(60));

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(console.error);
