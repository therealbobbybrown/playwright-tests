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
 * API тесты: Комментарии при возврате цели на доработку (DEVAPR-11722)
 *
 * Покрытие:
 * - Возврат на доработку с комментарием → комментарий создан в API + DB
 * - Возврат на доработку БЕЗ комментария → количество комментариев не изменилось
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
async function createTestObjective(api, overrides = {}) {
  const timestamp = Date.now();
  const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
  const userId = api.getCurrentUserId() || 91461;

  const { response, data } = await api.saveObjective({
    title: `Approval Comment Test ${timestamp}`,
    description: `Test objective for approval comment tests ${timestamp}`,
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
  "Objectives Approval API — Comments",
  { tag: ["@api", "@objectives", "@approval", "@comment", "@regression"] },
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
      markAsAPITest(MODULES.OBJECTIVES, "Approval Comments");
    });

    test(
      "C8373: Возврат на доработку с комментарием",
      { tag: ["@critical", "@db"] },
      async ({ userAPI, headAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let objectiveId;
        const revisionComment = "Нужно уточнить KR";

        await test.step("Создать цель от user и отправить на утверждение", async () => {
          const { response, data } = await createTestObjective(userAPI);
          assertSuccessStatus(response);
          objectiveId = data.id;
          expect(objectiveId, "ID цели должен быть определён").toBeDefined();

          const { response: sendResp } =
            await userAPI.sendForApproval(objectiveId);
          assertSuccessStatus(sendResp);
        });

        await test.step("HEAD возвращает на доработку с комментарием", async () => {
          const { response } = await headAPI.returnToRevision(
            objectiveId,
            revisionComment,
          );
          assertSuccessStatus(response);
        });

        await test.step("GET /private/objectives/{id}/ — approvalStatus вернулся в approvalWaiting", async () => {
          const { response, data } = await userAPI.getObjectiveById(objectiveId);
          assertSuccessStatus(response);
          const obj = data?.objective || data;
          expect(
            obj.approvalStatus,
            `approvalStatus должен быть 'approvalWaiting', получено '${obj.approvalStatus}'`,
          ).toBe("approvalWaiting");
        });

        await test.step(
          "GET /private/objective-comments/of-objective/{id}/ — комментарий найден",
          async () => {
            const { response, data } =
              await headAPI.getComments(objectiveId);
            assertSuccessStatus(response);

            const comments = Array.isArray(data)
              ? data
              : data?.results ?? data?.items ?? [];

            const found = comments.some(
              (c) =>
                typeof c.body === "string" &&
                c.body.includes(revisionComment),
            );
            expect(
              found,
              `Комментарий с текстом "${revisionComment}" не найден в ответе API. Всего комментариев: ${comments.length}`,
            ).toBe(true);
          },
        );

        await test.step("DB: комментарий с нужным текстом существует в objective_comments", async () => {
          if (!objectivesVerifier.isConnected()) return;
          const count = await objectivesVerifier.countComments(objectiveId);
          expect(
            count,
            "В БД должен быть хотя бы один комментарий для этой цели",
          ).toBeGreaterThan(0);
        });

        await test.step("DB: approval_status = 'approvalWaiting'", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyApprovalStatus(
            objectiveId,
            "approvalWaiting",
          );
        });
      },
    );

    test(
      "C8374: Возврат на доработку БЕЗ комментария",
      { tag: ["@db"] },
      async ({ userAPI, headAPI, objectivesVerifier }) => {
        setSeverity("normal");

        let objectiveId;
        let commentCountBefore;

        await test.step("Создать цель от user и отправить на утверждение", async () => {
          const { response, data } = await createTestObjective(userAPI);
          assertSuccessStatus(response);
          objectiveId = data.id;
          expect(objectiveId, "ID цели должен быть определён").toBeDefined();

          const { response: sendResp } =
            await userAPI.sendForApproval(objectiveId);
          assertSuccessStatus(sendResp);
        });

        await test.step("Запомнить количество комментариев ДО возврата", async () => {
          const { response, data } = await headAPI.getComments(objectiveId);
          assertSuccessStatus(response);
          const comments = Array.isArray(data)
            ? data
            : data?.results ?? data?.items ?? [];
          commentCountBefore = comments.length;
        });

        await test.step("HEAD возвращает на доработку БЕЗ комментария", async () => {
          const { response } = await headAPI.returnToRevision(objectiveId);
          assertSuccessStatus(response);
        });

        await test.step("GET /private/objectives/{id}/ — approvalStatus = approvalWaiting", async () => {
          const { response, data } = await userAPI.getObjectiveById(objectiveId);
          assertSuccessStatus(response);
          const obj = data?.objective || data;
          expect(obj.approvalStatus).toBe("approvalWaiting");
        });

        await test.step("GET комментарии ПОСЛЕ — количество не изменилось", async () => {
          const { response, data } = await headAPI.getComments(objectiveId);
          assertSuccessStatus(response);
          const comments = Array.isArray(data)
            ? data
            : data?.results ?? data?.items ?? [];
          expect(
            comments.length,
            `Количество комментариев не должно измениться: было ${commentCountBefore}, стало ${comments.length}`,
          ).toBe(commentCountBefore);
        });

        await test.step("DB: количество комментариев не изменилось", async () => {
          if (!objectivesVerifier.isConnected()) return;
          const countAfter = await objectivesVerifier.countComments(objectiveId);
          expect(
            countAfter,
            `DB: количество комментариев не должно измениться (ожидалось ${commentCountBefore}, получено ${countAfter})`,
          ).toBe(commentCountBefore);
        });

        await test.step("DB: approval_status = 'approvalWaiting'", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyApprovalStatus(
            objectiveId,
            "approvalWaiting",
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
