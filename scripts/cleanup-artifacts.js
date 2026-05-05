/**
 * Скрипт очистки артефактов тестов
 *
 * Что чистит:
 *   - test-run*.log, test-debug*.log в корне (хранит последние N)
 *   - test-case*.png скриншоты в корне (удаляет все)
 *   - allure-history/run_* (хранит последние N прогонов)
 *   - test-results/, playwright-report/, allure-results/, allure-report/
 *
 * Использование:
 *   node scripts/cleanup-artifacts.js          - очистка (хранит 15 последних)
 *   node scripts/cleanup-artifacts.js --keep=10 - хранить 10 последних
 *   node scripts/cleanup-artifacts.js --dry-run - показать что будет удалено
 *   node scripts/cleanup-artifacts.js --all     - удалить все артефакты
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Конфигурация
const DEFAULT_KEEP = 15;
const HISTORY_DIR = path.join(ROOT, "allure-history");

// Папки для полной очистки (пересоздаются каждый прогон)
const CLEAN_DIRS = [
  "test-results",
  "playwright-report",
  "allure-results",
  "allure-report",
  "blob-report",
  "test-results-temp",
];

// Файлы для защиты от удаления в test-results
const PROTECTED_FILES = [".auth", ".last-run.json"];

// Паттерны лог-файлов в корне проекта
const LOG_PATTERNS = [/^test-run.*\.log$/, /^test-debug.*\.log$/];

// Паттерны скриншотов в корне проекта
const SCREENSHOT_PATTERNS = [/^test-case.*\.png$/];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    keep: DEFAULT_KEEP,
    dryRun: false,
    all: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--keep=")) {
      options.keep = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--all") {
      options.all = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Очистка артефактов тестов

Использование:
  node scripts/cleanup-artifacts.js [опции]

Опции:
  --keep=N     Хранить N последних прогонов в allure-history (по умолчанию: ${DEFAULT_KEEP})
  --dry-run    Показать что будет удалено, без фактического удаления
  --all        Удалить все артефакты включая историю
  --help, -h   Показать эту справку

Примеры:
  node scripts/cleanup-artifacts.js              # Хранит 15 последних прогонов
  node scripts/cleanup-artifacts.js --keep=10   # Хранит 10 последних прогонов
  node scripts/cleanup-artifacts.js --dry-run   # Только показать что удалится
  node scripts/cleanup-artifacts.js --all       # Полная очистка
`);
      process.exit(0);
    }
  }

  return options;
}

function getDirSize(dirPath) {
  let size = 0;
  try {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        size += getDirSize(filePath);
      } else {
        size += fs.statSync(filePath).size;
      }
    }
  } catch {
    // Игнорируем ошибки доступа
  }
  return size;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function removeDir(dirPath, dryRun) {
  if (!fs.existsSync(dirPath)) return 0;

  const size = getDirSize(dirPath);
  if (dryRun) {
    console.log(`  [DRY-RUN] Удалить: ${dirPath} (${formatSize(size)})`);
  } else {
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`  Удалено: ${dirPath} (${formatSize(size)})`);
  }
  return size;
}

function cleanTestResults(dryRun) {
  const testResultsDir = path.join(ROOT, "test-results");
  if (!fs.existsSync(testResultsDir)) return 0;

  let totalSize = 0;
  const entries = fs.readdirSync(testResultsDir, { withFileTypes: true });

  for (const entry of entries) {
    // Защищаем .auth и .last-run.json
    if (PROTECTED_FILES.includes(entry.name)) continue;

    const fullPath = path.join(testResultsDir, entry.name);
    if (entry.isDirectory()) {
      totalSize += removeDir(fullPath, dryRun);
    } else {
      const size = fs.statSync(fullPath).size;
      if (dryRun) {
        console.log(`  [DRY-RUN] Удалить: ${fullPath} (${formatSize(size)})`);
      } else {
        fs.unlinkSync(fullPath);
        console.log(`  Удалено: ${fullPath} (${formatSize(size)})`);
      }
      totalSize += size;
    }
  }

  return totalSize;
}

function cleanHistoryRuns(keep, dryRun, deleteAll) {
  if (!fs.existsSync(HISTORY_DIR)) {
    console.log("allure-history не существует");
    return 0;
  }

  // Получаем список прогонов
  const runs = fs
    .readdirSync(HISTORY_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("run_"))
    .map((d) => d.name)
    .sort()
    .reverse(); // Новые первыми

  console.log(`\nНайдено прогонов: ${runs.length}`);

  if (deleteAll) {
    console.log("Режим --all: удаляем все прогоны");
  } else {
    console.log(`Хранить последних: ${keep}`);
  }

  const toDelete = deleteAll ? runs : runs.slice(keep);
  const toKeep = deleteAll ? [] : runs.slice(0, keep);

  if (toKeep.length > 0) {
    console.log(`\nСохраняем (${toKeep.length}):`);
    toKeep.slice(0, 5).forEach((r) => console.log(`  ✓ ${r}`));
    if (toKeep.length > 5) console.log(`  ... и ещё ${toKeep.length - 5}`);
  }

  let totalSize = 0;
  if (toDelete.length > 0) {
    console.log(`\nУдаляем (${toDelete.length}):`);
    for (const run of toDelete) {
      const runPath = path.join(HISTORY_DIR, run);
      totalSize += removeDir(runPath, dryRun);
    }
  } else {
    console.log("\nНечего удалять");
  }

  return totalSize;
}

function cleanReportDirs(dryRun) {
  let totalSize = 0;

  console.log("\nОчистка папок отчётов:");
  for (const dir of CLEAN_DIRS) {
    if (dir === "test-results") continue; // Обрабатывается отдельно
    const dirPath = path.join(ROOT, dir);
    if (fs.existsSync(dirPath)) {
      totalSize += removeDir(dirPath, dryRun);
    }
  }

  return totalSize;
}

function cleanRootLogs(keep, dryRun, deleteAll) {
  const entries = fs.readdirSync(ROOT, { withFileTypes: true });

  // Собираем лог-файлы
  const logFiles = entries
    .filter((e) => e.isFile() && LOG_PATTERNS.some((p) => p.test(e.name)))
    .map((e) => ({
      name: e.name,
      path: path.join(ROOT, e.name),
      mtime: fs.statSync(path.join(ROOT, e.name)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime); // Новые первыми

  console.log(`Найдено лог-файлов: ${logFiles.length}`);

  const toDelete = deleteAll ? logFiles : logFiles.slice(keep);
  const toKeep = deleteAll ? [] : logFiles.slice(0, keep);

  if (toKeep.length > 0) {
    console.log(`Сохраняем последних: ${toKeep.length}`);
    toKeep.slice(0, 3).forEach((f) => console.log(`  ✓ ${f.name}`));
    if (toKeep.length > 3) console.log(`  ... и ещё ${toKeep.length - 3}`);
  }

  let totalSize = 0;
  if (toDelete.length > 0) {
    console.log(`Удаляем: ${toDelete.length}`);
    for (const file of toDelete) {
      const size = fs.statSync(file.path).size;
      if (dryRun) {
        console.log(`  [DRY-RUN] ${file.name} (${formatSize(size)})`);
      } else {
        fs.unlinkSync(file.path);
        console.log(`  Удалено: ${file.name} (${formatSize(size)})`);
      }
      totalSize += size;
    }
  }

  return totalSize;
}

function cleanRootScreenshots(dryRun) {
  const entries = fs.readdirSync(ROOT, { withFileTypes: true });

  const screenshots = entries.filter(
    (e) => e.isFile() && SCREENSHOT_PATTERNS.some((p) => p.test(e.name)),
  );

  console.log(`Найдено скриншотов: ${screenshots.length}`);

  let totalSize = 0;
  for (const file of screenshots) {
    const filePath = path.join(ROOT, file.name);
    const size = fs.statSync(filePath).size;
    if (dryRun) {
      console.log(`  [DRY-RUN] ${file.name} (${formatSize(size)})`);
    } else {
      fs.unlinkSync(filePath);
      console.log(`  Удалено: ${file.name} (${formatSize(size)})`);
    }
    totalSize += size;
  }

  return totalSize;
}

function main() {
  const options = parseArgs();

  console.log("=".repeat(50));
  console.log("Очистка артефактов тестов");
  console.log("=".repeat(50));

  if (options.dryRun) {
    console.log("\n⚠️  РЕЖИМ DRY-RUN: ничего не будет удалено\n");
  }

  let totalFreed = 0;

  // 1. Очистка лог-файлов в корне (test-run*.log, test-debug*.log)
  console.log("\n📝 Лог-файлы в корне:");
  totalFreed += cleanRootLogs(options.keep, options.dryRun, options.all);

  // 2. Очистка скриншотов в корне (test-case*.png)
  console.log("\n🖼️  Скриншоты в корне:");
  totalFreed += cleanRootScreenshots(options.dryRun);

  // 3. Очистка test-results (кроме .auth)
  console.log("\n📁 test-results (кроме .auth):");
  totalFreed += cleanTestResults(options.dryRun);

  // 4. Очистка папок отчётов
  totalFreed += cleanReportDirs(options.dryRun);

  // 5. Очистка истории прогонов
  console.log("\n📊 allure-history:");
  totalFreed += cleanHistoryRuns(options.keep, options.dryRun, options.all);

  // Итог
  console.log("\n" + "=".repeat(50));
  if (options.dryRun) {
    console.log(`Будет освобождено: ${formatSize(totalFreed)}`);
  } else {
    console.log(`Освобождено: ${formatSize(totalFreed)}`);
  }
  console.log("=".repeat(50));
}

main();
