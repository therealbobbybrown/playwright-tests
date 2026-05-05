/**
 * C8059: Подмена reviewId в API запросах → обход невозможен
 *
 * Проверяет, что review_admin с permission [12] НЕ может получить данные
 * чужого PR через прямой API запрос с подставленным ID.
 * review_admin имеет доступ к /private/ дашборд-эндпоинтам,
 * но НЕ к /manager/ PR API.
 */
import { test as base, expect } from "../../../fixtures/full.js";
import { ReviewAdminSeedHelper } from "../../../utils/seed/index.js";
import {
  DashboardTeamAPI,
  PerformanceReviewAPI,
  getCredentials,
  getTestUserPassword,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

const test = base.extend({
  reviewAdminCtx: async ({ request }, use) => {
    const helper = new ReviewAdminSeedHelper(request);
    await helper.init("admin");
    const setupData = await helper.seedFullSetup();

    const password = getTestUserPassword();
    const dashAPI = new DashboardTeamAPI(request);
    await dashAPI.signIn(setupData.email, password);

    const prAPI = new PerformanceReviewAPI(request);
    await prAPI.signIn(setupData.email, password);

    // Находим unassigned PR
    const { email: adminEmail, password: adminPassword } =
      getCredentials("admin");
    const adminPrAPI = new PerformanceReviewAPI(request);
    await adminPrAPI.signIn(adminEmail, adminPassword);

    const { data: allPRs } = await adminPrAPI.getList();
    const prList = allPRs?.items || allPRs || [];
    const unassignedPR = prList.find(
      (pr) =>
        String(pr.id) !== String(setupData.prId) && pr.status === "active",
    );

    await use({
      dashAPI,
      prAPI,
      setupData,
      helper,
      assignedPrId: setupData.prId,
      unassignedPrId: unassignedPR?.id || null,
    });

    try {
      await helper.cleanup(setupData);
    } catch (e) {
      console.warn(`[Cleanup] ${e.message}`);
    }
  },
});

test.describe(
  "Review Admin API — Подмена reviewId не даёт обход",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Review Admin API Review Bypass");
    });

    test(
      "C8059: Подмена reviewId в прямых API запросах возвращает 403/404 или пустой ответ",
      { tag: ["@critical"] },
      async ({ reviewAdminCtx }) => {
        setSeverity("critical");

        const { dashAPI, prAPI, assignedPrId, unassignedPrId } =
          reviewAdminCtx;

        await test.step(
          "Проверить наличие unassigned PR для негативного теста",
          async () => {
            expect(
              unassignedPrId,
              "Не найден второй активный PR для негативного теста. Нужен минимум 2 активных PR.",
            ).toBeTruthy();
          },
        );

        await test.step(
          "Positive: dashboard-filters/revisions для assigned PR — доступ есть",
          async () => {
            const { response } =
              await dashAPI.getDashboardFiltersRevisions(assignedPrId);
            expect(
              response.ok(),
              `Assigned PR ${assignedPrId}: ожидали 2xx, получили ${response.status()}`,
            ).toBe(true);
            console.log(
              `[C8059] Revisions assigned PR ${assignedPrId}: OK (${response.status()})`,
            );
          },
        );

        await test.step(
          "Negative: unassigned PR НЕ присутствует в dashboard-filters PR списке",
          async () => {
            // Основной security boundary — список PR
            const { response, data } =
              await dashAPI.getDashboardFiltersPRs();

            expect(response.ok()).toBe(true);

            const prList = Array.isArray(data) ? data : data?.items || [];
            const prIds = prList.map((pr) => String(pr.id || pr.prId || pr));

            expect(
              prIds,
              `Unassigned PR ${unassignedPrId} НЕ должен быть в списке`,
            ).not.toContain(String(unassignedPrId));

            console.log(
              `[C8059] OK: unassigned PR ${unassignedPrId} отсутствует в PR-фильтрах`,
            );
          },
        );

        await test.step(
          "Positive: /manager/performance-reviews/{assignedPrId} — доступ есть (PR admin)",
          async () => {
            const { response } = await prAPI.getById(assignedPrId);
            expect(
              response.ok(),
              `Assigned PR ${assignedPrId}: ожидали 2xx, получили ${response.status()}`,
            ).toBe(true);
            console.log(
              `[C8059] GET /manager/performance-reviews/${assignedPrId}: OK (${response.status()})`,
            );
          },
        );

        await test.step(
          "Negative: /manager/performance-reviews/{unassignedPrId} — доступ запрещён",
          async () => {
            const { response } = await prAPI.getById(unassignedPrId);
            const status = response.status();
            console.log(
              `[C8059] GET /manager/performance-reviews/${unassignedPrId}: ${status}`,
            );

            // Для unassigned PR — должно быть 403 или 404
            expect(
              [403, 404].includes(status),
              `Unassigned PR ${unassignedPrId}: ожидали 403/404, получили ${status}`,
            ).toBe(true);
          },
        );
      },
    );
  },
);
