#!/usr/bin/env node
/**
 * Скрипт для миграции Page Objects на наследование от BasePage.
 * Запуск: node scripts/migrate-to-basepage.cjs
 */

const fs = require("fs");
const path = require("path");

const pagesDir = path.join(__dirname, "..", "pages");
const files = fs
  .readdirSync(pagesDir)
  .filter((f) => f.endsWith(".js") && f !== "BasePage.js");

let migrated = 0;
let skipped = 0;

for (const file of files) {
  const filePath = path.join(pagesDir, file);
  let content = fs.readFileSync(filePath, "utf8");

  // Проверяем, уже ли наследует от BasePage
  if (content.includes("extends BasePage")) {
    console.log(`✓ ${file} — уже наследует от BasePage`);
    skipped++;
    continue;
  }

  // Проверяем, есть ли _step метод
  if (!content.includes("async _step(")) {
    console.log(`○ ${file} — нет _step, пропускаем`);
    skipped++;
    continue;
  }

  // 1. Заменяем import { allure } на пустоту
  content = content.replace(
    /import \{ allure \} from 'allure-playwright';\n?/g,
    "",
  );

  // 2. Добавляем import BasePage после первого import или в начало
  if (!content.includes("import { BasePage }")) {
    const firstImportMatch = content.match(/^(import .+;\n)/m);
    if (firstImportMatch) {
      const insertPos =
        content.indexOf(firstImportMatch[0]) + firstImportMatch[0].length;
      content =
        content.slice(0, insertPos) +
        "import { BasePage } from './BasePage.js';\n" +
        content.slice(insertPos);
    } else {
      content = "import { BasePage } from './BasePage.js';\n" + content;
    }
  }

  // 3. Заменяем export class ClassName { на export class ClassName extends BasePage {
  content = content.replace(
    /export class (\w+) \{/,
    "export class $1 extends BasePage {",
  );

  // 4. Заменяем this.page = page; this.testInfo = testInfo; на super(page, testInfo);
  content = content.replace(
    /this\.page = page;\s*\n\s*this\.testInfo = testInfo;/g,
    "super(page, testInfo);",
  );

  // 5. Удаляем _step метод (разные варианты)
  // Вариант 1: многострочный с if (this.testInfo?.step)
  content = content.replace(
    /\n\s*async _step\(title, fn\) \{[\s\S]*?return fn\(\);\s*\n\s*\}\n?/g,
    "\n",
  );

  // Убираем лишние пустые строки
  content = content.replace(/\n{3,}/g, "\n\n");
  content = content.replace(/\n\n\}$/g, "\n}");

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`✔ ${file} — мигрирован`);
  migrated++;
}

console.log(`\nИтого: ${migrated} мигрировано, ${skipped} пропущено`);
