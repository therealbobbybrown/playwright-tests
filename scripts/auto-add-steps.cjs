/**
 * auto-add-steps.cjs
 *
 * Автоматически добавляет test.step() в spec-файлы без шагов.
 * Оборачивает тело каждого теста (без setSeverity/markAs) в один или два шага.
 *
 * Использование:
 *   node scripts/auto-add-steps.cjs [--dry-run] [file|dir]
 */

const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");
const target = process.argv.filter((a) => !a.startsWith("--")).slice(2)[0];

if (!target) {
  console.log("Usage: node scripts/auto-add-steps.cjs [--dry-run] <file|dir>");
  process.exit(1);
}

function collectFiles(p) {
  const stat = fs.statSync(p);
  if (stat.isFile() && p.endsWith(".spec.js")) return [p];
  if (!stat.isDirectory()) return [];
  const results = [];
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    if (entry.name.startsWith("_")) continue;
    results.push(...collectFiles(path.join(p, entry.name)));
  }
  return results;
}

const files = collectFiles(target);
console.log(`Found ${files.length} spec files`);

let totalFiles = 0;
let totalTests = 0;
let skippedFiles = 0;
let errorFiles = [];

for (const filePath of files) {
  const content = fs.readFileSync(filePath, "utf8");

  const testCount = (content.match(/^\s*test\(/gm) || []).length;
  if (testCount === 0) {
    skippedFiles++;
    continue;
  }

  try {
    const result = addStepsToFile(content, filePath);
    if (result.changed) {
      totalFiles++;
      totalTests += result.testsModified;
      if (!DRY_RUN) {
        fs.writeFileSync(filePath, result.content, "utf8");
      }
      const rel = path.relative(process.cwd(), filePath);
      console.log(
        `${DRY_RUN ? "[DRY] " : ""}${rel}: ${result.testsModified}/${testCount} tests wrapped`,
      );
      if (result.testsModified < testCount) {
        console.log(
          `  WARNING: ${testCount - result.testsModified} tests NOT wrapped`,
        );
      }
    }
  } catch (e) {
    errorFiles.push({ file: filePath, error: e.message });
    console.error(`ERROR in ${filePath}: ${e.message}`);
  }
}

console.log(
  `\n${DRY_RUN ? "[DRY RUN] " : ""}Done: ${totalFiles} files, ${totalTests} tests modified, ${skippedFiles} skipped`,
);
if (errorFiles.length > 0) {
  console.log(`Errors: ${errorFiles.length} files`);
}

function addStepsToFile(content, filePath) {
  const lines = content.split("\n");
  let testsModified = 0;
  let changed = false;

  // Find all test( starts (not test.step, test.describe, test.beforeEach, etc.)
  const testStarts = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (
      (trimmed.startsWith("test(") ||
        trimmed.startsWith('test("') ||
        trimmed.startsWith("test('")) &&
      !trimmed.startsWith("test.") &&
      !trimmed.startsWith("testInfo")
    ) {
      testStarts.push(i);
    }
  }

  if (testStarts.length === 0)
    return { content, changed: false, testsModified: 0 };

  // Process in reverse order to preserve line numbers
  for (let ti = testStarts.length - 1; ti >= 0; ti--) {
    const testStartLine = testStarts[ti];

    // Find the `=> {` pattern - the arrow function body start
    // Search up to 8 lines ahead from test start
    let arrowBracePos = -1; // line index
    let arrowBraceCol = -1; // column of `{` after `=>`

    for (
      let i = testStartLine;
      i < Math.min(testStartLine + 8, lines.length);
      i++
    ) {
      const line = lines[i];
      // Find `=> {` — the `{` that starts the test body
      const arrowIdx = line.indexOf("=> {");
      if (arrowIdx >= 0) {
        arrowBracePos = i;
        arrowBraceCol = arrowIdx + 3; // position of `{`
        break;
      }
      // Also handle `=>{` without space
      const arrowIdx2 = line.indexOf("=>{");
      if (arrowIdx2 >= 0) {
        arrowBracePos = i;
        arrowBraceCol = arrowIdx2 + 2;
        break;
      }
    }

    if (arrowBracePos < 0) continue;

    // Now find the matching closing `}` using bracket counting
    // Start from the `{` we found (skip everything before it on that line)
    let depth = 0;
    let bodyStartLine = arrowBracePos;
    let bodyEndLine = -1;

    for (let i = arrowBracePos; i < lines.length; i++) {
      const line = lines[i];
      const startCol = i === arrowBracePos ? arrowBraceCol : 0;

      for (let j = startCol; j < line.length; j++) {
        const ch = line[j];

        // Skip template literals (simplified — count backticks)
        if (ch === "`") {
          j++;
          while (j < line.length && line[j] !== "`") {
            if (line[j] === "\\") j++;
            j++;
          }
          continue;
        }
        // Skip strings
        if (ch === '"' || ch === "'") {
          const quote = ch;
          j++;
          while (j < line.length) {
            if (line[j] === "\\") {
              j++;
            } else if (line[j] === quote) break;
            j++;
          }
          continue;
        }
        // Skip line comments
        if (ch === "/" && j + 1 < line.length && line[j + 1] === "/") break;
        // Skip block comments
        if (ch === "/" && j + 1 < line.length && line[j + 1] === "*") {
          j += 2;
          while (
            j < line.length &&
            !(line[j] === "*" && j + 1 < line.length && line[j + 1] === "/")
          )
            j++;
          if (j < line.length) j++; // skip past */
          continue;
        }

        if (ch === "{") {
          depth++;
        } else if (ch === "}") {
          depth--;
          if (depth === 0) {
            bodyEndLine = i;
            break;
          }
        }
      }
      if (bodyEndLine >= 0) break;
    }

    if (bodyEndLine < 0) continue;

    // Extract body lines (between the opening { line and closing } line)
    const bodyLines = lines.slice(bodyStartLine + 1, bodyEndLine);

    if (bodyLines.length === 0) continue;

    // Determine indentation from body
    const bodyIndent = getIndent(bodyLines);

    // Separate meta lines (setSeverity, markAs) from code
    const metaLines = [];
    const codeLines = [];
    let inMeta = true;

    for (const line of bodyLines) {
      const trimmed = line.trim();
      if (
        inMeta &&
        (trimmed === "" ||
          trimmed.startsWith("setSeverity") ||
          trimmed.startsWith("markAs") ||
          trimmed.startsWith("logExpected"))
      ) {
        metaLines.push(line);
      } else {
        inMeta = false;
        codeLines.push(line);
      }
    }

    // Skip if no actual code
    if (codeLines.length === 0 || codeLines.every((l) => l.trim() === ""))
      continue;

    // Skip if this test body already has test.step()
    if (bodyLines.some((l) => l.includes("test.step("))) continue;

    // Extract test title for step name
    let testTitle = "";
    for (
      let i = testStartLine;
      i <= Math.min(arrowBracePos, testStartLine + 5);
      i++
    ) {
      testTitle += " " + lines[i];
    }
    const titleMatch = testTitle.match(/["'`](?:C\d+:\s*)?(.+?)["'`]/);
    const cleanTitle = titleMatch ? titleMatch[1].trim() : "API запрос";

    // Escape quotes in step name
    const stepName = escapeForString(cleanTitle);

    // Determine: 1 or 2 steps
    const nonEmptyCode = codeLines.filter((l) => l.trim() !== "");
    const shouldSplit = nonEmptyCode.length > 15;

    // Build new body
    const newBodyLines = [...metaLines];

    if (!shouldSplit) {
      // Single step
      newBodyLines.push("");
      newBodyLines.push(
        `${bodyIndent}await test.step("Выполнить: ${stepName}", async () => {`,
      );
      for (const line of codeLines) {
        if (line.trim() === "") {
          newBodyLines.push(line);
        } else {
          newBodyLines.push("  " + line);
        }
      }
      newBodyLines.push(`${bodyIndent}});`);
    } else {
      // Two steps: split at first top-level expect
      const splitIdx = findExpectSplitPoint(codeLines);

      if (splitIdx > 0) {
        const prepLines = codeLines.slice(0, splitIdx);
        const checkLines = codeLines.slice(splitIdx);

        newBodyLines.push("");
        newBodyLines.push(
          `${bodyIndent}await test.step("Выполнить запрос: ${stepName}", async () => {`,
        );
        for (const line of prepLines) {
          if (line.trim() === "") newBodyLines.push(line);
          else newBodyLines.push("  " + line);
        }
        newBodyLines.push(`${bodyIndent}});`);

        newBodyLines.push("");
        newBodyLines.push(
          `${bodyIndent}await test.step("Проверить ответ", async () => {`,
        );
        for (const line of checkLines) {
          if (line.trim() === "") newBodyLines.push(line);
          else newBodyLines.push("  " + line);
        }
        newBodyLines.push(`${bodyIndent}});`);
      } else {
        // Can't split - use single step
        newBodyLines.push("");
        newBodyLines.push(
          `${bodyIndent}await test.step("Выполнить: ${stepName}", async () => {`,
        );
        for (const line of codeLines) {
          if (line.trim() === "") newBodyLines.push(line);
          else newBodyLines.push("  " + line);
        }
        newBodyLines.push(`${bodyIndent}});`);
      }
    }

    // Replace body
    lines.splice(
      bodyStartLine + 1,
      bodyEndLine - bodyStartLine - 1,
      ...newBodyLines,
    );
    testsModified++;
    changed = true;
  }

  return { content: lines.join("\n"), changed, testsModified };
}

function getIndent(lines) {
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("//")) continue;
    const match = line.match(/^(\s+)/);
    return match ? match[1] : "        ";
  }
  return "        ";
}

function escapeForString(str) {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function findExpectSplitPoint(codeLines) {
  // Find first top-level expect() that isn't inside a block
  let depth = 0;
  for (let i = 0; i < codeLines.length; i++) {
    const line = codeLines[i];
    // Track block depth
    for (const ch of line) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }
    const trimmed = line.trim();
    if (
      depth === 0 &&
      (trimmed.startsWith("expect(") || trimmed.startsWith("expect.soft("))
    ) {
      return i;
    }
  }
  return -1;
}
