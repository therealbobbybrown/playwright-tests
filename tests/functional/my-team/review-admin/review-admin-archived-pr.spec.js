/**
 * AT-69: review_admin — поведение дашборда при остановленном PR
 *
 * Проверяет, что review_admin:
 * - Видит assigned PR в getDashboardFiltersPRs ДО остановки
 * - После остановки PR через admin API — статус PR меняется на "stopped"
 * - getDashboardFiltersPRs всё ещё возвращает этот PR (доступ не теряется)
 * - getDashboardFiltersRevisions(prId) работает корректно после остановки
 */
import { test as base, expect } from "../../../fixtures/full.js";
import { ReviewAdminSeedHelper } from "../../../utils/seed/index.js";
import {
  DashboardTeamAPI,
  PerformanceReviewAPI,
  getCredentials,
  getTestUserPassword,
} from "../../../utils/api/index.js";
import { TokenManager } from "../../../utils/auth/TokenManager.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

const test = base.extend({
  archivedCtx: async ({ request }, use) => {
    const helper = new ReviewAdminSeedHelper(request);
    await helper.init("admin");
    const setupData = await helper.seedFullSetup();

    const password = getTestUserPassword();
    // Инвалидируем кеш токена после seed — роли и PR-назначение только что изменились
    TokenManager.invalidate(setupData.email);
    const dashAPI = new DashboardTeamAPI(request);
    await dashAPI.signIn(setupData.email, password);

    // Admin PR API для остановки PR
    const { email: adminEmail, password: adminPassword } =
      getCredentials("admin");
    const adminPrAPI = new PerformanceReviewAPI(request);
    await adminPrAPI.signIn(adminEmail, adminPassword);

    await use({ dashAPI, adminPrAPI, setupData, helper });

    try {
      await helper.cleanup(setupData);
    } catch (e) {
      console.warn(`[Cleanup] ${e.message}`);
    }
  },
});

