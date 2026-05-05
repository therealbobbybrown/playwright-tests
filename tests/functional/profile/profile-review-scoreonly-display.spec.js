// tests/functional/profile/profile-review-scoreonly-display.spec.js
// Employee UI тесты: отображение scoreOnly/full/none в профиле (C7320, C7323, C7324)

import { test as baseTest, expect } from "../../fixtures/auth.js";
import { ProfileEmployeeReviewPage } from "../../../pages/ProfileEmployeeReviewPage.js";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import { PerformanceReviewSeedHelper } from "../../utils/seed/PerformanceReviewSeedHelper.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { setupCharacteristics } from "../../utils/StatisticsSettingsHelper.js";

const test = baseTest.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "Профиль сотрудника — scoreOnly/full/none отображение",
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
    test.describe.configure({ mode: "serial" });

    let prId = null;
    let prTitle = null;
    let userId = null;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);

      // 1. Получить userId текущего USER через JWT
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

      // 2. Seed PR: черновик → характеристики → старт → анкеты → стоп
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");

      const pr = await seed.seedDraftPR();
      prId = pr.id;
      prTitle = pr.title;
      if (!prId) throw new Error("Не удалось создать PR");

      // Настроить текстовые характеристики (Низко/Средне/Высоко)
      const adminAPI = new PerformanceReviewAPI(request);
      const { email: adminEmail, password: adminPassword } =
        getCredentials("admin");
      await adminAPI.signIn(adminEmail, adminPassword);
      await setupCharacteristics(adminAPI, prId);

      // Добавить target users + привязать assessments + запустить
      await seed.addTargetUsers(prId, [userId]);
      await seed.attachAssessments(prId);

      const { response: startResp } = await seed.prAPI.start(prId);
      if (!startResp.ok()) {
        throw new Error(`Не удалось запустить PR: ${await startResp.text()}`);
      }

      // Заполнить анкеты + остановить
      await seed.fillQuestionnaires(prId);
      const { response: stopResp } = await adminAPI.stop(prId);
      if (!stopResp.ok()) {
        console.warn("Не удалось остановить PR:", await stopResp.text());
      }

      console.log(
        `✓ PR создан: id=${prId}, title="${prTitle}", targetUser=${userId}`,
      );
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PROFILE, "ScoreOnly Display");
    });

    /**
     * Установить доступ для target user через API
     */
    async function setAccess(prAPI, mode) {
      const payloads = {
        none: { resultAccess: "head", contentAccess: "final" },
        scoreOnly: { resultAccess: "user", contentAccess: "final" },
        full: { resultAccess: "user", contentAccess: "finalAndResults" },
      };
      const p = payloads[mode];
      const { response } = await prAPI.changeResultAccess(prId, {
        targetUsersAll: true,
        exceptTargetUsersIds: [],
        targetUsersIds: [],
        ...p,
        enableNotification: false,
        notificationMessage: "",
        includePdfLink: false,
      });
      expect(response.ok(), `changeResultAccess(${mode})`).toBe(true);
    }

    test(
      "C7320: Сотрудник видит только итоговую оценку без кнопки «Результаты»",
      { tag: ["@critical"] },
      async ({ userAuth: userPage, prAPI }, testInfo) => {
        setSeverity("critical");
        test.slow();

        const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);

        // Установить scoreOnly
        await test.step("API: установить scoreOnly", async () => {
          await setAccess(prAPI, "scoreOnly");
        });

        // Открыть профиль → вкладка "Оценка сотрудника"
        await test.step("Открыть профиль → Оценка сотрудника", async () => {
          const baseUrl = process.env.BASE_URL;
          await userPage.goto(new URL(`/ru/profile/${userId}/?tab=review`, baseUrl).toString());
          await reviewPage.assertOpened();
        });

        // Проверить scoreOnly отображение
        await test.step("ScoreOnly: число видно, «Результаты» нет", async () => {
          await reviewPage.assertScoreOnlyDisplayed(prTitle);
        });

        // Получить конкретное значение оценки из API для проверки
        await test.step("API: подтвердить значение оценки", async () => {
          const score = await reviewPage.getFinalScoreValue(prTitle);
          expect(score, "Числовая оценка должна быть числом").toMatch(
            /^\d+(\.\d+)?$/,
          );
          console.log(`  ScoreOnly: score="${score}" для "${prTitle}"`);
        });
      },
    );

    test("C7323: Сотрудник видит полные результаты с кнопкой «Результаты» (full access)", async ({
      userAuth: userPage,
      prAPI,
    }, testInfo) => {
      setSeverity("normal");
      test.slow();

      const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);

      // Установить full access
      await test.step("API: установить full access", async () => {
        await setAccess(prAPI, "full");
      });

      await test.step("Открыть профиль → Оценка сотрудника", async () => {
        const baseUrl = process.env.BASE_URL;
        await userPage.goto(new URL(`/ru/profile/${userId}/?tab=review`, baseUrl).toString());
        await reviewPage.assertOpened();
      });

      await test.step("Full: ссылка «Результаты» видна и кликабельна", async () => {
        await reviewPage.assertFullResultsDisplayed(prTitle);
      });
    });

    test("C7324: Сотрудник не видит оценку после отзыва доступа (none)", async ({
      userAuth: userPage,
      prAPI,
    }, testInfo) => {
      setSeverity("normal");
      test.slow();

      const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);

      // Установить none
      await test.step("API: установить none (отозвать доступ)", async () => {
        await setAccess(prAPI, "none");
      });

      await test.step("Открыть профиль → Оценка сотрудника", async () => {
        const baseUrl = process.env.BASE_URL;
        await userPage.goto(new URL(`/ru/profile/${userId}/?tab=review`, baseUrl).toString());
        await reviewPage.assertOpened();
      });

      await test.step("None: ни оценки, ни кнопки «Результаты»", async () => {
        await reviewPage.assertNoAccessDisplayed(prTitle);
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
