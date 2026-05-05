// tests/functional/performance-review/resume/pr-resume-permissions-api.spec.js
// API тест: Только admin может возобновлять оценку — manager, user получают 403

import { test as base, expect } from "../../../fixtures/full.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import { TestDataHelper } from "../../../utils/TestDataHelper.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  managerAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  userAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "PR Resume — Permissions",
  {
    tag: ["@api", "@regression", "@performance-review", "@resume", "@negative"],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Permissions");
    });

    let createdReviewId = null;

    test.afterEach(async ({ prAPI }) => {
      if (createdReviewId) {
        try {
          await prAPI.stop(createdReviewId);
        } catch {
          /* ignore */
        }
        try {
          await prAPI.archive(createdReviewId);
          await prAPI.remove(createdReviewId);
        } catch {
          /* ignore */
        }
        createdReviewId = null;
      }
    });

    test(
      "C7441: Manager не может возобновить оценку — 403",
      { tag: ["@critical"] },
      async ({ prAPI, managerAPI, prSeed }) => {
        setSeverity("critical");

        let prId;

        await test.step("Admin: создать PR, заполнить, остановить", async () => {
          const { seedHelper } = prSeed;
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Права менеджера"),
          });
          prId = pr.id;
          createdReviewId = prId;

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
        });

        await test.step("Manager: попытка resume → ошибка", async () => {
          const { response } = await managerAPI.resume(prId);
          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
          console.log(`✓ Manager resume → ${response.status()}`);
        });

        await test.step("PR по-прежнему остановлен", async () => {
          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
        });
      },
    );

    test(
      "C7442: User (employee) не может возобновить оценку — 403",
      { tag: ["@critical"] },
      async ({ prAPI, userAPI, prSeed }) => {
        setSeverity("critical");

        let prId;

        await test.step("Admin: создать PR, заполнить, остановить", async () => {
          const { seedHelper } = prSeed;
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Права сотрудника"),
          });
          prId = pr.id;
          createdReviewId = prId;

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
        });

        await test.step("User: попытка resume → ошибка", async () => {
          const { response } = await userAPI.resume(prId);
          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
          console.log(`✓ User resume → ${response.status()}`);
        });

        await test.step("PR по-прежнему остановлен", async () => {
          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
        });
      },
    );

    test(
      "C7443: Admin успешно возобновляет оценку — 200",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");

        let prId;

        await test.step("Admin: создать PR, заполнить, остановить", async () => {
          const { seedHelper } = prSeed;
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Права админа"),
          });
          prId = pr.id;
          createdReviewId = prId;
        });

        await test.step("Admin: resume → 200 OK", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log("✓ Admin resume → active");
        });
      },
    );
  },
);
