// tests/functional/objectives/objective-approval-admin-actions.spec.js
// Администратор видит все действия для цели в approvalProcess и успешно утверждает её
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
  "Утверждение целей — действия администратора",
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

      // Создаём цель от имени пользователя (user, 91461) и отправляем на утверждение
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
          title: `[Тест-Админ] Утверждение из approvalProcess ${uniqueId}`,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-admin-approve-${uniqueId}`,
              title: `КР утверждения администратором ${uniqueId}`,
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
      const { response: sendResp } =
        await userApi.sendForApproval(objectiveId);
      if (!sendResp.ok()) {
        throw new Error(
          `Не удалось отправить цель на утверждение: ${sendResp.status()}`,
        );
      }

      console.log(
        `[beforeAll] Создана и отправлена на утверждение цель id=${objectiveId} (для теста действий админа)`,
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

    test("C8273: Администратор видит все действия и утверждает цель из approvalProcess",
      async ({ adminAuth, page, request }, testInfo) => {
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

        await test.step('Проверить что статус цели = "На утверждении"', async () => {
          await detailsPage.assertApprovalStatus("На утверждении");
        });

        await test.step(
          'Проверить наличие всех действий администратора: "Утвердить цель", "В доработку", редактирование',
          async () => {
            await detailsPage.assertVisibleActions({
              approve: true,
              returnToRevision: true,
              edit: true,
            });
          },
        );

        await test.step(
          'Проверить отсутствие кнопки "Отправить на утверждение"',
          async () => {
            await detailsPage.assertVisibleActions({
              sendForApproval: false,
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
          'Проверить что кнопки "Утвердить цель", "В доработку" исчезли',
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
