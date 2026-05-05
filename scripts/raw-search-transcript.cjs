const fs = require("fs");
const fpath =
  "C:\\Users\\Polarfox\\.claude\\projects\\c--Users-Polarfox-playwright-tests\\92677a29-06da-4a08-8169-28968a10f606.jsonl";
const data = fs.readFileSync(fpath, "utf8");

// Search for patterns related to test analysis results
const patterns = [
  /C4444[^"]{0,300}/g,
  /C4099[^"]{0,300}/g,
  /C4131[^"]{0,300}/g,
  /C4304[^"]{0,200}/g,
  /APP.?BUG[^"]{0,200}/g,
  /FIXED[^"]{0,100}/g,
  /settings-text-validation[^"]{0,200}/g,
  /settings-text-editing[^"]{0,200}/g,
  /autofix.{0,50}result/gi,
  /batch-send[^"]{0,200}/g,
  /self-assessment[^"]{0,200}/g,
  /early-access[^"]{0,200}/g,
  /passed.*failed/g,
  /\\u0431\\u0430\\u0433.*\\u043f\\u0440\\u0438\\u043b\\u043e\\u0436/g,
];

const labels = [
  "C4444",
  "C4099",
  "C4131",
  "C4304",
  "APP BUG",
  "FIXED",
  "settings-text-validation",
  "settings-text-editing",
  "autofix result",
  "batch-send",
  "self-assessment",
  "early-access",
  "passed/failed",
  "баг приложения",
];

for (let i = 0; i < patterns.length; i++) {
  const matches = data.match(patterns[i]);
  if (matches && matches.length > 0) {
    console.log(`\n=== ${labels[i]} (${matches.length} matches) ===`);
    // Show unique, meaningful matches (not just list entries)
    const seen = new Set();
    let count = 0;
    for (const m of matches) {
      const clean = m.replace(/\\n/g, " ").replace(/\\t/g, " ").trim();
      if (clean.length < 30) continue; // Skip very short matches
      const key = clean.substring(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      if (count < 8) {
        console.log(`  ${clean.substring(0, 300)}`);
        count++;
      }
    }
  }
}
