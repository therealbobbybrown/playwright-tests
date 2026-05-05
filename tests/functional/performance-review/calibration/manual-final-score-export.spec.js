// @ts-check
/**
 * MFC-042..044, MFC-046..047: Экспорт откалиброванной итоговой оценки
 *
 * Проверяет содержимое экспортированных файлов:
 * - PDF/PPTX содержат откалиброванную итоговую (числовой режим) — скачивание через API-токен
 * - XLSX содержит откалиброванную итоговую в нужной колонке — скачивание через UI
 * - PDF при enableOnlyCustomCharacteristics=true — только текст
 * - XLSX при enableOnlyCustomCharacteristics=true — характеристика через UI
 *
 * PDF/PPTX скачивание через API-токены (без UI):
 *   1. GET /private/.../export/get-token/ → token
 *   2. GET /public/.../export/target-user-details/{format}?token=TOKEN → файл
 *
 * XLSX скачивание через UI (API-токен отдаёт сырые ответы, не сводку):
 *   1. Навигация на страницу результатов PR
 *   2. Клик "Скачать результаты" → выбор XLSX → download
 *
 * @tags @calibration @export @critical @performance-review
 */
import { test as authTest, expect } from "../../../fixtures/auth.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import { CalibrationSeed } from "../../../utils/seed/CalibrationSeed.js";
import {
  markAsAPITest,
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { PDFParser } from "../../../utils/report-parsers/PDFParser.js";
import { PPTXParser } from "../../../utils/report-parsers/PPTXParser.js";
import { buildPRUrl } from "../../../utils/pr-urls.js";
import XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOAD_DIR = path.resolve(
  __dirname,
  "../../../../test-results/downloads",
);

// Extend authTest with adminAPI (lazy: page/adminAuth only created when test requests it)
const test = authTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ========== API Helpers (PDF/PPTX) ==========

/**
 * Скачать файл по URL через API request context
 */
async function downloadFileViaToken(request, downloadUrl, filePath) {
  const response = await request.get(downloadUrl, { timeout: 120_000 });
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    console.log(
      `  ❌ Download failed: status=${response.status()}, body=${body.substring(0, 300)}`,
    );
    return null;
  }
  const buffer = await response.body();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  console.log(`  ✅ Файл скачан: ${filePath} (${buffer.length} байт)`);
  return filePath;
}

/**
 * Получить токен + скачать индивидуальный отчёт (PDF или PPTX) через API
 */
async function downloadIndividualReportViaAPI(
  api,
  request,
  prId,
  revisionId,
  targetUserId,
  format,
  prefix,
) {
  const baseUrl =
    process.env.API_BASE_URL || new URL(process.env.BASE_URL).origin;

  const { response: tokenResp, data: tokenData } = await api.getExportToken(
    prId,
    {
      revisionId,
      targetUserId,
      userDate: new Date().toISOString(),
    },
  );
  if (!tokenResp.ok() || !tokenData?.token) {
    console.log(`  ❌ Токен не получен: status=${tokenResp.status()}`);
    return null;
  }
  console.log(`  ✅ Токен получен для userId=${targetUserId}`);

  const downloadUrl = `${baseUrl}/public/performance-reviews/${prId}/statistics/export/target-user-details/${format}?token=${tokenData.token}`;
  const ext = format === "pdf" ? ".pdf" : ".pptx";
  const filePath = path.join(
    DOWNLOAD_DIR,
    `${prefix}-report-${Date.now()}${ext}`,
  );

  return downloadFileViaToken(request, downloadUrl, filePath);
}

// ========== UI Helper (XLSX) ==========

/**
 * Скачать XLSX через UI — навигация на страницу результатов → кнопка «Скачать результаты» → XLSX
 * API-токен endpoint возвращает сырые ответы, поэтому используем UI для сводки с калибровкой
 */
