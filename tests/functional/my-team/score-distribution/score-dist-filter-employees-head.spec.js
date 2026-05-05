import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { RolesAPI } from "../../../utils/api/RolesAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import { ReviewAdminSeedHelper } from "../../../utils/seed/ReviewAdminSeedHelper.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Фильтр «Сотрудники» — Руководитель (head)",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7117: Фильтр у руководителя (head) содержит только «Прямые подчинённые» — API-сверка",
      { tag: ["@critical"] },
      async ({ browser, request }) => {
        setSeverity("critical");

        // Cleanup: убрать stale review_admin роли HEAD — иначе scope
        // расширяется до "Все сотрудники" вместо "Прямые подчиненные"
        const { email: headEmail, password: headPassword } = getCredentials("head");
        await test.step("Cleanup: убрать stale review_admin у HEAD", async () => {
          const rolesAPI = new RolesAPI(request);
          const adminCreds = getCredentials("admin");
          await rolesAPI.signIn(adminCreds.email, adminCreds.password);
          const { data: allRoles } = await rolesAPI.getRoles();
          const userRole = (allRoles?.items || allRoles || []).find(
            (r) => r.title === "User",
          );
          if (userRole) {
            const headAPI = new DashboardTeamAPI(request);
            await headAPI.signIn(headEmail, headPassword);
            const { data: me } = await headAPI.get("/private/accounts/me");
            const headUserId = me?.currentUserId || me?.account?.users?.[0]?.id;
            if (headUserId) {
              await rolesAPI.assignRolesToUser(headUserId, [userRole.id]);
              console.log(`[C7117] Cleared stale roles for HEAD userId=${headUserId}`);
            }
          }
        });

        // Логин HEAD в новом контексте ПОСЛЕ cleanup (чтобы сессия отражала актуальные роли)
        const { TokenManager } = await import("../../../utils/auth/TokenManager.js");
        const context = await browser.newContext();
        const page = await context.newPage();
        await TokenManager.loginViaApi(page, headEmail, headPassword);

        const tab = new ScoreDistributionTab(page);
        await tab.open();

        await test.step("Дефолтное значение — «Прямые подчинённые»", async () => {
          const defaultValue = await tab.getEmployeesFilterValue();
          expect(
            defaultValue,
            "Head должен видеть только прямых подчинённых по умолчанию",
          ).toBe("Прямые подчиненные");
        });

        await test.step("Селект заблокирован (только одна опция)", async () => {
          const combobox = tab.employeesFilterCombobox;
          await expect(
            combobox,
            "Combobox должен быть disabled — у head одна опция",
          ).toBeDisabled();
        });

        await test.step("Таблица содержит подчинённых head — API-сверка", async () => {
          const rowCount = await tab.getRowCount();
          expect(rowCount).toBeGreaterThan(0);
          const names = await tab.getEmployeeNames();
          expect(names.length).toBeGreaterThan(0);

          // === API-сверка: total из API совпадает с UI ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("head");
          await api.signIn(email, password);
          const { data: apiUsers } = await api.getDistributionUsers({
            usersSubset: "directSubordinates",
            limit: 20,
            offset: 0,
          });
          expect(apiUsers.total).toBeGreaterThan(0);
          expect(rowCount).toBe(Math.min(apiUsers.total, 20));

          // Имена из UI должны совпадать с API
          const apiNames = (apiUsers.items || []).map((u) =>
            `${u.firstName || ""} ${u.lastName || ""}`.trim(),
          );
          for (const uiName of names) {
            const found = apiNames.some(
              (apiName) => uiName.includes(apiName) || apiName.includes(uiName),
            );
            expect(found).toBe(true);
          }
        });

        await context.close();
      },
    );
  },
);
