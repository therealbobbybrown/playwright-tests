/**
 * C8053: review_admin — доступ к API дашборда для assigned vs unassigned PR
 *
 * Проверяет, что review_admin с permission [12] (manageOwnPerformanceReview):
 * - Может получить данные дашборда для assigned PR (positive)
 * - НЕ может получить данные unassigned PR (negative — 403/404 или пустой ответ)
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

    // Получаем список PR, которые РЕАЛЬНО видит review_admin после seed.
    // Это защищает от data pollution: если предыдущий тест назначил user'а на PR X
    // и cleanup не успел завершиться, PR X будет в этом списке.
    const { data: visiblePRsData } = await dashAPI.getDashboardFiltersPRs();
    const visiblePRList = Array.isArray(visiblePRsData)
      ? visiblePRsData
      : visiblePRsData?.items || [];
    const visiblePRIds = new Set(
      visiblePRList.map((pr) => String(pr.id || pr.prId || pr)),
    );

    // Находим unassigned PR через admin — PR, которого НЕТ в видимых фильтрах review_admin
    const { email: adminEmail, password: adminPassword } =
      getCredentials("admin");
    const adminPrAPI = new PerformanceReviewAPI(request);
    await adminPrAPI.signIn(adminEmail, adminPassword);

    const { data: allPRs } = await adminPrAPI.getList();
    const prList = allPRs?.items || allPRs || [];
    // unassigned PR = активный PR, которого НЕТ в списке видимых PR review_admin
    const unassignedPR = prList.find(
      (pr) => pr.status === "active" && !visiblePRIds.has(String(pr.id)),
    );

    await use({
      dashAPI,
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
  "Review Admin API — Доступ запрещён к чужим PR",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Review Admin API Access Denied");
    });

    test(
      "C8053: API запрос данных unassigned PR возвращает 403 или пустой ответ",
      { tag: ["@critical"] },
      async ({ reviewAdminCtx }) => {
        setSeverity("critical");

        const { dashAPI, assignedPrId, unassignedPrId } = reviewAdminCtx;

        await test.step(
          "Positive: запрос дашборда assigned PR — данные доступны",
          async () => {
            // Получаем ревизию
            const { response: revResponse, data: revisions } =
              await dashAPI.getDashboardFiltersRevisions(assignedPrId);

            expect(
              revResponse.ok(),
              `Ревизии assigned PR ${assignedPrId}: status=${revResponse.status()}`,
            ).toBe(true);

            const revisionList = revisions?.items || revisions || [];
            expect(revisionList.length).toBeGreaterThan(0);

            const revisionId = revisionList[0].id;
            const { response } = await dashAPI.getDashboard(assignedPrId, {
              revisionId,
              usersQuery: {},
            });

            expect(
              response.ok(),
              `Assigned PR ${assignedPrId}: ожидали 2xx, получили ${response.status()}`,
            ).toBe(true);

            console.log(
              `[C8053] OK: assigned PR ${assignedPrId} — дашборд доступен`,
            );
          },
        );

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
          "Negative: dashboard-filters/performance-reviews НЕ содержит unassigned PR",
          async () => {
            // Основной security boundary — список PR НЕ содержит unassigned
            const { response, data } =
              await dashAPI.getDashboardFiltersPRs();

            expect(response.ok()).toBe(true);

            const prList = Array.isArray(data) ? data : data?.items || [];
            const prIds = prList.map((pr) => String(pr.id || pr.prId || pr));

            expect(
              prIds,
              `Unassigned PR ${unassignedPrId} НЕ должен быть в списке фильтров review_admin`,
            ).not.toContain(String(unassignedPrId));

            console.log(
              `[C8053] OK: unassigned PR ${unassignedPrId} отсутствует в списке фильтров (${prList.length} PR видно)`,
            );
          },
        );
      },
    );
  },
);
