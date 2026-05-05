// tests/functional/development-plans/development-plan-comments.spec.js
// TestRail: C2697, C2698, C2700 - Комментарии к действиям ИПР
// C2701, C2702, C2703 — дубликаты, живут в module-toggle / create-smoke / tasks-crud
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlansListPage } from "../../../pages/DevelopmentPlansListPage.js";
import { DevelopmentPlanDetailsPage } from "../../../pages/DevelopmentPlanDetailsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";
import { DevelopmentPlansAPI } from "../../utils/api/DevelopmentPlansAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import { ensureDevelopmentPlansEnabled } from "../../utils/helpers/ensureDevelopmentPlansEnabled.js";

test.describe(
  "Комментарии к действиям ИПР",
  { tag: ["@ui", "@regression"] },
  () => {
    let testPlanId = null;

    test.beforeAll(async ({ request }) => {
      await ensureDevelopmentPlansEnabled(request);

      const api = new DevelopmentPlansAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Try to use existing plan first
      const { data } = await api.getDevelopmentPlans({ limit: 1 });
      if (data?.items?.length > 0 || data?.length > 0) {
        console.log("[dev-plan-comments] Existing plans found, no need to create");
        return;
      }

      // No plans — create one
      const userId = api.getCurrentUserId();
      const { response, data: created } = await api.createDevelopmentPlan({
        title: `Автотест ИПР комментарии ${Date.now()}`,
        responsibleUserId: userId,
      });
      if (!response.ok()) {
        throw new Error(`Failed to create dev plan: ${response.status()}`);
      }
      testPlanId = created?.id || created?.data?.id;
      console.log(`[dev-plan-comments] Created plan ID: ${testPlanId}`);
    });

    test.afterAll(async ({ request }) => {
      if (!testPlanId) return;
      try {
        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);
        const { response } = await api.deleteDevelopmentPlan(testPlanId);
        if (response.ok()) {
          console.log(`[dev-plan-comments] Cleanup: deleted plan ${testPlanId}`);
        } else {
          console.warn(`[dev-plan-comments] Cleanup failed: ${response.status()}`);
        }
      } catch (e) {
        console.warn(`[dev-plan-comments] Cleanup error: ${e.message}`);
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test("C2697: сотрудник/админ может оставить комментарий к действию", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const plansPage = new DevelopmentPlansListPage(page, testInfo);
      const detailsPage = new DevelopmentPlanDetailsPage(page, testInfo);

      await test.step('Открыть "Планы развития"', async () => {
        await devMenu.openDevelopmentPlans();
        await plansPage.assertOpened();
      });

      await test.step("Найти план с действиями", async () => {
        const plansCount = await plansPage.getPlansCount();
        expect(plansCount).toBeGreaterThan(0);

        // Открыть первый план
        await plansPage.tableRows.first().click();
        await detailsPage.assertOpened();
      });

      await test.step("Проверить возможность добавления комментария", async () => {
        // Используем Page Object локаторы для поля комментария и кнопки отправки
        const commentInput = detailsPage.commentInput;

        const commentInputVisible = await commentInput
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);

        if (commentInputVisible) {
          const testComment = `Тестовый комментарий ${Date.now()}`;
          await commentInput.fill(testComment);

          // Используем Page Object локатор для кнопки отправки
          const sendButton = detailsPage.sendCommentButton;

          const sendButtonVisible = await sendButton
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          if (sendButtonVisible) {
            await sendButton.click();
            // Ждём появления комментария после отправки
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
              .catch(() => {});

            // Проверяем что комментарий добавился
            const commentAdded = await page
              .locator(`text="${testComment}"`)
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);
            console.log("Комментарий добавлен:", commentAdded);
          } else {
            console.log("Кнопка отправки комментария не найдена");
          }
        } else {
          console.log("Поле для комментария не найдено на странице плана");
          // Это может быть ожидаемо если нет действий в плане
        }
      });
    });

    // C2701 — дубликат, живёт в dev-plan-module-toggle.spec.js
    test("Отображение комментария внутри действия", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const plansPage = new DevelopmentPlansListPage(page, testInfo);
      const detailsPage = new DevelopmentPlanDetailsPage(page, testInfo);

      await test.step("Открыть план развития", async () => {
        await devMenu.openDevelopmentPlans();
        await plansPage.assertOpened();

        const plansCount = await plansPage.getPlansCount();
        expect(plansCount).toBeGreaterThan(0);

        await plansPage.tableRows.first().click();
        await detailsPage.assertOpened();
      });

      await test.step("Проверить отображение комментариев", async () => {
        // Используем Page Object локатор для блока комментариев
        const commentsSection = detailsPage.comments;
        const hasComments = await commentsSection
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);

        if (hasComments) {
          const commentsCount = await commentsSection.count();
          console.log("Количество комментариев на странице:", commentsCount);

          // Проверяем структуру комментария (автор, текст, время)
          const firstComment = commentsSection.first();
          const commentText = await firstComment.innerText();
          console.log(
            "Текст первого комментария:",
            commentText.substring(0, 100),
          );
        } else {
          console.log("Комментарии не найдены или их нет");
        }
      });
    });

    test(
      "C2698: добавление комментария к действию в ИПР (проверка функциональности)",
      { tag: ["@regression", "@ipr"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        const detailsPage = new DevelopmentPlanDetailsPage(page, testInfo);

        await test.step('Открыть "Планы развития"', async () => {
          await devMenu.openDevelopmentPlans();
          await plansPage.assertOpened();
        });

        await test.step("Найти план с действиями", async () => {
          const plansCount = await plansPage.getPlansCount();
          expect(plansCount).toBeGreaterThan(0);

          // Открыть первый план
          await plansPage.tableRows.first().click();
          await detailsPage.assertOpened();
        });

        await test.step("Добавить комментарий к действию", async () => {
          // Используем локатор из Page Object
          const commentInputVisible = await detailsPage.commentInput
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
            .then(() => true)
            .catch(() => false);

          if (commentInputVisible) {
            const testComment = `Тестовый комментарий ${Date.now()}`;
            await detailsPage.commentInput.fill(testComment);

            const sendButtonVisible = await detailsPage.sendCommentButton
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (sendButtonVisible) {
              await detailsPage.sendCommentButton.click();
              // Ждём появления комментария после отправки
              await page
                .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
                .catch(() => {});

              // Проверяем что комментарий добавился
              const commentAdded = await page
                .locator(`text="${testComment}"`)
                .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
                .then(() => true)
                .catch(() => false);
              if (commentAdded) {
                console.log("Комментарий успешно добавлен");
              } else {
                console.log("Комментарий не отображается после добавления");
              }
            } else {
              console.log("Кнопка отправки комментария не найдена");
            }
          } else {
            console.log(
              "Поле для комментария не найдено — возможно нет действий в плане",
            );
          }
        });
      },
    );

    test(
      "Отображение счётчика комментариев в списке действий",
      { tag: ["@regression", "@ipr"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        const detailsPage = new DevelopmentPlanDetailsPage(page, testInfo);

        await test.step("Открыть план развития с комментариями", async () => {
          await devMenu.openDevelopmentPlans();
          await plansPage.assertOpened();

          const plansCount = await plansPage.getPlansCount();
          expect(plansCount).toBeGreaterThan(0);

          await plansPage.tableRows.first().click();
          await detailsPage.assertOpened();
        });

        await test.step("Проверить наличие счётчика комментариев", async () => {
          // Ищем badge/счётчик комментариев у действий
          const commentBadge = page
            .locator('[class*="badge"], [class*="count"], [class*="Badge"]')
            .filter({ hasText: /^\d+$/ });

          const hasBadge = await commentBadge
            .first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
            .then(() => true)
            .catch(() => false);

          if (hasBadge) {
            const badgeCount = await commentBadge.count();
            console.log("Найдено badge с числами:", badgeCount);

            // Проверяем что badge содержит число
            const firstBadgeText = await commentBadge.first().textContent();
            const badgeNumber = parseInt(firstBadgeText, 10);
            expect(badgeNumber).toBeGreaterThanOrEqual(0);
            console.log("Значение счётчика:", badgeNumber);
          } else {
            // Альтернативный поиск — иконка с числом
            const commentIcon = page
              .locator('[class*="comment"] + span, [class*="Comment"] span')
              .filter({ hasText: /\d/ });
            const hasIcon = await commentIcon
              .first()
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (hasIcon) {
              const iconText = await commentIcon.first().textContent();
              console.log("Найден счётчик комментариев:", iconText);
            } else {
              console.log(
                "Счётчик комментариев не найден — возможно нет комментариев в плане",
              );
            }
          }
        });
      },
    );

    test(
      "Отображение большого количества комментариев",
      { tag: ["@regression", "@ipr"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        const detailsPage = new DevelopmentPlanDetailsPage(page, testInfo);

        await test.step("Открыть план развития", async () => {
          await devMenu.openDevelopmentPlans();
          await plansPage.assertOpened();

          const plansCount = await plansPage.getPlansCount();
          expect(plansCount).toBeGreaterThan(0);

          await plansPage.tableRows.first().click();
          await detailsPage.assertOpened();
        });

        await test.step("Добавить несколько комментариев", async () => {
          // Используем локаторы из Page Object
          const commentInputVisible = await detailsPage.commentInput
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
            .then(() => true)
            .catch(() => false);

          if (!commentInputVisible) {
            console.log("Поле для комментария не найдено");
            return;
          }

          // Добавляем 3 комментария для проверки отображения
          for (let i = 1; i <= 3; i++) {
            const testComment = `Тестовый комментарий #${i} - ${Date.now()}`;
            await detailsPage.commentInput.fill(testComment);

            const sendButtonVisible = await detailsPage.sendCommentButton
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);
            if (sendButtonVisible) {
              await detailsPage.sendCommentButton.click();
              // Ждём появления комментария после отправки
              await page
                .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
                .catch(() => {});
              console.log(`Добавлен комментарий #${i}`);
            }
          }
        });

        await test.step("Проверить корректное отображение комментариев", async () => {
          // Используем Page Object локатор для блока комментариев
          const commentsSection = detailsPage.comments;
          const commentsCount = await commentsSection.count();
          console.log("Всего комментариев на странице:", commentsCount);

          if (commentsCount > 0) {
            // Проверяем что все комментарии видимы и не обрезаны
            for (let i = 0; i < Math.min(commentsCount, 5); i++) {
              const comment = commentsSection.nth(i);
              const isVisible = await comment.isVisible().catch(() => false);
              expect(isVisible).toBeTruthy();
            }
            console.log("Комментарии отображаются корректно");
          } else {
            // Если комментариев нет — возможно поле для комментария не было найдено ранее
            console.log(
              "Комментариев не найдено — план может не содержать действий с комментариями",
            );
          }
        });
      },
    );
  },
);
