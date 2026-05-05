// @ts-check
// tests/functional/api/objectives-approval-api-responsible-head.spec.js
//
// Тесты RESP: кто утверждает цель — руководитель ОТВЕТСТВЕННОГО, а не автора
// Сценарий: head(91407) создаёт цель, где responsible = user(resolved via signIn)
// Утверждать должен: head of user (= 91407 / headAuth)
// Автор (head) одновременно является руководителем responsible — проверяем как единый ролевой сценарий

import { test as fullTest, expect } from "../../fixtures/full.js";
import { ObjectivesAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertSuccessStatus,
  assertErrorStatus,
} from "../../utils/api/common-assertions.js";

/**
 * Расширяем фикстуры: adminAPI, headAPI, userAPI с ObjectivesAPI
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

// Shared state между beforeAll и тестами
let objectiveId = null;
let initialApprovalEnabled = null;

test.describe(
  "Objectives Approval API — Ответственный определяет руководителя-утверждающего",
  { tag: ["@api", "@objectives", "@approval", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      // Включить утверждение и создать цель от head с responsible = user
      const adminApi = new ObjectivesAPI(request);
      const { email: adminEmail, password: adminPassword } =
        getCredentials("admin");
      await adminApi.signIn(adminEmail, adminPassword);

      const { data: settingsData } = await adminApi.getCompanySettings();
      initialApprovalEnabled =
        settingsData?.isObjectivesApprovalEnabled ??
        settingsData?.is_objectives_approval_enabled ??
        false;

      if (!initialApprovalEnabled) {
        const { response: enableResp } = await adminApi.setApprovalEnabled(true);
        if (!enableResp.ok()) {
          throw new Error(
            `Не удалось включить утверждение целей: ${enableResp.status()}`,
          );
        }
      }

      // Получить userId пользователя (responsible) через signIn
      const userApi = new ObjectivesAPI(request);
      const { email: userEmail, password: userPassword } =
        getCredentials("user");
      await userApi.signIn(userEmail, userPassword);
      const userId = userApi.getCurrentUserId();
      if (!userId) {
        throw new Error(
          "Не удалось получить userId пользователя (user) после signIn — проверь credentials",
        );
      }

      // head создаёт цель с responsibleUserId = user
      const headApi = new ObjectivesAPI(request);
      const { email: headEmail, password: headPassword } =
        getCredentials("head");
      await headApi.signIn(headEmail, headPassword);

      const headId = headApi.getCurrentUserId();
      if (!headId) {
        throw new Error(
          "Не удалось получить headId после signIn — проверь credentials",
        );
      }

      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
      const uniqueId = Date.now();

      const { response, data } = await headApi.saveObjective({
        title: `[RESP] Цель от head, ответственный — user ${uniqueId}`,
        startDate,
        endDate,
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-resp-${uniqueId}`,
            title: `КР ответственность user ${uniqueId}`,
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      });

      if (!response.ok()) {
        throw new Error(
          `Не удалось создать цель через API (head): ${response.status()} ${JSON.stringify(data)}`,
        );
      }

      objectiveId = data?.id;
      if (!objectiveId) {
        throw new Error(
          `API не вернул ID созданной цели. Ответ: ${JSON.stringify(data)}`,
        );
      }

      // Отправить на утверждение от имени head (автора)
      const { response: sendResp } = await headApi.sendForApproval(objectiveId);
      if (!sendResp.ok()) {
        throw new Error(
          `Не удалось отправить цель на утверждение: ${sendResp.status()}`,
        );
      }

      console.log(
        `[beforeAll] Цель id=${objectiveId} создана head'ом, responsible=user(${userId}), отправлена на утверждение`,
      );
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Responsible determines approver");
    });

    /**
     * RESP-01: Руководитель responsible-пользователя (headAuth) может утвердить цель
     * Цель создана от head, responsible = user. Head = руководитель user → может утвердить.
     */
    test(
      "C8394: Руководитель ответственного может утвердить цель",
      { tag: ["@critical"] },
      async ({ headAPI }) => {
        setSeverity("critical");

        if (!objectiveId) {
          throw new Error(
            "objectiveId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        let approveResponse;
        let approveData;

        await test.step(
          "HEAD отправляет запрос на утверждение цели (как руководитель ответственного)",
          async () => {
            const result = await headAPI.approveObjective(objectiveId);
            approveResponse = result.response;
            approveData = result.data;
          },
        );

        await test.step(
          "Проверить: запрос завершился успешно (200/201/204)",
          async () => {
            assertSuccessStatus(
              approveResponse,
              `HEAD как руководитель ответственного должен иметь право утвердить цель. Статус: ${approveResponse.status()}, тело: ${JSON.stringify(approveData)}`,
            );
          },
        );

        await test.step("GET: approvalStatus === 'approved'", async () => {
          const { response, data } = await headAPI.getObjectiveById(objectiveId);
          assertSuccessStatus(response);
          const obj = data?.objective || data;
          expect(
            obj?.approvalStatus,
            `Цель должна быть в статусе 'approved', получено: '${obj?.approvalStatus}'`,
          ).toBe("approved");
        });
      },
    );

    /**
     * RESP-02: Документируем поведение — может ли admin (автор, но НЕ руководитель ответственного) утвердить цель
     * Цель создана от head, responsible = user. Admin — глобальный администратор.
     * Тест документирует реальное поведение API: либо 200 (если admin-override), либо 403.
     */
    test(
      "C8395: Документирование поведения — admin как не-руководитель ответственного пытается утвердить",
      { tag: ["@regression"] },
      async ({ adminAPI }) => {
        setSeverity("normal");

        if (!objectiveId) {
          throw new Error(
            "objectiveId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        // Проверяем текущий статус цели перед попыткой утверждения
        const { data: beforeData } = await adminAPI.getObjectiveById(objectiveId);
        const beforeObj = beforeData?.objective || beforeData;
        const currentStatus = beforeObj?.approvalStatus;

        await test.step(
          `Текущий approvalStatus цели перед попыткой admin: '${currentStatus}'`,
          async () => {
            expect(
              currentStatus,
              "approvalStatus должен быть определён",
            ).toBeDefined();
          },
        );

        let adminApproveResponse;

        await test.step(
          "ADMIN пытается утвердить цель (не является руководителем ответственного)",
          async () => {
            // Если уже approved — пробуем через sendForApproval + approve заново
            // Но мы не меняем состояние, только документируем что происходит при попытке approve
            const result = await adminAPI.approveObjective(objectiveId);
            adminApproveResponse = result.response;
          },
        );

        await test.step(
          "Документируем реальное поведение API (200 = admin-override разрешён; 400/403 = запрещено)",
          async () => {
            const status = adminApproveResponse.status();
            const allowedStatuses = [200, 201, 204, 400, 403];
            expect(
              allowedStatuses,
              `API вернул неожиданный статус ${status} при попытке admin утвердить чужую цель. Ожидается один из: ${allowedStatuses.join("/")}`,
            ).toContain(status);

            // Логируем поведение для документирования
            if (adminApproveResponse.ok()) {
              console.log(
                `[RESP-02] Admin (глобальный) МОЖЕТ утверждать цели: статус ${status}`,
              );
            } else {
              console.log(
                `[RESP-02] Admin НЕ может утверждать без права руководителя: статус ${status}`,
              );
            }
          },
        );
      },
    );

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      if (objectiveId) {
        await api.deleteObjective(objectiveId).catch((e) => {
          console.warn(
            `[afterAll] Не удалось удалить цель ${objectiveId}: ${e.message}`,
          );
        });
        objectiveId = null;
      }

      if (!initialApprovalEnabled) {
        await api.setApprovalEnabled(false).catch((e) => {
          console.warn(
            `[afterAll] Не удалось восстановить настройку утверждения: ${e.message}`,
          );
        });
      }
    });
  },
);
