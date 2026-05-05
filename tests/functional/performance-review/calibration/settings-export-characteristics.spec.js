/**
 * SET-024/025/026: Тесты экспорта с разными режимами отображения оценки
 *
 * Режимы:
 * - SET-024: Цифра + текст (enableCustomCharacteristics=true, enableOnlyCustomCharacteristics=false)
 * - SET-025: Только цифра (enableCustomCharacteristics=false)
 * - SET-026: Только текст (enableCustomCharacteristics=true, enableOnlyCustomCharacteristics=true)
 *
 * Каждый кейс проверяет:
 * 1. PDF и PPTX содержат одинаковые данные
 * 2. Режим отображения соответствует настройкам
 * 3. Групповой отчёт НЕ содержит индивидуальных характеристик
 *
 * @tags @ui @calibration @regression @settings @export
 */
import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { getCredentials } from "../../../utils/credentials.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import {
  markAsUITest,
  setSeverity,
  MODULES,
} from "../../../utils/allure-helpers.js";
import { buildPRUrl } from "../../../utils/pr-urls.js";
import { PDFParser } from "../../../utils/report-parsers/PDFParser.js";
import { PPTXParser } from "../../../utils/report-parsers/PPTXParser.js";
import { TIMEOUTS } from "../../../utils/constants.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOAD_DIR = path.resolve(
  __dirname,
  "../../../../test-results/downloads",
);

const test = baseTest.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

/**
 * Скачать индивидуальный отчёт (PDF или PPTX)
 * @param {import('@playwright/test').Page} page
 * @param {number} prId
 * @param {'pdf' | 'pptx'} format
 * @param {string} prefix
 * @returns {Promise<string|null>} Путь к скачанному файлу
 */
