// tests/functional/performance-review/results/pr-revoke-access-no-notification.spec.js
// Отзыв доступа (scoreOnly → none) НЕ отправляет нотификацию

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
  "Notifications: отзыв доступа не создаёт уведомление",
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
    test.describe.configure({ mode: "serial" });

    let prId = null;
    let userId = null;
    let countAfterGrant = 0;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);

      // Получить userId через JWT
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
      if (!userId) throw new Error("Не удалось получить userId для USER");

      // Seed PR: draft → start → fill → stop
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");
      const pr = await seed.seedDraftPR();
      prId = pr.id;
      if (!prId) throw new Error("Не удалось создать PR");

      const adminAPI = new PerformanceReviewAPI(request);
      const { email: ae, password: ap } = getCredentials("admin");
      await adminAPI.signIn(ae, ap);

      await setupCharacteristics(adminAPI, prId);
      await seed.addTargetUsers(prId, [userId]);
      await seed.attachAssessments(prId);
      await seed.prAPI.start(prId);
      await seed.fillQuestionnaires(prId);
      await adminAPI.stop(prId);

      // Грант scoreOnly С уведомлением
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

      console.log(`✓ PR revoke-no-notification: id=${prId}, userId=${userId}`);
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Revoke No Notification");
    });

    test(
      "C7379: Запомнить count нотификаций после гранта scoreOnly",
      { tag: ["@regression"] },
      async ({ userAPI }) => {
        setSeverity("normal");

        await test.step("Ожидание доставки уведомления (5с)", async () => {
          await new Promise((r) => setTimeout(r, 5000));
        });

        await test.step("Получить count нотификаций", async () => {
          const { data } = await userAPI.get(
            "/private/notifications/?limit=1&offset=0",
          );
          countAfterGrant = data?.total || 0;
          console.log(
            `  Нотификаций после гранта scoreOnly: ${countAfterGrant}`,
          );
        });
      },
    );

    test(
      "C7380: Отзыв доступа (none) не создаёт нового уведомления",
      { tag: ["@regression"] },
      async ({ prAPI, userAPI }) => {
        setSeverity("normal");

        // 1. Отозвать доступ → none (enableNotification: false)
        await test.step("API: отозвать доступ → none", async () => {
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
          expect(response.ok(), "changeResultAccess → none").toBe(true);
        });

        // 2. Подождать, чтобы убедиться, что нотификация НЕ появится
        await test.step("Ожидание (5с)", async () => {
          await new Promise((r) => setTimeout(r, 5000));
        });

        // 3. Проверить что count не изменился
        await test.step("Проверить: count нотификаций не вырос", async () => {
          const { data } = await userAPI.get(
            "/private/notifications/?limit=1&offset=0",
          );
          const countAfterRevoke = data?.total || 0;

          console.log(
            `  Нотификаций после гранта: ${countAfterGrant}, после отзыва: ${countAfterRevoke}`,
          );
          expect(
            countAfterRevoke,
            "Отзыв доступа не должен создавать новое уведомление",
          ).toBe(countAfterGrant);
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
