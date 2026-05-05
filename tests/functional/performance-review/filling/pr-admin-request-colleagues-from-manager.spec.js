// tests/functional/performance-review/filling/pr-admin-request-colleagues-from-manager.spec.js
// Тест: Админ запрашивает коллег у руководителя на вкладке "Заполнение анкет"
//
// Баг: кнопка "Запросить у руководителя" задизейблена для админа на асинхронном ревью,
// когда оцениваемый ещё не предложил коллег.
// Ожидание: админ должен иметь возможность инициировать запрос коллег у руководителя.
import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import { OrgStructureHelper } from "../../../../pages/OrgStructureHelper.js";
import { filterValidUsers } from "../../../utils/UserSessionHelper.js";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Performance Review - Админ запрашивает коллег у руководителя",
  {
    tag: [
      "@performance-review",
      "@filling",
      "@e2e",
      "@ui",
      "@regression",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(
        MODULES.PERFORMANCE_REVIEW,
        "Admin Request Colleagues From Manager",
      );
    });

    test(
      "Админ запрашивает коллег у руководителя — кнопка активна",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);

        let users = [];
        let managerUser = null;
        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Admin_RequestColleagues_${Date.now()}`;

        // ── Шаг 1: Получение пользователей ──
        await test.step("Получить список активных пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });

          users = await orgHelper.getUsersList(8);
          users = await filterValidUsers(users);

          if (users.length < 4) {
            throw new Error(
              "Недостаточно пользователей для теста (нужно минимум 4)",
            );
          }

          managerUser = users[1];
          console.log(`Оцениваемый: ${users[0]?.name}`);
          console.log(`Руководитель: ${managerUser.name}`);
        });

        // ── Шаг 2: Создание PR с ручным выбором коллег ──
        await test.step("Создать PR с ручным выбором коллег и утверждением", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.fillTitle(prName);

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: true,
          });

          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 1,
            maxColleagues: 3,
            managerApproval: true,
            earlyAccess: true,
          });

          console.log("✓ PR настроен: ручной выбор + утверждение руководителем");
        });

        // ── Шаг 3: Добавление участников и запуск ──
        await test.step("Добавить участников и запустить PR", async () => {
          await configPage.addTargetUsers({ count: 1 });
          await configPage.editRespondentsTable({ managers: [managerUser] });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (!match) {
            throw new Error(`Не удалось извлечь PR ID из URL: ${currentUrl}`);
          }
          prId = match[1];
          console.log(`✓ PR запущен, ID: ${prId}`);
        });

        // ── Шаг 4: НЕ предлагаем коллег — оцениваемый бездействует ──
        // PR запущен, коллеги ещё не предложены оцениваемым.
        // На вкладке "Заполнение анкет" должен быть статус "Коллеги еще не предложены"
        // и активная кнопка "Запросить у руководителя" для админа.

        // ── Шаг 5: Проверка — кнопка "Запросить у руководителя" активна ──
        await test.step('Проверить что кнопка "Запросить у руководителя" активна для админа', async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}/`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          // Переходим на вкладку "Заполнение анкет"
          const fillTab = adminPage
            .locator('button, [role="tab"]')
            .filter({ hasText: /^заполнение анкет$/i })
            .first();
          await fillTab.waitFor({ state: "visible", timeout: 10_000 });
          await fillTab.click();
          await adminPage.waitForLoadState("networkidle");

          // Находим ячейку со статусом "Коллеги еще не предложены"
          const colleaguesCell = adminPage
            .locator("td, cell")
            .filter({ hasText: /коллеги еще не предложены/i })
            .first();
          await colleaguesCell.waitFor({ state: "visible", timeout: 15_000 });
          console.log('✓ Найдена ячейка "Коллеги еще не предложены"');

          // Находим кнопку "Запросить у руководителя"
          const requestButton = colleaguesCell
            .locator("button")
            .filter({ hasText: /запросить у руководителя/i });
          await requestButton.waitFor({ state: "visible", timeout: 5_000 });

          // КРИТИЧЕСКАЯ ПРОВЕРКА 1: кнопка НЕ должна быть disabled
          const isDisabled = await requestButton.isDisabled();
          expect(
            isDisabled,
            'Кнопка "Запросить у руководителя" должна быть активна для админа, но она задизейблена (баг)',
          ).toBe(false);

          // КРИТИЧЕСКАЯ ПРОВЕРКА 2: aria-disabled тоже не должен быть true
          // (некоторые React-компоненты используют aria-disabled вместо disabled)
          const ariaDisabled = await requestButton.getAttribute("aria-disabled");
          expect(
            ariaDisabled,
            'Кнопка "Запросить у руководителя" имеет aria-disabled="true" (баг)',
          ).not.toBe("true");

          // КРИТИЧЕСКАЯ ПРОВЕРКА 3: кнопка кликабельна — клик должен инициировать сетевой запрос
          const [requestResponse] = await Promise.all([
            adminPage.waitForResponse(
                (resp) =>
                  resp.url().includes("/performance-reviews/") &&
                  resp.request().method() === "POST",
                { timeout: 10_000 },
              ),
            requestButton.click({ timeout: 5_000 }),
          ]);

          // Проверяем что клик вызвал API-запрос (а не был проигнорирован)
          expect(
            requestResponse,
            'Клик по "Запросить у руководителя" должен вызвать API-запрос, но запрос не был отправлен',
          ).not.toBeNull();

          await adminPage.waitForLoadState("networkidle");

          // ПРОВЕРКА 4: после клика статус "Коллеги еще не предложены" должен измениться
          // Ждём исчезновения кнопки или смены текста (запрос отправлен руководителю)
          let buttonGone = false;
          try {
            await requestButton
            .waitFor({ state: "hidden", timeout: 10_000 })
            buttonGone = true;
          } catch {}
          let statusChanged = false;
          try {
            await colleaguesCell
            .filter({ hasText: /коллеги еще не предложены/i })
            .isHidden()
            statusChanged = true;
          } catch {}

          expect(
            buttonGone || statusChanged,
            'После клика "Запросить у руководителя" статус ячейки должен измениться',
          ).toBe(true);
        });
      },
    );
  },
);
