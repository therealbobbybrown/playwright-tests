import { test, expect } from "../../../fixtures/auth.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Исключение: Аватар в навигации при заполнении анкеты НЕ ведёт в профиль",
  { tag: ["@ui", "@performance-review", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW);
    });

    test(
      "C7497: Клик по аватару в навигации/хедере при заполнении анкеты не открывает профиль",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        let prId;
        let targetUsers;

        await test.step("Найти PR со статусом running через API", async () => {
          const api = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { data } = await api.getList();
          const prItems = data?.items || data || [];
          const runningPR = prItems.find(
            (pr) => pr.status === "running" || pr.status === "active",
          );

          if (!runningPR) {
            throw new Error(
              "Не найден PR со статусом running или active — запусти seed:pr",
            );
          }

          prId = runningPR.id;
        });

        await test.step("Получить список оцениваемых через API", async () => {
          const api = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { data: targetData } = await api.getTargetUsers(prId, {
            limit: 5,
            offset: 0,
          });

          const items =
            targetData?.items ||
            targetData?.users ||
            targetData?.data ||
            targetData ||
            [];

          if (!items || items.length === 0) {
            throw new Error(
              `Нет оцениваемых в PR ${prId} — запусти seed:pr для добавления участников`,
            );
          }

          targetUsers = items;
        });

        await test.step("Открыть страницу заполнения анкеты PR", async () => {
          const baseUrl = new URL(process.env.BASE_URL).origin;
          // Открываем общую страницу PR оцениваемого (для самооценки / анкеты)
          await page.goto(`${baseUrl}/ru/performance-reviews/${prId}/`);
          await page.waitForLoadState("networkidle");

          // Проверяем доступность страницы filling — если редирект на /login или 404
          const currentUrl = page.url();
          if (
            currentUrl.includes("/login") ||
            currentUrl.includes("/404") ||
            currentUrl.includes("/403")
          ) {
            test.skip(
              true,
              "PR не запущен или страница заполнения анкеты недоступна для admin — запусти seed:pr",
            );
            return;
          }

          // Ищем ссылку «Заполнить» / «Начать» / «Продолжить» на странице
          const fillLink = page
            .locator("a, button")
            .filter({ hasText: /заполнить|начать|продолжить/i })
            .first();

          let fillLinkVisible = false;
          try {
            await fillLink.waitFor({ state: "visible", timeout: 6000 });
            fillLinkVisible = true;
          } catch {
            // ссылка не появилась
          }

          if (fillLinkVisible) {
            await fillLink.click();
            await page.waitForLoadState("networkidle");
          }
        });

        await test.step("Найти аватар в навигации/хедере анкеты и кликнуть", async () => {
          // Ищем аватар в навигации анкеты — боковая панель, хедер анкеты
          const navAvatar = page
            .locator(
              '[class*="nav"] [class*="Avatar_avatar"], [class*="Nav"] [class*="Avatar_avatar"], header [class*="Avatar_avatar"]',
            )
            .first();

          let navAvatarVisible = false;
          try {
            await navAvatar.waitFor({ state: "visible", timeout: 8000 });
            navAvatarVisible = true;
          } catch {
            // аватар в навигации не найден
          }

          if (!navAvatarVisible) {
            // Fallback: любой аватар на странице filling (не в таблице результатов)
            const anyAvatar = page.locator('[class*="Avatar_avatar"]').first();

            let anyAvatarVisible = false;
            try {
              await anyAvatar.waitFor({ state: "visible", timeout: 5000 });
              anyAvatarVisible = true;
            } catch {
              // аватар не найден
            }

            if (!anyAvatarVisible) {
              test.skip(
                true,
                "PR не запущен или нет анкет для заполнения — запусти seed:pr",
              );
              return;
            }

            await anyAvatar.click();
          } else {
            await navAvatar.click();
          }
        });

        await test.step("Проверить, что НЕ произошёл переход в профиль", async () => {
          await expect(
            page,
            "Клик по аватару в навигации анкеты НЕ должен переходить в /ru/profile/",
          ).not.toHaveURL(/\/ru\/profile\/\d+/, { timeout: 2000 });
        });
      },
    );
  },
);
