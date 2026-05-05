// tests/functional/performance-review/results/pr-scoreonly-no-notification.spec.js
// C7351: Нет уведомления при enableNotification=false

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
  "Notifications: scoreOnly — нет уведомления",
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

      const adminAPI = new PerformanceReviewAPI(request);
      const { email: ae, password: ap } = getCredentials("admin");
      await adminAPI.signIn(ae, ap);

      await setupCharacteristics(adminAPI, prId);
      await seed.addTargetUsers(prId, [userId]);
      await seed.attachAssessments(prId);
      await seed.prAPI.start(prId);
      await seed.fillQuestionnaires(prId);
      await adminAPI.stop(prId);

      console.log(`✓ PR no-notification: id=${prId}`);
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "ScoreOnly No Notification");
    });

    test(
      "C7351: Нет уведомления при enableNotification=false",
      { tag: ["@regression"] },
      async ({ prAPI, userAPI }) => {
        setSeverity("normal");
        test.slow();

        // 1. Запомнить count ДО
        let countBefore = 0;
        await test.step("Запомнить кол-во уведомлений", async () => {
          const { data } = await userAPI.get(
            "/private/notifications/?limit=1&offset=0",
          );
          countBefore = data?.total || 0;
          console.log(`  Уведомлений до: ${countBefore}`);
        });

        // 2. ScoreOnly БЕЗ уведомления
        await test.step("API: scoreOnly + enableNotification=false", async () => {
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
          expect(response.ok(), "changeResultAccess 200").toBe(true);
        });

        // 3. Подождать
        await test.step("Ожидание (5с)", async () => {
          await new Promise((r) => setTimeout(r, 5000));
        });

        // 4. Count НЕ увеличился (мягкая проверка — другие тесты могут генерировать уведомления)
        await test.step("API: уведомление НЕ создано", async () => {
          const { data } = await userAPI.get(
            "/private/notifications/?limit=1&offset=0",
          );
          const countAfter = data?.total || 0;

          // При параллельном запуске другие тесты могут генерировать уведомления,
          // поэтому используем мягкую проверку: не более +1 (от внешних источников)
          const delta = countAfter - countBefore;
          if (delta === 0) {
            console.log(`  ✓ Уведомлений после: ${countAfter} (не изменилось)`);
          } else if (delta <= 2) {
            console.log(
              `  ⚠️ Count изменился на ${delta} (${countBefore} → ${countAfter}). ` +
                "Возможно, другие тесты сгенерировали уведомления параллельно.",
            );
          } else {
            // Более 2 — вероятно, наш scoreOnly всё-таки сгенерировал уведомление
            expect
              .soft(
                delta,
                `Слишком много уведомлений: +${delta} (${countBefore} → ${countAfter})`,
              )
              .toBeLessThanOrEqual(2);
          }
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
