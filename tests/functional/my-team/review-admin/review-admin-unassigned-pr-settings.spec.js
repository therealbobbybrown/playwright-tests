/**
 * AT-66: review_admin НЕ может получить настройки чужого (unassigned) PR через API
 *
 * Проверяет, что review_admin с permission [12] может обращаться
 * к настройкам/данным assigned PR, но НЕ имеет доступа к settings
 * незакреплённого за ним PR.
 */
import { test as base, expect } from "../../../fixtures/full.js";
import { ReviewAdminSeedHelper } from "../../../utils/seed/index.js";
import {
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
  reviewAdminSettingsCtx: async ({ request }, use) => {
    const helper = new ReviewAdminSeedHelper(request);
    await helper.init("admin");
    const setupData = await helper.seedFullSetup();

    const password = getTestUserPassword();
    const prAPI = new PerformanceReviewAPI(request);
    await prAPI.signIn(setupData.email, password);

    // Найти unassigned PR через admin API
    const { email: adminEmail, password: adminPassword } =
      getCredentials("admin");
    const adminPrAPI = new PerformanceReviewAPI(request);
    await adminPrAPI.signIn(adminEmail, adminPassword);

    const { data: allPRs } = await adminPrAPI.getList();
    const prList = allPRs?.items || allPRs || [];

    // Ищем любой PR, который НЕ является assigned PR для данного review_admin
    const unassignedPR = prList.find(
      (pr) => String(pr.id) !== String(setupData.prId),
    );

    await use({
      prAPI,
      adminPrAPI,
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
  "Review Admin API — Настройки PR: доступ только к assigned",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Review Admin Unassigned PR Settings");
    });

    test("C8089: Review_admin НЕ может получить настройки unassigned PR через API",
      { tag: ["@critical"] },
      async ({ reviewAdminSettingsCtx }) => {
        setSeverity("critical");

        const { prAPI, assignedPrId, unassignedPrId } =
          reviewAdminSettingsCtx;

        await test.step(
          "Проверить наличие unassigned PR для негативного теста",
          async () => {
            expect(
              unassignedPrId,
              "Не найден второй PR для негативного теста. Нужен минимум 2 PR в системе.",
            ).toBeTruthy();
          },
        );

        await test.step(
          "Positive: GET /manager/performance-reviews/{assignedPrId} — доступ есть",
          async () => {
            const { response, data } = await prAPI.getById(assignedPrId);
            expect(
              response.ok(),
              `Assigned PR ${assignedPrId}: ожидали 2xx, получили ${response.status()}`,
            ).toBe(true);

            // Проверяем содержимое — данные реального PR, не пустой ответ
            expect(data, "Тело ответа не должно быть пустым").toBeTruthy();
            expect(
              data.id || data.prId,
              "Ответ должен содержать id PR",
            ).toBeTruthy();

            console.log(
              `[AT-66] GET /manager/performance-reviews/${assignedPrId}: OK (${response.status()}), id=${data.id || data.prId}`,
            );
          },
        );

        await test.step(
          "Positive: GET /manager/performance-reviews/{assignedPrId}/assessments — доступ есть",
          async () => {
            const { response } = await prAPI.getAssessments(assignedPrId);
            expect(
              response.ok(),
              `Assessments assigned PR ${assignedPrId}: ожидали 2xx, получили ${response.status()}`,
            ).toBe(true);

            console.log(
              `[AT-66] GET /manager/performance-reviews/${assignedPrId}/assessments: OK (${response.status()})`,
            );
          },
        );

        await test.step(
          "Positive: GET /manager/performance-reviews/{assignedPrId}/statistics/settings/ — доступ есть",
          async () => {
            const { response } = await prAPI.getStatisticsSettings(assignedPrId);
            expect(
              response.ok(),
              `Statistics settings assigned PR ${assignedPrId}: ожидали 2xx, получили ${response.status()}`,
            ).toBe(true);

            console.log(
              `[AT-66] GET /manager/performance-reviews/${assignedPrId}/statistics/settings/: OK (${response.status()})`,
            );
          },
        );

        await test.step(
          "Negative: GET /manager/performance-reviews/{unassignedPrId} — доступ запрещён",
          async () => {
            const { response } = await prAPI.getById(unassignedPrId);
            const status = response.status();
            console.log(
              `[AT-66] GET /manager/performance-reviews/${unassignedPrId}: ${status}`,
            );

            expect(
              [403, 404].includes(status),
              `Unassigned PR ${unassignedPrId}: ожидали 403/404, получили ${status}`,
            ).toBe(true);
          },
        );

        await test.step(
          "Negative: GET /manager/performance-reviews/{unassignedPrId}/assessments — доступ запрещён",
          async () => {
            const { response } = await prAPI.getAssessments(unassignedPrId);
            const status = response.status();
            console.log(
              `[AT-66] GET /manager/performance-reviews/${unassignedPrId}/assessments: ${status}`,
            );

            expect(
              [403, 404].includes(status),
              `Assessments unassigned PR ${unassignedPrId}: ожидали 403/404, получили ${status}`,
            ).toBe(true);
          },
        );

        await test.step(
          "Negative: GET /manager/performance-reviews/{unassignedPrId}/statistics/settings/ — доступ запрещён",
          async () => {
            const { response } = await prAPI.getStatisticsSettings(unassignedPrId);
            const status = response.status();
            console.log(
              `[AT-66] GET /manager/performance-reviews/${unassignedPrId}/statistics/settings/: ${status}`,
            );

            expect(
              [403, 404].includes(status),
              `Statistics settings unassigned PR ${unassignedPrId}: ожидали 403/404, получили ${status}`,
            ).toBe(true);
          },
        );
      },
    );
  },
);
