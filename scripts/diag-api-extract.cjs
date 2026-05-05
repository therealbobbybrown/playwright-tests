/**
 * Диагностика: сколько тестов extractTestsWithSteps реально находит
 * vs сколько C-ID в коде
 */
const path = require("path");
const fs = require("fs");
const config = require("./testrail/config.cjs");

// Copy of extractTestsWithSteps from cli.cjs
function extractTestsWithSteps(specFiles) {
  const testsByCid = new Map();

  for (const file of specFiles) {
    const content = fs.readFileSync(file, "utf8");

    const testPositions = [];
    const testRegex =
      /\btest(?:\.(?:only|skip|fixme))?\s*\(\s*'(C(\d+):[^']*)'/g;
    let m;
    while ((m = testRegex.exec(content)) !== null) {
      testPositions.push({ index: m.index, title: m[1], cid: parseInt(m[2]) });
    }
    const testRegex2 =
      /\btest(?:\.(?:only|skip|fixme))?\s*\(\s*"(C(\d+):[^"]*)"/g;
    while ((m = testRegex2.exec(content)) !== null) {
      testPositions.push({ index: m.index, title: m[1], cid: parseInt(m[2]) });
    }
    // Check aliases
    const aliasImports = content.matchAll(/import\s*\{[^}]*test\s+as\s+(\w+)/g);
    const aliases = [];
    for (const am of aliasImports) aliases.push(am[1]);
    const constAliases = content.matchAll(
      /const\s+(\w+)\s*=\s*(?:base|test)\b/g,
    );
    for (const cm of constAliases) aliases.push(cm[1]);
    for (const alias of aliases) {
      const aliasRegex = new RegExp(
        `\\b${alias}(?:\\.(?:only|skip|fixme))?\\s*\\(\\s*'(C(\\d+):[^']*)'`,
        "g",
      );
      while ((m = aliasRegex.exec(content)) !== null) {
        testPositions.push({
          index: m.index,
          title: m[1],
          cid: parseInt(m[2]),
        });
      }
      const aliasRegex2 = new RegExp(
        `\\b${alias}(?:\\.(?:only|skip|fixme))?\\s*\\(\\s*"(C(\\d+):[^"]*)"`,
        "g",
      );
      while ((m = aliasRegex2.exec(content)) !== null) {
        testPositions.push({
          index: m.index,
          title: m[1],
          cid: parseInt(m[2]),
        });
      }
    }

    testPositions.sort((a, b) => a.index - b.index);

    for (let i = 0; i < testPositions.length; i++) {
      const test = testPositions[i];
      const nextTestIndex =
        i + 1 < testPositions.length
          ? testPositions[i + 1].index
          : content.length;
      const testBody = content.substring(test.index, nextTestIndex);

      const steps = [];
      const stepRegex = /\.step\s*\(\s*'([^']*)'/g;
      let sm;
      while ((sm = stepRegex.exec(testBody)) !== null) {
        steps.push(sm[1]);
      }
      const stepRegex2 = /\.step\s*\(\s*"([^"]*)"/g;
      while ((sm = stepRegex2.exec(testBody)) !== null) {
        steps.push(sm[1]);
      }

      if (steps.length > 0 && !testsByCid.has(test.cid)) {
        testsByCid.set(test.cid, {
          cid: test.cid,
          title: test.title,
          steps,
          file,
        });
      }
    }
  }

  return testsByCid;
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

// Main
const dirEntries = Object.entries(config.FILE_PATHS).filter(
  ([, m]) => m === "api",
);
let specFiles = [];
for (const [dirPath] of dirEntries) {
  const fullDir = path.resolve(__dirname, "..", dirPath);
  specFiles.push(...findSpecFiles(fullDir));
}

console.log("Spec files found:", specFiles.length);

// All C-IDs via simple regex
const allCids = new Set();
for (const file of specFiles) {
  const content = fs.readFileSync(file, "utf8");
  const matches = content.matchAll(/['"]C(\d+):/g);
  for (const m of matches) allCids.add(parseInt(m[1]));
}

// extractTestsWithSteps result
const testsByCid = extractTestsWithSteps(specFiles);

console.log("All C-IDs in code (simple regex):", allCids.size);
console.log("extractTestsWithSteps found:", testsByCid.size);
console.log("Difference:", allCids.size - testsByCid.size);

// Find which C-IDs are missing
const missing = [...allCids]
  .filter((id) => !testsByCid.has(id))
  .sort((a, b) => a - b);
console.log("\nMissing C-IDs (" + missing.length + "):");

// Group by file
const missingByFile = {};
for (const file of specFiles) {
  const content = fs.readFileSync(file, "utf8");
  for (const cid of missing) {
    if (content.includes("C" + cid + ":")) {
      const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
      if (!missingByFile[rel]) missingByFile[rel] = [];
      missingByFile[rel].push(cid);
    }
  }
}

for (const [file, cids] of Object.entries(missingByFile)) {
  console.log("\n  " + file + " (" + cids.length + " missing):");
  for (const cid of cids.slice(0, 3)) {
    console.log("    C" + cid);
  }
  if (cids.length > 3) console.log("    ... +" + (cids.length - 3));
}
