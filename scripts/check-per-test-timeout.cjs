const fs = require("fs");

const tests = [
  {
    cid: "C3015",
    file: "tests/functional/performance-review/filling/pr-batch-send-questionnaires.spec.js",
  },
  {
    cid: "C3016",
    file: "tests/functional/performance-review/filling/pr-batch-send-questionnaires.spec.js",
  },
  {
    cid: "C3017",
    file: "tests/functional/performance-review/filling/pr-batch-send-questionnaires.spec.js",
  },
  {
    cid: "C3019",
    file: "tests/functional/performance-review/filling/pr-batch-send-questionnaires.spec.js",
  },
  {
    cid: "C3020",
    file: "tests/functional/performance-review/filling/pr-batch-send-questionnaires.spec.js",
  },
  {
    cid: "C3021",
    file: "tests/functional/performance-review/filling/pr-batch-send-questionnaires.spec.js",
  },
  {
    cid: "C4201",
    file: "tests/functional/performance-review/filling/pr-batch-send-questionnaires.spec.js",
  },
  {
    cid: "C3022",
    file: "tests/functional/performance-review/filling/pr-fill-auto-colleagues-refactored.spec.js",
  },
  {
    cid: "C3023",
    file: "tests/functional/performance-review/filling/pr-fill-early-access-approval-e2e.spec.js",
  },
  {
    cid: "C3024",
    file: "tests/functional/performance-review/filling/pr-fill-early-access-e2e.spec.js",
  },
  {
    cid: "C3026",
    file: "tests/functional/performance-review/filling/pr-fill-self-assessment-step-e2e.spec.js",
  },
  {
    cid: "C4410",
    file: "tests/functional/performance-review/filling/pr-fill-self-assessment-step-e2e.spec.js",
  },
  {
    cid: "C3028",
    file: "tests/functional/performance-review/filling/pr-fill-with-known-users-e2e.spec.js",
  },
  {
    cid: "C3029",
    file: "tests/functional/performance-review/filling/pr-fill-with-manager-approval-e2e.spec.js",
  },
  {
    cid: "C4409",
    file: "tests/functional/performance-review/filling/pr-fill-self-assessment-approval-e2e.spec.js",
  },
  {
    cid: "C4412",
    file: "tests/functional/performance-review/filling/pr-self-assessment-edit-after-launch.spec.js",
  },
  {
    cid: "C4413",
    file: "tests/functional/performance-review/filling/pr-self-assessment-edit-after-launch.spec.js",
  },
  {
    cid: "C4414",
    file: "tests/functional/performance-review/filling/pr-self-assessment-edit-after-launch.spec.js",
  },
  {
    cid: "C4415",
    file: "tests/functional/performance-review/filling/pr-self-assessment-edit-after-launch.spec.js",
  },
  {
    cid: "C4416",
    file: "tests/functional/performance-review/filling/pr-self-assessment-edit-after-launch.spec.js",
  },
  {
    cid: "C4417",
    file: "tests/functional/performance-review/filling/pr-view-self-assessment-preview.spec.js",
  },
  {
    cid: "C4418",
    file: "tests/functional/performance-review/filling/pr-view-self-assessment-preview.spec.js",
  },
  {
    cid: "C4419",
    file: "tests/functional/performance-review/filling/pr-view-self-assessment-preview.spec.js",
  },
  {
    cid: "C4420",
    file: "tests/functional/performance-review/filling/pr-view-self-assessment-preview.spec.js",
  },
  {
    cid: "C4202",
    file: "tests/functional/performance-review/filling/pr-colleague-selection-manual-110-113.spec.js",
  },
  {
    cid: "C4203",
    file: "tests/functional/performance-review/filling/pr-colleague-selection-manual-114-115.spec.js",
  },
  {
    cid: "C4204",
    file: "tests/functional/performance-review/filling/pr-colleague-selection-manual-116-120.spec.js",
  },
  {
    cid: "C4099",
    file: "tests/functional/performance-review/calibration/pr-calibration-e2e-setup.spec.js",
  },
  {
    cid: "C3047",
    file: "tests/functional/performance-review/pr-smoke.spec.js",
  },
  {
    cid: "C3052",
    file: "tests/functional/performance-review/results/pr-view-results-e2e.spec.js",
  },
  {
    cid: "C3008",
    file: "tests/functional/performance-review/edit/pr-bug-001-self-assessment.spec.js",
  },
  {
    cid: "C3011",
    file: "tests/functional/performance-review/edit/pr-edit-case2-toggle-direction.spec.js",
  },
  {
    cid: "C3012",
    file: "tests/functional/performance-review/edit/pr-edit-case3-add-colleague.spec.js",
  },
  {
    cid: "C3013",
    file: "tests/functional/performance-review/edit/pr-edit-case4-reminders.spec.js",
  },
  {
    cid: "C4404",
    file: "tests/functional/performance-review/edit/pr-status-archived.spec.js",
  },
  {
    cid: "C4405",
    file: "tests/functional/performance-review/edit/pr-status-completed.spec.js",
  },
  {
    cid: "C4304",
    file: "tests/functional/performance-review/cache/cache-invalidation.spec.js",
  },
  {
    cid: "C4166",
    file: "tests/functional/performance-review/dashboard/dashboard-filters.spec.js",
  },
  {
    cid: "C3044",
    file: "tests/functional/performance-review/participants/pr-multiple-participants.spec.js",
  },
  {
    cid: "C3053",
    file: "tests/functional/performance-review/validation/pr-validation.spec.js",
  },
];

console.log("C-ID    | Has setTimeout | Has test.slow() | Effective timeout");
console.log("-".repeat(70));

for (const t of tests) {
  try {
    const content = fs.readFileSync(t.file, "utf8");
    // Find the test block for this C-ID
    const cidIdx = content.indexOf(t.cid);
    if (cidIdx === -1) {
      console.log(`${t.cid} | NOT FOUND`);
      continue;
    }

    // Get the next ~2000 chars after C-ID to find setTimeout/slow
    const block = content.substring(cidIdx, cidIdx + 2000);
    // Check if setTimeout is in THIS test (before the next test() call)
    const nextTestIdx =
      block.indexOf("\ntest('", 10) || block.indexOf('\ntest("', 10);
    const testBlock = nextTestIdx > 0 ? block.substring(0, nextTestIdx) : block;

    const timeoutMatch = testBlock.match(
      /(?:testInfo\.setTimeout|test\.setTimeout)\((\d[\d_]*)\)/,
    );
    const hasSlowMatch = testBlock.includes("test.slow()");

    let timeout = "project default";
    if (timeoutMatch) {
      timeout = parseInt(timeoutMatch[1].replace(/_/g, "")) / 1000 + "s";
    } else if (hasSlowMatch) {
      timeout = "3x project (540s in regression)";
    }

    console.log(
      `${t.cid.padEnd(7)} | ${timeoutMatch ? "YES (" + timeout + ")" : "no".padEnd(14)} | ${hasSlowMatch ? "YES" : "no".padEnd(15)} | ${timeout}`,
    );
  } catch (e) {
    console.log(`${t.cid} | ERROR: ${e.message.substring(0, 50)}`);
  }
}
