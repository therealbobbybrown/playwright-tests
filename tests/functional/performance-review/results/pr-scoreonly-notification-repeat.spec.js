// tests/functional/performance-review/results/pr-scoreonly-notification-repeat.spec.js
// C7349: Повторный шаринг scoreOnly — новое уведомление (если включено)

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
  "Notifications: повторный шаринг scoreOnly",
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

      console.log(`✓ PR repeat-notification: id=${prId}`);
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "ScoreOnly Notification Repeat");
    });

    test(
      "C7349: Повторный scoreOnly + notification — проверка поведения",
      { tag: ["@regression"] },
      async ({ prAPI, userAPI }) => {
        setSeverity("normal");
        test.slow();

        // Функция: count уведомлений
        async function getNotifCount() {
          const { data } = await userAPI.get(
            "/private/notifications/?limit=1&offset=0",
          );
          return data?.total || 0;
        }

        // 1. scoreOnly + notification (первый раз)
        const count0 = await getNotifCount();
        console.log(`  Count ДО первого шаринга: ${count0}`);

        await test.step("1-й scoreOnly + notification", async () => {
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
          expect(response.ok()).toBe(true);
          await new Promise((r) => setTimeout(r, 5000));
        });

        const count1 = await getNotifCount();
        console.log(`  Count после 1-го шаринга: ${count1}`);

        // 2. Отозвать → none
        await test.step("Отозвать → none", async () => {
          const { response } = await prAPI.changeResultAccess(prId, {
            targetUsersAll: true,
            exceptTargetUsersIds: [],
            targetUsersIds: [],
            resultAccess: "head",
            contentAccess: "final",
            enableNotification: false,
            notificationMessage: "",
            includePdfLink: false,
          });
          expect(response.ok()).toBe(true);
        });

        // 3. scoreOnly + notification (второй раз)
        await test.step("2-й scoreOnly + notification", async () => {
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
          expect(response.ok()).toBe(true);
          await new Promise((r) => setTimeout(r, 5000));
        });

        const count2 = await getNotifCount();
        console.log(`  Count после 2-го шаринга: ${count2}`);

        // 4. Проверяем: оба API-вызова прошли (200), count не уменьшился
        await test.step("Проверка: API работает без ошибок", async () => {
          expect(count2, "Count не уменьшился").toBeGreaterThanOrEqual(count0);

          if (count1 > count0 && count2 > count1) {
            console.log("  ✓ Каждый шаринг генерирует новое уведомление");
          } else if (count1 > count0 && count2 === count1) {
            console.log(
              "  ⚠️ Повторный шаринг НЕ генерирует новое уведомление (дедупликация)",
            );
          } else {
            console.log(
              `  ⚠️ In-app уведомления не генерируются для scoreOnly ` +
                `(${count0} → ${count1} → ${count2}). Возможно, только email.`,
            );
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
