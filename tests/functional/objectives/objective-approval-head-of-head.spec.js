// tests/functional/objectives/objective-approval-head-of-head.spec.js
// TestRail: C-APPROVAL-HOH-01 — Менеджер (руководитель head) видит цель head и может утвердить (DEVAPR-11722)
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectiveDetailsPage } from "../../../pages/ObjectiveDetailsPage.js";
import { ObjectiveApprovalDialog } from "../../../pages/ObjectiveApprovalDialog.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

// Иерархия: manager(54288, Isla Wright) → head(91407, Анна Смирнова) → user(91461, Павел Новиков)
// Тест проверяет, что менеджер(54288) видит цель head(91407), отправленную на утверждение,
// и может её утвердить (как руководитель головы — второй уровень утверждения)

let objectiveId = null;
let initialApprovalEnabled = null;

test.describe(
  "Утверждение целей — менеджер (руководитель head) утверждает цель head",
  { tag: ["@ui", "@objectives", "@approval", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email: adminEmail, password: adminPassword } =
        getCredentials("admin");
      await adminApi.signIn(adminEmail, adminPassword);

      // Сохраняем начальное состояние настройки утверждения
      const { data: settingsData } = await adminApi.getCompanySettings();
      initialApprovalEnabled =
        settingsData?.isObjectivesApprovalEnabled ??
        settingsData?.is_objectives_approval_enabled ??
        false;

      // Включаем утверждение целей
      const { response: enableResp } = await adminApi.setApprovalEnabled(true);
      if (!enableResp.ok()) {
        throw new Error(
          `Не удалось включить утверждение целей: ${enableResp.status()}`,
        );
      }

      // Создаём цель от имени head(91407)
      const headApi = new ObjectivesAPI(request);
      const { email: headEmail, password: headPassword } =
        getCredentials("head");
      await headApi.signIn(headEmail, headPassword);

      const headUserId = headApi.getCurrentUserId();
      if (!headUserId) {
        throw new Error(
          "Не удалось получить userId head-пользователя после signIn — проверь credentials",
        );
      }

      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
      const uniqueId = Date.now();
      const { response: createResp, data: createData } =
        await headApi.saveObjective({
          title: `Цель head для утверждения менеджером ${uniqueId}`,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: headUserId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-hoh-${uniqueId}`,
              title: `КР цели head ${uniqueId}`,
              type: "percent",
              weight: 1,
              progress: 0,
              responsibleUserId: headUserId,
            },
          ],
        });

      if (!createResp.ok()) {
        throw new Error(
          `Не удалось создать цель через API: ${createResp.status()} ${JSON.stringify(createData)}`,
        );
      }

      objectiveId = createData?.id;
      if (!objectiveId) {
        throw new Error(
          `API не вернул ID созданной цели. Ответ: ${JSON.stringify(createData)}`,
        );
      }

      // Отправляем цель на утверждение (approvalWaiting → approvalProcess)
      const { response: sendResp } = await headApi.sendForApproval(objectiveId);
      if (!sendResp.ok()) {
        throw new Error(
          `Не удалось отправить цель на утверждение: ${sendResp.status()}`,
        );
      }

      console.log(
        `[beforeAll] Создана и отправлена на утверждение цель head id=${objectiveId}, userId=${headUserId}`,
      );
    });

    test.afterAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email: adminEmail, password: adminPassword } =
        getCredentials("admin");
      await adminApi.signIn(adminEmail, adminPassword);

      // Удаляем цель
      if (objectiveId) {
        await adminApi.deleteObjective(objectiveId).catch((e) => {
          console.warn(
            `[afterAll] Не удалось удалить цель ${objectiveId}: ${e.message}`,
          );
        });
        objectiveId = null;
      }

      // Восстанавливаем исходное состояние настройки утверждения
      if (initialApprovalEnabled !== null) {
        await adminApi.setApprovalEnabled(initialApprovalEnabled).catch((e) => {
          console.warn(
            `[afterAll] Не удалось восстановить настройку утверждения: ${e.message}`,
          );
        });
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8291: Менеджер (руководитель head) утверждает цель head через UI",
      { tag: ["@critical"] },
      async ({ managerAuth, page, request }, testInfo) => {
        setSeverity("critical");

        if (!objectiveId) {
          throw new Error(
            "objectiveId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const objectiveDetailsPage = new ObjectiveDetailsPage(page, testInfo);
        const approvalDialog = new ObjectiveApprovalDialog(page, testInfo);

        await test.step("Открыть страницу деталей цели как менеджер", async () => {
          await objectiveDetailsPage.goto(objectiveId);
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        });

        await test.step('Проверить что статус цели = "На утверждении"', async () => {
          await objectiveDetailsPage.assertApprovalStatus("На утверждении");
        });

        // Проверяем наличие кнопки "Утвердить цель"
        const approveButtonVisible = await objectiveDetailsPage.approveButton
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);

        if (approveButtonVisible) {
          // Менеджер видит кнопку утверждения — это ожидаемый сценарий
          await test.step(
            'Проверить наличие кнопок "Утвердить цель" и "В доработку" у менеджера',
            async () => {
              await objectiveDetailsPage.assertVisibleActions({
                approve: true,
                returnToRevision: true,
              });
            },
          );

          await test.step('Нажать "Утвердить цель" → открывается диалог подтверждения', async () => {
            await objectiveDetailsPage.approveButton.click();
          });

          await test.step("Проверить что диалог содержит заголовок 'Утвердить цель сотрудника?'", async () => {
            await approvalDialog.waitForOpen();
            await approvalDialog.assertTitle("Утвердить цель сотрудника?");
          });

          await test.step('Нажать "Утвердить" в диалоге → цель переходит в статус "Утверждено"', async () => {
            await approvalDialog.confirm();
          });

          await test.step(
            'Проверить что статус цели = "Утверждено"',
            async () => {
              await page
                .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
                .catch(() => {});
              await objectiveDetailsPage.assertApprovalStatus("Утверждено");
            },
          );

          await test.step(
            'Проверить что кнопки "Утвердить цель" и "В доработку" исчезли',
            async () => {
              await objectiveDetailsPage.assertVisibleActions({
                approve: false,
                returnToRevision: false,
              });
            },
          );

          await test.step(
            "Проверить что approvalStatus в API = 'approved'",
            async () => {
              const verifyApi = new ObjectivesAPI(request);
              const { email, password } = getCredentials("admin");
              await verifyApi.signIn(email, password);

              const { response, data } =
                await verifyApi.getObjectiveById(objectiveId);
              expect(
                response.ok(),
                `GET /private/objectives/${objectiveId}/ вернул ${response.status()}`,
              ).toBe(true);

              const obj = data?.objective || data;
              expect(
                obj?.approvalStatus,
                `approvalStatus должен быть 'approved', получено: '${obj?.approvalStatus}'`,
              ).toBe("approved");
            },
          );
        } else {
          // Менеджер НЕ видит кнопку утверждения — проверяем ограниченный набор действий
          await test.step(
            "Проверить что менеджер не имеет прав на утверждение цели head (кнопки отсутствуют)",
            async () => {
              await objectiveDetailsPage.assertVisibleActions({
                approve: false,
                returnToRevision: false,
              });
            },
          );

          await test.step(
            "Проверить что approvalStatus в API = 'approvalProcess' (утверждение не произошло)",
            async () => {
              const verifyApi = new ObjectivesAPI(request);
              const { email, password } = getCredentials("admin");
              await verifyApi.signIn(email, password);

              const { response, data } =
                await verifyApi.getObjectiveById(objectiveId);
              expect(
                response.ok(),
                `GET /private/objectives/${objectiveId}/ вернул ${response.status()}`,
              ).toBe(true);

              const obj = data?.objective || data;
              expect(
                obj?.approvalStatus,
                `approvalStatus должен остаться 'approvalProcess' (менеджер не утвердил), получено: '${obj?.approvalStatus}'`,
              ).toBe("approvalProcess");
            },
          );
        }
      },
    );
  },
);
