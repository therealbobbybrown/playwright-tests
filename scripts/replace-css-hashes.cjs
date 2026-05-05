/**
 * Скрипт для замены хэшированных CSS-классов на устойчивые селекторы.
 * Заменяет `.ClassName_method__hash` на `[class*="ClassName_method__"]`
 *
 * Использование: node scripts/replace-css-hashes.cjs
 */

const fs = require("fs");
const path = require("path");

// Паттерн для поиска CSS-хэшей: ClassName_method-name__hash (5+ символов хэша)
const HASH_PATTERN = /([A-Z][a-zA-Z]+_[a-zA-Z0-9-]+)__[a-zA-Z0-9]{5,}/g;

/**
 * Заменяет хэшированные классы в строке
 */
function replaceHashes(content, filePath) {
  let modified = false;
  const replacements = [];

  // Замена в разных контекстах:

  // 1. .ClassName_method__hash → [class*="ClassName_method__"]
  const dotClassPattern = /\.([A-Z][a-zA-Z]+_[a-zA-Z0-9-]+)__[a-zA-Z0-9]{5,}/g;
  let result = content.replace(dotClassPattern, (match, className) => {
    replacements.push({ from: match, to: `[class*="${className}__"]` });
    modified = true;
    return `[class*="${className}__"]`;
  });

  // 2. span.ClassName_method__hash → span[class*="ClassName_method__"]
  // (уже обработано выше, т.к. .ClassName... заменён)

  // 3. class="...ClassName_method__hash..." — обычно не нужно менять в locator-ах

  // 4. Внутри строк: 'ClassName_method__hash' или "ClassName_method__hash" без точки впереди
  // Для has-text и подобных — НЕ трогаем, это текст

  if (modified) {
    console.log(`\n📄 ${filePath}`);
    replacements.forEach((r) => {
      console.log(`   ${r.from} → ${r.to}`);
    });
  }

  return { content: result, modified };
}

/**
 * Обрабатывает файл
 */
function processFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const { content: newContent, modified } = replaceHashes(content, filePath);

  if (modified) {
    fs.writeFileSync(filePath, newContent, "utf-8");
    return true;
  }
  return false;
}

/**
 * Рекурсивно находит все .js файлы
 */
function findJsFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (
      entry.isDirectory() &&
      !entry.name.startsWith(".") &&
      entry.name !== "node_modules"
    ) {
      files.push(...findJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
}

// Запуск
const pagesDir = path.join(__dirname, "..", "pages");
const testsDir = path.join(__dirname, "..", "tests");

console.log("🔍 Поиск CSS-хэшей для замены...\n");

let modifiedCount = 0;

[pagesDir, testsDir].forEach((dir) => {
  if (fs.existsSync(dir)) {
    const files = findJsFiles(dir);
    files.forEach((file) => {
      if (processFile(file)) {
        modifiedCount++;
      }
    });
  }
});

console.log(`\n✅ Готово! Изменено файлов: ${modifiedCount}`);
