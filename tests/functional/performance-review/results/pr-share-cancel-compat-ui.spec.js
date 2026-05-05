// tests/functional/performance-review/results/pr-share-cancel-compat-ui.spec.js
// Admin UI тесты: отмена модалки, обратная совместимость, per-user (C7353-C7355)

import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
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
import { TIMEOUTS } from "../../../utils/constants.js";

const test = baseTest.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "Отмена модалки, обратная совместимость, per-user",
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
    let targetUsers = [];

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);

      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");
      const pr = await seed.seedStoppedPR({ fillAssessments: true });
      prId = pr.id;

      if (!prId) throw new Error("Не удалось создать PR");

      // Получить target users
      const prAPI = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await prAPI.signIn(email, password);
      const { data } = await prAPI.getTargetUsersForAccess(prId, {
        limit: 50,
        offset: 0,
      });
      targetUsers = data?.items || data || [];
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Share Cancel/Compat");
    });

    async function clickModalOption(modal, optionRegex) {
      const optionBlock = modal
        .locator('[class*="AccessOption"]')
        .filter({ hasText: optionRegex })
        .first();
      await optionBlock.locator("button").first().click({ timeout: 10000 });
    }

    async function openShareModal(page) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);

      const selectAll = page
        .locator("label, span")
        .filter({ hasText: /выбрать всех/i })
        .first();
      await selectAll.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await selectAll.click();

      const accessBtn = page
        .locator("button")
        .filter({ hasText: /управление доступом/i })
        .first();
      await accessBtn.waitFor({ state: "visible", timeout: 5000 });
      await page
        .waitForFunction(
          () => {
            const btn = Array.from(document.querySelectorAll("button")).find(
              (b) => b.textContent.includes("Управление доступом"),
            );
            return btn && !btn.disabled;
          },
          { timeout: 5000 },
        );
      await accessBtn.click();

      const modal = page
        .locator('[role="dialog"]')
        .filter({ hasText: /поделиться с сотрудником/i })
        .first();
      await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      return modal;
    }

    test("C7353: Отмена модалки не меняет доступ", async ({
      adminAuth: adminPage,
      prAPI,
    }, testInfo) => {
      setSeverity("normal");
      test.slow();

      const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
      const baseUrl = new URL(process.env.BASE_URL).origin;

      // Сначала установим none через API (чтобы знать начальное состояние)
      await test.step("API: установить none для всех", async () => {
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

      await test.step("Открыть PR → Результаты", async () => {
        await adminPage.goto(
          `${baseUrl}/ru/manager/performance-reviews/${prId}/`,
        );
        await configPage.goToResultsTab();
      });

      // Открыть модалку, выбрать scoreOnly, но нажать "Отмена"
      await test.step('Выбрать scoreOnly → нажать "Отмена"', async () => {
        const modal = await openShareModal(adminPage);

        await clickModalOption(modal, /только итоговой оценкой/i);

        // Отмена
        await modal
          .locator("button")
          .filter({ hasText: /отмена/i })
          .first()
          .click();
        await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });
      });

      // Проверить что доступ НЕ изменился через API
      await test.step("API: доступ по-прежнему none", async () => {
        const { data } = await prAPI.getTargetUsersForAccess(prId, {
          limit: 50,
          offset: 0,
        });
        const items = data?.items || data || [];
        for (const user of items) {
          expect(
            user.resultAccess,
            `User ${user.userId}: resultAccess должен остаться head`,
          ).toBe("head");
          expect(
            user.contentAccess,
            `User ${user.userId}: contentAccess должен остаться final`,
          ).toBe("final");
        }
      });
    });

    test('C7354: Обратная совместимость: "Результатами и итоговой оценкой" работает как раньше', async ({
      adminAuth: adminPage,
      prAPI,
    }, testInfo) => {
      setSeverity("normal");
      test.slow();

      const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
      const baseUrl = new URL(process.env.BASE_URL).origin;

      await test.step("Открыть PR → Результаты", async () => {
        await adminPage.goto(
          `${baseUrl}/ru/manager/performance-reviews/${prId}/`,
        );
        await configPage.goToResultsTab();
      });

      // Применить full через UI
      await test.step('Применить "Результатами и итоговой оценкой"', async () => {
        const modal = await openShareModal(adminPage);

        await clickModalOption(modal, /результатами и итоговой оценкой/i);

        // Отключить уведомление
        const notifText = modal.getByText(/отправить уведомление/i).first();
        let isNotifVisible = false;
        try {
          await notifText.waitFor({ state: "visible", timeout: 3000 });
          isNotifVisible = true;
        } catch {
          // чекбокс уведомления не отображается
        }
        if (isNotifVisible) {
          await notifText.click();
        }

        // Готово
        await modal
          .locator("button")
          .filter({ hasText: /готово/i })
          .first()
          .click();
        await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });
      });

      // API: подтвердить full
      await test.step("API: доступ = full (user + finalAndResults)", async () => {
        const { data } = await prAPI.getTargetUsersForAccess(prId, {
          limit: 50,
          offset: 0,
        });
        const items = data?.items || data || [];
        expect(items.length).toBeGreaterThan(0);

        for (const user of items) {
          expect(user.resultAccess, `User ${user.userId}`).toBe("user");
          expect(user.contentAccess, `User ${user.userId}`).toBe(
            "finalAndResults",
          );
        }
      });

      // Таблица: статус = "Сотрудник и руководитель"
      await test.step("Таблица: статус = полный доступ", async () => {
        await adminPage.reload({ waitUntil: "domcontentloaded" });
        await configPage.goToResultsTab();
        await adminPage.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );
        await adminPage.waitForTimeout(1000);

        await expect(
          adminPage.getByText(/сотрудник и руководитель/i).first(),
        ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
      });
    });

    test("C7355: Индивидуальный доступ через выбор одного пользователя", async ({
      adminAuth: adminPage,
      prAPI,
    }, testInfo) => {
      setSeverity("normal");
      test.slow();

      const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
      const baseUrl = new URL(process.env.BASE_URL).origin;

      // Сначала установим none для всех
      await test.step("API: сбросить доступ в none", async () => {
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

      await test.step("Открыть PR → Результаты", async () => {
        await adminPage.goto(
          `${baseUrl}/ru/manager/performance-reviews/${prId}/`,
        );
        await configPage.goToResultsTab();
        await adminPage.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );
        await adminPage.waitForTimeout(500);
      });

      // Выбрать ОДНОГО пользователя (первый чекбокс в нижней таблице)
      await test.step("Выбрать одного пользователя → scoreOnly", async () => {
        // Кастомный CheckBox: <label> содержит <input> + <span>, кликать по label
        const lowerTable = adminPage.locator("table").last();
        const rowLabels = lowerTable.locator("tbody tr label");
        const count = await rowLabels.count();
        expect(count, "Должны быть чекбоксы в таблице").toBeGreaterThan(0);

        // Клик по первому чекбоксу (конкретный пользователь)
        await rowLabels.first().click();

        // Управление доступом
        const accessBtn = adminPage
          .locator("button")
          .filter({ hasText: /управление доступом/i })
          .first();
        await accessBtn.waitFor({ state: "visible", timeout: 5000 });
        await adminPage
          .waitForFunction(
            () => {
              const btn = Array.from(document.querySelectorAll("button")).find(
                (b) => b.textContent.includes("Управление доступом"),
              );
              return btn && !btn.disabled;
            },
            { timeout: 5000 },
          );
        await accessBtn.click();

        const modal = adminPage
          .locator('[role="dialog"]')
          .filter({ hasText: /поделиться с сотрудником/i })
          .first();
        await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        await clickModalOption(modal, /только итоговой оценкой/i);

        // Выключить уведомление
        const notifText = modal.getByText(/отправить уведомление/i).first();
        let isNotifVisible = false;
        try {
          await notifText.waitFor({ state: "visible", timeout: 3000 });
          isNotifVisible = true;
        } catch {
          // чекбокс уведомления не отображается
        }
        if (isNotifVisible) {
          await notifText.click();
        }

        await modal
          .locator("button")
          .filter({ hasText: /готово/i })
          .first()
          .click();
        await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });
      });

      // Проверить через API: ТОЛЬКО один пользователь = scoreOnly, остальные = none
      await test.step("API: один = scoreOnly, остальные = none", async () => {
        const { data } = await prAPI.getTargetUsersForAccess(prId, {
          limit: 50,
          offset: 0,
        });
        const items = data?.items || data || [];
        expect(items.length).toBeGreaterThan(1);

        const scoreOnlyUsers = items.filter(
          (u) => u.resultAccess === "user" && u.contentAccess === "final",
        );
        const noneUsers = items.filter(
          (u) => u.resultAccess === "head" && u.contentAccess === "final",
        );

        expect(scoreOnlyUsers.length, "Ровно 1 пользователь с scoreOnly").toBe(
          1,
        );
        expect(noneUsers.length, "Остальные = none").toBe(items.length - 1);
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
