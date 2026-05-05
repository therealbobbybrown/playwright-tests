// tests/functional/objectives/objective-approval-create-waiting.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import { ObjectiveDetailsPage } from "../../../pages/ObjectiveDetailsPage.js";
import { ObjectivesAPI } from "../../utils/api/index.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Утверждение целей — создание",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    let initialApprovalState;
    let createdObjectiveId;

    test.beforeAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Сохраняем начальное состояние настройки утверждения
      const { data } = await api.getCompanySettings();
      initialApprovalState = !!data?.isObjectivesApprovalEnabled;

      // Включаем утверждение если выключено
      if (!initialApprovalState) {
        await api.setApprovalEnabled(true);
      }
    });

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Удаляем созданную цель если она была создана
      if (createdObjectiveId) {
        await api.deleteObjective(createdObjectiveId).catch(() => {
          // Игнорируем ошибку удаления — цель могла быть удалена другим способом
        });
      }

      // Восстанавливаем начальное состояние настройки утверждения
      if (!initialApprovalState) {
        await api.setApprovalEnabled(false);
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8283: Создание цели при включённом утверждении → статус «Требует утверждения»",
      { tag: ["@critical"] },
      async ({ userAuth, page, request }, testInfo) => {
        setSeverity("critical");

        const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);
        const detailsPage = new ObjectiveDetailsPage(page, testInfo);

        const randomNumber = Math.floor(Math.random() * 100000) + 1;
        const objectiveTitle = `Цель-утверждение ${randomNumber}`;
        const milestoneTitle = `Результат-утверждение ${randomNumber}`;

        await test.step("Открыть страницу создания цели", async () => {
          await page.goto("/ru/objectives/new/add/");
          await page
            .waitForLoadState("networkidle", { timeout: 15000 })
            .catch(() => {});
        });

        await test.step("Заполнить форму и создать цель", async () => {
          await objectiveCreatePage.fillAndCreateObjective(
            objectiveTitle,
            milestoneTitle,
          );
        });

        await test.step("Извлечь ID созданной цели из URL", async () => {
          const url = page.url();
          const match = url.match(/\/objectives\/(?:view\/)?(\d+)/);
          if (!match) {
            throw new Error(
              `Не удалось извлечь ID цели из URL: ${url}. Цель могла не создаться.`,
            );
          }
          createdObjectiveId = Number(match[1]);
          expect(createdObjectiveId).toBeGreaterThan(0);
        });

        await test.step(
          "UI: проверить статус «Требует утверждения»",
          async () => {
            await detailsPage.assertApprovalStatus("Требует утверждения");
          },
        );

        await test.step(
          "UI: проверить видимые действия — кнопка «Отправить на утверждение» есть, «Утвердить цель» и «В доработку» отсутствуют",
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
          "Проверить что approvalStatus в API = 'approvalWaiting'",
          async () => {
            const api = new ObjectivesAPI(request);
            const { email, password } = getCredentials("admin");
            await api.signIn(email, password);

            const { response, data } =
              await api.getObjectiveById(createdObjectiveId);
            expect(
              response.ok(),
              `GET /private/objectives/${createdObjectiveId}/ вернул ${response.status()}`,
            ).toBe(true);
            const obj = data?.objective || data;
            expect(
              obj?.approvalStatus,
              `Ожидался approvalStatus === 'approvalWaiting', получено: ${obj?.approvalStatus}`,
            ).toBe("approvalWaiting");
          },
        );
      },
    );
  },
);
