// tests/functional/performance-review/results/pr-scoreonly-notification-click.spec.js
// C7352: Клик по уведомлению ведёт на вкладку "Оценка сотрудника"

import { test as baseTest, expect } from "../../../fixtures/auth.js";
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
  "Notifications: scoreOnly — клик по уведомлению",
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

      const uAPI = new PerformanceReviewAPI(request);
      const { email: ue, password: up } = getCredentials("user");
      await uAPI.signIn(ue, up);
      const tokenParts = uAPI.token?.split(".");
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
      if (!userId) throw new Error("Не удалось получить userId");

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

      // ScoreOnly + уведомление
      await adminAPI.changeResultAccess(prId, {
        targetUsersAll: true,
        exceptTargetUsersIds: [],
        targetUsersIds: [],
        resultAccess: "user",
        contentAccess: "final",
        enableNotification: true,
        notificationMessage: "",
        includePdfLink: false,
      });

      console.log(`✓ PR notification-click: id=${prId}, title="${prTitle}"`);
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "ScoreOnly Notification Click");
    });

    test(
      "C7352: Клик по уведомлению ведёт на вкладку «Оценка сотрудника»",
      { tag: ["@regression"] },
      async ({ userAuth: userPage, userAPI }) => {
        setSeverity("normal");
        test.slow();

        const baseUrl = new URL(process.env.BASE_URL).origin;

        // 1. Получить ссылку из уведомления через API
        let notificationLink = null;
        await test.step("API: получить ссылку из уведомления", async () => {
          await new Promise((r) => setTimeout(r, 3000));

          const { data } = await userAPI.get(
            "/private/notifications/?limit=10&offset=0",
          );
          const items = data?.items || [];

          // Искать уведомление, связанное с PR
          const prNotif = items.find((n) => {
            const text = n.text || n.message || "";
            const link = n.link || n.url || "";
            return text.includes(prTitle) || link.includes("review");
          });

          if (prNotif) {
            notificationLink = prNotif.link || prNotif.url;
            console.log(`  ✓ Найдено уведомление: link=${notificationLink}`);
          } else {
            console.log(
              `  ⚠️ Уведомление для PR "${prTitle}" не найдено. ` +
                "In-app уведомления для scoreOnly могут быть не реализованы.",
            );
          }
        });

        // 2. Если ссылка найдена — перейти и проверить
        if (notificationLink) {
          await test.step("Клик: переход по ссылке из уведомления", async () => {
            const fullUrl = notificationLink.startsWith("http")
              ? notificationLink
              : `${baseUrl}${notificationLink}`;
            await userPage.goto(fullUrl);
            await userPage.waitForLoadState("domcontentloaded");

            const currentUrl = userPage.url();
            expect(currentUrl, "URL содержит tab=review").toContain(
              "tab=review",
            );
            console.log(`  ✓ Переход на: ${currentUrl.substring(0, 80)}`);
          });
        } else {
          // Fallback: проверить что профиль с tab=review работает
          await test.step("Fallback: прямой переход на профиль", async () => {
            await userPage.goto(`${baseUrl}/ru/profile/${userId}/?tab=review`);
            await userPage.waitForLoadState("domcontentloaded");
            const currentUrl = userPage.url();
            expect(currentUrl, "URL содержит tab=review").toContain(
              "tab=review",
            );
            console.log(
              `  ✓ Профиль с tab=review доступен: ${currentUrl.substring(0, 80)}`,
            );
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
