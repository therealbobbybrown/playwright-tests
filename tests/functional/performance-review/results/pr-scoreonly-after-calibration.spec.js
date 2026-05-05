// tests/functional/performance-review/results/pr-scoreonly-after-calibration.spec.js
// C7343: ScoreOnly после калибровки meanOverwrite — конкретное значение

import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { ProfileEmployeeReviewPage } from "../../../../pages/ProfileEmployeeReviewPage.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";
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
  "Edge case: scoreOnly после калибровки",
  {
    tag: [
      "@performance-review",
      "@results",
      "@ui",
      "@regression",
      "@scoreOnly",
    ],
  },
  () => {
    let prId = null;
    let prTitle = null;
    let userId = null;
    let originalScore = null;
    const calibratedValue = 3.7;

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
      await seed.attachAssessments(prId);

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
      originalScore = summaryBefore?.items?.[0]?.mean?.value;
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

      // Расшарить scoreOnly
      await adminAPI.changeResultAccess(prId, {
        targetUsersAll: true,
        exceptTargetUsersIds: [],
        targetUsersIds: [],
        resultAccess: "user",
        contentAccess: "final",
        enableNotification: false,
        notificationMessage: "",
        includePdfLink: false,
      });

      console.log(
        `✓ PR calibrated: id=${prId}, original=${originalScore}, calibrated=${calibratedValue}`,
      );
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "ScoreOnly After Calibration");
    });

    test(
      "C7343: ScoreOnly после калибровки meanOverwrite — конкретное значение",
      { tag: ["@regression"] },
      async ({ userAuth: userPage }, testInfo) => {
        setSeverity("normal");
        test.slow();

        const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);
        const baseUrl = new URL(process.env.BASE_URL).origin;

        await test.step(`Профиль: оценка = ${calibratedValue} (калиброванная, не ${originalScore})`, async () => {
          await userPage.goto(`${baseUrl}/ru/profile/${userId}/?tab=review`);
          await reviewPage.assertOpened();
          const score = await reviewPage.getFinalScoreValue(prTitle);
          expect(score, `Оценка = ${calibratedValue} после калибровки`).toBe(
            String(calibratedValue),
          );
          await reviewPage.assertScoreOnlyDisplayed(prTitle);
          console.log(
            `  ✓ Калиброванная оценка: ${score} (исходная: ${originalScore})`,
          );
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
          /* */
        }
      }
    });
  },
);
