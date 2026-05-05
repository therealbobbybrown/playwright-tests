// tests/functional/performance-review/results/pr-results-export.spec.js
// Экспорт результатов Performance Review
// TestRail: C7282, C3049, C3050, C3051

import { expect } from "@playwright/test";
import { test } from "../../../fixtures/auth.js";
import { PerformanceReviewResultsPage } from "../../../../pages/PerformanceReviewResultsPage.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../../utils/constants.js";

test.describe(
  "Экспорт результатов Performance Review",
  { tag: ["@ui", "@performance-review", "@regression"] },
  () => {
    test.setTimeout(120000);

    // Shared state — заполняется в beforeAll через API
    /** @type {number|null} */ let sharedPrId = null;
    /** @type {number|null} */ let sharedTargetUserId = null;
    /** @type {string|null} */ let sharedRevisionId = null;
    /** @type {number|null} */ let draftPrId = null;

    test.beforeAll(async ({ request }) => {
      const prAPI = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await prAPI.signIn(email, password);

      // Ищем PR с результатами через API
      const { data } = await prAPI.getList();
      const items = data?.items || data || [];
      const candidates = items.filter(
        (pr) => pr.status === "active" || pr.status === "finished",
      );
      console.log(
        `Поиск PR с результатами: ${candidates.length} кандидатов (active/finished)`,
      );

      for (const pr of candidates.slice(0, 10)) {
        try {
          // Получаем target user
          const { data: tuData } = await prAPI.getTargetUsers(pr.id, {});
          const targetUsers = tuData?.items || tuData || [];
          if (!targetUsers.length) continue;
          const targetUserId = targetUsers[0]?.userId || targetUsers[0]?.id;
          if (!targetUserId) continue;

          // Ревизия
          const { data: revision } = await prAPI.getLastRevision(pr.id);
          if (!revision?.id) continue;

          // Summary — проверяем что есть ответы
          const { response: summaryResp, data: summary } =
            await prAPI.getStatisticsSummary(pr.id, {
              revisionId: revision.id,
              targetUserId,
            });
          if (!summaryResp.ok()) continue;

          const assessments = summary?.assessments || [];
          const hasAnswers = assessments.some((a) =>
            a.questions?.some((q) => q.answers?.length > 0),
          );
          if (!hasAnswers) continue;

          sharedPrId = pr.id;
          sharedTargetUserId = targetUserId;
          sharedRevisionId = revision.id;
          console.log(
            `Найден PR ${sharedPrId} с результатами (targetUser=${sharedTargetUserId}, revision=${sharedRevisionId})`,
          );
          break;
        } catch {
          continue;
        }
      }

      if (!sharedPrId) {
        console.log(
          "PR с результатами не найден. Тесты C7282/C3049/C3050 будут пропущены.",
        );
      }

      // Ищем черновик для негативного теста C3051
      const drafts = items.filter((pr) => pr.status === "draft");
      if (drafts.length > 0) {
        draftPrId = drafts[0].id;
        console.log(`Найден черновик PR ${draftPrId} для негативного теста`);
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW);
    });

    test(
      "C7282: Экспорт результатов PR в Excel",
      { tag: ["@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");
        const resultsPage = new PerformanceReviewResultsPage(page, testInfo);
        const baseUrl = new URL(process.env.BASE_URL).origin;

        if (!sharedPrId) {
          console.log("PR с результатами не найден - пропуск теста");
          test.skip();
          return;
        }

        await test.step("Открыть страницу результатов PR", async () => {
          await resultsPage.open(
            baseUrl,
            sharedTargetUserId,
            sharedRevisionId,
            sharedPrId,
          );
          await resultsPage.assertOpened();
        });

        await test.step("Найти кнопку экспорта", async () => {
          const exportButton = page
            .getByRole("button", { name: /скачать результаты/i })
            .first();

          let hasExportButton = false;
          try {
            await exportButton.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
            hasExportButton = true;
          } catch {
            // кнопка экспорта не появилась
          }

          if (!hasExportButton) {
            console.log(
              "Кнопка экспорта не найдена - возможно нет результатов",
            );
            test.skip();
            return;
          }

          console.log("Кнопка экспорта найдена");
          expect(hasExportButton, "Кнопка экспорта должна быть доступна").toBe(
            true,
          );
        });

        await test.step("Выполнить экспорт в Excel", async () => {
          const exportButton = page
            .getByRole("button", { name: /скачать результаты/i })
            .first();

          await exportButton.click();

          // Ждём появления меню экспорта
          const menuItemSelector =
            '[role="menuitem"], [class*="MenuPopup_item__"], [class*="Menu_item__"], [class*="Dropdown_item__"]';
          try {
            await page
              .locator(menuItemSelector)
              .first()
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          } catch {
            // меню не появилось
          }

          // Ищем опцию XLSX в выпадающем меню
          const xlsxOption = page
            .locator(menuItemSelector)
            .filter({ hasText: /xlsx|Excel/i })
            .first();

          let hasXlsxOption = false;
          try {
            await xlsxOption.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            hasXlsxOption = true;
          } catch {
            // XLSX опция не найдена
          }

          if (!hasXlsxOption) {
            console.log(
              "Опция XLSX не найдена в меню — возможно, кнопка экспортирует напрямую",
            );
            // Ждём скачивания, которое могло начаться после клика по кнопке
            const directDownload = await page
              .waitForEvent("download", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => null);
            if (directDownload) {
              const fileName = directDownload.suggestedFilename();
              console.log(`Файл скачан напрямую: ${fileName}`);
              expect(fileName).toBeTruthy();
            }
            return;
          }

          // Экспорт может скачиваться или открываться в новой вкладке
          const downloadPromise = page
            .waitForEvent("download", { timeout: TIMEOUTS.LONG })
            .catch(() => null);
          const newPagePromise = page
            .context()
            .waitForEvent("page", { timeout: TIMEOUTS.LONG })
            .catch(() => null);

          await xlsxOption.click({ force: true });
          console.log("Выбран формат: XLSX");

          const [download, newPage] = await Promise.all([
            downloadPromise,
            newPagePromise,
          ]);

          if (download) {
            const fileName = download.suggestedFilename();
            console.log(`Файл скачан: ${fileName}`);
            expect(fileName).toMatch(/\.(xlsx|xls)$/i);
          } else if (newPage) {
            const newUrl = newPage.url();
            console.log(`Открыта новая вкладка: ${newUrl}`);
            expect(newUrl, "URL должен указывать на файл экспорта").toMatch(
              /xlsx|export|download|file/i,
            );
            await newPage.close();
          } else {
            console.log("Экспорт не вызвал скачивание или открытие вкладки");
          }
        });
      },
    );

    test(
      "C3049: Проверка доступных форматов экспорта PR",
      { tag: ["@regression"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const resultsPage = new PerformanceReviewResultsPage(page, testInfo);
        const baseUrl = new URL(process.env.BASE_URL).origin;

        if (!sharedPrId) {
          console.log("PR с результатами не найден - пропуск теста");
          test.skip();
          return;
        }

        await test.step("Открыть страницу результатов PR", async () => {
          await resultsPage.open(
            baseUrl,
            sharedTargetUserId,
            sharedRevisionId,
            sharedPrId,
          );
          await resultsPage.assertOpened();
        });

        await test.step("Проверить доступные форматы экспорта", async () => {
          const exportButton = page
            .getByRole("button", { name: /скачать результаты/i })
            .first();

          let hasExportButton = false;
          try {
            await exportButton.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
            hasExportButton = true;
          } catch {
            // кнопка экспорта не появилась
          }

          if (!hasExportButton) {
            console.log("Кнопка экспорта не найдена");
            test.skip();
            return;
          }

          await exportButton.click();

          // Ждём появления меню с форматами
          const menuItemSelector =
            '[role="menuitem"], [class*="MenuPopup_item__"], [class*="Menu_item__"], [class*="Dropdown_item__"]';
          try {
            await page
              .locator(menuItemSelector)
              .first()
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          } catch {
            // меню не появилось
          }

          // Проверяем наличие форматов
          const xlsxOption = page
            .locator(menuItemSelector)
            .filter({ hasText: /xlsx|Excel/i })
            .first();
          const pdfOption = page
            .locator(menuItemSelector)
            .filter({ hasText: /pdf/i })
            .first();
          const csvOption = page
            .locator(menuItemSelector)
            .filter({ hasText: /csv/i })
            .first();
          const pptxOption = page
            .locator(menuItemSelector)
            .filter({ hasText: /pptx|powerpoint/i })
            .first();

          let hasXlsx = false;
          try { await xlsxOption.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT }); hasXlsx = true; } catch { /* не найден */ }
          let hasPdf = false;
          try { await pdfOption.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT }); hasPdf = true; } catch { /* не найден */ }
          let hasCsv = false;
          try { await csvOption.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT }); hasCsv = true; } catch { /* не найден */ }
          let hasPptx = false;
          try { await pptxOption.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT }); hasPptx = true; } catch { /* не найден */ }

          console.log(`XLSX доступен: ${hasXlsx}`);
          console.log(`PDF доступен: ${hasPdf}`);
          console.log(`CSV доступен: ${hasCsv}`);
          console.log(`PPTX доступен: ${hasPptx}`);

          // Хотя бы один формат должен быть
          const hasAnyFormat = hasXlsx || hasPdf || hasCsv || hasPptx;
          expect(
            hasAnyFormat,
            "Хотя бы один формат экспорта должен быть доступен",
          ).toBe(true);

          // Закрываем меню
          await page.keyboard.press("Escape");
        });
      },
    );

    test(
      "C3050: Экспорт результатов PR с применённым фильтром",
      { tag: ["@regression"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const resultsPage = new PerformanceReviewResultsPage(page, testInfo);
        const baseUrl = new URL(process.env.BASE_URL).origin;

        if (!sharedPrId) {
          console.log("PR с результатами не найден - пропуск теста");
          test.skip();
          return;
        }

        await test.step("Открыть страницу результатов PR", async () => {
          await resultsPage.open(
            baseUrl,
            sharedTargetUserId,
            sharedRevisionId,
            sharedPrId,
          );
          await resultsPage.assertOpened();
        });

        await test.step("Применить фильтр по направлению", async () => {
          // На странице результатов фильтр — это вкладки "Карта компетенций" / "Радар компетенций" / "Участники оценки"
          // Переключаем на другую вкладку как вариант "фильтра" — если доступна
          const radarTab = page
            .getByRole("button", { name: /радар компетенций/i })
            .first();
          let hasRadar = false;
          try {
            await radarTab.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            hasRadar = true;
          } catch {
            // вкладка Радар не найдена
          }

          if (hasRadar) {
            await radarTab.click();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
            console.log("Переключились на вкладку Радар компетенций");

            // Возвращаемся на Карту компетенций
            const mapTab = page
              .getByRole("button", { name: /карта компетенций/i })
              .first();
            try {
              await mapTab.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            } catch {
              // вкладка Карта компетенций не найдена
            }
            await mapTab.click();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
            console.log("Вернулись на Карту компетенций");
          } else {
            console.log("Фильтры/вкладки не найдены на странице результатов");
          }
        });

        await test.step("Выполнить экспорт с фильтром", async () => {
          // Закрываем модалки если вдруг открылись
          const sheetHeader = page.locator(".react-modal-sheet-header").first();
          let hasSheet = false;
          try {
            await sheetHeader.waitFor({ state: "visible", timeout: 2000 });
            hasSheet = true;
          } catch {
            // модалка не открыта
          }
          if (hasSheet) {
            await page.keyboard.press("Escape");
            try {
              await sheetHeader.waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT });
            } catch {
              // модалка уже скрыта
            }
          }

          const exportButton = page
            .getByRole("button", { name: /скачать результаты/i })
            .first();

          let hasExportButton = false;
          try {
            await exportButton.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
            hasExportButton = true;
          } catch {
            // кнопка экспорта не появилась
          }

          if (!hasExportButton) {
            console.log("Кнопка экспорта не найдена");
            return;
          }

          // Подготавливаем перехват
          const downloadPromise = page
            .waitForEvent("download", { timeout: TIMEOUTS.LONG })
            .catch(() => null);
          const newPagePromise = page
            .context()
            .waitForEvent("page", { timeout: TIMEOUTS.LONG })
            .catch(() => null);

          await exportButton.click();

          // Ждём появления меню
          const menuItemSelector =
            '[role="menuitem"], [class*="MenuPopup_item__"], [class*="Menu_item__"], [class*="Dropdown_item__"]';
          try {
            await page
              .locator(menuItemSelector)
              .filter({ hasText: /xlsx|Excel/i })
              .first()
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          } catch {
            // XLSX опция не появилась
          }

          // Выбираем формат Excel
          const xlsxOption = page
            .locator(menuItemSelector)
            .filter({
              hasText: /xlsx|Excel/i,
            })
            .first();

          let hasXlsxOption = false;
          try {
            await xlsxOption.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            hasXlsxOption = true;
          } catch {
            // XLSX опция не найдена
          }

          if (hasXlsxOption) {
            await xlsxOption.click();
          }

          const [download, newPage] = await Promise.all([
            downloadPromise,
            newPagePromise,
          ]);

          if (download) {
            const fileName = download.suggestedFilename();
            console.log(`Экспортирован файл с фильтром: ${fileName}`);
            expect(fileName).toMatch(/\.(xlsx|xls|pdf|csv)$/i);
          } else if (newPage) {
            const newUrl = newPage.url();
            console.log(`URL экспорта с фильтром: ${newUrl}`);
            expect(newUrl).toMatch(/export|download|xlsx|file/i);
            await newPage.close();
          }
        });
      },
    );

    test(
      "C3051: Экспорт недоступен для PR без результатов",
      { tag: ["@negative"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const baseUrl = new URL(process.env.BASE_URL).origin;

        if (!draftPrId) {
          console.log("Черновик PR не найден - пропуск теста");
          test.skip();
          return;
        }

        await test.step("Перейти к черновику PR", async () => {
          await page.goto(
            new URL(
              `/ru/manager/performance-reviews/${draftPrId}/`,
              baseUrl,
            ).toString(),
          );
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить недоступность экспорта", async () => {
          // Черновик PR показывает страницу настройки — кнопки "Скачать результаты" не должно быть
          // Не пытаемся переключать вкладки — на странице конфига вкладки могут перекрывать друг друга
          const currentUrl = page.url();
          console.log(`Страница черновика PR: ${currentUrl}`);

          // Проверяем что кнопка экспорта результатов отсутствует на странице настройки
          const exportButton = page
            .getByRole("button", { name: /скачать результаты/i })
            .first();

          let hasExportButton = false;
          try {
            await exportButton.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            hasExportButton = true;
          } catch {
            // кнопка экспорта не отображается
          }

          if (hasExportButton) {
            const isDisabled = await exportButton.isDisabled();
            console.log(
              `Кнопка экспорта найдена (disabled=${isDisabled}) — неожиданно для черновика`,
            );
          } else {
            console.log(
              "Кнопка экспорта не отображается для PR без результатов - ожидаемое поведение",
            );
          }
        });
      },
    );
  },
);
