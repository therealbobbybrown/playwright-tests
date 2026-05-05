// tests/functional/objectives/objective-approval-send-popup-name.spec.js
// TestRail: C-APPROVAL-POPUP-NAME-01
//
// Сценарий: попап "Отправить на утверждение" показывает имя руководителя
// Подтверждено через MCP-браузер: диалог содержит текст
// "Отправить цель на утверждение руководителю?" и имя "Анна Смирнова" (head of user)
//
// ВАЖНО: используем userAuth (не adminAuth) — только автор цели видит кнопку
// "Отправить на утверждение". Цель создана от user, head = Анна Смирнова.

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

// Имя руководителя user'а — подтверждено через MCP-инспекцию
const HEAD_NAME = "Анна Смирнова";

let objectiveId = null;
let initialApprovalEnabled = null;

test.describe(
  "Утверждение целей — имя руководителя в попапе отправки",
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

      // Создаём цель от имени user (чтобы user видел кнопку "Отправить на утверждение")
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

      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
      const uniqueId = Date.now();

      const { response, data } = await userApi.saveObjective({
        title: `[POPUP-NAME] Цель для проверки попапа ${uniqueId}`,
        startDate,
        endDate,
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-popup-name-${uniqueId}`,
            title: `КР попапа ${uniqueId}`,
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      });

      if (!response.ok()) {
        throw new Error(
          `Не удалось создать цель через API (user): ${response.status()} ${JSON.stringify(data)}`,
        );
      }

      objectiveId = data?.id;
      if (!objectiveId) {
        throw new Error(
          `API не вернул ID цели. Ответ: ${JSON.stringify(data)}`,
        );
      }

      console.log(
        `[beforeAll] Цель id=${objectiveId} создана от user(${userId}), head = "${HEAD_NAME}"`,
      );
    });

    test.afterAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await adminApi.signIn(email, password);

      if (objectiveId) {
        await adminApi.deleteObjective(objectiveId).catch((e) => {
          console.warn(
            `[afterAll] Не удалось удалить цель ${objectiveId}: ${e.message}`,
          );
        });
        objectiveId = null;
      }

      if (initialApprovalEnabled !== null) {
        await adminApi.setApprovalEnabled(initialApprovalEnabled).catch((e) => {
          console.warn(
            `[afterAll] Не удалось восстановить настройку утверждения: ${e.message}`,
          );
        });
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES, "Send for approval popup name");
    });

    test("C8302: Попап 'Отправить на утверждение' содержит имя руководителя",
      { tag: ["@critical"] },
      async ({ userAuth, page }, testInfo) => {
        setSeverity("critical");

        if (!objectiveId) {
          throw new Error(
            "objectiveId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const detailsPage = new ObjectiveDetailsPage(page, testInfo);
        const approvalDialog = new ObjectiveApprovalDialog(page, testInfo);

        await test.step(
          "Открыть страницу деталей цели под user",
          async () => {
            await detailsPage.goto(objectiveId);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          },
        );

        await test.step(
          "Проверить наличие кнопки 'Отправить на утверждение'",
          async () => {
            await detailsPage.assertVisibleActions({ sendForApproval: true });
          },
        );

        await test.step(
          "Нажать 'Отправить на утверждение' — открыть попап",
          async () => {
            await detailsPage.sendForApprovalButton.click();
          },
        );

        await test.step("Дождаться открытия диалога", async () => {
          await approvalDialog.waitForOpen();
        });

        await test.step(
          "Проверить заголовок диалога: 'Отправить цель на утверждение руководителю?'",
          async () => {
            await approvalDialog.assertTitle(
              "Отправить цель на утверждение руководителю?",
            );
          },
        );

        await test.step(
          `Проверить имя руководителя в диалоге: "${HEAD_NAME}"`,
          async () => {
            await approvalDialog.assertApproverName(HEAD_NAME);
          },
        );

        await test.step(
          "Проверить метку 'Утверждает цель' в диалоге",
          async () => {
            await approvalDialog.assertApproverLabel();
          },
        );

        await test.step(
          "Закрыть попап через 'Отмена' (цель не отправляем)",
          async () => {
            await approvalDialog.cancel();
          },
        );

        await test.step(
          "Проверить: диалог закрыт, кнопка 'Отправить на утверждение' снова видна",
          async () => {
            await approvalDialog.assertClosed();
            await detailsPage.assertVisibleActions({ sendForApproval: true });
          },
        );
      },
    );
  },
);
