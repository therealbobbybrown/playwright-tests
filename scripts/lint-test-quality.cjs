#!/usr/bin/env node
/**
 * Lint test quality — detects common anti-patterns in spec files
 *
 * Rules:
 *   Q01 [CRITICAL]  waitForTimeout() in spec files (use explicit waits)
 *   Q02 [CRITICAL]  isVisible({...}) with parameter (timeout is deprecated/ignored)
 *   Q03 [CRITICAL]  isHidden({...}) with parameter (timeout is deprecated/ignored)
 *   Q04 [IMPORTANT] page.locator() in spec files (use page objects)
 *   Q05 [CRITICAL]  Hardcoded numeric ID as fallback (|| '12345')
 *   Q06 [CRITICAL]  Hardcoded numeric ID as literal (const someId = 12345)
 *   Q07 [MINOR]     .length).toBeGreaterThan(0) (use specific count)
 *   Q08 [IMPORTANT] Top-level let with Id/Data/State (shared mutable state)
 *   Q09 [IMPORTANT] File > 500 lines (consider splitting)
 *   Q10 [CRITICAL]  File > 1000 lines (must split)
 *
 * Usage:
 *   node scripts/lint-test-quality.cjs                     # Staged files, fallback to modified
 *   node scripts/lint-test-quality.cjs --all               # All spec files in tests/functional/
 *   node scripts/lint-test-quality.cjs --staged             # Only staged .spec.js files
 *   node scripts/lint-test-quality.cjs --module <name>      # Specific module directory
 *   node scripts/lint-test-quality.cjs --json               # Output as JSON
 *   node scripts/lint-test-quality.cjs --critical-only      # Show only CRITICAL violations
 *
 * Exit codes:
 *   0 = no violations or only MINOR
 *   1 = has CRITICAL violations
 *   2 = has IMPORTANT violations (no CRITICAL)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── CLI args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const STAGED = args.includes("--staged");
const ALL = args.includes("--all");
const JSON_OUTPUT = args.includes("--json");
const CRITICAL_ONLY = args.includes("--critical-only");

const moduleIdx = args.indexOf("--module");
const MODULE = moduleIdx !== -1 ? args[moduleIdx + 1] : null;

const fileArgs = args.filter(
  (a) =>
    !a.startsWith("--") &&
    (moduleIdx === -1 || args.indexOf(a) !== moduleIdx + 1),
);

// ── Severity levels ─────────────────────────────────────────────────────────────

const SEVERITY = {
  CRITICAL: "CRITICAL",
  IMPORTANT: "IMPORTANT",
  MINOR: "MINOR",
};

// ── Rules definition ────────────────────────────────────────────────────────────

const RULES = [
  {
    id: "Q01",
    name: "waitForTimeout() in spec",
    severity: SEVERITY.CRITICAL,
    regex: /\.waitForTimeout\(/,
    description:
      "Use explicit waits (waitFor, expect with timeout) instead of waitForTimeout()",
    isApplicable: (filePath) => {
      const normalized = filePath.replace(/\\/g, "/");
      // Exclude page objects
      if (/\/pages\//.test(normalized) || /\\pages\\/.test(filePath))
        return false;
      return normalized.endsWith(".spec.js");
    },
  },
  {
    id: "Q02",
    name: "isVisible({...}) with parameter",
    severity: SEVERITY.CRITICAL,
    regex: /\.isVisible\(\s*\{/,
    description:
      "timeout in isVisible() is deprecated and ignored — use waitFor() instead",
    isApplicable: () => true,
  },
  {
    id: "Q03",
    name: "isHidden({...}) with parameter",
    severity: SEVERITY.CRITICAL,
    regex: /\.isHidden\(\s*\{/,
    description:
      "timeout in isHidden() is deprecated and ignored — use waitFor() instead",
    isApplicable: () => true,
  },
  {
    id: "Q04",
    name: "page.locator() in spec (use page objects)",
    severity: SEVERITY.IMPORTANT,
    regex: /page\.locator\(/,
    description:
      "Move locators to page objects instead of using page.locator() directly in specs",
    isApplicable: (filePath) => {
      const normalized = filePath.replace(/\\/g, "/");
      // Only in spec files, exclude API tests
      if (!normalized.endsWith(".spec.js")) return false;
      if (/\/api\//.test(normalized) || /\\api\\/.test(filePath)) return false;
      return true;
    },
  },
  {
    id: "Q05",
    name: "Hardcoded numeric ID as fallback",
    severity: SEVERITY.CRITICAL,
    regex: /\|\|\s*['"]\d{4,}/,
    description:
      "Do not use hardcoded ID fallbacks (|| '12345') — IDs must come from seeds/API",
    isApplicable: (filePath) => {
      const normalized = filePath.replace(/\\/g, "/");
      if (/\/constants\.js$/.test(normalized)) return false;
      if (/\.config\./.test(normalized)) return false;
      if (/\/scripts\/.*\.cjs$/.test(normalized)) return false;
      return true;
    },
  },
  {
    id: "Q06",
    name: "Hardcoded numeric ID as literal",
    severity: SEVERITY.CRITICAL,
    regex: /const\s+\w*[Ii]d\s*=\s*\d{4,}/,
    description:
      "Do not hardcode IDs as constants — IDs must come from seeds/API",
    isApplicable: (filePath) => {
      const normalized = filePath.replace(/\\/g, "/");
      if (/\/constants\.js$/.test(normalized)) return false;
      if (/\.config\./.test(normalized)) return false;
      if (/\/scripts\/.*\.cjs$/.test(normalized)) return false;
      return true;
    },
  },
  {
    id: "Q07",
    name: ".length).toBeGreaterThan(0) — weak assertion",
    severity: SEVERITY.MINOR,
    regex: /\.length\)\.toBeGreaterThan\(0\)/,
    description: "Use a specific expected count instead of .toBeGreaterThan(0)",
    isApplicable: () => true,
  },
  {
    id: "Q08",
    name: "Top-level let with Id/Data/State (shared mutable state)",
    severity: SEVERITY.IMPORTANT,
    regex: /^let\s+\w*(?:Id|Data|State)\b/,
    description:
      "Avoid shared mutable state at file top level — use fixtures or beforeEach",
    isApplicable: () => true,
    lineCheck: true, // requires special line-by-line handling with brace depth
  },
  {
    id: "Q09",
    name: "File > 500 lines (consider splitting)",
    severity: SEVERITY.IMPORTANT,
    fileLevel: true,
    threshold: 500,
    upperThreshold: 1000,
    isApplicable: () => true,
  },
  {
    id: "Q10",
    name: "File > 1000 lines (must split)",
    severity: SEVERITY.CRITICAL,
    fileLevel: true,
    threshold: 1000,
    isApplicable: () => true,
  },
];

// ── File discovery ──────────────────────────────────────────────────────────────

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

function getFiles() {
  if (fileArgs.length > 0) {
    return fileArgs
      .filter((f) => fs.existsSync(f))
      .map((f) => f.replace(/\\/g, "/"));
  }

  if (MODULE) {
    const modulePath = path.join("tests/functional", MODULE);
    if (!fs.existsSync(modulePath)) {
      console.error(`Module directory not found: ${modulePath}`);
      process.exit(1);
    }
    return findSpecFiles(modulePath);
  }

  if (ALL) {
    return findSpecFiles("tests/functional");
  }

  if (STAGED) {
    try {
      const output = execSync(
        "git diff --cached --name-only --diff-filter=ACM",
        { encoding: "utf8" },
      );
      return output
        .split("\n")
        .filter((f) => f.trim().endsWith(".spec.js"))
        .map((f) => f.trim());
    } catch {
      return [];
    }
  }

  // Default: staged files, fallback to modified
  try {
    const output = execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf8",
    });
    const staged = output
      .split("\n")
      .filter((f) => f.trim().endsWith(".spec.js"))
      .map((f) => f.trim());
    if (staged.length > 0) return staged;
  } catch {
    /* ignore */
  }

  try {
    const output = execSync("git diff --name-only --diff-filter=ACM", {
      encoding: "utf8",
    });
    return output
      .split("\n")
      .filter((f) => f.trim().endsWith(".spec.js"))
      .map((f) => f.trim());
  } catch {
    return [];
  }
}

