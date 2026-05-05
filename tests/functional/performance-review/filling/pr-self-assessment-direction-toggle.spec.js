// tests/functional/performance-review/filling/pr-self-assessment-direction-toggle.spec.js
// E2E тесты: Поведение настройки "Показывать самооценку коллегам" при изменении направлений
//
// Тестируемые кейсы:
// Кейс 11: В запущенном PR с showSelfAssessmentToColleagues тогл самооценки disabled
// Кейс 11а: При создании PR - выключение самооценки скрывает настройку showSelfAssessment

import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import { OrgStructureHelper } from "../../../../pages/OrgStructureHelper.js";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Performance Review - Настройка показа самооценки и направления",
  {
    tag: [
      "@performance-review",
      "@filling",
      "@e2e",
      "@self-assessment",
      "@direction-toggle",
      "@regression",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Direction Toggle");
    });

    /**
     * Кейс 11: Тогл самооценки заблокирован при включенной настройке "Показывать самооценку"
     *
     * По новым требованиям:
     * В запущенном PR с включенной настройкой showSelfAssessmentToColleagues
     * отключить самооценку нельзя - тогл не кликабельный (disabled)
     */
    test(
      "C4411: Кейс 11: тогл самооценки заблокирован при showSelfAssessment",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
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
        const prTitle = `Кейс 11 тогл заблокирован ${Date.now()}`;

        // Получение пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(4);

          if (users.length < 2) {
            throw new Error("Недостаточно пользователей для теста");
          }

          managerUser = users[1];
          console.log(`Руководитель: ${managerUser.name}`);
        });

        // Создание PR с показом самооценки
        await test.step("Создать PR с показом самооценки", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.fillTitle(prTitle);
          console.log(`✓ PR название: "${prTitle}"`);

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });

          await configPage.configureColleaguesSelection({
            askEmployees: true,
            earlyAccess: true,
            showSelfAssessmentToColleagues: true, // Ключевая настройка
            managerApproval: false,
          });

          console.log("✓ PR настроен с показом самооценки");
        });

        // Добавление участников и запуск
        await test.step("Добавить участников и запустить", async () => {
          await configPage.addTargetUsers({ count: 1 });
          await configPage.editRespondentsTable({ managers: [managerUser] });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ PR запущен, ID: ${prId}`);
          }
        });

        // ГЛАВНАЯ ПРОВЕРКА: тогл самооценки должен быть заблокирован
        await test.step("Проверить что тогл самооценки ЗАБЛОКИРОВАН (disabled)", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");
          await adminPage.waitForTimeout(2000);

          // Находим заголовок таблицы с направлениями
          const headerRow = adminPage
            .locator("thead tr")
            .filter({
              has: adminPage
                .locator("th, td")
                .filter({ hasText: /самооценка/i }),
            })
            .first();

          // Находим ячейку "Самооценка"
          const selfCell = headerRow
            .locator("th, td")
            .filter({ hasText: "Самооценка" })
            .first();

          // Находим тогл внутри ячейки
          const toggler = selfCell
            .locator('input[class*="Toggler_input"]')
            .first();

          // Проверяем что тогл существует
          await expect(toggler).toBeVisible({ timeout: 10000 });
          console.log("✓ Тогл самооценки найден");

          // Проверяем что тогл включен (checked)
          const isChecked = await toggler.isChecked();
          expect(isChecked).toBe(true);
          console.log("✓ Тогл самооценки включен (checked)");

          // ГЛАВНАЯ ПРОВЕРКА: тогл должен быть disabled
          const isDisabled = await toggler.isDisabled();
          expect(isDisabled).toBe(true);
          console.log(
            "✓ Тогл самооценки ЗАБЛОКИРОВАН (disabled) - ожидаемое поведение",
          );
        });

        console.log(
          "✅ Кейс 11 завершён: тогл самооценки заблокирован при включенной настройке showSelfAssessment",
        );
      },
    );

    /**
     * Кейс 11а: При создании PR выключение самооценки скрывает настройку "Показывать самооценку"
     *
     * По новым требованиям:
     * При создании ревью - при отключении самооценки настройка ожидания самооценки
     * скрывается и отключается если была включена
     */
    test(
      "C3031: Кейс 11а: выключение самооценки скрывает настройку showSelfAssessment при создании",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(300_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const baseUrl = new URL(process.env.BASE_URL).origin;

        await test.step("Открыть форму создания PR", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();
          console.log("✓ Форма создания PR открыта");
        });

        await test.step("Включить направления: самооценка + коллеги", async () => {
          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });
          console.log(
            "✓ Направления включены: самооценка, руководитель, коллеги",
          );
        });

        await test.step("Включить настройку showSelfAssessmentToColleagues", async () => {
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            earlyAccess: true,
            showSelfAssessmentToColleagues: true,
            managerApproval: false,
          });
          console.log('✓ Настройка "Показывать самооценку коллегам" включена');
        });

        await test.step("Проверить что настройка видна", async () => {
          // Локатор настройки "Показывать самооценку коллегам"
          const showSelfAssessmentToggle = adminPage.locator(
            "#way-to-select-colleagues--manual--isAsyncStepsSelfResponseStep",
          );

          await expect(showSelfAssessmentToggle).toBeVisible({ timeout: 5000 });
          const isChecked = await showSelfAssessmentToggle.isChecked();
          expect(isChecked).toBe(true);
          console.log("✓ Настройка видна и включена");
        });

        await test.step("ВЫКЛЮЧИТЬ направление самооценки", async () => {
          await configPage.configureDirections({
            self: false, // ВЫКЛЮЧАЕМ самооценку
            manager: true,
            colleagues: true,
            subordinates: false,
          });
          console.log("✓ Направление самооценки ВЫКЛЮЧЕНО");
        });

        await test.step("Проверить что настройка СКРЫТА", async () => {
          // Даём время на обновление UI
          await adminPage.waitForTimeout(1000);

          // Локатор настройки "Показывать самооценку коллегам"
          const showSelfAssessmentToggle = adminPage.locator(
            "#way-to-select-colleagues--manual--isAsyncStepsSelfResponseStep",
          );

          // Настройка должна быть скрыта
          await expect(showSelfAssessmentToggle).not.toBeVisible({
            timeout: 5000,
          });
          console.log(
            '✓ Настройка "Показывать самооценку коллегам" СКРЫТА после выключения самооценки',
          );
        });

        await test.step("ВКЛЮЧИТЬ направление самооценки обратно и проверить что настройка появляется", async () => {
          await configPage.configureDirections({
            self: true, // ВКЛЮЧАЕМ самооценку обратно
            manager: true,
            colleagues: true,
            subordinates: false,
          });
          console.log("✓ Направление самооценки ВКЛЮЧЕНО обратно");

          await adminPage.waitForTimeout(1000);

          // Локатор настройки "Показывать самооценку коллегам"
          const showSelfAssessmentToggle = adminPage.locator(
            "#way-to-select-colleagues--manual--isAsyncStepsSelfResponseStep",
          );

          // Настройка должна снова появиться
          await expect(showSelfAssessmentToggle).toBeVisible({ timeout: 5000 });
          console.log("✓ Настройка снова видна после включения самооценки");

          // Проверяем что настройка ВЫКЛЮЧЕНА (была сброшена при выключении самооценки)
          const isChecked = await showSelfAssessmentToggle.isChecked();
          expect(isChecked).toBe(false);
          console.log(
            "✓ Настройка ВЫКЛЮЧЕНА (была сброшена при выключении самооценки)",
          );
        });

        console.log(
          "✅ Кейс 11а завершён: выключение самооценки скрывает и сбрасывает настройку showSelfAssessment",
        );
      },
    );
  },
);
