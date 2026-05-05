/**
 * Утилита для парсинга PPTX отчётов
 *
 * PPTX — это zip-архив с XML файлами внутри.
 * Текст слайдов находится в ppt/slides/slideN.xml в тегах <a:t>.
 *
 * @example
 * const parser = new PPTXParser();
 * const result = await parser.parse('/path/to/report.pptx');
 * const hasCharacteristic = parser.findCharacteristic(result.text, 'Высоко');
 */
import JSZip from "jszip";
import * as fs from "fs";

export class PPTXParser {
  /**
   * Парсинг PPTX файла и извлечение текста
   * @param {string} filePath - Путь к PPTX файлу
   * @returns {Promise<{slides: Array<{slideNum: number, text: string}>, text: string, total: number}>}
   */
  async parse(filePath) {
    const data = fs.readFileSync(filePath);
    return this.parseBuffer(data);
  }

  /**
   * Парсинг PPTX из Buffer (например, от Playwright download)
   * @param {Buffer} buffer - Buffer с содержимым PPTX
   * @returns {Promise<{slides: Array<{slideNum: number, text: string}>, text: string, total: number}>}
   */
  async parseBuffer(buffer) {
    const zip = await JSZip.loadAsync(buffer);

    const slides = [];

    // Извлекаем текст из каждого слайда
    for (const [filename, file] of Object.entries(zip.files)) {
      if (
        filename.startsWith("ppt/slides/slide") &&
        filename.endsWith(".xml")
      ) {
        const content = await file.async("string");

        // Извлекаем номер слайда из имени файла
        const slideMatch = filename.match(/slide(\d+)\.xml$/);
        const slideNum = slideMatch ? parseInt(slideMatch[1], 10) : 0;

        // Извлекаем текст из <a:t> тегов (PowerPoint text elements)
        const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g) || [];
        const texts = textMatches
          .map((m) => m.replace(/<\/?a:t>/g, ""))
          .join(" ");

        slides.push({
          slideNum,
          text: texts,
        });
      }
    }

    // Сортируем слайды по номеру
    slides.sort((a, b) => a.slideNum - b.slideNum);

    // Объединяем весь текст
    const allText = slides.map((s) => s.text).join("\n\n");

    return {
      slides,
      text: allText,
      total: slides.length,
    };
  }

  /**
   * Поиск текстовой характеристики в тексте PPTX
   * @param {string} text - Текст PPTX
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
        if (contexts.length >= 5) break;
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
   * - PPTX: "Итоговая оценка <характеристика> <число>"
   * - TextChars: характеристика + число
   * - NumOnly: только число
   * @param {string} text - Текст PPTX
   * @returns {{score: string|null, characteristic: string|null, mode: string}}
   */
  findFinalScore(text) {
    // Поддержка русского ("Итоговая оценка") и английского ("Final score") форматов
    const header = "(?:Итоговая оценка|Final score)";

    // PPTX формат с характеристикой и числом: "Итоговая оценка <характеристика> <число>"
    const textAndNumPattern = new RegExp(
      `${header}\\s+([^\\d\\s]+)\\s+([\\d.]+)`,
      "i",
    );
    const textAndNumMatch = text.match(textAndNumPattern);

    if (textAndNumMatch) {
      return {
        characteristic: textAndNumMatch[1]?.trim() || null,
        score: textAndNumMatch[2] || null,
        mode: "textAndNum",
      };
    }

    // PPTX формат только число: "Итоговая оценка <число>"
    const numOnlyPattern = new RegExp(`${header}\\s+([\\d.]+)`, "i");
    const numOnlyMatch = text.match(numOnlyPattern);
    if (numOnlyMatch) {
      return {
        characteristic: null,
        score: numOnlyMatch[1],
        mode: "numOnly",
      };
    }

    // PPTX формат только текст (без числа): "Итоговая оценка <характеристика>"
    // Характеристика не должна быть числом
    const textOnlyPattern = new RegExp(`${header}\\s+([^\\d\\s][^\\s]*)`, "i");
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
   * Извлечь текст конкретного слайда
   * @param {{slides: Array<{slideNum: number, text: string}>}} result - Результат парсинга
   * @param {number} slideNum - Номер слайда (1-based)
   * @returns {string|null}
   */
  getSlideText(result, slideNum) {
    const slide = result.slides.find((s) => s.slideNum === slideNum);
    return slide ? slide.text : null;
  }

  /**
   * Найти слайд с итоговой оценкой
   * @param {{slides: Array<{slideNum: number, text: string}>}} result - Результат парсинга
   * @returns {{slideNum: number, text: string}|null}
   */
  findScoreSlide(result) {
    return (
      result.slides.find((s) =>
        s.text.toLowerCase().includes("итоговая оценка"),
      ) || null
    );
  }

  /**
   * Проверить содержит ли PPTX характеристики из настроек
   * @param {string} text - Текст PPTX
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

  /**
   * Определить тип отчёта (индивидуальный или групповой)
   * @param {{slides: Array<{slideNum: number, text: string}>}} result - Результат парсинга
   * @returns {'individual' | 'group' | 'unknown'}
   */
  getReportType(result) {
    // Индивидуальный отчёт содержит "Итоговая оценка" и имя сотрудника на 2-м слайде
    const slide2 = this.getSlideText(result, 2);
    if (slide2 && slide2.toLowerCase().includes("итоговая оценка")) {
      return "individual";
    }

    // Групповой отчёт содержит "Статистика прохождения" или "Тепловая карта"
    if (
      result.text.toLowerCase().includes("статистика прохождения") ||
      result.text.toLowerCase().includes("тепловая карта")
    ) {
      return "group";
    }

    return "unknown";
  }
}
