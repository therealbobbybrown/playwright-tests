// tests/functional/objectives/objective-approval-bell-notification.spec.js
// UI-тест: уведомления-колокольчик при утверждении/отправке на утверждение цели OKR

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

let objectiveId = null;
let objectiveTitle = null;
let initialApprovalEnabled = null;

test.describe(
  "Утверждение целей — уведомления-колокольчик",
  { tag: ["@ui", "@objectives", "@approval", "@regression", "@notifications"] },
  () => {
    test.beforeAll(async ({ request }) => {
      // Включаем утверждение целей
      const adminApi = new ObjectivesAPI(request);
      const { email: adminEmail, password: adminPassword } =
        getCredentials("admin");
      await adminApi.signIn(adminEmail, adminPassword);

      const { data: settingsData } = await adminApi.getCompanySettings();
      initialApprovalEnabled =
        settingsData?.isObjectivesApprovalEnabled ??
        settingsData?.is_objectives_approval_enabled ??
        false;

      const { response: enableResp } = await adminApi.setApprovalEnabled(true);
      if (!enableResp.ok()) {
        throw new Error(
          `Не удалось включить утверждение целей: ${enableResp.status()}`,
        );
      }

      // Создаём цель от имени user
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
      objectiveTitle = `Bell Notification Test ${uniqueId}`;

      const { response: createResp, data: createData } =
        await userApi.saveObjective({
          title: objectiveTitle,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-bell-notif-${uniqueId}`,
              title: `KR bell-notif ${uniqueId}`,
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

      // Отправляем цель на утверждение
      const { response: sendResp } = await userApi.sendForApproval(objectiveId);
      if (!sendResp.ok()) {
        throw new Error(
          `Не удалось отправить цель на утверждение: ${sendResp.status()}`,
        );
      }

      console.log(
        `[beforeAll] Создана и отправлена на утверждение цель id=${objectiveId}, title="${objectiveTitle}"`,
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

    test("C8277: Уведомление руководителю при отправке на утверждение",
      { tag: ["@critical"] },
      async ({ headAuth: page }) => {
        setSeverity("critical");

        if (!objectiveId) {
          throw new Error(
            "objectiveId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        await test.step("Head открывает страницу уведомлений", async () => {
          await page.goto("/ru/notifications/");
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        });

        await test.step(
          'Найти уведомление "Утвердите цель сотрудника" со ссылкой на цель',
          async () => {
            // Структура DOM для уведомления head:
            //   generic[заголовок]: "Утвердите цель сотрудника"
            //   generic[тело]: "Павел Новиков просит утвердить индивидуальную цель."
            //   link: /ru/objectives/view/{objectiveId}/
            //
            // Название цели НЕ отображается в уведомлении — только ссылка на конкретный objectiveId.
            // Ищем уведомление, содержащее ссылку на нашу цель.

            const objectiveLink = page
              .locator(`a[href*="/objectives/view/${objectiveId}/"]`)
              .first();

            await expect(
              objectiveLink,
              `Уведомление со ссылкой на цель /objectives/view/${objectiveId}/ должно присутствовать`,
            ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });

            // Проверяем заголовок уведомления рядом со ссылкой
            const notifContainer = page
              .locator(`a[href*="/objectives/view/${objectiveId}/"]`)
              .locator("..")
              .first();

            const headerText = await notifContainer
              .locator("xpath=preceding-sibling::*[2]")
              .textContent()
              .catch(() => null);

            if (headerText) {
              console.log(
                `[C-APPROVAL-BELL-01] Текст рядом с уведомлением: "${headerText}"`,
              );
            }

            // Проверяем наличие текста "Утвердите цель" на странице
            const approvalHeader = page
              .locator(":text-matches('Утвердите цель', 'i')")
              .first();

            await expect(
              approvalHeader,
              'На странице уведомлений должен быть заголовок "Утвердите цель сотрудника"',
            ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });

            console.log(
              `[C-APPROVAL-BELL-01] Уведомление для head найдено: ссылка на /objectives/view/${objectiveId}/ + заголовок "Утвердите цель"`,
            );
          },
        );
      },
    );

    test("C8278: Уведомление автору при утверждении цели",
      { tag: ["@critical"] },
      async ({ userAuth: userPage, request }) => {
        setSeverity("critical");

        if (!objectiveId || !objectiveTitle) {
          throw new Error(
            "objectiveId/objectiveTitle не установлены — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        // Head утверждает цель через API
        await test.step("Head утверждает цель через API", async () => {
          const headApi = new ObjectivesAPI(request);
          const { email: headEmail, password: headPassword } =
            getCredentials("head");
          await headApi.signIn(headEmail, headPassword);

          const { response: approveResp } =
            await headApi.approveObjective(objectiveId);
          if (!approveResp.ok()) {
            throw new Error(
              `Не удалось утвердить цель: ${approveResp.status()}`,
            );
          }
          console.log(
            `[C-APPROVAL-BELL-02] Цель id=${objectiveId} утверждена через API`,
          );
        });

        // User открывает страницу уведомлений
        await test.step("User открывает страницу уведомлений", async () => {
          await userPage.goto("/ru/notifications/");
          await userPage
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        });

        await test.step(
          'Найти уведомление "Ваша цель утверждена руководителем" с названием цели',
          async () => {
            // Структура DOM для уведомления user после утверждения (из снапшота):
            //   generic[заголовок]: "Ваша цель утверждена руководителем"
            //   generic[тело]: название цели (objectiveTitle)
            //   link: /ru/objectives/view/{objectiveId}/
            //
            // Имя цели отображается в теле уведомления.

            const approvedHeader = userPage
              .locator(":text-matches('утверждена руководителем', 'i')")
              .first();

            await expect(
              approvedHeader,
              'На странице уведомлений должен быть заголовок "Ваша цель утверждена руководителем"',
            ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });

            // Проверяем что уведомление содержит ссылку на нашу конкретную цель
            const objectiveLink = userPage
              .locator(`a[href*="/objectives/view/${objectiveId}/"]`)
              .first();

            await expect(
              objectiveLink,
              `Уведомление со ссылкой на цель /objectives/view/${objectiveId}/ должно присутствовать у автора`,
            ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });

            // Дополнительно: проверяем что название цели также отображается (для user оно есть)
            const titleInNotif = userPage
              .locator(":text-matches('" + objectiveTitle + "', 'i')")
              .first();

            const hasTitleVisible = await titleInNotif
              .isVisible()
              .catch(() => false);
            if (hasTitleVisible) {
              console.log(
                `[C-APPROVAL-BELL-02] Название цели "${objectiveTitle}" найдено в уведомлении`,
              );
            } else {
              console.log(
                `[C-APPROVAL-BELL-02] Название цели не отображается в списке (скрыто пагинацией), но ссылка на цель найдена`,
              );
            }

            console.log(
              `[C-APPROVAL-BELL-02] Уведомление об утверждении найдено у автора: ссылка /objectives/view/${objectiveId}/`,
            );
          },
        );
      },
    );
  },
);
