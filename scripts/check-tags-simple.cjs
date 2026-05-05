const fs = require("fs");

const files = {
  "pr-smoke": "tests/functional/performance-review/pr-smoke.spec.js",
  "pr-view-results-e2e":
    "tests/functional/performance-review/results/pr-view-results-e2e.spec.js",
  "pr-validation":
    "tests/functional/performance-review/validation/pr-validation.spec.js",
  "pr-colleague-110-113":
    "tests/functional/performance-review/filling/pr-colleague-selection-manual-110-113.spec.js",
  "pr-colleague-114-115":
    "tests/functional/performance-review/filling/pr-colleague-selection-manual-114-115.spec.js",
  "pr-colleague-116-120":
    "tests/functional/performance-review/filling/pr-colleague-selection-manual-116-120.spec.js",
  "pr-self-assessment-approval":
    "tests/functional/performance-review/filling/pr-fill-self-assessment-approval-e2e.spec.js",
  "pr-multiple-participants":
    "tests/functional/performance-review/participants/pr-multiple-participants.spec.js",
  "pr-auto-colleagues":
    "tests/functional/performance-review/filling/pr-fill-auto-colleagues-refactored.spec.js",
  "pr-early-access-approval":
    "tests/functional/performance-review/filling/pr-fill-early-access-approval-e2e.spec.js",
  "pr-early-access":
    "tests/functional/performance-review/filling/pr-fill-early-access-e2e.spec.js",
  "pr-self-assessment-step":
    "tests/functional/performance-review/filling/pr-fill-self-assessment-step-e2e.spec.js",
  "pr-known-users":
    "tests/functional/performance-review/filling/pr-fill-with-known-users-e2e.spec.js",
  "pr-manager-approval":
    "tests/functional/performance-review/filling/pr-fill-with-manager-approval-e2e.spec.js",
  "pr-batch-send":
    "tests/functional/performance-review/filling/pr-batch-send-questionnaires.spec.js",
  "pr-bug-001":
    "tests/functional/performance-review/edit/pr-bug-001-self-assessment.spec.js",
  "pr-edit-toggle-dir":
    "tests/functional/performance-review/edit/pr-edit-case2-toggle-direction.spec.js",
  "pr-edit-add-colleague":
    "tests/functional/performance-review/edit/pr-edit-case3-add-colleague.spec.js",
  "pr-edit-reminders":
    "tests/functional/performance-review/edit/pr-edit-case4-reminders.spec.js",
  "pr-status-archived":
    "tests/functional/performance-review/edit/pr-status-archived.spec.js",
  "pr-status-completed":
    "tests/functional/performance-review/edit/pr-status-completed.spec.js",
  "dashboard-filters":
    "tests/functional/performance-review/dashboard/dashboard-filters.spec.js",
  "pr-self-assessment-edit":
    "tests/functional/performance-review/filling/pr-self-assessment-edit-after-launch.spec.js",
  "pr-view-preview":
    "tests/functional/performance-review/filling/pr-view-self-assessment-preview.spec.js",
  "pr-calibration-e2e":
    "tests/functional/performance-review/calibration/pr-calibration-e2e-setup.spec.js",
  "cache-invalidation":
    "tests/functional/performance-review/cache/cache-invalidation.spec.js",
  "settings-export":
    "tests/functional/performance-review/calibration/settings-export-characteristics.spec.js",
  "settings-show-only":
    "tests/functional/performance-review/calibration/settings-show-only-custom.spec.js",
  "calibration-comprehensive":
    "tests/functional/performance-review/calibration/calibration-comprehensive.spec.js",
  "pr-zero-score-ui":
    "tests/functional/performance-review/calibration/pr-zero-score-total-ui.spec.js",
};

console.log(
  "File".padEnd(30) +
    "| @e2e | @smoke | @regression | @api | @ui  | Describe Tags",
);
console.log("-".repeat(120));

for (const [name, filepath] of Object.entries(files)) {
  try {
    const content = fs.readFileSync(filepath, "utf8");
    // Find ALL tag arrays in describe/test lines
    const tagArrays = content.match(/tag:\s*\[[^\]]*\]/g) || [];
    const allTags = new Set();
    for (const ta of tagArrays) {
      const tags = ta.match(/@[\w-]+/g) || [];
      tags.forEach((t) => allTags.add(t));
    }

    // Find describe-level tag array specifically
    const describeMatch = content.match(
      /test\.describe\([^)]*\{[^}]*tag:\s*\[([^\]]*)\]/s,
    );
    const describeTags = describeMatch
      ? (describeMatch[1].match(/@[\w-]+/g) || []).join(", ")
      : "none";

    const hasE2E = allTags.has("@e2e") ? "YES" : "no";
    const hasSmoke = allTags.has("@smoke") ? "YES" : "no";
    const hasRegression = allTags.has("@regression") ? "YES" : "no";
    const hasApi = allTags.has("@api") ? "YES" : "no";
    const hasUi = allTags.has("@ui") ? "YES" : "no";

    console.log(
      `${name.padEnd(30)}| ${hasE2E.padEnd(4)} | ${hasSmoke.padEnd(6)} | ${hasRegression.padEnd(11)} | ${hasApi.padEnd(4)} | ${hasUi.padEnd(4)} | ${describeTags}`,
    );
  } catch (e) {
    console.log(`${name.padEnd(30)}| FILE NOT FOUND`);
  }
}

// Summary: how many projects each test runs in
console.log("\n=== Projects per file ===");
for (const [name, filepath] of Object.entries(files)) {
  try {
    const content = fs.readFileSync(filepath, "utf8");
    const tagArrays = content.match(/tag:\s*\[[^\]]*\]/g) || [];
    const allTags = new Set();
    for (const ta of tagArrays) {
      const tags = ta.match(/@[\w-]+/g) || [];
      tags.forEach((t) => allTags.add(t));
    }

    const projects = ["nightly"]; // always
    if (allTags.has("@regression")) projects.push("regression(120s)");
    if (allTags.has("@smoke")) projects.push("smoke(60s)");
    if (allTags.has("@e2e")) projects.push("e2e(180s)");
    if (allTags.has("@api")) projects.push("api(60s)");
    if (allTags.has("@ui")) projects.push("ui(90s)");

    console.log(
      `${name.padEnd(30)} → ${projects.length} projects: ${projects.join(", ")}`,
    );
  } catch (e) {}
}
