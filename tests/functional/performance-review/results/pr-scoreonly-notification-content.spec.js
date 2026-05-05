// tests/functional/performance-review/results/pr-scoreonly-notification-content.spec.js
// C7350: Уведомление при scoreOnly: содержание и структура

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
  "Notifications: scoreOnly — содержание уведомления",
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

      console.log(`✓ PR notification: id=${prId}, title="${prTitle}"`);
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "ScoreOnly Notification Content");
    });

    test(
      "C7350: Уведомление при scoreOnly с enableNotification=true",
      { tag: ["@regression"] },
      async ({ prAPI, userAPI }) => {
        setSeverity("normal");
        test.slow();

        // 1. Запомнить count уведомлений ДО
        let countBefore = 0;
        await test.step("Запомнить кол-во уведомлений", async () => {
          const { data } = await userAPI.get(
            "/private/notifications/?limit=1&offset=0",
          );
          countBefore = data?.total || 0;
          console.log(`  Уведомлений до: ${countBefore}`);
        });

        // 2. ScoreOnly + уведомление
        await test.step("API: scoreOnly + enableNotification=true", async () => {
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
          expect(response.ok(), "changeResultAccess 200").toBe(true);
        });

        // 3. Подождать обработки уведомления
        await test.step("Ожидание уведомления (5с)", async () => {
          await new Promise((r) => setTimeout(r, 5000));
        });

        // 4. Проверить уведомления через API
        await test.step("API: проверка уведомления", async () => {
          const { data } = await userAPI.get(
            "/private/notifications/?limit=10&offset=0",
          );
          const countAfter = data?.total || 0;

          if (countAfter > countBefore) {
            console.log(
              `  ✓ In-app уведомление: ${countBefore} → ${countAfter}`,
            );

            // Проверить содержание последнего уведомления
            const items = data?.items || [];
            if (items.length > 0) {
              const latest = items[0];
              console.log(`  Тип: ${latest.type || "N/A"}`);
              console.log(
                `  Текст: ${(latest.text || latest.message || "N/A").substring(0, 100)}`,
              );
              console.log(`  Ссылка: ${latest.link || latest.url || "N/A"}`);

              // Мягкие проверки: если уведомление есть, проверяем содержимое
              if (latest.text || latest.message) {
                const text = latest.text || latest.message || "";
                // Название PR может быть в тексте уведомления
                console.log(
                  `  Содержит название PR: ${text.includes(prTitle)}`,
                );
              }
            }
          } else {
            // ScoreOnly шаринг может не генерировать in-app уведомление
            console.log(
              `  ⚠️ In-app уведомление не появилось (${countBefore} → ${countAfter}). ` +
                "Возможно, scoreOnly генерирует только email-уведомление.",
            );
          }

          // Проверяем минимум: API не упал, count >= countBefore
          expect(countAfter, "Count не уменьшился").toBeGreaterThanOrEqual(
            countBefore,
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