// ── Lint engine ─────────────────────────────────────────────────────────────────

/**
 * Lint a single file against all applicable rules.
 * @param {string} filePath - Path to the spec file
 * @returns {Array<{ruleId: string, ruleName: string, severity: string, file: string, line: number|null, message: string}>}
 */
function lintFile(filePath) {
  const violations = [];

  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    // Cannot read file — skip silently
    return [];
  }

  const lines = content.split("\n");
  const lineCount = lines.length;

  for (const rule of RULES) {
    if (!rule.isApplicable(filePath)) continue;
    if (CRITICAL_ONLY && rule.severity !== SEVERITY.CRITICAL) continue;

    try {
      // File-level rules (line count)
      if (rule.fileLevel) {
        // Q09 triggers only for 500..999 lines, Q10 for 1000+
        if (
          rule.id === "Q09" &&
          lineCount > rule.threshold &&
          lineCount <= rule.upperThreshold
        ) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            file: filePath,
            line: null,
            message: `${rule.name} (${lineCount} lines)`,
          });
        } else if (rule.id === "Q10" && lineCount > rule.threshold) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            file: filePath,
            line: null,
            message: `${rule.name} (${lineCount} lines)`,
          });
        }
        continue;
      }

      // Q08: Top-level let — needs brace depth tracking
      // "Top level" = braceDepth 0 before the line (outside describe/test blocks)
      if (rule.lineCheck) {
        let braceDepth = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const depthBeforeLine = braceDepth;

          // Update brace depth
          for (const ch of line) {
            if (ch === "{") braceDepth++;
            if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
          }

          // Only check at top level (depth 0 before this line)
          if (depthBeforeLine === 0 && rule.regex.test(line)) {
            violations.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              file: filePath,
              line: i + 1,
              message: `${rule.name}: ${line.trim()}`,
            });
          }
        }
        continue;
      }

      // Regex-based line rules
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip comment lines
        const trimmed = line.trim();
        if (
          trimmed.startsWith("//") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("/*")
        )
          continue;

        if (rule.regex.test(line)) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            file: filePath,
            line: i + 1,
            message: rule.name,
          });
        }
      }
    } catch (err) {
      // Rule processing error — skip this rule for this file
    }
  }

  return violations;
}

