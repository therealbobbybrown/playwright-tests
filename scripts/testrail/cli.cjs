#!/usr/bin/env node
/**
 * TestRail CLI - Universal tool for TestRail operations
 *
 * Usage:
 *   node scripts/testrail/cli.cjs <command> [options]
 *
 * Commands:
 *   list-modules           List all configured modules
 *   list-sections          List all TestRail sections
 *   list-cases <module>    List test cases in a module
 *   update-priorities <module>  Update case priorities (P0/P1)
 *   sync-steps <module>    Sync steps (remove cleanup, add expected)
 *   move-to-p0 <module>    Move P0 cases to P0 section
 *   export <module>        Export cases to JSON/MD
 *   delete-cases <ids>     Delete cases by ID range (e.g., 3000-3010)
 *   analyze <module>       Analyze spec files vs TestRail cases (diff)
 *   push-new <module>      Push new tests (in code, not in TR) to TestRail
 *
 * Options:
 *   --dry-run              Preview changes without applying
 *   --all                  Apply to all modules
 *   --verbose              Show detailed output
 */

const client = require("./client.cjs");
const config = require("./config.cjs");
const {
  sanitizeStepContent,
  generateExpected,
  capitalizeFirst,
  buildTestRailSteps,
} = require("./step-utils.cjs");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const command = args[0];
const DRY_RUN = args.includes("--dry-run");
const VERBOSE = args.includes("--verbose");
const ALL_MODULES = args.includes("--all");
const FORCE = args.includes("--force");
const REGENERATE = args.includes("--regenerate");

// Get positional argument (module name, etc.)
function getArg(index) {
  return args.filter((a) => !a.startsWith("--"))[index];
}

// Print usage
function printUsage() {
  console.log(`
TestRail CLI - Universal tool for TestRail operations

Usage:
  node scripts/testrail/cli.cjs <command> [options]

Commands:
  list-modules              List all configured modules
  list-sections             List all TestRail sections
  list-cases <module>       List test cases in a module
  update-priorities <module>  Update case priorities (P0/P1)
  sync-steps <module>       Sync steps (remove cleanup, add expected)
  move-to-p0 <module>       Move P0 cases to P0 section
  export <module>           Export cases to JSON/MD
  delete-cases <range>      Delete cases by ID range (e.g., 3000-3010)
  analyze <module>          Analyze spec files vs TestRail (diff, P0/P1)
  push-new <module>         Push new tests to TestRail (use --dry-run first!)
  sync-titles <module>      Sync titles from code to TestRail
  push-steps <module>       Push test steps from code to TestRail
  sync <module>             Full sync: push-new → inject-cids → sync-titles → push-steps
  create-run <module>      Create TestRail run with validated case IDs
  coverage-report <module> Show coverage: code vs TR cases + step quality

Options:
  --dry-run                 Preview changes without applying
  --all                     Apply to all modules
  --verbose                 Show detailed output
  --force                   push-steps: overwrite existing steps (re-push)
  --regenerate              sync-steps: regenerate ALL expected results (not just missing)
  --type=<type>             create-run: run type (Regression|Smoke|Feature, default: Regression)
  --name=<name>             create-run: custom display name for the run

Examples:
  node scripts/testrail/cli.cjs list-modules
  node scripts/testrail/cli.cjs update-priorities surveys --dry-run
  node scripts/testrail/cli.cjs sync-steps --all
  node scripts/testrail/cli.cjs push-steps performance-review --force --dry-run
  node scripts/testrail/cli.cjs sync-steps --all --regenerate --dry-run
  node scripts/testrail/cli.cjs create-run performance-review
  node scripts/testrail/cli.cjs create-run performance-review --tag=@smoke --dry-run
  node scripts/testrail/cli.cjs export objectives
  node scripts/testrail/cli.cjs delete-cases 3000-3010 --dry-run
  node scripts/testrail/cli.cjs coverage-report --all
  node scripts/testrail/cli.cjs coverage-report api --verbose
`);
}

// List all configured modules
async function listModules() {
  console.log("\n=== Configured Modules ===\n");
  console.log("Module           | Name                    | P0    | P1");
  console.log("-".repeat(65));

  for (const [key, mod] of Object.entries(config.MODULES)) {
    const name = mod.name.padEnd(23);
    const k = key.padEnd(16);
    console.log(`${k} | ${name} | ${mod.p0}  | ${mod.p1}`);
  }
  console.log();
}

// List all sections from TestRail
async function listSections() {
  console.log("\n=== TestRail Sections ===\n");

  const sections = await client.getSections();
  const sectionMap = client.buildSectionMap(sections);

  // Find Jinn children only
  const jinnChildren = sections.filter(
    (s) => s.parent_id === config.JINN_SECTION_ID,
  );

  for (const parent of jinnChildren.sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    console.log(`\n${parent.name} (${parent.id})`);

    const children = sections.filter((s) => s.parent_id === parent.id);
    for (const child of children) {
      console.log(`  └─ ${child.name} (${child.id})`);
    }
  }
  console.log();
}

// List cases in a module
async function listCases(moduleName) {
  const mod = config.getModule(moduleName);
  if (!mod) {
    console.error(`Unknown module: ${moduleName}`);
    console.log("Available:", config.getModuleNames().join(", "));
    process.exit(1);
  }

  console.log(`\n=== ${mod.name} Test Cases ===\n`);

  // Get P0 and P1 cases
  const p0Cases = await client.getCases(mod.p0);
  const p1Cases = await client.getCases(mod.p1);

  console.log(`P0 Section (${mod.p0}): ${p0Cases.length} cases`);
  if (VERBOSE) {
    p0Cases.forEach((c) => console.log(`  C${c.id}: ${c.title}`));
  }

  console.log(`\nP1 Section (${mod.p1}): ${p1Cases.length} cases`);
  if (VERBOSE) {
    p1Cases.forEach((c) => console.log(`  C${c.id}: ${c.title}`));
  }

  console.log(`\nTotal: ${p0Cases.length + p1Cases.length} cases`);
}

// Update priorities for a module
async function updatePriorities(moduleName) {
  const modules = ALL_MODULES ? config.getModuleNames() : [moduleName];

  for (const name of modules) {
    const mod = config.getModule(name);
    if (!mod) {
      console.warn(`Skipping unknown module: ${name}`);
      continue;
    }

    console.log(`\n=== Updating priorities: ${mod.name} ===`);
    console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

    const cases = await client.getCases(mod.p1);
    console.log(`Found ${cases.length} cases in P1 section\n`);

    let p0Count = 0,
      updated = 0;

    for (const c of cases) {
      const shouldBeP0 = config.isP0Test(c.title, name);
      const newPriority = shouldBeP0
        ? config.PRIORITY.CRITICAL
        : config.PRIORITY.HIGH;

      if (shouldBeP0) p0Count++;

      if (c.priority_id !== newPriority) {
        const label = shouldBeP0 ? "P0" : "P1";
        console.log(`  [${label}] C${c.id}: ${c.title.substring(0, 60)}`);

        if (!DRY_RUN) {
          await client.updateCase(c.id, { priority_id: newPriority });
          await client.delay(100);
        }
        updated++;
      }
    }

    console.log(`\nSummary: ${p0Count} P0 tests, ${updated} updated`);
  }
}

