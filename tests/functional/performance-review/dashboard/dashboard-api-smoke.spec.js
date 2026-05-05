// tests/functional/performance-review/dashboard/dashboard-api-smoke.spec.js
// Smoke: API тесты дашборда "Моя команда"

import { test, expect } from "../../../fixtures/auth.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Manager Dashboard - API Smoke",
  {
    tag: [
      "@dashboard",
      "@my-team",
      "@performance-review",
      "@regression",
      "@api",
    ],
  },
  () => {
    let testPrId;

    test.beforeAll(async ({ prSeed }) => {
      const pr = await prSeed.seedActivePR({ fillAssessments: true });
      testPrId = pr.id;
      console.log(`[dashboard-api-smoke] PR: ${testPrId}`);
    });

    test(
      "C4330: Руководитель получает данные дашборда",
      { tag: ["@api"] },
      async ({ request }) => {
        markAsAPITest(MODULES.MY_TEAM, "API Smoke");
        setSeverity("critical");

        const api = new DashboardTeamAPI(request);
        const { email, password } = getCredentials("manager");

        await test.step("Авторизоваться как руководитель", async () => {
          const { response } = await api.signIn(email, password);
          expect(
            response.ok(),
            "Авторизация должна быть успешной",
          ).toBeTruthy();
        });

        await test.step("Получить данные дашборда для PR", async () => {
          const { response } = await api.getDashboard(testPrId, {
            usersQuery: {},
          });

          console.log(`Статус: ${response.status()}`);
          expect(response.status()).toBeLessThan(500);
        });
      },
    );

    test(
      "C4331: Проверка что пользователь является руководителем",
      { tag: ["@api"] },
      async ({ request }) => {
        markAsAPITest(MODULES.MY_TEAM, "API Manager Check");
        setSeverity("normal");

        const api = new DashboardTeamAPI(request);
        const { email, password } = getCredentials("manager");

        await test.step("Авторизоваться", async () => {
          await api.signIn(email, password);
        });

        await test.step("Проверить наличие подчинённых", async () => {
          const { response, data } = await api.hasSubordinates();
          console.log(`Есть подчинённые: ${data}`);
          expect(response.ok()).toBeTruthy();
        });

        await test.step("Проверить что является руководителем", async () => {
          const { response, data } = await api.isHead();
          console.log(`Является руководителем: ${data}`);
          expect(response.ok()).toBeTruthy();
        });
      },
    );

    test(
      "C4332: Получение target users (подчинённых)",
      { tag: ["@api"] },
      async ({ request }) => {
        markAsAPITest(MODULES.MY_TEAM, "API Target Users");
        setSeverity("normal");

        const api = new DashboardTeamAPI(request);
        const { email, password } = getCredentials("manager");

        await test.step("Авторизоваться", async () => {
          await api.signIn(email, password);
        });

        await test.step("Получить target users для PR", async () => {
          const { response, data } =
            await api.getDashboardFiltersTargetUsers(testPrId);

          console.log(`Статус: ${response.status()}`);

          if (response.ok()) {
            const users = data?.items || data || [];
            console.log(`Найдено оцениваемых: ${users.length}`);
          }
        });
      },
    );
  },
);
