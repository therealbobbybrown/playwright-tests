// tests/functional/performance-review/results/pr-share-except-users.spec.js
// exceptTargetUsersIds — применить scoreOnly ко всем кроме исключённого сотрудника

import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { ProfileEmployeeReviewPage } from "../../../../pages/ProfileEmployeeReviewPage.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";
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
  "exceptTargetUsersIds — scoreOnly ко всем кроме исключённого",
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
    let prTitle = null;
    let userId_user = null; // user — будет scoreOnly (включён)
    let userId_head = null; // head — исключён из scoreOnly

    test.beforeAll(async ({ request }) => {
      test.setTimeout(240_000);

      // Получить userId_user (user)
      const userAPI = new PerformanceReviewAPI(request);
      const { email: ue, password: up } = getCredentials("user");
      await userAPI.signIn(ue, up);
      userId_user = extractUserId(userAPI.token);
      if (!userId_user) throw new Error("Не удалось получить userId для USER");

      // Получить userId_head (head)
      const headAPI = new PerformanceReviewAPI(request);
      const { email: he, password: hp } = getCredentials("head");
      await headAPI.signIn(he, hp);
      userId_head = extractUserId(headAPI.token);
      if (!userId_head) throw new Error("Не удалось получить userId для HEAD");

      console.log(`  userId_user: ${userId_user}, userId_head: ${userId_head}`);

      // Seed PR с двумя target users
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");
      const pr = await seed.seedDraftPR();
      prId = pr.id;
      prTitle = pr.title;
      if (!prId) throw new Error("Не удалось создать PR");

      await seed.addTargetUsers(prId, [userId_user, userId_head]);
      await seed.attachAssessments(prId);
      await seed.prAPI.start(prId);
      await seed.fillQuestionnaires(prId);

      const adminAPI = new PerformanceReviewAPI(request);
      const { email: ae, password: ap } = getCredentials("admin");
      await adminAPI.signIn(ae, ap);
      await adminAPI.stop(prId);

      // Применить scoreOnly ко всем КРОМЕ head
      const { response } = await adminAPI.changeResultAccess(prId, {
        targetUsersAll: true,
        exceptTargetUsersIds: [userId_head],
        targetUsersIds: [],
        resultAccess: "user",
        contentAccess: "final",
        enableNotification: false,
        notificationMessage: "",
        includePdfLink: false,
      });
      if (!response.ok()) {
        console.warn(
          `changeResultAccess exceptTargetUsersIds: ${response.status()}`,
        );
      }

      console.log(
        `✓ PR: id=${prId}, "${prTitle}", user=${userId_user}(scoreOnly), head=${userId_head}(исключён)`,
      );
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Except Target Users");
    });

    test(
      "C7385: API: exceptTargetUsersIds исключает конкретного сотрудника",
      { tag: ["@regression"] },
      async ({ prAPI }) => {
        setSeverity("normal");
        test.slow();

        await test.step("API: получить target users из статистики", async () => {
          const { response, data } = await prAPI.getStatisticsTargetUsers(
            prId,
            {
              limit: 10,
              offset: 0,
            },
          );
          expect(
            response.ok(),
            `getStatisticsTargetUsers: HTTP ${response.status()}`,
          ).toBe(true);

          const items = data?.items || data || [];
          expect(
            items.length,
            "Должны быть target users в ответе",
          ).toBeGreaterThanOrEqual(2);

          // Найти обоих пользователей
          const userItem = items.find(
            (i) => (i.userId || i.user?.id || i.id) === userId_user,
          );
          const headItem = items.find(
            (i) => (i.userId || i.user?.id || i.id) === userId_head,
          );

          expect(
            userItem,
            `User (${userId_user}) найден в target users`,
          ).toBeTruthy();
          expect(
            headItem,
            `Head (${userId_head}) найден в target users`,
          ).toBeTruthy();

          // User (включённый) — должен иметь scoreOnly (resultAccess="user", contentAccess="final")
          if (userItem.resultAccess !== undefined) {
            expect(
              userItem.resultAccess,
              "User: resultAccess = user (scoreOnly)",
            ).toBe("user");
          }
          if (userItem.contentAccess !== undefined) {
            expect(
              userItem.contentAccess,
              "User: contentAccess = final (scoreOnly)",
            ).toBe("final");
          }

          // Head (исключённый) — НЕ должен иметь scoreOnly
          // Исключённый из except = доступ НЕ был изменён (остался default: head/final)
          if (headItem.resultAccess !== undefined) {
            expect(
              headItem.resultAccess,
              "Head: resultAccess != user (не scoreOnly)",
            ).toBe("head");
          }
          if (headItem.contentAccess !== undefined) {
            expect(
              headItem.contentAccess,
              "Head: contentAccess = final (default)",
            ).toBe("final");
          }

          console.log(
            `  User (${userId_user}): resultAccess=${userItem.resultAccess}, contentAccess=${userItem.contentAccess}`,
          );
          console.log(
            `  Head (${userId_head}): resultAccess=${headItem.resultAccess}, contentAccess=${headItem.contentAccess}`,
          );
        });
      },
    );

    test(
      "C7386: UI: включённый сотрудник видит scoreOnly, исключённый — нет",
      { tag: ["@regression"] },
      async ({ userAuth: userPage }, testInfo) => {
        setSeverity("normal");
        test.slow();

        const baseUrl = new URL(process.env.BASE_URL).origin;

        // User (включённый в scoreOnly) — видит оценку без кнопки "Результаты"
        await test.step("User (scoreOnly): число видно, кнопки «Результаты» нет", async () => {
          const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);
          await userPage.goto(
            `${baseUrl}/ru/profile/${userId_user}/?tab=review`,
          );
          await reviewPage.assertOpened();
          await reviewPage.assertScoreOnlyDisplayed(prTitle);
          const score = await reviewPage.getFinalScoreValue(prTitle);
          expect(score, "User: числовая оценка видна").toMatch(/^\d+(\.\d+)?$/);
          console.log(`  ✓ User (scoreOnly): score="${score}"`);
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