// Step utility functions imported from step-utils.cjs (sanitizeStepContent, generateExpected, etc.)

// Sync steps for a module
async function syncSteps(moduleName) {
  const modules = ALL_MODULES ? config.getModuleNames() : [moduleName];

  for (const name of modules) {
    const mod = config.getModule(name);
    if (!mod) {
      console.warn(`Skipping unknown module: ${name}`);
      continue;
    }

    console.log(`\n=== Syncing steps: ${mod.name} ===`);
    console.log(
      `Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}${REGENERATE ? " + REGENERATE" : ""}\n`,
    );

    let cases = [];
    if (mod.p0) cases.push(...(await client.getCases(mod.p0)));
    if (mod.p1) cases.push(...(await client.getCases(mod.p1)));
    console.log(`Found ${cases.length} cases (P0+P1)\n`);

    let fixed = 0;

    for (const c of cases) {
      const steps = c.custom_steps_separated;
      if (!steps || steps.length === 0) continue;

      const newSteps = [];
      let needsUpdate = false;

      for (const step of steps) {
        const rawContent = step.content || "";

        // Skip excluded patterns
        const isExcluded = config.EXCLUDED_STEP_PATTERNS.some((p) =>
          p.test(rawContent),
        );
        if (isExcluded) {
          needsUpdate = true;
          continue;
        }

        // Sanitize content (strip locators/code artifacts)
        const content = sanitizeStepContent(rawContent);
        if (content !== rawContent) {
          needsUpdate = true;
        }

        // Regenerate expected: always with --regenerate, or only if missing
        let expected = step.expected || "";
        if (REGENERATE || !expected.trim()) {
          const newExpected = generateExpected(content);
          if (newExpected !== expected) {
            expected = newExpected;
            needsUpdate = true;
          }
        }

        newSteps.push({
          content: content || rawContent,
          expected,
          additional_info: step.additional_info || "",
          refs: step.refs || "",
        });
      }

      if (needsUpdate && newSteps.length > 0) {
        console.log(
          `  Fixed C${c.id}: ${steps.length}→${newSteps.length} steps`,
        );

        if (!DRY_RUN) {
          await client.updateCase(c.id, { custom_steps_separated: newSteps });
          await client.delay(100);
        }
        fixed++;
      }
    }

    console.log(`\nFixed: ${fixed} cases`);
  }
}

// Move P0 cases to P0 section
async function moveToP0(moduleName) {
  const modules = ALL_MODULES ? config.getModuleNames() : [moduleName];

  for (const name of modules) {
    const mod = config.getModule(name);
    if (!mod) {
      console.warn(`Skipping unknown module: ${name}`);
      continue;
    }

    console.log(`\n=== Moving P0 cases: ${mod.name} ===`);
    console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

    const p1Cases = await client.getCases(mod.p1);
    console.log(`Found ${p1Cases.length} cases in P1 section\n`);

    let moved = 0;

    for (const c of p1Cases) {
      if (config.isP0Test(c.title, name)) {
        console.log(`  Moving C${c.id}: ${c.title.substring(0, 60)}`);

        if (!DRY_RUN) {
          await client.updateCase(c.id, { section_id: mod.p0 });
          await client.delay(200);
        }
        moved++;
      }
    }

    console.log(`\nMoved: ${moved} cases to P0 section`);
  }
}

// Export cases to file
async function exportCases(moduleName) {
  const mod = config.getModule(moduleName);
  if (!mod) {
    console.error(`Unknown module: ${moduleName}`);
    process.exit(1);
  }

  console.log(`\n=== Exporting: ${mod.name} ===\n`);

  const p0Cases = await client.getCases(mod.p0);
  const p1Cases = await client.getCases(mod.p1);
  const allCases = [...p0Cases, ...p1Cases];

  console.log(
    `Found ${allCases.length} cases (${p0Cases.length} P0, ${p1Cases.length} P1)\n`,
  );

  // JSON export
  const jsonData = {
    module: moduleName,
    name: mod.name,
    exported: new Date().toISOString(),
    totalCases: allCases.length,
    p0Cases: p0Cases.length,
    p1Cases: p1Cases.length,
    cases: allCases.map((c) => ({
      id: c.id,
      title: c.title,
      priority: c.priority_id === 4 ? "P0" : "P1",
      section: c.section_id === mod.p0 ? "P0" : "P1",
      preconditions: c.custom_preconds,
      steps: c.custom_steps_separated || c.custom_steps,
      expected: c.custom_expected,
    })),
  };

  const jsonPath = path.resolve(
    __dirname,
    `../../docs/testrail-${moduleName}.json`,
  );
  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), "utf8");
  console.log(`Saved: ${jsonPath}`);

  // Markdown export
  const mdLines = [
    `# ${mod.name} - Test Cases`,
    "",
    `Exported: ${new Date().toISOString()}`,
    `Total: ${allCases.length} cases (${p0Cases.length} P0, ${p1Cases.length} P1)`,
    "",
    "---",
    "",
  ];

  for (const c of allCases) {
    const priority = c.priority_id === 4 ? "P0" : "P1";
    mdLines.push(`## C${c.id}: ${c.title}`);
    mdLines.push(`**Priority:** ${priority}`);

    if (c.custom_preconds) {
      mdLines.push("", "**Preconditions:**", c.custom_preconds);
    }

    if (c.custom_steps_separated && c.custom_steps_separated.length > 0) {
      mdLines.push("", "**Steps:**");
      c.custom_steps_separated.forEach((step, i) => {
        mdLines.push(`${i + 1}. ${step.content || ""}`);
        if (step.expected) {
          mdLines.push(`   - Expected: ${step.expected}`);
        }
      });
    }

    mdLines.push("", "---", "");
  }

  const mdPath = path.resolve(
    __dirname,
    `../../docs/testrail-${moduleName}.md`,
  );
  fs.writeFileSync(mdPath, mdLines.join("\n"), "utf8");
  console.log(`Saved: ${mdPath}`);
}

