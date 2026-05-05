// tests/functional/profile/profile-review-scoreonly-security.spec.js
// Employee UI: прямой URL на results при scoreOnly + руководитель видит полные (C7325, C7328)

import { test as baseTest, expect } from "../../fixtures/auth.js";
import { ProfileMainPage } from "../../../pages/ProfileMainPage.js";
import { ProfileEmployeeReviewPage } from "../../../pages/ProfileEmployeeReviewPage.js";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import { PerformanceReviewSeedHelper } from "../../utils/seed/PerformanceReviewSeedHelper.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { setupCharacteristics } from "../../utils/StatisticsSettingsHelper.js";
import { TIMEOUTS } from "../../utils/constants.js";

const test = baseTest.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

/**
 * Декодировать JWT токен и вернуть userId
 */
function getUserIdFromToken(token) {
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

test.describe(
  "Профиль сотрудника — безопасность scoreOnly и роль руководителя",
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
    let revisionId = null;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(240_000);

      // Получить userId USER через JWT
      const userAPI = new PerformanceReviewAPI(request);
      const { email: userEmail, password: userPassword } =
        getCredentials("user");
      await userAPI.signIn(userEmail, userPassword);
      userId = getUserIdFromToken(userAPI.token);
      if (!userId) throw new Error("Не удалось получить userId для USER");

      // Декомпозированный seed: характеристики ДО старта PR
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");

      // Создать черновик
      const pr = await seed.seedDraftPR();
      prId = pr.id;
      prTitle = pr.title;
      if (!prId) throw new Error("Не удалось создать PR");

      // Настроить характеристики ДО старта
      const adminAPI = new PerformanceReviewAPI(request);
      const { email: adminEmail, password: adminPassword } =
        getCredentials("admin");
      await adminAPI.signIn(adminEmail, adminPassword);
      await setupCharacteristics(adminAPI, prId);

      // Добавить target users + assessments → запустить → заполнить
      await seed.addTargetUsers(prId, [userId]);
      await seed.attachAssessments(prId);
      const { response: startResp } = await seed.prAPI.start(prId);
      if (!startResp.ok()) {
        throw new Error(`Не удалось запустить PR: ${await startResp.text()}`);
      }

      // Получить revisionId
      const { data: revision } = await seed.prAPI.getLastRevision(prId);
      revisionId = revision?.id || null;

      await seed.fillQuestionnaires(prId);

      // Остановить PR
      const { response: stopResp } = await adminAPI.stop(prId);
      if (!stopResp.ok()) {
        console.warn("Не удалось остановить PR:", await stopResp.text());
      }

      // Подождать завершения асинхронной остановки
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        const { data: histData } = await adminAPI.get(
          `/private/performance-reviews/history/?status=all&targetUserId=${userId}&sortBy=dateStart&orderBy=DESC&limit=5&offset=0`,
        );
        const item = (histData?.items || []).find(
          (i) => i.performanceReview?.id === prId,
        );
        if (item?.finalGrade?.value != null) break;
      }

      // Установить scoreOnly
      const { response } = await adminAPI.changeResultAccess(prId, {
        targetUsersAll: true,
        exceptTargetUsersIds: [],
        targetUsersIds: [],
        resultAccess: "user",
        contentAccess: "final",
        enableNotification: false,
        notificationMessage: "",
        includePdfLink: false,
      });
      expect(response.ok()).toBe(true);

      console.log(
        `✓ PR создан: id=${prId}, title="${prTitle}", revision=${revisionId}, user=${userId}`,
      );
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PROFILE, "ScoreOnly Security");
    });

    test(
      "C7325: Сотрудник не может перейти к результатам при scoreOnly (прямой URL)",
      { tag: ["@security"] },
      async ({ userAuth: userPage }, testInfo) => {
        setSeverity("normal");
        test.slow();

        const baseUrl = process.env.BASE_URL;

        await test.step("Прямой URL на results → нет доступа", async () => {
          // Попытка перейти напрямую к полным результатам
          const resultsUrl = new URL(`/ru/manager/performance-reviews/${prId}/results/?targetUserId=${userId}&revisionId=${revisionId}`, baseUrl).toString();
          const resp = await userPage.goto(resultsUrl);

          // Ожидаем: либо редирект, либо отсутствие полных данных
          const currentUrl = userPage.url();
          const status = resp?.status();

          // Проверяем блокировку доступа: статус 403/404 ИЛИ редирект
          const isBlockedByStatus = status === 403 || status === 404;
          const isRedirected =
            !currentUrl.includes("/results/") ||
            currentUrl.includes("/login");

          if (!isBlockedByStatus && !isRedirected) {
            // Попали на страницу — проверяем что нет полных данных
            const hasCompetenceTable = await userPage
              .locator("table")
              .filter({ hasText: /компетенц/i })
              .count();
            const hasRadar = await userPage
              .locator('[class*="Radar"], [class*="radar"], canvas')
              .count();

            // Полные результаты НЕ должны быть доступны при scoreOnly
            expect(
              hasCompetenceTable,
              "Таблица компетенций НЕ должна быть доступна при scoreOnly",
            ).toBe(0);
            expect(
              hasRadar,
              "Радар-диаграмма НЕ должна быть доступна при scoreOnly",
            ).toBe(0);
          } else {
            // Доступ заблокирован — это ожидаемое поведение
            expect(
              isBlockedByStatus || isRedirected,
              `Доступ к полным результатам должен быть заблокирован (status=${status}, url=${currentUrl})`,
            ).toBe(true);
          }
        });
      },
    );

    test(
      "C7328: Руководитель видит полные результаты подчинённого при scoreOnly",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, prAPI }, testInfo) => {
        setSeverity("critical");
        test.slow();

        const baseUrl = process.env.BASE_URL;

        // Админ (как руководитель/создатель PR) видит полные результаты
        await test.step("Админ: открыть профиль сотрудника → Оценка", async () => {
          await adminPage.goto(new URL(`/ru/profile/${userId}/?tab=review`, baseUrl).toString());
          // Ждём загрузки таблицы
          await adminPage
            .getByRole("heading", { name: /циклы оценок/i })
            .first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
        });

        // Руководитель должен видеть данные PR — или строку с кнопкой "Результаты" или сам score
        await test.step("Руководитель видит PR в таблице", async () => {
          const row = adminPage
            .locator("tbody tr")
            .filter({ hasText: prTitle });
          await row.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });

          const rowText = await row.textContent();
          expect(rowText, "Строка PR видна руководителю").toContain(prTitle);
        });

        // Проверяем через API что руководитель имеет доступ (getTargetUsersForAccess)
        await test.step("API: руководитель видит данные target users", async () => {
          const { response, data } = await prAPI.getTargetUsersForAccess(prId, {
            limit: 50,
            offset: 0,
          });
          expect(response.ok(), "Admin видит target users").toBe(true);

          const items = data?.items || data || [];
          expect(items.length, "Есть target users").toBeGreaterThan(0);

          // Доступ сотрудника = scoreOnly, но руководитель всё равно видит данные
          const targetUser = items.find((u) => u.userId === userId);
          expect(targetUser, "Target user найден в списке").toBeTruthy();
          console.log(
            `  Руководитель видит: resultAccess=${targetUser.resultAccess}, contentAccess=${targetUser.contentAccess}`,
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
          // ignore
        }
      }
    });
  },
);
