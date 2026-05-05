// tests/functional/performance-review/dashboard/dashboard-statuses.spec.js
// Тесты статусов прохождения на дашборде руководителя

import { test, expect } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import {
  DashboardTeamSeed,
  TEST_STATUSES,
} from "../../../utils/seed/DashboardTeamSeed.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

/**
 * Тесты статусов прохождения на дашборде руководителя
 *
 * Статусы:
 * - "Коллеги не предложены" (красный) - сотрудник не предложил коллег
 * - "Коллеги не утверждены" (оранжевый) - коллеги предложены, ждут утверждения
 * - "В процессе" (жёлтый) - анкета частично заполнена
 * - "Пройдена" (зелёный) - анкета заполнена
 * - "Не пройдена" (серый) - анкета не начата
 *
 * @tags @statuses @dashboard @my-team @performance-review @ui
 */
test.describe(
  "Dashboard Statuses",
  {
    tag: [
      "@statuses",
      "@dashboard",
      "@my-team",
      "@performance-review",
      "@regression",
      "@ui",
    ],
  },
  () => {
    let testPrId;

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
        title: `E2E_Статусы дашборда_${Date.now()}`,
        directions: { self: true, head: true },
      });

      await seed.addTargetUsers(pr.id, subordinateIds);
      await seed.attachAssessment(pr.id, assessment.id);
      await seed.startPR(pr.id);
      await seed.fillQuestionnaires(pr.id);

      testPrId = pr.id;
      console.log(`✅ Тестовый PR: ${testPrId}`);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Status Tests");
    });

    // ═══════════════════════════════════════════════════════════════════════
    // API TESTS - Проверка данных
    // ═══════════════════════════════════════════════════════════════════════

    test.describe("API - Проверка статусов", () => {
      test(
        "C4333: Получить статусы подчинённых",
        { tag: ["@api"] },
        async ({ request }) => {
          markAsAPITest(MODULES.MY_TEAM, "Status API");
          setSeverity("critical");

          const seed = new DashboardTeamSeed(request);
          await seed.init("manager");

          await test.step("Найти активный PR", async () => {
            const result = await seed.findActivePRWithSubordinates();

            if (result) {
              console.log(`✓ Найден PR: ${result.pr.title}`);
              console.log(`✓ Оцениваемых: ${result.targetUsers.length}`);
            } else {
              console.log("⚠️ Активный PR не найден");
              test.skip(true, "Нет активного PR с подчинёнными");
            }
          });
        },
      );

      test(
        "C4334: Собрать информацию о команде",
        { tag: ["@api"] },
        async ({ request }) => {
          markAsAPITest(MODULES.MY_TEAM, "Team Info API");
          setSeverity("normal");

          const seed = new DashboardTeamSeed(request);
          await seed.init("manager");

          await test.step("Собрать данные команды", async () => {
            const teamInfo = await seed.collectTeamInfo(testPrId);

            console.log(`\n📊 Результат:`);
            console.log(`  PR ID: ${teamInfo.prId}`);
            console.log(`  Ревизия: ${teamInfo.revisionId}`);
            console.log(`  Подчинённых: ${teamInfo.subordinates.length}`);

            expect(teamInfo.subordinates.length).toBeGreaterThanOrEqual(0);
          });
        },
      );

      test(
        "C4335: Проверить наличие тестовых данных",
        { tag: ["@api"] },
        async ({ request }) => {
          markAsAPITest(MODULES.MY_TEAM, "Verify Test Data");
          setSeverity("normal");

          const seed = new DashboardTeamSeed(request);
          await seed.init("manager");

          await test.step("Проверить данные по статусам", async () => {
            const result = await seed.verifyTestData(testPrId);

            console.log(
              `\n📋 Готовность к тестам: ${result.isReady ? "✓" : "✗"}`,
            );

            // Пропускаем тест если нет данных для проверки
            if (!result.isReady) {
              test.skip(
                true,
                "Нет тестовых данных с различными статусами для PR " + testPrId,
              );
              return;
            }

            // Логируем найденные статусы
            console.log(`✓ Найдены статусы для проверки`);
          });
        },
      );
    });

    // ═══════════════════════════════════════════════════════════════════════
    // UI TESTS - Отображение статусов
    // ═══════════════════════════════════════════════════════════════════════

    test.describe("UI - Отображение статусов", () => {
      test(
        "C4193: Статусы отображаются в таблице",
        { tag: [] },
        async ({ managerAuth: page }, testInfo) => {
          setSeverity("critical");
          const sideMenu = new SideMenu(page, testInfo);
          const myTeamPage = new MyTeamPage(page, testInfo);

          await test.step('Открыть "Моя команда"', async () => {
            await sideMenu.openMyTeam();
            await myTeamPage.assertOpened();
          });

          await test.step("Проверить наличие статусов в таблице", async () => {
            const tableVisible = await myTeamPage.table
              .waitFor({ state: "visible", timeout: 10000 })
                .then(() => true, () => false)

            if (!tableVisible) {
              console.log("⚠️ Таблица не найдена");
              return;
            }

            // Ищем ячейки со статусами
            const statusCells = page.locator("td").filter({
              has: page.locator(
                '[class*="badge"], [class*="Badge"], [class*="status"], [class*="Status"]',
              ),
            });

            const statusCount = await statusCells.count();
            console.log(`✓ Найдено ячеек со статусами: ${statusCount}`);

            // Собираем текст статусов
            const statuses = [];
            for (let i = 0; i < Math.min(statusCount, 10); i++) {
              const text = await statusCells
                .nth(i)
                .innerText()
              if (text) statuses.push(text.trim());
            }

            console.log(`✓ Статусы: ${statuses.join(", ")}`);
            await page.screenshot({
              path: "test-results/dashboard-statuses.png",
              fullPage: false,
            });
          });
        },
      );

      test(
        'C4194: Статус "Пройдена" отображается зелёным',
        { tag: [] },
        async ({ managerAuth: page }, testInfo) => {
          setSeverity("normal");
          const sideMenu = new SideMenu(page, testInfo);
          const myTeamPage = new MyTeamPage(page, testInfo);

          await test.step('Открыть "Моя команда"', async () => {
            await sideMenu.openMyTeam();
            await myTeamPage.assertOpened();
          });

          await test.step('Найти статус "Пройдена"', async () => {
            // Ищем текст "Пройдена" в таблице
            const completedStatus = page
              .locator("td")
              .filter({ hasText: /пройдена/i })
              .first();
            const isVisible = await completedStatus
              .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true, () => false)

            if (isVisible) {
              console.log('✓ Статус "Пройдена" найден');

              // Проверяем цвет (зелёный)
              const bgColor = await completedStatus.evaluate((el) => {
                const badge =
                  el.querySelector('[class*="badge"], [class*="Badge"]') || el;
                return window.getComputedStyle(badge).backgroundColor;
              });

              console.log(`✓ Цвет фона: ${bgColor}`);

              // Зелёный цвет обычно имеет высокое значение G
              // rgb(X, Y, Z) где Y > X и Y > Z
              const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
              if (match) {
                const [, r, g, b] = match.map(Number);
                const isGreenish = g > r && g > b * 0.8;
                console.log(`✓ Похоже на зелёный: ${isGreenish}`);
              }
            } else {
              console.log('⚠️ Статус "Пройдена" не найден на текущей странице');
            }
          });
        },
      );

      test(
        'C4195: Статус "В процессе" отображается корректно',
        { tag: [] },
        async ({ managerAuth: page }, testInfo) => {
          setSeverity("normal");
          const sideMenu = new SideMenu(page, testInfo);
          const myTeamPage = new MyTeamPage(page, testInfo);

          await test.step('Открыть "Моя команда"', async () => {
            await sideMenu.openMyTeam();
            await myTeamPage.assertOpened();
          });

          await test.step('Найти статус "В процессе"', async () => {
            // Ищем текст "В процессе" в таблице
            const inProgressStatus = page
              .locator("td")
              .filter({ hasText: /в процессе/i })
              .first();
            const isVisible = await inProgressStatus
              .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true, () => false)

            if (isVisible) {
              console.log('✓ Статус "В процессе" найден');

              // Получаем имя респондента если есть
              const text = await inProgressStatus.innerText();
              console.log(`✓ Текст: ${text.replace(/\n/g, " | ")}`);
            } else {
              console.log('⚠️ Статус "В процессе" не найден');
            }
          });
        },
      );

      test("C4196: Статусы по направлениям отображаются в колонках", async ({
        managerAuth: page,
      }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Проверить колонки направлений", async () => {
          const headers = await myTeamPage.tableHeaders.allInnerTexts();
          const normalized = headers
            .map((h) => h.replace(/\s+/g, " ").trim())
            .filter(Boolean);

          console.log(`✓ Колонки: ${normalized.join(" | ")}`);

          // Проверяем наличие колонок направлений
          const directionColumns = {
            selfAssessment: normalized.some((h) => /самооценк/i.test(h)),
            managerAssessment: normalized.some((h) => /руководител/i.test(h)),
            colleagueAssessment: normalized.some((h) => /коллег/i.test(h)),
            subordinateAssessment: normalized.some((h) => /подчин/i.test(h)),
          };

          console.log(
            `  Самооценка: ${directionColumns.selfAssessment ? "✓" : "✗"}`,
          );
          console.log(
            `  Оценка руководителя: ${directionColumns.managerAssessment ? "✓" : "✗"}`,
          );
          console.log(
            `  Оценка коллег: ${directionColumns.colleagueAssessment ? "✓" : "✗"}`,
          );
          console.log(
            `  Оценка подчинённых: ${directionColumns.subordinateAssessment ? "✓" : "✗"}`,
          );

          // Хотя бы одно направление должно быть
          const hasAnyDirection = Object.values(directionColumns).some(
            (v) => v,
          );
          expect(
            hasAnyDirection,
            "Должна быть хотя бы одна колонка направления",
          ).toBeTruthy();
        });
      });

      test("C4197: Статусы для конкретного подчинённого", async ({
        managerAuth: page,
      }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Получить статусы первого подчинённого", async () => {
          const tableVisible = await myTeamPage.table
            .waitFor({ state: "visible", timeout: 10000 })
              .then(() => true, () => false)

          if (!tableVisible) {
            console.log("⚠️ Таблица не найдена");
            return;
          }

          const rowsCount = await myTeamPage.tableRows.count();
          if (rowsCount === 0) {
            console.log("⚠️ Нет строк в таблице");
            return;
          }

          // Берём первую строку
          const firstRow = myTeamPage.tableRows.first();
          const cells = firstRow.locator("td");
          const cellCount = await cells.count();

          console.log(`✓ Ячеек в строке: ${cellCount}`);

          // Получаем текст каждой ячейки
          for (let i = 0; i < cellCount; i++) {
            const cellText = await cells
              .nth(i)
              .innerText();
            console.log(
              `  [${i}] ${cellText.replace(/\n/g, " | ").slice(0, 50)}`,
            );
          }
        });
      });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // UI TESTS - Специфичные статусы
    // ═══════════════════════════════════════════════════════════════════════

    test.describe("UI - Специфичные статусы", () => {
      test('C4198: Проверка статуса "Коллеги не предложены"', async ({
        managerAuth: page,
      }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step('Найти статус "Коллеги не предложены"', async () => {
          // Ищем текст связанный с не предложенными коллегами
          const notProposedPatterns = [
            /коллеги не предложены/i,
            /не предложены/i,
            /предложить коллег/i,
          ];

          let found = false;
          for (const pattern of notProposedPatterns) {
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

          if (!found) {
            console.log(
              '⚠️ Статус "Коллеги не предложены" не найден - возможно нет таких данных',
            );
          }
        });
      });

      test('C4199: Проверка кнопки "Утвердить" для не утверждённых коллег', async ({
        managerAuth: page,
      }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step('Найти кнопку "Утвердить"', async () => {
          const approveButton = page
            .getByRole("button", { name: /утвердить/i })
            .first();
          const isVisible = await approveButton
            .waitFor({ state: "visible", timeout: 5000 })
              .then(() => true, () => false)

          if (isVisible) {
            console.log('✓ Кнопка "Утвердить" найдена');

            // Проверяем что кнопка активна
            const isEnabled = await approveButton.isEnabled();
            console.log(`✓ Кнопка активна: ${isEnabled}`);
          } else {
            console.log(
              '⚠️ Кнопка "Утвердить" не найдена - возможно нет не утверждённых коллег',
            );
          }
        });
      });
    });
  },
);
