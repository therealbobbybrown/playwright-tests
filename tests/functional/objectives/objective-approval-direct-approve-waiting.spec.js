// tests/functional/objectives/objective-approval-direct-approve-waiting.spec.js
// Руководитель утверждает цель напрямую из статуса approvalWaiting (минуя approvalProcess)
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectiveDetailsPage } from "../../../pages/ObjectiveDetailsPage.js";
import { ObjectiveApprovalDialog } from "../../../pages/ObjectiveApprovalDialog.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import { markAsUITest, MODULES } from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

// ID создаётся динамически в beforeAll
let objectiveId = null;
let initialApprovalEnabled = null;

test.describe(
  "Утверждение целей — прямое утверждение из статуса approvalWaiting",
  { tag: ["@ui", "@objectives", "@approval", "@roles", "@regression"] },
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
      const { response: enableResp } =
        await adminApi.setApprovalEnabled(true);
      if (!enableResp.ok()) {
        throw new Error(
          `Не удалось включить утверждение целей: ${enableResp.status()}`,
        );
      }

      // Создаём цель от имени пользователя (user, 91461) в статусе approvalWaiting
      // (цель создана, но НЕ отправлена на утверждение — статус по умолчанию)
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
          title: `[Прямое утверждение] approvalWaiting → approved ${uniqueId}`,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-direct-approve-${uniqueId}`,
              title: `КР прямого утверждения ${uniqueId}`,
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

      // Цель НЕ отправляется на утверждение — остаётся в approvalWaiting
      console.log(
        `[beforeAll] Создана цель в статусе approvalWaiting id=${objectiveId}`,
      );
    });

    test.afterAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await adminApi.signIn(email, password);

      // Удаляем цель
      if (objectiveId) {
        await adminApi.deleteObjective(objectiveId).catch((e) => {
          console.warn(
            `[afterAll] Не удалось удалить цель ${objectiveId}: ${e.message}`,
          );
        });
        objectiveId = null;
      }

      // Восстанавливаем исходную настройку утверждения
      if (initialApprovalEnabled !== null) {
        await adminApi
          .setApprovalEnabled(initialApprovalEnabled)
          .catch((e) => {
            console.warn(
              `[afterAll] Не удалось восстановить настройку утверждения: ${e.message}`,
            );
          });
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8285: Руководитель утверждает цель напрямую из статуса approvalWaiting",
      async ({ headAuth, page, request }, testInfo) => {
        if (!objectiveId) {
          throw new Error(
            "objectiveId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const detailsPage = new ObjectiveDetailsPage(page, testInfo);
        const approvalDialog = new ObjectiveApprovalDialog(page, testInfo);

        await test.step(
          "Открыть страницу деталей цели",
          async () => {
            await detailsPage.goto(objectiveId);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          },
        );

        await test.step(
          'Проверить что статус цели = "Требует утверждения"',
          async () => {
            await detailsPage.assertApprovalStatus("Требует утверждения");
          },
        );

        await test.step(
          'Проверить наличие кнопки "Утвердить цель"',
          async () => {
            await detailsPage.assertVisibleActions({
              approve: true,
            });
          },
        );

        await test.step('Нажать "Утвердить цель" → открывается диалог подтверждения', async () => {
          await detailsPage.approveButton.click();
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
            await detailsPage.assertApprovalStatus("Утверждено");
          },
        );

        await test.step(
          'Проверить что кнопки "Утвердить цель", "В доработку", "Отправить на утверждение" исчезли',
          async () => {
            await detailsPage.assertVisibleActions({
              approve: false,
              returnToRevision: false,
              sendForApproval: false,
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
