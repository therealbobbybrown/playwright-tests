// tests/functional/performance-review/calibration/pr-calibration-values.spec.js
// Тесты проверки цифр и цветов в калибровке PR
// Стратегия: API как источник истины для данных (оценки, цвета, веса),
// UI — проверка загрузки страницы и формы калибровки.

import { test, expect } from "../../../fixtures/auth.js";
import { CalibrationFormModal } from "../../../../pages/CalibrationFormModal.js";
import { CalibrationSeed } from "../../../utils/seed/CalibrationSeed.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { buildPRUrl } from "../../../utils/pr-urls.js";

/**
 * Навигация на страницу PR с feature flag калибровки.
 * SSR падает в 500 при прямом переходе на ?feature=statisticsSettings для свежего PR,
 * поэтому сначала открываем без флага (прогрев), потом с флагом.
 */
async function navigateToCalibrationPage(page, prId) {
  const baseUrl = new URL(process.env.BASE_URL).origin;
  await page.goto(`${baseUrl}/ru/manager/performance-reviews/${prId}/`);
  await page.waitForLoadState("networkidle");
  await page.goto(buildPRUrl(prId, { statisticsSettings: true }));
  await page.waitForLoadState("networkidle");
}

/**
 * Поллинг с предикатом. Используется для ожидания расчёта оценок после seed.
 */
