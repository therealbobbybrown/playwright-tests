#!/usr/bin/env node
/**
 * Массовая замена isVisible({ timeout }) anti-pattern в spec-файлах.
 *
 * isVisible({ timeout }) — deprecated, timeout игнорируется, метод возвращает результат немедленно.
 * Правильно: .waitFor({ state: 'visible', timeout: N }).then(() => true).catch(() => false)
 *
 * Также заменяет isHidden({ timeout }) на waitFor({ state: 'hidden', timeout: N })
 *
 * Usage:
 *   node scripts/fix-isVisible-antipattern.cjs --dry-run    # только показать что будет изменено
 *   node scripts/fix-isVisible-antipattern.cjs              # применить изменения
 */

const fs = require("fs");
const path = require("path");
const glob = require("glob");

const DRY_RUN = process.argv.includes("--dry-run");

// Find all spec files
const specFiles = glob.sync("tests/**/*.spec.js", {
  cwd: path.resolve(__dirname, ".."),
  absolute: true,
});

console.log(`Found ${specFiles.length} spec files`);

let totalFiles = 0;
let totalReplacements = 0;
const changedFiles = [];

for (const filePath of specFiles) {
  const original = fs.readFileSync(filePath, "utf8");
  let content = original;
  let fileReplacements = 0;

  // Pattern 1: .isVisible({ timeout: <expr> }).catch(() => false)
  // Replace with: .waitFor({ state: 'visible', timeout: <expr> }).then(() => true).catch(() => false)
  content = content.replace(
    /\.isVisible\(\s*\{\s*timeout:\s*([^}]+?)\s*\}\s*\)\s*\.catch\(\s*\(\)\s*=>\s*false\s*\)/g,
    (match, timeoutExpr) => {
      fileReplacements++;
      return `.waitFor({ state: "visible", timeout: ${timeoutExpr.trim()} }).then(() => true).catch(() => false)`;
    },
  );

  // Pattern 2: .isVisible({ timeout: <expr> }) without .catch
  // Replace with: .waitFor({ state: 'visible', timeout: <expr> }).then(() => true).catch(() => false)
  content = content.replace(
    /\.isVisible\(\s*\{\s*timeout:\s*([^}]+?)\s*\}\s*\)/g,
    (match, timeoutExpr) => {
      fileReplacements++;
      return `.waitFor({ state: "visible", timeout: ${timeoutExpr.trim()} }).then(() => true).catch(() => false)`;
    },
  );

  // Pattern 3: .isHidden({ timeout: <expr> }).catch(() => false)
  content = content.replace(
    /\.isHidden\(\s*\{\s*timeout:\s*([^}]+?)\s*\}\s*\)\s*\.catch\(\s*\(\)\s*=>\s*false\s*\)/g,
    (match, timeoutExpr) => {
      fileReplacements++;
      return `.waitFor({ state: "hidden", timeout: ${timeoutExpr.trim()} }).then(() => true).catch(() => false)`;
    },
  );

  // Pattern 4: .isHidden({ timeout: <expr> }) without .catch
  content = content.replace(
    /\.isHidden\(\s*\{\s*timeout:\s*([^}]+?)\s*\}\s*\)/g,
    (match, timeoutExpr) => {
      fileReplacements++;
      return `.waitFor({ state: "hidden", timeout: ${timeoutExpr.trim()} }).then(() => true).catch(() => false)`;
    },
  );

  if (fileReplacements > 0) {
    totalFiles++;
    totalReplacements += fileReplacements;
    const relPath = path.relative(path.resolve(__dirname, ".."), filePath);
    changedFiles.push({ path: relPath, count: fileReplacements });

    if (!DRY_RUN) {
      fs.writeFileSync(filePath, content, "utf8");
    }
  }
}

console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}Results:`);
console.log(`  Files changed: ${totalFiles}`);
console.log(`  Total replacements: ${totalReplacements}`);
console.log(`\nChanged files:`);
for (const f of changedFiles) {
  console.log(`  ${f.count.toString().padStart(3)} replacements: ${f.path}`);
}

if (DRY_RUN) {
  console.log("\nRun without --dry-run to apply changes.");
}
