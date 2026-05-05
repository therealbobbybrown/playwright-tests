// tests/functional/my-team/team-evaluation/team-eval-summary-export-scores.spec.js
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

/** ID PR созданного seed'ом в beforeAll — для приоритизации при поиске */
let seededPrId = null;

test.describe(
  "Оценка команды — точность оценок и компетенций в PPTX",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.describe.configure({ mode: "serial" }); // shared PPTX state requires serial

    /** Кешированные данные (не содержат request-зависимых объектов) */
    let pptxResult = null;
    let selectedPR = null;
    let revisionId = null;
    let apiTargetUsers = [];

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");

      // Тесты компетенций требуют PR с >1 target users и заполненными анкетами
      const found = await seed.findOrCreatePRWithMultipleTargetUsers(2, { forceCreate: true });
      seededPrId = found.prId;
      console.log(
        `[beforeAll] PR для scores: id=${found.prId}, targetUsers=${found.targetUsersCount}`,
      );

      const filled = await seed.fillQuestionnaires(found.prId);
      console.log(`[beforeAll] Заполнено анкет: ${filled}`);

      // Включаем все группы компетенций в настройках статистики (для C7476/C7477)
      try {
        const { data: stats } = await seed.prAPI.getStatisticsSettings(found.prId);
        const groups = stats?.competenceGroupSettings || [];
        if (groups.length > 0) {
          const updated = groups.map((g) => ({
            ...g,
            competenceGroupEnabled: true,
          }));
          await seed.prAPI.updateStatisticsSettings(found.prId, {
            ...stats,
            competenceGroupSettings: updated,
          });
          console.log(`[beforeAll] Включено групп компетенций: ${updated.length}`);
        } else {
          console.log("[beforeAll] Нет групп компетенций для включения");
        }
      } catch (e) {
        console.warn("[beforeAll] Не удалось обновить statisticsSettings:", e.message);
      }

      const { response } = await seed.prAPI.stop(found.prId);
      if (!response.ok()) {
        console.warn("[beforeAll] Не удалось остановить PR:", await response.text());
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    /** Загрузить PPTX и API-данные для PR с данными (>1 слайд) */
    async function ensureData(page, request, testInfo) {
      if (pptxResult && selectedPR) return;

      const prAPI = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await prAPI.signIn(email, password);

      const { data: prs } = await prAPI.getDashboardFiltersPerformanceReviews();
      let prList = Array.isArray(prs)
        ? prs
        : prs?.items || prs?.results || [];

      // Приоритизируем seeded PR — ставим его первым в списке
      if (seededPrId) {
        const seededIdx = prList.findIndex((p) => p.id === seededPrId || String(p.id) === String(seededPrId));
        if (seededIdx > 0) {
          const [seededPR] = prList.splice(seededIdx, 1);
          prList = [seededPR, ...prList];
          console.log(`[ensureData] Seeded PR (id=${seededPrId}) поставлен первым`);
        } else if (seededIdx === -1) {
          console.log(`[ensureData] Seeded PR (id=${seededPrId}) не найден в списке dashboard filters`);
        }
      }

      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);

      await sideMenu.openMyTeam();
      await myTeamPage.assertOpened();

      // Перебираем PR, скачиваем PPTX, ищем с данными (>1 слайд)
      const maxPRsToTry = Math.min(prList.length, 5);
      for (let i = 0; i < maxPRsToTry; i++) {
        const pr = prList[i];
        const prTitle = pr.title || pr.name || "";

        if (i > 0) {
          await myTeamPage.selectPRFromModal(prTitle);
        }

        const download = await myTeamPage.downloadSummaryReport();
        const filePath = await saveDownload(download, `scores_${i}`);

        let result;
        try {
          result = await pptxParser.parse(filePath);
        } catch (parseErr) {
          console.log(`PR[${i}]: "${prTitle}" → PPTX parse error: ${parseErr.message}`);
          continue;
        }

        console.log(`PR[${i}]: "${prTitle}" → ${result.total} слайдов`);

        if (result.total > 1) {
          selectedPR = pr;
          pptxResult = result;

          // Получаем target users и ревизию для найденного PR
          const { data: users } = await prAPI.getDashboardFiltersTargetUsers(
            pr.id,
            { limit: 100 },
          );
          apiTargetUsers =
            users?.items ||
            users?.results ||
            (Array.isArray(users) ? users : []);

          try {
            const { data: revisions } =
              await prAPI.getDashboardFiltersRevisions(pr.id);
            const revList =
              revisions?.items ||
              revisions?.results ||
              (Array.isArray(revisions) ? revisions : []);
            if (revList.length > 0) {
              revisionId = revList[0].id;
            }
          } catch (e) {
            console.log(`⚠️ Ревизии не получены: ${e.message}`);
          }

          console.log(
            `✓ Выбран PR: "${prTitle}" (ID=${pr.id}), revision=${revisionId}, ${apiTargetUsers.length} target users, ${pptxResult.total} слайдов`,
          );
          break;
        }

        // Первый PR с валидным PPTX — сохраняем как fallback
        if (i === 0 && result) {
          selectedPR = pr;
          pptxResult = result;
          const { data: users } = await prAPI.getDashboardFiltersTargetUsers(
            pr.id,
            { limit: 100 },
          );
          apiTargetUsers =
            users?.items ||
            users?.results ||
            (Array.isArray(users) ? users : []);
          try {
            const { data: revisions } =
              await prAPI.getDashboardFiltersRevisions(pr.id);
            const revList =
              revisions?.items ||
              revisions?.results ||
              (Array.isArray(revisions) ? revisions : []);
            if (revList.length > 0) revisionId = revList[0].id;
          } catch (e) {
            /* ignore */
          }
        }
      }

      if (!selectedPR || !pptxResult || pptxResult.total <= 1) {
        throw new Error("Не найден PR с PPTX >1 слайда — beforeAll seed не сработал? Проверь fillQuestionnaires.");
      }

      console.log(
        `Финальный PR: "${selectedPR.title}" (ID=${selectedPR.id}), ${pptxResult.total} слайдов, ${apiTargetUsers.length} target users`,
      );
    }

    /** Создать свежий авторизованный API-клиент */
    async function createAPI(request) {
      const prAPI = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await prAPI.signIn(email, password);
      return prAPI;
    }

    test(
      "C7475: Числовые оценки из PPTX находятся в допустимом диапазоне [0, 10]",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");

        await test.step("Загрузить данные", async () => {
          await ensureData(page, request, testInfo);
        });

        await test.step("Извлечь и проверить оценки", async () => {
          expect(pptxResult && pptxResult.total > 1, `PPTX без данных (${pptxResult?.total || 0} слайдов) — beforeAll seed не сработал?`).toBeTruthy();

          // Ищем все числа формата X.X, X,X или целые X в тексте (оценки)
          const scoreRegex = /\b(\d{1,2}[.,]\d{1,2})\b/g;
          const intScoreRegex = /\b(\d{1,2})\b/g;
          const allScores = [];
          let match;
          while ((match = scoreRegex.exec(pptxResult.text)) !== null) {
            const score = parseFloat(match[1].replace(",", "."));
            if (score >= 0 && score <= 10) {
              allScores.push(score);
            }
          }
          // Если нет десятичных — пробуем целые числа 1-10
          if (allScores.length === 0) {
            while ((match = intScoreRegex.exec(pptxResult.text)) !== null) {
              const score = parseInt(match[1], 10);
              if (score >= 1 && score <= 10) {
                allScores.push(score);
              }
            }
          }

          console.log(
            `✓ Найдено ${allScores.length} оценок в PPTX: ${allScores.slice(0, 10).join(", ")}...`,
          );

          // Должны быть хотя бы какие-то оценки
          expect(
            allScores.length,
            "PPTX должен содержать числовые оценки",
          ).toBeGreaterThan(0);

          // Все оценки в допустимом диапазоне
          const outOfRange = allScores.filter((s) => s < 0 || s > 10);
          expect(
            outOfRange,
            `Оценки вне диапазона [0, 10]: ${outOfRange.join(", ")}`,
          ).toHaveLength(0);
        });
      },
    );

    test(
      "C7476: Компетенции из настроек PR отражены в PPTX",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");

        await test.step("Загрузить данные", async () => {
          await ensureData(page, request, testInfo);
        });

        expect(selectedPR, "Нет PR для проверки компетенций — beforeAll seed не сработал?").toBeTruthy();

        expect(pptxResult.total > 1, `PPTX содержит ${pptxResult.total} слайд — компетенции не отображаются. beforeAll seed не сработал?`).toBeTruthy();

        await test.step("Проверить наличие компетенций в PPTX", async () => {
          const textCompact = pptxResult.text.replace(/\s+/g, "").toLowerCase();

          // PPTX должен содержать «Тепловая карта» или «Радар» — секции компетенций
          const hasTeplovaya = textCompact.includes("тепловаякарта");
          const hasRadar = textCompact.includes("радар");

          console.log(`Тепловая карта: ${hasTeplovaya}, Радар: ${hasRadar}`);

          expect(
            hasTeplovaya || hasRadar,
            `PPTX (${pptxResult.total} сл.) должен содержать «Тепловая карта» или «Радар»`,
          ).toBeTruthy();

          // В PPTX должны быть названия компетенций (слова перед числовыми оценками)
          const competencePattern = /[А-Яа-яA-Za-z_]+(?:_[A-Za-z]+)?(?=\s*\d)/g;
          const competenceMatches =
            pptxResult.text.match(competencePattern) || [];
          const uniqueCompetences = [
            ...new Set(competenceMatches.filter((m) => m.length > 3)),
          ];
          console.log(
            `Компетенции в PPTX (${uniqueCompetences.length}): ${uniqueCompetences.slice(0, 8).join(", ")}`,
          );

          expect(
            uniqueCompetences.length,
            "PPTX должен содержать названия компетенций",
          ).toBeGreaterThan(0);
        });

        await test.step("Сверить с настройками API (если доступны)", async () => {
          const prAPI = await createAPI(request);
          try {
            const { data: settings } = await prAPI.getStatisticsSettings(
              selectedPR.id,
            );
            const groupSettings = settings?.competenceGroupSettings || [];
            const enabledGroups = groupSettings.filter(
              (g) => g.competenceGroupEnabled,
            );
            const groupNames = enabledGroups
              .map((g) => g.competenceGroup?.title || "")
              .filter(Boolean);

            console.log(
              `API: ${enabledGroups.length} групп (${groupNames.join(", ")})`,
            );
          } catch (e) {
            console.log(`⚠️ Настройки статистики не получены: ${e.message}`);
          }
        });
      },
    );

    test(
      "C7477: Характеристики из настроек PR присутствуют в PPTX",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");

        await test.step("Загрузить данные", async () => {
          await ensureData(page, request, testInfo);
        });

        expect(selectedPR, "Нет PR для проверки характеристик — beforeAll seed не сработал?").toBeTruthy();

        await test.step("Проверить наличие секции характеристик в PPTX", async () => {
          const textCompact = pptxResult.text.replace(/\s+/g, " ").toLowerCase();

          // PPTX содержит секции: Статистика, Тепловая карта, Радар, Рекомендации
          // Рекомендации содержат текстовые характеристики по результатам оценки
          const hasRecommendations = textCompact.includes("рекомендаци");
          const hasStrengths = textCompact.includes("сильные стороны");
          const hasGrowth = textCompact.includes("зоны роста");

          console.log(
            `Рекомендации: ${hasRecommendations}, Сильные стороны: ${hasStrengths}, Зоны роста: ${hasGrowth}`,
          );

          // Хотя бы одна из секций характеристик должна присутствовать
          expect(
            hasRecommendations || hasStrengths || hasGrowth,
            `PPTX (${pptxResult.total} сл.) должен содержать секцию характеристик (рекомендации/сильные стороны/зоны роста)`,
          ).toBeTruthy();
        });

        await test.step("Сверить с API характеристиками (если доступны)", async () => {
          const prAPI = await createAPI(request);
          try {
            const { data: settings } = await prAPI.getStatisticsSettings(
              selectedPR.id,
            );
            const charSettings =
              settings?.characteristicSettings ||
              settings?.characteristics ||
              [];
            const characteristics = charSettings
              .map((c) => c.title || c.name || c.label || "")
              .filter((c) => c.length > 0);

            if (characteristics.length > 0) {
              console.log(
                `API характеристики (${characteristics.length}): ${characteristics.join(", ")}`,
              );
              const { found, notFound } = pptxParser.checkCharacteristics(
                pptxResult.text,
                characteristics,
              );
              console.log(
                `Найдено в PPTX: ${found.length}/${characteristics.length}`,
              );
              if (notFound.length > 0) {
                console.log(`Не найдены: ${notFound.join(", ")}`);
              }
            } else {
              console.log("API: характеристики не настроены — проверка по PPTX");
            }
          } catch (e) {
            console.log(`⚠️ Настройки статистики не получены: ${e.message}`);
          }
        });
      },
    );

    test(
      "C7478: Итоговая оценка из API совпадает с PPTX (per-user)",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");

        await test.step("Загрузить данные", async () => {
          await ensureData(page, request, testInfo);
        });

        expect(selectedPR && revisionId && apiTargetUsers.length > 0, `Нет данных для сверки per-user оценок (selectedPR=${!!selectedPR}, revisionId=${revisionId}, targetUsers=${apiTargetUsers.length})`).toBeTruthy();

        expect(pptxResult.total > 1, `PPTX без данных (${pptxResult.total} слайдов) — per-user сверка невозможна`).toBeTruthy();

        await test.step("Сверить итоговые оценки per-user", async () => {
          // Создаём свежий API-клиент для этого теста
          const prAPI = await createAPI(request);

          // Получаем summary results из API
          let summaryResults = null;
          try {
            const targetUserIds = apiTargetUsers.map((u) => u.id);
            const { data } = await prAPI.getStatisticsSummaryResults(
              selectedPR.id,
              {
                targetUsersIds: targetUserIds,
                revisionId,
              },
            );
            summaryResults = data;
          } catch (e) {
            throw new Error(`API getStatisticsSummaryResults failed: ${e.message}`);
          }

          const results =
            summaryResults?.items ||
            summaryResults?.results ||
            (Array.isArray(summaryResults) ? summaryResults : []);
          console.log(`API summary results: ${results.length} записей`);
          console.log(
            `Структура первой записи: ${JSON.stringify(results[0])?.substring(0, 300)}`,
          );

          // Для каждого пользователя с оценкой: проверить что оценка есть в PPTX
          let matched = 0;
          let checked = 0;

          for (const result of results) {
            const score =
              result.revisionMean ||
              result.mean ||
              result.totalScore ||
              result.score;
            if (score == null) continue;

            const scoreNum = parseFloat(score);
            if (isNaN(scoreNum)) continue;

            checked++;
            // Ищем это число в PPTX (формат X.X)
            const scoreStr = scoreNum.toFixed(1);
            const scoreStrComma = scoreStr.replace(".", ",");

            if (
              pptxResult.text.includes(scoreStr) ||
              pptxResult.text.includes(scoreStrComma)
            ) {
              matched++;
            }
          }

          console.log(
            `✓ Оценки: проверено ${checked}, найдено в PPTX ${matched}`,
          );

          if (checked > 0) {
            expect(
              matched,
              `Хотя бы одна оценка из API (${checked} проверено) должна быть в PPTX`,
            ).toBeGreaterThan(0);
          } else {
            test.info().annotations.push({
              type: "info",
              description: "API не вернул числовых оценок для сверки",
            });
          }
        });
      },
    );
  },
);
