/**
 * Диагностика: являются ли 77 "No code" кейсов дублями существующих
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

  // 2. Собираем все кейсы из TestRail
  let trCases = [];
  if (mod.p0) trCases.push(...(await client.getCases(mod.p0)));
  if (mod.p1) trCases.push(...(await client.getCases(mod.p1)));

  // 3. Orphan cases (in TR, not in code)
  const orphans = trCases.filter((c) => !codeCids.has(c.id));

  // 4. All TR cases with their titles (for duplicate detection)
  const titleToIds = {};
  for (const c of trCases) {
    const title = (c.title || "").trim();
    if (!titleToIds[title]) titleToIds[title] = [];
    titleToIds[title].push(c.id);
  }

  // 5. Check each orphan
  let exactDupes = 0;
  let fuzzyDupes = 0;
  let unique = 0;
  const categories = { exactDupe: [], fuzzyDupe: [], unique: [] };

  for (const c of orphans) {
    const title = (c.title || "").trim();
    const ids = titleToIds[title] || [];

    if (ids.length > 1) {
      // Exact title match with another case
      const otherIds = ids.filter((id) => id !== c.id);
      const hasCodeMatch = otherIds.some((id) => codeCids.has(id));
      if (hasCodeMatch) {
        exactDupes++;
        categories.exactDupe.push({
          orphan: c.id,
          title: title,
          codeMatch: otherIds.filter((id) => codeCids.has(id)),
        });
      } else {
        fuzzyDupes++;
        categories.fuzzyDupe.push({ orphan: c.id, title, otherIds });
      }
    } else {
      unique++;
      categories.unique.push({ id: c.id, title });
    }
  }

  console.log("=== Анализ 77 orphan-кейсов ===\n");
  console.log("Точные дубли (title совпадает с кейсом в коде): " + exactDupes);
  console.log(
    "Дубли без кода (title совпадает, но оба без кода): " + fuzzyDupes,
  );
  console.log("Уникальные (title не совпадает ни с кем): " + unique);

  if (categories.exactDupe.length > 0) {
    console.log("\n--- ТОЧНЫЕ ДУБЛИ (безопасно удалить из TR) ---");
    for (const d of categories.exactDupe) {
      console.log(
        "  C" +
          d.orphan +
          " → дубль C" +
          d.codeMatch.join(",C") +
          ': "' +
          d.title +
          '"',
      );
    }
  }

  if (categories.unique.length > 0) {
    console.log("\n--- УНИКАЛЬНЫЕ (нет в коде и нет дубля) ---");
    for (const u of categories.unique) {
      console.log("  C" + u.id + ': "' + u.title + '"');
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
