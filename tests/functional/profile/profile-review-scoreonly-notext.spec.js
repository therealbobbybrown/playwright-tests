// tests/functional/profile/profile-review-scoreonly-notext.spec.js
// C7322: Сотрудник видит только число без текстовой характеристики (если не настроено)

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
  "Профиль сотрудника — scoreOnly без текстовых характеристик",
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
    let prId = null;
    let prTitle = null;
    let userId = null;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);

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

      // Seed PR БЕЗ текстовых характеристик (не вызываем setupCharacteristics)
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");

      const pr = await seed.seedDraftPR();
      prId = pr.id;
      prTitle = pr.title;
      if (!prId) throw new Error("Не удалось создать PR");

      await seed.addTargetUsers(prId, [userId]);
      await seed.attachAssessments(prId);

      const { response: startResp } = await seed.prAPI.start(prId);
      if (!startResp.ok()) {
        throw new Error(`Не удалось запустить PR: ${await startResp.text()}`);
      }

      await seed.fillQuestionnaires(prId);

      const adminAPI = new PerformanceReviewAPI(request);
      const { email: adminEmail, password: adminPassword } =
        getCredentials("admin");
      await adminAPI.signIn(adminEmail, adminPassword);
      const { response: stopResp } = await adminAPI.stop(prId);
      if (!stopResp.ok()) {
        console.warn("Не удалось остановить PR:", await stopResp.text());
      }

      // Установить scoreOnly
      const { response: accessResp } = await adminAPI.changeResultAccess(prId, {
        targetUsersAll: true,
        exceptTargetUsersIds: [],
        targetUsersIds: [],
        resultAccess: "user",
        contentAccess: "final",
        enableNotification: false,
        notificationMessage: "",
        includePdfLink: false,
      });
      if (!accessResp.ok()) {
        throw new Error(
          `changeResultAccess(scoreOnly) не удалась: ${accessResp.status()} ${await accessResp.text()}`,
        );
      }

      console.log(
        `✓ PR без характеристик: id=${prId}, title="${prTitle}", targetUser=${userId}`,
      );
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PROFILE, "ScoreOnly No Text");
    });

    test("C7322: Сотрудник видит только число без текстовой характеристики", async ({
      userAuth: userPage,
    }, testInfo) => {
      setSeverity("normal");
      test.slow();

      const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);

      await test.step("Открыть профиль → Оценка сотрудника", async () => {
        const baseUrl = process.env.BASE_URL;
        await userPage.goto(new URL(`/ru/profile/${userId}/?tab=review`, baseUrl).toString());
        await reviewPage.assertOpened();
      });

      await test.step("Число есть, текстовой характеристики нет", async () => {
        const score = await reviewPage.getFinalScoreValue(prTitle);
        expect(score, "Числовая оценка должна быть числом").toMatch(
          /^\d+(\.\d+)?$/,
        );

        const label = await reviewPage.getFinalScoreLabel(prTitle);
        expect(
          label,
          "Текстовая характеристика не должна отображаться",
        ).toBeNull();

        console.log(`  Score="${score}", Label=${label} (null = корректно)`);
      });

      await test.step("Кнопка «Результаты» отсутствует", async () => {
        await reviewPage.assertResultsButtonHidden(prTitle);
      });
    });

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
