// tests/functional/objectives/objective-approval-author-actions-waiting.spec.js
// Проверка действий автора цели в статусе "Требует утверждения" (approvalWaiting)
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
  "Утверждение целей — действия автора в статусе «Требует утверждения»",
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

      // 2. Создаём цель от имени пользователя (user) — статус автоматически approvalWaiting
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
          title: `Цель автора — ожидание утверждения ${uniqueId}`,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-author-waiting-${uniqueId}`,
              title: `КР автора — ожидание ${uniqueId}`,
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

      console.log(
        `[beforeAll] Создана цель id=${objectiveId} в статусе approvalWaiting`,
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

    test("C8276: Автор видит статус «Требует утверждения» и кнопку «Отправить на утверждение»",
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

        await test.step('Проверить что статус цели = "Требует утверждения"', async () => {
          await detailsPage.assertApprovalStatus("Требует утверждения");
        });

        await test.step(
          "Проверить видимые действия автора: «Отправить на утверждение» видна, «Утвердить цель» и «В доработку» отсутствуют, редактирование доступно",
          async () => {
            await detailsPage.assertVisibleActions({
              sendForApproval: true,
              approve: false,
              returnToRevision: false,
              edit: true,
            });
          },
        );

        await test.step(
          'Проверить что кнопки "Утвердить цель" и "В доработку" имеют count 0',
          async () => {
            await expect(
              detailsPage.approveButton,
              'Кнопка "Утвердить цель" должна отсутствовать у автора в статусе approvalWaiting',
            ).toHaveCount(0);

            await expect(
              detailsPage.returnToRevisionButton,
              'Кнопка "В доработку" должна отсутствовать у автора в статусе approvalWaiting',
            ).toHaveCount(0);
          },
        );

        await test.step(
          "Проверить что approvalStatus в API = 'approvalWaiting'",
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
              `approvalStatus должен быть 'approvalWaiting', получено: '${obj?.approvalStatus}'`,
            ).toBe("approvalWaiting");
          },
        );
      },
    );
  },
);
