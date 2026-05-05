// tests/functional/my-team/team-evaluation/team-eval-summary-export-access.spec.js
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
  "Оценка команды — доступ к сводному отчёту по ролям",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7363: Обычный сотрудник НЕ видит кнопку «Скачать сводный отчет»",
      { tag: ["@critical"] },
      async ({ userAuth: page }, testInfo) => {
        setSeverity("critical");

        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step("Перейти на страницу «Моя команда» по URL", async () => {
          // Для user без подчинённых пункт сайдбара может отсутствовать,
          // поэтому переходим напрямую по URL
          const baseUrl = process.env.BASE_URL;
          await page.goto(`${baseUrl}/ru/dashboard/?tab=performanceReview`, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
        });

        await test.step("Проверить, что кнопка скачивания не видна", async () => {
          // Вариант 1: страница «Моя команда» не открылась (редирект на главную)
          // Вариант 2: страница открылась, но кнопка не отображается
          const currentUrl = page.url();
          const isDashboard = currentUrl.includes("/dashboard");

          if (!isDashboard) {
            console.log(
              `✓ Пользователь перенаправлен с /dashboard/ на ${currentUrl} — доступа нет`,
            );
            return;
          }

          // Если страница дашборда открылась — проверяем отсутствие кнопки
          await myTeamPage.assertDownloadButtonNotVisible();
          console.log("✓ Кнопка «Скачать сводный отчет» не видна для user");
        });
      },
    );

    test(
      "C7259: Head видит и может скачать сводный отчёт",
      { tag: ["@critical"] },
      async ({ headAuth: page }, testInfo) => {
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

          const filePath = await saveDownload(download, "team_eval_head");
          const result = await pptxParser.parse(filePath);
          expect(result.total, "В файле должны быть слайды").toBeGreaterThan(0);
          console.log(
            `✓ Head: файл="${suggestedName}", ${result.total} слайдов`,
          );
        });
      },
    );
  },
);
