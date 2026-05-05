const { execSync } = require("child_process");

// All 47 failed C-IDs from TestRail run #24
const failedCids = [
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

console.log(`Mapping ${failedCids.length} C-IDs to spec files...\n`);

for (const cid of failedCids) {
  try {
    const result = execSync(
      `rg -l "${cid}" tests/functional/performance-review/ --glob "*.spec.js"`,
      { encoding: "utf8", timeout: 5000 },
    ).trim();
    const files = result.split("\n").filter(Boolean);
    console.log(`${cid}: ${files.join(", ")}`);
  } catch (e) {
    console.log(`${cid}: NOT FOUND in spec files`);
  }
}
