// tests/functional/objectives/objective-approval-deleted-goal-page.spec.js
// TestRail: C-APPROVAL-DEL-01
//
// Сценарий: когда цель удалена, переход по её URL показывает страницу с
// сообщением "Цель была удалена" и ссылкой "На главную".

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

// ID удалённой цели — устанавливается в beforeAll, используется в тесте
let deletedObjectiveId = null;
let initialApprovalEnabled = null;

test.describe(
  "Утверждение целей — страница удалённой цели",
  { tag: ["@ui", "@objectives", "@approval", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await adminApi.signIn(email, password);

      // Сохраняем начальное состояние настройки утверждения
      const { data: settingsData } = await adminApi.getCompanySettings();
      initialApprovalEnabled =
        settingsData?.isObjectivesApprovalEnabled ??
        settingsData?.is_objectives_approval_enabled ??
        false;

      // Включаем утверждение целей (для консистентности среды)
      if (!initialApprovalEnabled) {
        const { response: enableResp } =
          await adminApi.setApprovalEnabled(true);
        if (!enableResp.ok()) {
          throw new Error(
            `Не удалось включить утверждение целей: ${enableResp.status()}`,
          );
        }
      }

      // Создаём цель от имени admin, затем удаляем её — получаем "мёртвый" ID
      const adminId = adminApi.getCurrentUserId();
      if (!adminId) {
        throw new Error(
          "Не удалось получить adminId после signIn — проверь credentials",
        );
      }

      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
      const uniqueId = Date.now();

      const { response: createResp, data: createData } =
        await adminApi.saveObjective({
          title: `[DEL] Цель для проверки удалённой страницы ${uniqueId}`,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: adminId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-del-${uniqueId}`,
              title: `КР удалённой цели ${uniqueId}`,
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: adminId,
            },
          ],
        });

      if (!createResp.ok()) {
        throw new Error(
          `Не удалось создать цель через API: ${createResp.status()} ${JSON.stringify(createData)}`,
        );
      }

      const createdId = createData?.id;
      if (!createdId) {
        throw new Error(
          `API не вернул ID созданной цели. Ответ: ${JSON.stringify(createData)}`,
        );
      }

      // Удаляем цель сразу — нам нужен её ID для навигации
      const { response: deleteResp } =
        await adminApi.deleteObjective(createdId);
      if (!deleteResp.ok()) {
        throw new Error(
          `Не удалось удалить цель ${createdId}: ${deleteResp.status()}`,
        );
      }

      deletedObjectiveId = createdId;
      console.log(
        `[beforeAll] Цель id=${deletedObjectiveId} создана и удалена — будем проверять страницу 404/deleted`,
      );
    });

    test.afterAll(async ({ request }) => {
      // Цель уже удалена в beforeAll — дополнительная очистка не нужна
      // Восстанавливаем настройку утверждения если изменяли
      if (!initialApprovalEnabled) {
        const adminApi = new ObjectivesAPI(request);
        const { email, password } = getCredentials("admin");
        await adminApi.signIn(email, password);
        await adminApi.setApprovalEnabled(false).catch((e) => {
          console.warn(
            `[afterAll] Не удалось восстановить настройку утверждения: ${e.message}`,
          );
        });
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES, "Deleted goal page");
    });

    test("C8284: Переход на URL удалённой цели показывает страницу 'Цель была удалена'",
      { tag: ["@critical"] },
      async ({ adminAuth, page }) => {
        setSeverity("critical");

        if (!deletedObjectiveId) {
          throw new Error(
            "deletedObjectiveId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        await test.step(
          `Открыть URL удалённой цели: /ru/objectives/view/${deletedObjectiveId}/`,
          async () => {
            await page.goto(
              `/ru/objectives/view/${deletedObjectiveId}/`,
            );
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          },
        );

        await test.step(
          "Проверить: текст 'Цель была удалена' отображается на странице",
          async () => {
            const deletedNotice = page.getByText("Цель была удалена");
            await deletedNotice.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await expect(
              deletedNotice,
              "Текст 'Цель была удалена' должен быть виден на странице удалённой цели",
            ).toBeVisible();
          },
        );

        await test.step(
          "Проверить: ссылка 'На главную' видна на странице",
          async () => {
            // Ссылка "На главную" — может быть как кнопка, так и ссылка
            const homeLink = page
              .getByRole("link", { name: "На главную" })
              .or(page.getByRole("button", { name: "На главную" }))
              .first();
            await homeLink.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await expect(
              homeLink,
              "Ссылка 'На главную' должна быть видна на странице удалённой цели",
            ).toBeVisible();
          },
        );

        await test.step(
          "Проверить: ссылка 'На главную' ведёт на корневую страницу",
          async () => {
            const homeLink = page
              .getByRole("link", { name: "На главную" })
              .or(page.getByRole("button", { name: "На главную" }))
              .first();

            // Проверяем href — должен вести на главную (/ или /ru/)
            const href = await homeLink.getAttribute("href").catch(() => null);
            if (href !== null) {
              expect(
                href,
                `Ссылка 'На главную' должна вести на главную страницу. Получено href: "${href}"`,
              ).toMatch(/^(\/|\/ru\/?$|\/ru\/objectives\/?$)/);
            }
            // Если href недоступен (кнопка) — достаточно проверки видимости выше
          },
        );
      },
    );
  },
);
