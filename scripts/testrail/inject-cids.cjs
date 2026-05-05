#!/usr/bin/env node
/**
 * Inject TestRail C-IDs into test titles
 *
 * For each test() call in spec files, matches against TestRail cases by
 * normalized title and adds C####: prefix. Strips old custom prefixes
 * (PR-021:, CACHE-001:, CAL-EXP-001:, etc.) when adding C-ID.
 *
 * Usage:
 *   node scripts/testrail/inject-cids.cjs <module|--all> [--dry-run] [--verbose]
 *
 * Examples:
 *   node scripts/testrail/inject-cids.cjs objectives --dry-run --verbose
 *   node scripts/testrail/inject-cids.cjs --all --dry-run
 *   node scripts/testrail/inject-cids.cjs performance-review
 */

const fs = require("fs");
const path = require("path");
const config = require("./config.cjs");
const client = require("./client.cjs");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const VERBOSE = args.includes("--verbose");
const ALL_MODULES = args.includes("--all");
const moduleName = args.find((a) => !a.startsWith("--"));

if (!moduleName && !ALL_MODULES) {
  console.error(
    "Usage: node scripts/testrail/inject-cids.cjs <module|--all> [--dry-run] [--verbose]",
  );
  process.exit(1);
}

// Recursively find *.spec.js files
function findSpecFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSpecFiles(fullPath));
    } else if (entry.name.endsWith(".spec.js")) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Strip old custom prefixes from title.
 * Handles: PR-021:, SET-020-A:, CACHE-001:, CAL-EXP-001:, BUG-PR-001:,
 *          PR-300-304:, PR-021+022+023:, PR-330-API:, UI-004-neg:,
 *          DASH-FILTER-001:, API-001:, EDGE-xxx:, STATUS-xxx:, etc.
 */
function stripOldPrefix(title) {
  return (
    title
      // Known custom prefixes: WORD[-WORD][-NUM][+NUM][-WORD]: or similar
      .replace(/^[A-Z][A-Z\d]*(?:[-+][A-Za-z\d+]+)+:?\s+/i, "")
      // Кейс N:, Черновик:, Завершён:, Архив:, Сводка:
      .replace(/^Кейс\s+\d+\w*:\s*/i, "")
      .replace(/^(?:Черновик|Завершён|Архив|Сводка):\s*/i, "")
      // Numbered: 1.1, 5.2, 6.4, etc.
      .replace(/^\d+\.\d+\s+/, "")
      .trim()
  );
}

/**
 * Normalize title for fuzzy matching.
 * Must be identical to the normalizeTitle in cli.cjs (extended).
 */
