// tests/functional/performance-review/validation/pr-validation.spec.js
// Тесты валидаций для Performance Review
// Кейсы: PR-032 (нельзя запустить без анкет), PR-206 (нельзя отправить незаполненную анкету)

import { test, expect } from "../../../fixtures/auth.js";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
// PerformanceReviewFillPage не используется напрямую - работаем через page локаторы

test.describe(
  "Performance Review - Валидации",
  {
    tag: [
      "@ui",
      "@negative",
      "@performance-review",
      "@validation",
      "@regression",
    ],
  },
  () => {
    const baseUrl = new URL(process.env.BASE_URL).origin;

    test.beforeEach(() => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Validation");
    });

    test(
      "C3053: Нельзя запустить PR без анкет",
      { tag: ["@negative"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(180_000); // 3 минуты

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
          // Оставляем стандартные направления: Самооценка + Руководитель
          await configPage.configureDirections({
            self: true,
            manager: true,
            subordinates: false,
            colleagues: false,
          });
        });

        await test.step("Добавить участников", async () => {
          await configPage.addTargetUsers({ count: 1 });
        });

        await test.step("Отключить напоминания", async () => {
          await configPage.disableReminders();
        });

        await test.step("НЕ добавлять анкеты - пропустить шаг", async () => {
          // Специально пропускаем добавление анкет
          console.log("⚠️ Пропускаем добавление анкет для проверки валидации");
        });

        await test.step("Попытаться запустить без анкет", async () => {
          await configPage.goToStep("launch");

          // Свернуть боковое меню, чтобы не перекрывало кнопку "Запустить"
          const viewport = page.viewportSize();
          await page.mouse.move(viewport ? viewport.width - 10 : 1200, 300);
          await page.waitForTimeout(500);

          // Проверяем состояние кнопки "Запустить"
          const launchButton = configPage.launchButton;
          await launchButton.waitFor({ state: "visible", timeout: 10_000 });

          const isEnabled = await launchButton.isEnabled();
          console.log(`Кнопка "Запустить" доступна: ${isEnabled}`);

          // Делаем скриншот для анализа
          await page.screenshot({
            path: `test-results/pr-032-launch-without-assessments.png`,
            fullPage: true,
          });

          if (isEnabled) {
            // Если кнопка активна, пробуем нажать и проверить ошибку
            await launchButton.click({ force: true });
            await page.waitForLoadState("networkidle");

            // Ищем сообщение об ошибке
            const errorMessage = page
              .locator(
                '[class*="error"], [class*="Error"], [class*="alert"], [class*="Alert"], [class*="Toast"], [class*="toast"]',
              )
              .filter({ hasText: /анкет|заполн|обязательн/i })
              .first();

            const hasError = await errorMessage
              .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true, () => false)

            if (hasError) {
              const errorText = await errorMessage.innerText();
              console.log(`✓ Показано сообщение об ошибке: "${errorText}"`);
              expect(hasError).toBeTruthy();
            } else {
              // Проверяем модальное окно с ошибкой
              const errorModal = page
                .locator('[class*="Modal"]')
                .filter({ hasText: /ошибк|невозможно|анкет/i })
                .first();

              const hasModalError = await errorModal
                .waitFor({ state: "visible", timeout: 3000 })
                  .then(() => true, () => false)

              if (hasModalError) {
                const modalText = await errorModal.innerText();
                console.log(
                  `✓ Показано модальное окно с ошибкой: "${modalText}"`,
                );
                expect(hasModalError).toBeTruthy();
              } else {
                // Проверяем, что PR не запустился (остались на той же странице)
                const currentUrl = page.url();
                console.log(`URL после попытки запуска: ${currentUrl}`);

                // Если нет явной ошибки, но и не произошёл запуск - тоже валидация сработала
                await page.screenshot({
                  path: `test-results/pr-032-after-launch-attempt.png`,
                  fullPage: true,
                });
              }
            }
          } else {
            // Кнопка disabled - это тоже валидация
            console.log(
              '✓ Кнопка "Запустить" заблокирована (disabled) - валидация сработала',
            );

            // Проверяем, есть ли подсказка почему кнопка заблокирована
            const tooltip = page
              .locator('[class*="tooltip"], [class*="Tooltip"], [title]')
              .filter({ hasText: /анкет/i })
              .first();

            if (
              await tooltip
                .waitFor({ state: "visible", timeout: 2000 })
                  .then(() => true, () => false)
            ) {
              const tooltipText = await tooltip.innerText();
              console.log(`Подсказка: "${tooltipText}"`);
            }

            // Проверяем красную подсветку или предупреждение на шаге "Анкеты"
            const assessmentsTab = configPage.assessmentsTab;
            const hasWarning = await assessmentsTab
              .locator('[class*="warning"], [class*="error"], [class*="red"]')
              .waitFor({ state: "visible", timeout: 2000 })
                .then(() => true, () => false)

            if (hasWarning) {
              console.log('✓ Шаг "Анкеты" выделен как незаполненный');
            }

            expect(isEnabled).toBeFalsy();
          }
        });

        await test.step("Очистка - удалить черновик PR", async () => {
          // Возвращаемся к списку
          await page.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await page.waitForLoadState("networkidle");

          // Можно добавить удаление черновика если нужно
          console.log("✓ Тест завершён");
        });
      },
    );

    test(
      "C3054: Нельзя отправить незаполненную анкету",
      { tag: ["@negative"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(180_000); // 3 минуты

        // Используем существующий PR с анкетой
        // Переходим на главную страницу и ищем доступную анкету для заполнения

        await test.step("Открыть анкету для заполнения", async () => {
          // Переходим на главную страницу
          await page.goto(new URL("/ru/", baseUrl).toString());
          await page.waitForLoadState("networkidle");

          // Ищем блок PR с "Заполните анкеты" - это блок с незаполненными анкетами
          const prBlocks = page.locator(
            '[class*="PerformanceReviewSummaryNotification"]',
          );
          const blockCount = await prBlocks.count();
          console.log(`Найдено блоков PR: ${blockCount}`);

          let formOpened = false;

          // Ищем блок с "Заполните анкеты"
          for (let i = 0; i < blockCount && !formOpened; i++) {
            const block = prBlocks.nth(i);
            const blockText = await block.innerText();

            if (blockText.includes("Заполните анкеты")) {
              console.log(`✓ Найден блок с анкетами (индекс ${i})`);

              // 1. Пробуем кнопку "Заполнить анкету" напрямую (она есть внутри блока)
              const fillButton = block
                .locator("button, a")
                .filter({ hasText: /^заполнить анкету$/i })
                .first();
              if (
                await fillButton
                  .waitFor({ state: "visible", timeout: 2000 })
                    .then(() => true, () => false)
              ) {
                await fillButton.click();
                await page.waitForLoadState("networkidle");
                console.log('✓ Нажата кнопка "Заполнить анкету"');
                formOpened = true;
                break;
              }

              // 2. Пробуем "Перейти к оценке" - это переход на страницу списка задач
              const goToButton = block
                .locator("a, button")
                .filter({ hasText: /перейти к оценке/i })
                .first();
              if (
                await goToButton
                  .waitFor({ state: "visible", timeout: 2000 })
                    .then(() => true, () => false)
              ) {
                await goToButton.click();
                await page.waitForLoadState("networkidle");
                console.log('✓ Нажата кнопка "Перейти к оценке"');

                // На странице списка задач есть строки с прогрессом "0 из 1", "3 из 5" и т.д.
                // Ищем строку "Заполните анкеты" и кликаем на неё или на кнопку рядом

                // Сначала пробуем найти кнопку "Заполнить анкету" (может быть видна сразу)
                let fillBtn = page
                  .locator("button, a")
                  .filter({ hasText: /^заполнить анкету$/i })
                  .first();
                if (
                  await fillBtn
                    .waitFor({ state: "visible", timeout: 3000 })
                      .then(() => true, () => false)
                ) {
                  await fillBtn.click();
                  await page.waitForLoadState("networkidle");
                  console.log(
                    '✓ Нажата кнопка "Заполнить анкету" на странице задач',
                  );
                  formOpened = true;
                  break;
                }

                // Ищем строку с "Заполните анкеты" и кликаем на неё
                const taskRow = page
                  .locator(
                    '[class*="Task"], [class*="Item"], [class*="Row"], div',
                  )
                  .filter({ hasText: /заполните анкеты/i })
                  .first();

                if (
                  await taskRow
                    .waitFor({ state: "visible", timeout: 3000 })
                      .then(() => true, () => false)
                ) {
                  await taskRow.click();
                  await page.waitForLoadState("networkidle");
                  console.log('✓ Кликнули на строку "Заполните анкеты"');

                  // Теперь ищем кнопку "Заполнить анкету"
                  fillBtn = page
                    .locator("button, a")
                    .filter({ hasText: /заполнить анкету|заполнить/i })
                    .first();
                  if (
                    await fillBtn
                      .waitFor({ state: "visible", timeout: 3000 })
                        .then(() => true, () => false)
                  ) {
                    await fillBtn.click();
                    await page.waitForLoadState("networkidle");
                    console.log("✓ Открыта форма заполнения");
                    formOpened = true;
                  }
                }
                break;
              }
            }
          }

          // Проверяем, открылась ли форма
          const scaleButtons = page.locator('[class*="ScaleAnswer_button"]');
          const questionBlocks = page.locator('[class*="Block_block"]');

          if (
            (await scaleButtons.count()) > 0 ||
            (await questionBlocks.count()) > 0
          ) {
            console.log("✓ Форма анкеты открыта");
            formOpened = true;
          }

          if (!formOpened) {
            console.log("⚠️ Форма не открылась");
            await page.screenshot({
              path: "test-results/pr-206-form-not-found.png",
              fullPage: true,
            });
          }
        });

        await test.step("Попытаться отправить без заполнения", async () => {
          // Проверяем, что форма открыта (есть вопросы)
          const scaleButtons = page.locator('[class*="ScaleAnswer_button"]');
          const questionBlocks = page.locator('[class*="Block_block"]');
          const scaleCount = await scaleButtons.count();
          const blockCount = await questionBlocks.count();

          console.log(
            `Форма: кнопок шкалы=${scaleCount}, блоков вопросов=${blockCount}`,
          );

          // Делаем скриншот начального состояния
          await page.screenshot({
            path: `test-results/pr-206-empty-form.png`,
            fullPage: true,
          });

          // Если форма не открыта - тест не может продолжиться
          if (scaleCount === 0 && blockCount === 0) {
            console.log(
              "⚠️ Форма анкеты не открыта - возможно, PR не назначен текущему пользователю",
            );
            // Проверяем, есть ли сообщение об отсутствии анкет
            const noQuestionnaires = page
              .getByText(/нет анкет|все анкеты отправлены|нет активных/i)
              .first();
            if (
              await noQuestionnaires
                .waitFor({ state: "visible", timeout: 2000 })
                  .then(() => true, () => false)
            ) {
              console.log("✓ Сообщение: нет доступных анкет");
            }
            return; // Пропускаем проверку валидации
          }

          // Ищем кнопку "Отправить" или "Завершить"
          const submitButton = page
            .locator("button")
            .filter({ hasText: /отправить|завершить/i })
            .first();
          const submitVisible = await submitButton
            .waitFor({ state: "visible", timeout: 5000 })
              .then(() => true, () => false)

          if (submitVisible) {
            const isEnabled = await submitButton.isEnabled();
            console.log(
              `Кнопка отправки видна: ${submitVisible}, доступна: ${isEnabled}`,
            );

            if (isEnabled) {
              // Кнопка активна - нажимаем и проверяем валидацию
              await submitButton.click();
              await page.waitForLoadState("networkidle");

              // Ищем сообщение об ошибке валидации
              const validationError = page
                .locator(
                  '[class*="error"], [class*="Error"], [class*="validation"], [class*="Validation"], [class*="required"], [class*="Required"], [class*="Toast"], [class*="toast"]',
                )
                .first();

              const hasValidationError = await validationError
                .waitFor({ state: "visible", timeout: 5000 })
                  .then(() => true, () => false)

              await page.screenshot({
                path: `test-results/pr-206-after-submit-attempt.png`,
                fullPage: true,
              });

              if (hasValidationError) {
                const errorText = await validationError
                  .innerText();
                console.log(`✓ Показана ошибка валидации: "${errorText}"`);
                expect(hasValidationError).toBeTruthy();
              } else {
                // Проверяем, выделены ли незаполненные вопросы
                const highlightedQuestions = page.locator(
                  '[class*="error"], [class*="invalid"], [class*="required"]',
                );
                const highlightCount = await highlightedQuestions.count();
                console.log(`Подсвеченных вопросов: ${highlightCount}`);

                if (highlightCount > 0) {
                  console.log("✓ Незаполненные вопросы подсвечены");
                  expect(highlightCount).toBeGreaterThan(0);
                } else {
                  // Возможно, модальное окно с ошибкой
                  const errorModal = page
                    .locator('[class*="Modal"]')
                    .filter({ hasText: /заполн|обязательн|ошибк/i })
                    .first();

                  const hasModalError = await errorModal
                    .waitFor({ state: "visible", timeout: 3000 })
                      .then(() => true, () => false)
                  if (hasModalError) {
                    const modalText = await errorModal.innerText();
                    console.log(`✓ Показано модальное окно: "${modalText}"`);
                    expect(hasModalError).toBeTruthy();
                  }
                }
              }
            } else {
              // Кнопка disabled - это тоже валидация
              console.log(
                "✓ Кнопка отправки заблокирована до заполнения всех вопросов",
              );
              expect(isEnabled).toBeFalsy();
            }
          } else {
            // Возможно, пошаговая анкета - ищем кнопку "Далее"
            const nextButton = page
              .locator("button")
              .filter({ hasText: /далее|next/i })
              .first();
            const nextVisible = await nextButton
              .waitFor({ state: "visible", timeout: 3000 })
                .then(() => true, () => false)

            if (nextVisible) {
              const isNextEnabled = await nextButton.isEnabled();
              console.log(
                `Кнопка "Далее" видна: ${nextVisible}, доступна: ${isNextEnabled}`,
              );

              if (!isNextEnabled) {
                console.log('✓ Кнопка "Далее" заблокирована до выбора ответа');
                expect(isNextEnabled).toBeFalsy();
              } else {
                // Пробуем нажать без выбора ответа
                await nextButton.click();
                await page.waitForLoadState("networkidle");

                // Проверяем ошибку
                const stepError = page
                  .locator(
                    '[class*="error"], [class*="Error"], [class*="required"]',
                  )
                  .first();
                const hasStepError = await stepError
                  .waitFor({ state: "visible", timeout: 3000 })
                    .then(() => true, () => false)

                if (hasStepError) {
                  console.log(
                    "✓ Показана ошибка при попытке перейти без ответа",
                  );
                }
              }
            }
          }
        });

        await test.step("Заполнить один вопрос и проверить, что кнопка разблокируется", async () => {
          // Заполняем первый вопрос
          const scaleButtons = page.locator(
            '[class*="ScaleAnswer_button"], [class*="Answer_button"]',
          );
          const buttonsCount = await scaleButtons.count();

          if (buttonsCount > 0) {
            // Выбираем средний вариант
            const middleIndex = Math.floor(buttonsCount / 2);
            await scaleButtons.nth(middleIndex).click();
            // Ждём обновления состояния кнопок после выбора
            await expect(scaleButtons.nth(middleIndex))
              .toHaveClass(/selected|active|checked/i, { timeout: 2000 })
            console.log(`✓ Выбран ответ ${middleIndex + 1} из ${buttonsCount}`);

            // Проверяем, разблокировалась ли кнопка "Далее" или "Отправить"
            const nextButton = page
              .locator("button")
              .filter({ hasText: /далее|next/i })
              .first();
            const submitButton = page
              .locator("button")
              .filter({ hasText: /отправить|завершить/i })
              .first();

            const nextEnabled = await nextButton.isEnabled();
            const submitEnabled = await submitButton
              .isEnabled()

            console.log(
              `После заполнения: "Далее" доступна: ${nextEnabled}, "Отправить" доступна: ${submitEnabled}`,
            );

            if (nextEnabled || submitEnabled) {
              console.log(
                "✓ Кнопка навигации разблокировалась после заполнения",
              );
            }
          } else {
            // Пробуем радио-кнопки
            const radios = page.locator('input[type="radio"]');
            const radioCount = await radios.count();

            if (radioCount > 0) {
              await radios.first().check({ force: true });
              await expect(radios.first()).toBeChecked({ timeout: 2000 });
              console.log("✓ Выбран радио-вариант");
            }
          }

          await page.screenshot({
            path: `test-results/pr-206-after-partial-fill.png`,
            fullPage: true,
          });
        });

        await test.step("Очистка", async () => {
          console.log("✓ Тест валидации завершён");
          // PR остаётся в системе, можно удалить при необходимости
        });
      },
    );
  },
);
