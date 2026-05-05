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

const files = walk("tests/functional/api");
let totalTests = 0;
let testsWithCid = 0;

for (const f of files) {
  const content = readFileSync(f, "utf8");
  const allTests = content.match(/^\s*test\(/gm) || [];
  const cidTests = content.match(/test\s*\(\s*['"]C\d+:/g) || [];
  totalTests += allTests.length;
  testsWithCid += cidTests.length;
  const diff = allTests.length - cidTests.length;
  if (diff > 0) {
    console.log(
      f.replace(/\\/g, "/") +
        ": " +
        allTests.length +
        " total, " +
        cidTests.length +
        " C-ID, " +
        diff +
        " WITHOUT",
    );
  }
}

console.log("");
console.log("Total tests: " + totalTests);
console.log("With C-ID: " + testsWithCid);
console.log("Without C-ID: " + (totalTests - testsWithCid));
