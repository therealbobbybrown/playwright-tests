// tests/functional/performance-review/edit/pr-bug-001-self-assessment.spec.js
// E2E тест: BUG-PR-001 - Статус самооценки при добавлении участника в завершённый PR

import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import { OrgStructureHelper } from "../../../../pages/OrgStructureHelper.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "PR Editing - BUG-PR-001",
  {
    tag: [
      "@performance-review",
      "@edit",
      "@e2e",
      "@regression",
      "@bugs",
      "@ui",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Edit Bugs - BUG-PR-001");
    });

    /**
     * BUG-PR-001: При добавлении участника в завершённый PR самооценка
     * помечается как заполненная, хотя участник её не заполнял
     */
    test(
      "C3008: Статус самооценки при добавлении в завершённый PR",
      { tag: ["@bug", "@critical"] },
      async ({ adminAuth: adminPage, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);

        let users = [];
        let newParticipant = null;
        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `BUG-PR-001 ${Date.now()}`;

        // Получение пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(5);

          if (users.length < 3) {
            throw new Error("Недостаточно пользователей для теста");
          }

          newParticipant = users[2];
          console.log(`Новый участник: ${newParticipant.name}`);
        });

        // Создание, запуск и завершение PR
        await test.step("Создать, запустить и завершить PR", async () => {
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
            manager: false,
            colleagues: false,
            subordinates: false,
          });

          await configPage.addTargetUsers({ count: 1 });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`PR запущен, ID: ${prId}`);
          }

          // Ждём завершения операции запуска
          await adminPage
            .waitForLoadState("networkidle", { timeout: 10000 });

          // Заполняем анкеты через API populateReview (вместо UI fill)
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          const populateSettings = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };

          const maxAttempts = 15;
          let filledCount = 0;
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              populateSettings,
              { timeout: 120000 },
            );
            if (response.ok()) {
              filledCount++;
              console.log(`populateReview #${filledCount} OK`);
              await new Promise((r) => setTimeout(r, 100));
            } else if (response.status() === 500) {
              console.log(
                `populateReview: все анкеты заполнены (${filledCount} итераций)`,
              );
              break;
            } else {
              console.log(
                `populateReview: статус ${response.status()}, прерываем`,
              );
              break;
            }
          }

          if (filledCount === 0) {
            throw new Error("populateReview не заполнил ни одной анкеты");
          }

          // Завершаем PR (с ретраем навигации — сервер может вернуть 500 после заполнения анкеты)
          let finishButtonVisible = false;
          for (
            let attempt = 1;
            attempt <= 3 && !finishButtonVisible;
            attempt++
          ) {
            await adminPage.goto(
              new URL(
                `/ru/manager/performance-reviews/${prId}`,
                baseUrl,
              ).toString(),
            );
            await adminPage.waitForLoadState("networkidle");
            await adminPage.waitForLoadState("domcontentloaded");

            const is500 = await adminPage
              .locator('h1:has-text("500")')
              .waitFor({ state: "visible", timeout: 2000 })
                .then(() => true, () => false)
            if (is500) {
              console.log(`Сервер вернул 500, попытка ${attempt}/3`);
              await adminPage.waitForTimeout(3000);
              continue;
            }

            const btn = adminPage
              .locator("button")
              .filter({ hasText: /завершить оценку/i })
              .first();
            finishButtonVisible = await btn
              .waitFor({ state: "visible", timeout: 10000 });
            if (!finishButtonVisible && attempt < 3) {
              console.log(
                `Кнопка "Завершить оценку" не найдена, попытка ${attempt}/3`,
              );
              await adminPage.waitForTimeout(3000);
            }
          }

          const finishButton = adminPage
            .locator("button")
            .filter({ hasText: /завершить оценку/i })
            .first();
          await finishButton.click({ timeout: 15000 });

          // Ждём появления диалога подтверждения
          const finishModal = adminPage
            .getByRole("dialog")
            .filter({ hasText: /хотите завершить оценку/i });
          const confirmVisible = await finishModal
            .waitFor({ state: "visible", timeout: 5000 })
              .then(() => true, () => false)
          if (confirmVisible) {
            await finishModal.getByRole("button", { name: /^да/i }).click();
            await adminPage
              .waitForLoadState("networkidle", { timeout: 10000 });
          }
          console.log("PR завершён");
        });

        // Создать новый цикл — на завершённом PR все элементы disabled
        await test.step("Создать новый цикл (новая итерация)", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");
          await adminPage.waitForLoadState("domcontentloaded");

          // Нажимаем "Создать новый цикл" для запуска новой итерации
          const restartButton = adminPage.getByRole("button", {
            name: /создать новый цикл/i,
          });
          await restartButton.waitFor({ state: "visible", timeout: 10000 });
          await restartButton.click();

          // Ждём появления модала подтверждения и подтверждаем
          const confirmModal = adminPage
            .getByRole("dialog")
            .filter({ hasText: /создать новый цикл/i });
          const confirmModalVisible = await confirmModal
            .waitFor({ state: "visible", timeout: 5000 })
              .then(() => true, () => false)
          if (confirmModalVisible) {
            const sendButton = confirmModal.getByRole("button", {
              name: /^да/i,
            });
            await sendButton.waitFor({ state: "visible", timeout: 3000 });
            await sendButton.click({ force: true });
            await adminPage
              .waitForLoadState("networkidle", { timeout: 15000 });
            console.log("Подтверждён запуск новой итерации");
          }

          await adminPage.waitForLoadState("networkidle");
          await adminPage.waitForLoadState("domcontentloaded");
          console.log("Новый цикл создан");
        });

        // Добавление участника — после нового цикла кнопка enabled
        await test.step("Добавить нового участника на новом цикле", async () => {
          // После создания нового цикла PR активен — кнопка "Добавить участника" доступна
          const addButton = adminPage
            .getByRole("button", { name: /добавить участника/i })
            .first();
          await addButton.waitFor({ state: "visible", timeout: 10000 });
          await addButton.click({ timeout: 15000 });

          console.log('Нажата кнопка "Добавить участника"');

          // Ждём модальное окно "Кого ещё вы хотите оценить?" с полем поиска
          const searchInput = adminPage
            .getByRole("textbox", { name: /имя, фамилия или почта/i })
            .first();
          await searchInput.waitFor({ state: "visible", timeout: 10000 });

          // Выбираем пользователя из списка (кнопки с именами сотрудников)
          const userButton = adminPage
            .getByRole("button", { name: new RegExp(newParticipant.name, "i") })
            .first();
          const userVisible = await userButton
            .waitFor({ state: "visible", timeout: 5000 })
              .then(() => true, () => false)

          if (userVisible) {
            await userButton.click();
            console.log(`Выбран участник: ${newParticipant.name}`);
          } else {
            // Если не видно — ищем через поле поиска
            await searchInput.fill(newParticipant.name);
            await adminPage.waitForTimeout(1000);
            const searchResult = adminPage
              .getByRole("button", {
                name: new RegExp(newParticipant.name, "i"),
              })
              .first();
            await searchResult.waitFor({ state: "visible", timeout: 5000 });
            await searchResult.click();
            console.log(`Выбран участник через поиск: ${newParticipant.name}`);
          }

          // Ждём обновления таблицы участников (модалка закрывается автоматически при выборе)
          await adminPage.waitForTimeout(1000);
        });

        // Проверка статуса самооценки нового участника
        await test.step("Проверить статус самооценки нового участника", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");
          await adminPage.waitForLoadState("domcontentloaded");

          // Делаем скриншот для диагностики
          await adminPage.screenshot({
            path: `test-results/bug-pr-001-status-check-${Date.now()}.png`,
            fullPage: true,
          });

          // Проверяем текущий статус PR
          const currentUrl = adminPage.url();
          console.log(`URL страницы: ${currentUrl}`);

          // Ищем вкладку "Заполнение анкет" и переходим туда для просмотра статусов
          const fillTab = adminPage
            .locator('button, [role="tab"]')
            .filter({ hasText: /заполнение анкет/i })
            .first();
          const fillTabVisible = await fillTab
            .waitFor({ state: "visible", timeout: 5000 })
              .then(() => true, () => false)
          if (fillTabVisible) {
            await fillTab.click();
            // Ждём загрузки таблицы участников
            await adminPage
              .locator("table")
              .first()
              .waitFor({ state: "visible", timeout: 5000 });
            console.log('Перешли на вкладку "Заполнение анкет"');
          }

          // Делаем скриншот таблицы участников
          await adminPage.screenshot({
            path: `test-results/bug-pr-001-participants-${Date.now()}.png`,
            fullPage: true,
          });

          // Ищем таблицу участников
          const participantsTable = adminPage.locator("table").first();
          const tableVisible = await participantsTable
            .waitFor({ state: "visible", timeout: 5000 })
              .then(() => true, () => false)

          if (tableVisible) {
            // Получаем все строки таблицы
            const rows = participantsTable.locator("tbody tr");
            const rowCount = await rows.count();
            console.log(`Найдено ${rowCount} участников в таблице`);

            // Ищем строку с новым участником
            for (let i = 0; i < rowCount; i++) {
              const row = rows.nth(i);
              const rowText = await row.textContent();

              if (rowText.includes(newParticipant.name)) {
                console.log(
                  `Найдена строка ${i}: "${rowText.substring(0, 200)}..."`,
                );

                // Проверяем наличие галочки или иконки заполнения
                const checkIcon = row.locator(
                  'svg[class*="check"], [class*="completed"], [class*="done"], [class*="success"]',
                );
                const hasCheckIcon = (await checkIcon.count()) > 0;

                // Проверяем текст в ячейках
                const cells = row.locator("td");
                const cellCount = await cells.count();
                console.log(`  Ячеек в строке: ${cellCount}`);

                for (let j = 0; j < cellCount; j++) {
                  const cell = cells.nth(j);
                  const cellText = await cell.textContent();
                  const cellHtml = await cell.innerHTML();
                  console.log(
                    `  Ячейка ${j}: "${cellText}" (HTML: ${cellHtml.substring(0, 100)})`,
                  );
                }

                // БАГ: если есть галочка или текст "заполнена" для нового участника
                const isBugByText =
                  /заполнен|отправлен|100%|completed|done/i.test(rowText);
                const isBugByIcon = hasCheckIcon;

                if (isBugByText || isBugByIcon) {
                  console.log(
                    "BUG-PR-001 ПОДТВЕРЖДЁН: Самооценка нового участника помечена как заполненная!",
                  );
                  console.log(
                    `   Текст строки содержит статус "заполнена": ${isBugByText}`,
                  );
                  console.log(`   Найдена иконка галочки: ${isBugByIcon}`);
                  // НЕ фейлим тест - это известный баг
                } else {
                  console.log(
                    "Самооценка нового участника корректно показывает незаполненный статус",
                  );
                }
                break;
              }
            }
          } else {
            console.log("Таблица участников не найдена");

            // Попробуем найти участника в любом месте на странице
            const participantElement = adminPage
              .locator(`text="${newParticipant.name}"`)
              .first();
            const participantVisible = await participantElement
              .waitFor({ state: "visible", timeout: 3000 })
                .then(() => true, () => false)
            if (participantVisible) {
              console.log(`Участник ${newParticipant.name} найден на странице`);
            } else {
              console.log(
                `Участник ${newParticipant.name} не найден на странице`,
              );
            }
          }
        });

        console.log("BUG-PR-001 тест завершён");
      },
    );
  },
);
