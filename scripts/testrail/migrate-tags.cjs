#!/usr/bin/env node
/**
 * Migrate @tags from test titles to tag: [] option
 *
 * Usage:
 *   node scripts/testrail/migrate-tags.cjs <module|--all> [--dry-run] [--verbose]
 *
 * Examples:
 *   node scripts/testrail/migrate-tags.cjs auth --dry-run
 *   node scripts/testrail/migrate-tags.cjs --all --dry-run
 *   node scripts/testrail/migrate-tags.cjs performance-review
 */

const fs = require("fs");
const path = require("path");
const config = require("./config.cjs");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const VERBOSE = args.includes("--verbose");
const ALL_MODULES = args.includes("--all");
const moduleName = args.find((a) => !a.startsWith("--"));

if (!moduleName && !ALL_MODULES) {
  console.error(
    "Usage: node scripts/testrail/migrate-tags.cjs <module|--all> [--dry-run] [--verbose]",
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
 * Migrate tags from title strings to { tag: [...] } option in a single file.
 *
 * Handles:
 * - test.describe('title @tag1 @tag2', () => {
 * - test('title @tag1', async ({ ... }) => {
 * - test('@tag1 @tag2 title', async (...) => {
 * - test.describe.serial / test.only / test.skip variants
 *
 * Does NOT handle (warns):
 * - Tests with existing { tag: [...] } option (merge not needed yet)
 * - Backtick template literal titles with ${} expressions
 */
function migrateTagsInFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const replacements = [];

  // Detect test function aliases: import { test as xxx } or const xxx = ...test
  const aliases = new Set(["test"]);
  const aliasMatches = content.matchAll(/import\s*\{[^}]*test\s+as\s+(\w+)/g);
  for (const am of aliasMatches) aliases.add(am[1]);
  const constAliases = content.matchAll(/const\s+(\w+)\s*=\s*(?:base|test)\b/g);
  for (const cm of constAliases) aliases.add(cm[1]);

  // Build alternation for all aliases: test|authTest|base|...
  const aliasPattern = [...aliases]
    .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  // Match test/test.describe/test.only/etc. with quoted title
  // We process each quote type separately
  const quoteTypes = [
    { q: "'", charClass: "[^']*" },
    { q: '"', charClass: '[^"]*' },
    { q: "`", charClass: "[^`]*" },
  ];

  for (const { q, charClass } of quoteTypes) {
    // Build regex: (callType) \s* ( \s* quote (title) quote
    const regex = new RegExp(
      `\\b((?:${aliasPattern})\\.describe(?:\\.(?:serial|parallel))?|(?:${aliasPattern})(?:\\.(?:only|skip|fixme))?)\\s*\\(\\s*${q === "`" ? "`" : "\\" + q}(${charClass})${q === "`" ? "`" : "\\" + q}`,
      "g",
    );

    let match;
    while ((match = regex.exec(content)) !== null) {
      const [fullMatch, callType, title] = match;

      // Skip test.step, test.beforeEach, etc. — these shouldn't match but guard anyway
      if (
        callType.includes("step") ||
        callType.includes("before") ||
        callType.includes("after")
      )
        continue;

      // Extract @tags from title
      const tags = title.match(/@[\w-]+/g);
      if (!tags || tags.length === 0) continue;

      // Check if this position already has a replacement (from another quote regex)
      if (replacements.some((r) => r.start === match.index)) continue;

      // Clean title: remove tags, normalize whitespace, trim
      let cleanTitle = title
        .replace(/@[\w-]+/g, "")
        .replace(/\s+/g, " ")
        .trim();

      // Handle edge case: title becomes empty after removing tags
      if (cleanTitle.length === 0) {
        console.warn(
          `  WARNING: Empty title after tag removal: "${title}" in ${filePath}`,
        );
        continue;
      }

      // Capitalize first letter (but preserve C####:, SET-, numbers, quotes etc.)
      if (/^[a-zа-яё]/.test(cleanTitle)) {
        cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
      }

      // Deduplicate tags
      const uniqueTags = [...new Set(tags)];
      const tagStr = uniqueTags.map((t) => `'${t}'`).join(", ");

      // Check if there's already an options object after the title
      // Look at the text after the closing quote
      const afterFullMatch = content.substring(match.index + fullMatch.length);
      const trimmedAfter = afterFullMatch.replace(/^\s*/, "");

      let replacement;

      if (trimmedAfter.startsWith(",") && trimmedAfter.match(/^,\s*\{/)) {
        // There's already an options object: test('title', { ... }, ...)
        // Check if it contains tag: already
        const existingObjMatch = trimmedAfter.match(/^,\s*\{([^}]*)\}/);
        if (existingObjMatch && existingObjMatch[1].includes("tag:")) {
          // Already has tag: [...] — merge tags
          console.warn(
            `  WARNING: Existing tag:[] found, manual merge needed: ${filePath}`,
          );
          continue;
        }
        // Has options but no tag: — inject tag into existing object
        // Find the opening { position
        const braceOffset = trimmedAfter.indexOf("{");
        const absoluteBracePos =
          match.index + fullMatch.length + afterFullMatch.indexOf("{");

        // Replace title + inject tag into existing options
        replacement = {
          type: "inject",
          start: match.index,
          end: match.index + fullMatch.length,
          titleReplacement: `${callType}(${q}${cleanTitle}${q}`,
          tagInjection: {
            pos: absoluteBracePos + 1,
            text: ` tag: [${tagStr}],`,
          },
        };
      } else {
        // No existing options — add new { tag: [...] }
        replacement = {
          type: "simple",
          start: match.index,
          end: match.index + fullMatch.length,
          text: `${callType}(${q}${cleanTitle}${q}, { tag: [${tagStr}] }`,
        };
      }

      replacements.push({
        ...replacement,
        title,
        cleanTitle,
        tags: uniqueTags,
        line: content.substring(0, match.index).split("\n").length,
      });
    }
  }

  if (replacements.length === 0) {
    return { file: filePath, changes: 0, details: [] };
  }

  // Sort by position descending (apply from bottom up)
  replacements.sort((a, b) => {
    // For inject type, use the later position (tagInjection) first
    const posA =
      a.type === "inject" ? Math.max(a.start, a.tagInjection.pos) : a.start;
    const posB =
      b.type === "inject" ? Math.max(b.start, b.tagInjection.pos) : b.start;
    return posB - posA;
  });

  // Apply replacements from bottom to top
  let modified = content;
  for (const r of replacements) {
    if (r.type === "inject") {
      // First inject tag into existing options object
      modified =
        modified.substring(0, r.tagInjection.pos) +
        r.tagInjection.text +
        modified.substring(r.tagInjection.pos);
      // Then replace title (must recalculate position if injection was after title)
      if (r.tagInjection.pos > r.end) {
        modified =
          modified.substring(0, r.start) +
          r.titleReplacement +
          modified.substring(r.end);
      } else {
        // Injection was between start and end — shouldn't happen
        console.warn(`  WARNING: Unexpected injection position in ${filePath}`);
      }
    } else {
      modified =
        modified.substring(0, r.start) + r.text + modified.substring(r.end);
    }
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
function main() {
  const modules = ALL_MODULES ? Object.keys(config.FILE_PATHS) : [null];
  let totalFiles = 0;
  let totalChanges = 0;
  const results = [];

  for (const dirPath of modules) {
    let specDir;
    let modName;

    if (ALL_MODULES) {
      modName = config.FILE_PATHS[dirPath];
      specDir = path.resolve(__dirname, "../..", dirPath);
    } else {
      // Find directory for the given module name
      const entry = Object.entries(config.FILE_PATHS).find(
        ([, m]) => m === moduleName,
      );
      if (!entry) {
        console.error(`Unknown module: ${moduleName}`);
        console.error(
          `Available: ${Object.values(config.FILE_PATHS).join(", ")}`,
        );
        process.exit(1);
      }
      modName = moduleName;
      specDir = path.resolve(__dirname, "../..", entry[0]);
    }

    const specFiles = findSpecFiles(specDir);
    if (specFiles.length === 0) {
      if (VERBOSE) console.log(`  ${modName}: no spec files found`);
      if (!ALL_MODULES) break;
      continue;
    }

    console.log(`\n=== ${modName} (${specFiles.length} files) ===\n`);

    let moduleChanges = 0;

    for (const file of specFiles) {
      const result = migrateTagsInFile(file);
      if (result.changes > 0) {
        const relPath = path
          .relative(path.resolve(__dirname, "../.."), file)
          .replace(/\\/g, "/");
        console.log(`  ${relPath}: ${result.changes} changes`);

        if (VERBOSE) {
          for (const d of result.details) {
            console.log(
              `    L${d.line}: "${d.title}" → "${d.cleanTitle}" + [${d.tags.join(", ")}]`,
            );
          }
        }

        moduleChanges += result.changes;
      }
    }

    if (moduleChanges === 0) {
      console.log("  No tags to migrate");
    }

    results.push({
      module: modName,
      files: specFiles.length,
      changes: moduleChanges,
    });
    totalFiles += specFiles.length;
    totalChanges += moduleChanges;

    if (!ALL_MODULES) break;
  }

  // Summary
  console.log(`\n\n=== Summary ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  if (results.length > 1) {
    console.log("Module              | Files | Changes");
    console.log("-".repeat(50));
    for (const r of results) {
      console.log(
        `${r.module.padEnd(19)} | ${String(r.files).padStart(5)} | ${r.changes}`,
      );
    }
    console.log("-".repeat(50));
  }

  console.log(`Total: ${totalChanges} tag migrations in ${totalFiles} files`);
  if (DRY_RUN) {
    console.log(
      "\nDry run — no files were modified. Remove --dry-run to apply.",
    );
  }
}

main();
