// tests/functional/performance-review/filling/_explore-fill-questionnaire.spec.js
// Исследование UI заполнения анкет Performance Review
import { test } from "../../../fixtures/auth.js";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";

test.describe("Exploration - заполнение анкет Performance Review @performance-review @explore", () => {
  test("создать PR и исследовать UI заполнения анкеты", async ({
    adminAuth: page,
  }, testInfo) => {
    test.slow();
    testInfo.setTimeout(300_000);

    const listPage = new PerformanceReviewsListPage(page, testInfo);
    const configPage = new PerformanceReviewConfigPage(page, testInfo);

    let prId = null;

    await test.step("Создать и запустить Performance Review", async () => {
      const baseUrl = process.env.BASE_URL;
      await page.goto(
        new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
      );
      await listPage.assertOpened();

      await listPage.openCreateModal();
      await listPage.performanceReviewType.click();
      await configPage.assertOpened();

      // Настроить направления (включим только самооценку для простоты)
      await configPage.configureDirections({
        self: true,
        manager: false,
        colleagues: false,
        subordinates: false,
      });

      await configPage.quickSetupAndLaunch({ targetUsersCount: 1 });

      // Получить ID созданной оценки из URL
      const currentUrl = page.url();
      const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
      if (match) {
        prId = match[1];
        console.log(`✓ Создана Performance Review ID: ${prId}`);
      }
    });

    await test.step("Найти и открыть анкету для заполнения", async () => {
      const baseUrl = process.env.BASE_URL;

      // Перейти на главную страницу
      await page.goto(new URL("/ru/", baseUrl).toString());
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: "test-results/explore-main-page.png",
        fullPage: true,
      });
      console.log("📸 Скриншот: explore-main-page.png");

      // Попробуем кликнуть на колокольчик уведомлений
      const bellIcon = page
        .locator('[class*="bell"], [class*="notification"]')
        .first();

      if (
        await bellIcon
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false)
      ) {
        console.log("✓ Найден колокольчик уведомлений");
        await bellIcon.click();
        await page.waitForTimeout(2000);

        await page.screenshot({
          path: "test-results/explore-notifications.png",
          fullPage: true,
        });
        console.log("📸 Скриншот: explore-notifications.png");

        // Попробуем найти уведомление о Performance Review
        const prNotification = page
          .locator('[class*="notification"], [class*="card"]')
          .filter({ hasText: /Performance Review|оценка/i })
          .first();

        if (
          await prNotification
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          console.log("✓ Найдено уведомление о Performance Review");

          // Найти ссылку "Перейти к оценке" на странице
          const goToLink = page
            .locator("a")
            .filter({ hasText: "Перейти к оценке" })
            .first();

          if (
            await goToLink
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false)
          ) {
            console.log('✓ Найдена ссылка "Перейти к оценке"');
            await goToLink.click();

            // Дождаться закрытия модального окна со списком дел
            const modalPanel = page
              .locator('[class*="Panel"], [class*="Drawer"]')
              .filter({ hasText: "Список дел" })
              .first();
            await modalPanel
              .waitFor({ state: "hidden", timeout: 10_000 })
              .catch(() => {});
            await page.waitForTimeout(2000);

            await page.screenshot({
              path: "test-results/explore-pr-overview.png",
              fullPage: true,
            });
            console.log("📸 Скриншот: explore-pr-overview.png");

            // Теперь ищем кнопку "Заполнить анкету"
            const fillButton = page
              .locator("button")
              .filter({ hasText: "Заполнить анкету" })
              .first();

            if (
              await fillButton
                .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true)
                .catch(() => false)
            ) {
              console.log('✓ Найдена кнопка "Заполнить анкету"');
              await fillButton.click();
              await page.waitForTimeout(3000);

              await page.screenshot({
                path: "test-results/explore-fill-opened.png",
                fullPage: true,
              });
              console.log("📸 Скриншот: explore-fill-opened.png");
            } else {
              console.log('⚠️ Кнопка "Заполнить анкету" не найдена');
            }
          } else {
            console.log('⚠️ Ссылка "Перейти к оценке" не найдена');
          }
        } else {
          console.log("⚠️ Уведомление о Performance Review не найдено");

          // Посмотрим, что есть в уведомлениях
          const notifications = await page
            .locator('[class*="notification"], [class*="item"]')
            .allInnerTexts();
          console.log("Уведомления:", notifications.slice(0, 10));
        }
      } else {
        console.log("⚠️ Колокольчик уведомлений не найден");

        // Попробуем найти виджет или карточку с Performance Review на главной
        const prWidget = page
          .locator('[class*="widget"], [class*="card"]')
          .filter({ hasText: /Performance Review|оценка/i })
          .first();

        if (
          await prWidget
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          console.log("✓ Найден виджет Performance Review на главной");
          await prWidget.click();
          await page.waitForTimeout(3000);

          await page.screenshot({
            path: "test-results/explore-fill-opened.png",
            fullPage: true,
          });
          console.log("📸 Скриншот: explore-fill-opened.png");
        }
      }
    });

    await test.step("Исследовать HTML структуру формы заполнения", async () => {
      // Попробуем найти элементы формы анкеты
      const formElements = await page
        .locator('form, [class*="Form"], [class*="Question"]')
        .all();
      console.log(`Найдено элементов формы: ${formElements.length}`);

      // Найти кнопки
      const buttons = await page.locator("button").allInnerTexts();
      console.log("Кнопки на странице:", buttons);

      // Найти заголовки
      const headings = await page.locator("h1, h2, h3").allInnerTexts();
      console.log("Заголовки:", headings);
    });
  });
});