function normalizeTitle(title) {
  return (
    title
      .replace(/@[\w-]+/g, "") // strip @tags (shouldn't be any after migration)
      // Strip custom prefixes
      .replace(/^[A-Z][A-Z\d]*(?:[-+][A-Za-z\d+]+)+:?\s+/i, "")
      // Strip Кейс N:, Черновик:, etc.
      .replace(/^Кейс\s+\d+\w*:\s*/i, "")
      .replace(/^(?:Черновик|Завершён|Архив|Сводка):\s*/i, "")
      // Strip numbered prefix
      .replace(/^\d+\.\d+\s+/, "")
      // Strip C-ID prefix
      .replace(/^C\d+:\s*/i, "")
      // Strip CL- prefix
      .replace(/^CL-[\w]+-?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  );
}

/**
 * Process a single file: inject C-IDs into test titles.
 */
function injectCidsInFile(filePath, trMap) {
  const content = fs.readFileSync(filePath, "utf8");
  const replacements = [];

  // Detect test function aliases (same logic as migrate-tags)
  const aliases = new Set(["test"]);
  const aliasMatches = content.matchAll(/import\s*\{[^}]*test\s+as\s+(\w+)/g);
  for (const am of aliasMatches) aliases.add(am[1]);
  const constAliases = content.matchAll(/const\s+(\w+)\s*=\s*(?:base|test)\b/g);
  for (const cm of constAliases) aliases.add(cm[1]);

  const aliasPattern = [...aliases]
    .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  // Only match test() calls (not test.describe) — C-IDs go on individual tests
  const quoteTypes = [
    { q: "'", charClass: "[^']*" },
    { q: '"', charClass: '[^"]*' },
    { q: "`", charClass: "[^`]*" },
  ];

  for (const { q, charClass } of quoteTypes) {
    const regex = new RegExp(
      `\\b((?:${aliasPattern})(?:\\.(?:only|skip|fixme))?)\\s*\\(\\s*${q === "`" ? "`" : "\\" + q}(${charClass})${q === "`" ? "`" : "\\" + q}`,
      "g",
    );

    let match;
    while ((match = regex.exec(content)) !== null) {
      const [fullMatch, callType, title] = match;

      // Skip if callType includes describe/step/before/after
      if (
        callType.includes("describe") ||
        callType.includes("step") ||
        callType.includes("before") ||
        callType.includes("after")
      )
        continue;

      // Skip template literals with interpolation
      if (q === "`" && title.includes("${")) continue;

      // Skip if already has C-ID prefix
      if (/^C\d+:/i.test(title)) continue;

      // Skip if replacement already exists at this position
      if (replacements.some((r) => r.start === match.index)) continue;

      // Normalize and look up in TestRail map
      const normalized = normalizeTitle(title);
      const trCase = trMap.get(normalized);

      if (!trCase) continue;

      // Build new title: C####: <clean title>
      const cleanTitle = stripOldPrefix(title);
      // Capitalize first letter after prefix removal
      let finalClean = cleanTitle;
      if (/^[a-zа-яё]/.test(finalClean)) {
        finalClean = finalClean.charAt(0).toUpperCase() + finalClean.slice(1);
      }

      const newTitle = `C${trCase.id}: ${finalClean}`;
      const newFullMatch = `${callType}(${q}${newTitle}${q}`;

      replacements.push({
        start: match.index,
        end: match.index + fullMatch.length,
        text: newFullMatch,
        title,
        newTitle,
        cid: trCase.id,
        line: content.substring(0, match.index).split("\n").length,
      });
    }
  }

  if (replacements.length === 0) {
    return { file: filePath, changes: 0, details: [] };
  }

  // Sort by position descending (apply from bottom up)
  replacements.sort((a, b) => b.start - a.start);

  // Apply replacements
  let modified = content;
  for (const r of replacements) {
    modified =
      modified.substring(0, r.start) + r.text + modified.substring(r.end);
  }

  if (!DRY_RUN) {
    fs.writeFileSync(filePath, modified, "utf8");
  }

  return {
    file: filePath,
    changes: replacements.length,
    details: replacements,
  };
}

// Main
async function main() {
  const moduleNames = ALL_MODULES
    ? Object.values(config.FILE_PATHS)
    : [moduleName];
  // Deduplicate
  const uniqueModules = [...new Set(moduleNames)];
  let totalFiles = 0;
  let totalChanges = 0;
  let totalSkipped = 0;
  const results = [];

  for (const modName of uniqueModules) {
    const mod = config.getModule(modName);
    const dirEntries = Object.entries(config.FILE_PATHS).filter(
      ([, m]) => m === modName,
    );

    if (dirEntries.length === 0) {
      console.log(`  No file path mapping for ${modName} — skipping`);
      continue;
    }

    const specFiles = [];
    for (const [dirPath] of dirEntries) {
      const specDir = path.resolve(__dirname, "../..", dirPath);
      specFiles.push(...findSpecFiles(specDir));
    }

    if (specFiles.length === 0) {
      if (VERBOSE) console.log(`  ${modName}: no spec files found`);
      continue;
    }

    // Get TestRail cases
    let trCases = [];
    try {
      if (mod && mod.p0) {
        const p0 = await client.getCases(mod.p0);
        trCases.push(...p0);
      }
      if (mod && mod.p1) {
        const p1 = await client.getCases(mod.p1);
        trCases.push(...p1);
      }
    } catch (e) {
      console.log(
        `  Could not fetch TestRail cases for ${modName}: ${e.message}`,
      );
      continue;
    }

    if (trCases.length === 0) {
      console.log(`  ${modName}: no TestRail cases found`);
      results.push({
        module: modName,
        files: specFiles.length,
        changes: 0,
        skipped: 0,
      });
      continue;
    }

    // Build normalized title -> case map
    const trMap = new Map();
    for (const c of trCases) {
      const norm = normalizeTitle(c.title);
      if (!trMap.has(norm)) {
        trMap.set(norm, c);
      }
    }

    console.log(
      `\n=== ${modName} (${specFiles.length} files, ${trCases.length} TR cases) ===\n`,
    );

    let moduleChanges = 0;
    let moduleSkipped = 0;

    for (const file of specFiles) {
      const result = injectCidsInFile(file, trMap);
      if (result.changes > 0) {
        const relPath = path
          .relative(path.resolve(__dirname, "../.."), file)
          .replace(/\\/g, "/");
        console.log(`  ${relPath}: ${result.changes} injected`);

        if (VERBOSE) {
          for (const d of result.details) {
            console.log(
              `    L${d.line}: C${d.cid}: "${d.title}" → "${d.newTitle}"`,
            );
          }
        }

        moduleChanges += result.changes;
      }
    }

    if (moduleChanges === 0) {
      console.log("  No C-IDs to inject (all matched or no matches)");
    }

    results.push({
      module: modName,
      files: specFiles.length,
      changes: moduleChanges,
      trCases: trCases.length,
    });
    totalFiles += specFiles.length;
    totalChanges += moduleChanges;
  }

  // Summary
  console.log(`\n\n=== Summary ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  if (results.length > 1) {
    console.log("Module              | Files | TR Cases | Injected");
    console.log("-".repeat(55));
    for (const r of results) {
      console.log(
        `${r.module.padEnd(19)} | ${String(r.files).padStart(5)} | ${String(r.trCases || 0).padStart(8)} | ${r.changes}`,
      );
    }
    console.log("-".repeat(55));
  }

  console.log(`Total: ${totalChanges} C-IDs injected in ${totalFiles} files`);
  if (DRY_RUN) {
    console.log(
      "\nDry run — no files were modified. Remove --dry-run to apply.",
    );
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
