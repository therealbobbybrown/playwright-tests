// scripts/migrate-tags.js
// Миграция тегов на новую структуру
import fs from "fs";
import { globSync } from "glob";

// ============ ШАГ 1: UI тесты - заменить @functional на @ui ============
console.log("\n=== ШАГ 1: UI тесты - @functional → @ui ===\n");

const uiFiles = globSync("tests/functional/**/*.spec.js", {
  ignore: "**/api/**",
});
let uiUpdated = 0;

uiFiles.forEach((file) => {
  if (file.includes("cleanup")) return;

  let content = fs.readFileSync(file, "utf8");
  let newContent = content;

  // Заменяем @functional на @ui
  newContent = newContent.replace(/@functional/g, "@ui");

  if (newContent !== content) {
    fs.writeFileSync(file, newContent);
    console.log("UI:", file);
    uiUpdated++;
  }
});
console.log(`UI тестов обновлено: ${uiUpdated}`);

// ============ ШАГ 2: API тесты - добавить @regression или @negative ============
console.log("\n=== ШАГ 2: API тесты - добавить категории ===\n");

const apiFiles = globSync("tests/functional/api/**/*.spec.js");
let apiUpdated = 0;

apiFiles.forEach((file) => {
  if (file.includes("cleanup")) return;

  let content = fs.readFileSync(file, "utf8");
  let newContent = content;

  // Определяем категорию по имени файла
  const isNegative = file.includes("negative") || file.includes("validation");

  // Проверяем есть ли уже @api
  if (!content.includes("@api")) {
    // Добавляем @api к первому test.describe
    newContent = newContent.replace(
      /test\.describe\('([^']+)'/,
      (match, name) => {
        if (name.includes("@api")) return match;
        return `test.describe('${name} @api'`;
      },
    );
  }

  // Добавляем @regression или @negative если нет
  if (!content.includes("@regression") && !content.includes("@negative")) {
    const tag = isNegative ? "@negative" : "@regression";
    newContent = newContent.replace(
      /@api(?!\s+@(regression|negative))/g,
      `@api ${tag}`,
    );
  }

  if (newContent !== content) {
    fs.writeFileSync(file, newContent);
    console.log("API:", file);
    apiUpdated++;
  }
});
console.log(`API тестов обновлено: ${apiUpdated}`);

// ============ ШАГ 3: Security тесты - добавить @security ============
console.log("\n=== ШАГ 3: Security тесты ===\n");

const securityFiles = globSync("tests/security/**/*.spec.js");
let securityUpdated = 0;

securityFiles.forEach((file) => {
  let content = fs.readFileSync(file, "utf8");
  let newContent = content;

  // Добавляем @security если нет
  if (!content.includes("@security")) {
    // Определяем тип - API или UI
    const isApi = file.includes("/api/");
    const typeTag = isApi ? "@api" : "@ui";

    newContent = newContent.replace(
      /test\.describe\('([^']+)'/,
      (match, name) => {
        if (name.includes("@security")) return match;
        return `test.describe('${name} ${typeTag} @security'`;
      },
    );
  }

  if (newContent !== content) {
    fs.writeFileSync(file, newContent);
    console.log("Security:", file);
    securityUpdated++;
  }
});
console.log(`Security тестов обновлено: ${securityUpdated}`);

// ============ ШАГ 4: Smoke API тесты - добавить @smoke ============
console.log("\n=== ШАГ 4: Smoke API тесты ===\n");

const smokeApiFiles = globSync("tests/smoke/api/**/*.spec.js");
let smokeUpdated = 0;

smokeApiFiles.forEach((file) => {
  let content = fs.readFileSync(file, "utf8");
  let newContent = content;

  // Убедимся что есть @api @smoke
  if (!content.includes("@api")) {
    newContent = newContent.replace(
      /test\.describe\('([^']+)'/,
      (match, name) => {
        if (name.includes("@api")) return match;
        return `test.describe('${name} @api'`;
      },
    );
  }

  if (!content.includes("@smoke")) {
    newContent = newContent.replace(/@api(?!\s+@smoke)/g, "@api @smoke");
  }

  if (newContent !== content) {
    fs.writeFileSync(file, newContent);
    console.log("Smoke API:", file);
    smokeUpdated++;
  }
});
console.log(`Smoke API тестов обновлено: ${smokeUpdated}`);

console.log("\n=== ИТОГО ===");
console.log(
  `UI: ${uiUpdated}, API: ${apiUpdated}, Security: ${securityUpdated}, Smoke API: ${smokeUpdated}`,
);
console.log(
  `Всего обновлено: ${uiUpdated + apiUpdated + securityUpdated + smokeUpdated} файлов`,
);
