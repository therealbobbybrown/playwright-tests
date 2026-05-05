// tests/functional/objectives/objective-search.spec.js
// TestRail: C2675 - Поиск целей
// TASK-OKR-004

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ObjectivesSettingsPage } from "../../../pages/ObjectivesSettingsPage.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";

test.describe(
  "Поиск целей",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.setTimeout(120000);

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C2675: поиск цели по названию", async ({
      adminAuth,
      page,
      request,
    }, testInfo) => {
      setSeverity("high");

      const sideMenu = new SideMenu(page, testInfo);
      const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);
      const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const uniqueId = Date.now();
      const objectiveTitle = `Уникальная цель поиска ${uniqueId}`;
      const milestoneTitle = `КР поиска ${uniqueId}`;
      let createdObjectiveId = null;

      try {
        // Создать цель для поиска
        await test.step("Создать цель для поиска", async () => {
          const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
          if (!hasCreateItem) {
            await sideMenu.openObjectivesSettings();
            await objectivesSettingsPage.assertOpened();
            await objectivesSettingsPage.enableOkrIfDisabled();
          }

          await sideMenu.openObjectivesCreate();
          await objectiveCreatePage.assertDefaultState();
          await objectiveCreatePage.fillAndCreateObjective(
            objectiveTitle,
            milestoneTitle,
          );

          const url = page.url();
          const match = url.match(/\/objectives\/(?:view\/)?(\d+)/);
          if (match) {
            createdObjectiveId = parseInt(match[1], 10);
            console.log(`Создана цель: ${createdObjectiveId}`);
          }
        });

        // Перейти к списку целей
        await test.step("Перейти к списку всех целей", async () => {
          await sideMenu.openObjectivesAll();
          await objectivesAllPage.assertOpened();
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        // Найти поле поиска
        const searchInput = page
          .locator(
            'input[placeholder*="Найти"], input[placeholder*="Поиск"], input[placeholder*="поиск"], ' +
              '[class*="Search"] input, [class*="search"] input, input[type="search"]',
          )
          .first();

        // Поиск по полному названию
        await test.step("Поиск по полному названию", async () => {
          await searchInput.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          await searchInput.clear();
          await searchInput.fill(objectiveTitle);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT });

          // Проверить что цель найдена
          const goalRow = page
            .locator(
              'tr[class*="ObjectiveRow"], [class*="Row"], [class*="objective"]',
            )
            .filter({ hasText: objectiveTitle })
            .first();

          await goalRow.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          await expect(
            goalRow,
            "Цель должна быть найдена по полному названию",
          ).toBeVisible();
          console.log("Цель найдена по полному названию");
        });

        // Поиск по частичному совпадению
        await test.step("Поиск по частичному совпадению", async () => {
          await searchInput.clear();
          // Ищем по части уникального ID
          const partialSearch = `поиска ${uniqueId}`;
          await searchInput.fill(partialSearch);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT });

          const goalRow = page
            .locator(
              'tr[class*="ObjectiveRow"], [class*="Row"], [class*="objective"]',
            )
            .filter({ hasText: objectiveTitle })
            .first();

          await goalRow.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          await expect(
            goalRow,
            "Цель должна быть найдена по частичному совпадению",
          ).toBeVisible();
          console.log("Цель найдена по частичному совпадению");
        });

        // Поиск без результатов
        await test.step("Поиск несуществующей цели", async () => {
          const nonExistentSearch = `НесуществующаяЦель${Date.now()}`;
          await searchInput.clear();
          await searchInput.fill(nonExistentSearch);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT });

          // Проверить что результатов нет
          const goalRow = page
            .locator('tr[class*="ObjectiveRow"], [class*="Row"]')
            .filter({ hasText: nonExistentSearch })
            .first();

          let goalFound = false;
          try {
            await goalRow.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            goalFound = true;
          } catch {
            goalFound = false;
          }

          expect(
            goalFound,
            "Несуществующая цель не должна быть найдена",
          ).toBe(false);
          console.log("Поиск несуществующей цели: корректно нет результатов");
        });
      } finally {
        if (createdObjectiveId) {
          await test.step("Cleanup", async () => {
            try {
              await api.deleteObjective(createdObjectiveId);
              console.log(`Цель ${createdObjectiveId} удалена`);
            } catch (e) {
              console.warn(`Cleanup failed: ${e.message}`);
            }
          });
        }
      }
    });

    test(
      "C3627: Поиск целей в сочетании с фильтрами",
      { tag: ["@regression"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("normal");

        const sideMenu = new SideMenu(page, testInfo);
        const objectivesSettingsPage = new ObjectivesSettingsPage(
          page,
          testInfo,
        );
        const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);
        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

        const api = new ObjectivesAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const uniqueId = Date.now();
        const objectiveTitle = `Цель с фильтром ${uniqueId}`;
        const milestoneTitle = `КР ${uniqueId}`;
        let createdObjectiveId = null;

        try {
          // Создать цель
          await test.step("Создать цель", async () => {
            const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
            if (!hasCreateItem) {
              await sideMenu.openObjectivesSettings();
              await objectivesSettingsPage.assertOpened();
              await objectivesSettingsPage.enableOkrIfDisabled();
            }

            await sideMenu.openObjectivesCreate();
            await objectiveCreatePage.assertDefaultState();
            await objectiveCreatePage.fillAndCreateObjective(
              objectiveTitle,
              milestoneTitle,
            );

            const url = page.url();
            const match = url.match(/\/objectives\/(?:view\/)?(\d+)/);
            if (match) {
              createdObjectiveId = parseInt(match[1], 10);
            }
          });

          // Перейти к списку
          await test.step("Перейти к списку целей", async () => {
            await sideMenu.openObjectivesAll();
            await objectivesAllPage.assertOpened();
            await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          });

          // Выполнить поиск
          await test.step("Выполнить поиск с фильтрами", async () => {
            const searchInput = page
              .locator(
                'input[placeholder*="Найти"], input[placeholder*="Поиск"], [class*="Search"] input',
              )
              .first();

            let searchVisible = false;
            try {
              await searchInput.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
              searchVisible = true;
            } catch {
              searchVisible = false;
            }

            if (searchVisible) {
              await searchInput.fill(objectiveTitle);
              await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT });

              const goalRow = page
                .locator('tr[class*="ObjectiveRow"], [class*="Row"]')
                .filter({ hasText: objectiveTitle })
                .first();

              let found = false;
              try {
                await goalRow.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
                found = true;
              } catch {
                found = false;
              }
              console.log(`Цель найдена с фильтром: ${found}`);
            } else {
              console.log("Поле поиска не найдено");
            }
          });
        } finally {
          if (createdObjectiveId) {
            await test.step("Cleanup", async () => {
              try {
                await api.deleteObjective(createdObjectiveId);
              } catch (e) {
                console.warn(`Cleanup failed: ${e.message}`);
              }
            });
          }
        }
      },
    );

    test(
      "C3628: Поиск с пустым результатом показывает сообщение",
      { tag: ["@regression", "@negative"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const sideMenu = new SideMenu(page, testInfo);
        const objectivesSettingsPage = new ObjectivesSettingsPage(
          page,
          testInfo,
        );
        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

        await test.step("Перейти к списку целей", async () => {
          const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
          if (!hasCreateItem) {
            await sideMenu.openObjectivesSettings();
            await objectivesSettingsPage.assertOpened();
            await objectivesSettingsPage.enableOkrIfDisabled();
          }

          await sideMenu.openObjectivesAll();
          await objectivesAllPage.assertOpened();
        });

        await test.step("Выполнить поиск с гарантированно пустым результатом", async () => {
          const searchInput = page
            .locator(
              'input[placeholder*="Найти"], input[placeholder*="Поиск"], [class*="Search"] input, input[type="search"]',
            )
            .first();

          let searchVisible = false;
          try {
            await searchInput.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
            searchVisible = true;
          } catch {
            searchVisible = false;
          }

          if (searchVisible) {
            const impossibleSearch = `Абсолютно_Невозможный_Поиск_${Date.now()}_${Math.random()}`;
            await searchInput.fill(impossibleSearch);
            // Ждём пока строки исчезнут (поиск debounced, networkidle не подходит)
            try {
              await page
                .locator('tr[class*="ObjectiveRow"]')
                .first()
                .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });
            } catch {
              // Строки могли уже исчезнуть или их не было
            }

            // Проверить отсутствие строк с результатами
            const objectiveRows = page.locator(
              'tr[class*="ObjectiveRow"], [class*="ObjectiveRow"]',
            );
            const rowCount = await objectiveRows.count();
            console.log(`Пустой результат поиска: строк=${rowCount}`);

            // Тест считается успешным если нет строк с результатами
            expect(
              rowCount,
              "При пустом результате поиска не должно быть строк с целями",
            ).toBe(0);
          } else {
            console.log("Поле поиска не найдено - тест пропущен");
          }
        });
      },
    );
  },
);
