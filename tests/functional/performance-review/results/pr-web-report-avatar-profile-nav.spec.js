import { test, expect } from "../../../fixtures/auth.js";
import { PerformanceReviewResultsPage } from "../../../../pages/PerformanceReviewResultsPage.js";
import { ProfileMainPage } from "../../../../pages/ProfileMainPage.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Веб-отчёт об оценке — Переход в профиль через аватар в хидере",
  { tag: ["@ui", "@performance-review", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW);
    });

    test(
      "C7486: Клик по аватару в хидере веб-отчёта открывает профиль сотрудника",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const resultsPage = new PerformanceReviewResultsPage(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        let employeeName;

        await test.step("Найти PR и открыть веб-отчёт для сотрудника", async () => {
          const api = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { data } = await api.getList();
          const prItems = data?.items || data || [];
          const targetPR = prItems.find((pr) =>
            ["active", "finished", "stopped"].includes(pr.status),
          );
          expect(
            targetPR,
            "PR со статусом active/finished/stopped должен существовать",
          ).toBeTruthy();

          // Получить последнюю ревизию
          const revision = await api.getLastRevision(targetPR.id);
          expect(revision.data, "PR должен иметь ревизию").toBeTruthy();
          const revisionId = revision.data.id;

          // Получить оцениваемых
          const targetUsers = await api.getTargetUsers(targetPR.id, {
            revisionId,
            limit: 10,
            offset: 0,
          });
          const items = targetUsers.data?.items || targetUsers.data || [];
          expect(
            items.length,
            "Должен быть хотя бы один оцениваемый",
          ).toBeGreaterThan(0);

          const targetUser = items[0];
          const targetUserId =
            targetUser.targetUserId || targetUser.userId || targetUser.id;

          await resultsPage.open(
            process.env.BASE_URL,
            targetUserId,
            revisionId,
            targetPR.id,
          );
        });

        await test.step("Получить имя из хидера отчёта", async () => {
          employeeName = await resultsPage.getEmployeeNameFromHeader();
          expect(
            employeeName.length,
            "Имя не должно быть пустым",
          ).toBeGreaterThan(0);
        });

        await test.step("Кликнуть по аватару в хидере", async () => {
          await resultsPage.clickAvatarInHeader();
        });

        await test.step("Проверить переход в профиль", async () => {
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 10000 });
          expect(page.url()).toMatch(/\/ru\/profile\/\d+/);
          await profilePage.assertProfileBelongsTo(employeeName);
        });
      },
    );
  },
);
