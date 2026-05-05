/**
 * Утилиты для парсинга и валидации XLSX файлов в тестах.
 * Используют библиотеку `xlsx` (SheetJS) из package.json.
 */
import XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const DOWNLOAD_DIR = "test-results/downloads";

/**
 * Сохранить скачанный файл на диск.
 * @param {import('@playwright/test').Download} download - Playwright Download object
 * @param {string} [prefix="summary"] - Префикс имени файла
 * @returns {Promise<string>} Абсолютный путь к сохранённому файлу
 */
export async function saveDownload(download, prefix = "summary") {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  const suggested = download.suggestedFilename();
  const ext = path.extname(suggested) || ".xlsx";
  const fileName = `${prefix}_${Date.now()}${ext}`;
  const filePath = path.join(DOWNLOAD_DIR, fileName);
  await download.saveAs(filePath);
  return filePath;
}

/**
 * Распарсить XLSX файл.
 * @param {string} filePath - Путь к файлу
 * @returns {{ headers: string[], rows: Array<Array<any>>, sheetName: string, allData: Array<Array<any>> }}
 */
export function parseXlsx(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const allData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Найти строку заголовков — строку с максимальным числом непустых ячеек
  // (XLSX может иметь пустые строки и merged category headers перед реальными заголовками)
  let headerRowIdx = 0;
  let maxNonEmpty = 0;
  const searchLimit = Math.min(allData.length, 10); // ищем только в первых 10 строках
  for (let i = 0; i < searchLimit; i++) {
    const row = allData[i] || [];
    const nonEmpty = row.filter((cell) => cell != null && String(cell).trim() !== "").length;
    if (nonEmpty > maxNonEmpty) {
      maxNonEmpty = nonEmpty;
      headerRowIdx = i;
    }
  }

  const rawHeaders = (allData[headerRowIdx] || []).map((h) => String(h || "").trim());

  // Обрезать trailing пустые колонки (merged cells создают тысячи пустых)
  let lastNonEmpty = rawHeaders.length - 1;
  while (lastNonEmpty >= 0 && rawHeaders[lastNonEmpty] === "") {
    lastNonEmpty--;
  }
  const headers = rawHeaders.slice(0, lastNonEmpty + 1);

  const rows = allData
    .slice(headerRowIdx + 1)
    .filter((row) => row.some((cell) => cell != null && cell !== ""));

  return { headers, rows, sheetName, allData };
}

/**
 * Найти индекс колонки по regex-паттерну.
 * @param {string[]} headers - Заголовки XLSX
 * @param {RegExp} pattern - Паттерн для поиска
 * @returns {number} Индекс колонки или -1
 */
export function findColumnIndex(headers, pattern) {
  return headers.findIndex((h) => pattern.test(h));
}

/**
 * Получить значения конкретной колонки из всех строк.
 * @param {Array<Array<any>>} rows - Строки данных (без заголовков)
 * @param {number} colIndex - Индекс колонки
 * @returns {Array<any>}
 */
export function getColumnValues(rows, colIndex) {
  if (colIndex < 0) return [];
  return rows.map((row) => row[colIndex]);
}

/**
 * Получить имена сотрудников из XLSX.
 * Ищет колонку «Оцениваемый сотрудник» или «ФИО».
 * @param {string[]} headers
 * @param {Array<Array<any>>} rows
 * @returns {string[]}
 */
export function getEmployeeNamesFromXlsx(headers, rows) {
  const colIndex = findColumnIndex(headers, /оцениваемый сотрудник|фио/i);
  if (colIndex < 0) return [];
  return getColumnValues(rows, colIndex)
    .map((v) => String(v || "").trim())
    .filter(Boolean);
}

/**
 * Найти строку в XLSX по имени сотрудника.
 * @param {Array<Array<any>>} rows
 * @param {string[]} headers
 * @param {string} fullName - Полное имя (частичное совпадение)
 * @returns {Array<any>|null} Строка или null
 */
export function findXlsxRowByName(rows, headers, fullName) {
  const colIndex = findColumnIndex(headers, /оцениваемый сотрудник|фио/i);
  if (colIndex < 0) return null;

  const normalized = fullName.replace(/\s+/g, " ").trim().toLowerCase();
  const nameWords = normalized.split(" ").filter(Boolean);

  return (
    rows.find((row) => {
      const cell = String(row[colIndex] || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      // Exact or substring match
      if (cell.includes(normalized) || normalized.includes(cell)) return true;
      // Word-based match: all words from API name appear in XLSX cell
      if (nameWords.length >= 2 && nameWords.every((w) => cell.includes(w))) return true;
      return false;
    }) || null
  );
}

/**
 * Сравнить списки имён сотрудников из UI и XLSX (с нормализацией).
 * @param {string[]} uiNames
 * @param {string[]} xlsxNames
 * @returns {{ match: boolean, onlyInUi: string[], onlyInXlsx: string[] }}
 */
export function compareUiAndXlsx(uiNames, xlsxNames) {
  const normalize = (name) => name.replace(/\s+/g, " ").trim().toLowerCase();
  const uiSet = new Set(uiNames.map(normalize));
  const xlsxSet = new Set(xlsxNames.map(normalize));

  const onlyInUi = [...uiSet].filter((n) => !xlsxSet.has(n));
  const onlyInXlsx = [...xlsxSet].filter((n) => !uiSet.has(n));

  return {
    match: onlyInUi.length === 0 && onlyInXlsx.length === 0,
    onlyInUi,
    onlyInXlsx,
  };
}

/**
 * Сверить данные из API (distribution-last-results) с XLSX построчно.
 * @param {Object} apiResults - Результаты из getDistributionLastResults (объект { "0": {...}, "1": {...} })
 * @param {Array<Object>} apiUsers - Пользователи из getDistributionUsers
 * @param {Array<Array<any>>} rows - Строки XLSX
 * @param {string[]} headers - Заголовки XLSX
 * @returns {{ matched: number, mismatches: Array<{user: string, field: string, api: any, xlsx: any}> }}
 */
export function compareApiAndXlsx(apiResults, apiUsers, rows, headers) {
  const mismatches = [];
  let matched = 0;

  const resultEntries = Object.values(apiResults || {});

  for (const user of apiUsers) {
    const fullName = [user.lastName, user.firstName].filter(Boolean).join(" ");
    const xlsxRow = findXlsxRowByName(rows, headers, fullName);
    if (!xlsxRow) {
      mismatches.push({
        user: fullName,
        field: "row",
        api: "exists",
        xlsx: "NOT FOUND",
      });
      continue;
    }

    const result = resultEntries.find((r) => r.targetUserId === user.id);
    if (!result) {
      matched++;
      continue;
    }

    // Сверяем числовую итоговую оценку
    if (result.revisionMean?.value != null) {
      const scoreColIdx = findColumnIndex(
        headers,
        /итоговая.*текущая|итоговая оценка.*после|текущая.*итоговая/i,
      );
      if (scoreColIdx >= 0) {
        const xlsxVal = Number(xlsxRow[scoreColIdx]);
        const apiVal = Number(result.revisionMean.value);
        if (
          !isNaN(xlsxVal) &&
          !isNaN(apiVal) &&
          Math.abs(xlsxVal - apiVal) > 0.1
        ) {
          mismatches.push({
            user: fullName,
            field: "revisionMean",
            api: apiVal,
            xlsx: xlsxVal,
          });
          continue;
        }
      }
    }

    matched++;
  }

  return { matched, mismatches };
}
