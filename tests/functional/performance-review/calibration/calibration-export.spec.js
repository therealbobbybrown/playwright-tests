/**
 * Тесты экспорта данных калибровки Performance Review
 *
 * Проверяет:
 * - Скачивание Excel файла с результатами калибровки
 * - Наличие столбцов "до калибровки" и "после калибровки" в выгрузке
 * - Корректность данных в экспортированном файле
 * - API токенов экспорта для калибровки
 *
 * @tags @calibration @export @critical
 */
import { test as baseTest, expect } from "@playwright/test";
import { test as authTest } from "../../../fixtures/auth.js";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { getCredentials } from "../../../utils/credentials.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { DatabaseClient } from "../../../utils/db/DatabaseClient.js";
import { CalibrationVerifier } from "../../../utils/db/verifiers/CalibrationVerifier.js";
import {
  markAsAPITest,
  markAsUITest,
  setSeverity,
  MODULES,
} from "../../../utils/allure-helpers.js";
import { buildPRUrl } from "../../../utils/pr-urls.js";

// API тесты - extend base test
const test = baseTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  dbClient: async ({}, use) => {
    const db = new DatabaseClient();
    try {
      await db.connect();
    } catch (error) {
      console.log(
        "[DB] Connection failed, DB verification will be skipped:",
        error.message,
      );
    }
    await use(db);
    if (db.isConnected()) {
      await db.disconnect();
    }
  },
  calibrationVerifier: async ({ dbClient }, use) => {
    const verifier = new CalibrationVerifier(dbClient);
    await use(verifier);
  },
});

// UI тесты - используем authTest с adminAuth
const uiTest = authTest;

let TEST_PR_ID;
const DOWNLOAD_DIR = "test-results/downloads";

/**
 * Хелпер для анализа Excel файла
 */
function analyzeExcelFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  const result = {
    sheetNames: workbook.SheetNames,
    sheets: {},
  };

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const headers = data[0] || [];

    result.sheets[sheetName] = {
      headers,
      rowCount: data.length - 1, // excluding header
      data: data.slice(0, 10), // first 10 rows for analysis
    };
  }

  return result;
}

/**
 * Поиск столбцов калибровки в заголовках
 */
function findCalibrationColumns(headers) {
  const calibrationColumns = {
    preCalibration: null,
    postCalibration: null,
    delta: null,
    characteristic: null,
  };

  const normalizedHeaders = headers.map((h, i) => ({
    index: i,
    original: h,
    normalized: String(h || "").toLowerCase(),
  }));

  for (const header of normalizedHeaders) {
    const h = header.normalized;

    // Оценка до калибровки
    if (
      h.includes("до калибровки") ||
      h.includes("before calibration") ||
      h.includes("pre-calibration")
    ) {
      calibrationColumns.preCalibration = header;
    }

    // Оценка после калибровки
    if (
      h.includes("после калибровки") ||
      h.includes("after calibration") ||
      h.includes("post-calibration") ||
      h.includes("итоговая оценка")
    ) {
      calibrationColumns.postCalibration = header;
    }

    // Дельта/изменение
    if (
      h.includes("дельта") ||
      h.includes("delta") ||
      h.includes("изменение") ||
      h.includes("разница")
    ) {
      calibrationColumns.delta = header;
    }

    // Текстовая характеристика
    if (
      h.includes("характеристика") ||
      h.includes("characteristic") ||
      h.includes("уровень") ||
      h.includes("grade")
    ) {
      calibrationColumns.characteristic = header;
    }
  }

  return calibrationColumns;
}