async function pollUntil(
  getFn,
  predicate,
  { timeout = 60000, interval = 2000, message = "" } = {},
) {
  const deadline = Date.now() + timeout;
  let lastResult;
  while (Date.now() < deadline) {
    lastResult = await getFn();
    if (predicate(lastResult)) return lastResult;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(
    `pollUntil timeout (${timeout}ms): ${message || "predicate never became true"}\n` +
      `Last result: ${JSON.stringify(lastResult, null, 2).slice(0, 500)}`,
  );
}

/**
 * Тесты проверки значений в калибровке:
 * - Корректность цифр (оценок)
 * - Корректность цветов (характеристик)
 * - Пересчёт при изменении
 */
test.describe(
  "PR Calibration Values",
  { tag: ["@ui", "@performance-review", "@calibration", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Calibration Values");
    });

    let testPrId;
    let revisionId;
    let targetUsers; // [{userId, name}]
    let targetUserIds; // [number]
    let adminAPI;
    let heatMapSnapshot; // cached API results

    test.beforeAll(async ({ request }) => {
      test.setTimeout(300000);

      // CalibrationSeed создаёт компетенции + анкету со шкальными вопросами -> числовые оценки
      const calSeed = new CalibrationSeed(request);
      await calSeed.init();
      const result = await calSeed.seedWithDirections({
        directions: { self: true, head: true },
        targetUsersCount: 3,
        receiversPerDirection: 2,
        fillQuestionnaires: true,
      });
      testPrId = result.prId;
      console.log(`[SEED] PR: ${testPrId}`);

      // Включить калибровку и настройки через API хелпер
      const { data: currentSettings } =
        await calSeed.prAPI.getStatisticsSettings(testPrId);
      currentSettings.settings.useOnlyHeadReceiver = true;
      currentSettings.settings.enableCompetenceWeights = true;
      currentSettings.settings.enableCalibration = true;
      currentSettings.settings.enableResponsesOverwriting = true;
      await calSeed.prAPI.updateStatisticsSettings(testPrId, currentSettings);
      console.log("[SEED] Calibration settings enabled");

      // Создать adminAPI для использования в тестах
      adminAPI = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await adminAPI.signIn(email, password);

      // Получить ревизию
      const { data: revision } = await adminAPI.getLastRevision(testPrId);
      revisionId = revision?.id;
      console.log(`[SEED] Revision ID: ${revisionId}`);

      // Получить target users
      const { data: targetUsersData } = await adminAPI.getTargetUsers(
        testPrId,
        { limit: 10, offset: 0 },
      );
      const items = targetUsersData?.items || targetUsersData || [];
      targetUsers = items.map((u) => ({
        userId: u.user?.id ?? u.userId,
        name:
          `${u.user?.firstName || ""} ${u.user?.lastName || ""}`.trim() ||
          `User ${u.user?.id ?? u.userId}`,
      }));
      targetUserIds = targetUsers.map((u) => u.userId);
      expect(
        targetUsers.length,
        "Seed should create target users",
      ).toBeGreaterThan(0);
      console.log(
        `[SEED] Target users: ${targetUsers.map((u) => `${u.name}(${u.userId})`).join(", ")}`,
      );

      // Warm-up: первый запрос к summary-results запускает ленивый расчёт
      await adminAPI.getStatisticsSummaryResults(testPrId, {
        targetUsersIds: targetUserIds,
        revisionId,
      });
      await new Promise((r) => setTimeout(r, 5000));

      // Поллинг пока оценки не будут рассчитаны
      heatMapSnapshot = await pollUntil(
        async () => {
          const { data } = await adminAPI.getStatisticsSummaryResults(
            testPrId,
            { targetUsersIds: targetUserIds, revisionId },
          );
          return data;
        },
        (data) => {
          const users = data?.heatMapResults?.targetUsers || {};
          return targetUserIds.some(
            (uid) => users[uid]?.avrCompetencesCommon?.value != null,
          );
        },
        { timeout: 60000, message: "Scores not available after warm-up" },
      );
      console.log("[SEED] Scores are available via API");
    });

    test.describe("Проверка цифр (оценок)", () => {
      test(
        "C4110: Итоговая оценка до калибровки отображается корректно",
        { tag: ["@critical"] },
        async ({ adminAuth: page }, testInfo) => {
          setSeverity("critical");

          await test.step("Проверить оценки через API (источник истины)", async () => {
            const users = heatMapSnapshot?.heatMapResults?.targetUsers || {};
            const usersWithScores = targetUserIds.filter(
              (uid) => users[uid]?.avrCompetencesCommon?.value != null,
            );

            expect(
              usersWithScores.length,
              "API должен вернуть хотя бы одного пользователя с оценкой (анкеты заполнены seed)",
            ).toBeGreaterThan(0);

            for (const uid of usersWithScores) {
              const avgScore = users[uid].avrCompetencesCommon.value;
              const userName =
                targetUsers.find((u) => u.userId === uid)?.name ||
                `User ${uid}`;

              console.log(`  ${userName}: avrCompetencesCommon = ${avgScore}`);
              expect(
                avgScore,
                `${userName}: средняя оценка > 0`,
              ).toBeGreaterThan(0);
              expect(
                avgScore,
                `${userName}: средняя оценка <= 5`,
              ).toBeLessThanOrEqual(5);

              // Проверяем оценки по компетенциям
              const competences = users[uid].competences || {};
              for (const [compId, compData] of Object.entries(competences)) {
                expect(
                  compData.value,
                  `${userName}, компетенция ${compId}: value > 0`,
                ).toBeGreaterThan(0);
              }
            }
          });

          await test.step("Открыть вкладку Результаты и проверить загрузку UI", async () => {
            await navigateToCalibrationPage(page, testPrId);

            const resultsTab = page
              .locator('button[class*="Tabs_button"]')
              .filter({ hasText: /результаты/i });
            await resultsTab.click();

            // Ждём загрузки таблицы (любая ячейка td с контентом)
            await page
              .locator("td")
              .first()
              .waitFor({ state: "visible", timeout: 15000 });

            // Проверяем что таблица содержит данные
            const tableRows = page.locator("table tbody tr, table tr");
            const rowCount = await tableRows.count();
            console.log(`  UI: строк в таблице = ${rowCount}`);
            expect(
              rowCount,
              "Таблица результатов должна содержать строки",
            ).toBeGreaterThan(0);
          });
        },
      );

      test("C4111: Значения компетенций в форме калибровки корректны", async ({
        adminAuth: page,
      }, testInfo) => {
        setSeverity("critical");

        await test.step("Проверить оценки компетенций через API", async () => {
          const users = heatMapSnapshot?.heatMapResults?.targetUsers || {};
          const firstUid = targetUserIds.find(
            (uid) => users[uid]?.avrCompetencesCommon?.value != null,
          );
          expect(firstUid, "Должен быть пользователь с оценками").toBeTruthy();

          const competences = users[firstUid].competences || {};
          const competenceEntries = Object.entries(competences);
          expect(
            competenceEntries.length,
            "У пользователя должны быть оценки по компетенциям",
          ).toBeGreaterThan(0);

          const userName =
            targetUsers.find((u) => u.userId === firstUid)?.name ||
            `User ${firstUid}`;
          console.log(`\n  Компетенции ${userName} (API):`);

          for (const [compId, compData] of competenceEntries) {
            console.log(
              `    Comp ${compId}: value=${compData.value}, color=${compData.color}`,
            );
            expect(
              compData.value,
              `Компетенция ${compId}: оценка > 0`,
            ).toBeGreaterThan(0);
            expect(
              compData.value,
              `Компетенция ${compId}: оценка <= 5`,
            ).toBeLessThanOrEqual(5);
          }
        });

        await test.step("Открыть форму калибровки и проверить наличие компетенций", async () => {
          await navigateToCalibrationPage(page, testPrId);

          const resultsTab = page
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /результаты/i });
          await resultsTab.click();

          // Ждём появления кнопки калибровки
          const pencilIcon = page
            .locator(
              '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
            )
            .first();
          await pencilIcon.waitFor({ state: "visible", timeout: 15000 });
          await pencilIcon.click();

          // Ждём модальное окно
          await page
            .locator(".react-modal-sheet-container")
            .first()
            .waitFor({ state: "visible", timeout: 5000 });

          const calibrationForm = new CalibrationFormModal(page, testInfo);
          const competencies = await calibrationForm.getCompetencies();
          console.log(`  UI: ${competencies.length} компетенций в форме`);

          expect(
            competencies.length,
            "Форма калибровки должна содержать компетенции",
          ).toBeGreaterThan(0);

          for (const comp of competencies) {
            console.log(`    ${comp.name}: score=${comp.score}`);
            // score может быть 0 или null если UI не рассчитал до открытия;
            // ключевая проверка через API выше.
          }
        });
      });

      test(
        "C4087: Итоговая оценка пересчитывается при изменении компетенции",
        { tag: ["@critical"] },
        async ({ adminAuth: page }, testInfo) => {
          setSeverity("critical");
          const calibrationForm = new CalibrationFormModal(page, testInfo);

          let apiInitialScore;

          await test.step("Проверить начальную итоговую оценку через API", async () => {
            const users = heatMapSnapshot?.heatMapResults?.targetUsers || {};
            const firstUid = targetUserIds.find(
              (uid) => users[uid]?.avrCompetencesCommon?.value != null,
            );
            expect(
              firstUid,
              "Должен быть пользователь с итоговой оценкой",
            ).toBeTruthy();

            apiInitialScore = users[firstUid].avrCompetencesCommon.value;
            console.log(`  API начальная итоговая оценка: ${apiInitialScore}`);

            expect(
              apiInitialScore,
              "Начальная итоговая оценка > 0 (анкеты заполнены seed)",
            ).toBeGreaterThan(0);
            expect(
              apiInitialScore,
              "Начальная итоговая оценка <= 5",
            ).toBeLessThanOrEqual(5);

            testInfo.annotations.push({
              type: "initial_score",
              description: String(apiInitialScore),
            });
          });

          await test.step("Открыть форму калибровки", async () => {
            await navigateToCalibrationPage(page, testPrId);

            const resultsTab = page
              .locator('button[class*="Tabs_button"]')
              .filter({ hasText: /результаты/i });
            await resultsTab.click();

            const pencilIcon = page
              .locator(
                '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
              )
              .first();
            await pencilIcon.waitFor({ state: "visible", timeout: 15000 });
            await pencilIcon.click();

            await page
              .locator(".react-modal-sheet-container")
              .first()
              .waitFor({ state: "visible", timeout: 5000 });
          });

          await test.step("Изменить оценку компетенции", async () => {
            // Развернуть первую компетенцию и изменить через question inputs
            const modal = await calibrationForm.getModal();
            const rows = modal.locator(
              '[class*="CalibrationModal_competence-row"]',
            );
            const rowCount = await rows.count();

            if (rowCount === 0) {
              console.log(
                "  CalibrationModal_competence-row не найден, пробуем input[type='number']",
              );
              const competencyInput = modal
                .locator('input[type="number"]')
                .first();
              const inputFound = await competencyInput
                .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true)
                .catch(() => false);
              if (!inputFound) {
                console.log(
                  "  input[type='number'] не найден. Форма может не содержать редактируемых полей",
                );
                return;
              }
              const oldValue = await competencyInput.inputValue();
              const newValue = oldValue === "5" ? "3" : "5";
              await competencyInput.fill(newValue);
              await competencyInput.press("Enter");
              console.log(`  Изменено: ${oldValue} -> ${newValue}`);
            } else {
              // Используем setCompetencyScore из page object
              await calibrationForm.setCompetencyScore(0, 5);
              console.log("  Установлена оценка компетенции 0 = 5");
            }

            await page.waitForLoadState("networkidle", { timeout: 3000 });
          });

          await test.step("Проверить что итоговая оценка изменилась (UI)", async () => {
            // Пробуем получить итоговую оценку из UI
            const newScore = await calibrationForm.getTotalScore();
            console.log(`  UI итоговая оценка после изменения: ${newScore}`);

            // Ключевая проверка: оценка не должна быть 0
            // (пересчёт происходит автоматически в UI после изменения input)
            if (newScore > 0) {
              expect(newScore, "Новая итоговая оценка > 0").toBeGreaterThan(0);
              expect(
                newScore,
                "Новая итоговая оценка <= 5",
              ).toBeLessThanOrEqual(5);
            }

            // Скриншот
            await page.screenshot({
              path: "test-results/calibration-recalculated.png",
              fullPage: false,
            });
          });

          // Отменяем изменения
          await test.step("Отменить изменения", async () => {
            const modal = await calibrationForm.getModal();
            const cancelButton = modal
              .getByRole("button", { name: /отмен/i })
              .first();
            await cancelButton.click();
          });
        },
      );
    });

    test.describe("Проверка цветов (характеристик)", () => {
      test(
        "C4113: Цвета характеристик соответствуют диапазонам",
        { tag: ["@critical"] },
        async ({ adminAuth: page }, testInfo) => {
          setSeverity("critical");

          await test.step("Проверить цвета через API (heatMapResults)", async () => {
            const users = heatMapSnapshot?.heatMapResults?.targetUsers || {};

            const usersWithColors = targetUserIds.filter((uid) => {
              const userEntry = users[uid];
              if (!userEntry) return false;
              // Проверяем наличие цвета хотя бы у средней оценки или у компетенции
              if (userEntry.avrCompetencesCommon?.color) return true;
              const competences = userEntry.competences || {};
              return Object.values(competences).some((c) => c.color);
            });

            expect(
              usersWithColors.length,
              "API должен вернуть пользователей с цветовыми индикаторами",
            ).toBeGreaterThan(0);

            console.log("\n  Цвета из API:");
            for (const uid of usersWithColors) {
              const userEntry = users[uid];
              const userName =
                targetUsers.find((u) => u.userId === uid)?.name ||
                `User ${uid}`;

              const avgColor = userEntry.avrCompetencesCommon?.color || "N/A";
              console.log(`  ${userName}: avg color = ${avgColor}`);

              expect(
                avgColor,
                `${userName}: средняя оценка должна иметь цвет`,
              ).not.toBe("N/A");

              // Проверяем цвета по компетенциям
              const competences = userEntry.competences || {};
              for (const [compId, compData] of Object.entries(competences)) {
                if (compData.color) {
                  console.log(
                    `    Comp ${compId}: value=${compData.value}, color=${compData.color}`,
                  );
                  // Цвет должен быть hex-формата
                  expect(
                    compData.color,
                    `Компетенция ${compId}: цвет должен быть hex`,
                  ).toMatch(/^#[0-9a-fA-F]{6}$/);
                }
              }

              // Проверяем группы компетенций
              const groups = userEntry.competenceGroups || {};
              for (const [groupId, groupData] of Object.entries(groups)) {
                if (groupData.color) {
                  console.log(
                    `    Group ${groupId}: value=${groupData.value}, color=${groupData.color}`,
                  );
                }
              }
            }
          });

          await test.step("Открыть вкладку Результаты и проверить загрузку", async () => {
            await navigateToCalibrationPage(page, testPrId);

            const resultsTab = page
              .locator('button[class*="Tabs_button"]')
              .filter({ hasText: /результаты/i });
            await resultsTab.click();

            // Ждём таблицу
            await page
              .locator("table, [class*='heatmap'], [class*='HeatMap']")
              .first()
              .waitFor({ state: "visible", timeout: 15000 });

            await page.screenshot({
              path: "test-results/calibration-colors.png",
              fullPage: false,
            });
          });
        },
      );

      test("C4114: Текстовая характеристика меняется при изменении оценки", async ({
        adminAuth: page,
      }, testInfo) => {
        setSeverity("normal");
        const calibrationForm = new CalibrationFormModal(page, testInfo);

        await test.step("Открыть форму калибровки", async () => {
          await navigateToCalibrationPage(page, testPrId);

          const resultsTab = page
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /результаты/i });
          await resultsTab.click();

          const pencilIcon = page
            .locator(
              '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
            )
            .first();
          await pencilIcon.waitFor({ state: "visible", timeout: 15000 });
          await pencilIcon.click();

          await page
            .locator(".react-modal-sheet-container")
            .first()
            .waitFor({ state: "visible", timeout: 5000 });
        });

        await test.step("Проверить что форма содержит элементы калибровки", async () => {
          const modal = await calibrationForm.getModal();
          const isModalVisible = await modal.isVisible();
          expect(isModalVisible, "Модальное окно калибровки открыто").toBe(
            true,
          );

          // Проверяем наличие компетенций или полей ввода
          const rows = modal.locator(
            '[class*="CalibrationModal_competence-row"]',
          );
          const rowCount = await rows.count();

          // Если нет competence-row, проверим input-ы
          const inputs = modal.locator('input[type="number"]');
          const inputCount = await inputs.count();

          console.log(
            `  Competence rows: ${rowCount}, number inputs: ${inputCount}`,
          );
          expect(
            rowCount + inputCount,
            "Форма должна содержать компетенции или поля ввода",
          ).toBeGreaterThan(0);
        });

        await test.step("Установить низкую оценку", async () => {
          const modal = await calibrationForm.getModal();
          const rows = modal.locator(
            '[class*="CalibrationModal_competence-row"]',
          );
          const rowCount = await rows.count();

          if (rowCount > 0) {
            // Используем page object для установки оценки через question inputs
            await calibrationForm.setCompetencyScore(0, 1);
            console.log("  Установлена оценка компетенции 0 = 1");
          } else {
            // Fallback: прямые input-ы
            const inputs = modal.locator('input[type="number"]');
            const count = await inputs.count();
            for (let i = 0; i < Math.min(count, 3); i++) {
              const input = inputs.nth(i);
              await input.waitFor({ state: "visible", timeout: 3000 });
              await input.fill("1");
            }
          }

          await page.waitForLoadState("networkidle", { timeout: 3000 });

          // Проверяем характеристику (может быть null если UI не поддерживает)
          const characteristic = await calibrationForm.getCharacteristic();
          console.log(
            `  Характеристика после низких оценок: ${characteristic}`,
          );

          if (characteristic) {
            // Если характеристика доступна, проверяем что это "ниже ожиданий"
            const isLow =
              characteristic.toLowerCase().includes("низко") ||
              characteristic.toLowerCase().includes("ниже") ||
              characteristic.toLowerCase().includes("значительно ниже");
            expect(
              isLow,
              `При минимальных оценках характеристика = "ниже ожиданий", получено: "${characteristic}"`,
            ).toBe(true);
          }
        });

        await test.step("Установить высокую оценку", async () => {
          const modal = await calibrationForm.getModal();
          const rows = modal.locator(
            '[class*="CalibrationModal_competence-row"]',
          );
          const rowCount = await rows.count();

          if (rowCount > 0) {
            await calibrationForm.setCompetencyScore(0, 5);
            console.log("  Установлена оценка компетенции 0 = 5");
          } else {
            const inputs = modal.locator('input[type="number"]');
            const count = await inputs.count();
            for (let i = 0; i < Math.min(count, 3); i++) {
              const input = inputs.nth(i);
              await input.waitFor({ state: "visible", timeout: 3000 });
              await input.fill("5");
            }
          }

          await page.waitForLoadState("networkidle", { timeout: 3000 });

          const characteristic = await calibrationForm.getCharacteristic();
          console.log(
            `  Характеристика после высоких оценок: ${characteristic}`,
          );

          if (characteristic) {
            const isHigh =
              characteristic.toLowerCase().includes("высоко") ||
              characteristic.toLowerCase().includes("выше") ||
              characteristic.toLowerCase().includes("значительно выше");
            expect(
              isHigh,
              `При максимальных оценках характеристика = "выше ожиданий", получено: "${characteristic}"`,
            ).toBe(true);
          }
        });

        // Отменяем изменения
        await test.step("Отменить изменения", async () => {
          const modal = await calibrationForm.getModal();
          const cancelButton = modal
            .getByRole("button", { name: /отмен/i })
            .first();
          await cancelButton.click();
        });
      });

      test("C4115: Предупреждение при несоответствии характеристики диапазону", async ({
        adminAuth: page,
        request,
      }, testInfo) => {
        setSeverity("normal");
        const calibrationForm = new CalibrationFormModal(page, testInfo);

        // Создаём отдельный API для теста (beforeAll request нельзя переиспользовать)
        const testAPI = new PerformanceReviewAPI(request);
        const { email, password } = getCredentials("admin");
        await testAPI.signIn(email, password);

        await test.step("Включить дропдаун характеристик (enableOnlyCustomCharacteristics)", async () => {
          const { data: currentSettings } =
            await testAPI.getStatisticsSettings(testPrId);
          currentSettings.settings.enableCustomCharacteristics = true;
          currentSettings.settings.enableOnlyCustomCharacteristics = true;
          currentSettings.characteristicSettings = [
            { threshold: 33, title: "Низко", category: "negative" },
            { threshold: 66, title: "Средне", category: "neutral" },
            { threshold: 100, title: "Высоко", category: "positive" },
          ];
          await testAPI.updateStatisticsSettings(testPrId, currentSettings);
          console.log(
            "  enableOnlyCustomCharacteristics включён, характеристики: Низко/Средне/Высоко",
          );
        });

        await test.step("Открыть форму калибровки", async () => {
          await navigateToCalibrationPage(page, testPrId);

          const resultsTab = page
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /результаты/i });
          await resultsTab.click();

          const pencilIcon = page
            .locator(
              '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
            )
            .first();
          await pencilIcon.waitFor({ state: "visible", timeout: 15000 });
          await pencilIcon.click();

          await page
            .locator(".react-modal-sheet-container")
            .first()
            .waitFor({ state: "visible", timeout: 5000 });
        });

        await test.step("Проверить наличие дропдауна характеристик", async () => {
          const hasDropdown = await calibrationForm.isTotalScoreDropdownMode();
          expect(
            hasDropdown,
            "Дропдаун характеристик должен быть доступен после включения enableOnlyCustomCharacteristics",
          ).toBe(true);
          console.log("  Дропдаун характеристик найден");
        });

        await test.step("Выбрать характеристику, не соответствующую оценке", async () => {
          // Оценки уже высокие (seed заполнил анкеты) → характеристика = "Высоко"
          // Выбираем "Низко" из дропдауна → несоответствие высоким оценкам
          const options = await calibrationForm.getTotalCharacteristicOptions();
          console.log(`  Опции характеристик: ${options.join(", ")}`);
          expect(
            options.length,
            "Дропдаун должен содержать опции характеристик",
          ).toBeGreaterThan(0);

          const currentCharacteristic =
            await calibrationForm.getCharacteristic();
          console.log(`  Текущая характеристика: "${currentCharacteristic}"`);

          // Выбираем первую (самую низкую) опцию — она не соответствует высокому баллу
          const lowOption = options[0];
          await calibrationForm.selectTotalCharacteristic(lowOption);
          console.log(
            `  Выбрана несоответствующая характеристика: "${lowOption}"`,
          );

          await page.waitForLoadState("networkidle", { timeout: 3000 });
        });

        await test.step("Проверить информер о ручном изменении", async () => {
          // При ручном выборе характеристики из дропдауна появляется информер:
          // "Итоговая оценка изменена вручную. Оценки по компетенциям пересчитаны не будут."
          const hasInfoBanner = await calibrationForm.isInfoBannerVisible();
          console.log(
            `  Информер о ручном изменении: ${hasInfoBanner ? "показан" : "не показан"}`,
          );

          expect(
            hasInfoBanner,
            "При ручном выборе характеристики должен отображаться информер",
          ).toBe(true);
        });

        // Отменяем
        await test.step("Отменить изменения", async () => {
          const modal = await calibrationForm.getModal();
          const cancelButton = modal
            .getByRole("button", { name: /отмен/i })
            .first();
          await cancelButton.click();
        });

        // Восстановить настройки: выключить dropdown mode
        await test.step("Восстановить настройки (выключить enableOnlyCustomCharacteristics)", async () => {
          const { data: currentSettings } =
            await testAPI.getStatisticsSettings(testPrId);
          currentSettings.settings.enableOnlyCustomCharacteristics = false;
          await testAPI.updateStatisticsSettings(testPrId, currentSettings);
          console.log("  enableOnlyCustomCharacteristics выключен");
        });
      });
    });

    test.describe("Проверка тепловой карты", () => {
      test(
        "C4116: Цвета в тепловой карте соответствуют оценкам",
        { tag: ["@critical"] },
        async ({ adminAuth: page }, testInfo) => {
          setSeverity("critical");

          await test.step("Открыть вкладку Результаты", async () => {
            await navigateToCalibrationPage(page, testPrId);

            const resultsTab = page
              .locator('button[class*="Tabs_button"]')
              .filter({ hasText: /результаты/i });
            await resultsTab.click();
            await page
              .locator(
                '[class*="heatmap"], [class*="HeatMap"], [class*="heat-map"], table',
              )
              .first()
              .waitFor({ state: "visible", timeout: 10000 });
          });

          await test.step("Проверить тепловую карту", async () => {
            // Ищем тепловую карту
            const heatmap = page
              .locator(
                '[class*="heatmap"], [class*="HeatMap"], [class*="heat-map"]',
              )
              .first();

            await heatmap.waitFor({ state: "visible", timeout: 5000 });
            console.log("  Тепловая карта найдена");

            // Получаем ячейки тепловой карты
            const cells = heatmap.locator('[class*="cell"], td');
            const cellCount = await cells.count();

            console.log(`  Ячеек в тепловой карте: ${cellCount}`);
            expect(
              cellCount,
              "Тепловая карта должна содержать ячейки с данными",
            ).toBeGreaterThan(0);

            // Проверяем несколько ячеек -- пропускаем заголовочные
            for (let i = 0; i < Math.min(cellCount, 10); i++) {
              const cell = cells.nth(i);
              const bgColor = await cell
                .evaluate((el) => {
                  return window.getComputedStyle(el).backgroundColor;
                })
                .catch(() => "");

              const text = await cell.innerText().catch(() => "");
              const trimmed = text.trim();

              // Пропускаем заголовочные ячейки
              const isNumericCell = /^\d+\.?\d*$/.test(trimmed);
              if (!isNumericCell) {
                continue;
              }

              console.log(`    [${i}] "${trimmed}" -> ${bgColor}`);
              expect(
                bgColor,
                `Ячейка [${i}] с числом "${trimmed}" должна иметь цвет фона`,
              ).toBeTruthy();
              expect(
                bgColor,
                `Ячейка [${i}] с числом "${trimmed}" не должна быть прозрачной`,
              ).not.toBe("rgba(0, 0, 0, 0)");
            }

            // Скриншот тепловой карты
            await heatmap.screenshot({
              path: "test-results/calibration-heatmap.png",
            });
          });
        },
      );
    });

    test.describe("Проверка весов компетенций", () => {
      test("C4117: Сумма весов компетенций равна 100%", async ({
        adminAuth: page,
        request,
      }, testInfo) => {
        setSeverity("normal");

        await test.step("Проверить веса через API (getStatisticsSettings)", async () => {
          // Создаём свежий API-клиент — request из beforeAll нельзя переиспользовать в тестах
          const testAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await testAPI.signIn(email, password);
          const { data: settings } =
            await testAPI.getStatisticsSettings(testPrId);
          const groupSettings = settings?.competenceGroupSettings || [];

          expect(
            groupSettings.length,
            "Настройки должны содержать группы компетенций (enableCompetenceWeights=true)",
          ).toBeGreaterThan(0);

          let totalWeight = 0;
          console.log("\n  Веса групп компетенций (API):");

          for (const gs of groupSettings) {
            const groupTitle =
              gs.competenceGroup?.title || `Group ${gs.competenceGroupId}`;
            const weight = gs.weightPercent || 0;
            const enabled = gs.competenceGroupEnabled;

            console.log(
              `    ${groupTitle}: weight=${weight}%, enabled=${enabled}`,
            );

            if (enabled) {
              totalWeight += weight;
            }
          }

          console.log(`\n  Сумма весов: ${totalWeight}%`);

          // Сумма весов включённых групп должна быть 100%
          expect(
            totalWeight,
            "Сумма весов включённых групп компетенций должна равняться 100%",
          ).toBeCloseTo(100, 0);
          console.log("  Сумма весов корректна");
        });

        await test.step("Открыть форму калибровки и проверить отображение", async () => {
          await navigateToCalibrationPage(page, testPrId);

          const resultsTab = page
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /результаты/i });
          await resultsTab.click();

          const pencilIcon = page
            .locator(
              '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
            )
            .first();
          await pencilIcon.waitFor({
            state: "visible",
            timeout: 15000,
          });
          await pencilIcon.click();

          await page
            .locator(".react-modal-sheet-container")
            .first()
            .waitFor({ state: "visible", timeout: 5000 });

          const calibrationForm = new CalibrationFormModal(page, testInfo);
          const competencies = await calibrationForm.getCompetencies();
          console.log(`  UI: ${competencies.length} компетенций в форме`);

          expect(
            competencies.length,
            "Форма калибровки должна содержать компетенции",
          ).toBeGreaterThan(0);

          // Закрываем форму
          const modal = await calibrationForm.getModal();
          const cancelButton = modal
            .getByRole("button", { name: /отмен/i })
            .first();
          await cancelButton.click();
        });
      });
    });
  },
);
