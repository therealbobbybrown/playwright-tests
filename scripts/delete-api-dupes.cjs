/**
 * Удаление 77 дублей из TestRail API-секции
 */
const path = require("path");
const fs = require("fs");
const config = require("./testrail/config.cjs");
const client = require("./testrail/client.cjs");

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const mod = config.getModule("api");

  // Собираем C-ID из кода
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

  // Кейсы из TestRail
  let trCases = [];
  if (mod.p0) trCases.push(...(await client.getCases(mod.p0)));
  if (mod.p1) trCases.push(...(await client.getCases(mod.p1)));

  // Orphans
  const orphans = trCases.filter((c) => !codeCids.has(c.id));
  console.log(`Orphan cases to delete: ${orphans.length}`);

  if (DRY_RUN) {
    for (const c of orphans) {
      console.log(`  [DRY] Would delete C${c.id}: "${c.title}"`);
    }
    console.log(`\n[DRY RUN] ${orphans.length} cases would be deleted`);
    return;
  }

  let deleted = 0;
  let errors = 0;
  for (const c of orphans) {
    try {
      await client.deleteCase(c.id);
      deleted++;
      console.log(`  Deleted C${c.id}: "${c.title}"`);
      await client.delay(200);
    } catch (e) {
      errors++;
      console.error(`  ERROR C${c.id}: ${e.message}`);
    }
  }

  console.log(`\nDone: ${deleted} deleted, ${errors} errors`);
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
