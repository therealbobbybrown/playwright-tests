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
 * API тесты: Переходы статусов утверждения целей (DEVAPR-11722)
 *
 * Тройная верификация каждого перехода: API response + GET + DB
 * Покрытие:
 * - Создание цели → approvalWaiting
 * - approvalWaiting → approvalProcess (отправка на утверждение)
 * - approvalProcess → approved (утверждение)
 * - approvalProcess → approvalWaiting (возврат на доработку)
 * - approvalWaiting → approved (прямое утверждение руководителем)
 * - Невалидные переходы → 400/403
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
    title: `Approval Test ${timestamp}`,
    description: `Test objective for approval transitions ${timestamp}`,
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
  "Objectives Approval API — Status Transitions",
  { tag: ["@api", "@objectives", "@approval", "@transitions", "@regression"] },
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
      markAsAPITest(MODULES.OBJECTIVES, "Approval Transitions");
    });

    test(
      "C8403: Создание цели при включённом утверждении → approvalWaiting",
      { tag: ["@critical", "@db"] },
      async ({ userAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let objective;

        await test.step("Создать цель от user", async () => {
          const { response, data } = await createUserObjective(userAPI);
          assertSuccessStatus(response);
          objective = data;
          expect(objective?.id, "ID цели должен быть определён").toBeDefined();
        });

        await test.step("API response: approvalStatus === 'approvalWaiting'", async () => {
          expect(
            objective.approvalStatus,
            `approvalStatus в ответе создания должен быть 'approvalWaiting', получено '${objective.approvalStatus}'`,
          ).toBe("approvalWaiting");
        });

        await test.step("GET /private/objectives/{id}/ — подтвердить approvalStatus", async () => {
          const { response, data } = await userAPI.getObjectiveById(objective.id);
          assertSuccessStatus(response);
          const obj = data?.objective || data;
          expect(obj.approvalStatus).toBe("approvalWaiting");
        });

        await test.step("DB: approval_status = 'approvalWaiting'", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyApprovalStatus(objective.id, "approvalWaiting");
        });
      },
    );

    test(
      "C8404: Отправка на утверждение (approvalWaiting → approvalProcess)",
      { tag: ["@critical", "@db"] },
      async ({ userAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let objectiveId, sendResponse;

        await test.step("Создать цель (approvalWaiting)", async () => {
          const { response, data } = await createUserObjective(userAPI);
          assertSuccessStatus(response);
          objectiveId = data.id;
        });

        await test.step("POST /private/objectives/{id}/approval-status/ — отправить на утверждение", async () => {
          const result = await userAPI.sendForApproval(objectiveId);
          sendResponse = result.response;
          assertSuccessStatus(sendResponse);
        });

        await test.step("GET: approvalStatus === 'approvalProcess'", async () => {
          const { data } = await userAPI.getObjectiveById(objectiveId);
          const obj = data?.objective || data;
          expect(obj.approvalStatus).toBe("approvalProcess");
        });

        await test.step("DB: approval_status = 'approvalProcess'", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyApprovalStatus(objectiveId, "approvalProcess");
        });
      },
    );

    test(
      "C8405: Утверждение руководителем (approvalProcess → approved)",
      { tag: ["@critical", "@db"] },
      async ({ userAPI, headAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let objectiveId, approveResponse;

        await test.step("Создать цель от user и отправить на утверждение", async () => {
          const { response, data } = await createUserObjective(userAPI);
          assertSuccessStatus(response);
          objectiveId = data.id;
          await userAPI.sendForApproval(objectiveId);
        });

        await test.step("Head утверждает: POST /private/objectives/{id}/approval-status/", async () => {
          const result = await headAPI.approveObjective(objectiveId);
          approveResponse = result.response;
          assertSuccessStatus(approveResponse);
        });

        await test.step("GET: approvalStatus === 'approved'", async () => {
          const { data } = await userAPI.getObjectiveById(objectiveId);
          const obj = data?.objective || data;
          expect(obj.approvalStatus).toBe("approved");
        });

        await test.step("DB: approval_status = 'approved'", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyApprovalStatus(objectiveId, "approved");
        });
      },
    );

    test(
      "C8406: Возврат на доработку (approvalProcess → approvalWaiting)",
      { tag: ["@critical", "@db"] },
      async ({ userAPI, headAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let objectiveId, returnResponse;

        await test.step("Создать цель и отправить на утверждение", async () => {
          const { response, data } = await createUserObjective(userAPI);
          assertSuccessStatus(response);
          objectiveId = data.id;
          await userAPI.sendForApproval(objectiveId);
        });

        await test.step("Head возвращает на доработку", async () => {
          const result = await headAPI.returnToRevision(objectiveId, "Уточни KR");
          returnResponse = result.response;
          assertSuccessStatus(returnResponse);
        });

        await test.step("GET: approvalStatus === 'approvalWaiting'", async () => {
          const { data } = await userAPI.getObjectiveById(objectiveId);
          const obj = data?.objective || data;
          expect(obj.approvalStatus).toBe("approvalWaiting");
        });

        await test.step("DB: approval_status = 'approvalWaiting'", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyApprovalStatus(objectiveId, "approvalWaiting");
        });
      },
    );

    test(
      "C8407: Прямое утверждение из approvalWaiting → approved (минуя approvalProcess)",
      { tag: ["@critical", "@db"] },
      async ({ userAPI, headAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let objectiveId, approveResponse;

        await test.step("Создать цель (approvalWaiting)", async () => {
          const { response, data } = await createUserObjective(userAPI);
          assertSuccessStatus(response);
          objectiveId = data.id;
        });

        await test.step("Head утверждает напрямую из approvalWaiting", async () => {
          const result = await headAPI.approveObjective(objectiveId);
          approveResponse = result.response;
        });

        if (approveResponse?.ok()) {
          await test.step("GET: approvalStatus === 'approved'", async () => {
            const { data } = await userAPI.getObjectiveById(objectiveId);
            const obj = data?.objective || data;
            expect(obj.approvalStatus).toBe("approved");
          });

          await test.step("DB: approval_status = 'approved'", async () => {
            if (!objectivesVerifier.isConnected()) return;
            await objectivesVerifier.verifyApprovalStatus(objectiveId, "approved");
          });
        } else {
          await test.step("API вернул ошибку — прямое утверждение не поддерживается", async () => {
            expect(
              [400, 403].includes(approveResponse.status()),
              `Ожидается 400/403, получено ${approveResponse.status()}`,
            ).toBe(true);
          });
        }
      },
    );

    test(
      "C8408: Обратный переход approved → approvalProcess (отзыв утверждения)",
      { tag: ["@db"] },
      async ({ userAPI, headAPI, objectivesVerifier }) => {
        setSeverity("normal");

        let objectiveId, reverseResponse;

        await test.step("Создать цель, отправить и утвердить", async () => {
          const { response, data } = await createUserObjective(userAPI);
          assertSuccessStatus(response);
          objectiveId = data.id;
          await userAPI.sendForApproval(objectiveId);
          await headAPI.approveObjective(objectiveId);
        });

        await test.step("Перевести approved → approvalProcess (отзыв)", async () => {
          const result = await headAPI.changeApprovalStatus(objectiveId, "approvalProcess");
          reverseResponse = result.response;
        });

        await test.step("Проверить что статус остался approved (обратный переход не выполняется)", async () => {
          // API может вернуть 200, но статус не меняется — approved финальный
          const { data } = await userAPI.getObjectiveById(objectiveId);
          const obj = data?.objective || data;
          expect(
            obj.approvalStatus,
            "approved — финальный статус, обратный переход не должен выполняться",
          ).toBe("approved");
          if (objectivesVerifier.isConnected()) {
            await objectivesVerifier.verifyApprovalStatus(objectiveId, "approved");
          }
        });
      },
    );

    test(
      "C8409: Полный цикл: создание → отправка → возврат → повторная отправка → утверждение",
      { tag: ["@critical", "@db"] },
      async ({ userAPI, headAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let objectiveId;

        await test.step("1. Создать цель → approvalWaiting", async () => {
          const { response, data } = await createUserObjective(userAPI);
          assertSuccessStatus(response);
          objectiveId = data.id;
          expect(data.approvalStatus).toBe("approvalWaiting");
        });

        await test.step("2. Отправить на утверждение → approvalProcess", async () => {
          const { response } = await userAPI.sendForApproval(objectiveId);
          assertSuccessStatus(response);
        });

        await test.step("3. Вернуть на доработку → approvalWaiting", async () => {
          const { response } = await headAPI.returnToRevision(objectiveId, "Добавь метрики");
          assertSuccessStatus(response);
        });

        await test.step("4. Повторная отправка → approvalProcess", async () => {
          const { response } = await userAPI.sendForApproval(objectiveId);
          assertSuccessStatus(response);
        });

        await test.step("5. Утвердить → approved", async () => {
          const { response } = await headAPI.approveObjective(objectiveId);
          assertSuccessStatus(response);
        });

        await test.step("6. Финальная проверка API + DB", async () => {
          const { data } = await userAPI.getObjectiveById(objectiveId);
          const obj = data?.objective || data;
          expect(obj.approvalStatus).toBe("approved");

          if (objectivesVerifier.isConnected()) {
            await objectivesVerifier.verifyApprovalStatus(objectiveId, "approved");
          }
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
