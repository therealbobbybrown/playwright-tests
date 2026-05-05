// tests/functional/profile/profile-review-multi-pr-access.spec.js
// C7327: Сотрудник с двумя PR: один scoreOnly, другой full — независимое отображение

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
  "Профиль сотрудника — два PR с разным доступом",
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
    let userId = null;

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

      const adminAPI = new PerformanceReviewAPI(request);
      const { email: adminEmail, password: adminPassword } =
        getCredentials("admin");
      await adminAPI.signIn(adminEmail, adminPassword);

      // Создать два PR параллельно
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");

      // PR#1 — будет scoreOnly
      const pr1 = await seed.seedDraftPR();
      pr1Id = pr1.id;
      pr1Title = pr1.title;
      await seed.addTargetUsers(pr1Id, [userId]);
      await seed.attachAssessments(pr1Id);
      await seed.prAPI.start(pr1Id);
      await seed.fillQuestionnaires(pr1Id);
      await adminAPI.stop(pr1Id);

      // PR#2 — будет full
      const pr2 = await seed.seedDraftPR();
      pr2Id = pr2.id;
      pr2Title = pr2.title;
      await seed.addTargetUsers(pr2Id, [userId]);
      await seed.attachAssessments(pr2Id);
      await seed.prAPI.start(pr2Id);
      await seed.fillQuestionnaires(pr2Id);
      await adminAPI.stop(pr2Id);

      // Установить доступ: PR#1 = scoreOnly, PR#2 = full
      const accessPayloadBase = {
        targetUsersAll: true,
        exceptTargetUsersIds: [],
        targetUsersIds: [],
        enableNotification: false,
        notificationMessage: "",
        includePdfLink: false,
      };

      await adminAPI.changeResultAccess(pr1Id, {
        ...accessPayloadBase,
        resultAccess: "user",
        contentAccess: "final",
      });
      await adminAPI.changeResultAccess(pr2Id, {
        ...accessPayloadBase,
        resultAccess: "user",
        contentAccess: "finalAndResults",
      });

      console.log(`✓ PR#1 (scoreOnly): id=${pr1Id}, "${pr1Title}"`);
      console.log(`✓ PR#2 (full):      id=${pr2Id}, "${pr2Title}"`);
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PROFILE, "Multi-PR Access");
    });

    test("C7327: Два PR с разным доступом отображаются независимо", async ({
      userAuth: userPage,
    }, testInfo) => {
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

      await test.step("PR#1 (scoreOnly): число видно, «Результаты» нет", async () => {
        await reviewPage.assertScoreOnlyDisplayed(pr1Title);
        const score1 = await reviewPage.getFinalScoreValue(pr1Title);
        expect(score1, `PR#1 "${pr1Title}": числовая оценка`).toMatch(
          /^\d+(\.\d+)?$/,
        );
        console.log(`  PR#1 scoreOnly: score="${score1}"`);
      });

      await test.step("PR#2 (full): ссылка «Результаты» видна", async () => {
        await reviewPage.assertFullResultsDisplayed(pr2Title);
        console.log(`  PR#2 full: "Результаты" видна`);
      });
    });

    test.afterAll(async ({ request }) => {
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of [pr1Id, pr2Id]) {
        if (id) {
          try {
            await api.archive(id);
            await api.remove(id);
          } catch {
            // ignore
          }
        }
      }
    });
  },
);