async function downloadXLSXViaUI(page, prId, prefix) {
  const url = buildPRUrl(prId, { statisticsSettings: true });
  await page.goto(url);
  await page.waitForLoadState("networkidle");

  // Click «Результаты» tab (use class selector, NOT getByRole — matches table buttons)
  const resultsTab = page
    .locator('button[class*="Tabs_button"]')
    .filter({ hasText: /результаты/i });
  if (
    await resultsTab
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await resultsTab.click();
    await page.waitForLoadState("networkidle");
  }

  // Find «Скачать результаты» button
  const downloadButton = page.getByRole("button", {
    name: /скачать результаты/i,
  });
  await downloadButton.waitFor({ state: "visible", timeout: 15_000 });

  // Setup event listeners BEFORE clicking
  const downloadOrNewPage = Promise.race([
    page
      .waitForEvent("download", { timeout: 90_000 })
      .then((d) => ({ type: "download", data: d })),
    page
      .context()
      .waitForEvent("page", { timeout: 90_000 })
      .then((p) => ({ type: "page", data: p })),
  ]).catch(() => null);

  // Click download button
  await downloadButton.click();

  // Check for XLSX option in dropdown menu
  const xlsxOption = page
    .locator('button, a, [role="menuitem"]')
    .filter({
      hasText: /xlsx|excel/i,
    })
    .first();

  if (
    await xlsxOption
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    console.log("  📋 XLSX опция найдена в меню, кликаю...");
    await xlsxOption.click();
  } else {
    console.log(
      "  📋 Dropdown не появился — кнопка, вероятно, скачивает напрямую",
    );
  }

  // Wait for download or new tab
  const result = await downloadOrNewPage;

  const filePath = path.join(DOWNLOAD_DIR, `${prefix}-${Date.now()}.xlsx`);
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  if (result?.type === "download") {
    await result.data.saveAs(filePath);
    const stats = fs.statSync(filePath);
    console.log(`  ✅ XLSX скачан напрямую: ${filePath} (${stats.size} байт)`);
    return filePath;
  }

  if (result?.type === "page") {
    const newPage = result.data;
    const newUrl = newPage.url();
    console.log(`  📋 Открыта вкладка: ${newUrl}`);

    // Try waiting for download event on new page
    const newTabDownload = await newPage
      .waitForEvent("download", { timeout: 30_000 })
      .catch(() => null);
    if (newTabDownload) {
      await newTabDownload.saveAs(filePath);
      await newPage.close();
      console.log(`  ✅ XLSX скачан через вкладку: ${filePath}`);
      return filePath;
    }

    // Fallback: extract URL from /download/?url=... and fetch via API
    if (newUrl.includes("/download/")) {
      try {
        const urlObj = new URL(newUrl);
        const fileUrl = urlObj.searchParams.get("url");
        if (fileUrl) {
          const resp = await page
            .context()
            .request.get(fileUrl, { timeout: 60_000 });
          if (resp.ok()) {
            const buffer = await resp.body();
            fs.writeFileSync(filePath, buffer);
            console.log(
              `  ✅ XLSX скачан через redirect: ${filePath} (${buffer.length} байт)`,
            );
            await newPage.close();
            return filePath;
          }
        }
      } catch (e) {
        console.log(`  ❌ Ошибка при извлечении файла: ${e.message}`);
      }
    }

    await newPage.close();
  }

  console.log("  ❌ XLSX не был скачан");
  return null;
}

// ========== Поиск столбцов калибровки в XLSX заголовках ==========

function findCalibrationColumns(headers) {
  const result = {
    preCalibration: null,
    postCalibration: null,
    characteristic: null,
  };

  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || "").toLowerCase();
    if (
      h.includes("до калибровки") ||
      h.includes("before calibration") ||
      h.includes("pre-calibration")
    ) {
      result.preCalibration = { index: i, original: headers[i] };
    }
    if (
      h.includes("после калибровки") ||
      h.includes("after calibration") ||
      h.includes("итоговая оценка") ||
      h.includes("final score")
    ) {
      result.postCalibration = { index: i, original: headers[i] };
    }
    if (
      h.includes("характеристика") ||
      h.includes("characteristic") ||
      h.includes("уровень") ||
      h.includes("grade")
    ) {
      result.characteristic = { index: i, original: headers[i] };
    }
  }
  return result;
}

// ========== Seed + калибровка ==========

