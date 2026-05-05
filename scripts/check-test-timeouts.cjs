const fs = require("fs");
const path = require("path");

// Get test results from the TestRail nightly run — check if there's a local results file
// For now, just check which of the 47 failing tests have @e2e tag (= long tests)

const cids = [
  "C3047",
  "C3052",
  "C4202",
  "C4204",
  "C4409",
  "C3008",
  "C3011",
  "C3012",
  "C3013",
  "C3016",
  "C3017",
  "C3019",
  "C3020",
  "C3021",
  "C3022",
  "C3023",
  "C3024",
  "C3026",
  "C3028",
  "C3029",
  "C3044",
  "C3045",
  "C3053",
  "C4099",
  "C4131",
  "C4139",
  "C4144",
  "C4166",
  "C4167",
  "C4169",
  "C4201",
  "C4203",
  "C4304",
  "C4315",
  "C4404",
  "C4405",
  "C4410",
  "C4412",
  "C4413",
  "C4414",
  "C4415",
  "C4416",
  "C4417",
  "C4418",
  "C4419",
  "C4420",
  "C4444",
];

const baseDir = "tests/functional/performance-review";

function findFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (
        entry.isDirectory() &&
        entry.name !== "node_modules" &&
        entry.name !== "_archived"
      ) {
        results.push(...findFiles(fullPath));
      } else if (entry.name.endsWith(".spec.js")) {
        results.push(fullPath);
      }
    }
  } catch (e) {}
  return results;
}

const specFiles = findFiles(baseDir);
const cidMap = {}; // C-ID -> { file, describeTags, testTags, hasTestTimeout }

for (const file of specFiles) {
  const content = fs.readFileSync(file, "utf8");

  // Find describe-level tags
  const describeMatch = content.match(
    /test\.describe\([^{]*tag:\s*\[([^\]]*)\]/,
  );
  const describeTags = describeMatch
    ? describeMatch[1]
        .replace(/'/g, "")
        .split(",")
        .map((t) => t.trim())
    : [];

  for (const cid of cids) {
    if (!content.includes(cid)) continue;

    // Find the test line and its tags
    const testRegex = new RegExp(
      `test\\([^)]*${cid}[^)]*(?:,\\s*\\{[^}]*tag:\\s*\\[([^\\]]*)\\][^}]*\\})?`,
      "s",
    );
    const testMatch = content.match(testRegex);
    const testTags =
      testMatch && testMatch[1]
        ? testMatch[1]
            .replace(/'/g, "")
            .split(",")
            .map((t) => t.trim())
        : [];

    // Check for per-test timeout
    const timeoutRegex = new RegExp(
      `test\\([^)]*${cid}[\\s\\S]{0,500}timeout:\\s*(\\d+)`,
      "s",
    );
    const timeoutMatch = content.match(timeoutRegex);

    const allTags = [...new Set([...describeTags, ...testTags])];

    cidMap[cid] = {
      file: file.replace(/\\/g, "/"),
      tags: allTags,
      hasE2E: allTags.includes("@e2e"),
      hasSmoke: allTags.includes("@smoke"),
      testTimeout: timeoutMatch ? parseInt(timeoutMatch[1]) : null,
    };
  }
}

// Determine effective timeout per project
console.log("=== Timeout analysis for 47 failing tests ===\n");
console.log(
  "C-ID     | @e2e | @smoke | Test timeout | regression(120s) | nightly(180s) | smoke(60s)",
);
console.log("-".repeat(100));

let riskCount = 0;
for (const cid of cids) {
  const info = cidMap[cid];
  if (!info) {
    console.log(`${cid} | NOT FOUND`);
    continue;
  }

  const regTimeout = info.testTimeout || 120000;
  const nightlyTimeout = info.testTimeout || 180000;
  const smokeTimeout = info.testTimeout || 60000;

  // Flag tests that are E2E (likely >60s) running with regression timeout of 120s
  const risk = info.hasE2E && !info.testTimeout ? " ⚠️ TIMEOUT RISK" : "";
  if (risk) riskCount++;

  console.log(
    `${cid.padEnd(8)} | ${info.hasE2E ? "YES" : "no ".padEnd(3)} | ${info.hasSmoke ? "YES" : "no ".padEnd(3)}  | ${info.testTimeout ? info.testTimeout / 1000 + "s" : "none"} | ${regTimeout / 1000}s | ${nightlyTimeout / 1000}s | ${info.hasSmoke ? smokeTimeout / 1000 + "s" : "N/A"}${risk}`,
  );
}

console.log(
  `\n⚠️  ${riskCount} из 47 тестов — E2E без собственного timeout, получают 120с в regression`,
);
console.log(
  `   В nightly те же тесты получают 180с (+50%), что может быть решающим`,
);
