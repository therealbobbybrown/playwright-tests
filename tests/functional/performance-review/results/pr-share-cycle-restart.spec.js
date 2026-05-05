// tests/functional/performance-review/results/pr-share-cycle-restart.spec.js
// Перезапуск PR (новый цикл) скрывает ранее пошаренные scoreOnly результаты

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

const test = baseTest.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "Шаринг результатов — перезапуск PR (новый цикл)",
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
    test.describe.configure({ mode: "serial" });
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

      // Seed PR: создать → добавить участника → анкеты → старт → заполнить → стоп → scoreOnly
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
        console.warn("changeResultAccess failed:", await accessResp.text());
      }

      console.log(
        `✓ PR для цикл-рестарта: id=${prId}, title="${prTitle}", targetUser=${userId}`,
      );
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Share Cycle Restart");
    });

    test(
      "C7383: Цикл 1 — сотрудник видит scoreOnly оценку в профиле",
      { tag: ["@regression"] },
      async ({ userAuth: userPage }, testInfo) => {
        setSeverity("normal");
        test.slow();

        const baseUrl = new URL(process.env.BASE_URL).origin;
        const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);

        await test.step("Открыть профиль → Оценка сотрудника", async () => {
          await userPage.goto(`${baseUrl}/ru/profile/${userId}/?tab=review`);
          await reviewPage.assertOpened();
        });

        await test.step("Числовая оценка видна", async () => {
          const score = await reviewPage.getFinalScoreValue(prTitle);
          expect(score, "Числовая оценка должна быть числом").not.toBeNull();
          expect(
            score,
            "Числовая оценка должна соответствовать формату",
          ).toMatch(/^\d+(\.\d+)?$/);
          console.log(`  ✓ Цикл 1: scoreOnly score=${score}`);
        });

        await test.step("Кнопка «Результаты» отсутствует", async () => {
          await reviewPage.assertResultsButtonHidden(prTitle);
        });
      },
    );

    test(
      "C7384: Цикл 2 — перезапуск PR скрывает ранее пошаренные результаты",
      { tag: ["@regression"] },
      async ({ userAuth: userPage, prAPI }, testInfo) => {
        setSeverity("normal");
        test.slow();

        const baseUrl = new URL(process.env.BASE_URL).origin;
        const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);

        // Перезапустить PR (создаёт новую ревизию)
        await test.step("API: перезапустить PR (новый цикл)", async () => {
          const { response } = await prAPI.start(prId);
          expect(response.ok(), "start (restart) PR").toBe(true);
          console.log("  ✓ PR перезапущен (новая ревизия)");
        });

        // Подождать пропагации состояния
        await test.step("Ожидание пропагации", async () => {
          await new Promise((r) => setTimeout(r, 2000));
        });

        // Открыть профиль и проверить, что оценка скрыта
        await test.step("Профиль: scoreOnly результат скрыт после рестарта", async () => {
          await userPage.goto(`${baseUrl}/ru/profile/${userId}/?tab=review`);
          await reviewPage.assertOpened();

          // После перезапуска PR строка может: исчезнуть, показать статус без оценки,
          // или оценка может стать невидимой. Проверяем через try/catch.
          let scoreVisible = false;
          try {
            const score = await reviewPage.getFinalScoreValue(prTitle);
            scoreVisible = score !== null && /^\d+(\.\d+)?$/.test(score);
          } catch {
            // Строка не найдена в таблице — это корректное поведение
            scoreVisible = false;
          }

          expect(
            scoreVisible,
            `ScoreOnly оценка должна быть скрыта после перезапуска PR "${prTitle}"`,
          ).toBe(false);
          console.log("  ✓ Цикл 2: scoreOnly оценка скрыта после рестарта");
        });
      },
    );

    test.afterAll(async ({ request }) => {
      if (prId) {
        try {
          const api = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          // Остановить, если запущен (после рестарта)
          await api.stop(prId).catch(() => {});
          await api.archive(prId);
          await api.remove(prId);
        } catch {
          // ignore
        }
      }
    });
  },
);