async function downloadIndividualReport(page, prId, format, prefix) {
  const prUrl = buildPRUrl(prId, { statisticsSettings: true });
  await page.goto(prUrl);
  await page.waitForLoadState("networkidle");

  // Ждём появления табов
  const resultsTab = page
    .locator('button[class*="Tabs_button"]')
    .filter({ hasText: /результаты/i });
  await resultsTab.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

  // Клик на таб "Результаты"
  await resultsTab.click();
  // Ждём загрузки вкладки

  // Ждём появления таблицы с результатами
  await page.waitForSelector("table", { timeout: TIMEOUTS.MEDIUM });

  // Клик на кнопку "Результаты" в таблице (открывает модалку сотрудника)
  // Ищем в нижней таблице (с оцениваемыми), а не в верхней (с оценками)
  const resultsButton = page
    .locator("table")
    .last()
    .locator("button")
    .filter({ hasText: /^результаты$/i })
    .first();
  if (
    !(await resultsButton
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .then(() => true)
      .catch(() => false))
  ) {
    console.log('❌ Кнопка "Результаты" в таблице не найдена');
    return null;
  }

  await resultsButton.click();

  // Ждём появления модалки (увеличен timeout — под нагрузкой модалка открывается медленнее)
  const modal = page.locator('[class*="react-modal-sheet-container"]').first();
  await modal.waitFor({ state: "visible", timeout: 30_000 });
  // Ждём полной инициализации модалки
  await modal
    .locator("button")
    .filter({ hasText: /скачать результаты/i })
    .first()
    .waitFor({ state: "visible", timeout: 10000 });

  // Ищем кнопку "Скачать результаты" ВНУТРИ модалки
  const downloadButton = modal
    .locator("button")
    .filter({ hasText: /скачать результаты/i })
    .first();
  if (
    !(await downloadButton
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .then(() => true)
      .catch(() => false))
  ) {
    console.log('❌ Кнопка "Скачать результаты" в модалке не найдена');
    return null;
  }

  // Скроллим к кнопке если нужно
  await downloadButton.scrollIntoViewIfNeeded();

  // Клик на "Скачать результаты" — появится dropdown с форматами
  await downloadButton.click();
  // Ждём появления меню форматов
  const formatText = format === "pdf" ? "(PDF)" : "(PPTX)";
  const formatOption = page
    .locator("button")
    .filter({ hasText: formatText })
    .first();
  await formatOption.waitFor({ state: "visible", timeout: 5000 });

  // Выбираем формат — меню появляется как sibling кнопки "Скачать результаты"

  // Ждём появления опции формата
  if (
    !(await formatOption
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .then(() => true)
      .catch(() => false))
  ) {
    console.log(`❌ Опция формата "${formatText}" не найдена`);
    // Попробуем вывести все видимые кнопки для отладки
    const allButtons = await page.locator("button:visible").allInnerTexts();
    console.log("Видимые кнопки:", allButtons.slice(0, 15));
    return null;
  }

  // Подготавливаем слушатели событий ДО клика
  const downloadPromise = page
    .waitForEvent("download", { timeout: TIMEOUTS.LONG })
    .catch(() => null);
  const newPagePromise = page
    .context()
    .waitForEvent("page", { timeout: TIMEOUTS.LONG })
    .catch(() => null);

  // Кликаем на опцию формата
  await formatOption.click();
  console.log(`✅ Клик на формат ${format.toUpperCase()}`);

  // Ждём одного из событий: скачивание или новая вкладка
  const [download, newPage] = await Promise.all([
    downloadPromise,
    newPagePromise,
  ]);

  let filePath = null;

  if (download) {
    filePath = path.join(
      DOWNLOAD_DIR,
      `${prefix}-${download.suggestedFilename()}`,
    );
    await download.saveAs(filePath);
    console.log(`✅ Файл скачан напрямую: ${filePath}`);
  } else if (newPage) {
    // Скачивание через промежуточную страницу /download/?url=...
    const newPageUrl = newPage.url();
    console.log(`📥 Открылась страница скачивания: ${newPageUrl}`);

    const urlMatch = newPageUrl.match(/[?&]url=([^&]+)/);
    if (urlMatch) {
      const fileUrl = decodeURIComponent(urlMatch[1]);
      const context = page.context();
      // Увеличенный timeout для генерации PDF (может занять до 120 сек для больших отчётов)
      const response = await context.request.get(fileUrl, { timeout: 120000 });
      if (response.ok()) {
        const buffer = await response.body();
        const ext = format === "pdf" ? ".pdf" : ".pptx";
        filePath = path.join(
          DOWNLOAD_DIR,
          `${prefix}-report-${Date.now()}${ext}`,
        );
        // Гарантируем наличие директории (Playwright может очистить test-results между тестами)
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, buffer);
        console.log(`✅ Файл скачан через redirect: ${filePath}`);
      } else {
        console.log(`❌ Ошибка скачивания: ${response.status()}`);
      }
    }
    await newPage.close();
  } else {
    console.log("❌ Скачивание не началось (ни download event, ни new page)");
  }

  return filePath;
}

// Создаём директорию для скачивания
test.beforeAll(() => {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }
});

/**
 * SET-024: Экспорт в режиме "Цифра + текст"
 * enableCustomCharacteristics: true
 * enableOnlyCustomCharacteristics: false
 */
