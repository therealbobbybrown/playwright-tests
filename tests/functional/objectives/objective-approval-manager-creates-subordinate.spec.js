// tests/functional/objectives/objective-approval-manager-creates-subordinate.spec.js
// TestRail: C-APPROVAL-SUB-01 — Руководитель создаёт цель для подчинённого и утверждает её (DEVAPR-11722)
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

// head(91407) создаёт цель для user(91461) через API и утверждает через UI
const USER_ID = 91461; // Павел Новиков — прямой подчинённый head(91407)

let objectiveId = null;
let initialApprovalEnabled = null;

test.describe(
  "Утверждение целей — руководитель создаёт цель для подчинённого и утверждает",
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

      // Создаём цель от имени head(91407) с ответственным user(91461)
      const headApi = new ObjectivesAPI(request);
      const { email: headEmail, password: headPassword } =
        getCredentials("head");
      await headApi.signIn(headEmail, headPassword);

      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
      const uniqueId = Date.now();
      const { response: createResp, data: createData } =
        await headApi.saveObjective({
          title: `Цель подчинённого от руководителя ${uniqueId}`,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: USER_ID,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-sub-${uniqueId}`,
              title: `КР цели подчинённого ${uniqueId}`,
              type: "percent",
              weight: 1,
              progress: 0,
              responsibleUserId: USER_ID,
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

      console.log(
        `[beforeAll] Создана цель для подчинённого id=${objectiveId}, responsibleUserId=${USER_ID}`,
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

    test("C8298: Руководитель создаёт цель для подчинённого и утверждает её через UI",
      { tag: ["@critical"] },
      async ({ headAuth, page, request }, testInfo) => {
        setSeverity("critical");

        if (!objectiveId) {
          throw new Error(
            "objectiveId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const objectiveDetailsPage = new ObjectiveDetailsPage(page, testInfo);
        const approvalDialog = new ObjectiveApprovalDialog(page, testInfo);

        await test.step("Открыть страницу деталей цели", async () => {
          await objectiveDetailsPage.goto(objectiveId);
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        });

        await test.step('Проверить что статус цели = "Требует утверждения"', async () => {
          await objectiveDetailsPage.assertApprovalStatus("Требует утверждения");
        });

        await test.step(
          'Проверить наличие кнопки "Утвердить цель" (руководитель может утвердить цель подчинённого)',
          async () => {
            await objectiveDetailsPage.assertVisibleActions({
              approve: true,
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
      },
    );
  },
);
