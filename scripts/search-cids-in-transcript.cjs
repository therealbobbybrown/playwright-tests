const fs = require("fs");
const path =
  "C:\\Users\\Polarfox\\.claude\\projects\\c--Users-Polarfox-playwright-tests\\92677a29-06da-4a08-8169-28968a10f606.jsonl";
const data = fs.readFileSync(path, "utf8");

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

for (const cid of cids) {
  const count = (data.match(new RegExp(cid, "g")) || []).length;
  if (count > 0) {
    console.log(`${cid}: ${count} mentions`);
    // Find context around mentions
    const lines = data.split("\n");
    for (const line of lines) {
      if (line.includes(cid)) {
        try {
          const obj = JSON.parse(line);
          if (obj.role === "assistant" && obj.content) {
            const text =
              typeof obj.content === "string"
                ? obj.content
                : JSON.stringify(obj.content);
            const idx = text.indexOf(cid);
            if (idx >= 0) {
              const snippet = text
                .substring(
                  Math.max(0, idx - 80),
                  Math.min(text.length, idx + 120),
                )
                .replace(/\\n/g, " ")
                .substring(0, 200);
              console.log(`  -> ...${snippet}...`);
            }
          }
        } catch (e) {}
      }
    }
  }
}

// Also search for spec file names that might indicate which tests were worked on
const specFiles = [
  "settings-text-validation",
  "settings-text-editing",
  "settings-show-only",
  "calibration-comprehensive",
  "score-distribution",
  "autofix",
  "peer-selection",
  "batch-send",
  "self-assessment",
  "pr-lifecycle",
  "pr-scenarios",
  "e2e-full",
  "colleagues",
  "early-access",
];

console.log("\n=== Spec file mentions ===");
for (const sf of specFiles) {
  const count = (data.match(new RegExp(sf, "g")) || []).length;
  if (count > 0) console.log(`${sf}: ${count} mentions`);
}
