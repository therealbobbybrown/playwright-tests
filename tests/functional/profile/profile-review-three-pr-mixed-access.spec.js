// tests/functional/profile/profile-review-three-pr-mixed-access.spec.js
// 3 PR с разным доступом (none/scoreOnly/full) отображаются независимо в профиле

import { test as baseTest, expect } from "../../fixtures/auth.js";
import { ProfileEmployeeReviewPage } from "../../../pages/ProfileEmployeeReviewPage.js";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import { PerformanceReviewSeedHelper } from "../../utils/seed/PerformanceReviewSeedHelper.js";
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
  "Профиль сотрудника — три PR с разным доступом (none/scoreOnly/full)",
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
    let pr1Id = null;
    let pr1Title = null;
    let pr2Id = null;
    let pr2Title = null;
    let pr3Id = null;
    let pr3Title = null;
    let userId = null;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(300_000);

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

      const adminAPI = new PerformanceReviewAPI(request);
      const { email: adminEmail, password: adminPassword } =
        getCredentials("admin");
      await adminAPI.signIn(adminEmail, adminPassword);

      // Создать три PR последовательно
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");

      // PR#1 — будет none access (resultAccess по умолчанию = "head")
      const pr1 = await seed.seedDraftPR();
      pr1Id = pr1.id;
      pr1Title = pr1.title;
      await seed.addTargetUsers(pr1Id, [userId]);
      await seed.attachAssessments(pr1Id);
      await seed.prAPI.start(pr1Id);
      await seed.fillQuestionnaires(pr1Id);
      await adminAPI.stop(pr1Id);

      // PR#2 — будет scoreOnly
      const pr2 = await seed.seedDraftPR();
      pr2Id = pr2.id;
      pr2Title = pr2.title;
      await seed.addTargetUsers(pr2Id, [userId]);
      await seed.attachAssessments(pr2Id);
      await seed.prAPI.start(pr2Id);
      await seed.fillQuestionnaires(pr2Id);
      await adminAPI.stop(pr2Id);

      // PR#3 — будет full access
      const pr3 = await seed.seedDraftPR();
      pr3Id = pr3.id;
      pr3Title = pr3.title;
      await seed.addTargetUsers(pr3Id, [userId]);
      await seed.attachAssessments(pr3Id);
      await seed.prAPI.start(pr3Id);
      await seed.fillQuestionnaires(pr3Id);
      await adminAPI.stop(pr3Id);

      // Установить доступ
      const accessPayloadBase = {
        targetUsersAll: true,
        exceptTargetUsersIds: [],
        targetUsersIds: [],
        enableNotification: false,
        notificationMessage: "",
        includePdfLink: false,
      };

      // PR#1 — none: НЕ вызываем changeResultAccess (по умолчанию resultAccess: "head")

      // PR#2 — scoreOnly: resultAccess: "user", contentAccess: "final"
      await adminAPI.changeResultAccess(pr2Id, {
        ...accessPayloadBase,
        resultAccess: "user",
        contentAccess: "final",
      });

      // PR#3 — full: resultAccess: "user", contentAccess: "finalAndResults"
      await adminAPI.changeResultAccess(pr3Id, {
        ...accessPayloadBase,
        resultAccess: "user",
        contentAccess: "finalAndResults",
      });

      console.log(`✓ PR#1 (none):      id=${pr1Id}, "${pr1Title}"`);
      console.log(`✓ PR#2 (scoreOnly): id=${pr2Id}, "${pr2Title}"`);
      console.log(`✓ PR#3 (full):      id=${pr3Id}, "${pr3Title}"`);
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PROFILE, "Three PR Mixed Access");
    });

    test(
      "C####: Три PR с разным доступом отображаются независимо",
      { tag: ["@regression"] },
      async ({ userAuth: userPage }, testInfo) => {
        setSeverity("normal");
        test.slow();

        const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);

        await test.step("Открыть профиль → Оценка сотрудника", async () => {
          const baseUrl = process.env.BASE_URL;
          await userPage.goto(
            new URL(`/ru/profile/${userId}/?tab=review`, baseUrl).toString(),
          );
          await reviewPage.assertOpened();
        });

        await test.step("PR#1 (none): ни оценки, ни «Результаты»", async () => {
          await reviewPage.assertNoAccessDisplayed(pr1Title);
          console.log(`  PR#1 none: ни оценки, ни "Результаты"`);
        });

        await test.step("PR#2 (scoreOnly): число видно, «Результаты» нет", async () => {
          await reviewPage.assertScoreOnlyDisplayed(pr2Title);
          const score2 = await reviewPage.getFinalScoreValue(pr2Title);
          expect(score2, `PR#2 "${pr2Title}": числовая оценка`).toMatch(
            /^\d+(\.\d+)?$/,
          );
          console.log(`  PR#2 scoreOnly: score="${score2}"`);
        });

        await test.step("PR#3 (full): ссылка «Результаты» видна", async () => {
          await reviewPage.assertFullResultsDisplayed(pr3Title);
          console.log(`  PR#3 full: "Результаты" видна`);
        });
      },
    );

    test.afterAll(async ({ request }) => {
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of [pr1Id, pr2Id, pr3Id]) {
        if (id) {
          try {
            await api.archive(id);
            await api.remove(id);
          } catch {
            // ignore cleanup errors
          }
        }
      }
    });
  },
);
