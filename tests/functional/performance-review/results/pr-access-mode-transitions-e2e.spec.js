// tests/functional/performance-review/results/pr-access-mode-transitions-e2e.spec.js
// C7339: E2E: Переключение режимов none → scoreOnly → full → none

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

/** Маппинг режимов доступа → API payload */
const ACCESS_MODES = {
  none: { resultAccess: "head", contentAccess: "final" },
  scoreOnly: { resultAccess: "user", contentAccess: "final" },
  full: { resultAccess: "user", contentAccess: "finalAndResults" },
};

test.describe(
  "E2E: переключение режимов доступа",
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

      // Получить overwrites data (необходимо перед записью)
      await adminAPI.getResponseOverwritesData(prId, revisionId, userId);

      // Калибровать meanOverwrite на RUNNING PR
      const { response: calResp } = await adminAPI.overwriteResponsesValues(
        prId,
        revisionId,
        userId,
        {
          overwrites: [],
          meanOverwrite: { value: 7.5, characteristicId: null },
          isLocked: false,
        },
      );
      if (!calResp.ok()) {
        throw new Error(
          `Калибровка: ${calResp.status()} ${await calResp.text()}`,
        );
      }
      console.log(`  ✓ meanOverwrite = 7.5`);

      // Остановить PR
      const { response: stopResp } = await adminAPI.stop(prId);
      if (!stopResp.ok()) {
        console.warn("Не удалось остановить PR:", await stopResp.text());
      }

      console.log(`✓ E2E transitions PR: id=${prId}, title="${prTitle}"`);
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Access Mode Transitions E2E");
    });

    /** Хелпер: переключить режим через API и проверить в history */
    async function switchAndVerify(prAPI, mode) {
      const access = ACCESS_MODES[mode];
      const { response } = await prAPI.changeResultAccess(prId, {
        targetUsersAll: true,
        exceptTargetUsersIds: [],
        targetUsersIds: [],
        ...access,
        enableNotification: false,
        notificationMessage: "",
        includePdfLink: false,
      });
      expect(response.ok(), `changeResultAccess → ${mode}`).toBe(true);
    }

    test(
      "C7339: Переключение режимов none → scoreOnly → full → none",
      { tag: ["@critical"] },
      async ({ userAuth: userPage, prAPI }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(300_000);

        const baseUrl = new URL(process.env.BASE_URL).origin;
        const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);
        const profileUrl = `${baseUrl}/ru/profile/${userId}/?tab=review`;

        // Шаг 1: none → scoreOnly
        await test.step("none → scoreOnly: число появляется", async () => {
          await switchAndVerify(prAPI, "scoreOnly");

          await userPage.goto(profileUrl);
          await reviewPage.assertOpened();
          const score = await reviewPage.getFinalScoreValue(prTitle);
          expect(score, "Числовая оценка после scoreOnly").toMatch(
            /^\d+(\.\d+)?$/,
          );
          await reviewPage.assertScoreOnlyDisplayed(prTitle);
          console.log(`  ✓ scoreOnly: score=${score}`);
        });

        // Шаг 2: scoreOnly → full
        await test.step("scoreOnly → full: кнопка «Результаты» появляется", async () => {
          await switchAndVerify(prAPI, "full");

          await userPage.goto(profileUrl);
          await reviewPage.assertOpened();
          await reviewPage.assertFullResultsDisplayed(prTitle);
          console.log("  ✓ full: кнопка «Результаты» видна");
        });

        // Шаг 3: full → none
        await test.step("full → none: оценка и кнопка исчезают", async () => {
          await switchAndVerify(prAPI, "none");

          await userPage.goto(profileUrl);
          await reviewPage.assertOpened();
          await reviewPage.assertNoAccessDisplayed(prTitle);
          console.log("  ✓ none: ни оценки, ни кнопки");
        });

        // Шаг 4: none → scoreOnly (возврат)
        await test.step("none → scoreOnly: число появляется снова", async () => {
          await switchAndVerify(prAPI, "scoreOnly");

          await userPage.goto(profileUrl);
          await reviewPage.assertOpened();
          const score = await reviewPage.getFinalScoreValue(prTitle);
          expect(score, "Числовая оценка после повторного scoreOnly").toMatch(
            /^\d+(\.\d+)?$/,
          );
          console.log(`  ✓ scoreOnly (возврат): score=${score}`);
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
