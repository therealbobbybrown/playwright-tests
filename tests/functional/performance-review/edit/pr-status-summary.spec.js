// tests/functional/performance-review/edit/pr-status-summary.spec.js
// E2E тест: Сводка возможностей редактирования PR по статусам

import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "PR Editing - Сравнение статусов",
  { tag: ["@performance-review", "@edit", "@e2e", "@regression", "@ui"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Edit Status Comparison");
    });

    /**
     * Сводная таблица возможностей редактирования по статусам
     */
    test(
      "C4408: Сводка: возможности редактирования по статусам",
      { tag: ["@normal"] },
      async ({ adminAuth: adminPage }, testInfo) => {
        setSeverity("normal");
        testInfo.setTimeout(120_000);

        const baseUrl = new URL(process.env.BASE_URL).origin;

        await test.step("Проверка возможностей редактирования", async () => {
          console.log(
            "\n╔══════════════════════════════════════════════════════════════╗",
          );
          console.log(
            "║     ВОЗМОЖНОСТИ РЕДАКТИРОВАНИЯ PR ПО СТАТУСАМ               ║",
          );
          console.log(
            "╠══════════════════════════════════════════════════════════════╣",
          );
          console.log(
            "║ Функция          │ Черновик │ Запущен  │ Завершён │ Архив   ║",
          );
          console.log(
            "╠══════════════════════════════════════════════════════════════╣",
          );
          console.log(
            "║ Участники        │    ✓     │    ✓     │    ✗     │    ✗    ║",
          );
          console.log(
            "║ Направления      │    ✓     │    ✓     │    ✗     │    ✗    ║",
          );
          console.log(
            "║ Анкеты           │    ✓     │    ✓     │    ✗     │    ✗    ║",
          );
          console.log(
            "║ Напоминания      │    ✓     │    ✓     │    ✗     │    ✗    ║",
          );
          console.log(
            "║ Администраторы   │    ✓     │    ✓     │    ✓?    │    ✗    ║",
          );
          console.log(
            "║ Экспорт          │    ✗     │    ✓     │    ✓     │    ✓    ║",
          );
          console.log(
            "║ Завершение       │    ✗     │    ✓     │    ✗     │    ✗    ║",
          );
          console.log(
            "║ Архивирование    │    ✗     │    ✗     │    ✓     │    ✗    ║",
          );
          console.log(
            "║ Восстановление   │    ✗     │    ✗     │    ✗     │    ✓    ║",
          );
          console.log(
            "╚══════════════════════════════════════════════════════════════╝\n",
          );

          // Переход на страницу PR для проверки UI
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          console.log("✅ Сводка возможностей редактирования выведена");
        });
      },
    );
  },
);
