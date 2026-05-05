const fs = require("fs");
const lines = fs
  .readFileSync(
    "c:/Users/Polarfox/.claude/projects/c--Users-Polarfox-playwright-tests/92677a29-06da-4a08-8169-28968a10f606.jsonl",
    "utf8",
  )
  .split("\n")
  .filter(Boolean);

const failedIds = [
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
  "C4483",
];

const found = {};

for (const line of lines) {
  try {
    const obj = JSON.parse(line);
    if (obj.role === "assistant") {
      const text =
        typeof obj.content === "string"
          ? obj.content
          : JSON.stringify(obj.content);
      const patterns = [
        "FIXED",
        "APP BUG",
        "passed",
        "исправлен",
        "баг приложения",
        "skip",
        "FLAKY",
        "autofix",
      ];
      for (const cid of failedIds) {
        if (text.includes(cid)) {
          for (const p of patterns) {
            if (text.includes(p)) {
              if (!found[cid]) found[cid] = new Set();
              found[cid].add(p);
            }
          }
        }
      }
    }
  } catch (e) {}
}

console.log("=== Tests analyzed in transcript ===");
for (const [cid, tags] of Object.entries(found).sort()) {
  console.log(cid + ": " + [...tags].join(", "));
}

console.log("\n=== NOT found in analysis ===");
for (const cid of failedIds) {
  if (!found[cid]) console.log("  " + cid);
}
