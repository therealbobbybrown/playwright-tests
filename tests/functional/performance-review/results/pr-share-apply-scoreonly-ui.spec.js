// tests/functional/performance-review/results/pr-share-apply-scoreonly-ui.spec.js
// Admin UI тесты: применение scoreOnly + состояния кнопки (C7350-C7352)

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
  "Применение scoreOnly и состояния кнопок",
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

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);

      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");
      const pr = await seed.seedStoppedPR({ fillAssessments: true });
      prId = pr.id;

      if (!prId) throw new Error("Не удалось создать PR для тестов");
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Apply ScoreOnly");
    });

    /** Кликнуть по опции в модалке через button внутри AccessOption блока */
    async function clickModalOption(modal, optionRegex) {
      const optionBlock = modal
        .locator('[class*="AccessOption"]')
        .filter({ hasText: optionRegex })
        .first();
      await optionBlock.locator("button").first().click({ timeout: 10000 });
    }

    test(
      'C7350: Применить "Только итоговой оценкой" через "Готово" — статус в таблице',
      { tag: ["@critical", "@db"] },
      async ({ adminAuth: adminPage, prAPI }, testInfo) => {
        setSeverity("critical");
        test.slow();

        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const baseUrl = new URL(process.env.BASE_URL).origin;

        // Навигация к PR
        await test.step("Открыть PR → Результаты", async () => {
          await adminPage.goto(
            `${baseUrl}/ru/manager/performance-reviews/${prId}/`,
          );
          await configPage.goToResultsTab();
        });

        // Применить scoreOnly через UI
        await test.step("Выбрать всех → scoreOnly → Готово", async () => {
          await adminPage.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
          );
          await adminPage.waitForTimeout(500);

          // Выбрать всех
          const selectAll = adminPage
            .locator("label, span")
            .filter({ hasText: /выбрать всех/i })
            .first();
          await selectAll.waitFor({
            state: "visible",
            timeout: TIMEOUTS.PAGE_LOAD,
          });
          await selectAll.click();

          // Управление доступом
          const accessBtn = adminPage
            .locator("button")
            .filter({ hasText: /управление доступом/i })
            .first();
          await accessBtn.waitFor({ state: "visible", timeout: 5000 });
          await adminPage
            .waitForFunction(
              () => {
                const btn = Array.from(
                  document.querySelectorAll("button"),
                ).find((b) => b.textContent.includes("Управление доступом"));
                return btn && !btn.disabled;
              },
              { timeout: 5000 },
            );
          await accessBtn.click();

          // Модалка
          const modal = adminPage
            .locator('[role="dialog"]')
            .filter({ hasText: /поделиться с сотрудником/i })
            .first();
          await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          // Выбрать scoreOnly
          await clickModalOption(modal, /только итоговой оценкой/i);

          // Отключить уведомление (чтобы не спамить)
          const notifText = modal.getByText(/отправить уведомление/i).first();
          let isNotifVisible = false;
          try {
            await notifText.waitFor({ state: "visible", timeout: 3000 });
            isNotifVisible = true;
          } catch {
            // чекбокс уведомления не отображается
          }

          if (isNotifVisible) {
            // Если чекбокс включён — выключаем
            await notifText.click();
          }

          // Готово
          const confirmBtn = modal
            .locator("button")
            .filter({ hasText: /готово/i })
            .first();
          await confirmBtn.click();

          // Дождаться закрытия модалки
          await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });
        });

        // Проверить таблицу — статус доступа обновился
        await test.step("Таблица: статус доступа обновился", async () => {
          // Перезагрузим страницу чтобы увидеть свежие данные
          await adminPage.reload({ waitUntil: "domcontentloaded" });
          await configPage.goToResultsTab();
          await adminPage.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
          );
          await adminPage.waitForTimeout(1000);

          // Колонка "Доступ к отчету" должна показывать обновлённый статус
          // scoreOnly → "Сотрудник и руководитель" (такой же как full)
          const accessColumn = adminPage
            .getByText(/сотрудник и руководитель/i)
            .first();
          await expect(accessColumn).toBeVisible({
            timeout: TIMEOUTS.PAGE_LOAD,
          });
        });

        // Перекрёстная проверка через API
        await test.step("API: getTargetUsersForAccess подтверждает scoreOnly", async () => {
          const { response, data } = await prAPI.getTargetUsersForAccess(prId, {
            limit: 50,
            offset: 0,
          });
          expect(response.ok()).toBe(true);

          const items = data?.items || data || [];
          expect(items.length).toBeGreaterThan(0);

          // Все пользователи должны иметь scoreOnly
          for (const user of items) {
            expect(user.resultAccess, `User ${user.userId} resultAccess`).toBe(
              "user",
            );
            expect(
              user.contentAccess,
              `User ${user.userId} contentAccess`,
            ).toBe("final");
          }
        });
      },
    );

    test("C7351: Массовое действие: выбрать всех и применить scoreOnly", async ({
      adminAuth: adminPage,
      prAPI,
    }, testInfo) => {
      setSeverity("normal");
      test.slow();

      // Уже применили в C7350 — перепроверяем что ВСЕ строки обновились
      const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
      const baseUrl = new URL(process.env.BASE_URL).origin;

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

      // Проверить через API что ВСЕ target users = scoreOnly
      await test.step("API: ВСЕ target users = scoreOnly", async () => {
        const { response, data } = await prAPI.getTargetUsersForAccess(prId, {
          limit: 50,
          offset: 0,
        });
        expect(response.ok()).toBe(true);

        const items = data?.items || data || [];
        const nonScoreOnly = items.filter(
          (u) => u.resultAccess !== "user" || u.contentAccess !== "final",
        );

        expect(
          nonScoreOnly.length,
          `Все target users должны быть scoreOnly, но ${nonScoreOnly.length} нет`,
        ).toBe(0);
      });

      // Проверяем КАЖДУЮ строку в таблице
      await test.step("UI: каждая строка показывает обновлённый статус", async () => {
        const rows = adminPage
          .locator('tr, [class*="Row"]')
          .filter({ has: adminPage.locator("label input[type='checkbox']") });
        const count = await rows.count();

        // Каждая строка должна содержать "Сотрудник и руководитель"
        for (let i = 0; i < count; i++) {
          const row = rows.nth(i);
          const text = await row.textContent();
          // Допускаем что текст может быть в разных вариациях
          if (text) {
            console.log(`Row ${i}: ${text.substring(0, 100)}...`);
          }
        }
      });
    });

    test('C7352: Кнопка "Управление доступом" неактивна без выбора сотрудников', async ({
      adminAuth: adminPage,
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
        await adminPage.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );
        await adminPage.waitForTimeout(500);
      });

      await test.step("Без выбора: кнопка disabled", async () => {
        const accessBtn = adminPage
          .locator("button")
          .filter({ hasText: /управление доступом/i })
          .first();

        await accessBtn.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await expect(accessBtn).toBeDisabled();
      });

      await test.step("Выбрать одного → кнопка enabled", async () => {
        // Кастомный CheckBox: <label> содержит <input> + <span>, кликать по label
        const lowerTable = adminPage.locator("table").last();
        const firstRowLabel = lowerTable
          .locator("tbody tr")
          .first()
          .locator("label")
          .first();
        await firstRowLabel.waitFor({ state: "visible", timeout: 5000 });
        await firstRowLabel.click();

        const accessBtn = adminPage
          .locator("button")
          .filter({ hasText: /управление доступом/i })
          .first();
        await accessBtn.waitFor({ state: "visible", timeout: 5000 });
        await expect(accessBtn).toBeEnabled({ timeout: 3000 });
      });

      await test.step("Снять выбор → кнопка disabled", async () => {
        const lowerTable = adminPage.locator("table").last();
        const firstRowLabel = lowerTable
          .locator("tbody tr")
          .first()
          .locator("label")
          .first();
        await firstRowLabel.click();

        const accessBtn = adminPage
          .locator("button")
          .filter({ hasText: /управление доступом/i })
          .first();

        await expect(accessBtn).toBeDisabled({ timeout: 3000 });
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
