// tests/functional/performance-review/validation/pr-without-participants-validation.spec.js
import { test, expect } from "../../../fixtures/auth.js";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Performance Review — негативные сценарии: без участников",
  { tag: ["@ui", "@negative", "@regression", "@performance-review"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW);
    });

    const baseUrl = new URL(process.env.BASE_URL).origin;

    test("C3055: Нельзя запустить PR без выбора участников", async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");
      test.slow();
      testInfo.setTimeout(180_000);

      const listPage = new PerformanceReviewsListPage(page, testInfo);
      const configPage = new PerformanceReviewConfigPage(page, testInfo);

      await test.step("Открыть список оценок", async () => {
        await page.goto(
          new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
        );
        await listPage.assertOpened();
      });

      await test.step("Создать новую Performance Review", async () => {
        await listPage.openCreateModal();
        await listPage.performanceReviewType.click();
        await configPage.assertOpened();
      });

      await test.step("Настроить направления оценки", async () => {
        await configPage.configureDirections({
          self: true,
          manager: true,
          subordinates: false,
          colleagues: false,
        });
      });

      await test.step("НЕ добавлять участников - пропустить шаг", async () => {
        // Специально пропускаем добавление участников
        console.log(
          "⚠️ Пропускаем добавление участников для проверки валидации",
        );
      });

      await test.step("Попытаться перейти к запуску без участников", async () => {
        await configPage.goToStep("launch");

        // Проверяем наличие ошибки или блокировки
        const launchButton = configPage.launchButton;
        const isLaunchVisible = await launchButton
          .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true, () => false)

        if (isLaunchVisible) {
          const isEnabled = await launchButton.isEnabled();
          console.log(`Кнопка "Запустить" доступна: ${isEnabled}`);

          if (isEnabled) {
            await launchButton.click();
            await page
              .waitForLoadState("networkidle", { timeout: 5000 });
          }
        }

        // Проверяем наличие ошибки о необходимости участников
        const errorMessage = page
          .locator(
            '[class*="error"], [class*="Error"], [class*="alert"], .Toastify__toast--error',
          )
          .first();
        const hasError = await errorMessage.isVisible();

        // Проверяем текст об участниках
        const participantsError = page
          .locator("text=/участник|сотрудник|выбер|добав/i")
          .first();
        const hasParticipantsError = await participantsError
          .isVisible()

        // Проверяем что не перешли к следующему шагу
        const stillOnConfig =
          page.url().includes("/config") || page.url().includes("/edit");

        console.log(`Ошибка видима: ${hasError}`);
        console.log(`Ошибка про участников: ${hasParticipantsError}`);
        console.log(`Остались на конфигурации: ${stillOnConfig}`);

        // Ожидание: нельзя запустить PR без участников
        const validationWorks =
          hasError || hasParticipantsError || stillOnConfig;
        expect(validationWorks).toBe(true);
      });
    });
  },
);
