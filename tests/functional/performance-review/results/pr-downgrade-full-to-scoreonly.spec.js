// tests/functional/performance-review/results/pr-downgrade-full-to-scoreonly.spec.js
// C7342: Переключение full → scoreOnly: кнопка "Результаты" исчезает

import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { ProfileEmployeeReviewPage } from "../../../../pages/ProfileEmployeeReviewPage.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";
import { setupCharacteristics } from "../../../utils/StatisticsSettingsHelper.js";
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
  "Edge case: full → scoreOnly downgrade",
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

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);

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

      const adminAPI = new PerformanceReviewAPI(request);
      const { email: ae, password: ap } = getCredentials("admin");
      await adminAPI.signIn(ae, ap);
      await setupCharacteristics(adminAPI, prId);
      await seed.addTargetUsers(prId, [userId]);
      await seed.attachAssessments(prId);
      await seed.prAPI.start(prId);
      await seed.fillQuestionnaires(prId);
      await adminAPI.stop(prId);

      // Установить full access
      await adminAPI.changeResultAccess(prId, {
        targetUsersAll: true,
        exceptTargetUsersIds: [],
        targetUsersIds: [],
        resultAccess: "user",
        contentAccess: "finalAndResults",
        enableNotification: false,
        notificationMessage: "",
        includePdfLink: false,
      });

      console.log(`✓ PR downgrade: id=${prId}, title="${prTitle}"`);
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Downgrade Full to ScoreOnly");
    });

    test(
      "C7342: Переключение full → scoreOnly: кнопка «Результаты» исчезает",
      { tag: ["@regression"] },
      async ({ userAuth: userPage, prAPI }, testInfo) => {
        setSeverity("normal");
        test.slow();

        const baseUrl = new URL(process.env.BASE_URL).origin;
        const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);
        const profileUrl = `${baseUrl}/ru/profile/${userId}/?tab=review`;

        // 1. full: кнопка "Результаты" видна
        await test.step("full: кнопка «Результаты» видна", async () => {
          await userPage.goto(profileUrl);
          await reviewPage.assertOpened();
          await reviewPage.assertFullResultsDisplayed(prTitle);
          console.log("  ✓ full: кнопка «Результаты» видна");
        });

        // 2. Downgrade → scoreOnly
        await test.step("API: downgrade → scoreOnly", async () => {
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
          expect(response.ok(), "changeResultAccess → scoreOnly").toBe(true);
        });

        // 3. scoreOnly: число сохранилось, кнопки нет
        await test.step("scoreOnly: оценка видна, кнопки «Результаты» нет", async () => {
          await userPage.goto(profileUrl);
          await reviewPage.assertOpened();
          const score = await reviewPage.getFinalScoreValue(prTitle);
          expect(score, "Числовая оценка сохранилась").toMatch(/^\d+(\.\d+)?$/);
          await reviewPage.assertScoreOnlyDisplayed(prTitle);
          console.log(`  ✓ scoreOnly: score=${score}, кнопки «Результаты» нет`);
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
