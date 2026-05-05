/**
 * Утилиты для парсинга экспортированных отчётов
 *
 * @example
 * import { PDFParser, PPTXParser } from '../utils/report-parsers/index.js';
 *
 * const pdfParser = new PDFParser();
 * const pdfResult = await pdfParser.parseBuffer(downloadBuffer);
 *
 * const pptxParser = new PPTXParser();
 * const pptxResult = await pptxParser.parseBuffer(downloadBuffer);
 */

export { PDFParser } from "./PDFParser.js";
export { PPTXParser } from "./PPTXParser.js";
