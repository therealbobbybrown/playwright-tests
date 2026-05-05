// scripts/add-functional-tag.js
import fs from "fs";
import path from "path";
import { globSync } from "glob";

const files = globSync("tests/functional/**/*.spec.js", {
  ignore: "**/api/**",
});

let updated = 0;
files.forEach((file) => {
  if (file.includes("cleanup")) return;

  let content = fs.readFileSync(file, "utf8");

  // Skip if already has tags
  if (
    content.includes("@smoke") ||
    content.includes("@regression") ||
    content.includes("@functional")
  ) {
    return;
  }

  // Add @functional to first test.describe
  const newContent = content.replace(
    /test\.describe\('([^']+)'/,
    (match, name) => `test.describe('${name} @functional'`,
  );

  if (newContent !== content) {
    fs.writeFileSync(file, newContent);
    console.log("Updated:", file);
    updated++;
  }
});

console.log(`\nTotal updated: ${updated} files`);
