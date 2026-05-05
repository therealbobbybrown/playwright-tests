// tests/functional/objectives/objective-approval-author-actions-process.spec.js
// Проверка действий автора цели в статусе "На утверждении" (approvalProcess)
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectiveDetailsPage } from "../../../pages/ObjectiveDetailsPage.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

let objectiveId = null;
let initialApprovalEnabled = null;

test.describe(
  "Утверждение целей — действия автора в статусе «На утверждении»",
  { tag: ["@ui", "@objectives", "@approval", "@roles", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      // 1. Сохраняем начальное состояние и включаем утверждение (от имени admin)
      const adminApi = new ObjectivesAPI(request);
      const { email: adminEmail, password: adminPassword } =
        getCredentials("admin");
      await adminApi.signIn(adminEmail, adminPassword);

      const { data: settingsData } = await adminApi.getCompanySettings();
      initialApprovalEnabled =
        settingsData?.isObjectivesApprovalEnabled ??
        settingsData?.is_objectives_approval_enabled ??
        false;

      const { response: enableResp } =
        await adminApi.setApprovalEnabled(true);
      if (!enableResp.ok()) {
        throw new Error(
          `Не удалось включить утверждение целей: ${enableResp.status()}`,
        );
      }

      // 2. Создаём цель от имени пользователя (user)
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
          title: `Цель автора — на утверждении ${uniqueId}`,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-author-process-${uniqueId}`,
              title: `КР автора — на утверждении ${uniqueId}`,
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

      // 3. Отправляем цель на утверждение (approvalWaiting → approvalProcess) от имени пользователя
      const { response: sendResp } =
        await userApi.sendForApproval(objectiveId);
      if (!sendResp.ok()) {
        throw new Error(
          `Не удалось отправить цель на утверждение: ${sendResp.status()}`,
        );
      }

      console.log(
        `[beforeAll] Создана и отправлена на утверждение цель id=${objectiveId} (approvalProcess)`,
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
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8275: Автор видит статус «На утверждении», кнопки действий недоступны, редактирование доступно",
      { tag: ["@critical"] },
      async ({ userAuth, page, request }, testInfo) => {
        setSeverity("critical");

        if (!objectiveId) {
          throw new Error(
            "objectiveId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const detailsPage = new ObjectiveDetailsPage(page, testInfo);

        await test.step("Открыть страницу деталей цели", async () => {
          await detailsPage.goto(objectiveId);
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        });

        await test.step('Проверить что статус цели = "На утверждении"', async () => {
          await detailsPage.assertApprovalStatus("На утверждении");
        });

        await test.step(
          "Проверить видимые действия автора: «Отправить на утверждение», «Утвердить цель» и «В доработку» отсутствуют, редактирование доступно",
          async () => {
            await detailsPage.assertVisibleActions({
              sendForApproval: false,
              approve: false,
              returnToRevision: false,
              edit: true,
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
