/**
 * Утилита для парсинга PDF отчётов
 *
 * Используется для извлечения текста из скачанных PDF файлов
 * и поиска текстовых характеристик оценки.
 *
 * @example
 * const parser = new PDFParser();
 * const result = await parser.parse('/path/to/report.pdf');
 * const hasCharacteristic = parser.findCharacteristic(result.text, 'Высоко');
 */
import { PDFParse } from "pdf-parse";
import * as fs from "fs";

export class PDFParser {
  /**
   * Парсинг PDF файла и извлечение текста
   * @param {string} filePath - Путь к PDF файлу
   * @returns {Promise<{pages: Array<{text: string, num: number}>, text: string, total: number}>}
   */
  async parse(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    const uint8Array = new Uint8Array(dataBuffer);

    const parser = new PDFParse(uint8Array);
    const result = await parser.getText();

    return {
      pages: result.pages || [],
      text: result.text || "",
      total: result.total || 0,
    };
  }

  /**
   * Парсинг PDF из Buffer (например, от Playwright download)
   * @param {Buffer} buffer - Buffer с содержимым PDF
   * @returns {Promise<{pages: Array<{text: string, num: number}>, text: string, total: number}>}
   */
  async parseBuffer(buffer) {
    const uint8Array = new Uint8Array(buffer);
    const parser = new PDFParse(uint8Array);
    const result = await parser.getText();

    return {
      pages: result.pages || [],
      text: result.text || "",
      total: result.total || 0,
    };
  }

  /**
   * Поиск текстовой характеристики в тексте PDF
   * @param {string} text - Текст PDF
   * @param {string} characteristic - Искомая характеристика (например, "Высоко")
   * @returns {{found: boolean, count: number, contexts: string[]}}
   */
  findCharacteristic(text, characteristic) {
    const regex = new RegExp(characteristic, "gi");
    const matches = text.match(regex);

    const contexts = [];
    if (matches) {
      let idx = 0;
      let searchFrom = 0;
      while (
        (idx = text
          .toLowerCase()
          .indexOf(characteristic.toLowerCase(), searchFrom)) !== -1
      ) {
        const start = Math.max(0, idx - 30);
        const end = Math.min(text.length, idx + characteristic.length + 30);
        contexts.push(text.substring(start, end));
        searchFrom = idx + 1;
        if (contexts.length >= 5) break; // Ограничиваем количество контекстов
      }
    }

    return {
      found: matches !== null,
      count: matches ? matches.length : 0,
      contexts,
    };
  }

  /**
   * Поиск итоговой оценки и её текстовой характеристики
   * Форматы:
   * - PDF: "Итоговая оценка\n<характеристика>\t<число>"
   * - OnlyTextChars: число = 0 (скрыто)
   * - TextChars: характеристика + число
   * @param {string} text - Текст PDF
   * @returns {{score: string|null, characteristic: string|null, mode: string}}
   */
  findFinalScore(text) {
    // Поддержка русского ("Итоговая оценка") и английского ("Final score") форматов
    const header = "(?:Итоговая оценка|Final score)";

    // Формат PDF с характеристикой и числом: "Итоговая оценка\n<характеристика>\t<число>"
    const textAndNumPattern = new RegExp(
      `${header}\\n([^\\t\\n\\d]+)\\t([\\d.]+)`,
      "i",
    );
    const textAndNumMatch = text.match(textAndNumPattern);

    if (textAndNumMatch) {
      const characteristic = textAndNumMatch[1]?.trim() || null;
      const score = textAndNumMatch[2] || null;

      return {
        characteristic,
        score,
        mode: "textAndNum",
      };
    }

    // Формат PDF только число: "Итоговая оценка\n<число>"
    const numOnlyPattern = new RegExp(`${header}\\n([\\d.]+)`, "i");
    const numOnlyMatch = text.match(numOnlyPattern);
    if (numOnlyMatch) {
      return {
        characteristic: null,
        score: numOnlyMatch[1],
        mode: "numOnly",
      };
    }

    // Формат PDF только текст (без числа): "Итоговая оценка\n<характеристика>"
    // Характеристика не должна начинаться с цифры
    const textOnlyPattern = new RegExp(
      `${header}\\n([^\\d\\n][^\\n]*?)(?:\\n|$)`,
      "i",
    );
    const textOnlyMatch = text.match(textOnlyPattern);
    if (textOnlyMatch) {
      return {
        characteristic: textOnlyMatch[1]?.trim() || null,
        score: null,
        mode: "onlyText",
      };
    }

    return { score: null, characteristic: null, mode: "unknown" };
  }

  /**
   * Извлечь текст конкретной страницы
   * @param {{pages: Array<{text: string, num: number}>}} result - Результат парсинга
   * @param {number} pageNum - Номер страницы (1-based)
   * @returns {string|null}
   */
  getPageText(result, pageNum) {
    const page = result.pages.find((p) => p.num === pageNum);
    return page ? page.text : null;
  }

  /**
   * Проверить содержит ли PDF характеристики из настроек
   * @param {string} text - Текст PDF
   * @param {string[]} characteristics - Массив характеристик из настроек (["Низко", "Средне", "Высоко"])
   * @returns {{found: string[], notFound: string[]}}
   */
  checkCharacteristics(text, characteristics) {
    const found = [];
    const notFound = [];

    for (const char of characteristics) {
      const result = this.findCharacteristic(text, char);
      if (result.found) {
        found.push(char);
      } else {
        notFound.push(char);
      }
    }

    return { found, notFound };
  }
}