// Clean title for TestRail (remove tags, C-IDs, custom prefixes, capitalize)
function cleanTitleForExport(title) {
  let cleaned = title
    .replace(/@[\w-]+/g, "") // strip @tags
    .replace(/^C\d+:\s*/i, "") // strip C1234: prefix
    .replace(/^[A-Z][A-Z\d]*(?:[-+][A-Za-z\d+]+)+:?\s+/i, "") // strip custom prefixes (SET-001:, PR-021:, etc.)
    .replace(/^Кейс\s+\d+\w*:\s*/i, "") // strip "Кейс N:" prefix
    .replace(/^Черновик:\s*/i, "") // strip "Черновик:" prefix
    .replace(/^Завершён:\s*/i, "") // strip "Завершён:" prefix
    .replace(/^Архив:\s*/i, "") // strip "Архив:" prefix
    .replace(/^Сводка:\s*/i, "") // strip "Сводка:" prefix
    .replace(/^\d+\.\d+\s+/, "") // strip numbered prefix
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
  // Capitalize first letter
  if (cleaned && /^[a-zа-яё]/.test(cleaned)) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

// Normalize title for fuzzy comparison
function normalizeTitle(title) {
  return title
    .replace(/@[\w-]+/g, "") // strip @tags
    .replace(/^C\d+:\s*/i, "") // strip C1234: prefix (MUST be early, before status prefixes)
    .replace(/^[A-Z][A-Z\d]*(?:[-+][A-Za-z\d+]+)+:?\s+/i, "") // strip custom prefixes (PR-021:, CACHE-001:, CAL-EXP-001:, etc.)
    .replace(/^Кейс\s+\d+\w*:\s*/i, "") // strip "Кейс N:" prefix
    .replace(/^Черновик:\s*/i, "") // strip "Черновик:" prefix
    .replace(/^Завершён:\s*/i, "") // strip "Завершён:" prefix
    .replace(/^Архив:\s*/i, "") // strip "Архив:" prefix
    .replace(/^Сводка:\s*/i, "") // strip "Сводка:" prefix
    .replace(/^\d+\.\d+\s+/, "") // strip numbered prefix (1.1, 5.2)
    .replace(/^CL-[\w]+-?\s*/i, "") // strip CL-XXX- prefix
    .replace(/\s+/g, " ") // collapse whitespace
    .trim()
    .toLowerCase();
}

// Analyze spec files vs TestRail cases
async function analyze(moduleName) {
  const modules = ALL_MODULES ? config.getModuleNames() : [moduleName];
  const glob = require("path");
  const summary = [];

  for (const name of modules) {
    const mod = config.getModule(name);
    if (!mod) {
      console.warn(`Skipping unknown module: ${name}`);
      continue;
    }

    // Resolve directory paths from FILE_PATHS (may have multiple dirs per module)
    const dirEntries = Object.entries(config.FILE_PATHS).filter(
      ([, m]) => m === name,
    );

    console.log(`\n=== Analyzing: ${mod.name} (${name}) ===\n`);

    // Phase 1: Scan spec files
    let specFiles = [];
    if (dirEntries.length > 0) {
      for (const [dirPath] of dirEntries) {
        const fullDir = path.resolve(__dirname, "../..", dirPath);
        specFiles.push(...findSpecFiles(fullDir));
      }
      console.log(`Spec files found: ${specFiles.length}`);
    } else {
      console.log(
        `No file path mapping for module "${name}" — skipping local scan`,
      );
    }

    // Phase 2: Extract test names and tags from spec files
    const localTests = extractTests(specFiles);

    console.log(`Tests extracted: ${localTests.length}`);
    const p0Local = localTests.filter((t) => t.priority === "P0").length;
    const p1Local = localTests.length - p0Local;
    console.log(`  P0: ${p0Local}, P1: ${p1Local}`);

    // P0 threshold check
    if (localTests.length > 0) {
      const p0Pct = ((p0Local / localTests.length) * 100).toFixed(1);
      if (parseFloat(p0Pct) > 20) {
        console.log(`  ⚠ WARNING: P0 = ${p0Pct}% (> 20% threshold)`);
      }
    }

    // Phase 3: Get TestRail cases
    let trP0Cases = [],
      trP1Cases = [];
    try {
      if (mod.p0) trP0Cases = await client.getCases(mod.p0);
      if (mod.p1) trP1Cases = await client.getCases(mod.p1);
    } catch (e) {
      console.log(`  Could not fetch TestRail cases: ${e.message}`);
    }

    const trCases = [...trP0Cases, ...trP1Cases];
    console.log(
      `\nTestRail cases: ${trCases.length} (${trP0Cases.length} P0, ${trP1Cases.length} P1)`,
    );

    // Phase 4: Diff (normalized title comparison)
    const trNormalized = new Map(
      trCases.map((c) => [normalizeTitle(c.title), c]),
    );
    const localNormalized = new Map(
      localTests.map((t) => [normalizeTitle(t.title), t]),
    );

    const newTests = localTests.filter(
      (t) => !trNormalized.has(normalizeTitle(t.title)),
    );
    const orphaned = trCases.filter(
      (c) => !localNormalized.has(normalizeTitle(c.title)),
    );
    const matched = localTests.filter((t) =>
      trNormalized.has(normalizeTitle(t.title)),
    );

    console.log(`\nDiff:`);
    console.log(`  New (in code, not in TestRail): ${newTests.length}`);
    console.log(`  Orphaned (in TestRail, not in code): ${orphaned.length}`);
    console.log(`  Matched: ${matched.length}`);

    if (VERBOSE) {
      if (newTests.length > 0) {
        console.log("\n  New tests:");
        newTests.forEach((t) =>
          console.log(`    + ${t.title} [${t.priority}] (${t.file})`),
        );
      }
      if (orphaned.length > 0) {
        console.log("\n  Orphaned cases:");
        orphaned.forEach((c) => console.log(`    - C${c.id}: ${c.title}`));
      }
    }

    summary.push({
      module: name,
      name: mod.name,
      specFiles: specFiles.length,
      localTests: localTests.length,
      p0Local,
      p1Local,
      trTotal: trCases.length,
      trP0: trP0Cases.length,
      trP1: trP1Cases.length,
      new: newTests.length,
      orphaned: orphaned.length,
      matched: matched.length,
    });
  }

  // Summary table
  if (summary.length > 1) {
    console.log("\n\n=== Summary ===\n");
    console.log(
      "Module              | Files | Tests | P0 | P1 | TR  | New | Orphaned",
    );
    console.log("-".repeat(80));
    for (const s of summary) {
      const mod = s.module.padEnd(19);
      console.log(
        `${mod} | ${String(s.specFiles).padStart(5)} | ${String(s.localTests).padStart(5)} | ${String(s.p0Local).padStart(2)} | ${String(s.p1Local).padStart(2)} | ${String(s.trTotal).padStart(3)} | ${String(s.new).padStart(3)} | ${s.orphaned}`,
      );
    }
    const totals = summary.reduce(
      (acc, s) => ({
        files: acc.files + s.specFiles,
        tests: acc.tests + s.localTests,
        p0: acc.p0 + s.p0Local,
        p1: acc.p1 + s.p1Local,
        tr: acc.tr + s.trTotal,
        newT: acc.newT + s.new,
        orphaned: acc.orphaned + s.orphaned,
      }),
      { files: 0, tests: 0, p0: 0, p1: 0, tr: 0, newT: 0, orphaned: 0 },
    );
    console.log("-".repeat(80));
    console.log(
      `${"TOTAL".padEnd(19)} | ${String(totals.files).padStart(5)} | ${String(totals.tests).padStart(5)} | ${String(totals.p0).padStart(2)} | ${String(totals.p1).padStart(2)} | ${String(totals.tr).padStart(3)} | ${String(totals.newT).padStart(3)} | ${totals.orphaned}`,
    );
  }
}

// Push new tests to TestRail (create cases that exist in code but not in TR)
async function pushNew(moduleName) {
  const modules = ALL_MODULES ? config.getModuleNames() : [moduleName];
  let totalCreated = 0;
  let totalSkipped = 0;
  const results = [];

  for (const name of modules) {
    const mod = config.getModule(name);
    if (!mod) {
      console.warn(`Skipping unknown module: ${name}`);
      continue;
    }

    const dirEntries = Object.entries(config.FILE_PATHS).filter(
      ([, m]) => m === name,
    );

    console.log(`\n=== Push new: ${mod.name} (${name}) ===\n`);

    // Scan spec files
    let specFiles = [];
    if (dirEntries.length > 0) {
      for (const [dirPath] of dirEntries) {
        const fullDir = path.resolve(__dirname, "../..", dirPath);
        specFiles.push(...findSpecFiles(fullDir));
      }
    } else {
      console.log(`  No file path mapping — skipping`);
      continue;
    }

    // Extract tests from code
    const localTests = extractTests(specFiles);
    if (localTests.length === 0) {
      console.log(`  No tests found in code`);
      continue;
    }

    // Get TestRail cases
    let trP0Cases = [],
      trP1Cases = [];
    try {
      if (mod.p0) trP0Cases = await client.getCases(mod.p0);
      if (mod.p1) trP1Cases = await client.getCases(mod.p1);
    } catch (e) {
      console.log(`  Could not fetch TestRail cases: ${e.message}`);
      continue;
    }

    const trCases = [...trP0Cases, ...trP1Cases];
    const trNormalized = new Map(
      trCases.map((c) => [normalizeTitle(c.title), c]),
    );

    // Find new tests
    const newTests = localTests.filter(
      (t) => !trNormalized.has(normalizeTitle(t.title)),
    );
    if (newTests.length === 0) {
      console.log(`  All ${localTests.length} tests already in TestRail`);
      results.push({ module: name, created: 0, skipped: 0 });
      continue;
    }

    console.log(
      `  ${newTests.length} new tests to push (${localTests.length} total, ${trCases.length} in TR)`,
    );

    let created = 0,
      skipped = 0;

    for (const test of newTests) {
      const cleanTitle = cleanTitleForExport(test.title);
      const sectionId = test.priority === "P0" ? mod.p0 : mod.p1;

      if (!sectionId) {
        console.log(`  SKIP (no section): ${cleanTitle} [${test.priority}]`);
        skipped++;
        continue;
      }

      const priorityId =
        test.priority === "P0"
          ? config.PRIORITY.CRITICAL
          : config.PRIORITY.HIGH;

      if (DRY_RUN) {
        console.log(`  [DRY] Would create in ${test.priority}: ${cleanTitle}`);
        created++;
      } else {
        try {
          const result = await client.addCase(sectionId, {
            title: cleanTitle,
            priority_id: priorityId,
          });
          console.log(
            `  Created C${result.id}: ${cleanTitle} [${test.priority}]`,
          );
          created++;
          await client.delay(150);
        } catch (e) {
          console.log(`  ERROR creating "${cleanTitle}": ${e.message}`);
          skipped++;
        }
      }
    }

    results.push({ module: name, created, skipped });
    totalCreated += created;
    totalSkipped += skipped;
  }

  // Summary
  console.log(`\n\n=== Push Summary ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);
  console.log("Module              | Created | Skipped");
  console.log("-".repeat(50));
  for (const r of results) {
    console.log(
      `${r.module.padEnd(19)} | ${String(r.created).padStart(7)} | ${r.skipped}`,
    );
  }
  console.log("-".repeat(50));
  console.log(
    `${"TOTAL".padEnd(19)} | ${String(totalCreated).padStart(7)} | ${totalSkipped}`,
  );
}

// Extract tests from spec files (shared by analyze and push-new)
function extractTests(specFiles) {
  const localTests = [];
  for (const file of specFiles) {
    const content = fs.readFileSync(file, "utf8");
    const relativePath = path
      .relative(path.resolve(__dirname, "../.."), file)
      .replace(/\\/g, "/");

    // Detect test function aliases: import { test as xxx } or const xxx = ...test
    const aliases = new Set(["test"]);
    const aliasImports = content.matchAll(/import\s*\{[^}]*test\s+as\s+(\w+)/g);
    for (const am of aliasImports) aliases.add(am[1]);
    const constAliases = content.matchAll(
      /const\s+(\w+)\s*=\s*(?:base|test)\b/g,
    );
    for (const cm of constAliases) aliases.add(cm[1]);
    const aliasPattern = [...aliases].join("|");

    // Extract suite-level tags from describe
    const describeRegex = new RegExp(
      `(?:${aliasPattern})\\.describe\\s*\\(\\s*['"\`]([^'"\`]*)['"\`]`,
    );
    const describeMatch = content.match(describeRegex);
    const describeTitle = describeMatch ? describeMatch[1] : "";
    const describeTagRegex = new RegExp(
      `(?:${aliasPattern})\\.describe\\s*\\([^)]*\\{[^}]*tag:\\s*\\[([^\\]]*)\\]`,
    );
    const describeTagOption = content.match(describeTagRegex);
    const suiteTags = [
      ...(describeTagOption
        ? describeTagOption[1].match(/@[\w-]+/g) || []
        : []),
      ...(describeTitle.match(/@[\w-]+/g) || []),
    ];

    // Match test() calls with all aliases — separate regex per quote type
    const quoteTypes = [
      { q: "'", cc: "[^']*" },
      { q: '"', cc: '[^"]*' },
      { q: "`", cc: "[^`]*" },
    ];
    let match;
    const allMatches = [];
    for (const { q, cc } of quoteTypes) {
      const regex = new RegExp(
        `\\b(?:${aliasPattern})\\s*\\(\\s*${q === "`" ? "`" : "\\" + q}(${cc})${q === "`" ? "`" : "\\" + q}`,
        "g",
      );
      while ((match = regex.exec(content)) !== null) {
        allMatches.push({
          index: match.index,
          title: match[1],
          quote: q,
          fullLen: match[0].length,
        });
      }
    }

    const seen = new Set();
    for (const m of allMatches.sort((a, b) => a.index - b.index)) {
      if (seen.has(m.index)) continue;
      seen.add(m.index);

      const title = m.title;

      // Skip template literals with interpolation
      if (m.quote === "`" && title.includes("${")) continue;

      // Skip if this is actually a .describe, .step, .beforeEach, etc.
      const before = content.substring(Math.max(0, m.index - 30), m.index);
      if (
        /\.describe\s*$/.test(before) ||
        /\.step\s*$/.test(before) ||
        /\.beforeEach\s*$/.test(before) ||
        /\.afterEach\s*$/.test(before) ||
        /\.beforeAll\s*$/.test(before) ||
        /\.afterAll\s*$/.test(before)
      )
        continue;

      const titleTags = title.match(/@[\w-]+/g) || [];
      const afterMatch = content.substring(m.index, m.index + 300);
      const inlineTags = afterMatch.match(/tag:\s*\[([^\]]*)\]/);
      const testTags = inlineTags ? inlineTags[1].match(/@[\w-]+/g) || [] : [];
      const allTags = [...new Set([...suiteTags, ...titleTags, ...testTags])];

      const hasSmoke = allTags.includes("@smoke");
      const hasCritical = allTags.includes("@critical");
      const isP0 = hasSmoke && hasCritical;

      localTests.push({
        title,
        file: relativePath,
        tags: allTags,
        priority: isP0 ? "P0" : "P1",
      });
    }
  }
  return localTests;
}

// Extract tests with their test.step() calls, indexed by C-ID
function extractTestsWithSteps(specFiles) {
  const testsByCid = new Map();

  for (const file of specFiles) {
    const content = fs.readFileSync(file, "utf8");

    // Find all test() calls with C-IDs and their positions
    const testPositions = [];
    const testRegex =
      /\btest(?:\.(?:only|skip|fixme))?\s*\(\s*'(C(\d+):[^']*)'/g;
    let m;
    while ((m = testRegex.exec(content)) !== null) {
      testPositions.push({ index: m.index, title: m[1], cid: parseInt(m[2]) });
    }
    // Also check double-quoted titles
    const testRegex2 =
      /\btest(?:\.(?:only|skip|fixme))?\s*\(\s*"(C(\d+):[^"]*)"/g;
    while ((m = testRegex2.exec(content)) !== null) {
      testPositions.push({ index: m.index, title: m[1], cid: parseInt(m[2]) });
    }
    // Check aliases (authTest, uiTest, base, etc.)
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

    // Sort by position
    testPositions.sort((a, b) => a.index - b.index);

    // For each test, find step() calls between this test and the next
    for (let i = 0; i < testPositions.length; i++) {
      const test = testPositions[i];
      const nextTestIndex =
        i + 1 < testPositions.length
          ? testPositions[i + 1].index
          : content.length;
      const testBody = content.substring(test.index, nextTestIndex);

      // Extract step titles: .step('...', or .step("...",
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
          file: path
            .relative(path.resolve(__dirname, "../.."), file)
            .replace(/\\/g, "/"),
        });
      }
    }
  }

  return testsByCid;
}

