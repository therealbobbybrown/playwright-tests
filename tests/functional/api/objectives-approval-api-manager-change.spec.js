// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import {
  ObjectivesAPI,
  OrgStructureAPI,
  getCredentials,
} from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * API тесты: Смена руководителя в процессе утверждения цели (DEVAPR-11722)
 *
 * Сценарий:
 * 1. user создаёт цель и отправляет на утверждение (approvalProcess)
 * 2. На этот момент head является руководителем, который может утверждать
 * 3. Через OrgStructureAPI.addTreeUser(userId, managerId, 'move') перемещаем user под manager
 * 4. Проверяем: может ли СТАРЫЙ руководитель (head) утвердить?
 * 5. Проверяем: может ли НОВЫЙ руководитель (manager) утвердить?
 * 6. afterAll: восстанавливаем user под оригинального head
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
  managerAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  userAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  orgAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Shared state for beforeAll / afterAll
let objectiveId = null;
let userId = null;
let originalHeadId = null;
let newHeadId = null;
let approvalWasEnabled = false;

const createdObjectiveIds = [];

test.describe(
  "Objectives Approval API — Manager Change During Approval",
  { tag: ["@api", "@objectives", "@approval", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      // Step 1: Ensure approval is enabled
      const adminObjAPI = new ObjectivesAPI(request);
      const { email: adminEmail, password: adminPassword } =
        getCredentials("admin");
      await adminObjAPI.signIn(adminEmail, adminPassword);

      const { data: settings } = await adminObjAPI.getCompanySettings();
      approvalWasEnabled = !!settings?.isObjectivesApprovalEnabled;

      if (!approvalWasEnabled) {
        await adminObjAPI.setApprovalEnabled(true);
      }

      // Step 2: Resolve user IDs from tokens
      const userObjAPI = new ObjectivesAPI(request);
      const { email: userEmail, password: userPassword } =
        getCredentials("user");
      await userObjAPI.signIn(userEmail, userPassword);
      userId = userObjAPI.getCurrentUserId();
      if (!userId) {
        throw new Error(
          "Could not resolve userId from token — check user credentials",
        );
      }

      const headObjAPI = new ObjectivesAPI(request);
      const { email: headEmail, password: headPassword } =
        getCredentials("head");
      await headObjAPI.signIn(headEmail, headPassword);
      originalHeadId = headObjAPI.getCurrentUserId();
      if (!originalHeadId) {
        throw new Error(
          "Could not resolve headId from token — check head credentials",
        );
      }

      const managerObjAPI = new ObjectivesAPI(request);
      const { email: managerEmail, password: managerPassword } =
        getCredentials("manager");
      await managerObjAPI.signIn(managerEmail, managerPassword);
      newHeadId = managerObjAPI.getCurrentUserId();
      if (!newHeadId) {
        throw new Error(
          "Could not resolve managerId from token — check manager credentials",
        );
      }

      // Step 3: Create objective from user and send for approval
      const timestamp = Date.now();
      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();

      const { response: createResponse, data: createdObjective } =
        await userObjAPI.saveObjective({
          title: `Manager Change Approval Test ${timestamp}`,
          description: `Test: verify approval after manager change ${timestamp}`,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-mchg-${timestamp}`,
              title: `KR Manager Change ${timestamp}`,
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });

      assertSuccessStatus(createResponse);

      if (!createdObjective?.id) {
        throw new Error(
          "Objective creation failed — no ID returned. Cannot proceed with manager-change test.",
        );
      }

      objectiveId = createdObjective.id;
      createdObjectiveIds.push(objectiveId);

      // Send for approval: approvalWaiting → approvalProcess
      const { response: sendResponse } =
        await userObjAPI.sendForApproval(objectiveId);
      assertSuccessStatus(sendResponse);

      // Step 4: Move user under the new head (manager) — replace strategy
      const orgAdminAPI = new OrgStructureAPI(request);
      const { email: orgAdminEmail, password: orgAdminPassword } =
        getCredentials("admin");
      await orgAdminAPI.signIn(orgAdminEmail, orgAdminPassword);

      const { response: moveResponse } = await orgAdminAPI.addTreeUser(
        userId,
        newHeadId,
        "move",
      );
      assertSuccessStatus(moveResponse);
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Approval Manager Change");
    });

    // APP_BUG (проверено 2026-03-19): старый head МОЖЕТ утвердить (200) даже после перемещения.
    // По бизнес-логике: после смены руководителя утверждать должен НОВЫЙ, старый — нет.
    // Бэкенд не проверяет актуальную оргструктуру при утверждении.
    test(
      "C8376: Старый руководитель НЕ может утвердить цель после смены руководителя",
      { tag: ["@critical"] },
      async ({ headAPI, userAPI }) => {
        // APP_BUG: бэкенд не проверяет актуальную оргструктуру — старый head получает 200 вместо 403
        setSeverity("critical");

        if (!objectiveId) {
          throw new Error("objectiveId not set — beforeAll failed.");
        }

        await test.step(
          "Цель в статусе approvalProcess",
          async () => {
            const { data } = await userAPI.getObjectiveById(objectiveId);
            const obj = data?.objective || data;
            expect(obj.approvalStatus).toBe("approvalProcess");
          },
        );

        await test.step(
          "Старый head пытается утвердить → должен получить 403",
          async () => {
            const { response } = await headAPI.approveObjective(objectiveId);
            expect(
              response.status(),
              "APP_BUG: старый head получает 200 вместо 403. Бэкенд не проверяет актуальную оргструктуру",
            ).toBe(403);
          },
        );

        await test.step(
          "Цель остаётся в approvalProcess",
          async () => {
            const { data } = await userAPI.getObjectiveById(objectiveId);
            const obj = data?.objective || data;
            expect(obj.approvalStatus).toBe("approvalProcess");
          },
        );
      },
    );

    // ФАКТ (проверено 2026-03-19): новый руководитель ТОЖЕ может утвердить.
    // Бэкенд разрешает утверждение и старому, и новому руководителю.
    // Тест создаёт отдельную цель чтобы не зависеть от MCHG-01.
    test(
      "C8377: Новый руководитель (manager) может утвердить цель после смены руководителя",
      { tag: ["@critical"] },
      async ({ managerAPI, userAPI, objectivesVerifier }) => {
        setSeverity("critical");

        if (!objectiveId) {
          throw new Error("objectiveId not set — beforeAll failed.");
        }

        // MCHG-01 уже утвердил цель. Создаём новую для чистого теста.
        const userId = userAPI.getCurrentUserId();
        const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
        const { response: createResp, data: newObj } = await userAPI.saveObjective({
          title: `MCHG-02 test ${Date.now()}`,
          startDate, endDate, status: "active", level: "self",
          responsibleUserId: userId, userAccessType: "everybody",
          milestones: [{ temporaryId: `t-mchg2-${Date.now()}`, title: "KR", type: "percent", weight: 100, progress: 0, responsibleUserId: userId }],
        });
        assertSuccessStatus(createResp);
        const newObjId = newObj.id;
        createdObjectiveIds.push(newObjId);

        await userAPI.sendForApproval(newObjId);

        await test.step(
          "Новый manager (текущий руководитель) утверждает цель → 200",
          async () => {
            const { response } = await managerAPI.approveObjective(newObjId);
            expect(
              response.status(),
              "Новый руководитель может утвердить цель после перемещения user",
            ).toBe(200);
          },
        );

        await test.step(
          "Цель перешла в approved",
          async () => {
            const { data } = await userAPI.getObjectiveById(newObjId);
            const obj = data?.objective || data;
            expect(obj.approvalStatus).toBe("approved");

            if (objectivesVerifier.isConnected()) {
              await objectivesVerifier.verifyApprovalStatus(newObjId, "approved");
            }
          },
        );
      },
    );

    // Cleanup
    test.afterAll(async ({ request }) => {
      // Restore user under original head
      if (userId && originalHeadId) {
        try {
          const orgAdminAPI = new OrgStructureAPI(request);
          const { email: orgAdminEmail, password: orgAdminPassword } =
            getCredentials("admin");
          await orgAdminAPI.signIn(orgAdminEmail, orgAdminPassword);
          await orgAdminAPI.addTreeUser(userId, originalHeadId, "move");
        } catch (err) {
          console.warn(
            "[afterAll] Не удалось восстановить руководителя пользователя:",
            err.message,
          );
        }
      }

      // Delete created objectives
      if (createdObjectiveIds.length > 0) {
        const adminObjAPI = new ObjectivesAPI(request);
        const { email, password } = getCredentials("admin");
        await adminObjAPI.signIn(email, password);

        for (const id of createdObjectiveIds) {
          await adminObjAPI.deleteObjective(id).catch(() => {});
        }
        createdObjectiveIds.length = 0;
      }

      // Restore approval setting
      if (!approvalWasEnabled) {
        try {
          const adminObjAPI = new ObjectivesAPI(request);
          const { email, password } = getCredentials("admin");
          await adminObjAPI.signIn(email, password);
          await adminObjAPI.setApprovalEnabled(false);
        } catch (err) {
          console.warn(
            "[afterAll] Не удалось восстановить настройку утверждения:",
            err.message,
          );
        }
      }
    });
  },
);
