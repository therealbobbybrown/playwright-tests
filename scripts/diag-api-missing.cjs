/**
 * Диагностика: какие TestRail кейсы из API-модуля не имеют C-ID в коде
 */
const path = require("path");
const fs = require("fs");
const config = require("./testrail/config.cjs");
const client = require("./testrail/client.cjs");

async function main() {
  const mod = config.getModule("api");

  // 1. Собираем все C-ID из кода
  const dirEntries = Object.entries(config.FILE_PATHS).filter(
    ([, m]) => m === "api",
  );
  let specFiles = [];
  for (const [dirPath] of dirEntries) {
    const fullDir = path.resolve(__dirname, "..", dirPath);
    specFiles.push(...findSpecFiles(fullDir));
  }

  const codeCids = new Set();
  for (const file of specFiles) {
    const content = fs.readFileSync(file, "utf8");
    const matches = content.matchAll(/C(\d+):/g);
    for (const m of matches) codeCids.add(parseInt(m[1]));
  }

  console.log("C-IDs in code: " + codeCids.size);

  // 2. Собираем все кейсы из TestRail
  let trCases = [];
  if (mod.p0) trCases.push(...(await client.getCases(mod.p0)));
  if (mod.p1) trCases.push(...(await client.getCases(mod.p1)));

  console.log("Cases in TestRail: " + trCases.length);

  // 3. Находим разницу
  const trCids = new Set(trCases.map((c) => c.id));

  const inTrNotInCode = trCases.filter((c) => !codeCids.has(c.id));
  const inCodeNotInTr = [...codeCids].filter((id) => !trCids.has(id));

  console.log(
    "\n--- In TestRail but NOT in code: " + inTrNotInCode.length + " ---",
  );

  // Group by section
  const bySection = {};
  for (const c of inTrNotInCode) {
    const sec = c.section_id || "unknown";
    if (!bySection[sec]) bySection[sec] = [];
    bySection[sec].push(c);
  }

  for (const [sec, cases] of Object.entries(bySection)) {
    console.log("\n  Section " + sec + " (" + cases.length + " cases):");
    for (const c of cases.slice(0, 5)) {
      console.log("    C" + c.id + ": " + (c.title || "(no title)"));
    }
    if (cases.length > 5) {
      for (const c of cases.slice(5)) {
        console.log("    C" + c.id + ": " + (c.title || "(no title)"));
      }
    }
  }

  console.log(
    "\n--- In code but NOT in TestRail: " + inCodeNotInTr.length + " ---",
  );
  if (inCodeNotInTr.length > 0) {
    for (const id of inCodeNotInTr.slice(0, 10)) {
      console.log("  C" + id);
    }
  }
}

function findSpecFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith("_")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findSpecFiles(full));
    else if (entry.name.endsWith(".spec.js")) results.push(full);
  }
  return results;
}

main().catch(console.error);