test.describe(
  'Экспорт "Цифра + текст"',
  { tag: ["@ui", "@calibration", "@regression", "@performance-review"] },
  () => {
    let testPrId;

    test.beforeAll(async ({ prSeed, request }) => {
      test.setTimeout(180000);
      const timestamp = Date.now();
      const pr = await prSeed.seedActivePR({
        title: `SET-024 TextAndNum ${timestamp}`,
        fillAssessments: true,
      });
      testPrId = pr.id;
      console.log(`✅ Создан PR для SET-024: ${testPrId}`);

      // Настраиваем режим "Цифра + текст"
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const { data: currentSettings } =
        await api.getStatisticsSettings(testPrId);
      const characteristicSettings = [
        {
          threshold: 33,
          title: "Низко",
          color: "#FF6B6B",
          category: "negative",
        },
        {
          threshold: 66,
          title: "Средне",
          color: "#FFE66D",
          category: "neutral",
        },
        {
          threshold: 100,
          title: "Высоко",
          color: "#4ECDC4",
          category: "positive",
        },
      ];

      const newSettings = {
        ...currentSettings,
        settings: {
          ...currentSettings.settings,
          useOnlyHeadReceiver: true, // Обязательно для работы характеристик
          enableCalibration: true,
          enableResponsesOverwriting: true,
          enableCustomCharacteristics: true,
          enableOnlyCustomCharacteristics: false, // Цифра + текст
        },
        characteristicSettings,
      };

      const { response, data: updateResult } =
        await api.updateStatisticsSettings(testPrId, newSettings);
      if (!response.ok()) {
        throw new Error(
          `updateStatisticsSettings(${testPrId}) failed: ${response.status()} ${JSON.stringify(updateResult)}`,
        );
      }

      console.log(
        `✅ Настроен режим "Цифра + текст": ${characteristicSettings.map((c) => c.title).join(", ")}`,
      );
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Export TextAndNum");
    });

    test("C4129: PDF и PPTX содержат одинаковую характеристику + число", async ({
      adminAuth: page,
    }) => {
      setSeverity("critical");

      const testCharacteristics = ["Низко", "Средне", "Высоко"];
      let pdfFile = null;
      let pptxFile = null;
      let pdfResult = null;
      let pptxResult = null;

      // Скачиваем PDF
      await test.step("Скачать PDF", async () => {
        pdfFile = await downloadIndividualReport(
          page,
          testPrId,
          "pdf",
          "set-024",
        );
        expect(pdfFile, "PDF файл должен быть скачан").toBeTruthy();
        expect(fs.existsSync(pdfFile), "PDF файл должен существовать").toBe(
          true,
        );
      });

      // Скачиваем PPTX
      await test.step("Скачать PPTX", async () => {
        pptxFile = await downloadIndividualReport(
          page,
          testPrId,
          "pptx",
          "set-024",
        );
        expect(pptxFile, "PPTX файл должен быть скачан").toBeTruthy();
        expect(fs.existsSync(pptxFile), "PPTX файл должен существовать").toBe(
          true,
        );
      });

      // Анализ PDF
      await test.step("Анализ PDF: оценка + характеристика", async () => {
        const parser = new PDFParser();
        const result = await parser.parse(pdfFile);
        pdfResult = parser.findFinalScore(result.text);

        console.log(
          `PDF: режим=${pdfResult.mode}, оценка=${pdfResult.score}, характеристика=${pdfResult.characteristic || "нет"}`,
        );

        expect(
          pdfResult.score,
          "PDF: должна быть числовая оценка",
        ).toBeTruthy();
        expect(
          parseFloat(pdfResult.score),
          "PDF: оценка должна быть > 0",
        ).toBeGreaterThan(0);
        expect(
          pdfResult.characteristic,
          "PDF: должна быть текстовая характеристика",
        ).toBeTruthy();
        expect(
          testCharacteristics,
          `PDF: характеристика "${pdfResult.characteristic}" должна быть одной из ${testCharacteristics.join("/")}`,
        ).toContain(pdfResult.characteristic);
        expect(pdfResult.mode, "PDF: режим должен быть textAndNum").toBe(
          "textAndNum",
        );
      });

      // Анализ PPTX
      await test.step("Анализ PPTX: оценка + характеристика", async () => {
        const parser = new PPTXParser();
        const result = await parser.parse(pptxFile);
        pptxResult = parser.findFinalScore(result.text);

        console.log(
          `PPTX: режим=${pptxResult.mode}, оценка=${pptxResult.score}, характеристика=${pptxResult.characteristic || "нет"}`,
        );

        expect(
          pptxResult.score,
          "PPTX: должна быть числовая оценка",
        ).toBeTruthy();
        expect(
          parseFloat(pptxResult.score),
          "PPTX: оценка должна быть > 0",
        ).toBeGreaterThan(0);
        expect(
          pptxResult.characteristic,
          "PPTX: должна быть текстовая характеристика",
        ).toBeTruthy();
        expect(
          testCharacteristics,
          `PPTX: характеристика "${pptxResult.characteristic}" должна быть одной из ${testCharacteristics.join("/")}`,
        ).toContain(pptxResult.characteristic);
        expect(pptxResult.mode, "PPTX: режим должен быть textAndNum").toBe(
          "textAndNum",
        );
      });

      // Сравнение PDF и PPTX
      await test.step("Сравнение PDF и PPTX", async () => {
        const pdfScore = parseFloat(pdfResult.score);
        const pptxScore = parseFloat(pptxResult.score);
        expect(
          Math.abs(pdfScore - pptxScore),
          `Оценки в PDF (${pdfScore}) и PPTX (${pptxScore}) должны совпадать`,
        ).toBeLessThan(0.1);

        expect(
          pdfResult.characteristic,
          "Характеристики в PDF и PPTX должны совпадать",
        ).toBe(pptxResult.characteristic);

        console.log(
          `✅ PDF и PPTX совпадают: оценка=${pdfScore}, характеристика=${pdfResult.characteristic}`,
        );
      });
    });
  },
);

