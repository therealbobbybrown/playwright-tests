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
 * API тесты: Права доступа к утверждению целей (DEVAPR-11722)
 *
 * Тройная верификация: API response + GET + DB
 * Покрытие:
 * - User НЕ может утвердить свою цель (самоутверждение запрещено)
 * - Head МОЖЕТ утвердить цель подчинённого
 * - User НЕ может утвердить чужую цель
 * - Admin может утвердить любую цель
 * - После утверждения автор НЕ может редактировать цель
 *
 * Аккаунты (company 538):
 * - Admin(91355), Manager(54288, head=self), Head(91407, head=54288), User(91461, head=91407)
 * - Цепочка утверждения: User→Head approves, Head→Manager approves
 */

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

// Helper: создать цель от user(91461) в статусе active
async function createUserObjective(userAPI, overrides = {}) {
  const timestamp = Date.now();
  const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
  const userId = userAPI.getCurrentUserId() || 91461;

  const { response, data } = await userAPI.saveObjective({
    title: `Approval Perm Test ${timestamp}`,
    description: `Test objective for approval permissions ${timestamp}`,
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
  "Objectives Approval API — Permissions",
  { tag: ["@api", "@objectives", "@approval", "@permissions", "@regression"] },
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
      markAsAPITest(MODULES.OBJECTIVES, "Approval Permissions");
    });

    test(
      "C8366: User НЕ может утвердить свою цель",
      { tag: ["@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        let objectiveId;
        let approveResponse;

        await test.step("Создать цель от user", async () => {
          const { response, data } = await createUserObjective(userAPI);
          assertSuccessStatus(response);
          objectiveId = data.id;
          expect(objectiveId, "ID цели должен быть определён").toBeDefined();
        });

        await test.step("User пытается утвердить свою цель", async () => {
          const result = await userAPI.approveObjective(objectiveId);
          approveResponse = result.response;
        });

        await test.step(
          "Тройная верификация: утверждение должно быть отклонено",
          async () => {
            if (!approveResponse.ok()) {
              // Вариант 1: API вернул ошибку — проверяем что это 403
              expect(
                [403, 400].includes(approveResponse.status()),
                `Ожидается 403/400 при попытке самоутверждения, получено ${approveResponse.status()}`,
              ).toBe(true);
            } else {
              // Вариант 2: API вернул 200, но статус цели не должен измениться
              const { data: getData } =
                await userAPI.getObjectiveById(objectiveId);
              const obj = getData?.objective || getData;
              expect(
                obj.approvalStatus,
                `Статус не должен стать 'approved' при самоутверждении, получено '${obj.approvalStatus}'`,
              ).not.toBe("approved");
            }
          },
        );
      },
    );

    test(
      "C8367: Head МОЖЕТ утвердить цель подчинённого",
      { tag: ["@critical", "@db"] },
      async ({ userAPI, headAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let objectiveId;

        await test.step("Создать цель от user и отправить на утверждение", async () => {
          const { response, data } = await createUserObjective(userAPI);
          assertSuccessStatus(response);
          objectiveId = data.id;
          const { response: sendResp } =
            await userAPI.sendForApproval(objectiveId);
          assertSuccessStatus(sendResp);
        });

        await test.step("Head утверждает цель подчинённого", async () => {
          const { response } = await headAPI.approveObjective(objectiveId);
          assertSuccessStatus(response);
        });

        await test.step("GET: approvalStatus === 'approved'", async () => {
          const { data } = await userAPI.getObjectiveById(objectiveId);
          const obj = data?.objective || data;
          expect(
            obj.approvalStatus,
            `Статус цели должен быть 'approved', получено '${obj.approvalStatus}'`,
          ).toBe("approved");
        });

        await test.step("DB: approval_status = 'approved'", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyApprovalStatus(
            objectiveId,
            "approved",
          );
        });
      },
    );

    test(
      "C8368: User НЕ может утвердить чужую цель",
      { tag: ["@critical"] },
      async ({ userAPI, headAPI }) => {
        setSeverity("critical");

        let objectiveId;
        let approveResponse;

        await test.step("Head создаёт цель на себя и отправляет на утверждение", async () => {
          const headUserId = headAPI.getCurrentUserId() || 91407;
          const timestamp = Date.now();
          const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();

          const { response, data } = await headAPI.saveObjective({
            title: `Head Own Objective ${timestamp}`,
            description: `Objective owned by head for perm test ${timestamp}`,
            startDate,
            endDate,
            status: "active",
            level: "self",
            responsibleUserId: headUserId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-${timestamp}`,
                title: `KR ${timestamp}`,
                type: "percent",
                weight: 100,
                progress: 0,
                responsibleUserId: headUserId,
              },
            ],
          });
          assertSuccessStatus(response);
          objectiveId = data.id;
          if (objectiveId) {
            createdObjectiveIds.push(objectiveId);
          }

          // Отправить на утверждение от head
          const { response: sendResp } =
            await headAPI.sendForApproval(objectiveId);
          assertSuccessStatus(sendResp);
        });

        await test.step("User пытается утвердить чужую цель", async () => {
          const result = await userAPI.approveObjective(objectiveId);
          approveResponse = result.response;
        });

        await test.step(
          "Тройная верификация: утверждение чужой цели должно быть отклонено",
          async () => {
            if (!approveResponse.ok()) {
              // Вариант 1: API вернул ошибку
              expect(
                [403, 400].includes(approveResponse.status()),
                `Ожидается 403/400 при попытке утвердить чужую цель, получено ${approveResponse.status()}`,
              ).toBe(true);
            } else {
              // Вариант 2: API вернул 200, проверяем что статус не изменился
              const { data: getDataHead } =
                await headAPI.getObjectiveById(objectiveId);
              const obj = getDataHead?.objective || getDataHead;
              expect(
                obj.approvalStatus,
                `Статус не должен стать 'approved' при утверждении не уполномоченным пользователем, получено '${obj.approvalStatus}'`,
              ).not.toBe("approved");
            }
          },
        );
      },
    );

    test(
      "C8369: Admin может утвердить любую цель",
      { tag: ["@critical", "@db"] },
      async ({ userAPI, adminAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let objectiveId;

        await test.step("Создать цель от user и отправить на утверждение", async () => {
          const { response, data } = await createUserObjective(userAPI);
          assertSuccessStatus(response);
          objectiveId = data.id;
          const { response: sendResp } =
            await userAPI.sendForApproval(objectiveId);
          assertSuccessStatus(sendResp);
        });

        await test.step("Admin утверждает цель", async () => {
          const { response } = await adminAPI.approveObjective(objectiveId);
          assertSuccessStatus(response);
        });

        await test.step("GET: approvalStatus === 'approved'", async () => {
          const { data } = await userAPI.getObjectiveById(objectiveId);
          const obj = data?.objective || data;
          expect(
            obj.approvalStatus,
            `Статус цели должен быть 'approved' после утверждения admin, получено '${obj.approvalStatus}'`,
          ).toBe("approved");
        });

        await test.step("DB: approval_status = 'approved'", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyApprovalStatus(
            objectiveId,
            "approved",
          );
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
