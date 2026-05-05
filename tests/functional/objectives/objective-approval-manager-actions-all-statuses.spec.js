// tests/functional/objectives/objective-approval-manager-actions-all-statuses.spec.js
// Руководитель видит корректные кнопки действий для целей в разных статусах утверждения
import { test } from "../../fixtures/auth.js";
import { ObjectiveDetailsPage } from "../../../pages/ObjectiveDetailsPage.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import { markAsUITest, MODULES } from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

// IDs создаются динамически в beforeAll
let objectiveWaitingId = null;
let objectiveProcessId = null;
let objectiveApprovedId = null;
let initialApprovalEnabled = null;

test.describe(
  "Утверждение целей — кнопки действий для руководителя по статусам",
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

      // Создаём 3 цели от имени пользователя (user, 91461)
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

      // 1. Цель в статусе approvalWaiting (создана, не отправлена)
      const { response: r1, data: d1 } = await userApi.saveObjective({
        title: `[Статус-тест] approvalWaiting ${uniqueId}`,
        startDate,
        endDate,
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-waiting-${uniqueId}`,
            title: `КР waiting ${uniqueId}`,
            type: "percent",
            weight: 1,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      });
      if (!r1.ok()) {
        throw new Error(
          `Не удалось создать цель (waiting): ${r1.status()} ${JSON.stringify(d1)}`,
        );
      }
      objectiveWaitingId = d1?.id;
      if (!objectiveWaitingId) {
        throw new Error(
          `API не вернул ID цели (waiting). Ответ: ${JSON.stringify(d1)}`,
        );
      }

      // 2. Цель в статусе approvalProcess (отправлена на утверждение)
      const { response: r2, data: d2 } = await userApi.saveObjective({
        title: `[Статус-тест] approvalProcess ${uniqueId}`,
        startDate,
        endDate,
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-process-${uniqueId}`,
            title: `КР process ${uniqueId}`,
            type: "percent",
            weight: 1,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      });
      if (!r2.ok()) {
        throw new Error(
          `Не удалось создать цель (process): ${r2.status()} ${JSON.stringify(d2)}`,
        );
      }
      objectiveProcessId = d2?.id;
      if (!objectiveProcessId) {
        throw new Error(
          `API не вернул ID цели (process). Ответ: ${JSON.stringify(d2)}`,
        );
      }
      const { response: sendResp } =
        await userApi.sendForApproval(objectiveProcessId);
      if (!sendResp.ok()) {
        throw new Error(
          `Не удалось отправить цель на утверждение: ${sendResp.status()}`,
        );
      }

      // 3. Цель в статусе approved (утверждена напрямую через API от имени head/admin)
      const { response: r3, data: d3 } = await userApi.saveObjective({
        title: `[Статус-тест] approved ${uniqueId}`,
        startDate,
        endDate,
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-approved-${uniqueId}`,
            title: `КР approved ${uniqueId}`,
            type: "percent",
            weight: 1,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      });
      if (!r3.ok()) {
        throw new Error(
          `Не удалось создать цель (approved): ${r3.status()} ${JSON.stringify(d3)}`,
        );
      }
      objectiveApprovedId = d3?.id;
      if (!objectiveApprovedId) {
        throw new Error(
          `API не вернул ID цели (approved). Ответ: ${JSON.stringify(d3)}`,
        );
      }
      // Утверждаем через admin API
      const { response: approveResp } =
        await adminApi.approveObjective(objectiveApprovedId);
      if (!approveResp.ok()) {
        throw new Error(
          `Не удалось утвердить цель через API: ${approveResp.status()}`,
        );
      }

      console.log(
        `[beforeAll] Создано 3 цели: waiting=${objectiveWaitingId}, process=${objectiveProcessId}, approved=${objectiveApprovedId}`,
      );
    });

    test.afterAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await adminApi.signIn(email, password);

      // Удаляем цели
      for (const [id, label] of [
        [objectiveWaitingId, "waiting"],
        [objectiveProcessId, "process"],
        [objectiveApprovedId, "approved"],
      ]) {
        if (id) {
          await adminApi.deleteObjective(id).catch((e) => {
            console.warn(
              `[afterAll] Не удалось удалить цель (${label}) ${id}: ${e.message}`,
            );
          });
        }
      }

      // Восстанавливаем исходную настройку утверждения
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

    test("C8294: Руководитель видит корректные кнопки для цели в статусе approvalWaiting",
      async ({ headAuth, page }, testInfo) => {
        if (!objectiveWaitingId) {
          throw new Error(
            "objectiveWaitingId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const detailsPage = new ObjectiveDetailsPage(page, testInfo);

        await test.step(
          "Открыть страницу деталей цели (approvalWaiting)",
          async () => {
            await detailsPage.goto(objectiveWaitingId);
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
          'Проверить наличие кнопок: редактирование, удаление, "Утвердить цель"',
          async () => {
            await detailsPage.assertVisibleActions({
              approve: true,
              edit: true,
            });
          },
        );

        await test.step(
          'Проверить отсутствие кнопок "В доработку" и "Отправить на утверждение"',
          async () => {
            await detailsPage.assertVisibleActions({
              returnToRevision: false,
              sendForApproval: false,
            });
          },
        );
      },
    );

    test("C8295: Руководитель видит корректные кнопки для цели в статусе approvalProcess",
      async ({ headAuth, page }, testInfo) => {
        if (!objectiveProcessId) {
          throw new Error(
            "objectiveProcessId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const detailsPage = new ObjectiveDetailsPage(page, testInfo);

        await test.step(
          "Открыть страницу деталей цели (approvalProcess)",
          async () => {
            await detailsPage.goto(objectiveProcessId);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          },
        );

        await test.step('Проверить что статус цели = "На утверждении"', async () => {
          await detailsPage.assertApprovalStatus("На утверждении");
        });

        await test.step(
          'Проверить наличие кнопок: редактирование, удаление, "Утвердить цель", "В доработку"',
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
      },
    );

    test("C8296: Руководитель видит корректные кнопки для цели в статусе approved",
      async ({ headAuth, page }, testInfo) => {
        if (!objectiveApprovedId) {
          throw new Error(
            "objectiveApprovedId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const detailsPage = new ObjectiveDetailsPage(page, testInfo);

        await test.step(
          "Открыть страницу деталей цели (approved)",
          async () => {
            await detailsPage.goto(objectiveApprovedId);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          },
        );

        await test.step('Проверить что статус цели = "Утверждено"', async () => {
          await detailsPage.assertApprovalStatus("Утверждено");
        });

        await test.step(
          "Проверить наличие кнопок: редактирование, удаление",
          async () => {
            await detailsPage.assertVisibleActions({
              edit: true,
            });
          },
        );

        await test.step(
          'Проверить отсутствие кнопок "Утвердить цель", "В доработку", "Отправить на утверждение"',
          async () => {
            await detailsPage.assertVisibleActions({
              approve: false,
              returnToRevision: false,
              sendForApproval: false,
            });
          },
        );
      },
    );
  },
);
