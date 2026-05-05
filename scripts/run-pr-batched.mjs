/**
 * Батчированный запуск Performance Review тестов.
 * Разбивает ~470 тестов на 5 батчей по поддиректориям с паузой между ними.
 *
 * Usage:
 *   node scripts/run-pr-batched.mjs [--testrail <runId>] [--pause <seconds>] [--retries <N>]
 */

import { execSync } from "child_process";
import fs from "fs";
import { glob } from "glob";

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
    name: "Batch 1: Cache + Validation + Participants (~15 tests)",
    patterns: [
      "tests/functional/performance-review/cache/*.spec.js",
      "tests/functional/performance-review/validation/*.spec.js",
      "tests/functional/performance-review/participants/*.spec.js",
    ],
  },
  {
    name: "Batch 2: Calibration (~240 tests)",
    patterns: [
      "tests/functional/performance-review/calibration/*.spec.js",
    ],
  },
  {
    name: "Batch 3: Edit (~12 tests, workers=1, heavy E2E)",
    patterns: [
      "tests/functional/performance-review/edit/*.spec.js",
    ],
    workers: 1, // Each test creates PR + fills — too heavy for parallel
  },
  {
    name: "Batch 4: Filling (~35 tests, workers=1, heavy E2E)",
    patterns: [
      "tests/functional/performance-review/filling/*.spec.js",
    ],
    workers: 1,
  },
  {
    name: "Batch 5: Results (~60 tests)",
    patterns: [
      "tests/functional/performance-review/results/*.spec.js",
    ],
  },
  {
    name: "Batch 6: Resume (~70 tests, workers=1, heavy E2E)",
    patterns: [
      "tests/functional/performance-review/resume/*.spec.js",
    ],
    workers: 1,
  },
];

function sleep(sec) {
  return new Promise((resolve) => setTimeout(resolve, sec * 1000));
}

function resolvePatterns(patterns) {
  const files = new Set();
  for (const pattern of patterns) {
    for (const m of glob.sync(pattern)) {
      files.add(m.replace(/\\/g, "/"));
    }
  }
  return [...files];
}

function runBatch(files, env, batchWorkers) {
  const filesArg = files.map((f) => `"${f}"`).join(" ");
  const workersFlag = batchWorkers ? ` --workers=${batchWorkers}` : "";
  const cmd = `npx.cmd playwright test ${filesArg} --project=regression --retries=${retries}${workersFlag}`;

  try {
    const output = execSync(cmd, {
      encoding: "utf8",
      timeout: 1_800_000,
      env,
      maxBuffer: 50 * 1024 * 1024,
      shell: true,
    });
    return { output, exitCode: 0 };
  } catch (e) {
    return {
      output: (e.stdout || "") + (e.stderr || ""),
      exitCode: e.status || 1,
    };
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
  console.log("Batch Performance Review test runner");
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
    console.log("~".repeat(60));

    const files = resolvePatterns(batch.patterns);
    if (files.length === 0) {
      console.log("  No files, skipping.");
      results.push({ name: batch.name, passed: 0, failed: 0, skipped: true });
      continue;
    }

    console.log(`  Files: ${files.length}`);

    if (batch.workers) {
      console.log(`  Workers: ${batch.workers}`);
    }

    const startTime = Date.now();
    const { output, exitCode } = runBatch(files, env, batch.workers);
    const { passed, failed, flaky } = parseResults(output);
    const duration = ((Date.now() - startTime) / 1000).toFixed(0);

    const status = failed > 0 ? "FAIL" : "OK";
    console.log(
      `  [${status}] ${passed} passed, ${failed} failed, ${flaky} flaky (${duration}s)`,
    );

    if (failed > 0) {
      const lines = output.split("\n");
      for (const line of lines) {
        if (
          line.includes("[regression]") &&
          (line.includes("› C") || line.includes("failed"))
        ) {
          const trimmed = line.trim();
          if (trimmed.length > 10 && trimmed.length < 200) {
            console.log(`    ${trimmed.substring(0, 150)}`);
          }
        }
      }
    }

    results.push({ name: batch.name, passed, failed, flaky, duration });

    if (i < BATCHES.length - 1) {
      console.log(`  Pause ${pauseSec}s...`);
      await sleep(pauseSec);
    }
  }

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