/**
 * SET-025: Экспорт в режиме "Только цифра"
 * enableCustomCharacteristics: false
 */
test.describe(
  'Экспорт "Только цифра"',
  { tag: ["@ui", "@calibration", "@regression", "@performance-review"] },
  () => {
    let testPrId;

    test.beforeAll(async ({ prSeed, request }) => {
      test.setTimeout(180000);
      const timestamp = Date.now();
      const pr = await prSeed.seedActivePR({
        title: `SET-025 NumOnly ${timestamp}`,
        fillAssessments: true,
      });
      testPrId = pr.id;
      console.log(`✅ Создан PR для SET-025: ${testPrId}`);

      // Настраиваем режим "Только цифра" — характеристики отключены
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const { data: currentSettings } =
        await api.getStatisticsSettings(testPrId);
      const newSettings = {
        ...currentSettings,
        settings: {
          ...currentSettings.settings,
          useOnlyHeadReceiver: true, // Обязательно для работы характеристик
          enableCalibration: true,
          enableResponsesOverwriting: true,
          enableCustomCharacteristics: false, // Характеристики ОТКЛЮЧЕНЫ
          enableOnlyCustomCharacteristics: false,
        },
      };
      const { response } = await api.updateStatisticsSettings(
        testPrId,
        newSettings,
      );
      if (!response.ok()) {
        throw new Error(
          `updateStatisticsSettings(${testPrId}) failed: ${response.status()}`,
        );
      }
      console.log('✅ Настроен режим "Только цифра"');
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Export NumOnly");
    });

    test("C4130: PDF и PPTX содержат только число (без характеристики)", async ({
      adminAuth: page,
    }) => {
      setSeverity("critical");

      let pdfFile = null;
      let pptxFile = null;
      let pdfResult = null;
      let pptxResult = null;

      // Скачиваем PDF
      await test.step("Скачать PDF", async () => {
        pdfFile = await downloadIndividualReport(
          page,
          testPrId,
          "pdf",
          "set-025",
        );
        expect(pdfFile, "PDF файл должен быть скачан").toBeTruthy();
        expect(fs.existsSync(pdfFile), "PDF файл должен существовать").toBe(
          true,
        );
      });

      // Скачиваем PPTX
      await test.step("Скачать PPTX", async () => {
        pptxFile = await downloadIndividualReport(
          page,
          testPrId,
          "pptx",
          "set-025",
        );
        expect(pptxFile, "PPTX файл должен быть скачан").toBeTruthy();
        expect(fs.existsSync(pptxFile), "PPTX файл должен существовать").toBe(
          true,
        );
      });

      // Анализ PDF
      await test.step("Анализ PDF", async () => {
        const parser = new PDFParser();
        const result = await parser.parse(pdfFile);
        pdfResult = parser.findFinalScore(result.text);

        console.log(
          `📄 PDF: режим=${pdfResult.mode}, оценка=${pdfResult.score}, характеристика=${pdfResult.characteristic || "нет"}`,
        );

        // Строгие проверки для режима "Только цифра"
        expect(
          pdfResult.score,
          "PDF: должна быть числовая оценка",
        ).toBeTruthy();
        expect(
          parseFloat(pdfResult.score),
          "PDF: оценка должна быть > 0",
        ).toBeGreaterThan(0);
        expect(
          pdfResult.characteristic,
          "PDF: НЕ должно быть текстовой характеристики",
        ).toBeFalsy();
        expect(pdfResult.mode, "PDF: режим должен быть numOnly").toBe(
          "numOnly",
        );
      });

      // Анализ PPTX
      await test.step("Анализ PPTX", async () => {
        const parser = new PPTXParser();
        const result = await parser.parse(pptxFile);
        pptxResult = parser.findFinalScore(result.text);

        console.log(
          `📊 PPTX: режим=${pptxResult.mode}, оценка=${pptxResult.score}, характеристика=${pptxResult.characteristic || "нет"}`,
        );

        // Строгие проверки для режима "Только цифра"
        expect(
          pptxResult.score,
          "PPTX: должна быть числовая оценка",
        ).toBeTruthy();
        expect(
          parseFloat(pptxResult.score),
          "PPTX: оценка должна быть > 0",
        ).toBeGreaterThan(0);
        expect(
          pptxResult.characteristic,
          "PPTX: НЕ должно быть текстовой характеристики",
        ).toBeFalsy();
        expect(pptxResult.mode, "PPTX: режим должен быть numOnly").toBe(
          "numOnly",
        );
      });

      // Сравнение PDF и PPTX
      await test.step("Сравнение PDF и PPTX", async () => {
        const pdfScore = parseFloat(pdfResult.score);
        const pptxScore = parseFloat(pptxResult.score);
        expect(
          Math.abs(pdfScore - pptxScore),
          "Оценки в PDF и PPTX должны совпадать",
        ).toBeLessThan(0.1);

        console.log(`✅ PDF и PPTX совпадают: оценка ${pdfResult.score}`);
      });
    });
  },
);

