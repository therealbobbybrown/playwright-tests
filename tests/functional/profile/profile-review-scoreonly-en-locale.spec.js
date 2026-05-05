// tests/functional/profile/profile-review-scoreonly-en-locale.spec.js
// Профиль сотрудника — scoreOnly на EN locale (отсутствие сырых i18n-ключей)

import { test as baseTest, expect } from "../../fixtures/auth.js";
import { ProfileEmployeeReviewPage } from "../../../pages/ProfileEmployeeReviewPage.js";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import { PerformanceReviewSeedHelper } from "../../utils/seed/PerformanceReviewSeedHelper.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

const test = baseTest.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

/** Паттерны сырых i18n-ключей, которых НЕ должно быть в переведённом UI */
const RAW_I18N_PATTERNS = [/\{\{/, /_key_/, /\.key\./, /\bi18n\b/];

test.describe(
  "Профиль сотрудника — scoreOnly EN locale",
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

      // Seed PR БЕЗ текстовых характеристик
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
        `PR scoreOnly EN: id=${prId}, title="${prTitle}", targetUser=${userId}`,
      );
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PROFILE, "ScoreOnly EN Locale");
    });

    test("C####: Профиль сотрудника — scoreOnly корректно отображается на английском (EN locale)", async ({
      userAuth: userPage,
    }, testInfo) => {
      setSeverity("normal");
      test.slow();

      const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);
      const baseUrl = process.env.BASE_URL;

      await test.step("Открыть профиль на EN locale → вкладка review", async () => {
        await userPage.goto(new URL(`/en/profile/${userId}/?tab=review`, baseUrl).toString());
        await userPage.waitForLoadState("domcontentloaded");
        // Ждём появления таблицы с циклами оценок (заголовок может быть на EN)
        await userPage
          .locator('h1, h2, h3, [class*="HistoryTable_"], table')
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
      });

      await test.step("Числовая оценка отображается", async () => {
        const score = await reviewPage.getFinalScoreValue(prTitle);
        expect(score, "Числовая оценка должна быть числом").toMatch(
          /^\d+(\.\d+)?$/,
        );

        console.log(`  Score="${score}" для PR "${prTitle}"`);
      });

      await test.step("Кнопка Results/Результаты отсутствует (scoreOnly)", async () => {
        const row = reviewPage.getRowByPRName(prTitle);
        await row.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });

        // Проверяем отсутствие ссылки "Результаты" / "Results" в строке
        const resultsLink = row
          .locator("a")
          .filter({ hasText: /results|результаты/i });
        const count = await resultsLink.count();
        expect(
          count,
          'Ссылка "Results"/"Результаты" не должна присутствовать при scoreOnly',
        ).toBe(0);
      });

      await test.step("Нет сырых i18n-ключей в секции review", async () => {
        // Берём текст всей области с таблицей оценок
        const reviewSection = userPage
          .locator('[class*="HistoryTable_"], table, [class*="Review"]')
          .first();
        const sectionExists = await reviewSection.count();
        expect(
          sectionExists,
          "Секция с таблицей оценок должна присутствовать для проверки i18n",
        ).toBeGreaterThan(0);

        const sectionText = await reviewSection.innerText();
        for (const pattern of RAW_I18N_PATTERNS) {
          expect(
            sectionText,
            `Не должно быть сырых i18n-ключей: ${pattern}`,
          ).not.toMatch(pattern);
        }
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
