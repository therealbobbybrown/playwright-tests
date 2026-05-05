const { readdirSync, readFileSync } = require("fs");
const { join } = require("path");

function walk(dir) {
  let results = [];
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (f.name.startsWith("_")) continue;
    const full = join(dir, f.name);
    if (f.isDirectory()) results.push(...walk(full));
    else if (f.name.endsWith(".spec.js")) results.push(full);
  }
  return results;
}

const files = walk("tests/functional");
const noStep = [];
for (const f of files) {
  const content = readFileSync(f, "utf8");
  if (content.indexOf("test.step(") === -1) {
    const testCount = (content.match(/^\s*test\(/gm) || []).length;
    noStep.push({ file: f.replace(/\\/g, "/"), tests: testCount });
  }
}

// Group by module
const groups = {};
for (const { file, tests } of noStep) {
  const parts = file.split("/");
  const module = parts[2]; // tests/functional/<module>
  if (!groups[module]) groups[module] = [];
  groups[module].push({ file: file.replace("tests/functional/", ""), tests });
}

let totalFiles = 0,
  totalTests = 0;
const sorted = Object.entries(groups).sort((a, b) => {
  const sa = a[1].reduce((s, x) => s + x.tests, 0);
  const sb = b[1].reduce((s, x) => s + x.tests, 0);
  return sb - sa;
});

for (const [mod, items] of sorted) {
  const modTests = items.reduce((s, x) => s + x.tests, 0);
  console.log(`=== ${mod} (${items.length} files, ${modTests} tests) ===`);
  for (const { file, tests } of items.sort((a, b) => b.tests - a.tests)) {
    console.log(`  ${tests}  ${file}`);
  }
  totalFiles += items.length;
  totalTests += modTests;
}
console.log(
  `\nTOTAL: ${totalFiles} files, ${totalTests} tests without test.step()`,
);
