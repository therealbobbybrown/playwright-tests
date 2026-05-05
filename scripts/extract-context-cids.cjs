const fs = require("fs");
const path =
  "C:\\Users\\Polarfox\\.claude\\projects\\c--Users-Polarfox-playwright-tests\\92677a29-06da-4a08-8169-28968a10f606.jsonl";
const data = fs.readFileSync(path, "utf8");
const lines = data.split("\n").filter(Boolean);

// Focus on C-IDs with many mentions = actually analyzed
const targetCids = [
  "C4444",
  "C4099",
  "C4131",
  "C4304",
  "C4139",
  "C4144",
  "C4315",
];

// Also search for key phrases about test results
const keywords = [
  "APP BUG",
  "FIXED",
  "FLAKY",
  "починил",
  "починен",
  "исправлен",
  "исправил",
  "баг приложения",
  "баг апп",
  "пропускаем",
  "скипаем",
  "skip",
  "settings-text-validation",
  "settings-text-editing",
  "batch-send",
  "self-assessment",
  "early-access",
  "autofix результат",
  "autofix result",
  "5 failed",
  "47 failed",
  "18 failed",
  "passed, 5 failed",
  "passed, 18 failed",
];

console.log("=== Context for high-mention C-IDs ===\n");

for (const cid of targetCids) {
  console.log(`\n--- ${cid} ---`);
  let found = 0;
  for (const line of lines) {
    if (!line.includes(cid)) continue;
    try {
      const obj = JSON.parse(line);
      const text =
        typeof obj.content === "string"
          ? obj.content
          : Array.isArray(obj.content)
            ? obj.content.map((c) => c.text || "").join(" ")
            : JSON.stringify(obj.content);

      if (obj.role === "assistant" && text.includes(cid)) {
        // Find sentences containing the C-ID
        const sentences = text.split(/[.\n]/);
        for (const s of sentences) {
          if (
            s.includes(cid) &&
            s.trim().length > 20 &&
            s.trim().length < 500
          ) {
            if (found < 5) {
              console.log(`  [${obj.role}] ${s.trim().substring(0, 250)}`);
              found++;
            }
          }
        }
      }
    } catch (e) {}
  }
}

console.log("\n\n=== Key phrases search ===\n");
for (const kw of keywords) {
  let found = 0;
  for (const line of lines) {
    if (!line.includes(kw)) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.role !== "assistant") continue;
      const text =
        typeof obj.content === "string"
          ? obj.content
          : Array.isArray(obj.content)
            ? obj.content.map((c) => c.text || "").join(" ")
            : JSON.stringify(obj.content);
      if (!text.includes(kw)) continue;

      const idx = text.indexOf(kw);
      const snippet = text
        .substring(Math.max(0, idx - 100), Math.min(text.length, idx + 150))
        .replace(/\\n/g, " ")
        .replace(/\n/g, " ")
        .substring(0, 300);
      if (found < 3) {
        console.log(`[${kw}] ${snippet}`);
        found++;
      }
    } catch (e) {}
  }
}