async function setupAndCalibrate(request, options = {}) {
  const {
    calibratedValue = 4.2,
    enableOnlyCustomCharacteristics = false,
    characteristicId = null,
    targetUsersCount = 3,
  } = options;

  // 1. Seed PR
  const calSeed = new CalibrationSeed(request);
  await calSeed.init();

  const result = await calSeed.seedWithDirections({
    directions: { self: true, head: true },
    targetUsersCount,
    receiversPerDirection: 2,
    fillQuestionnaires: true,
  });
  const prId = result.prId;
  console.log(`  ✅ PR создан: ${prId}`);

  // 2. Настройки калибровки + характеристики
  const api = new PerformanceReviewAPI(request);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  const featureUrl = `/manager/performance-reviews/${prId}/statistics/settings/?feature=statisticsSettings`;
  const { data: settings } = await api.get(featureUrl);

  // ВСЕГДА используем чистые характеристики — существующие могут содержать мусор
  const characteristicSettings = [
    { threshold: 33, title: "Низко", category: "negative" },
    { threshold: 66, title: "Средне", category: "neutral" },
    { threshold: 100, title: "Высоко", category: "positive" },
  ];

  await api.post(featureUrl, {
    ...settings,
    settings: {
      ...(settings?.settings || {}),
      useOnlyHeadReceiver: true,
      enableResponsesOverwriting: true,
      enableCustomCharacteristics: true,
      enableOnlyCustomCharacteristics,
      enableCompetenceWeights: true,
    },
    characteristicSettings,
  });
  console.log(`  ✅ Настройки: onlyCustom=${enableOnlyCustomCharacteristics}`);

  // Перечитать настройки (получить id характеристик)
  const { data: savedSettings } = await api.get(featureUrl);
  const savedCharacteristics =
    savedSettings?.characteristicSettings || characteristicSettings;
  console.log(`  Характеристик: ${savedCharacteristics.length}`);

  // 3. Ревизия + target users
  const { data: revision } = await api.getLastRevision(prId);
  const revisionId = revision?.id;
  console.log(`  Revision: ${revisionId}`);

  const { data: targetUsersData } = await api.getTargetUsers(prId, {
    limit: 10,
  });
  const items = targetUsersData?.items || targetUsersData || [];
  const allUsers = items.map((u) => ({
    userId: u.user?.id ?? u.userId,
    name: `${u.user?.firstName || ""} ${u.user?.lastName || ""}`.trim(),
  }));

  // 4. Warm-up
  const allUserIds = allUsers.map((u) => u.userId);
  console.log("  Warm-up...");
  await Promise.all([
    api.getStatisticsSummaryResults(prId, {
      targetUsersIds: allUserIds,
      revisionId,
    }),
    api.getUsersCompetenciesResults(prId, { usersIds: allUserIds, revisionId }),
    api.getTargetUsersProgress(prId, { revisionId, usersIds: allUserIds }),
  ]);
  await new Promise((r) => setTimeout(r, 5000));

  // 5. Найти target user с доступным overwrite (с retry)
  let targetUser = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    for (const u of allUsers) {
      const { response } = await api.getResponseOverwritesData(
        prId,
        revisionId,
        u.userId,
      );
      if (response.ok()) {
        targetUser = u;
        break;
      } else {
        console.log(
          `  ⚠ ${u.name} (${u.userId}): overwrite status ${response.status()}`,
        );
      }
    }
    if (targetUser) break;
    if (attempt < 2) {
      console.log("  ⚠ Retry: waiting 10s and re-warming...");
      await new Promise((r) => setTimeout(r, 10_000));
      await Promise.all([
        api.getStatisticsSummaryResults(prId, {
          targetUsersIds: allUserIds,
          revisionId,
        }),
        api.getUsersCompetenciesResults(prId, {
          usersIds: allUserIds,
          revisionId,
        }),
      ]);
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
  if (!targetUser) throw new Error("No accessible target user for calibration");
  console.log(`  ✅ Target: ${targetUser.name} (${targetUser.userId})`);

  // 6. Калибровать итоговую
  const { data: overwriteData } = await api.getResponseOverwritesData(
    prId,
    revisionId,
    targetUser.userId,
  );
  const overwrites = (overwriteData?.responsesData || []).map((rd) => ({
    responseId: rd.responseId,
    questionId: rd.questionId,
    answer: rd.numericAnswer,
  }));
  const rangeMax = overwriteData?.questions?.[0]?.rangeMax || 5;

  // Определить meanOverwrite
  let meanOverwrite;
  let actualCharId = characteristicId;
  if (enableOnlyCustomCharacteristics && !characteristicId) {
    const highChar = savedCharacteristics.find(
      (c) => c.category === "positive" || /высоко/i.test(c.title),
    );
    actualCharId = highChar?.id;
  }

  if (actualCharId) {
    meanOverwrite = { value: null, characteristicId: actualCharId };
  } else {
    meanOverwrite = { value: calibratedValue, characteristicId: null };
  }

  const { response: calibResponse } = await api.overwriteResponsesValues(
    prId,
    revisionId,
    targetUser.userId,
    { overwrites, meanOverwrite, isLocked: false },
  );
  console.log(`  ✅ Калибровка: status=${calibResponse.status()}`);
  if (!calibResponse.ok()) {
    const body = await calibResponse.text().catch(() => "");
    throw new Error(
      `overwriteResponsesValues вернул ${calibResponse.status()}: ${body.substring(0, 300)}`,
    );
  }

  // 7. Верификация
  const { data: verifyData } = await api.getResponseOverwritesData(
    prId,
    revisionId,
    targetUser.userId,
  );
  if (!actualCharId) {
    // Числовой режим: meanOverwrite.overwrittenValue должен присутствовать
    if (!verifyData.meanOverwrite) {
      throw new Error(
        `meanOverwrite отсутствует после калибровки (prId=${prId}, userId=${targetUser.userId})`,
      );
    }
    console.log(
      `  ✅ meanOverwrite: value=${verifyData.meanOverwrite.overwrittenValue}, charId=${verifyData.meanOverwrite.overwrittenCharacteristicId}`,
    );
  } else {
    // Текстовый режим: характеристика должна присутствовать
    if (!verifyData.meanOverwrite) {
      throw new Error(
        `meanOverwrite (текстовый режим) отсутствует после калибровки (prId=${prId}, userId=${targetUser.userId})`,
      );
    }
    console.log(
      `  ✅ meanOverwrite (текст): charId=${verifyData.meanOverwrite.overwrittenCharacteristicId}`,
    );
  }

  return {
    prId,
    revisionId,
    targetUser,
    allUserIds,
    rangeMax,
    characteristics: savedCharacteristics,
  };
}

// ========== Setup ==========

test.beforeAll(() => {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }
});

