#!/usr/bin/env node
/**
 * Скрипт для добавления Allure меток во все тесты
 *
 * Использование:
 *   node scripts/add-allure-labels.js --dry-run  # Показать что будет изменено
 *   node scripts/add-allure-labels.js            # Применить изменения
 *
 * Логика:
 * - API тесты (в папке tests/functional/api/) -> parentSuite: 'API Tests'
 * - UI тесты (остальные в tests/functional/) -> parentSuite: 'UI Tests'
 * - E2E тесты (с *-e2e.spec.js) -> parentSuite: 'E2E Tests'
 * - Smoke тесты (в tests/smoke/) -> parentSuite: 'Smoke Tests'
 * - Security тесты (в tests/security/) -> parentSuite: 'Security Tests'
 */

import fs from "fs";
import path from "path";
import { glob } from "glob";

const dryRun = process.argv.includes("--dry-run");

// Маппинг путей к типам тестов и модулям
const TEST_TYPE_MAPPING = {
  "tests/functional/api/": { type: "API Tests", getModule: getApiModule },
  "tests/functional/surveys/": { type: "UI Tests", module: "Surveys" },
  "tests/functional/performance-review/": {
    type: "UI Tests",
    module: "Performance Review",
  },
  "tests/functional/feedback/": { type: "UI Tests", module: "Feedback" },
  "tests/functional/org-structure/": {
    type: "UI Tests",
    module: "Org Structure",
  },
  "tests/functional/auth/": { type: "UI Tests", module: "Auth" },
  "tests/functional/profile/": { type: "UI Tests", module: "Profile" },
  "tests/functional/settings/": { type: "UI Tests", module: "Settings" },
  "tests/functional/brand/": { type: "UI Tests", module: "Brand" },
  "tests/functional/objectives/": { type: "UI Tests", module: "Objectives" },
  "tests/functional/gift-shop/": { type: "UI Tests", module: "Gift Shop" },
  "tests/functional/virtual-currency/": {
    type: "UI Tests",
    module: "Virtual Currency",
  },
  "tests/functional/my-team/": { type: "UI Tests", module: "My Team" },
  "tests/functional/home/": { type: "UI Tests", module: "Home" },
  "tests/functional/account/": { type: "UI Tests", module: "Account" },
  "tests/smoke/": { type: "Smoke Tests", module: null },
  "tests/security/": { type: "Security Tests", module: "Security" },
};

function getApiModule(filePath) {
  const fileName = path.basename(filePath);
  if (fileName.includes("performance-review")) return "Performance Review";
  if (fileName.includes("survey")) return "Surveys";
  return "API";
}

function getTestTypeAndModule(filePath) {
  const normalizedPath = filePath.replace(/\\/g, "/");

  // Проверяем E2E тесты
  if (normalizedPath.includes("-e2e.spec.js")) {
    // Определяем модуль по пути
    if (normalizedPath.includes("performance-review")) {
      return { type: "E2E Tests", module: "Performance Review" };
    }
    if (normalizedPath.includes("surveys")) {
      return { type: "E2E Tests", module: "Surveys" };
    }
    return { type: "E2E Tests", module: null };
  }

  for (const [pathPattern, config] of Object.entries(TEST_TYPE_MAPPING)) {
    if (normalizedPath.includes(pathPattern.replace(/\//g, "/"))) {
      const module =
        typeof config.getModule === "function"
          ? config.getModule(filePath)
          : config.module;
      return { type: config.type, module };
    }
  }

  return { type: "UI Tests", module: null };
}

function getSubSuite(filePath) {
  const normalizedPath = filePath.replace(/\\/g, "/");

  // Определяем подкатегорию по папке
  if (normalizedPath.includes("/creation/")) return "Creation";
  if (normalizedPath.includes("/publication/")) return "Publication";
  if (normalizedPath.includes("/results/")) return "Results";
  if (normalizedPath.includes("/management/")) return "Management";
  if (normalizedPath.includes("/filling/")) return "Filling";
  if (normalizedPath.includes("/cleanup/")) return "Cleanup";
  if (normalizedPath.includes("/list/")) return "List";
  if (normalizedPath.includes("/users/")) return "Users";
  if (normalizedPath.includes("/departments/")) return "Departments";

  return null;
}

async function processFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const { type, module } = getTestTypeAndModule(filePath);
  const subSuite = getSubSuite(filePath);

  // Проверяем, уже есть ли allure метки
  if (
    content.includes("markAsAPITest") ||
    content.includes("markAsUITest") ||
    content.includes("markAsE2ETest")
  ) {
    console.log(`[SKIP] ${filePath} - уже есть Allure метки`);
    return false;
  }

  // Проверяем, есть ли test.describe или test(
  const hasDescribe = content.includes("test.describe(");
  const hasTest = content.includes("test(") || content.includes("test.slow()");

  if (!hasDescribe && !hasTest) {
    console.log(`[SKIP] ${filePath} - нет тестов`);
    return false;
  }

  let newContent = content;
  let importAdded = false;

  // Определяем какую функцию импортировать
  let markFunction = "markAsUITest";
  let markModule = module
    ? `MODULES.${module.toUpperCase().replace(/ /g, "_").replace("-", "_")}`
    : `'${module}'`;

  if (type === "API Tests") {
    markFunction = "markAsAPITest";
  } else if (type === "E2E Tests") {
    markFunction = "markAsE2ETest";
  } else if (type === "Smoke Tests") {
    markFunction = "markAsSmokeTest";
  } else if (type === "Security Tests") {
    markFunction = "markAsSecurityTest";
  }

  // Добавляем импорт
  const importStatement = `import { ${markFunction}, MODULES } from '../../utils/allure-helpers.js';`;

  // Находим место для импорта
  if (!content.includes("allure-helpers.js")) {
    // Ищем последний import
    const lastImportMatch = content.match(/^import .+;$/gm);
    if (lastImportMatch) {
      const lastImport = lastImportMatch[lastImportMatch.length - 1];
      // Вычисляем относительный путь
      const depth = filePath.match(/tests\/functional\//)?.[0]
        ? filePath.replace(/\\/g, "/").split("tests/functional/")[1].split("/")
            .length - 1
        : 2;
      const relativePath = "../".repeat(depth) + "utils/allure-helpers.js";
      const adjustedImport = `import { ${markFunction}, MODULES } from '${relativePath}';`;

      newContent = newContent.replace(
        lastImport,
        lastImport + "\n" + adjustedImport,
      );
      importAdded = true;
    }
  }

  console.log(`[${dryRun ? "DRY-RUN" : "UPDATE"}] ${filePath}`);
  console.log(`  Type: ${type}, Module: ${module}, SubSuite: ${subSuite}`);

  if (!dryRun && importAdded) {
    fs.writeFileSync(filePath, newContent, "utf8");
    return true;
  }

  return false;
}

async function main() {
  console.log(`\nAllure Labels Script ${dryRun ? "(DRY RUN)" : ""}\n`);
  console.log("=".repeat(60));

  // Находим все spec файлы
  const files = await glob("tests/**/*.spec.js", {
    ignore: ["**/node_modules/**"],
    cwd: process.cwd(),
  });

  console.log(`\nНайдено ${files.length} тестовых файлов\n`);

  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const result = await processFile(file);
    if (result) updated++;
    else skipped++;
  }

  console.log("\n" + "=".repeat(60));
  console.log(`\nИтого: обновлено ${updated}, пропущено ${skipped}`);

  if (dryRun) {
    console.log(
      "\nЭто был DRY RUN. Для применения изменений запустите без --dry-run",
    );
  }
}

main().catch(console.error);