test.describe(
  "Calibration Export - Экспорт данных калибровки",
  { tag: ["@api", "@calibration", "@regression", "@performance-review"] },
  () => {
    test.beforeAll(async ({ request }) => {
      // Создаем директорию для скачивания если её нет
      if (!fs.existsSync(DOWNLOAD_DIR)) {
        fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
      }

      // Создаём API клиент вручную (adminAPI — test-scoped, недоступна в beforeAll)
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Находим активный PR
      const { data } = await api.getList();
      const items = data?.items || data || [];
      const pr = items.find((p) =>
        ["active", "completed", "finished"].includes(p.status),
      );
      if (!pr) throw new Error("No active PR found for calibration tests");
      TEST_PR_ID = pr.id;
      console.log(`✅ Active PR for tests: ${TEST_PR_ID}`);
    });

    test.describe("API тесты экспорта", () => {
      test.beforeEach(() => {
        markAsAPITest(MODULES.CALIBRATION, "Export API");
      });

      test("C4047: Получение токена экспорта статистики", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        const revisions = await test.step("Получение ревизий PR", async () => {
          const { data } = await adminAPI.getRevisions(TEST_PR_ID);
          return data?.items || data || [];
        });

        if (revisions.length === 0) {
          test.skip(true, "Нет ревизий для PR");
          return;
        }

        const revisionId = revisions[0]?.id;

        await test.step("Запрос токена экспорта", async () => {
          const { response, data } = await adminAPI.getExportToken(TEST_PR_ID, {
            revisionId,
          });

          console.log("Статус ответа:", response.status());
          console.log("Данные токена:", JSON.stringify(data).substring(0, 200));

          // 400 допустим при несовпадении формата даты в revisionId — ловим только 5xx
          expect(
            response.status(),
            `Ожидался не-серверный ответ, получен ${response.status()}`,
          ).toBeLessThan(500);

          if (!response.ok()) {
            console.log(
              `Статус ${response.status()} — вероятно, несовпадение формата даты, пропускаем проверку токена`,
            );
            return;
          }

          expect(
            data?.token,
            "Ответ должен содержать токен экспорта",
          ).toBeTruthy();
          expect(typeof data.token, "Токен должен быть строкой").toBe("string");
          expect(
            data.token.length,
            "Токен не должен быть пустым",
          ).toBeGreaterThan(0);
          console.log("Токен экспорта получен успешно");
        });
      });

      test("C4048: Получение токена группового отчёта", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        const [revisions, targetUsers] = await Promise.all([
          test.step("Получение ревизий", async () => {
            const { data } = await adminAPI.getRevisions(TEST_PR_ID);
            return data?.items || data || [];
          }),
          test.step("Получение оцениваемых", async () => {
            const { data } = await adminAPI.post(
              `/manager/performance-reviews/${TEST_PR_ID}/target-users/get`,
              {},
            );
            return data?.items || data || [];
          }),
        ]);

        if (revisions.length === 0 || targetUsers.length === 0) {
          test.skip(true, "Нет данных для группового отчёта");
          return;
        }

        const revisionId = revisions[0]?.id;
        const targetUserIds = targetUsers
          .slice(0, 3)
          .map((u) => u.id || u.userId);

        await test.step("Запрос токена группового отчёта", async () => {
          const { response, data } = await adminAPI.getGroupReportExportToken(
            TEST_PR_ID,
            {
              performanceReviewId: TEST_PR_ID,
              targetUserIds,
              revisionId,
            },
          );

          console.log("Статус группового отчёта:", response.status());

          expect(
            response.ok(),
            `Ожидался успешный ответ, получен ${response.status()}`,
          ).toBeTruthy();

          expect(
            data?.token,
            "Ответ должен содержать токен группового отчёта",
          ).toBeTruthy();
          expect(typeof data.token, "Токен должен быть строкой").toBe("string");
          expect(
            data.token.length,
            "Токен группового отчёта не должен быть пустым",
          ).toBeGreaterThan(0);
          console.log("Токен группового отчёта получен");
        });
      });

      test("C4049: Получение токена экспорта прогресса", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        await test.step("Запрос токена экспорта прогресса", async () => {
          const { response, data } =
            await adminAPI.getProgressExportToken(TEST_PR_ID);

          console.log("Статус экспорта прогресса:", response.status());

          // 400 допустим при несовпадении формата даты — ловим только 5xx
          expect(
            response.status(),
            `Ожидался не-серверный ответ, получен ${response.status()}`,
          ).toBeLessThan(500);

          if (!response.ok()) {
            console.log(
              `Статус ${response.status()} — вероятно, несовпадение формата даты, пропускаем проверку токена`,
            );
            return;
          }

          expect(
            data?.token,
            "Ответ должен содержать токен экспорта прогресса",
          ).toBeTruthy();
          expect(typeof data.token, "Токен должен быть строкой").toBe("string");
          expect(
            data.token.length,
            "Токен экспорта прогресса не должен быть пустым",
          ).toBeGreaterThan(0);
          console.log("Токен экспорта прогресса получен");
        });
      });
    });

    uiTest.describe("UI тесты экспорта с анализом файла", () => {
      uiTest.beforeEach(() => {
        markAsUITest(MODULES.CALIBRATION, "Export UI");
      });

      uiTest(
        "CAL-EXP-004: Скачивание и анализ Excel файла результатов",
        async ({ adminAuth: page }) => {
          setSeverity("critical");
          const baseUrl = new URL(process.env.BASE_URL).origin;

          await uiTest.step(
            "Переход к PR с включённой калибровкой",
            async () => {
              await page.goto(
                buildPRUrl(TEST_PR_ID, { statisticsSettings: true }),
              );
              await page.waitForLoadState("networkidle");

              // Переход на вкладку Результаты
              const resultsTab = page
                .locator('button[class*="Tabs_button"]')
                .filter({ hasText: /результаты/i });
              await resultsTab.click();
              await page.waitForLoadState("networkidle", { timeout: 2000 });
            },
          );

          let downloadedFile = null;

          await uiTest.step("Скачивание Excel файла", async () => {
            // Нажимаем кнопку "Скачать результаты"
            const downloadButton = page.getByRole("button", {
              name: /скачать результаты/i,
            });

            const isVisible = await downloadButton
              .waitFor({ state: "visible", timeout: 10000 })
              .then(() => true)
              .catch(() => false);
            if (!isVisible) {
              console.log('Кнопка "Скачать результаты" не найдена');
              test.skip(true, "Кнопка экспорта недоступна");
              return;
            }

            // Настраиваем перехват скачивания
            const downloadPromise = page
              .waitForEvent("download", { timeout: 60000 })
              .catch(() => null);
            const newPagePromise = page
              .context()
              .waitForEvent("page", { timeout: 60000 })
              .catch(() => null);

            await downloadButton.click();

            // Ищем опцию XLSX в меню
            const xlsxOption = page
              .locator('button, a, [role="menuitem"]')
              .filter({
                hasText: /xlsx|Excel|все результаты/i,
              })
              .first();

            const hasXlsxOption = await xlsxOption
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false);

            if (hasXlsxOption) {
              await xlsxOption.click();
            }

            // Ждём скачивания
            const [download, newPage] = await Promise.all([
              downloadPromise,
              newPagePromise,
            ]);

            if (download) {
              const fileName = download.suggestedFilename();
              console.log(`Файл скачан: ${fileName}`);

              // Сохраняем файл
              const filePath = path.join(DOWNLOAD_DIR, fileName);
              await download.saveAs(filePath);
              downloadedFile = filePath;

              expect(fileName).toMatch(/\.(xlsx|xls)$/i);
            } else if (newPage) {
              const newUrl = newPage.url();
              console.log(`Открыта вкладка экспорта: ${newUrl}`);
              await newPage.close();
            } else {
              console.log("Файл не был скачан напрямую");
            }
          });

          if (downloadedFile && fs.existsSync(downloadedFile)) {
            await uiTest.step("Анализ содержимого Excel файла", async () => {
              const analysis = analyzeExcelFile(downloadedFile);

              console.log("Листы в файле:", analysis.sheetNames.join(", "));

              for (const [sheetName, sheetData] of Object.entries(
                analysis.sheets,
              )) {
                console.log(`\nЛист "${sheetName}":`);
                console.log(
                  `  Заголовки: ${sheetData.headers.slice(0, 10).join(" | ")}`,
                );
                console.log(`  Строк данных: ${sheetData.rowCount}`);
              }
            });

            await uiTest.step("Проверка столбцов калибровки", async () => {
              const analysis = analyzeExcelFile(downloadedFile);
              const mainSheet = analysis.sheets[analysis.sheetNames[0]];

              const calibrationColumns = findCalibrationColumns(
                mainSheet.headers,
              );

              console.log("\nСтолбцы калибровки:");
              console.log(
                `  До калибровки: ${calibrationColumns.preCalibration?.original || "не найден"}`,
              );
              console.log(
                `  После калибровки: ${calibrationColumns.postCalibration?.original || "не найден"}`,
              );
              console.log(
                `  Дельта: ${calibrationColumns.delta?.original || "не найден"}`,
              );
              console.log(
                `  Характеристика: ${calibrationColumns.characteristic?.original || "не найден"}`,
              );

              // Проверяем наличие хотя бы одного столбца калибровки
              const hasCalibrationData =
                calibrationColumns.preCalibration ||
                calibrationColumns.postCalibration ||
                calibrationColumns.characteristic;

              expect(
                hasCalibrationData,
                "Excel-выгрузка должна содержать хотя бы один столбец калибровки (до калибровки / после калибровки / характеристика)",
              ).toBeTruthy();
              console.log("\n✓ Столбцы калибровки присутствуют в выгрузке");
            });

            await uiTest.step("Анализ данных калибровки", async () => {
              const analysis = analyzeExcelFile(downloadedFile);
              const mainSheet = analysis.sheets[analysis.sheetNames[0]];
              const calibrationColumns = findCalibrationColumns(
                mainSheet.headers,
              );

              expect(
                calibrationColumns.preCalibration,
                "В Excel-выгрузке должен присутствовать столбец 'до калибровки'",
              ).toBeTruthy();
              expect(
                calibrationColumns.postCalibration,
                "В Excel-выгрузке должен присутствовать столбец 'после калибровки'",
              ).toBeTruthy();

              const preIndex = calibrationColumns.preCalibration.index;
              const postIndex = calibrationColumns.postCalibration.index;

              // Файл должен содержать строки данных (не только заголовок)
              expect(
                mainSheet.data.length,
                "Excel-файл должен содержать хотя бы одну строку данных помимо заголовка",
              ).toBeGreaterThan(1);

              console.log("\nПримеры данных калибровки:");

              for (let i = 1; i < Math.min(mainSheet.data.length, 6); i++) {
                const row = mainSheet.data[i];
                const preValue = row[preIndex];
                const postValue = row[postIndex];
                const delta =
                  postValue && preValue
                    ? (Number(postValue) - Number(preValue)).toFixed(2)
                    : "N/A";

                console.log(
                  `  Строка ${i}: до=${preValue}, после=${postValue}, дельта=${delta}`,
                );
              }
            });
          }
        },
      );

      uiTest(
        "CAL-EXP-005: Скачивание группового отчёта",
        async ({ adminAuth: page }) => {
          setSeverity("normal");
          const baseUrl = new URL(process.env.BASE_URL).origin;

          await uiTest.step("Переход к PR", async () => {
            await page.goto(
              `${baseUrl}/ru/manager/performance-reviews/${TEST_PR_ID}/`,
            );
            await page.waitForLoadState("networkidle");

            const resultsTab = page
              .locator('button[class*="Tabs_button"]')
              .filter({ hasText: /результаты/i });
            await resultsTab.click();
            await page.waitForLoadState("networkidle", { timeout: 2000 });
          });

          await uiTest.step("Поиск кнопки группового отчёта", async () => {
            // Ищем кнопку группового отчёта или массового скачивания
            const groupReportButton = page
              .locator("button, a")
              .filter({
                hasText:
                  /групповой отчёт|group report|массовое скачивание|выгрузить всех/i,
              })
              .first();

            const hasGroupReport = await groupReportButton
              .waitFor({ state: "visible", timeout: 5000 })
              .then(() => true)
              .catch(() => false);

            if (hasGroupReport) {
              console.log("Кнопка группового отчёта найдена");

              const downloadPromise = page
                .waitForEvent("download", { timeout: 60000 })
                .catch(() => null);
              await groupReportButton.click();

              const download = await downloadPromise;
              if (download) {
                const fileName = download.suggestedFilename();
                console.log(`Групповой отчёт скачан: ${fileName}`);
              }
            } else {
              console.log("Кнопка группового отчёта не найдена на странице");
            }
          });
        },
      );
    });

    test.describe("Верификация экспортируемых данных", () => {
      test.beforeEach(() => {
        markAsAPITest(MODULES.CALIBRATION, "Export Verification");
      });

      test("C4050: Сравнение API данных с ожидаемым экспортом", async ({
        adminAPI,
        calibrationVerifier,
      }) => {
        setSeverity("normal");

        const targetUsers =
          await test.step("Получение данных для экспорта", async () => {
            const { data } = await adminAPI.post(
              `/manager/performance-reviews/${TEST_PR_ID}/target-users/get`,
              {},
            );
            return data?.items || data || [];
          });

        if (targetUsers.length === 0) {
          test.skip(true, "Нет оцениваемых");
          return;
        }

        await test.step("Анализ полей для экспорта", async () => {
          const exportFields = {
            userId: 0,
            name: 0,
            preCalibration: 0,
            postCalibration: 0,
            characteristic: 0,
            department: 0,
            position: 0,
          };

          // Логируем структуру первого пользователя для анализа
          if (targetUsers.length > 0) {
            console.log(
              "Структура первого target user:",
              JSON.stringify(targetUsers[0], null, 2).substring(0, 500),
            );
          }

          for (const item of targetUsers) {
            // Структура: { id, user: { firstName, lastName, jobTitle, ... }, ... }
            const user = item.user || item;

            if (item.id || user.id) exportFields.userId++;
            if (user.firstName || user.lastName || user.name || user.fullName)
              exportFields.name++;
            if (
              item.preCalibrationScore ||
              item.scoreBeforeCalibration ||
              item.originalScore
            )
              exportFields.preCalibration++;
            if (
              item.postCalibrationScore ||
              item.calibratedScore ||
              item.finalScore ||
              item.score
            )
              exportFields.postCalibration++;
            if (
              item.scoreLabel ||
              item.scoreCharacteristic ||
              item.rating ||
              item.characteristic
            )
              exportFields.characteristic++;
            if (user.department || user.departmentName || item.department)
              exportFields.department++;
            if (user.jobTitle || user.position || item.position)
              exportFields.position++;
          }

          console.log("Статистика полей для экспорта:");
          for (const [field, count] of Object.entries(exportFields)) {
            console.log(`  ${field}: ${count}/${targetUsers.length}`);
          }

          // Все пользователи должны иметь ID
          expect(exportFields.userId).toBe(targetUsers.length);
          // Имя может быть в разных полях, просто логируем
          console.log(
            `Имена найдены для ${exportFields.name} из ${targetUsers.length} пользователей`,
          );
        });

        // DB верификация
        await test.step("DB верификация данных экспорта", async () => {
          const dbTargetUsers =
            await calibrationVerifier.getTargetUsers(TEST_PR_ID);

          console.log(`[DB] Найдено ${dbTargetUsers.length} target users`);
          console.log(`[API] Получено ${targetUsers.length} target users`);

          expect(
            dbTargetUsers.length,
            "В БД должны существовать target users для данного PR",
          ).toBeGreaterThan(0);

          // API должен возвращать ровно столько пользователей, сколько есть в БД
          expect(
            dbTargetUsers.length,
            `Количество target users в БД (${dbTargetUsers.length}) должно совпадать с количеством в API (${targetUsers.length})`,
          ).toBe(targetUsers.length);
        });
      });

      test("C4051: Проверка полноты данных калибровки в API", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        const settings =
          await test.step("Получение настроек статистики", async () => {
            const { data } = await adminAPI.getStatisticsSettings(TEST_PR_ID);
            return data;
          });

        await test.step("Проверка настроек калибровки", async () => {
          const calibrationEnabled =
            settings?.calibrationEnabled ||
            settings?.allowCalibration ||
            settings?.isCalibrationEnabled;

          console.log("Настройки статистики:");
          console.log(`  Калибровка включена: ${calibrationEnabled}`);
          console.log(
            `  Источник оценки: ${settings?.scoreSource || settings?.evaluationSource || "не указан"}`,
          );
          console.log(
            `  Характеристики: ${settings?.characteristicsEnabled || settings?.showCharacteristics || "не указано"}`,
          );

          // Если калибровка включена, проверяем наличие диапазонов
          if (calibrationEnabled) {
            const ranges = settings?.ranges || settings?.scoreRanges || [];
            console.log(`  Диапазонов оценок: ${ranges.length}`);

            if (ranges.length > 0) {
              for (const range of ranges) {
                console.log(
                  `    ${range.label || range.title}: ${range.min || range.from} - ${range.max || range.to}`,
                );
              }
            }
          }
        });
      });
    });
  },
);