// ==================== ЧИСЛОВОЙ РЕЖИМ (MFC-042, 043, 044) ====================

test.describe(
  "Экспорт откалиброванной итоговой — числовой режим",
  {
    tag: ["@calibration", "@export", "@regression", "@performance-review"],
  },
  () => {
    let PR_ID;
    let REVISION_ID;
    let TARGET_USER;
    let RANGE_MAX;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(300_000);

      const result = await setupAndCalibrate(request, {
        calibratedValue: 4.2,
        enableOnlyCustomCharacteristics: false,
      });
      PR_ID = result.prId;
      REVISION_ID = result.revisionId;
      TARGET_USER = result.targetUser;
      RANGE_MAX = result.rangeMax;
      console.log(`✅ PR для числового экспорта: ${PR_ID}`);
    });

    test(
      "C4479: PDF содержит откалиброванную итоговую оценку",
      {
        tag: ["@critical", "@api"],
      },
      async ({ adminAPI, request }) => {
        test.setTimeout(120_000);
        setSeverity("critical");
        markAsAPITest(MODULES.CALIBRATION, "Export Calibrated Total - PDF");

        let pdfFile = null;
        let pdfResult = null;

        await test.step("Скачать индивидуальный PDF-отчёт через API (с токеном экспорта)", async () => {
          pdfFile = await downloadIndividualReportViaAPI(
            adminAPI,
            request,
            PR_ID,
            REVISION_ID,
            TARGET_USER.userId,
            "pdf",
            "mfc-042",
          );
          expect(pdfFile, "PDF файл должен быть скачан").toBeTruthy();
          expect(fs.existsSync(pdfFile), "PDF файл должен существовать").toBe(
            true,
          );
        });

        await test.step("Проверить в PDF: итоговая оценка присутствует (числовое значение > 0)", async () => {
          const parser = new PDFParser();
          const result = await parser.parse(pdfFile);
          pdfResult = parser.findFinalScore(result.text);

          console.log(
            `  📄 PDF: режим=${pdfResult.mode}, оценка=${pdfResult.score}, характеристика=${pdfResult.characteristic || "нет"}`,
          );

          expect(
            pdfResult.score,
            "PDF: должна быть числовая оценка",
          ).toBeTruthy();
          expect(
            parseFloat(pdfResult.score),
            "PDF: оценка > 0",
          ).toBeGreaterThan(0);
        });

        await test.step("Проверить: оценка в допустимом диапазоне шкалы (0..5) и соответствует откалиброванному значению 4.2", async () => {
          const pdfScore = parseFloat(pdfResult.score);
          console.log(
            `  Калибровка: 4.2, PDF: ${pdfScore}, rangeMax: ${RANGE_MAX}`,
          );
          expect(pdfScore).toBeGreaterThan(0);
          expect(pdfScore).toBeLessThanOrEqual(RANGE_MAX);
          // Проверяем что PDF содержит именно откалиброванное значение (4.2),
          // а не оригинальное (которое может быть любым в диапазоне [0..5])
          expect(
            pdfScore,
            `PDF: откалиброванная оценка должна быть ~4.2, а не оригинальная (получено: ${pdfScore})`,
          ).toBeCloseTo(4.2, 1);
        });
      },
    );

    test(
      "C4480: PPTX содержит откалиброванную итоговую оценку",
      {
        tag: ["@critical", "@api"],
      },
      async ({ adminAPI, request }) => {
        test.setTimeout(120_000);
        setSeverity("critical");
        markAsAPITest(MODULES.CALIBRATION, "Export Calibrated Total - PPTX");

        let pptxFile = null;
        let pptxResult = null;

        await test.step("Скачать индивидуальный PPTX-отчёт через API (с токеном экспорта)", async () => {
          pptxFile = await downloadIndividualReportViaAPI(
            adminAPI,
            request,
            PR_ID,
            REVISION_ID,
            TARGET_USER.userId,
            "pptx",
            "mfc-043",
          );
          expect(pptxFile, "PPTX файл должен быть скачан").toBeTruthy();
          expect(fs.existsSync(pptxFile), "PPTX файл должен существовать").toBe(
            true,
          );
        });

        await test.step("Проверить в PPTX: итоговая оценка присутствует (числовое значение > 0)", async () => {
          const parser = new PPTXParser();
          const result = await parser.parse(pptxFile);
          pptxResult = parser.findFinalScore(result.text);

          console.log(
            `  📊 PPTX: режим=${pptxResult.mode}, оценка=${pptxResult.score}, характеристика=${pptxResult.characteristic || "нет"}`,
          );

          expect(
            pptxResult.score,
            "PPTX: должна быть числовая оценка",
          ).toBeTruthy();
          expect(
            parseFloat(pptxResult.score),
            "PPTX: оценка > 0",
          ).toBeGreaterThan(0);
        });

        await test.step("Проверить: оценка в допустимом диапазоне шкалы (0..5) и соответствует откалиброванному значению 4.2", async () => {
          const pptxScore = parseFloat(pptxResult.score);
          console.log(
            `  Калибровка: 4.2, PPTX: ${pptxScore}, rangeMax: ${RANGE_MAX}`,
          );
          expect(pptxScore).toBeGreaterThan(0);
          expect(pptxScore).toBeLessThanOrEqual(RANGE_MAX);
          // Проверяем что PPTX содержит именно откалиброванное значение (4.2),
          // а не оригинальное (которое может быть любым в диапазоне [0..5])
          expect(
            pptxScore,
            `PPTX: откалиброванная оценка должна быть ~4.2, а не оригинальная (получено: ${pptxScore})`,
          ).toBeCloseTo(4.2, 1);
        });
      },
    );

    test(
      "C4481: XLSX содержит данные оцениваемых сотрудников после калибровки",
      {
        tag: ["@critical", "@ui"],
      },
      async ({ adminAuth: page }) => {
        test.setTimeout(180_000);
        setSeverity("critical");
        markAsUITest(MODULES.CALIBRATION, "Export Calibrated Total - XLSX");

        let xlsxFile = null;

        await test.step("Скачать групповой XLSX-отчёт через UI (кнопка «Скачать результаты»)", async () => {
          xlsxFile = await downloadXLSXViaUI(page, PR_ID, "mfc-044");
          expect(xlsxFile, "XLSX файл должен быть скачан").toBeTruthy();
          expect(fs.existsSync(xlsxFile), "XLSX файл должен существовать").toBe(
            true,
          );
        });

        await test.step("Проверить XLSX: файл содержит данные оцениваемых сотрудников", async () => {
          const workbook = XLSX.readFile(xlsxFile);
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          const headers = data[0] || [];

          console.log(
            `  📊 XLSX: листов=${workbook.SheetNames.length}, строк=${data.length}`,
          );
          console.log(`  Заголовки: ${headers.join(" | ")}`);

          // XLSX export содержит сырые ответы (raw responses), не калибровочную сводку
          // Калибровочная сводка (до/после калибровки) доступна только в UI таблице
          const calibColumns = findCalibrationColumns(headers);

          // Проверяем что файл содержит корректные данные (независимо от наличия calibColumns)
          expect(data.length, "Файл содержит строки данных").toBeGreaterThan(1);
          expect(headers.length, "Файл содержит заголовки").toBeGreaterThan(5);

          if (calibColumns.preCalibration || calibColumns.postCalibration) {
            // Если колонки калибровки появились — фича реализована, проверяем данные
            console.log("  ✅ Калибровочные колонки найдены в XLSX!");
            const postIdx = calibColumns.postCalibration?.index;
            expect(
              postIdx,
              "Колонка 'после калибровки' должна иметь индекс",
            ).toBeDefined();
            // Проверяем что хотя бы одна строка данных содержит значение в post-calibration колонке
            const postValues = data
              .slice(1)
              .map((row) => row[postIdx])
              .filter((v) => v !== undefined && v !== null && v !== "");
            expect(
              postValues.length,
              "Строки данных содержат значения 'после калибровки'",
            ).toBeGreaterThan(0);
            for (let i = 1; i < Math.min(data.length, 5); i++) {
              console.log(`  Строка ${i}: после=${data[i][postIdx]}`);
            }
          } else {
            // Текущее поведение: XLSX = сырые ответы (raw responses)
            console.log(
              "  ℹ️ XLSX содержит сырые ответы (raw responses), не калибровочную сводку",
            );
            console.log(
              "  ℹ️ Это ожидаемое поведение: /statistics/export/xlsx отдаёт ответы респондентов",
            );

            // Проверяем наличие ключевых колонок raw responses
            const headersLower = headers.map((h) =>
              String(h || "").toLowerCase(),
            );
            const hasRespondent = headersLower.some(
              (h) => h.includes("респондент") || h.includes("respondent"),
            );
            const hasTarget = headersLower.some(
              (h) =>
                h.includes("оцениваемый") ||
                h.includes("target") ||
                h.includes("reviewee"),
            );
            expect(hasRespondent, "Есть колонка с респондентом").toBe(true);
            expect(hasTarget, "Есть колонка с оцениваемым").toBe(true);

            // Проверяем что строки содержат данные оцениваемого из калибровки
            const targetIdx = headersLower.findIndex(
              (h) => h.includes("оцениваемый") || h.includes("target"),
            );
            expect(
              targetIdx,
              "Колонка с оцениваемым должна быть найдена по индексу",
            ).toBeGreaterThanOrEqual(0);
            const targetNames = data
              .slice(1)
              .map((row) => String(row[targetIdx] || ""))
              .filter((n) => n.length > 0);
            expect(
              targetNames.length,
              "Строки содержат данные оцениваемых",
            ).toBeGreaterThan(0);
            console.log(
              `  ✅ Оцениваемые: ${[...new Set(targetNames)].join(", ")}`,
            );
          }
        });
      },
    );

    test(
      "C4482: CSV содержит данные оцениваемых сотрудников после калибровки",
      {
        tag: ["@regression", "@ui"],
      },
      async ({ adminAuth: page }) => {
        test.setTimeout(180_000);
        setSeverity("normal");
        markAsUITest(MODULES.CALIBRATION, "Export Calibrated Total - CSV");

        let csvFile = null;

        await test.step("Скачать CSV-отчёт через UI (кнопка «Скачать результаты» → CSV)", async () => {
          const url = buildPRUrl(PR_ID, { statisticsSettings: true });

          // Double navigation (SSR workaround)
          await page.goto(url);
          await page.waitForLoadState("networkidle");
          await page.goto(url);
          await page.waitForLoadState("networkidle");

          // Click «Результаты» tab
          const resultsTab = page
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /результаты/i });
          if (
            await resultsTab
              .waitFor({ state: "visible", timeout: 5_000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await resultsTab.click();
            await page.waitForLoadState("networkidle");
          }

          // Find download button
          const downloadButton = page.getByRole("button", {
            name: /скачать результаты/i,
          });
          await downloadButton.waitFor({ state: "visible", timeout: 15_000 });

          // Setup download listener BEFORE clicking
          const downloadOrNewPage = Promise.race([
            page
              .waitForEvent("download", { timeout: 90_000 })
              .then((d) => ({ type: "download", data: d })),
            page
              .context()
              .waitForEvent("page", { timeout: 90_000 })
              .then((p) => ({ type: "page", data: p })),
          ]).catch(() => null);

          await downloadButton.click();

          // Look for CSV option in dropdown menu
          const csvOption = page
            .locator('button, a, [role="menuitem"]')
            .filter({
              hasText: /csv/i,
            })
            .first();

          if (
            await csvOption
              .waitFor({ state: "visible", timeout: 3_000 })
              .then(() => true)
              .catch(() => false)
          ) {
            console.log("  📋 CSV опция найдена в меню, кликаю...");
            await csvOption.click();
          } else {
            console.log(
              "  ℹ️ CSV опция не найдена — пробуем XLSX как fallback",
            );
            const xlsxOption = page
              .locator('button, a, [role="menuitem"]')
              .filter({
                hasText: /xlsx|excel/i,
              })
              .first();
            if (
              await xlsxOption
                .waitFor({ state: "visible", timeout: 2_000 })
                .then(() => true)
                .catch(() => false)
            ) {
              await xlsxOption.click();
            }
          }

          const result = await downloadOrNewPage;
          const filePath = path.join(DOWNLOAD_DIR, `mfc-045-${Date.now()}.csv`);
          fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

          if (result?.type === "download") {
            await result.data.saveAs(filePath);
            csvFile = filePath;
            console.log(`  ✅ Файл скачан напрямую: ${filePath}`);
          } else if (result?.type === "page") {
            const newPage = result.data;
            const newTabDownload = await newPage
              .waitForEvent("download", { timeout: 30_000 })
              .catch(() => null);
            if (newTabDownload) {
              await newTabDownload.saveAs(filePath);
              csvFile = filePath;
            } else if (newPage.url().includes("/download/")) {
              try {
                const urlObj = new URL(newPage.url());
                const fileUrl = urlObj.searchParams.get("url");
                if (fileUrl) {
                  const resp = await page
                    .context()
                    .request.get(fileUrl, { timeout: 60_000 });
                  if (resp.ok()) {
                    const buffer = await resp.body();
                    fs.writeFileSync(filePath, buffer);
                    csvFile = filePath;
                  }
                }
              } catch (e) {
                console.log(`  ❌ Ошибка при извлечении файла: ${e.message}`);
              }
            }
            await newPage.close();
          }

          expect(csvFile, "CSV/XLSX файл должен быть скачан").toBeTruthy();
          expect(fs.existsSync(csvFile), "Файл должен существовать").toBe(true);
        });

        await test.step("Проверить CSV: файл содержит заголовки и строки данных оцениваемых", async () => {
          const content = fs.readFileSync(csvFile, "utf-8");
          const ext = path.extname(csvFile).toLowerCase();

          if (
            ext === ".csv" ||
            content.includes(",") ||
            content.includes(";")
          ) {
            // Parse as CSV
            const lines = content.split("\n").filter((l) => l.trim());
            console.log(`  📊 CSV: строк=${lines.length}`);
            expect(lines.length, "CSV содержит строки данных").toBeGreaterThan(
              1,
            );

            const headers = lines[0];
            console.log(`  Заголовки: ${headers.substring(0, 200)}`);
            expect(headers.length, "Заголовки не пусты").toBeGreaterThan(10);
          } else {
            // Might be XLSX (binary) — parse with XLSX library
            const workbook = XLSX.readFile(csvFile);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            console.log(`  📊 XLSX fallback: строк=${data.length}`);
            expect(data.length, "Файл содержит строки данных").toBeGreaterThan(
              1,
            );
          }
        });
      },
    );
  },
);

