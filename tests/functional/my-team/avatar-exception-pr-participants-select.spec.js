import { test, expect } from "../../fixtures/auth.js";
import { PerformanceReviewConfigPage } from "../../../pages/PerformanceReviewConfigPage.js";
import { PerformanceReviewAPI } from "../../utils/api/PerformanceReviewAPI.js";
import { PerformanceReviewSeedHelper } from "../../utils/seed/PerformanceReviewSeedHelper.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Исключение: Аватар в выборе участников PR НЕ ведёт в профиль",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7489: Клик по аватару в модалке выбора участников выбирает сотрудника, а не открывает профиль",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");
        const prConfigPage = new PerformanceReviewConfigPage(page);

        let prId;

        await test.step("Найти или создать PR со статусом draft через API", async () => {
          const api = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { data } = await api.getList();
          const prItems = data?.items || data || [];
          const targetPR = prItems.find((pr) => pr.status === "draft");

          if (targetPR) {
            prId = targetPR.id;
          } else {
            const seed = new PerformanceReviewSeedHelper(request);
            await seed.init();
            const created = await seed.seedDraftPR({ title: "Avatar exception test draft" });
            prId = created.id;
          }
        });

        await test.step("Открыть PR и перейти на шаг «Выбор участников»", async () => {
          await page.goto(`/ru/manager/performance-reviews/${prId}/`);
          await page.waitForLoadState("networkidle");

          await prConfigPage.targetUsersTab.waitFor({
            state: "visible",
            timeout: 10000,
          });
          await prConfigPage.targetUsersTab.click();
          await page.waitForLoadState("networkidle");
        });

        await test.step("Открыть модалку добавления участников", async () => {
          await prConfigPage.addParticipantButton.waitFor({
            state: "visible",
            timeout: 10000,
          });
          await prConfigPage.addParticipantButton.click();
        });

        await test.step("Дождаться открытия модалки с карточками пользователей", async () => {
          await prConfigPage.participantModal.waitFor({
            state: "visible",
            timeout: 10000,
          });
          await prConfigPage.participantCards
            .first()
            .waitFor({ state: "visible", timeout: 10000 });
        });

        await test.step("Кликнуть по аватару в карточке пользователя", async () => {
          // Берём вторую карточку (индекс 1), т.к. индекс 0 = «Все сотрудники»
          const userCard = prConfigPage.participantCards.nth(1);
          const avatar = userCard.locator('[class*="Avatar_avatar"]').first();
          await avatar.scrollIntoViewIfNeeded();
          await avatar.click();
        });

        await test.step("Проверить, что НЕ произошёл переход в профиль", async () => {
          await expect(
            page,
            "Клик по аватару в модалке выбора участников НЕ должен переходить в /ru/profile/",
          ).not.toHaveURL(/\/ru\/profile\/\d+/, { timeout: 2000 });

          // Модалка всё ещё открыта (не произошла навигация)
          await expect(prConfigPage.participantModal).toBeVisible();
        });
      },
    );
  },
);
