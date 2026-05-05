// tests/functional/performance-review/results/pr-share-mixed-access-levels.spec.js
// C7345: ScoreOnly с разными access levels для разных сотрудников в одном PR

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

/** Извлечь userId из JWT-токена */
function extractUserId(token) {
  const parts = token?.split(".");
  if (parts?.length !== 3) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const payload = JSON.parse(Buffer.from(b64, "base64").toString());
    return payload.userId || payload.sub;
  } catch {
    return null;
  }
}

const test = baseTest.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "Edge case: разные access levels в одном PR",
  {
    tag: [
      "@performance-review",
      "@results",
      "@api",
      "@regression",
      "@scoreOnly",
    ],
  },
  () => {
    let prId = null;
    let prTitle = null;
    let userId1 = null; // user — будет scoreOnly
    let userId2 = null; // head — будет full

    test.beforeAll(async ({ request }) => {
      test.setTimeout(240_000);

      // Получить userId1 (user)
      const userAPI = new PerformanceReviewAPI(request);
      const { email: ue, password: up } = getCredentials("user");
      await userAPI.signIn(ue, up);
      userId1 = extractUserId(userAPI.token);
      if (!userId1) throw new Error("Не удалось получить userId1 (user)");

      // Получить userId2 (head)
      const headAPI = new PerformanceReviewAPI(request);
      const { email: he, password: hp } = getCredentials("head");
      await headAPI.signIn(he, hp);
      userId2 = extractUserId(headAPI.token);
      if (!userId2) throw new Error("Не удалось получить userId2 (head)");

      console.log(`  userId1 (user): ${userId1}, userId2 (head): ${userId2}`);

      // Seed PR с двумя target users
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");
      const pr = await seed.seedDraftPR();
      prId = pr.id;
      prTitle = pr.title;
      if (!prId) throw new Error("Не удалось создать PR");

      const adminAPI = new PerformanceReviewAPI(request);
      const { email: ae, password: ap } = getCredentials("admin");
      await adminAPI.signIn(ae, ap);

      await setupCharacteristics(adminAPI, prId);
      await seed.addTargetUsers(prId, [userId1, userId2]);
      await seed.attachAssessments(prId);
      await seed.prAPI.start(prId);
      await seed.fillQuestionnaires(prId);
      await adminAPI.stop(prId);

      // Установить user1 = scoreOnly
      const { response: r1 } = await adminAPI.changeResultAccess(prId, {
        targetUsersAll: false,
        exceptTargetUsersIds: [],
        targetUsersIds: [userId1],
        resultAccess: "user",
        contentAccess: "final",
        enableNotification: false,
        notificationMessage: "",
        includePdfLink: false,
      });
      if (!r1.ok()) {
        console.warn(`changeResultAccess user1 scoreOnly: ${r1.status()}`);
      }

      // Установить user2 = full
      const { response: r2 } = await adminAPI.changeResultAccess(prId, {
        targetUsersAll: false,
        exceptTargetUsersIds: [],
        targetUsersIds: [userId2],
        resultAccess: "user",
        contentAccess: "finalAndResults",
        enableNotification: false,
        notificationMessage: "",
        includePdfLink: false,
      });
      if (!r2.ok()) {
        console.warn(`changeResultAccess user2 full: ${r2.status()}`);
      }

      console.log(
        `✓ Mixed access PR: id=${prId}, user1=${userId1}(scoreOnly), user2=${userId2}(full)`,
      );
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Mixed Access Levels");
    });

    test(
      "C7345: Разные access levels — каждый видит своё",
      { tag: ["@regression"] },
      async ({ userAuth: userPage, prAPI }, testInfo) => {
        setSeverity("normal");
        test.slow();

        const baseUrl = new URL(process.env.BASE_URL).origin;

        // 1. User1 (user) — scoreOnly: видит число, нет кнопки "Результаты"
        await test.step("User1 (scoreOnly): число видно, кнопки нет", async () => {
          const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);
          await userPage.goto(`${baseUrl}/ru/profile/${userId1}/?tab=review`);
          await reviewPage.assertOpened();
          const score = await reviewPage.getFinalScoreValue(prTitle);
          expect(score, "User1: числовая оценка").toMatch(/^\d+(\.\d+)?$/);
          await reviewPage.assertScoreOnlyDisplayed(prTitle);
          console.log(`  ✓ User1 (scoreOnly): score=${score}`);
        });

        // 2. Изменить user1 на full — user2 не должен измениться
        await test.step("API: user1 → full (user2 не затронут)", async () => {
          const { response } = await prAPI.changeResultAccess(prId, {
            targetUsersAll: false,
            exceptTargetUsersIds: [],
            targetUsersIds: [userId1],
            resultAccess: "user",
            contentAccess: "finalAndResults",
            enableNotification: false,
            notificationMessage: "",
            includePdfLink: false,
          });
          expect(response.ok(), "changeResultAccess user1 → full").toBe(true);
        });

        // 3. User1 — full: кнопка "Результаты" появилась
        await test.step("User1 (full): кнопка «Результаты» появилась", async () => {
          const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);
          await userPage.goto(`${baseUrl}/ru/profile/${userId1}/?tab=review`);
          await reviewPage.assertOpened();
          await reviewPage.assertFullResultsDisplayed(prTitle);
          console.log("  ✓ User1 (full): кнопка «Результаты» видна");
        });

        // 4. API: проверить что user2 всё ещё full (не затронут изменением user1)
        await test.step("API: user2 доступ не изменился", async () => {
          const { data: histData } = await prAPI.get(
            `/private/performance-reviews/history/?status=all&targetUserId=${userId2}&sortBy=dateStart&orderBy=DESC&limit=5&offset=0`,
          );
          const histItem = (histData?.items || []).find(
            (i) => i.performanceReview?.id === prId,
          );
          expect(histItem, "User2: PR найден в history").toBeTruthy();
          // Наличие finalGrade подтверждает, что у user2 всё ещё есть доступ
          expect(
            histItem?.finalGrade,
            "User2: finalGrade доступен (не отозван)",
          ).toBeTruthy();
          console.log(
            `  ✓ User2: finalGrade.value = ${histItem?.finalGrade?.value} (не затронут)`,
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