test.describe(
  "Review Admin — Остановленный PR",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Review Admin Archived PR");
    });

    test("C8082: Остановленный PR отображается корректно для review_admin",
      { tag: ["@critical"] },
      async ({ archivedCtx }) => {
        setSeverity("critical");

        const { dashAPI, adminPrAPI, setupData } = archivedCtx;
        const assignedPrId = String(setupData.prId);

        // Шаг 1: Позитивный — PR доступен ДО остановки
        await test.step(
          "Positive: assigned PR присутствует в dashboard-filters до остановки",
          async () => {
            const { response, data } = await dashAPI.getDashboardFiltersPRs();

            expect(
              response.ok(),
              `dashboard-filters/performance-reviews вернул ${response.status()}`,
            ).toBe(true);

            const prList = Array.isArray(data) ? data : data?.items || [];
            const prIds = prList.map((pr) => String(pr.id || pr.prId || pr));

            expect(
              prIds,
              `Assigned PR ${assignedPrId} должен присутствовать в фильтрах до остановки`,
            ).toContain(assignedPrId);

            console.log(
              `[AT-69] OK: assigned PR ${assignedPrId} виден в фильтрах (${prList.length} PR всего)`,
            );
          },
        );

        // Шаг 2: Остановить PR через admin API
        await test.step("Остановить PR через admin API", async () => {
          const { response: stopResponse } = await adminPrAPI.stop(
            setupData.prId,
          );

          // stop() может вернуть 400/422 если PR уже остановлен или не в нужном статусе
          // В этом случае проверяем текущий статус через getById
          if (!stopResponse.ok()) {
            const errorText = await stopResponse.text().catch(() => "");
            console.warn(
              `[AT-69] stop() вернул ${stopResponse.status()}: ${errorText.substring(0, 200)}`,
            );

            // Проверяем что PR действительно существует
            const { response: getResp, data: prData } =
              await adminPrAPI.getById(setupData.prId);
            expect(
              getResp.ok(),
              `PR ${setupData.prId} должен быть доступен через admin API`,
            ).toBe(true);

            const currentStatus = prData?.status;
            console.log(
              `[AT-69] Текущий статус PR ${setupData.prId}: ${currentStatus}`,
            );

            // Если PR уже в финальном статусе — тест продолжает проверять поведение
            if (
              currentStatus === "stopped" ||
              currentStatus === "finished" ||
              currentStatus === "archived"
            ) {
              console.log(
                `[AT-69] PR уже в статусе "${currentStatus}", продолжаем проверку`,
              );
            } else {
              // PR в статусе, из которого нельзя остановить — это может быть "active" (не запущен)
              // В этом случае тест не может продолжить проверку смены статуса
              throw new Error(
                `[AT-69] Не удалось остановить PR ${setupData.prId} (статус: ${currentStatus}): ${stopResponse.status()} ${errorText.substring(0, 200)}`,
              );
            }
          } else {
            console.log(
              `[AT-69] OK: PR ${setupData.prId} успешно остановлен`,
            );
          }
        });

        // Шаг 3: Проверить статус PR после остановки
        await test.step(
          "Проверить статус PR после остановки через admin API",
          async () => {
            const { response, data: prData } = await adminPrAPI.getById(
              setupData.prId,
            );

            expect(
              response.ok(),
              `Получить PR ${setupData.prId} после остановки: статус ${response.status()}`,
            ).toBe(true);

            const status = prData?.status;
            expect(
              ["stopped", "finished", "complete"].includes(status),
              `PR должен иметь статус stopped, finished или complete после остановки, получили: ${status}`,
            ).toBe(true);

            console.log(
              `[AT-69] OK: PR ${setupData.prId} в статусе "${status}" после остановки`,
            );
          },
        );

        // Шаг 4: Проверить список PR в фильтрах после остановки
        await test.step(
          "Проверить: stopped PR всё ещё виден в dashboard-filters для review_admin",
          async () => {
            // Инвалидируем кеш и перелогиниваемся чтобы получить свежий токен
            // после остановки PR (избегаем stale data из кешированного ответа API)
            TokenManager.invalidate(setupData.email);
            await dashAPI.signIn(setupData.email, getTestUserPassword());

            const { response, data } = await dashAPI.getDashboardFiltersPRs();

            expect(
              response.ok(),
              `dashboard-filters/performance-reviews вернул ${response.status()} после остановки`,
            ).toBe(true);

            const prList = Array.isArray(data) ? data : data?.items || [];
            const prIds = prList.map((pr) => String(pr.id || pr.prId || pr));

            // Остановленный PR должен оставаться видимым для review_admin —
            // доступ к данным не должен теряться при завершении/остановке
            expect(
              prIds,
              `Assigned PR ${assignedPrId} должен оставаться в фильтрах review_admin после остановки/завершения`,
            ).toContain(assignedPrId);

            console.log(
              `[AT-69] OK: stopped PR ${assignedPrId} всё ещё виден в фильтрах (${prList.length} PR)`,
            );
          },
        );

        // Шаг 5: Проверить доступ к ревизиям остановленного PR
        await test.step(
          "Проверить: getDashboardFiltersRevisions работает для stopped PR",
          async () => {
            const { response: revResponse, data: revisions } =
              await dashAPI.getDashboardFiltersRevisions(setupData.prId);

            expect(
              revResponse.ok(),
              `getDashboardFiltersRevisions для stopped PR ${setupData.prId}: статус ${revResponse.status()}`,
            ).toBe(true);

            const revList = revisions?.items || revisions || [];
            expect(
              Array.isArray(revList),
              "Ревизии должны быть массивом",
            ).toBe(true);

            // Ревизии должны существовать — PR был запущен, значит ревизия создана
            expect(
              revList.length,
              `Остановленный PR ${setupData.prId} должен иметь хотя бы одну ревизию`,
            ).toBeGreaterThan(0);

            console.log(
              `[AT-69] OK: getDashboardFiltersRevisions вернул ${revList.length} ревизий для stopped PR`,
            );
          },
        );
      },
    );
  },
);
