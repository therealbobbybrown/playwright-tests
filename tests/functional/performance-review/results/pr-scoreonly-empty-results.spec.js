// tests/functional/performance-review/results/pr-scoreonly-empty-results.spec.js
// C7344: ScoreOnly для PR без заполненных анкет

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
  "Edge case: scoreOnly без заполненных анкет",
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
      if (!prId) throw new Error("Не удалось создать PR");

      const adminAPI = new PerformanceReviewAPI(request);
      const { email: ae, password: ap } = getCredentials("admin");
      await adminAPI.signIn(ae, ap);

      await setupCharacteristics(adminAPI, prId);
      await seed.addTargetUsers(prId, [userId]);
      await seed.attachAssessments(prId);

      // Запустить PR БЕЗ заполнения анкет
      const { response: startResp } = await seed.prAPI.start(prId);
      if (!startResp.ok()) {
        throw new Error(`Не удалось запустить PR: ${await startResp.text()}`);
      }

      // Сразу остановить (анкеты не заполнены — нет финальной оценки)
      await adminAPI.stop(prId);

      console.log(`✓ PR без анкет: id=${prId}, title="${prTitle}"`);
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "ScoreOnly Empty Results");
    });

    test(
      "C7344: ScoreOnly для PR без заполненных анкет — API не падает",
      { tag: ["@regression"] },
      async ({ userAuth: userPage, prAPI }, testInfo) => {
        setSeverity("normal");
        test.slow();

        // 1. API: changeResultAccess scoreOnly — не должен вернуть 500
        let apiResponseOk = false;
        await test.step("API: scoreOnly для PR без анкет — не 500", async () => {
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
          // Ожидаем 200 (либо 400 с понятной ошибкой, но не 500)
          const status = response.status();
          expect(status, "Не должно быть 500").not.toBe(500);
          apiResponseOk = response.ok();
          console.log(`  API status: ${status}, ok: ${apiResponseOk}`);
        });

        // 2. Если API вернул 200 — проверить профиль
        if (apiResponseOk) {
          await test.step("Профиль: нет NaN/undefined/ошибок", async () => {
            const baseUrl = new URL(process.env.BASE_URL).origin;
            const reviewPage = new ProfileEmployeeReviewPage(
              userPage,
              testInfo,
            );
            await userPage.goto(`${baseUrl}/ru/profile/${userId}/?tab=review`);
            await reviewPage.assertOpened();

            // Оценка может быть null (нет данных) или прочерк — главное не NaN/undefined
            const score = await reviewPage.getFinalScoreValue(prTitle);
            if (score !== null) {
              expect(score, "Не NaN").not.toBe("NaN");
              expect(score, "Не undefined").not.toBe("undefined");
              console.log(`  ✓ Профиль: score=${score} (пустой PR)`);
            } else {
              console.log(
                "  ✓ Профиль: оценка отсутствует (ожидаемо для пустого PR)",
              );
            }
          });
        }
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
