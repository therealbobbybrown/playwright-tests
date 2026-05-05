#!/usr/bin/env node
/**
 * Lint test naming conventions
 *
 * Validates:
 * 1. No @tags in test/describe titles (should be in tag:[])
 * 2. No custom prefixes (PR-021:, SET-001:, CACHE-001: etc.) — only C####: allowed
 * 3. First letter after C-ID must be uppercase
 * 4. File extension must be .spec.js
 *
 * Usage:
 *   node scripts/lint-test-names.cjs [files...]       # Lint specific files
 *   node scripts/lint-test-names.cjs --staged          # Lint staged .spec.js files
 *   node scripts/lint-test-names.cjs --all             # Lint all spec files
 *   node scripts/lint-test-names.cjs --fix             # Auto-fix with migrate-tags + inject-cids
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const args = process.argv.slice(2);
const STAGED = args.includes("--staged");
const ALL = args.includes("--all");
const FIX = args.includes("--fix");
const QUIET = args.includes("--quiet");
const fileArgs = args.filter((a) => !a.startsWith("--"));

// Get files to lint
function getFiles() {
  if (fileArgs.length > 0) {
    return fileArgs.filter((f) => f.endsWith(".spec.js") && fs.existsSync(f));
  }

  if (STAGED) {
    try {
      const output = execSync(
        "git diff --cached --name-only --diff-filter=ACM",
        { encoding: "utf8" },
      );
      return output.split("\n").filter((f) => f.trim().endsWith(".spec.js"));
    } catch {
      return [];
    }
  }

  if (ALL) {
    return findSpecFiles("tests/functional");
  }

  // Default: staged files
  try {
    const output = execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf8",
    });
    const staged = output
      .split("\n")
      .filter((f) => f.trim().endsWith(".spec.js"));
    if (staged.length > 0) return staged;
  } catch {
    /* ignore */
  }

  // Fallback: modified files
  try {
    const output = execSync("git diff --name-only --diff-filter=ACM", {
      encoding: "utf8",
    });
    return output.split("\n").filter((f) => f.trim().endsWith(".spec.js"));
  } catch {
    return [];
  }
}

function findSpecFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSpecFiles(fullPath));
    } else if (entry.name.endsWith(".spec.js")) {
      results.push(fullPath.replace(/\\/g, "/"));
    }
  }
  return results;
}

// Violation types
const RULES = {
  TAGS_IN_TITLE: "tags-in-title",
  CUSTOM_PREFIX: "custom-prefix",
  LOWERCASE_AFTER_CID: "lowercase-after-cid",
  CYRILLIC_PREFIX: "cyrillic-prefix",
};

function lintFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  const violations = [];

  // Detect test aliases
  const aliases = new Set(["test"]);
  const aliasImports = content.matchAll(/import\s*\{[^}]*test\s+as\s+(\w+)/g);
  for (const am of aliasImports) aliases.add(am[1]);
  const constAliases = content.matchAll(/const\s+(\w+)\s*=\s*(?:base|test)\b/g);
  for (const cm of constAliases) aliases.add(cm[1]);
  const aliasPattern = [...aliases]
    .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  // Find test() and test.describe() calls
  const quoteTypes = [
    { q: "'", cc: "[^']*" },
    { q: '"', cc: '[^"]*' },
    { q: "`", cc: "[^`]*" },
  ];

  for (const { q, cc } of quoteTypes) {
    const regex = new RegExp(
      `\\b((?:${aliasPattern})(?:\\.describe)?(?:\\.(?:only|skip|fixme|serial|parallel))?)\\s*\\(\\s*${q === "`" ? "`" : "\\" + q}(${cc})${q === "`" ? "`" : "\\" + q}`,
      "g",
    );

    let match;
    while ((match = regex.exec(content)) !== null) {
      const [, callType, title] = match;

      // Skip step/before/after
      if (/\.(step|before|after)/.test(callType)) continue;

      // Skip template literals with interpolation
      if (q === "`" && title.includes("${")) continue;

      const line = content.substring(0, match.index).split("\n").length;

      // Rule 1: No @tags in title
      const tagsInTitle = title.match(/@[\w-]+/g);
      if (tagsInTitle) {
        violations.push({
          rule: RULES.TAGS_IN_TITLE,
          file: filePath,
          line,
          title,
          message: `Tags in title: ${tagsInTitle.join(", ")} — move to tag:[]`,
        });
      }

      // Rule 2: No custom prefixes (only C####: allowed)
      const customPrefixMatch = title.match(
        /^[A-Z][A-Z\d]*(?:[-+][A-Za-z\d+]+)+:?\s/i,
      );
      if (customPrefixMatch && !/^C\d+:/i.test(title)) {
        violations.push({
          rule: RULES.CUSTOM_PREFIX,
          file: filePath,
          line,
          title,
          message: `Custom prefix: "${customPrefixMatch[0].trim()}" — use C####: or remove`,
        });
      }

      // Rule 2b: Cyrillic prefixes (Кейс N:, Черновик:, etc.)
      const cyrillicPrefix = title.match(
        /^(Кейс\s+\d+\w*:|Черновик:|Завершён:|Архив:|Сводка:)\s*/i,
      );
      if (cyrillicPrefix) {
        violations.push({
          rule: RULES.CYRILLIC_PREFIX,
          file: filePath,
          line,
          title,
          message: `Cyrillic prefix: "${cyrillicPrefix[1]}" — remove`,
        });
      }

      // Rule 3: First letter after C-ID must be uppercase
      const cidBodyMatch = title.match(/^C\d+:\s*([a-zа-яё])/);
      if (cidBodyMatch) {
        violations.push({
          rule: RULES.LOWERCASE_AFTER_CID,
          file: filePath,
          line,
          title,
          message: `Lowercase after C-ID: "${cidBodyMatch[1]}" — capitalize`,
        });
      }
    }
  }

  return violations;
}

// Main
const files = getFiles();
if (files.length === 0) {
  if (!QUIET) console.log("No spec files to lint.");
  process.exit(0);
}

let totalViolations = 0;
const allViolations = [];

for (const file of files) {
  const violations = lintFile(file);
  if (violations.length > 0) {
    totalViolations += violations.length;
    allViolations.push(...violations);

    if (!QUIET) {
      const relPath = path.relative(".", file).replace(/\\/g, "/");
      for (const v of violations) {
        console.log(`  ${relPath}:${v.line}  ${v.message}`);
      }
    }
  }
}

if (totalViolations > 0) {
  console.log(
    `\n${totalViolations} naming violation(s) in ${files.length} file(s)`,
  );

  // Group by rule
  const byRule = {};
  for (const v of allViolations) {
    byRule[v.rule] = (byRule[v.rule] || 0) + 1;
  }
  for (const [rule, count] of Object.entries(byRule)) {
    console.log(`  ${rule}: ${count}`);
  }

  if (FIX) {
    console.log("\nAuto-fixing...");
    try {
      execSync("node scripts/testrail/migrate-tags.cjs --all", {
        stdio: "inherit",
      });
    } catch {
      /* ignore errors */
    }
  } else {
    console.log("\nRun with --fix to auto-fix, or manually:");
    console.log("  node scripts/testrail/migrate-tags.cjs --all    # Fix tags");
    console.log(
      "  node scripts/testrail/inject-cids.cjs --all     # Fix C-IDs",
    );
  }

  process.exit(1);
} else {
  if (!QUIET) console.log(`${files.length} file(s) OK`);
  process.exit(0);
}
