// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { ObjectivesAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * API тесты: Прямое утверждение цели без отправки на утверждение (DEVAPR-11722)
 *
 * Покрытие:
 * - Руководитель создаёт цель подчинённому → сразу утверждает (без sendForApproval)
 * - Admin создаёт цель → сразу утверждает
 */

const USER_ID = 91461;

const test = fullTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  headAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
  userAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

// Cleanup
const createdObjectiveIds = [];
let approvalWasEnabled = false;

// Helper: создать тестовую цель от указанного API-клиента
async function createTestObjective(api, overrides = {}) {
  const timestamp = Date.now();
  const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
  const userId = api.getCurrentUserId() || USER_ID;

  const { response, data } = await api.saveObjective({
    title: `Auto-Approve Test ${timestamp}`,
    description: `Test objective for auto-approve tests ${timestamp}`,
    startDate,
    endDate,
    status: "active",
    level: "self",
    responsibleUserId: userId,
    userAccessType: "everybody",
    milestones: [
      {
        temporaryId: `temp-${timestamp}`,
        title: `KR ${timestamp}`,
        type: "percent",
        weight: 100,
        progress: 0,
        responsibleUserId: userId,
      },
    ],
    ...overrides,
  });

  if (response.ok() && data?.id) {
    createdObjectiveIds.push(data.id);
  }
  return { response, data };
}

test.describe(
  "Objectives Approval API — Auto-Approve",
  {
    tag: [
      "@api",
      "@objectives",
      "@approval",
      "@auto-approve",
      "@regression",
    ],
  },
  () => {
    test.beforeAll(async ({ request }) => {
      // Включить утверждение
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const { data: settings } = await api.getCompanySettings();
      approvalWasEnabled = !!settings?.isObjectivesApprovalEnabled;

      if (!approvalWasEnabled) {
        await api.setApprovalEnabled(true);
      }
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Approval Auto-Approve");
    });

    test(
      "C8388: Руководитель создаёт цель подчинённому и сразу утверждает",
      { tag: ["@critical", "@db"] },
      async ({ headAPI, userAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let objectiveId;

        await test.step("HEAD создаёт цель для User(91461) как responsibleUserId", async () => {
          const { response, data } = await createTestObjective(headAPI, {
            responsibleUserId: USER_ID,
            milestones: [
              {
                temporaryId: `temp-head-${Date.now()}`,
                title: `KR head ${Date.now()}`,
                type: "percent",
                weight: 100,
                progress: 0,
                responsibleUserId: USER_ID,
              },
            ],
          });
          assertSuccessStatus(response);
          objectiveId = data.id;
          expect(objectiveId, "ID цели должен быть определён").toBeDefined();
        });

        await test.step("HEAD сразу утверждает цель (без sendForApproval)", async () => {
          const { response } = await headAPI.approveObjective(objectiveId);
          assertSuccessStatus(response);
        });

        await test.step("GET /private/objectives/{id}/ — approvalStatus === 'approved'", async () => {
          const { response, data } =
            await userAPI.getObjectiveById(objectiveId);
          assertSuccessStatus(response);
          const obj = data?.objective || data;
          expect(
            obj.approvalStatus,
            `approvalStatus должен быть 'approved', получено '${obj.approvalStatus}'`,
          ).toBe("approved");
        });

        await test.step("DB: approval_status = 'approved'", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyApprovalStatus(objectiveId, "approved");
        });
      },
    );

    test(
      "C8389: Admin создаёт цель и сразу утверждает",
      { tag: ["@critical", "@db"] },
      async ({ adminAPI, userAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let objectiveId;

        await test.step("Admin создаёт цель (responsibleUserId = Admin)", async () => {
          const adminUserId = adminAPI.getCurrentUserId();
          const { response, data } = await createTestObjective(adminAPI, {
            responsibleUserId: adminUserId,
            milestones: [
              {
                temporaryId: `temp-admin-${Date.now()}`,
                title: `KR admin ${Date.now()}`,
                type: "percent",
                weight: 100,
                progress: 0,
                responsibleUserId: adminUserId,
              },
            ],
          });
          assertSuccessStatus(response);
          objectiveId = data.id;
          expect(objectiveId, "ID цели должен быть определён").toBeDefined();
        });

        await test.step("GET: цель создана с approvalStatus = 'approvalWaiting'", async () => {
          const { response, data } =
            await adminAPI.getObjectiveById(objectiveId);
          assertSuccessStatus(response);
          const obj = data?.objective || data;
          // При включённом утверждении новая цель создаётся в approvalWaiting
          expect(
            obj.approvalStatus,
            `Новая цель должна иметь approvalStatus 'approvalWaiting', получено '${obj.approvalStatus}'`,
          ).toBe("approvalWaiting");
        });

        await test.step("Admin сразу утверждает цель (без sendForApproval)", async () => {
          const { response } = await adminAPI.approveObjective(objectiveId);
          assertSuccessStatus(response);
        });

        await test.step("GET: approvalStatus === 'approved'", async () => {
          const { response, data } =
            await adminAPI.getObjectiveById(objectiveId);
          assertSuccessStatus(response);
          const obj = data?.objective || data;
          expect(
            obj.approvalStatus,
            `approvalStatus должен быть 'approved', получено '${obj.approvalStatus}'`,
          ).toBe("approved");
        });

        await test.step("DB: approval_status = 'approved'", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyApprovalStatus(objectiveId, "approved");
        });
      },
    );

    // Cleanup
    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of createdObjectiveIds) {
        await api.deleteObjective(id).catch(() => {});
      }
      createdObjectiveIds.length = 0;

      // Восстановить настройку утверждения
      if (!approvalWasEnabled) {
        await api.setApprovalEnabled(false);
      }
    });
  },
);