// ── Main ────────────────────────────────────────────────────────────────────────

const files = getFiles();

if (files.length === 0) {
  if (JSON_OUTPUT) {
    console.log(
      JSON.stringify({
        files: 0,
        violations: [],
        summary: { CRITICAL: 0, IMPORTANT: 0, MINOR: 0, total: 0 },
      }),
    );
  } else {
    console.log("No spec files to lint.");
  }
  process.exit(0);
}

const allViolations = [];

for (const file of files) {
  try {
    const violations = lintFile(file);
    allViolations.push(...violations);
  } catch (err) {
    // Skip files that cause errors
  }
}

// ── JSON output ─────────────────────────────────────────────────────────────────

if (JSON_OUTPUT) {
  const summary = {
    CRITICAL: allViolations.filter((v) => v.severity === SEVERITY.CRITICAL)
      .length,
    IMPORTANT: allViolations.filter((v) => v.severity === SEVERITY.IMPORTANT)
      .length,
    MINOR: allViolations.filter((v) => v.severity === SEVERITY.MINOR).length,
    total: allViolations.length,
  };
  const filesWithViolations = new Set(allViolations.map((v) => v.file)).size;
  console.log(
    JSON.stringify(
      {
        files: files.length,
        filesWithViolations,
        violations: allViolations,
        summary,
      },
      null,
      2,
    ),
  );

  if (summary.CRITICAL > 0) process.exit(1);
  if (summary.IMPORTANT > 0) process.exit(2);
  process.exit(0);
}

// ── Text output ─────────────────────────────────────────────────────────────────

if (allViolations.length === 0) {
  console.log(`${files.length} file(s) OK — no quality violations found.`);
  process.exit(0);
}

// Group violations by rule
const byRule = {};
for (const v of allViolations) {
  const key = `${v.ruleId}|${v.severity}|${v.ruleName}`;
  if (!byRule[key]) byRule[key] = [];
  byRule[key].push(v);
}

// Sort by severity order: CRITICAL > IMPORTANT > MINOR
const severityOrder = { CRITICAL: 0, IMPORTANT: 1, MINOR: 2 };
const sortedKeys = Object.keys(byRule).sort((a, b) => {
  const sevA = a.split("|")[1];
  const sevB = b.split("|")[1];
  if (severityOrder[sevA] !== severityOrder[sevB])
    return severityOrder[sevA] - severityOrder[sevB];
  return a.localeCompare(b);
});

for (const key of sortedKeys) {
  const [ruleId, severity, ruleName] = key.split("|");
  const violations = byRule[key];

  console.log(`\n[${severity}] ${ruleId} ${ruleName}`);
  for (const v of violations) {
    const relPath = path.relative(".", v.file).replace(/\\/g, "/");
    if (v.line !== null) {
      console.log(`  ${relPath}:${v.line}`);
    } else {
      console.log(`  ${relPath}`);
    }
  }
}

// Summary
const counts = {
  CRITICAL: allViolations.filter((v) => v.severity === SEVERITY.CRITICAL)
    .length,
  IMPORTANT: allViolations.filter((v) => v.severity === SEVERITY.IMPORTANT)
    .length,
  MINOR: allViolations.filter((v) => v.severity === SEVERITY.MINOR).length,
};
const filesWithViolations = new Set(allViolations.map((v) => v.file)).size;

console.log(
  `\nSummary: ${counts.CRITICAL} CRITICAL, ${counts.IMPORTANT} IMPORTANT, ${counts.MINOR} MINOR (${filesWithViolations} files, ${allViolations.length} violations)`,
);

// Exit code
if (counts.CRITICAL > 0) process.exit(1);
if (counts.IMPORTANT > 0) process.exit(2);
process.exit(0);
