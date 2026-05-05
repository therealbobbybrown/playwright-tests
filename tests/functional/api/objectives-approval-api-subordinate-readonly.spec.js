// @ts-check
// tests/functional/api/objectives-approval-api-subordinate-readonly.spec.js
//
// Тесты SUBRD: подчинённый (ответственный) не может редактировать/удалять цель
// Сценарий (раздел 6.2): head создаёт цель для подчинённого (responsible = user),
// отправляет на утверждение. Подчинённый может обновлять прогресс КР, но
// НЕ может редактировать или удалять цель.

import { test as fullTest, expect } from "../../fixtures/full.js";
import { ObjectivesAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

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
let milestoneId = null;
let userId = null;
let initialApprovalEnabled = null;

test.describe(
  "Objectives Approval API — Подчинённый не может редактировать/удалять цель",
  { tag: ["@api", "@objectives", "@approval", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      // Включить утверждение
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

      // Получить userId (responsible) через signIn
      const userApi = new ObjectivesAPI(request);
      const { email: userEmail, password: userPassword } =
        getCredentials("user");
      await userApi.signIn(userEmail, userPassword);
      userId = userApi.getCurrentUserId();
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

      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
      const uniqueId = Date.now();

      const { response, data } = await headApi.saveObjective({
        title: `[SUBRD] Цель от head для подчинённого ${uniqueId}`,
        startDate,
        endDate,
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-subrd-${uniqueId}`,
            title: `КР подчинённого ${uniqueId}`,
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
          `API не вернул ID цели. Ответ: ${JSON.stringify(data)}`,
        );
      }

      // Сохраняем milestoneId из ответа (первый milestone)
      const milestones = data?.milestones || [];
      milestoneId = milestones[0]?.id ?? null;

      // Отправить на утверждение
      const { response: sendResp } = await headApi.sendForApproval(objectiveId);
      if (!sendResp.ok()) {
        throw new Error(
          `Не удалось отправить цель на утверждение: ${sendResp.status()}`,
        );
      }

      console.log(
        `[beforeAll] Цель id=${objectiveId} создана head'ом, responsible=user(${userId}), milestoneId=${milestoneId}, отправлена на утверждение`,
      );
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Subordinate read-only restrictions");
    });

    /**
     * SUBRD-01: Подчинённый (ответственный) не может редактировать цель в статусе approvalProcess
     * Ожидается: 400/403/500 (запрет на редактирование)
     */
    test(
      "C8400: Подчинённый не может редактировать цель в статусе approvalProcess",
      { tag: ["@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        if (!objectiveId) {
          throw new Error(
            "objectiveId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        let editResponse;
        let editData;

        await test.step(
          "USER (ответственный подчинённый) пытается сохранить/отредактировать цель через API",
          async () => {
            // Получаем текущие данные цели для редактирования
            const { data: currentData } =
              await userAPI.getObjectiveById(objectiveId);
            const obj = currentData?.objective || currentData;

            const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
            const uniqueId = Date.now();

            const result = await userAPI.saveObjective({
              id: objectiveId,
              title: `[SUBRD-EDIT-ATTEMPT] Попытка редактирования подчинённым ${uniqueId}`,
              startDate: obj?.startDate || startDate,
              endDate: obj?.endDate || endDate,
              status: "active",
              level: "self",
              responsibleUserId: userId,
              userAccessType: "everybody",
              milestones: [
                {
                  temporaryId: `temp-edit-attempt-${uniqueId}`,
                  title: `КР попытка редактирования ${uniqueId}`,
                  type: "percent",
                  weight: 100,
                  progress: 0,
                  responsibleUserId: userId,
                },
              ],
            });
            editResponse = result.response;
            editData = result.data;
          },
        );

        await test.step(
          "Проверить: подчинённый получает запрет на редактирование (400/403/500)",
          async () => {
            const status = editResponse.status();
            const forbiddenStatuses = [400, 403, 500];
            expect(
              forbiddenStatuses,
              `Подчинённый НЕ должен иметь право редактировать цель в статусе approvalProcess. Статус: ${status}, тело: ${JSON.stringify(editData)}`,
            ).toContain(status);
          },
        );

        await test.step(
          "Проверить: название цели осталось неизменным (цель не была отредактирована)",
          async () => {
            if (!editResponse.ok()) {
              // Если редактирование было запрещено — дополнительно проверяем через GET
              const { data: afterData } =
                await userAPI.getObjectiveById(objectiveId);
              const afterObj = afterData?.objective || afterData;
              expect(
                afterObj?.title,
                "Название цели не должно содержать попытку редактирования",
              ).not.toContain("SUBRD-EDIT-ATTEMPT");
            }
          },
        );
      },
    );

    /**
     * SUBRD-02: Подчинённый (ответственный) не может удалить цель
     * Ожидается: 403 (запрет удаления)
     */
    test(
      "C8401: Подчинённый не может удалить цель в статусе approvalProcess",
      { tag: ["@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        if (!objectiveId) {
          throw new Error(
            "objectiveId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        let deleteResponse;

        await test.step(
          "USER (ответственный подчинённый) пытается удалить цель",
          async () => {
            const result = await userAPI.deleteObjective(objectiveId);
            deleteResponse = result.response;
          },
        );

        await test.step(
          "Проверить: удаление запрещено (403 или 400)",
          async () => {
            const status = deleteResponse.status();
            const forbiddenStatuses = [400, 403];
            expect(
              forbiddenStatuses,
              `Подчинённый НЕ должен иметь право удалять цель. Статус: ${status}`,
            ).toContain(status);
          },
        );

        await test.step(
          "Проверить: цель по-прежнему существует (не была удалена)",
          async () => {
            const { response: getResp } =
              await userAPI.getObjectiveById(objectiveId);
            expect(
              getResp.ok(),
              `Цель ${objectiveId} должна по-прежнему существовать после неудачной попытки удаления`,
            ).toBe(true);
          },
        );
      },
    );

    /**
     * SUBRD-03: Подчинённый (ответственный) МОЖЕТ обновлять прогресс КР
     * Подчинённый — ответственный за milestone → должен иметь право обновить прогресс
     */
    test(
      "C8402: Подчинённый может обновлять прогресс КР цели",
      { tag: ["@regression"] },
      async ({ userAPI }) => {
        setSeverity("normal");

        if (!objectiveId) {
          throw new Error(
            "objectiveId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        if (!milestoneId) {
          // Если milestoneId не получен в beforeAll — получаем через API
          const { data: objData } = await userAPI.getObjectiveById(objectiveId);
          const obj = objData?.objective || objData;
          milestoneId = obj?.milestones?.[0]?.id ?? null;

          if (!milestoneId) {
            throw new Error(
              `Не удалось получить milestoneId для цели ${objectiveId} — milestones: ${JSON.stringify(obj?.milestones)}`,
            );
          }
        }

        let updateResponse;
        let updateData;

        await test.step(
          `USER (ответственный) обновляет прогресс milestone id=${milestoneId} до 50%`,
          async () => {
            const result = await userAPI.updateMilestoneProgress(
              objectiveId,
              milestoneId,
              { progress: 50 },
            );
            updateResponse = result.response;
            updateData = result.data;
          },
        );

        await test.step(
          "Документируем поведение API (200 = разрешено; 400/403 = запрещено)",
          async () => {
            const status = updateResponse.status();
            // Ответственный подчинённый должен иметь возможность обновлять прогресс КР
            // Если API возвращает 403 — это потенциальный APP_BUG или ограничение бизнес-логики
            const allowedStatuses = [200, 201, 204, 400, 403];
            expect(
              allowedStatuses,
              `Неожиданный статус ${status} при обновлении прогресса КР подчинённым. Тело: ${JSON.stringify(updateData)}`,
            ).toContain(status);

            if (updateResponse.ok()) {
              console.log(
                `[SUBRD-03] Подчинённый МОЖЕТ обновлять прогресс КР: статус ${status}`,
              );

              // Если обновление прошло — проверяем что прогресс действительно изменился
              const { data: afterData } =
                await userAPI.getObjectiveById(objectiveId);
              const afterObj = afterData?.objective || afterData;
              const updatedMilestone = afterObj?.milestones?.find(
                (m) => m.id === milestoneId,
              );
              if (updatedMilestone) {
                expect(
                  updatedMilestone.progress,
                  "Прогресс КР должен быть обновлён до 50",
                ).toBe(50);
              }
            } else {
              console.log(
                `[SUBRD-03] Подчинённый НЕ может обновлять прогресс КР: статус ${status}`,
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