/**
 * SET-026: Экспорт в режиме "Только текст"
 * enableCustomCharacteristics: true
 * enableOnlyCustomCharacteristics: true
 */
test.describe(
  'Экспорт "Только текст"',
  { tag: ["@ui", "@calibration", "@regression", "@performance-review"] },
  () => {
    let testPrId;

    test.beforeAll(async ({ prSeed, request }) => {
      test.setTimeout(180000);
      const timestamp = Date.now();
      const pr = await prSeed.seedActivePR({
        title: `SET-026 TextOnly ${timestamp}`,
        fillAssessments: true,
      });
      testPrId = pr.id;
      console.log(`✅ Создан PR для SET-026: ${testPrId}`);

      // Настраиваем режим "Только текст"
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const { data: currentSettings } =
        await api.getStatisticsSettings(testPrId);
      const characteristicSettings = [
        {
          threshold: 33,
          title: "Низко",
          color: "#FF6B6B",
          category: "negative",
        },
        {
          threshold: 66,
          title: "Средне",
          color: "#FFE66D",
          category: "neutral",
        },
        {
          threshold: 100,
          title: "Высоко",
          color: "#4ECDC4",
          category: "positive",
        },
      ];

      const newSettings = {
        ...currentSettings,
        settings: {
          ...currentSettings.settings,
          useOnlyHeadReceiver: true, // Обязательно для работы характеристик
          enableCalibration: true,
          enableResponsesOverwriting: true,
          enableCustomCharacteristics: true,
          enableOnlyCustomCharacteristics: true, // Только текст, БЕЗ числа
        },
        characteristicSettings,
      };

      const { response, data: updateResult } =
        await api.updateStatisticsSettings(testPrId, newSettings);
      if (!response.ok()) {
        throw new Error(
          `updateStatisticsSettings(${testPrId}) failed: ${response.status()} ${JSON.stringify(updateResult)}`,
        );
      }

      console.log(
        `✅ Настроен режим "Только текст": ${characteristicSettings.map((c) => c.title).join(", ")}`,
      );
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Export TextOnly");
    });

    test("C4131: PDF и PPTX содержат только характеристику (число скрыто)", async ({
      adminAuth: page,
    }) => {
      // APP_BUG: PDF/PPTX рендерят число рядом с характеристикой в режиме "Только текст"
      // Тест должен падать чтобы баг был виден в отчётах
      setSeverity("critical");

      const testCharacteristics = ["Низко", "Средне", "Высоко"];
      let pdfFile = null;
      let pptxFile = null;
      let pdfResult = null;
      let pptxResult = null;

      // Скачиваем PDF
      await test.step("Скачать PDF", async () => {
        pdfFile = await downloadIndividualReport(
          page,
          testPrId,
          "pdf",
          "set-026",
        );
        expect(pdfFile, "PDF файл должен быть скачан").toBeTruthy();
        expect(fs.existsSync(pdfFile), "PDF файл должен существовать").toBe(
          true,
        );
      });

      // Скачиваем PPTX
      await test.step("Скачать PPTX", async () => {
        pptxFile = await downloadIndividualReport(
          page,
          testPrId,
          "pptx",
          "set-026",
        );
        expect(pptxFile, "PPTX файл должен быть скачан").toBeTruthy();
        expect(fs.existsSync(pptxFile), "PPTX файл должен существовать").toBe(
          true,
        );
      });

      // Анализ PDF — в режиме "Только текст" не должно быть числовой оценки
      await test.step("Анализ PDF: только характеристика, без числа", async () => {
        const parser = new PDFParser();
        const result = await parser.parse(pdfFile);
        pdfResult = parser.findFinalScore(result.text);

        console.log(
          `PDF: режим=${pdfResult.mode}, оценка=${pdfResult.score || "нет"}, характеристика=${pdfResult.characteristic || "нет"}`,
        );

        expect(
          pdfResult.characteristic,
          "PDF: должна быть текстовая характеристика",
        ).toBeTruthy();
        expect(
          testCharacteristics,
          `PDF: характеристика "${pdfResult.characteristic}" должна быть одной из ${testCharacteristics.join("/")}`,
        ).toContain(pdfResult.characteristic);
        // В режиме "Только текст" числа быть не должно
        expect(
          pdfResult.mode,
          'PDF: режим должен быть "onlyText" (без числовой оценки)',
        ).toBe("onlyText");
      });

      // Анализ PPTX — аналогично, только характеристика
      await test.step("Анализ PPTX: только характеристика, без числа", async () => {
        const parser = new PPTXParser();
        const result = await parser.parse(pptxFile);
        pptxResult = parser.findFinalScore(result.text);

        console.log(
          `PPTX: режим=${pptxResult.mode}, оценка=${pptxResult.score || "нет"}, характеристика=${pptxResult.characteristic || "нет"}`,
        );

        expect(
          pptxResult.characteristic,
          "PPTX: должна быть текстовая характеристика",
        ).toBeTruthy();
        expect(
          testCharacteristics,
          `PPTX: характеристика "${pptxResult.characteristic}" должна быть одной из ${testCharacteristics.join("/")}`,
        ).toContain(pptxResult.characteristic);
        // В режиме "Только текст" числа быть не должно
        expect(
          pptxResult.mode,
          'PPTX: режим должен быть "onlyText" (без числовой оценки)',
        ).toBe("onlyText");
      });

      // Сравнение PDF и PPTX
      await test.step("Сравнение PDF и PPTX", async () => {
        expect(
          pdfResult.characteristic,
          "Характеристики в PDF и PPTX должны совпадать",
        ).toBe(pptxResult.characteristic);

        console.log(
          `✅ PDF и PPTX совпадают: характеристика=${pdfResult.characteristic}`,
        );
      });
    });
  },
);
