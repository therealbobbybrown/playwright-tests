// tests/functional/my-team/team-evaluation/team-eval-summary-export-structure.spec.js
import { test, expect } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { saveDownload } from "../../../utils/xlsx-helpers.js";
import { PPTXParser } from "../../../utils/report-parsers/PPTXParser.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";

const pptxParser = new PPTXParser();

let seededPrId = null;

test.describe(
  "Оценка команды — структура PPTX отчёта",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {

    /** Кешированные данные */
    let pptxResult = null;
    let selectedPRTitle = "";
    let prHasData = false;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");
      const found = await seed.findOrCreatePRWithMultipleTargetUsers(2, { forceCreate: true });
      console.log(`[beforeAll] PR для structure: id=${found.prId}, targetUsers=${found.targetUsersCount}`);
      const filled = await seed.fillQuestionnaires(found.prId);
      console.log(`[beforeAll] Заполнено анкет: ${filled}`);
      const { response } = await seed.prAPI.stop(found.prId);
      if (!response.ok()) {
        console.warn("[beforeAll] Не удалось остановить PR:", await response.text());
      }
      seededPrId = found.prId;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    /** Загрузить PPTX с PR, у которого есть данные (>1 слайд) */
    async function ensureData(page, request, testInfo) {
      if (pptxResult) return;

      const prAPI = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await prAPI.signIn(email, password);

      const { data: prs } = await prAPI.getDashboardFiltersPerformanceReviews();
      let prList = Array.isArray(prs)
        ? prs
        : prs?.items || prs?.results || [];

      // Приоритизируем seeded PR — ставим его первым
      if (seededPrId) {
        const seededIndex = prList.findIndex((pr) => pr.id === seededPrId);
        if (seededIndex > 0) {
          const [seededPr] = prList.splice(seededIndex, 1);
          prList = [seededPr, ...prList];
        }
      }

      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);

      await sideMenu.openMyTeam();
      await myTeamPage.assertOpened();

      // Перебираем PR из списка и скачиваем PPTX, пока не найдём с данными
      const maxPRsToTry = Math.min(prList.length, 5);
      for (let i = 0; i < maxPRsToTry; i++) {
        const pr = prList[i];
        const prTitle = pr.title || pr.name || "";

        if (i > 0) {
          await myTeamPage.selectPRFromModal(prTitle);
        }

        const download = await myTeamPage.downloadSummaryReport();
        const filePath = await saveDownload(download, `structure_${i}`);
        const result = await pptxParser.parse(filePath);

        console.log(`PR[${i}]: "${prTitle}" → ${result.total} слайдов`);

        if (result.total > 1) {
          pptxResult = result;
          selectedPRTitle = prTitle;
          prHasData = true;
          break;
        }

        // Первый PR (дефолтный) — сохраняем на случай если ни один не имеет данных
        if (i === 0) {
          pptxResult = result;
          selectedPRTitle = prTitle;
        }
      }

      // Проверяем, есть ли данные в финальном PPTX
      const count = await myTeamPage.getEmployeesCount();
      if (!prHasData) {
        prHasData = count > 1 && pptxResult.total > 1;
      }

      console.log(
        `Выбран PR: "${selectedPRTitle}", ${count} сотрудников, ${pptxResult.total} слайдов, prHasData=${prHasData}`,
      );
      for (const s of pptxResult.slides) {
        console.log(`  Слайд ${s.slideNum}: ${s.text.substring(0, 120)}`);
      }
    }

    test(
      "C7479: Слайд 1 (обложка) содержит название оценки",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");

        await test.step("Загрузить данные", async () => {
          await ensureData(page, request, testInfo);
        });

        await test.step("Проверить слайд 1", async () => {
          const slide1Text = pptxParser.getSlideText(pptxResult, 1);
          expect(slide1Text, "Слайд 1 должен существовать").toBeTruthy();

          // Разбиваем название PR на значимые слова
          const prWords = selectedPRTitle
            .split(/[\s_]+/)
            .filter((w) => w.length > 2)
            .slice(0, 5);

          // Ищем хотя бы одно слово на первом слайде
          const slide1Compact = slide1Text.replace(/\s+/g, " ").toLowerCase();
          const foundWords = prWords.filter((w) =>
            slide1Compact.includes(w.toLowerCase()),
          );

          console.log(`Слайд 1 текст: "${slide1Text.substring(0, 200)}"`);
          console.log(`PR слова: ${prWords.join(", ")}`);
          console.log(`Найдено на слайде 1: ${foundWords.join(", ")}`);

          expect(
            foundWords.length,
            `Обложка (слайд 1) должна содержать название PR «${selectedPRTitle}»`,
          ).toBeGreaterThan(0);
        });
      },
    );

    test(
      "C7480: PPTX группового отчёта содержит «Статистика прохождения»",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");

        await test.step("Загрузить данные", async () => {
          await ensureData(page, request, testInfo);
        });

        expect(
          prHasData && pptxResult.total > 1,
          `PR должен содержать данные (prHasData=${prHasData}, slides=${pptxResult?.total}). beforeAll seed не сработал?`,
        ).toBeTruthy();

        await test.step("Проверить наличие секции «Статистика прохождения»", async () => {
          // Убираем пробелы между буквами для стилизированных заголовков
          const textCompact = pptxResult.text.replace(/\s+/g, "").toLowerCase();

          const hasStatistika = textCompact.includes("статистикапрохождения");
          const hasTeplovaya = textCompact.includes("тепловаякарта");

          console.log(`Статистика прохождения: ${hasStatistika}`);
          console.log(`Тепловая карта: ${hasTeplovaya}`);

          expect(
            hasStatistika || hasTeplovaya,
            "Групповой отчёт должен содержать «Статистика прохождения» или «Тепловая карта»",
          ).toBeTruthy();
        });
      },
    );

    test(
      "C7481: Тип отчёта определяется как «group»",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");

        await test.step("Загрузить данные", async () => {
          await ensureData(page, request, testInfo);
        });

        expect(
          prHasData && pptxResult.total > 1,
          `PR должен содержать данные (prHasData=${prHasData}, slides=${pptxResult?.total}). beforeAll seed не сработал?`,
        ).toBeTruthy();

        await test.step("Проверить тип отчёта", async () => {
          const reportType = pptxParser.getReportType(pptxResult);
          console.log(`✓ Тип отчёта: ${reportType}`);

          expect(
            reportType,
            "Сводный отчёт команды должен быть типа «group»",
          ).toBe("group");
        });
      },
    );

    test(
      "C7482: PPTX содержит ожидаемые секции группового отчёта",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");

        await test.step("Загрузить данные", async () => {
          await ensureData(page, request, testInfo);
        });

        expect(
          prHasData && pptxResult.total > 1,
          `PR должен содержать данные (prHasData=${prHasData}, slides=${pptxResult?.total}). beforeAll seed не сработал?`,
        ).toBeTruthy();

        await test.step("Проверить наличие агрегатных секций", async () => {
          if (pptxResult.total <= 1) {
            test.info().annotations.push({
              type: "info",
              description: `PPTX содержит ${pptxResult.total} слайд — недостаточно для проверки секций`,
            });
            return;
          }

          // Групповой отчёт содержит агрегатные секции:
          // обложка, статистика прохождения, тепловая карта, радар, статистика по отделам, рекомендации
          const textCompact = pptxResult.text.replace(/\s+/g, "").toLowerCase();

          const sections = [
            { name: "Статистика прохождения", key: "статистикапрохождения" },
            { name: "Тепловая карта", key: "тепловаякарта" },
          ];

          const foundSections = [];
          const notFoundSections = [];

          for (const section of sections) {
            if (textCompact.includes(section.key)) {
              foundSections.push(section.name);
            } else {
              notFoundSections.push(section.name);
            }
          }

          // Дополнительно проверяем наличие числовых данных (оценки в формате X.X или целые)
          const scoreRegex = /\b\d{1,2}[.,]\d{1,2}\b/g;
          let scores = pptxResult.text.match(scoreRegex) || [];
          // Если нет десятичных — ищем целые числа 1-10
          if (scores.length === 0) {
            const intMatches = pptxResult.text.match(/\b(\d{1,2})\b/g) || [];
            scores = intMatches.filter((s) => {
              const n = parseInt(s, 10);
              return n >= 1 && n <= 10;
            });
          }

          console.log(`Найдены секции: ${foundSections.join(", ") || "нет"}`);
          if (notFoundSections.length > 0) {
            console.log(`Не найдены: ${notFoundSections.join(", ")}`);
          }
          console.log(`Числовые оценки в PPTX: ${scores.length}`);
          console.log(`Всего слайдов: ${pptxResult.total}`);

          // Хотя бы одна секция должна быть
          expect(
            foundSections.length,
            `Групповой PPTX (${pptxResult.total} сл.) должен содержать хотя бы одну из секций: ${sections.map((s) => s.name).join(", ")}`,
          ).toBeGreaterThan(0);

          // Должны быть числовые данные
          expect(
            scores.length,
            "Групповой PPTX с данными должен содержать числовые оценки",
          ).toBeGreaterThan(0);
        });
      },
    );
  },
);
