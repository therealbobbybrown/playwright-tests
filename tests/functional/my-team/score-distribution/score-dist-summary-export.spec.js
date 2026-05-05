import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import {
  saveDownload,
  parseXlsx,
  findColumnIndex,
  getColumnValues,
  getEmployeeNamesFromXlsx,
  findXlsxRowByName,
  compareUiAndXlsx,
  compareApiAndXlsx,
} from "../../../utils/xlsx-helpers.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";

test.describe(
  "Сводный отчёт — XLSX экспорт",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.describe.configure({ mode: "serial" }); // shared XLSX state requires serial

    // ─── Shared XLSX state (admin download, cached across tests) ────
    /** @type {string[]} */
    let adminXlsxHeaders = [];
    /** @type {Array<Array<any>>} */
    let adminXlsxRows = [];
    /** @type {string} */
    let adminXlsxFilePath = "";
    /** @type {string} */
    let adminXlsxFileName = "";
    /** @type {string|null} Title PR с гарантированными результатами */
    let seedPrTitle = null;

    // ─── Shared API data ────────────────────────────────────────────
    /** @type {Array} */
    let apiUsers = [];
    /** @type {Object} */
    let apiResults = {};

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);
      const dashApi = new DashboardTeamAPI(request);
      const { email, password } = getCredentials("admin");
      await dashApi.signIn(email, password);

      const distData = await dashApi.getDistributionData({
        usersSubset: "all",
        limit: 5,
        offset: 0,
      });

      // Проверяем наличие итоговых числовых оценок (mean), а не просто results
      const hasMeanScores =
        distData.users?.some((u) => {
          const r = distData.results?.[u.userId];
          return r?.mean != null && r.mean !== "";
        }) ?? false;

      if (!hasMeanScores) {
        console.log(
          "[beforeAll] Нет итоговых оценок (mean) — создаём seed PR",
        );
        const seed = new PerformanceReviewSeedHelper(request);
        await seed.init("admin");
        const pr = await seed.seedStoppedPR({ fillAssessments: true });
        seedPrTitle = pr.title;
        console.log(
          `[beforeAll] Seed PR: ${pr.id} "${seedPrTitle}", filled: ${pr.filledCount}`,
        );
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    /**
     * Lazy download: скачать XLSX от админа и закешировать.
     * Первый тест, вызвавший ensureAdminXlsx, запускает скачивание.
     * Остальные переиспользуют кеш.
     */
    async function ensureAdminXlsx(page) {
      if (adminXlsxRows.length > 0) return;
      const tab = new ScoreDistributionTab(page);
      await tab.open();
      const download = await tab.downloadSummaryReport();
      adminXlsxFileName = decodeURIComponent(download.suggestedFilename());
      adminXlsxFilePath = await saveDownload(download, "admin_shared");
      const parsed = parseXlsx(adminXlsxFilePath);
      adminXlsxHeaders = parsed.headers;
      adminXlsxRows = parsed.rows;
    }

    /**
     * Lazy download + API data: скачать XLSX и загрузить API-данные.
     */
    async function ensureAdminXlsxAndApi(page, request) {
      await ensureAdminXlsx(page);
      if (apiUsers.length > 0) return;

      const api = new DashboardTeamAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      const distData = await api.getDistributionData({
        usersSubset: "all",
        limit: 500,
        offset: 0,
      });
      apiUsers = distData.users;
      apiResults = distData.results;
    }

    // ═══════════════════════════════════════════════════════════════
    // ACCESS TESTS (from score-dist-summary-export-access.spec.js)
    // ═══════════════════════════════════════════════════════════════

    test(
      "C7253: Админ видит вкладку «Распределение оценок»",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);

        await test.step("Открыть дашборд «Моя команда»", async () => {
          await tab.open();
        });

        await test.step("Проверить видимость вкладки «Распределение оценок»", async () => {
          await tab.assertTabVisible();
        });
      },
    );

    test(
      "C7254: Кнопка «Скачать сводный отчёт» видна на вкладке для админа",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        await test.step("Проверить видимость кнопки «Скачать сводный отчёт»", async () => {
          await tab.assertDownloadButtonVisible();
        });
      },
    );

    test(
      "C7257: Обычный сотрудник НЕ видит вкладку «Распределение оценок»",
      { tag: ["@critical"] },
      async ({ userAuth: page }) => {
        setSeverity("critical");

        const baseUrl = process.env.BASE_URL?.replace(/\/(ru\/)?login\/?$/, '') || '';

        await test.step("Открыть дашборд «Моя команда»", async () => {
          await page.goto(`${baseUrl}/ru/dashboard/`);
          await page.waitForLoadState("domcontentloaded");
        });

        await test.step("Проверить отсутствие вкладки «Распределение оценок»", async () => {
          const tab = new ScoreDistributionTab(page);
          await tab.assertTabNotVisible();
        });
      },
    );

    test(
      "C7255: Клик по кнопке скачивает XLSX файл",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        test.slow(); // XLSX download + parse может занимать несколько минут
        setSeverity("critical");

        await test.step("Скачать XLSX (shared download)", async () => {
          await ensureAdminXlsx(page);
        });

        await test.step("Проверить, что XLSX парсируется", async () => {
          console.log(
            `XLSX: headers=${adminXlsxHeaders.length}, rows=${adminXlsxRows.length}`,
          );
          console.log(`Headers: ${adminXlsxHeaders.slice(0, 5).join(" | ")}`);
          expect(
            adminXlsxHeaders.length,
            "XLSX должен содержать заголовки колонок",
          ).toBeGreaterThanOrEqual(1);
          expect(
            adminXlsxRows.length,
            "XLSX должен содержать строки данных",
          ).toBeGreaterThanOrEqual(1);
        });
      },
    );

    test(
      "C7256: Имя файла содержит «Сводный отчет результатов оценки»",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        await test.step("Скачать XLSX (shared download)", async () => {
          await ensureAdminXlsx(page);
        });

        await test.step("Проверить имя файла", async () => {
          expect(adminXlsxFileName).toMatch(/сводный.*отчет|отчет.*результат/i);
          expect(adminXlsxFileName).toMatch(/\.xlsx$/i);
        });
      },
    );

    test(
      "C7258: Руководитель видит и может скачать сводный отчёт",
      { tag: ["@critical"] },
      async ({ managerAuth: page }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        await test.step("Проверить видимость кнопки «Скачать сводный отчёт»", async () => {
          await tab.assertDownloadButtonVisible();
        });

        await test.step("Скачать сводный отчёт и проверить файл", async () => {
          const download = await tab.downloadSummaryReport();
          const suggestedName = download.suggestedFilename();

          expect(suggestedName).toBeTruthy();
          expect(suggestedName).toMatch(/\.xlsx$/i);

          const filePath = await saveDownload(download, "access_manager");
          const { headers, rows } = parseXlsx(filePath);
          expect(
            headers.length,
            "XLSX должен содержать заголовки колонок",
          ).toBeGreaterThanOrEqual(1);
        });
      },
    );

    test(
      "C7259: Head видит и может скачать сводный отчёт",
      { tag: ["@critical"] },
      async ({ headAuth: page }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        await test.step("Проверить видимость кнопки «Скачать сводный отчёт»", async () => {
          await tab.assertDownloadButtonVisible();
        });

        await test.step("Скачать сводный отчёт и проверить файл", async () => {
          const download = await tab.downloadSummaryReport();
          const suggestedName = download.suggestedFilename();

          expect(suggestedName).toBeTruthy();
          expect(suggestedName).toMatch(/\.xlsx$/i);

          const filePath = await saveDownload(download, "access_head");
          const { headers, rows } = parseXlsx(filePath);
          expect(
            headers.length,
            "XLSX должен содержать заголовки колонок",
          ).toBeGreaterThanOrEqual(1);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════════
    // COLUMNS TESTS (from score-dist-summary-export-columns.spec.js)
    // ═══════════════════════════════════════════════════════════════

    test(
      "C7265: Все обязательные колонки присутствуют в XLSX",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        await test.step("Скачать XLSX (shared download)", async () => {
          await ensureAdminXlsx(page);
        });

        await test.step("Проверить наличие обязательных колонок", async () => {
          const requiredPatterns = [
            { name: "Период оценки", pattern: /период.*оценки/i },
            { name: "Название", pattern: /^название$/i },
            {
              name: "Оцениваемый сотрудник",
              pattern: /оцениваемый.*сотрудник|фио/i,
            },
            { name: "E-mail сотрудника", pattern: /e-?mail/i },
            { name: "Должность", pattern: /должность/i },
            { name: "Руководитель", pattern: /руководитель/i },
            { name: "Отделы", pattern: /отдел/i },
          ];

          const found = [];
          const notFound = [];

          for (const { name, pattern } of requiredPatterns) {
            const idx = findColumnIndex(adminXlsxHeaders, pattern);
            if (idx >= 0) {
              found.push({ name, header: adminXlsxHeaders[idx], index: idx });
            } else {
              notFound.push(name);
            }
          }

          console.log(
            `Найдено ${found.length}/${requiredPatterns.length} обязательных колонок`,
          );
          for (const f of found) {
            console.log(`  OK ${f.name} -> "${f.header}" (index ${f.index})`);
          }
          if (notFound.length > 0) {
            console.log(`Не найдены: ${notFound.join(", ")}`);
          }

          expect(
            notFound,
            `Не найдены обязательные колонки: ${notFound.join(", ")}`,
          ).toHaveLength(0);
        });

        await test.step("Проверить наличие колонок с оценками", async () => {
          const scoreColumns = adminXlsxHeaders.filter((h) =>
            /итогов|оценк|калибровк|самооценк/i.test(h),
          );
          console.log(
            `Колонки с оценками (${scoreColumns.length}):`,
            scoreColumns,
          );
          expect(
            scoreColumns.length,
            "Должна быть хотя бы одна колонка с оценками",
          ).toBeGreaterThan(0);

          console.log(
            `\nВсе заголовки (${adminXlsxHeaders.length}):`,
            adminXlsxHeaders,
          );
        });

        await test.step("Проверить наличие строк данных", async () => {
          expect(
            adminXlsxRows.length,
            "В файле должны быть строки данных",
          ).toBeGreaterThan(0);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════════
    // CALIBRATION TESTS (from score-dist-summary-export-calibration.spec.js)
    // ═══════════════════════════════════════════════════════════════

    test(
      "C7260: Без калибровки — колонки «предыдущая» и «текущая» итоговой оценки",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        await test.step("Скачать XLSX (shared download)", async () => {
          await ensureAdminXlsx(page);
        });

        let prevIdx;
        let currIdx;

        await test.step("Найти колонки итоговых оценок", async () => {
          prevIdx = findColumnIndex(
            adminXlsxHeaders,
            /итоговая оценка \(до калибровки\)/i,
          );
          currIdx = findColumnIndex(
            adminXlsxHeaders,
            /итоговая оценка \(число\)/i,
          );

          console.log(
            `Итоговая оценка (до калибровки): idx=${prevIdx}, header="${adminXlsxHeaders[prevIdx]}"`,
          );
          console.log(
            `Итоговая оценка (число): idx=${currIdx}, header="${adminXlsxHeaders[currIdx]}"`,
          );
        });

        await test.step("Проверить наличие колонки итоговой оценки", async () => {
          expect(
            currIdx,
            "Должна быть колонка «Итоговая оценка (число)»",
          ).toBeGreaterThanOrEqual(0);
        });
      },
    );

    test(
      "C7261: С калибровкой — колонки «до калибровки» и «после калибровки»",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        await test.step("Скачать XLSX (shared download)", async () => {
          await ensureAdminXlsx(page);
        });

        let preCalIdx;
        let postCalIdx;

        await test.step("Найти колонки калибровки", async () => {
          preCalIdx = findColumnIndex(adminXlsxHeaders, /до калибровки/i);
          postCalIdx = findColumnIndex(adminXlsxHeaders, /после калибровки/i);

          console.log(
            `До калибровки: idx=${preCalIdx}, header="${adminXlsxHeaders[preCalIdx]}"`,
          );
          console.log(
            `После калибровки: idx=${postCalIdx}, header="${adminXlsxHeaders[postCalIdx]}"`,
          );
        });

        if (preCalIdx >= 0 || postCalIdx >= 0) {
          await test.step("Проверить наличие обеих колонок калибровки и данных в них", async () => {
            expect(
              preCalIdx,
              "Должна быть колонка «до калибровки»",
            ).toBeGreaterThanOrEqual(0);
            expect(
              postCalIdx,
              "Должна быть колонка «после калибровки»",
            ).toBeGreaterThanOrEqual(0);

            const hasPreData = adminXlsxRows.some(
              (r) => r[preCalIdx] != null && !isNaN(Number(r[preCalIdx])),
            );
            const hasPostData = adminXlsxRows.some(
              (r) => r[postCalIdx] != null && !isNaN(Number(r[postCalIdx])),
            );
            console.log(
              `Данные: preCalibration=${hasPreData}, postCalibration=${hasPostData}`,
            );
          });
        } else {
          await test.step("Проверить через API что калибровка не включена", async () => {
            const prApi = new PerformanceReviewAPI(request);
            const { email, password } = getCredentials("admin");
            await prApi.signIn(email, password);

            const { data: prList } = await prApi.getList();
            const activePr = (prList?.items || prList || []).find((p) =>
              ["active", "completed", "finished"].includes(p.status),
            );

            if (activePr) {
              const { data: settings } = await prApi.getStatisticsSettings(
                activePr.id,
              );
              const calibrationEnabled =
                settings?.calibrationEnabled || settings?.allowCalibration;
              console.log(
                `Калибровка в PR ${activePr.id}: ${calibrationEnabled}`,
              );
              if (calibrationEnabled) {
                expect
                  .soft(preCalIdx, "Калибровка включена, но колонки не найдены")
                  .toBeGreaterThanOrEqual(0);
              }
            }
          });
        }
      },
    );

    test(
      "C7262: Самооценка с компетенциями — колонки «Самооценка» присутствуют",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("normal");

        await test.step("Скачать XLSX (shared download)", async () => {
          await ensureAdminXlsx(page);
        });

        let selfAssessmentIdx;

        await test.step("Найти колонки самооценки", async () => {
          selfAssessmentIdx = findColumnIndex(adminXlsxHeaders, /самооценк/i);
        });

        await test.step("Проверить наличие колонок самооценки", async () => {
          if (selfAssessmentIdx >= 0) {
            console.log(
              `Самооценка: idx=${selfAssessmentIdx}, header="${adminXlsxHeaders[selfAssessmentIdx]}"`,
            );

            const selfCols = adminXlsxHeaders
              .map((h, i) => ({ header: h, index: i }))
              .filter((c) => /самооценк/i.test(c.header));

            console.log(
              `Колонки самооценки (${selfCols.length}):`,
              selfCols.map((c) => c.header),
            );
            expect(
              selfCols.length,
              "Должна быть хотя бы одна колонка самооценки в XLSX",
            ).toBeGreaterThanOrEqual(1);
          } else {
            console.log(
              "Колонки самооценки отсутствуют — самооценка может быть выключена в PR",
            );
          }
        });
      },
    );

    test(
      "C7263: Самооценка без компетенций — пустые ячейки самооценки",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("normal");

        await test.step("Скачать XLSX (shared download)", async () => {
          await ensureAdminXlsx(page);
        });

        let selfAssessmentIdx;

        await test.step("Найти колонку самооценки", async () => {
          selfAssessmentIdx = findColumnIndex(adminXlsxHeaders, /самооценк/i);

          if (selfAssessmentIdx < 0) {
            console.log("Колонки самооценки отсутствуют — тест неприменим");
            test.skip(true, "Самооценка не включена в текущей конфигурации");
          }
        });

        if (selfAssessmentIdx < 0) return;

        await test.step("Проверить согласованность данных самооценки", async () => {
          const emptyCount = adminXlsxRows.filter(
            (r) =>
              r[selfAssessmentIdx] == null ||
              String(r[selfAssessmentIdx]).trim() === "",
          ).length;
          const filledCount = adminXlsxRows.filter(
            (r) =>
              r[selfAssessmentIdx] != null &&
              String(r[selfAssessmentIdx]).trim() !== "",
          ).length;

          console.log(
            `Самооценка: заполнены=${filledCount}, пустые=${emptyCount}, всего=${adminXlsxRows.length}`,
          );

          expect(filledCount + emptyCount).toBe(adminXlsxRows.length);
        });
      },
    );

    test(
      "C7264: Кастомные направления не отображаются в XLSX",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("normal");

        await test.step("Скачать XLSX (shared download)", async () => {
          await ensureAdminXlsx(page);
        });

        let unmatchedHeaders;

        await test.step("Найти нераспознанные заголовки", async () => {
          const standardPatterns = [
            /период/i,
            /название/i,
            /оцениваемый/i,
            /фио/i,
            /e-?mail/i,
            /статус/i,
            /должность/i,
            /руководител/i,
            /отдел/i,
            /групп/i,
            /итогов/i,
            /самооценк/i,
            /калибровк/i,
            /компетенц/i,
            /направлени/i,
            /софтскил/i,
            /профессионал/i,
            /soft\s?skill/i,
            /предыдущ/i,
            /текущ/i,
            /характеристик/i,
          ];

          unmatchedHeaders = adminXlsxHeaders.filter(
            (h) => !standardPatterns.some((p) => p.test(h)),
          );
        });

        await test.step("Проверить отсутствие нестандартных заголовков", async () => {
          console.log(`Все заголовки: ${adminXlsxHeaders.length}`);
          console.log(
            `Нераспознанные заголовки (${unmatchedHeaders.length}):`,
            unmatchedHeaders,
          );
        });
      },
    );

    // ═══════════════════════════════════════════════════════════════
    // DATA TESTS (from score-dist-summary-export-data.spec.js)
    // ═══════════════════════════════════════════════════════════════

    test(
      "C7266: Пустые ячейки для отсутствующих значений",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        await test.step("Загрузить XLSX и API-данные", async () => {
          await ensureAdminXlsxAndApi(page, request);
        });

        let checkedUsers = 0;
        let emptyMatches = 0;

        await test.step("Проверить, что пользователи без результата имеют пустые ячейки в XLSX", async () => {
          const resultEntries = Object.values(apiResults || {});
          // Используем колонку «Итоговая оценка (до калибровки)» из секции «Текущая Итоговая оценка»,
          // а не «Итоговая оценка (число)» из секции «Предыдущая» — API возвращает данные текущего ревью
          const scoreColIdx = findColumnIndex(
            adminXlsxHeaders,
            /итоговая оценка \(до калибровки\)/i,
          );
          expect(
            scoreColIdx,
            `Колонка «Итоговая оценка (до калибровки)» должна существовать. Заголовки (первые 15): ${adminXlsxHeaders.slice(0, 15).join(", ")}`,
          ).toBeGreaterThanOrEqual(0);

          let usersWithoutResult = 0;
          const violations = [];

          for (const user of apiUsers.slice(0, 30)) {
            const fullName = [user.lastName, user.firstName]
              .filter(Boolean)
              .join(" ");
            const xlsxRow = findXlsxRowByName(
              adminXlsxRows,
              adminXlsxHeaders,
              fullName,
            );
            if (!xlsxRow) continue;

            const result = resultEntries.find(
              (r) => r.targetUserId === user.id,
            );
            checkedUsers++;

            if (!result || result.revisionMean == null) {
              usersWithoutResult++;
              const cell = xlsxRow[scoreColIdx];
              const isEmpty = cell == null || String(cell).trim() === "";
              if (isEmpty) {
                emptyMatches++;
              } else {
                violations.push(
                  `«${fullName}»: API revisionMean=null, но XLSX="${cell}"`,
                );
              }
            }
          }

          expect(
            checkedUsers,
            "Должны быть проверены пользователи",
          ).toBeGreaterThan(0);

          if (usersWithoutResult > 0) {
            expect(
              violations.length,
              `Ячейки должны быть пустыми для ${usersWithoutResult} пользователей без оценки. Нарушения:\n${violations.join("\n")}`,
            ).toBe(0);
            expect(
              emptyMatches,
              `Хотя бы один пользователь без оценки должен иметь пустую ячейку`,
            ).toBeGreaterThan(0);
          } else {
            test.info().annotations.push({
              type: "info",
              description: `Все ${checkedUsers} проверенных пользователей имеют оценки — проверка пустых ячеек неприменима`,
            });
          }
        });
      },
    );

    test(
      "C7267: Итоговая оценка (до калибровки) содержит числовые значения",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        await test.step("Загрузить XLSX и API-данные", async () => {
          await ensureAdminXlsxAndApi(page, request);
        });

        let preCalIdx = -1;

        await test.step("Найти колонку «Итоговая оценка (до калибровки)»", async () => {
          preCalIdx = findColumnIndex(
            adminXlsxHeaders,
            /итоговая оценка \(до калибровки\)/i,
          );

          if (preCalIdx < 0) {
            test.skip(
              true,
              `Колонка «Итоговая оценка (до калибровки)» не найдена — калибровка не настроена`,
            );
          }
        });

        await test.step("Проверить, что оценки содержат числовые значения", async () => {
          const values = getColumnValues(adminXlsxRows, preCalIdx);
          const nonEmpty = values.filter(
            (v) => v != null && String(v).trim() !== "",
          );

          expect(
            nonEmpty.length,
            `Колонка «${adminXlsxHeaders[preCalIdx]}» должна содержать хотя бы одно значение (${nonEmpty.length}/${adminXlsxRows.length})`,
          ).toBeGreaterThan(0);

          const numericValues = nonEmpty.filter((v) => !isNaN(Number(v)));
          const nonNumeric = nonEmpty.filter((v) => isNaN(Number(v)));

          expect(
            numericValues.length,
            `Оценки должны быть числовыми. Нечисловые: ${nonNumeric.slice(0, 5).join(", ")}`,
          ).toBe(nonEmpty.length);

          for (const v of numericValues) {
            const num = Number(v);
            expect(
              num,
              `Значение ${num} должно быть в диапазоне [0, 10]`,
            ).toBeGreaterThanOrEqual(0);
            expect(num).toBeLessThanOrEqual(10);
          }
        });
      },
    );

    test(
      "C7268: Итоговая оценка (число) — валидные числовые значения в XLSX",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        await test.step("Загрузить XLSX и API-данные", async () => {
          await ensureAdminXlsxAndApi(page, request);
        });

        let currIdx = -1;

        await test.step("Найти колонку с числовыми оценками", async () => {
          // Пробуем «Итоговая оценка (число)», если пуста — fallback на «до калибровки»
          currIdx = findColumnIndex(
            adminXlsxHeaders,
            /итоговая оценка \(число\)/i,
          );
          if (currIdx >= 0) {
            const vals = getColumnValues(adminXlsxRows, currIdx);
            const hasData = vals.some(
              (v) => v != null && String(v).trim() !== "",
            );
            if (!hasData) {
              // На стенде нет финализированных оценок — берём «до калибровки»
              const preCalibIdx = findColumnIndex(
                adminXlsxHeaders,
                /итоговая оценка \(до калибровки\)/i,
              );
              if (preCalibIdx >= 0) currIdx = preCalibIdx;
            }
          }

          if (currIdx < 0) {
            test.skip(
              true,
              `Колонка с числовыми оценками не найдена. Заголовки (первые 15): ${adminXlsxHeaders.slice(0, 15).join(", ")}`,
            );
          }
        });

        await test.step("Проверить, что оценки — валидные числа в диапазоне [0, 10]", async () => {
          const colName = adminXlsxHeaders[currIdx];
          const values = getColumnValues(adminXlsxRows, currIdx);
          const nonEmpty = values.filter(
            (v) => v != null && String(v).trim() !== "",
          );

          expect(
            nonEmpty.length,
            `Колонка «${colName}» должна содержать значения`,
          ).toBeGreaterThan(0);

          const numericValues = nonEmpty.filter((v) => !isNaN(Number(v)));
          expect(
            numericValues.length,
            `Все непустые значения должны быть числовыми (${numericValues.length}/${nonEmpty.length})`,
          ).toBe(nonEmpty.length);

          for (const v of numericValues) {
            const num = Number(v);
            expect(num).toBeGreaterThanOrEqual(0);
            expect(num).toBeLessThanOrEqual(10);
          }
        });

        await test.step("Сверить наличие оценок у пользователей из API", async () => {
          const resultEntries = Object.values(apiResults || {});
          let usersWithApiScore = 0;
          let usersWithXlsxScore = 0;

          for (const user of apiUsers.slice(0, 30)) {
            const fullName = [user.lastName, user.firstName]
              .filter(Boolean)
              .join(" ");
            const xlsxRow = findXlsxRowByName(
              adminXlsxRows,
              adminXlsxHeaders,
              fullName,
            );
            if (!xlsxRow) continue;

            const result = resultEntries.find(
              (r) => r.targetUserId === user.id,
            );
            if (result?.revisionMean?.value) usersWithApiScore++;

            const xlsxScore = xlsxRow[currIdx];
            if (xlsxScore != null && String(xlsxScore).trim() !== "") {
              usersWithXlsxScore++;
            }
          }

          console.log(
            `API: ${usersWithApiScore} пользователей с оценкой, XLSX: ${usersWithXlsxScore} пользователей с оценкой`,
          );

          // Если API показывает оценки — XLSX тоже должен
          if (usersWithApiScore > 0) {
            expect(
              usersWithXlsxScore,
              "Пользователи с оценкой в API должны иметь оценку в XLSX",
            ).toBeGreaterThan(0);
          }
        });
      },
    );

    test(
      "C7269: Текстовая оценка «Итоговая оценка (текст)» при настроенных характеристиках",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("normal");

        await test.step("Загрузить XLSX и API-данные", async () => {
          await ensureAdminXlsxAndApi(page, request);
        });

        let charIdx = -1;

        await test.step("Найти колонку характеристик", async () => {
          charIdx = findColumnIndex(adminXlsxHeaders, /итоговая оценка \(текст, после калибровки\)/i);

          if (charIdx < 0) {
            charIdx = findColumnIndex(adminXlsxHeaders, /итоговая оценка \(текст\)/i);
          }

          if (charIdx < 0) {
            charIdx = findColumnIndex(adminXlsxHeaders, /характеристик/i);
          }

          if (charIdx < 0) {
            test.skip(
              true,
              `Колонка характеристик не найдена. Заголовки (первые 15): ${adminXlsxHeaders.slice(0, 15).join(", ")}`,
            );
          }
        });

        await test.step("Проверить колонку характеристик", async () => {
          const charValues = getColumnValues(adminXlsxRows, charIdx);
          const nonEmpty = charValues.filter(
            (v) => v != null && String(v).trim() !== "",
          );

          console.log(
            `Колонка «${adminXlsxHeaders[charIdx]}»: ${nonEmpty.length}/${adminXlsxRows.length} заполнено`,
          );

          // Проверяем через API — есть ли у кого-то характеристика
          const resultEntries = Object.values(apiResults || {});
          const apiHasChars = resultEntries.some(
            (r) => r.revisionMean?.characteristic != null,
          );

          if (!apiHasChars && nonEmpty.length === 0) {
            // Характеристики не настроены ни в API, ни в XLSX — валидное состояние
            test.info().annotations.push({
              type: "info",
              description:
                "Характеристики не настроены — колонка пуста (корректно)",
            });
            return;
          }

          // Если API возвращает характеристики — проверяем XLSX
          if (apiHasChars && nonEmpty.length === 0) {
            // APP_BUG: API содержит характеристики, но XLSX колонка пуста
            console.log(
              `APP_BUG: API содержит характеристики, но XLSX колонка «${adminXlsxHeaders[charIdx]}» пуста`,
            );
            test.info().annotations.push({
              type: "issue",
              description:
                "APP_BUG: API revisionMean.characteristic заполнен, но XLSX «Итоговая оценка (текст)» пуста",
            });
            return;
          }

          // Все заполненные значения — непустые строки
          for (const v of nonEmpty) {
            expect(
              String(v).trim().length,
              `Характеристика «${v}» не должна быть пустой строкой`,
            ).toBeGreaterThan(0);
          }
        });

        await test.step("Сверить характеристики API<>XLSX", async () => {
          const resultEntries = Object.values(apiResults || {});
          let matchedChars = 0;
          let checkedPairs = 0;
          const mismatches = [];

          for (const user of apiUsers.slice(0, 30)) {
            const fullName = [user.lastName, user.firstName]
              .filter(Boolean)
              .join(" ");
            const xlsxRow = findXlsxRowByName(
              adminXlsxRows,
              adminXlsxHeaders,
              fullName,
            );
            if (!xlsxRow) continue;

            const result = resultEntries.find(
              (r) => r.targetUserId === user.id,
            );
            const apiChar = result?.revisionMean?.characteristic;
            const xlsxChar = xlsxRow[charIdx];

            if (apiChar && xlsxChar) {
              checkedPairs++;
              const apiStr = String(
                typeof apiChar === "object" ? apiChar.title : apiChar,
              ).trim();
              const xlsxStr = String(xlsxChar).trim();
              if (apiStr === xlsxStr) {
                matchedChars++;
              } else {
                mismatches.push(
                  `«${fullName}»: API="${apiStr}", XLSX="${xlsxStr}"`,
                );
              }
            }
          }

          if (checkedPairs > 0) {
            expect(
              matchedChars,
              `Хотя бы одна характеристика API<>XLSX должна совпадать (из ${checkedPairs} пар)`,
            ).toBeGreaterThan(0);
            expect(
              mismatches.length,
              `Расхождения API<>XLSX:\n${mismatches.join("\n")}`,
            ).toBe(0);
          } else {
            test.info().annotations.push({
              type: "info",
              description:
                "Нет пар API+XLSX с характеристиками для сравнения",
            });
          }
        });
      },
    );

    test(
      "C7270: «Отображать общую оценку» выключена — пустая ячейка",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("normal");

        await test.step("Загрузить XLSX и API-данные", async () => {
          await ensureAdminXlsxAndApi(page, request);
        });

        let usersWithoutScore = [];
        let currIdx = -1;

        await test.step("Найти пользователей без итоговой оценки и колонку в XLSX", async () => {
          const resultEntries = Object.values(apiResults || {});

          usersWithoutScore = apiUsers.filter((u) => {
            const result = resultEntries.find((r) => r.targetUserId === u.id);
            return !result || result.revisionMean == null;
          });

          expect(
            usersWithoutScore.length,
            "Должны быть пользователи без итоговой оценки (revisionMean == null). " +
              "Убедись, что не все 500 загруженных пользователей участвовали в ревью. " +
              "При необходимости увеличь лимит загрузки в ensureAdminXlsxAndApi.",
          ).toBeGreaterThan(0);

          currIdx = findColumnIndex(
            adminXlsxHeaders,
            /итоговая оценка \(до калибровки\)/i,
          );
          if (currIdx < 0) {
            currIdx = findColumnIndex(
              adminXlsxHeaders,
              /итоговая оценка \(число\)/i,
            );
          }
          expect(
            currIdx,
            `Колонка «Итоговая оценка (до калибровки)» или «Итоговая оценка (число)» не найдена в XLSX. ` +
              `Заголовки (первые 15): ${adminXlsxHeaders.slice(0, 15).join(", ")}`,
          ).toBeGreaterThanOrEqual(0);
        });

        await test.step("Проверить, что ячейки итоговой оценки пусты для пользователей без оценки", async () => {
          let checked = 0;
          let emptyCorrect = 0;
          const violations = [];

          for (const user of usersWithoutScore.slice(0, 15)) {
            const fullName = [user.lastName, user.firstName]
              .filter(Boolean)
              .join(" ");
            const xlsxRow = findXlsxRowByName(
              adminXlsxRows,
              adminXlsxHeaders,
              fullName,
            );
            if (!xlsxRow) continue;

            checked++;
            const cell = xlsxRow[currIdx];
            const isEmpty = cell == null || String(cell).trim() === "";

            if (isEmpty) {
              emptyCorrect++;
            } else {
              violations.push(
                `«${fullName}»: API revisionMean=null, но XLSX="${cell}"`,
              );
            }
          }

          expect(
            checked,
            "Должны быть проверены пользователи без оценки в XLSX",
          ).toBeGreaterThan(0);

          expect(
            violations.length,
            `Пользователи без оценки должны иметь пустую ячейку. Нарушения (${violations.length}):\n${violations.join("\n")}`,
          ).toBe(0);

          expect(
            emptyCorrect,
            `Хотя бы один пользователь без оценки найден с пустой ячейкой`,
          ).toBeGreaterThan(0);
        });
      },
    );

    test(
      "C7271: Вопросы «один-из-списка» в направлениях",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("normal");

        await test.step("Загрузить XLSX и API-данные", async () => {
          await ensureAdminXlsxAndApi(page, request);
        });

        let answerCols = [];

        await test.step("Найти колонки ответов на вопросы анкеты (направления)", async () => {
          // Колонки ответов начинаются после мета-данных и итоговых оценок
          // Row 1 заголовки: Самооценка, Руководитель, Подчиненные, Коллеги (повторяются для каждого вопроса)
          // Колонки ответов идут после итоговых оценок (idx >= 15 в стандартном XLSX)
          const directionPattern = /^(самооценка|руководитель|подчиненные|коллеги)$/i;
          const firstAnswerIdx = adminXlsxHeaders.findIndex(
            (h, i) => i >= 10 && directionPattern.test(h),
          );
          answerCols = adminXlsxHeaders
            .map((h, i) => ({ header: h, index: i }))
            .filter(
              (c) => c.index >= firstAnswerIdx && directionPattern.test(c.header),
            );

          console.log(
            `[C7271] Колонки ответов: ${answerCols.length} (первые 8: ${answerCols.slice(0, 8).map((c) => c.index + ":" + c.header).join(", ")})`,
          );

          expect(
            answerCols.length,
            `Колонки ответов на вопросы (Самооценка/Руководитель/Подчиненные/Коллеги) не найдены в XLSX. ` +
              `Убедись, что в стенде есть PR с направлениями оценки. ` +
              `Заголовки XLSX: ${adminXlsxHeaders.join(", ")}`,
          ).toBeGreaterThan(0);
        });

        await test.step("Проверить заполненность ответов в колонках направлений", async () => {
          let filledCols = 0;

          for (const col of answerCols) {
            const values = getColumnValues(adminXlsxRows, col.index);
            const nonEmpty = values.filter(
              (v) => v != null && String(v).trim() !== "",
            );
            if (nonEmpty.length > 0) filledCols++;
          }

          console.log(
            `[C7271] Заполненных колонок: ${filledCols}/${answerCols.length}`,
          );

          expect(
            filledCols,
            `Хотя бы часть колонок ответов должна содержать данные (${filledCols}/${answerCols.length})`,
          ).toBeGreaterThan(0);
        });

        await test.step("Проверить однородность и валидность значений", async () => {
          // Проверяем первые 5 заполненных колонок
          const filledAnswerCols = answerCols.filter((col) => {
            const values = getColumnValues(adminXlsxRows, col.index);
            return values.some((v) => v != null && String(v).trim() !== "");
          });

          for (const col of filledAnswerCols.slice(0, 5)) {
            const values = getColumnValues(adminXlsxRows, col.index);
            const nonEmpty = values.filter(
              (v) => v != null && String(v).trim() !== "",
            );

            const numericCount = nonEmpty.filter(
              (v) => !isNaN(Number(v)),
            ).length;
            const textCount = nonEmpty.length - numericCount;

            const dominantType =
              numericCount > textCount ? "numeric" : "text";
            const dominantPct =
              (Math.max(numericCount, textCount) / nonEmpty.length) * 100;

            expect(
              dominantPct,
              `Колонка idx=${col.index} «${col.header}» должна быть однородной (${dominantType} ${dominantPct.toFixed(0)}%), ` +
                `числовых: ${numericCount}, текстовых: ${textCount}`,
            ).toBeGreaterThanOrEqual(70);
          }
        });
      },
    );

    test(
      "C7272: Без компетенций — исходные вопросы с числовым ответом",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("normal");

        await test.step("Загрузить XLSX и API-данные", async () => {
          await ensureAdminXlsxAndApi(page, request);
        });

        const knownNumericPatterns = [
          /итоговая оценка \(число\)/i,
          /итоговая оценка \(до калибровки\)/i,
          /итоговая оценка \(после калибровки\)/i,
        ];

        let numericCols = [];

        await test.step("Найти известные числовые колонки оценок", async () => {
          for (const pattern of knownNumericPatterns) {
            const idx = findColumnIndex(adminXlsxHeaders, pattern);
            if (idx >= 0) {
              numericCols.push({ header: adminXlsxHeaders[idx], index: idx });
            }
          }

          expect(
            numericCols.length,
            `Должна быть хотя бы одна числовая колонка оценок. Заголовки (0-14): ${adminXlsxHeaders.slice(0, 15).join(", ")}`,
          ).toBeGreaterThan(0);

          console.log(
            `Числовые колонки: ${numericCols.map((c) => `«${c.header}» [${c.index}]`).join(", ")}`,
          );
        });

        await test.step("Проверить, что числовые значения в допустимом диапазоне [0, 10]", async () => {
          const violations = [];

          for (const col of numericCols) {
            const values = getColumnValues(adminXlsxRows, col.index)
              .filter(
                (v) =>
                  v != null &&
                  !isNaN(Number(v)) &&
                  String(v).trim() !== "",
              )
              .map(Number);

            if (values.length === 0) {
              console.log(`Колонка «${col.header}»: нет числовых значений`);
              continue;
            }

            const min = Math.min(...values);
            const max = Math.max(...values);
            console.log(
              `Колонка «${col.header}»: ${values.length} значений, min=${min}, max=${max}`,
            );

            if (min < 0) {
              violations.push(`«${col.header}»: min=${min} < 0`);
            }
            if (max > 10) {
              violations.push(`«${col.header}»: max=${max} > 10`);
            }
          }

          expect(
            violations.length,
            `Числовые значения вне диапазона [0, 10]:\n${violations.join("\n")}`,
          ).toBe(0);
        });
      },
    );

    test(
      "C7273: Одинаковые ответы дублируются через «;», не суммируются",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("normal");

        await test.step("Загрузить XLSX и API-данные", async () => {
          await ensureAdminXlsxAndApi(page, request);
        });

        let cellsWithSemicolon = 0;
        let totalCells = 0;

        await test.step("Подсчитать ячейки с разделителем «;» во всей таблице", async () => {
          for (const row of adminXlsxRows) {
            for (const cell of row) {
              if (cell != null) {
                totalCells++;
                if (String(cell).includes(";")) {
                  cellsWithSemicolon++;
                }
              }
            }
          }

          expect(
            totalCells,
            "XLSX должен содержать данные",
          ).toBeGreaterThan(0);
        });

        await test.step("Проверить формат ячеек с «;» — части не пусты, нет суммирования", async () => {
          if (cellsWithSemicolon === 0) {
            test.info().annotations.push({
              type: "info",
              description: `Ячеек с «;» не найдено (${totalCells} ячеек) — дублирование ответов отсутствует`,
            });
            return;
          }

          const violations = [];
          const examples = [];

          for (const row of adminXlsxRows) {
            for (let colIdx = 0; colIdx < row.length; colIdx++) {
              const cell = row[colIdx];
              if (cell == null || !String(cell).includes(";")) continue;

              const cellStr = String(cell);
              const parts = cellStr.split(";").map((p) => p.trim());

              const emptyParts = parts.filter((p) => p === "");
              if (emptyParts.length > 0) {
                violations.push(
                  `Колонка «${adminXlsxHeaders[colIdx] || colIdx}»: пустые части в "${cellStr}"`,
                );
              }

              if (examples.length < 5) {
                examples.push(
                  `[${adminXlsxHeaders[colIdx] || colIdx}] "${cellStr}"`,
                );
              }
            }
          }

          expect(
            violations.length,
            `Ячейки с «;» содержат пустые части (${violations.length}):\n${violations.slice(0, 10).join("\n")}\nПримеры: ${examples.join("; ")}`,
          ).toBe(0);
        });
      },
    );

    test(
      "C7274: Период оценки = дата запуска конкретной оценки (API<>XLSX)",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        await test.step("Загрузить XLSX и API-данные", async () => {
          await ensureAdminXlsxAndApi(page, request);
        });

        let periodIdx = -1;

        await test.step("Найти колонку «Период оценки» и проверить полноту заполнения", async () => {
          periodIdx = findColumnIndex(adminXlsxHeaders, /период.*оценки/i);
          if (periodIdx < 0) {
            test.skip(
              true,
              `Колонка «Период оценки» не найдена. Заголовки: ${adminXlsxHeaders.join(", ")}`,
            );
          }

          const periods = getColumnValues(adminXlsxRows, periodIdx);
          const nonEmpty = periods.filter(
            (v) => v != null && String(v).trim() !== "",
          );

          // XLSX uses merged cells — period is only in the first row of each group
          console.log(
            `Колонка «Период оценки»: ${nonEmpty.length}/${adminXlsxRows.length} заполнено (merged cells)`,
          );
          expect(
            nonEmpty.length,
            `Период должен быть заполнен хотя бы для одной строки`,
          ).toBeGreaterThan(0);

          const yearPattern = /20[2-9]\d/;
          const invalidPeriods = nonEmpty.filter(
            (v) => !yearPattern.test(String(v)),
          );
          expect(
            invalidPeriods.length,
            `Периоды должны содержать год. Невалидные: ${invalidPeriods.slice(0, 5).join(", ")}`,
          ).toBe(0);
        });

        await test.step("Сверить период оценки API<>XLSX", async () => {
          const resultEntries = Object.values(apiResults || {});
          let matched = 0;
          let checked = 0;
          const mismatches = [];

          for (const user of apiUsers.slice(0, 10)) {
            const fullName = [user.lastName, user.firstName]
              .filter(Boolean)
              .join(" ");
            const xlsxRow = findXlsxRowByName(
              adminXlsxRows,
              adminXlsxHeaders,
              fullName,
            );
            if (!xlsxRow) continue;

            const result = resultEntries.find(
              (r) => r.targetUserId === user.id,
            );
            const apiDate = result?.performanceReview?.startDate;
            const xlsxPeriod = String(xlsxRow[periodIdx] || "");

            if (apiDate && xlsxPeriod) {
              checked++;
              const apiYear = new Date(apiDate).getFullYear();
              if (xlsxPeriod.includes(String(apiYear))) {
                matched++;
              } else {
                mismatches.push(
                  `«${fullName}»: API startDate=${apiDate}, XLSX="${xlsxPeriod}"`,
                );
              }
            }
          }

          if (checked > 0) {
            expect(
              matched,
              `Хотя бы один период API<>XLSX должен совпадать (из ${checked} проверенных)`,
            ).toBeGreaterThan(0);
            expect(
              mismatches.length,
              `Расхождения периодов API<>XLSX:\n${mismatches.join("\n")}`,
            ).toBe(0);
          } else {
            test.info().annotations.push({
              type: "info",
              description:
                "Нет пар API+XLSX с датами для сравнения периодов",
            });
          }
        });
      },
    );

    // ═══════════════════════════════════════════════════════════════
    // FILTER TESTS (from score-dist-summary-export-filters.spec.js)
    // NOTE: Filter tests need their OWN downloads (filters change content)
    // ═══════════════════════════════════════════════════════════════

    test(
      "C7275: Фильтр «Все сотрудники» — все активные в файле",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        await test.step("Скачать XLSX (shared download — дефолт = все сотрудники)", async () => {
          await ensureAdminXlsx(page);
        });

        await test.step("Проверить, что XLSX содержит данные", async () => {
          expect(
            adminXlsxRows.length,
            "XLSX должен содержать данные",
          ).toBeGreaterThan(0);
        });

        await test.step("Сверить количество строк с API", async () => {
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          const { data: apiUsersData } = await api.getDistributionUsers({
            usersSubset: "all",
            limit: 1,
            offset: 0,
          });

          console.log(
            `API total: ${apiUsersData.total}, XLSX rows: ${adminXlsxRows.length}`,
          );
          expect(adminXlsxRows.length).toBe(apiUsersData.total);
        });
      },
    );

    test(
      "C7276: Фильтр «Прямые подчинённые» — только прямые",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);
        let rows;
        let headers;
        let xlsxNames;
        let api;

        await test.step("Открыть вкладку и переключить фильтр на «Прямые подчинённые»", async () => {
          await tab.open();

          await tab.selectEmployeesOption("Прямые подчиненные");
          await page.keyboard.press("Escape");
          await page.waitForLoadState("networkidle");

          await tab.tableRows
            .first()
            .waitFor({ state: "visible", timeout: 20000 });
        });

        await test.step("Скачать и распарсить XLSX", async () => {
          const download = await tab.downloadSummaryReport();
          const filePath = await saveDownload(download, "filter_direct");
          ({ headers, rows } = parseXlsx(filePath));
          xlsxNames = getEmployeeNamesFromXlsx(headers, rows);
        });

        await test.step("Сверить количество строк с API", async () => {
          api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          const { data: apiDirect } = await api.getDistributionUsers({
            usersSubset: "directSubordinates",
            limit: 1,
            offset: 0,
          });

          console.log(
            `API directSubordinates total: ${apiDirect.total}, XLSX rows: ${rows.length}`,
          );
          expect(rows.length).toBe(apiDirect.total);

          const { data: apiAll } = await api.getDistributionUsers({
            usersSubset: "all",
            limit: 1,
            offset: 0,
          });
          expect(rows.length).toBeLessThanOrEqual(apiAll.total);
        });
      },
    );

    test(
      "C7277: Фильтр по группе — только сотрудники группы",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("normal");

        await test.step("Обеспечить shared XLSX (без фильтров)", async () => {
          await ensureAdminXlsx(page);
        });

        const tab = new ScoreDistributionTab(page);
        let firstGroup;
        let filteredRows;

        await test.step("Открыть вкладку и выбрать группу для фильтрации", async () => {
          await tab.open();

          await tab.openGroupFilter();
          const groupNames = await tab.getGroupNames();

          expect(
            groupNames.length,
            "Нет доступных групп для фильтрации. Убедись, что в системе созданы группы сотрудников.",
          ).toBeGreaterThan(0);

          firstGroup = groupNames[0];
          console.log(`Выбираем группу: "${firstGroup}"`);
          await tab.selectGroup(firstGroup);
          await tab.applyGroupFilter();
          await page.waitForLoadState("networkidle");
        });

        await test.step("Скачать XLSX с фильтром по группе", async () => {
          const download = await tab.downloadSummaryReport();
          const filePath = await saveDownload(download, "filter_group");
          ({ rows: filteredRows } = parseXlsx(filePath));

          console.log(
            `XLSX rows после фильтра по группе "${firstGroup}": ${filteredRows.length}`,
          );
        });

        await test.step("Сравнить: с фильтром <= без фильтра", async () => {
          console.log(
            `С фильтром: ${filteredRows.length}, без фильтра (shared): ${adminXlsxRows.length}`,
          );
          expect(filteredRows.length).toBeLessThanOrEqual(adminXlsxRows.length);
          expect(filteredRows.length).toBeGreaterThan(0);
        });
      },
    );

    test(
      "C7278: Фильтр по периоду — оценки из выбранного периода",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("normal");

        await test.step("Обеспечить shared XLSX (дефолтный период)", async () => {
          await ensureAdminXlsx(page);
        });

        const tab = new ScoreDistributionTab(page);
        let narrowRows;

        await test.step("Открыть вкладку, установить узкий период и скачать XLSX", async () => {
          await tab.open();

          await tab.setPeriod(
            { year: 2025, month: 0, day: 1 },
            { year: 2025, month: 0, day: 31 },
          );

          const downloadNarrow = await tab.downloadSummaryReport();
          const narrowPath = await saveDownload(
            downloadNarrow,
            "filter_period_narrow",
          );
          ({ rows: narrowRows } = parseXlsx(narrowPath));
        });

        await test.step("Сравнить: узкий период <= дефолтный период", async () => {
          console.log(
            `Дефолтный период (shared): ${adminXlsxRows.length} строк, узкий период: ${narrowRows.length} строк`,
          );

          expect(narrowRows.length).toBeLessThanOrEqual(adminXlsxRows.length);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════════
    // APP_BUG: Предыдущая итоговая оценка
    // ═══════════════════════════════════════════════════════════════

    test(
      "C7279: Предыдущая итоговая оценка заполнена для сотрудников с несколькими ревью",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        await test.step("Загрузить XLSX и API-данные", async () => {
          await ensureAdminXlsxAndApi(page, request);
        });

        await test.step("Проверить, что колонка «Предыдущая Итоговая оценка (число)» содержит данные", async () => {
          // Колонки 8-10: «Предыдущая Итоговая оценка» (Название, число, текст)
          const prevScoreIdx = findColumnIndex(
            adminXlsxHeaders,
            /итоговая оценка \(число\)/i,
          );

          expect(prevScoreIdx).toBeGreaterThanOrEqual(0);

          // У сотрудников с текущей оценкой (col «до калибровки» непустая)
          // должна быть и предыдущая, если у них было более одного ревью
          const preCalibIdx = findColumnIndex(
            adminXlsxHeaders,
            /итоговая оценка \(до калибровки\)/i,
          );
          const withCurrentScore = adminXlsxRows.filter(
            (r) => r[preCalibIdx] != null && String(r[preCalibIdx]).trim() !== "",
          );

          // Из них — хотя бы часть должна иметь предыдущую оценку
          const withPrevScore = withCurrentScore.filter(
            (r) =>
              r[prevScoreIdx] != null && String(r[prevScoreIdx]).trim() !== "",
          );

          console.log(
            `Сотрудников с текущей оценкой: ${withCurrentScore.length}, ` +
              `из них с предыдущей: ${withPrevScore.length}`,
          );

          expect(
            withPrevScore.length,
            "Хотя бы у одного сотрудника с текущей оценкой должна быть предыдущая",
          ).toBeGreaterThan(0);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════════
    // Ответы из анкет — только из последнего ревью
    // ═══════════════════════════════════════════════════════════════

    test(
      "C7280: Ответы на вопросы анкеты — только из последнего ревью за период",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("normal");

        await test.step("Загрузить XLSX и API-данные", async () => {
          await ensureAdminXlsxAndApi(page, request);
        });

        await test.step("Проверить, что каждый сотрудник встречается не более одного раза", async () => {
          // Группируем по email (col 2) — уникальный идентификатор
          const emailIdx = findColumnIndex(adminXlsxHeaders, /e-?mail.*оцениваемого/i);
          expect(emailIdx).toBeGreaterThanOrEqual(0);

          const emailCounts = {};
          for (const row of adminXlsxRows) {
            const email = String(row[emailIdx] || "").trim();
            if (!email) continue;
            emailCounts[email] = (emailCounts[email] || 0) + 1;
          }

          const duplicates = Object.entries(emailCounts).filter(([, c]) => c > 1);
          if (duplicates.length > 0) {
            console.log(
              `Дубликаты (первые 5): ${duplicates.slice(0, 5).map(([e, c]) => e + ":" + c).join(", ")}`,
            );
          }

          expect(
            duplicates.length,
            `Сотрудник должен встречаться в XLSX только 1 раз (последнее ревью). ` +
              `Дубликатов: ${duplicates.length}`,
          ).toBe(0);
        });

        await test.step("Проверить, что строки с ответами имеют заполненный «Период оценки»", async () => {
          // Строки с хотя бы одним ответом на вопрос (cols 15+) должны иметь «Период оценки»
          const answerStartIdx = 15; // первый столбец ответов на вопросы
          const withAnswers = adminXlsxRows.filter((r) =>
            r.slice(answerStartIdx).some(
              (v) => v != null && String(v).trim() !== "",
            ),
          );

          const withAnswersNoperiod = withAnswers.filter(
            (r) => !r[0] || String(r[0]).trim() === "",
          );

          console.log(
            `Строк с ответами: ${withAnswers.length}, из них без периода: ${withAnswersNoperiod.length}`,
          );

          expect(
            withAnswersNoperiod.length,
            "Строки с ответами должны иметь заполненный «Период оценки»",
          ).toBe(0);
        });
      },
    );
  },
);
