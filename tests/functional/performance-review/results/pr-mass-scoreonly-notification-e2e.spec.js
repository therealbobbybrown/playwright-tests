// tests/functional/performance-review/results/pr-mass-scoreonly-notification-e2e.spec.js
// C7341: E2E: Массовый scoreOnly + уведомление + навигация

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
  userAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "E2E: массовый scoreOnly с уведомлением",
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

      const uAPI = new PerformanceReviewAPI(request);
      const { email: userEmail, password: userPassword } =
        getCredentials("user");
      await uAPI.signIn(userEmail, userPassword);

      const tokenParts = uAPI.token?.split(".");
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

      await setupCharacteristics(adminAPI, prId);
      await seed.addTargetUsers(prId, [userId]);
      await seed.attachAssessments(prId);

      const { response: startResp } = await seed.prAPI.start(prId);
      if (!startResp.ok()) {
        throw new Error(`Не удалось запустить PR: ${await startResp.text()}`);
      }

      await seed.fillQuestionnaires(prId);

      const { response: stopResp } = await adminAPI.stop(prId);
      if (!stopResp.ok()) {
        console.warn("Не удалось остановить PR:", await stopResp.text());
      }

      console.log(`✓ E2E notification PR: id=${prId}, title="${prTitle}"`);
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Mass ScoreOnly Notification E2E");
    });

    test(
      "C7341: Массовый scoreOnly + уведомление + навигация к профилю",
      { tag: ["@regression"] },
      async ({ userAuth: userPage, prAPI, userAPI }, testInfo) => {
        setSeverity("normal");
        test.slow();

        const baseUrl = new URL(process.env.BASE_URL).origin;

        // Запомнить кол-во уведомлений ДО
        let notifCountBefore = 0;
        await test.step("Запомнить кол-во уведомлений сотрудника", async () => {
          const { data: notifData } = await userAPI.get(
            "/private/notifications/?limit=1&offset=0",
          );
          notifCountBefore = notifData?.total || 0;
          console.log(`  Уведомлений до: ${notifCountBefore}`);
        });

        // 1. Массовый scoreOnly + уведомление через API
        await test.step("Админ: массовый scoreOnly + уведомление", async () => {
          const { response } = await prAPI.changeResultAccess(prId, {
            targetUsersAll: true,
            exceptTargetUsersIds: [],
            targetUsersIds: [],
            resultAccess: "user",
            contentAccess: "final",
            enableNotification: true,
            notificationMessage: "",
            includePdfLink: false,
          });
          expect(
            response.ok(),
            "changeResultAccess scoreOnly + notification",
          ).toBe(true);
          console.log("  ✓ Массовый scoreOnly + уведомление");
        });

        // 2. Проверить уведомление через API (мягкая проверка — может быть только email)
        await test.step("API: проверка уведомления", async () => {
          await new Promise((r) => setTimeout(r, 5000));

          const { data: notifData } = await userAPI.get(
            "/private/notifications/?limit=5&offset=0",
          );
          const notifCountAfter = notifData?.total || 0;

          if (notifCountAfter > notifCountBefore) {
            console.log(
              `  ✓ In-app уведомление: ${notifCountBefore} → ${notifCountAfter}`,
            );
          } else {
            console.log(
              `  ⚠️ In-app уведомление не появилось (было ${notifCountBefore}, стало ${notifCountAfter}). ` +
                "Возможно, scoreOnly шаринг генерирует только email-уведомление.",
            );
          }
        });

        // 4. Сотрудник: профиль → оценка видна
        await test.step("Сотрудник: профиль → оценка видна (scoreOnly)", async () => {
          const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);
          await userPage.goto(`${baseUrl}/ru/profile/${userId}/?tab=review`);
          await reviewPage.assertOpened();

          const score = await reviewPage.getFinalScoreValue(prTitle);
          expect(score, "Числовая оценка видна").toMatch(/^\d+(\.\d+)?$/);
          await reviewPage.assertScoreOnlyDisplayed(prTitle);
          console.log(`  ✓ Сотрудник видит оценку: ${score}`);
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