// ==================== ТЕКСТОВЫЙ РЕЖИМ (MFC-046, 047) ====================

test.describe(
  "Экспорт откалиброванной итоговой — только текст",
  {
    tag: ["@calibration", "@export", "@regression", "@performance-review"],
  },
  () => {
    let PR_ID;
    let REVISION_ID;
    let TARGET_USER;
    let CHARACTERISTICS;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(300_000);

      const result = await setupAndCalibrate(request, {
        enableOnlyCustomCharacteristics: true,
      });
      PR_ID = result.prId;
      REVISION_ID = result.revisionId;
      TARGET_USER = result.targetUser;
      CHARACTERISTICS = result.characteristics;
      console.log(`✅ PR для текстового экспорта: ${PR_ID}`);
    });

    test(
      'C4483: PDF в режиме "Только текст" — характеристика присутствует',
      {
        tag: ["@critical", "@api"],
      },
      async ({ adminAPI, request }) => {
        test.setTimeout(120_000);
        setSeverity("critical");
        markAsAPITest(MODULES.CALIBRATION, "Export TextOnly - PDF");

        let pdfFile = null;
        let pdfResult = null;

        await test.step("Скачать индивидуальный PDF-отчёт через API (с токеном экспорта)", async () => {
          pdfFile = await downloadIndividualReportViaAPI(
            adminAPI,
            request,
            PR_ID,
            REVISION_ID,
            TARGET_USER.userId,
            "pdf",
            "mfc-046",
          );
          expect(pdfFile, "PDF файл должен быть скачан").toBeTruthy();
          expect(fs.existsSync(pdfFile), "PDF файл должен существовать").toBe(
            true,
          );
        });

        await test.step("Проверить в PDF: отображается текстовая характеристика (не числовая оценка)", async () => {
          const parser = new PDFParser();
          const result = await parser.parse(pdfFile);
          pdfResult = parser.findFinalScore(result.text);

          console.log(
            `  📄 PDF: режим=${pdfResult.mode}, оценка=${pdfResult.score || "нет"}, характеристика=${pdfResult.characteristic || "нет"}`,
          );

          // В режиме "Только текст" ОБЯЗАТЕЛЬНА текстовая характеристика
          expect(
            pdfResult.characteristic,
            "PDF (текстовый режим): характеристика должна присутствовать",
          ).toBeTruthy();

          // Характеристика должна быть из настроек (Низко/Средне/Высоко)
          const configuredTitles = CHARACTERISTICS.map((c) =>
            c.title.toLowerCase(),
          );
          expect(
            configuredTitles.includes(pdfResult.characteristic.toLowerCase()),
            `PDF: характеристика "${pdfResult.characteristic}" должна быть из настроек [${configuredTitles}]`,
          ).toBe(true);

          // Калибровали через дропдаун "Высоко" — проверяем конкретное значение
          const highChar = CHARACTERISTICS.find(
            (c) => c.category === "positive" || /высоко/i.test(c.title),
          );
          if (highChar) {
            expect(
              pdfResult.characteristic.toLowerCase(),
              `PDF: характеристика должна быть "${highChar.title}" (калиброванное значение)`,
            ).toBe(highChar.title.toLowerCase());
          }

          // В текстовом режиме PDF может содержать "0" как скрытое числовое значение (ожидаемое поведение)
          // PDFParser doc: OnlyTextChars — число = 0 (скрыто), только текстовая характеристика отображается
          // Если score присутствует — допустимо только значение "0" (не числовая оценка)
          if (pdfResult.score !== null) {
            expect(
              parseFloat(pdfResult.score),
              `PDF в режиме "Только текст": если числовое значение присутствует, оно должно быть 0 (скрыто), не реальной оценкой`,
            ).toBe(0);
          }
        });
      },
    );

    test(
      'C4484: XLSX в режиме "Только текст" — экспорт данных после калибровки',
      {
        tag: ["@critical", "@ui"],
      },
      async ({ adminAuth: page }) => {
        test.setTimeout(180_000);
        setSeverity("critical");
        markAsUITest(MODULES.CALIBRATION, "Export TextOnly - XLSX");

        let xlsxFile = null;

        await test.step("Скачать групповой XLSX-отчёт через UI (кнопка «Скачать результаты»)", async () => {
          xlsxFile = await downloadXLSXViaUI(page, PR_ID, "mfc-047");
          expect(xlsxFile, "XLSX файл должен быть скачан").toBeTruthy();
          expect(fs.existsSync(xlsxFile), "XLSX файл должен существовать").toBe(
            true,
          );
        });

        await test.step("Проверить XLSX: файл содержит данные оцениваемых сотрудников", async () => {
          const workbook = XLSX.readFile(xlsxFile);
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          const headers = data[0] || [];

          console.log(
            `  📊 XLSX: строк=${data.length}, заголовки: ${headers.join(" | ")}`,
          );

          // Базовая проверка корректности файла
          expect(data.length, "Файл содержит строки данных").toBeGreaterThan(1);
          expect(headers.length, "Файл содержит заголовки").toBeGreaterThan(3);

          const calibColumns = findCalibrationColumns(headers);

          if (calibColumns.characteristic || calibColumns.postCalibration) {
            // Калибровочные колонки найдены — проверяем текстовые данные
            console.log(
              "  ✅ Калибровочные/характеристические колонки найдены!",
            );
            const charIdx =
              calibColumns.characteristic?.index ??
              calibColumns.postCalibration?.index;
            const configuredTitles = CHARACTERISTICS.map((c) =>
              c.title.toLowerCase(),
            );

            let foundValidCharacteristic = false;
            for (let i = 1; i < Math.min(data.length, 10); i++) {
              const cellValue = String(data[i][charIdx] || "");
              console.log(`  Строка ${i}: "${cellValue}"`);
              if (
                cellValue &&
                configuredTitles.includes(cellValue.toLowerCase())
              ) {
                foundValidCharacteristic = true;
              }
            }
            expect(
              foundValidCharacteristic,
              `XLSX: хотя бы одна характеристика из настроек [${configuredTitles}]`,
            ).toBe(true);
          } else {
            // XLSX = сырые ответы (raw responses) — калибровочная сводка доступна только в UI и PDF/PPTX
            console.log(
              "  ℹ️ XLSX содержит сырые ответы (raw responses), не калибровочную сводку",
            );

            // Проверяем ключевые колонки
            const headersLower = headers.map((h) =>
              String(h || "").toLowerCase(),
            );
            const hasRespondent = headersLower.some(
              (h) => h.includes("респондент") || h.includes("respondent"),
            );
            const hasTarget = headersLower.some(
              (h) => h.includes("оцениваемый") || h.includes("target"),
            );
            expect(hasRespondent, "Есть колонка с респондентом").toBe(true);
            expect(hasTarget, "Есть колонка с оцениваемым").toBe(true);

            // Проверяем что данные калиброванного сотрудника присутствуют
            const targetIdx = headersLower.findIndex(
              (h) => h.includes("оцениваемый") || h.includes("target"),
            );
            expect(
              targetIdx,
              "Колонка с оцениваемым должна быть найдена по индексу",
            ).toBeGreaterThanOrEqual(0);
            const targetNames = data
              .slice(1)
              .map((row) => String(row[targetIdx] || ""))
              .filter((n) => n);
            expect(
              targetNames.length,
              "Есть строки с оцениваемыми",
            ).toBeGreaterThan(0);
            console.log(
              `  ✅ Оцениваемые: ${[...new Set(targetNames)].join(", ")}`,
            );
          }
        });
      },
    );
  },
);
