// tests/functional/objectives/objective-approval-send-for-approval.spec.js
// TestRail: C-APPROVAL-SEND-01 — Отправка цели на утверждение через UI (DEVAPR-11722)
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
  "Утверждение целей — отправка на утверждение",
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
      const { response, data } = await userApi.saveObjective({
        title: `Цель для отправки на утверждение ${uniqueId}`,
        startDate,
        endDate,
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-approval-send-${uniqueId}`,
            title: `КР цели на утверждение ${uniqueId}`,
            type: "percent",
            weight: 1,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      });

      if (!response.ok()) {
        throw new Error(
          `Не удалось создать цель через API: ${response.status()} ${JSON.stringify(data)}`,
        );
      }

      objectiveId = data?.id;
      if (!objectiveId) {
        throw new Error(
          `API не вернул ID созданной цели. Ответ: ${JSON.stringify(data)}`,
        );
      }

      console.log(`[beforeAll] Создана цель id=${objectiveId}`);
    });

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Удаляем цель
      if (objectiveId) {
        await api.deleteObjective(objectiveId).catch((e) => {
          console.warn(`[afterAll] Не удалось удалить цель ${objectiveId}: ${e.message}`);
        });
        objectiveId = null;
      }

      // Восстанавливаем исходное состояние настройки утверждения
      if (initialApprovalEnabled !== null) {
        await api.setApprovalEnabled(initialApprovalEnabled).catch((e) => {
          console.warn(`[afterAll] Не удалось восстановить настройку утверждения: ${e.message}`);
        });
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8301: Отправка цели на утверждение через UI",
      { tag: ["@critical", "@smoke"] },
      async ({ userAuth, page, request }, testInfo) => {
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
          'Проверить наличие кнопки "Отправить на утверждение"',
          async () => {
            await objectiveDetailsPage.assertVisibleActions({
              sendForApproval: true,
            });
          },
        );

        await test.step('Нажать "Отправить на утверждение" → открывается диалог подтверждения', async () => {
          await objectiveDetailsPage.sendForApprovalButton.click();
        });

        await test.step("Проверить что диалог содержит заголовок 'Отправить цель на утверждение руководителю?' и имя руководителя", async () => {
          await approvalDialog.waitForOpen();

          await approvalDialog.assertTitle(
            "Отправить цель на утверждение руководителю?",
          );

          await approvalDialog.assertApproverName("Анна Смирнова");

          await approvalDialog.assertApproverLabel();
        });

        await test.step('Нажать "Отправить" в диалоге → статус меняется на "На утверждении"', async () => {
          await approvalDialog.confirm();
        });

        await test.step(
          'Проверить что статус цели = "На утверждении"',
          async () => {
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
            await objectiveDetailsPage.assertApprovalStatus("На утверждении");
          },
        );

        await test.step(
          'Проверить что кнопка "Отправить на утверждение" исчезла',
          async () => {
            await objectiveDetailsPage.assertVisibleActions({
              sendForApproval: false,
            });
          },
        );

        await test.step(
          "Проверить что approvalStatus в API = 'approvalProcess'",
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
              `approvalStatus должен быть 'approvalProcess', получено: '${obj?.approvalStatus}'`,
            ).toBe("approvalProcess");
          },
        );
      },
    );
  },
);
