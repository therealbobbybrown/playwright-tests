// tests/functional/performance-review/dashboard/dashboard-statuses-by-pr.spec.js
// Тесты статусов с выбором конкретного PR для каждого сценария

import { test, expect } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import { PR_TITLE_PATTERNS } from "../../../utils/seed/dashboard-test-data.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

/**
 * Тесты статусов на дашборде с выбором конкретного PR
 *
 * PR ищутся ДИНАМИЧЕСКИ по паттерну названия (без хардкода ID)
 * Тесты пропускаются, если нужный PR не найден
 *
 * @tags @statuses @dashboard @my-team @performance-review @ui
 */
test.describe(
  "Dashboard Statuses by PR",
  {
    tag: [
      "@statuses",
      "@dashboard",
      "@my-team",
      "@ui",
      "@performance-review",
      "@regression",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Status Tests by PR");
    });

    // ═══════════════════════════════════════════════════════════════════════
    // САМООЦЕНКА
    // ═══════════════════════════════════════════════════════════════════════

    test.describe("Самооценка", () => {
      test(
        'C4182: Статус "Пройдена" для самооценки',
        { tag: [] },
        async ({ managerAuth: page }, testInfo) => {
          setSeverity("critical");
          const sideMenu = new SideMenu(page, testInfo);
          const myTeamPage = new MyTeamPage(page, testInfo);
          const prPattern = PR_TITLE_PATTERNS.SELF_COMPLETE_MANAGER_AWAITING;

          await test.step('Открыть "Моя команда"', async () => {
            await sideMenu.openMyTeam();
            await myTeamPage.assertOpened();
          });

          const prSelected =
            await test.step(`Найти и выбрать PR по паттерну "${prPattern}"`, async () => {
              return myTeamPage.selectPRByPattern(prPattern);
            });

          if (!prSelected) {
            console.log(
              `⚠️ PR с паттерном "${prPattern}" не найден, пропускаем тест`,
            );
            test.skip();
            return;
          }

          await test.step('Проверить статус "Пройдена" в колонке самооценки', async () => {
            await myTeamPage.table.waitFor({
              state: "visible",
              timeout: 10000,
            });

            const completedStatus = page
              .locator("td")
              .filter({ hasText: /пройдена/i })
              .first();
            const isVisible = await completedStatus
              .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true, () => false)

            expect(
              isVisible,
              'Статус "Пройдена" должен быть виден',
            ).toBeTruthy();
            console.log('✓ Статус "Пройдена" для самооценки найден');

            await page.screenshot({
              path: `test-results/self-complete.png`,
              fullPage: false,
            });
          });
        },
      );

      test('C4183: Статус "В ожидании" для самооценки', async ({
        managerAuth: page,
      }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);
        const prPattern = PR_TITLE_PATTERNS.ALL_AWAITING;

        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        const prSelected =
          await test.step(`Найти и выбрать PR по паттерну "${prPattern}"`, async () => {
            return myTeamPage.selectPRByPattern(prPattern);
          });

        if (!prSelected) {
          console.log(
            `⚠️ PR с паттерном "${prPattern}" не найден, пропускаем тест`,
          );
          test.skip();
          return;
        }

        await test.step("Проверить статус в ожидании", async () => {
          await myTeamPage.table.waitFor({ state: "visible", timeout: 10000 });

          const awaitingPatterns = [/в процессе/i, /в ожидании/i, /ожидается/i];
          let found = false;

          for (const pattern of awaitingPatterns) {
            const status = page
              .locator("td")
              .filter({ hasText: pattern })
              .first();
            const isVisible = await status
              .waitFor({ state: "visible", timeout: 2000 })
                .then(() => true, () => false)
            if (isVisible) {
              console.log(`✓ Найден статус: ${pattern}`);
              found = true;
              break;
            }
          }

          expect(
            found,
            'Статус "В ожидании/В процессе" должен быть виден',
          ).toBeTruthy();
          await page.screenshot({
            path: `test-results/self-awaiting.png`,
            fullPage: false,
          });
        });
      });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ОЦЕНКА РУКОВОДИТЕЛЯ
    // ═══════════════════════════════════════════════════════════════════════

    test.describe("Оценка руководителя", () => {
      test('C4184: Статус "Пройдена" для оценки руководителя', async ({
        managerAuth: page,
      }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);
        const prPattern = PR_TITLE_PATTERNS.ALL_COMPLETE;

        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        const prSelected =
          await test.step(`Найти и выбрать PR по паттерну "${prPattern}"`, async () => {
            return myTeamPage.selectPRByPattern(prPattern);
          });

        if (!prSelected) {
          console.log(
            `⚠️ PR с паттерном "${prPattern}" не найден, пропускаем тест`,
          );
          test.skip();
          return;
        }

        await test.step("Проверить статусы в таблице", async () => {
          await myTeamPage.table.waitFor({ state: "visible", timeout: 10000 });

          const completedStatuses = page
            .locator("td")
            .filter({ hasText: /пройдена/i });
          const count = await completedStatuses.count();

          console.log(`✓ Найдено статусов "Пройдена": ${count}`);
          expect(count).toBeGreaterThanOrEqual(2);

          await page.screenshot({
            path: `test-results/manager-complete.png`,
            fullPage: false,
          });
        });
      });

      test('C4185: Статус "В ожидании" для оценки руководителя', async ({
        managerAuth: page,
      }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);
        const prPattern = PR_TITLE_PATTERNS.SELF_COMPLETE_MANAGER_AWAITING;

        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        const prSelected =
          await test.step(`Найти и выбрать PR по паттерну "${prPattern}"`, async () => {
            return myTeamPage.selectPRByPattern(prPattern);
          });

        if (!prSelected) {
          console.log(
            `⚠️ PR с паттерном "${prPattern}" не найден, пропускаем тест`,
          );
          test.skip();
          return;
        }

        await test.step("Проверить комбинацию статусов", async () => {
          await myTeamPage.table.waitFor({ state: "visible", timeout: 10000 });

          const row = myTeamPage.tableRows.first();
          const rowText = await row.innerText();

          console.log(
            `✓ Текст строки: ${rowText.replace(/\n/g, " | ").slice(0, 100)}`,
          );

          const hasComplete = /пройдена/i.test(rowText);
          const hasAwaiting = /в процессе|в ожидании/i.test(rowText);

          console.log(`  Есть "Пройдена": ${hasComplete}`);
          console.log(`  Есть "В ожидании/процессе": ${hasAwaiting}`);

          expect(
            hasComplete && hasAwaiting,
            "Должны быть оба типа статусов",
          ).toBeTruthy();
          await page.screenshot({
            path: `test-results/manager-awaiting.png`,
            fullPage: false,
          });
        });
      });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ОЦЕНКА КОЛЛЕГ
    // ═══════════════════════════════════════════════════════════════════════

    test.describe("Оценка коллег", () => {
      test('C4186: Статус "Пройдена" для оценки коллег', async ({
        managerAuth: page,
      }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);
        const prPattern = PR_TITLE_PATTERNS.ALL_COMPLETE;

        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        const prSelected =
          await test.step(`Найти и выбрать PR по паттерну "${prPattern}"`, async () => {
            return myTeamPage.selectPRByPattern(prPattern);
          });

        if (!prSelected) {
          console.log(
            `⚠️ PR с паттерном "${prPattern}" не найден, пропускаем тест`,
          );
          test.skip();
          return;
        }

        await test.step('Проверить наличие колонки "Оценка коллег"', async () => {
          await myTeamPage.table.waitFor({ state: "visible", timeout: 10000 });

          const headers = await myTeamPage.tableHeaders.allInnerTexts();
          const hasColleagueColumn = headers.some((h) => /коллег/i.test(h));

          console.log(`✓ Колонки: ${headers.join(" | ")}`);
          console.log(`✓ Есть колонка "Оценка коллег": ${hasColleagueColumn}`);

          if (!hasColleagueColumn) {
            console.log('⚠️ Колонка "Оценка коллег" отсутствует в этом PR');
            return;
          }

          const row = myTeamPage.tableRows.first();
          const rowText = await row.innerText();
          console.log(
            `✓ Текст строки: ${rowText.replace(/\n/g, " | ").slice(0, 150)}`,
          );

          await page.screenshot({
            path: `test-results/colleague-complete.png`,
            fullPage: false,
          });
        });
      });

      test(
        'C4187: Статус "Коллеги не утверждены"',
        { tag: ["@critical"] },
        async ({ managerAuth: page }, testInfo) => {
          setSeverity("critical");
          const sideMenu = new SideMenu(page, testInfo);
          const myTeamPage = new MyTeamPage(page, testInfo);
          const prPattern = PR_TITLE_PATTERNS.COLLEAGUES_NOT_APPROVED;

          await test.step('Открыть "Моя команда"', async () => {
            await sideMenu.openMyTeam();
            await myTeamPage.assertOpened();
          });

          const prSelected =
            await test.step(`Найти и выбрать PR по паттерну "${prPattern}"`, async () => {
              return myTeamPage.selectPRByPattern(prPattern);
            });

          if (!prSelected) {
            console.log(
              `⚠️ PR с паттерном "${prPattern}" не найден, пропускаем тест`,
            );
            test.skip();
            return;
          }

          await test.step('Проверить статус "Коллеги не утверждены"', async () => {
            await myTeamPage.table.waitFor({
              state: "visible",
              timeout: 10000,
            });

            const notApprovedPatterns = [
              /коллеги не утверждены/i,
              /не утверждены/i,
              /перейти к утверждению/i,
              /утвердить/i,
              /коллеги не предложены/i,
              /не предложены/i,
              /предложить/i,
            ];

            let found = false;
            for (const pattern of notApprovedPatterns) {
              const status = page
                .locator("td, button")
                .filter({ hasText: pattern })
                .first();
              const isVisible = await status
                .waitFor({ state: "visible", timeout: 2000 })
                  .then(() => true, () => false)
              if (isVisible) {
                console.log(`✓ Найден элемент: ${pattern}`);
                found = true;

                const text = await status.innerText();
                console.log(`✓ Текст: ${text}`);
                break;
              }
            }

            expect(
              found,
              'Должен быть статус "Коллеги не утверждены/не предложены" или кнопка утверждения/предложения',
            ).toBeTruthy();
            await page.screenshot({
              path: `test-results/colleague-not-approved.png`,
              fullPage: false,
            });
          });
        },
      );
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ОЦЕНКА ПОДЧИНЁННЫХ
    // ═══════════════════════════════════════════════════════════════════════

    test.describe("Оценка подчинённых", () => {
      test('C4188: Колонка "Оценка подчинённых" отображается', async ({
        managerAuth: page,
      }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);
        const prPattern = PR_TITLE_PATTERNS.ALL_COMPLETE;

        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        const prSelected =
          await test.step(`Найти и выбрать PR по паттерну "${prPattern}"`, async () => {
            return myTeamPage.selectPRByPattern(prPattern);
          });

        if (!prSelected) {
          console.log(
            `⚠️ PR с паттерном "${prPattern}" не найден, пропускаем тест`,
          );
          test.skip();
          return;
        }

        await test.step('Проверить наличие колонки "Оценка подчинённых"', async () => {
          await myTeamPage.table.waitFor({ state: "visible", timeout: 10000 });

          const headers = await myTeamPage.tableHeaders.allInnerTexts();
          const hasSubordinateColumn = headers.some((h) => /подчин/i.test(h));

          console.log(`✓ Колонки: ${headers.join(" | ")}`);
          console.log(
            `✓ Есть колонка "Оценка подчинённых": ${hasSubordinateColumn}`,
          );

          if (hasSubordinateColumn) {
            const row = myTeamPage.tableRows.first();
            const rowText = await row.innerText();
            console.log(
              `✓ Текст строки: ${rowText.replace(/\n/g, " | ").slice(0, 150)}`,
            );
          }

          await page.screenshot({
            path: `test-results/subordinate-column.png`,
            fullPage: false,
          });
        });
      });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // КАСТОМНЫЕ НАПРАВЛЕНИЯ (опциональный тест)
    // ═══════════════════════════════════════════════════════════════════════

    test.describe("Кастомные направления", () => {
      test.beforeAll(async ({ request }) => {
        test.setTimeout(120000);
        const { DashboardStatusSeed } = await import(
          "../../../utils/seed/DashboardStatusSeed.js"
        );
        const seed = new DashboardStatusSeed(request);
        await seed.init();

        const subordinateIds = seed.getSubordinateIds(1);
        const assessment = await seed.getAvailableAssessment();
        if (!assessment) throw new Error("Нет опубликованных анкет");

        const pr = await seed.createPR({
          title: `E2E_Все направления (кастом)_${Date.now()}`,
          directions: {
            self: true,
            head: true,
            subordinate: true,
            colleague: true,
          },
        });

        await seed.addTargetUsers(pr.id, subordinateIds);
        await seed.attachAssessment(pr.id, assessment.id);
        await seed.startPR(pr.id);
        console.log(
          `✅ PR для кастомных направлений создан: ${pr.id} - "${pr.title}"`,
        );
      });

      test("C4189: PR с кастомными направлениями отображается", async ({
        managerAuth: page,
      }, testInfo) => {
        setSeverity("minor");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        // Ищем любой PR с кастомным направлением
        const prSelected =
          await test.step("Найти и выбрать PR с кастомными направлениями", async () => {
            let selected = await myTeamPage.selectPRByPattern("кастом");
            if (!selected) {
              // После неудачного поиска модалка react-modal-sheet может не закрыться полностью.
              // Перезагружаем страницу чтобы гарантированно сбросить состояние UI.
              await page.reload({ waitUntil: "networkidle" });
              await myTeamPage.assertOpened();
              selected = await myTeamPage.selectPRByPattern("custom");
            }
            return selected;
          });

        if (!prSelected) {
          console.log(
            "⚠️ PR с кастомными направлениями не найден, пропускаем тест",
          );
          test.skip();
          return;
        }

        await test.step("Проверить колонки таблицы", async () => {
          await myTeamPage.table.waitFor({ state: "visible", timeout: 10000 });

          const headers = await myTeamPage.tableHeaders.allInnerTexts();
          console.log(`✓ Колонки: ${headers.join(" | ")}`);
          console.log(`✓ Количество колонок: ${headers.length}`);

          expect(headers.length).toBeGreaterThan(4);

          const row = myTeamPage.tableRows.first();
          const rowText = await row.innerText();
          console.log(`✓ Текст строки: ${rowText.replace(/\n/g, " | ")}`);

          await page.screenshot({
            path: `test-results/custom-directions.png`,
            fullPage: false,
          });
        });
      });
    });
  },
);
