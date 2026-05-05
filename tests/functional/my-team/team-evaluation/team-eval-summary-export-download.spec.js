// tests/functional/my-team/team-evaluation/team-eval-summary-export-download.spec.js
import { test, expect } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { saveDownload } from "../../../utils/xlsx-helpers.js";
import { PPTXParser } from "../../../utils/report-parsers/PPTXParser.js";

const pptxParser = new PPTXParser();

test.describe(
  "Оценка команды — скачивание сводного отчёта",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7373: Кнопка «Скачать сводный отчет» видна на вкладке «Оценка команды»",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step("Открыть «Моя команда»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Проверить видимость кнопки «Скачать сводный отчет»", async () => {
          await myTeamPage.assertDownloadButtonVisible();
        });
      },
    );

    test(
      "C7374: Клик по кнопке скачивает PPTX файл",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step("Открыть «Моя команда»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        let download;
        await test.step("Скачать сводный отчёт", async () => {
          download = await myTeamPage.downloadSummaryReport();
        });

        await test.step("Проверить имя файла и расширение .pptx", async () => {
          const suggestedName = download.suggestedFilename();
          expect(suggestedName).toBeTruthy();
          expect(suggestedName).toMatch(/\.pptx$/i);
          console.log(`✓ Имя файла: ${suggestedName}`);
        });

        await test.step("Сохранить файл и проверить, что он парсируется", async () => {
          const filePath = await saveDownload(download, "team_eval_download");
          const result = await pptxParser.parse(filePath);

          console.log(`PPTX: слайдов=${result.total}`);
          for (const slide of result.slides) {
            console.log(
              `  Слайд ${slide.slideNum}: ${slide.text.substring(0, 200)}`,
            );
          }

          expect(result.total, "В файле должны быть слайды").toBeGreaterThan(0);
          expect(
            result.text.length,
            "Текст не должен быть пустым",
          ).toBeGreaterThan(0);
        });
      },
    );

    test(
      "C7375: Имя файла содержит название оценки",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step("Открыть «Моя команда»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Скачать сводный отчёт и проверить имя файла", async () => {
          const download = await myTeamPage.downloadSummaryReport();
          const suggestedName = decodeURIComponent(
            download.suggestedFilename(),
          );
          console.log(`✓ Имя файла (decoded): ${suggestedName}`);
          // Имя файла содержит «Результаты оценки» и расширение .pptx
          expect(suggestedName).toMatch(/результат.*оценк/i);
          expect(suggestedName).toMatch(/\.pptx$/i);
        });
      },
    );

    test(
      "C7258: Руководитель видит и может скачать сводный отчёт",
      { tag: ["@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("critical");

        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step("Открыть «Моя команда»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Проверить видимость кнопки", async () => {
          await myTeamPage.assertDownloadButtonVisible();
        });

        await test.step("Скачать и проверить файл", async () => {
          const download = await myTeamPage.downloadSummaryReport();
          const suggestedName = download.suggestedFilename();

          expect(suggestedName).toBeTruthy();
          expect(suggestedName).toMatch(/\.pptx$/i);

          const filePath = await saveDownload(download, "team_eval_manager");
          const result = await pptxParser.parse(filePath);
          expect(result.total, "В файле должны быть слайды").toBeGreaterThan(0);
        });
      },
    );
  },
);
