// tests/functional/objectives/objective-approval-manager-approves.spec.js
// TestRail: C-APPROVAL-APPROVE-01 — Руководитель утверждает цель через UI (DEVAPR-11722)
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

// User (Павел Новиков, HEAD = Анна Смирнова) — IDs resolved dynamically via signIn
let objectiveId = null;
let initialApprovalEnabled = null;

test.describe(
  "Утверждение целей — руководитель утверждает цель",
  { tag: ["@ui", "@objectives", "@approval", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Сохраняем начальное состояние настройки утверждения
      const { data: settingsData } = await api.getCompanySettings();
      initialApprovalEnabled =
        settingsData?.isObjectivesApprovalEnabled ??
        settingsData?.is_objectives_approval_enabled ??
        false;

      // Включаем утверждение целей
      const { response: enableResp } = await api.setApprovalEnabled(true);
      if (!enableResp.ok()) {
        throw new Error(
          `Не удалось включить утверждение целей: ${enableResp.status()}`,
        );
      }

      // Создаём цель от имени пользователя (user)
      const userApi = new ObjectivesAPI(request);
      const { email: userEmail, password: userPassword } =
        getCredentials("user");
      await userApi.signIn(userEmail, userPassword);

      const userId = userApi.getCurrentUserId();
      if (!userId) {
        throw new Error(
          "Не удалось получить userId пользователя после signIn — проверь credentials",
        );
      }

      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
      const uniqueId = Date.now();
      const { response: createResp, data: createData } =
        await userApi.saveObjective({
          title: `Цель для утверждения руководителем ${uniqueId}`,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-approval-approve-${uniqueId}`,
              title: `КР цели для утверждения ${uniqueId}`,
              type: "percent",
              weight: 1,
              progress: 0,
              responsibleUserId: userId,
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
      const { response: sendResp } = await userApi.sendForApproval(objectiveId);
      if (!sendResp.ok()) {
        throw new Error(
          `Не удалось отправить цель на утверждение: ${sendResp.status()}`,
        );
      }

      console.log(
        `[beforeAll] Создана и отправлена на утверждение цель id=${objectiveId}`,
      );
    });

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Удаляем цель
      if (objectiveId) {
        await api.deleteObjective(objectiveId).catch((e) => {
          console.warn(
            `[afterAll] Не удалось удалить цель ${objectiveId}: ${e.message}`,
          );
        });
        objectiveId = null;
      }

      // Восстанавливаем исходное состояние настройки утверждения
      if (initialApprovalEnabled !== null) {
        await api.setApprovalEnabled(initialApprovalEnabled).catch((e) => {
          console.warn(
            `[afterAll] Не удалось восстановить настройку утверждения: ${e.message}`,
          );
        });
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8297: Руководитель утверждает цель через UI",
      { tag: ["@critical", "@smoke"] },
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

        await test.step('Проверить что статус цели = "На утверждении"', async () => {
          await objectiveDetailsPage.assertApprovalStatus("На утверждении");
        });

        await test.step(
          'Проверить наличие кнопок "Утвердить цель" и "В доработку"',
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
      },
    );
  },
);