// Recursively find *.spec.js files
function findSpecFiles(dir) {
  const results = [];

  // If dir is an actual directory, recurse into it
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
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

  // If dir is a file prefix (e.g. "tests/functional/api/objectives-approval-"),
  // find all .spec.js files matching the prefix in parent directory
  const parentDir = path.dirname(dir);
  const prefix = path.basename(dir);
  if (fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory()) {
    const entries = fs.readdirSync(parentDir);
    for (const name of entries) {
      if (name.startsWith(prefix) && name.endsWith(".spec.js")) {
        results.push(path.join(parentDir, name));
      }
    }
  }
  return results;
}

// Delete cases by ID range
async function deleteCases(rangeStr) {
  const match = rangeStr.match(/^(\d+)-(\d+)$/);
  if (!match) {
    console.error("Invalid range format. Use: 3000-3010");
    process.exit(1);
  }

  const start = parseInt(match[1]);
  const end = parseInt(match[2]);

  console.log(`\n=== Deleting cases ${start}-${end} ===`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  let deleted = 0;

  for (let id = start; id <= end; id++) {
    console.log(`  Deleting C${id}...`);

    if (!DRY_RUN) {
      try {
        await client.deleteCase(id);
        deleted++;
        await client.delay(100);
      } catch (e) {
        console.log(`    Error: ${e.message}`);
      }
    } else {
      deleted++;
    }
  }

  console.log(`\nDeleted: ${deleted} cases`);
}

// Sync titles from code to TestRail
async function syncTitles(moduleName) {
  const modules = ALL_MODULES ? config.getModuleNames() : [moduleName];
  let totalUpdated = 0;
  let totalSkipped = 0;
  const results = [];

  for (const name of modules) {
    const mod = config.getModule(name);
    if (!mod) {
      console.warn(`Skipping unknown module: ${name}`);
      continue;
    }

    const dirEntries = Object.entries(config.FILE_PATHS).filter(
      ([, m]) => m === name,
    );

    console.log(`\n=== Sync titles: ${mod.name} (${name}) ===\n`);

    // Scan spec files
    let specFiles = [];
    if (dirEntries.length > 0) {
      for (const [dirPath] of dirEntries) {
        const fullDir = path.resolve(__dirname, "../..", dirPath);
        specFiles.push(...findSpecFiles(fullDir));
      }
    } else {
      console.log("  No file path mapping — skipping");
      continue;
    }

    // Extract tests from code
    const localTests = extractTests(specFiles);
    if (localTests.length === 0) {
      console.log("  No tests found in code");
      continue;
    }

    // Build normalized code title -> clean title map (with C-ID tracking)
    const codeByNorm = new Map();
    const codeByCid = new Map();
    for (const t of localTests) {
      const norm = normalizeTitle(t.title);
      if (!codeByNorm.has(norm)) {
        codeByNorm.set(norm, cleanTitleForExport(t.title));
      }
      // Also index by C-ID if present
      const cidMatch = t.title.match(/^C(\d+):/i);
      if (cidMatch) {
        codeByCid.set(parseInt(cidMatch[1]), cleanTitleForExport(t.title));
      }
    }

    // Get TestRail cases
    let trCases = [];
    if (mod.p0) trCases.push(...(await client.getCases(mod.p0)));
    if (mod.p1) trCases.push(...(await client.getCases(mod.p1)));

    if (trCases.length === 0) {
      console.log("  No TestRail cases found");
      continue;
    }

    let moduleUpdated = 0;
    let moduleSkipped = 0;
    let moduleUnmatched = 0;

    for (const trCase of trCases) {
      // Try matching by C-ID first (most reliable)
      let cleanTitle = codeByCid.get(trCase.id);

      // Fallback: match by normalized title
      if (!cleanTitle) {
        const trNorm = normalizeTitle(trCase.title);
        cleanTitle = codeByNorm.get(trNorm);
      }

      if (!cleanTitle) {
        // No code match — still try to clean prefixes from TR title
        const trCleaned = cleanTitleForExport(trCase.title);
        if (trCleaned !== trCase.title) {
          // TR title has a prefix that should be stripped
          if (DRY_RUN) {
            console.log(`  [DRY-clean] C${trCase.id}:`);
            console.log(`    old: "${trCase.title}"`);
            console.log(`    new: "${trCleaned}"`);
          } else {
            await client.updateCase(trCase.id, { title: trCleaned });
            console.log(
              `  C${trCase.id}: "${trCase.title}" → "${trCleaned}" (prefix only)`,
            );
            await client.delay(150);
          }
          moduleUpdated++;
          continue;
        }
        moduleUnmatched++;
        if (VERBOSE) {
          console.log(`  [skip] C${trCase.id}: no match — "${trCase.title}"`);
        }
        continue;
      }

      // Compare current TR title with desired clean title
      if (trCase.title === cleanTitle) {
        moduleSkipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [DRY] C${trCase.id}:`);
        console.log(`    old: "${trCase.title}"`);
        console.log(`    new: "${cleanTitle}"`);
      } else {
        await client.updateCase(trCase.id, { title: cleanTitle });
        console.log(`  C${trCase.id}: "${trCase.title}" → "${cleanTitle}"`);
        await client.delay(150);
      }
      moduleUpdated++;
    }

    console.log(
      `\n  Updated: ${moduleUpdated}, Skipped (same): ${moduleSkipped}, Unmatched: ${moduleUnmatched}`,
    );
    results.push({
      module: name,
      updated: moduleUpdated,
      skipped: moduleSkipped,
      unmatched: moduleUnmatched,
      total: trCases.length,
    });
    totalUpdated += moduleUpdated;
    totalSkipped += moduleSkipped;
  }

  // Summary
  if (results.length > 1) {
    console.log(`\n\n=== Summary ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);
    console.log("Module              | Total | Updated | Same | Unmatched");
    console.log("-".repeat(65));
    for (const r of results) {
      console.log(
        `${r.module.padEnd(19)} | ${String(r.total).padStart(5)} | ${String(r.updated).padStart(7)} | ${String(r.skipped).padStart(4)} | ${r.unmatched}`,
      );
    }
    console.log("-".repeat(65));
  }

  console.log(
    `\nTotal: ${totalUpdated} titles ${DRY_RUN ? "would be " : ""}updated`,
  );
  if (DRY_RUN) {
    console.log("Dry run — no changes applied. Remove --dry-run to apply.");
  }
}

// Push steps from code to TestRail (for cases without steps, or --force to overwrite)
async function pushSteps(moduleName) {
  const modules = ALL_MODULES ? config.getModuleNames() : [moduleName];
  let totalPushed = 0;
  let totalSkipped = 0;
  const results = [];

  for (const name of modules) {
    const mod = config.getModule(name);
    if (!mod) {
      console.warn(`Skipping unknown module: ${name}`);
      continue;
    }

    const dirEntries = Object.entries(config.FILE_PATHS).filter(
      ([, m]) => m === name,
    );

    console.log(`\n=== Push steps: ${mod.name} (${name}) ===\n`);

    // Scan spec files
    let specFiles = [];
    if (dirEntries.length > 0) {
      for (const [dirPath] of dirEntries) {
        const fullDir = path.resolve(__dirname, "../..", dirPath);
        specFiles.push(...findSpecFiles(fullDir));
      }
    } else {
      console.log("  No file path mapping — skipping");
      continue;
    }

    // Extract tests with steps from code
    const testsByCid = extractTestsWithSteps(specFiles);
    if (testsByCid.size === 0) {
      console.log("  No tests with steps found in code");
      continue;
    }

    console.log(`  Tests with steps in code: ${testsByCid.size}`);

    // Get TestRail cases
    let trCases = [];
    if (mod.p0) trCases.push(...(await client.getCases(mod.p0)));
    if (mod.p1) trCases.push(...(await client.getCases(mod.p1)));

    let modulePushed = 0;
    let moduleSkipped = 0;
    let moduleNoCode = 0;

    for (const trCase of trCases) {
      const codeTest = testsByCid.get(trCase.id);

      if (!codeTest) {
        moduleNoCode++;
        continue;
      }

      // Check if TR case already has steps (skip unless --force)
      const existingSteps = trCase.custom_steps_separated;
      if (!FORCE && existingSteps && existingSteps.length > 0) {
        moduleSkipped++;
        if (VERBOSE) {
          console.log(
            `  [skip] C${trCase.id}: already has ${existingSteps.length} steps`,
          );
        }
        continue;
      }

      // Build steps for TestRail (sanitize locators, generate readable expected)
      const trSteps = codeTest.steps
        .filter((s) => !config.EXCLUDED_STEP_PATTERNS.some((p) => p.test(s)))
        .map((stepTitle) => {
          const cleaned = sanitizeStepContent(stepTitle);
          return {
            content: cleaned || stepTitle,
            expected: generateExpected(cleaned || stepTitle),
            additional_info: "",
            refs: "",
          };
        });

      if (trSteps.length === 0) continue;

      // Template must be "Test Case (Steps)" (id=2) for custom_steps_separated to work
      const needsTemplateChange = trCase.template_id !== 2;

      if (DRY_RUN) {
        console.log(
          `  [DRY] C${trCase.id}: ${trSteps.length} steps${needsTemplateChange ? " (+ template→Steps)" : ""}`,
        );
        if (VERBOSE) {
          for (const s of trSteps) {
            console.log(`    → ${s.content}`);
            console.log(`      ✓ ${s.expected}`);
          }
        }
      } else {
        const updateData = { custom_steps_separated: trSteps };
        if (needsTemplateChange) {
          updateData.template_id = 2; // "Test Case (Steps)"
        }
        await client.updateCase(trCase.id, updateData);
        console.log(
          `  C${trCase.id}: pushed ${trSteps.length} steps${needsTemplateChange ? " (template→Steps)" : ""}`,
        );
        await client.delay(150);
      }
      modulePushed++;
    }

    console.log(
      `\n  Pushed: ${modulePushed}, Skipped (has steps): ${moduleSkipped}, No code: ${moduleNoCode}`,
    );
    results.push({
      module: name,
      pushed: modulePushed,
      skipped: moduleSkipped,
      noCode: moduleNoCode,
      total: trCases.length,
    });
    totalPushed += modulePushed;
    totalSkipped += moduleSkipped;
  }

  // Summary
  if (results.length > 1) {
    console.log(`\n\n=== Summary ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);
    console.log("Module              | Total | Pushed | Has Steps | No Code");
    console.log("-".repeat(65));
    for (const r of results) {
      console.log(
        `${r.module.padEnd(19)} | ${String(r.total).padStart(5)} | ${String(r.pushed).padStart(6)} | ${String(r.skipped).padStart(9)} | ${r.noCode}`,
      );
    }
    console.log("-".repeat(65));
  }

  console.log(
    `\nTotal: ${totalPushed} cases ${DRY_RUN ? "would get" : "got"} steps`,
  );
  if (DRY_RUN) {
    console.log("Dry run — no changes applied. Remove --dry-run to apply.");
  }
}

// Create a TestRail run with validated case IDs
async function createRun(moduleName) {
  const mod = config.getModule(moduleName);
  if (!mod) {
    console.error(`Unknown module: ${moduleName}`);
    console.log("Available:", config.getModuleNames().join(", "));
    process.exit(1);
  }

  console.log(`\n=== Create Run: ${mod.name} (${moduleName}) ===\n`);

  // Step 1: Scan spec files → extract C-IDs
  const dirEntries = Object.entries(config.FILE_PATHS).filter(
    ([, m]) => m === moduleName,
  );
  let specFiles = [];
  for (const [dirPath] of dirEntries) {
    const fullDir = path.resolve(__dirname, "../..", dirPath);
    specFiles.push(...findSpecFiles(fullDir));
  }

  // Filter by --tag if provided
  const tagArg = args.find((a) => a.startsWith("--tag="));
  const tagFilter = tagArg ? tagArg.split("=")[1] : null;

  const codeCids = new Set();
  for (const file of specFiles) {
    const content = fs.readFileSync(file, "utf8");

    // If tag filter, check file has matching tag
    if (tagFilter && !content.includes(tagFilter)) continue;

    const matches = content.matchAll(/C(\d+):/g);
    for (const m of matches) {
      codeCids.add(parseInt(m[1]));
    }
  }

  console.log(`Spec files: ${specFiles.length}`);
  console.log(`C-IDs in code: ${codeCids.size}`);

  if (codeCids.size === 0) {
    console.error("No C-IDs found in spec files. Nothing to create.");
    process.exit(1);
  }

  // Step 2: Fetch existing case IDs from TestRail (module sections)
  let trP0Cases = [],
    trP1Cases = [];
  try {
    if (mod.p0) trP0Cases = await client.getCases(mod.p0);
    if (mod.p1) trP1Cases = await client.getCases(mod.p1);
  } catch (e) {
    console.error(`Failed to fetch TestRail cases: ${e.message}`);
    process.exit(1);
  }

  const trCaseIds = new Set([...trP0Cases, ...trP1Cases].map((c) => c.id));
  console.log(
    `TestRail cases: ${trCaseIds.size} (${trP0Cases.length} P0, ${trP1Cases.length} P1)`,
  );

  // Step 3: Intersect — only valid case IDs
  const validCids = [...codeCids].filter((id) => trCaseIds.has(id));
  const missingCids = [...codeCids].filter((id) => !trCaseIds.has(id));

  console.log(`\nValid (in both): ${validCids.length}`);
  console.log(`Missing from TestRail: ${missingCids.length}`);

  if (missingCids.length > 0 && VERBOSE) {
    console.log(
      `  Missing C-IDs: ${missingCids.map((id) => `C${id}`).join(", ")}`,
    );
  }

  if (validCids.length === 0) {
    console.error("No valid case IDs — cannot create run.");
    process.exit(1);
  }

  // Step 4: Create run
  const typeArg = args.find((a) => a.startsWith("--type="));
  const runType = typeArg ? typeArg.split("=")[1] : "Regression";
  const nameArg = args.find((a) => a.startsWith("--name="));
  const customName = nameArg ? nameArg.split("=")[1] : null;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const displayName = customName || mod.name;
  const runName = `[${runType}] ${displayName} — ${dateStr} (${validCids.length} cases)`;

  const description = [
    `${validCids.length} validated cases from ${specFiles.length} spec files.`,
    missingCids.length > 0
      ? `${missingCids.length} C-IDs skipped (not in TestRail).`
      : "",
    tagFilter ? `Tag filter: ${tagFilter}` : "",
    "Created by cli.cjs create-run.",
  ]
    .filter(Boolean)
    .join(" ");

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would create: "${runName}"`);
    console.log(`  Cases: ${validCids.length}`);
    console.log(`  Description: ${description}`);
    return;
  }

  try {
    const run = await client.addRun(parseInt(client.PROJECT_ID, 10), {
      suite_id: parseInt(client.SUITE_ID, 10),
      name: runName,
      description,
      include_all: false,
      case_ids: validCids,
    });

    // Write run ID to file
    const runIdFile = path.resolve(__dirname, "../../.testrail-run-id");
    fs.writeFileSync(runIdFile, String(run.id), "utf8");

    console.log(`\nRun created!`);
    console.log(`  ID:    ${run.id}`);
    console.log(`  Name:  ${runName}`);
    console.log(`  Cases: ${validCids.length}`);
    console.log(`  URL:   ${run.url}`);
    console.log(`  Saved to .testrail-run-id`);

    if (missingCids.length > 0) {
      console.log(
        `\n  Warning: ${missingCids.length} C-IDs not in TestRail (use 'push-new' to add them)`,
      );
    }
  } catch (e) {
    console.error(`\nFailed to create run: ${e.message}`);
    process.exit(1);
  }
}

// Coverage report — shows per-module coverage and step quality
async function coverageReport(moduleName) {
  const modules = ALL_MODULES ? config.getModuleNames() : [moduleName];
  const rows = [];
  let totalInCode = 0,
    totalInTR = 0,
    totalWithSteps = 0,
    totalNoSteps = 0;

  for (const name of modules) {
    const mod = config.getModule(name);
    if (!mod) {
      console.warn(`Skipping unknown module: ${name}`);
      continue;
    }

    const dirEntries = Object.entries(config.FILE_PATHS).filter(
      ([, m]) => m === name,
    );

    // Count tests in code
    let specFiles = [];
    if (dirEntries.length > 0) {
      for (const [dirPath] of dirEntries) {
        const fullDir = path.resolve(__dirname, "../..", dirPath);
        specFiles.push(...findSpecFiles(fullDir));
      }
    }
    const localTests = extractTests(specFiles);
    const inCode = localTests.length;

    // Count cases in TestRail + step coverage
    let trCases = [];
    try {
      if (mod.p0) trCases.push(...(await client.getCases(mod.p0)));
      if (mod.p1) trCases.push(...(await client.getCases(mod.p1)));
    } catch (e) {
      if (VERBOSE)
        console.warn(`  Could not fetch TR cases for ${name}: ${e.message}`);
    }

    const inTR = trCases.length;
    const withSteps = trCases.filter(
      (c) => c.custom_steps_separated && c.custom_steps_separated.length > 0,
    ).length;
    const noSteps = inTR - withSteps;

    const coverage = inCode > 0 ? ((inTR / inCode) * 100).toFixed(0) : "-";
    const stepCov = inTR > 0 ? ((withSteps / inTR) * 100).toFixed(0) : "-";

    rows.push({
      name,
      displayName: mod.name,
      inCode,
      inTR,
      withSteps,
      noSteps,
      coverage,
      stepCov,
    });
    totalInCode += inCode;
    totalInTR += inTR;
    totalWithSteps += withSteps;
    totalNoSteps += noSteps;
  }

  // Print table
  console.log("\n=== Coverage Report ===\n");
  console.log(
    "Module".padEnd(22) +
      "| " +
      "In Code".padStart(7) +
      " | " +
      "In TR".padStart(5) +
      " | " +
      "Steps".padStart(5) +
      " | " +
      "No Steps".padStart(8) +
      " | " +
      "TR Cov".padStart(6) +
      " | " +
      "Step Cov".padStart(8),
  );
  console.log("-".repeat(78));

  for (const r of rows) {
    const label = (r.name + " (" + r.displayName + ")").substring(0, 21);
    console.log(
      label.padEnd(22) +
        "| " +
        String(r.inCode).padStart(7) +
        " | " +
        String(r.inTR).padStart(5) +
        " | " +
        String(r.withSteps).padStart(5) +
        " | " +
        String(r.noSteps).padStart(8) +
        " | " +
        (r.coverage + "%").padStart(6) +
        " | " +
        (r.stepCov + "%").padStart(8),
    );
  }

  console.log("-".repeat(78));
  const totalCov =
    totalInCode > 0 ? ((totalInTR / totalInCode) * 100).toFixed(0) : "-";
  const totalStepCov =
    totalInTR > 0 ? ((totalWithSteps / totalInTR) * 100).toFixed(0) : "-";
  console.log(
    "TOTAL".padEnd(22) +
      "| " +
      String(totalInCode).padStart(7) +
      " | " +
      String(totalInTR).padStart(5) +
      " | " +
      String(totalWithSteps).padStart(5) +
      " | " +
      String(totalNoSteps).padStart(8) +
      " | " +
      (totalCov + "%").padStart(6) +
      " | " +
      (totalStepCov + "%").padStart(8),
  );
  console.log();

  // Highlight gaps
  const gaps = rows.filter(
    (r) => r.inCode > 0 && (r.coverage === "0" || parseInt(r.coverage) < 50),
  );
  if (gaps.length > 0) {
    console.log("Modules with low TR coverage (<50%):");
    for (const g of gaps) {
      console.log(
        `  - ${g.name}: ${g.inCode} in code, ${g.inTR} in TR (${g.coverage}%)`,
      );
    }
    console.log();
  }

  const stepGaps = rows.filter((r) => r.inTR > 0 && parseInt(r.stepCov) < 50);
  if (stepGaps.length > 0) {
    console.log("Modules with low step coverage (<50%):");
    for (const g of stepGaps) {
      console.log(
        `  - ${g.name}: ${g.noSteps} cases without steps (${g.stepCov}% with steps)`,
      );
    }
    console.log();
  }
}

// Main
async function main() {
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  try {
    switch (command) {
      case "list-modules":
        await listModules();
        break;

      case "list-sections":
        await listSections();
        break;

      case "list-cases":
        const listMod = getArg(1);
        if (!listMod) {
          console.error("Module name required");
          process.exit(1);
        }
        await listCases(listMod);
        break;

      case "update-priorities":
        const prioMod = getArg(1);
        if (!prioMod && !ALL_MODULES) {
          console.error("Module name required (or use --all)");
          process.exit(1);
        }
        await updatePriorities(prioMod);
        break;

      case "sync-steps":
        const syncMod = getArg(1);
        if (!syncMod && !ALL_MODULES) {
          console.error("Module name required (or use --all)");
          process.exit(1);
        }
        await syncSteps(syncMod);
        break;

      case "move-to-p0":
        const moveMod = getArg(1);
        if (!moveMod && !ALL_MODULES) {
          console.error("Module name required (or use --all)");
          process.exit(1);
        }
        await moveToP0(moveMod);
        break;

      case "export":
        const expMod = getArg(1);
        if (!expMod) {
          console.error("Module name required");
          process.exit(1);
        }
        await exportCases(expMod);
        break;

      case "delete-cases":
        const range = getArg(1);
        if (!range) {
          console.error("ID range required (e.g., 3000-3010)");
          process.exit(1);
        }
        await deleteCases(range);
        break;

      case "analyze":
        const analyzeMod = getArg(1);
        if (!analyzeMod && !ALL_MODULES) {
          console.error("Module name required (or use --all)");
          process.exit(1);
        }
        await analyze(analyzeMod);
        break;

      case "push-new":
        const pushMod = getArg(1);
        if (!pushMod && !ALL_MODULES) {
          console.error("Module name required (or use --all)");
          process.exit(1);
        }
        await pushNew(pushMod);
        break;

      case "sync-titles":
        const syncTitlesMod = getArg(1);
        if (!syncTitlesMod && !ALL_MODULES) {
          console.error("Module name required (or use --all)");
          process.exit(1);
        }
        await syncTitles(syncTitlesMod);
        break;

      case "push-steps":
        const pushStepsMod = getArg(1);
        if (!pushStepsMod && !ALL_MODULES) {
          console.error("Module name required (or use --all)");
          process.exit(1);
        }
        await pushSteps(pushStepsMod);
        break;

      case "coverage-report": {
        const covMod = getArg(1);
        if (!covMod && !ALL_MODULES) {
          console.error("Module name required (or use --all)");
          process.exit(1);
        }
        await coverageReport(covMod);
        break;
      }

      case "create-run": {
        const createRunMod = getArg(1);
        if (!createRunMod) {
          console.error(
            "Module name required. Example: node scripts/testrail/cli.cjs create-run performance-review",
          );
          process.exit(1);
        }
        await createRun(createRunMod);
        break;
      }

      case "sync": {
        const syncFullMod = getArg(1);
        if (!syncFullMod && !ALL_MODULES) {
          console.error("Module name required (or use --all)");
          process.exit(1);
        }

        console.log("\n========== FULL SYNC ==========\n");

        // Step 1: Push new tests to TestRail
        console.log("--- Step 1/4: push-new ---");
        await pushNew(syncFullMod);

        // Step 2: Inject C-IDs from TestRail into code
        console.log("\n--- Step 2/4: inject-cids ---");
        const { execSync } = require("child_process");
        const injectArgs = ALL_MODULES ? "--all" : syncFullMod;
        const injectFlags = DRY_RUN ? " --dry-run" : "";
        const verboseFlag = VERBOSE ? " --verbose" : "";
        try {
          execSync(
            `node scripts/testrail/inject-cids.cjs ${injectArgs}${injectFlags}${verboseFlag}`,
            {
              stdio: "inherit",
              cwd: path.resolve(__dirname, "../.."),
            },
          );
        } catch (e) {
          console.log("  inject-cids finished with warnings");
        }

        // Step 3: Sync titles from code to TestRail
        console.log("\n--- Step 3/4: sync-titles ---");
        await syncTitles(syncFullMod);

        // Step 4: Push steps from code to TestRail
        console.log("\n--- Step 4/4: push-steps ---");
        await pushSteps(syncFullMod);

        console.log("\n========== SYNC COMPLETE ==========");
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error("\nError:", error.message);
    if (VERBOSE) console.error(error.stack);
    process.exit(1);
  }
}

main();
