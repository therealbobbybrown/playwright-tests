// tests/functional/profile/profile-review-scoreonly-calibration-update.spec.js
// C7326: Итоговая оценка обновляется в профиле после калибровки (meanOverwrite)

import { test as baseTest, expect } from "../../fixtures/auth.js";
import { ProfileEmployeeReviewPage } from "../../../pages/ProfileEmployeeReviewPage.js";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import { PerformanceReviewSeedHelper } from "../../utils/seed/PerformanceReviewSeedHelper.js";
import { setupCharacteristicsWithCalibration } from "../../utils/StatisticsSettingsHelper.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

const test = baseTest.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "Профиль сотрудника — scoreOnly после калибровки",
  {
    tag: [
      "@profile",
      "@performance-review",
      "@ui",
      "@regression",
      "@scoreOnly",
    ],
  },
  () => {
    let prId = null;
    let prTitle = null;
    let userId = null;
    const calibratedValue = 4.5;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(240_000);

      // Получить userId через JWT
      const userAPI = new PerformanceReviewAPI(request);
      const { email: userEmail, password: userPassword } =
        getCredentials("user");
      await userAPI.signIn(userEmail, userPassword);

      const tokenParts = userAPI.token?.split(".");
      if (tokenParts?.length === 3) {
        try {
          let b64 = tokenParts[1].replace(/-/g, "+").replace(/_/g, "/");
          while (b64.length % 4) b64 += "=";
          const payload = JSON.parse(Buffer.from(b64, "base64").toString());
          userId = payload.userId || payload.sub;
        } catch {
          // fallback
        }
      }
      if (!userId) throw new Error("Не удалось получить userId для USER");

      // Seed PR
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");

      const pr = await seed.seedDraftPR();
      prId = pr.id;
      prTitle = pr.title;
      if (!prId) throw new Error("Не удалось создать PR");

      const adminAPI = new PerformanceReviewAPI(request);
      const { email: adminEmail, password: adminPassword } =
        getCredentials("admin");
      await adminAPI.signIn(adminEmail, adminPassword);

      // Включить характеристики (до старта)
      await setupCharacteristicsWithCalibration(adminAPI, prId);

      await seed.addTargetUsers(prId, [userId]);
      await seed.attachAssessments(prId);

      // Запустить PR
      const { response: startResp } = await seed.prAPI.start(prId);
      if (!startResp.ok()) {
        throw new Error(`Не удалось запустить PR: ${await startResp.text()}`);
      }

      await seed.fillQuestionnaires(prId);

      // Включить калибровку + useOnlyHeadReceiver ПОСЛЕ старта и заполнения
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

      // Получить revisionId на RUNNING PR (до stop!)
      const { data: revData } = await adminAPI.getLastRevision(prId);
      const revisionId = revData?.id;
      if (!revisionId) {
        throw new Error("Не удалось получить revisionId на running PR");
      }
      console.log(`  revisionId (running): ${revisionId}`);

      // Warm-up: триггерить расчёт статистики (необходимо перед калибровкой)
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

      // Получить текущие overwrites
      const { data: owData, response: owResp } =
        await adminAPI.getResponseOverwritesData(prId, revisionId, userId);
      if (!owResp.ok()) {
        throw new Error(
          `getResponseOverwritesData failed: ${owResp.status()} ${await owResp.text()}`,
        );
      }

      // Калибровать meanOverwrite на RUNNING PR (без покомпетенционных overwrites)

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
        const errText = await calResp.text();
        throw new Error(
          `Калибровка meanOverwrite не удалась: ${calResp.status()} ${errText}`,
        );
      }
      console.log(
        `  ✓ meanOverwrite = ${calibratedValue} (status ${calResp.status()})`,
      );

      // Остановить PR (после калибровки)
      const { response: stopResp } = await adminAPI.stop(prId);
      if (!stopResp.ok()) {
        console.warn("Не удалось остановить PR:", await stopResp.text());
      }

      // Установить scoreOnly
      const { response: accessResp } = await adminAPI.changeResultAccess(prId, {
        targetUsersAll: true,
        exceptTargetUsersIds: [],
        targetUsersIds: [],
        resultAccess: "user",
        contentAccess: "final",
        enableNotification: false,
        notificationMessage: "",
        includePdfLink: false,
      });
      if (!accessResp.ok()) {
        throw new Error(
          `changeResultAccess(scoreOnly) не удалась: ${accessResp.status()} ${await accessResp.text()}`,
        );
      }

      console.log(
        `✓ PR с калибровкой: id=${prId}, title="${prTitle}", calibrated=${calibratedValue}`,
      );
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PROFILE, "ScoreOnly Calibration Update");
    });

    test(
      "C7326: Итоговая оценка обновляется в профиле после калибровки",
      { tag: ["@critical"] },
      async ({ userAuth: userPage }, testInfo) => {
        setSeverity("critical");
        test.slow();

        const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);

        await test.step(`Профиль: калиброванная оценка ${calibratedValue} отображается`, async () => {
          const baseUrl = process.env.BASE_URL;
          await userPage.goto(new URL(`/ru/profile/${userId}/?tab=review`, baseUrl).toString());
          await reviewPage.assertOpened();

          const displayedScore = await reviewPage.getFinalScoreValue(prTitle);
          expect(
            displayedScore,
            `Оценка в профиле должна быть ${calibratedValue} (после калибровки)`,
          ).toBe(String(calibratedValue));
          console.log(`  ✓ Калиброванная оценка в профиле: ${displayedScore}`);
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
