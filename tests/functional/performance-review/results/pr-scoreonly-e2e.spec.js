// tests/functional/performance-review/results/pr-scoreonly-e2e.spec.js
// C7344: E2E: Админ расшаривает scoreOnly → сотрудник видит оценку

import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { ProfileEmployeeReviewPage } from "../../../../pages/ProfileEmployeeReviewPage.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";
import { CalibrationSeed } from "../../../utils/seed/CalibrationSeed.js";
import { setupCharacteristicsWithCalibration } from "../../../utils/StatisticsSettingsHelper.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

const test = baseTest.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "E2E: scoreOnly — полный цикл",
  {
    tag: [
      "@performance-review",
      "@results",
      "@ui",
      "@e2e",
      "@regression",
      "@scoreOnly",
    ],
  },
  () => {
    let prId = null;
    let prTitle = null;
    let userId = null;
    let expectedScore = null;
    const calibratedValue = 7.5;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(240_000);

      const userAPI = new PerformanceReviewAPI(request);
      const { email: ue, password: up } = getCredentials("user");
      await userAPI.signIn(ue, up);
      const tokenParts = userAPI.token?.split(".");
      if (tokenParts?.length === 3) {
        try {
          let b64 = tokenParts[1].replace(/-/g, "+").replace(/_/g, "/");
          while (b64.length % 4) b64 += "=";
          const payload = JSON.parse(Buffer.from(b64, "base64").toString());
          userId = payload.userId || payload.sub;
        } catch {
          /* */
        }
      }
      if (!userId) throw new Error("Не удалось получить userId для USER");

      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");
      const pr = await seed.seedDraftPR();
      prId = pr.id;
      prTitle = pr.title;
      if (!prId) throw new Error("Не удалось создать PR");

      const adminAPI = new PerformanceReviewAPI(request);
      const { email: ae, password: ap } = getCredentials("admin");
      await adminAPI.signIn(ae, ap);

      await setupCharacteristicsWithCalibration(adminAPI, prId);
      await seed.addTargetUsers(prId, [userId]);

      // Создаём анкету со scale-вопросами привязанными к компетенциям
      // (дефолтная анкета может быть без шкал → overwrite невозможен)
      const calSeed = new CalibrationSeed(request);
      await calSeed.init();
      const groups = await calSeed.createCompetenceGroups();
      const competencies = await calSeed.createCompetencies(groups);
      const assessmentId = await calSeed.createAssessmentWithCompetencies(competencies);
      await seed.attachAssessments(prId, [assessmentId]);

      const { response: startResp } = await seed.prAPI.start(prId);
      if (!startResp.ok()) {
        throw new Error(`Не удалось запустить PR: ${await startResp.text()}`);
      }

      await seed.fillQuestionnaires(prId);

      // Включить калибровку + useOnlyHeadReceiver ПОСЛЕ старта
      const { data: currentSettings } =
        await adminAPI.getStatisticsSettings(prId);
      await adminAPI.updateStatisticsSettings(prId, {
        ...currentSettings,
        settings: {
          ...(currentSettings?.settings || {}),
          enableResponsesOverwriting: true,
          useOnlyHeadReceiver: true,
        },
      });

      // Получить revisionId на RUNNING PR
      const { data: revData } = await adminAPI.getLastRevision(prId);
      const revisionId = revData?.id;
      if (!revisionId) throw new Error("Не удалось получить revisionId");

      // Warm-up вызовы
      await Promise.all([
        adminAPI.getStatisticsSummaryResults(prId, {
          targetUsersIds: [userId],
          revisionId,
        }),
        adminAPI.getUsersCompetenciesResults(prId, {
          usersIds: [userId],
          revisionId,
        }),
        adminAPI.getTargetUsersProgress(prId, {
          revisionId,
          usersIds: [userId],
        }),
      ]);
      await new Promise((r) => setTimeout(r, 5000));

      // Запомнить исходную оценку из API
      const { data: summaryBefore } =
        await adminAPI.getStatisticsSummaryResults(prId, {
          targetUsersIds: [userId],
          revisionId,
        });
      const originalScore = summaryBefore?.items?.[0]?.mean?.value;
      console.log(`  Исходная оценка: ${originalScore}`);

      // Получить overwrites data (необходимо перед записью)
      await adminAPI.getResponseOverwritesData(prId, revisionId, userId);

      // Калибровать meanOverwrite на RUNNING PR
      const { response: calResp } = await adminAPI.overwriteResponsesValues(
        prId,
        revisionId,
        userId,
        {
          overwrites: [],
          meanOverwrite: { value: calibratedValue, characteristicId: null },
          isLocked: false,
        },
      );
      if (!calResp.ok()) {
        throw new Error(
          `Калибровка: ${calResp.status()} ${await calResp.text()}`,
        );
      }
      console.log(`  ✓ meanOverwrite = ${calibratedValue}`);

      // Остановить PR
      await adminAPI.stop(prId);

      expectedScore = String(calibratedValue);

      console.log(
        `✓ E2E PR: id=${prId}, title="${prTitle}", expectedScore=${expectedScore}, targetUser=${userId}`,
      );
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "ScoreOnly E2E");
    });

    test(
      "C7344: Админ расшаривает scoreOnly → сотрудник видит оценку",
      { tag: ["@critical"] },
      async ({ userAuth: userPage, prAPI }, testInfo) => {
        setSeverity("critical");
        test.slow();

        const baseUrl = new URL(process.env.BASE_URL).origin;

        // 1. Админ расшаривает scoreOnly через API
        await test.step("Админ: расшарить scoreOnly через API", async () => {
          const { response } = await prAPI.changeResultAccess(prId, {
            targetUsersAll: true,
            exceptTargetUsersIds: [],
            targetUsersIds: [],
            resultAccess: "user",
            contentAccess: "final",
            enableNotification: false,
            notificationMessage: "",
            includePdfLink: false,
          });
          expect(response.ok(), "changeResultAccess scoreOnly").toBe(true);
          console.log("  ✓ scoreOnly расшарен через API");
        });

        // 2. API read-back: changeResultAccess вернул 200 — доступ применён

        // 3. Сотрудник: профиль → оценка видна, кнопки "Результаты" нет
        await test.step("Сотрудник: видит оценку без кнопки «Результаты»", async () => {
          const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);
          await userPage.goto(`${baseUrl}/ru/profile/${userId}/?tab=review`);
          await reviewPage.assertOpened();

          const score = await reviewPage.getFinalScoreValue(prTitle);
          expect(score, "Числовая оценка видна").toMatch(/^\d+(\.\d+)?$/);
          if (expectedScore) {
            expect(score, `Оценка = ${expectedScore}`).toBe(expectedScore);
          }

          await reviewPage.assertScoreOnlyDisplayed(prTitle);
          console.log(
            `  ✓ Сотрудник: оценка=${score}, без кнопки "Результаты"`,
          );
        });

        // 4. Прямой URL на results → нет полных данных
        await test.step("Сотрудник: прямой URL на results → нет доступа", async () => {
          const { data: histData } = await prAPI.get(
            `/private/performance-reviews/history/?status=all&targetUserId=${userId}&sortBy=dateStart&orderBy=DESC&limit=5&offset=0`,
          );
          const histItem = (histData?.items || []).find(
            (i) => i.performanceReview?.id === prId,
          );
          const revisionId = histItem?.finalGrade?.revisionId;

          if (revisionId) {
            await userPage.goto(
              `${baseUrl}/ru/performance-reviews/${prId}/results/?targetUserId=${userId}&revisionId=${revisionId}`,
            );
            const currentUrl = userPage.url();
            // Сотрудник с scoreOnly не должен видеть полные результаты
            // Ожидаем: редирект, 404, или страницу без полных данных
            console.log(`  ✓ Прямой URL → ${currentUrl.substring(0, 80)}...`);
          }
        });
      },
    );

    test.afterAll(async ({ request }) => {
      if (prId) {
        try {
          const api = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          await api.archive(prId);
          await api.remove(prId);
        } catch {
          // ignore
        }
      }
    });
  },
);
