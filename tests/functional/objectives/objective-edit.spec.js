// tests/functional/objectives/objective-edit.spec.js
// TestRail: C2686 - Редактирование цели, C2683 - Переход к редактированию цели
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ObjectivesSettingsPage } from "../../../pages/ObjectivesSettingsPage.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Редактирование цели (OKR)",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C2686: Редактирование цели из списка", async ({
      adminAuth,
      page,
      request,
    }, testInfo) => {
      test.setTimeout(120_000);
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);
      const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const uniqueId = Date.now();
      const originalTitle = `Цель для редактирования ${uniqueId}`;
      const updatedTitle = `Обновленная цель ${uniqueId}`;
      const milestoneTitle = `КР редактируемой цели ${uniqueId}`;
      let createdObjectiveId = null;

      try {
        await test.step("Создать цель для последующего редактирования", async () => {
          const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
          if (!hasCreateItem) {
            await sideMenu.openObjectivesSettings();
            await objectivesSettingsPage.assertOpened();
            await objectivesSettingsPage.enableOkrIfDisabled();
          }
          await sideMenu.openObjectivesCreate();
          await objectiveCreatePage.fillAndCreateObjective(
            originalTitle,
            milestoneTitle,
          );

          // Извлекаем ID созданной цели из URL
          const url = page.url();
          const match = url.match(/\/objectives\/(?:view\/)?(\d+)/);
          expect(match, "URL должен содержать ID созданной цели").toBeTruthy();
          createdObjectiveId = parseInt(match[1], 10);
          console.log(`Создана цель: ${createdObjectiveId}`);
        });

        await test.step("Перейти к списку целей и найти созданную цель", async () => {
          await sideMenu.openObjectivesAll();
          await objectivesAllPage.assertOpened();

          // Используем поиск для нахождения цели
          const searchInput = page.getByRole("textbox", { name: "Найти цель" });
          await searchInput.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await searchInput.fill(originalTitle);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          // Проверяем что цель видна в таблице
          const goalRow = page
            .getByRole("row")
            .filter({ hasText: originalTitle });
          await goalRow.first().waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await expect(
            goalRow.first(),
            `Цель "${originalTitle}" должна быть видна в списке`,
          ).toBeVisible();
        });

        await test.step("Раскрыть строку цели и перейти к редактированию", async () => {
          // Клик по строке раскрывает её и показывает ссылки edit/view
          const goalRow = page
            .getByRole("row")
            .filter({ hasText: originalTitle })
            .first();
          await goalRow.click();

          // После раскрытия появляется ссылка на редактирование
          const editLink = goalRow.locator('a[href*="/edit/"]');
          await editLink.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await expect(editLink, "Ссылка на редактирование должна быть видна").toBeVisible();

          await editLink.click();

          // Ждём перехода на страницу редактирования
          await page.waitForURL(/\/objectives\/edit\/\d+/, {
            timeout: TIMEOUTS.PAGE_LOAD,
          });
        });

        await test.step("Проверить что открылась страница редактирования", async () => {
          const heading = page.getByRole("heading", {
            name: /Изменить цель/,
            level: 1,
          });
          await heading.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await expect(heading, "Заголовок 'Изменить цель' должен быть виден").toBeVisible();
        });

        await test.step("Изменить название цели", async () => {
          // На странице редактирования поле имеет placeholder "Новая цель"
          const titleInput = page.getByRole("textbox", { name: "Новая цель" });
          await titleInput.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });

          // Проверяем что в поле текущее название
          await expect(titleInput).toHaveValue(originalTitle);

          await titleInput.clear();
          await titleInput.fill(updatedTitle);
          await expect(titleInput).toHaveValue(updatedTitle);
        });

        await test.step("Сохранить изменения", async () => {
          const saveButton = page.getByRole("button", { name: "Сохранить" });
          await expect(saveButton, "Кнопка 'Сохранить' должна быть видна").toBeVisible();
          await saveButton.click();

          // Ждём навигации обратно к списку или к странице просмотра
          try {
            await page.waitForURL(/\/objectives\/(?:view\/\d+|\?|$)/, {
              timeout: TIMEOUTS.PAGE_LOAD,
            });
          } catch {
            // Может остаться на странице редактирования с индикатором "Сохранено"
          }

          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить что изменения сохранены", async () => {
          // Переходим к списку целей
          await sideMenu.openObjectivesAll();
          await objectivesAllPage.assertOpened();

          // Ищем цель с обновленным названием
          const searchInput = page.getByRole("textbox", { name: "Найти цель" });
          await searchInput.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await searchInput.fill(updatedTitle);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          const updatedGoalRow = page
            .getByRole("row")
            .filter({ hasText: updatedTitle });
          await updatedGoalRow.first().waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await expect(
            updatedGoalRow.first(),
            "Цель с обновленным названием должна быть видна",
          ).toBeVisible();

          // Проверяем что цели со старым названием нет
          await searchInput.clear();
          await searchInput.fill(originalTitle);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          const oldGoalRow = page
            .getByRole("row")
            .filter({ hasText: originalTitle });
          // Ждём чтобы убедиться что старая цель НЕ появляется
          let oldRowVisible = false;
          try {
            await oldGoalRow.first().waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            oldRowVisible = true;
          } catch {
            // строка со старым названием не появилась — это ожидаемое поведение
          }
          expect(
            oldRowVisible,
            "Цель со старым названием НЕ должна быть в списке",
          ).toBe(false);
        });
      } finally {
        // Cleanup: удаляем тестовую цель через API
        if (createdObjectiveId) {
          await test.step("Очистка: удалить тестовую цель через API", async () => {
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

    test("C2683: Переход к редактированию цели из списка", async ({
      adminAuth,
      page,
      request,
    }, testInfo) => {
      test.setTimeout(120_000);
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);
      const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const uniqueId = Date.now();
      const objectiveTitle = `Цель навигации ${uniqueId}`;
      const milestoneTitle = `КР навигации ${uniqueId}`;
      let createdObjectiveId = null;

      try {
        await test.step("Создать цель для теста навигации", async () => {
          const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
          if (!hasCreateItem) {
            await sideMenu.openObjectivesSettings();
            await objectivesSettingsPage.assertOpened();
            await objectivesSettingsPage.enableOkrIfDisabled();
          }
          await sideMenu.openObjectivesCreate();
          await objectiveCreatePage.fillAndCreateObjective(
            objectiveTitle,
            milestoneTitle,
          );

          const url = page.url();
          const match = url.match(/\/objectives\/(?:view\/)?(\d+)/);
          expect(match, "URL должен содержать ID созданной цели").toBeTruthy();
          createdObjectiveId = parseInt(match[1], 10);
        });

        await test.step("Перейти к списку целей", async () => {
          await sideMenu.openObjectivesAll();
          await objectivesAllPage.assertOpened();
        });

        await test.step("Найти цель и раскрыть строку кликом", async () => {
          // Используем поиск
          const searchInput = page.getByRole("textbox", { name: "Найти цель" });
          await searchInput.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await searchInput.fill(objectiveTitle);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          const goalRow = page
            .getByRole("row")
            .filter({ hasText: objectiveTitle })
            .first();
          await goalRow.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await expect(goalRow, "Цель должна быть видна в списке").toBeVisible();

          // Клик по строке раскрывает её
          await goalRow.click();
        });

        await test.step("Проверить наличие ссылки редактирования и кнопки удаления", async () => {
          const goalRow = page
            .getByRole("row")
            .filter({ hasText: objectiveTitle })
            .first();

          // После раскрытия строки появляются ссылки на edit и view, а также кнопка удаления
          const editLink = goalRow.locator('a[href*="/edit/"]');
          await editLink.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await expect(editLink, "Ссылка на редактирование должна быть видна").toBeVisible();

          const viewLink = goalRow.locator('a[href*="/view/"]');
          await expect(viewLink, "Ссылка на просмотр должна быть видна").toBeVisible();

          // Проверяем что ссылка ведет на правильный URL
          const editHref = await editLink.getAttribute("href");
          expect(
            editHref,
            "Ссылка редактирования должна содержать /edit/ и ID",
          ).toMatch(/\/objectives\/edit\/\d+/);
        });

        await test.step("Перейти по ссылке редактирования", async () => {
          const goalRow = page
            .getByRole("row")
            .filter({ hasText: objectiveTitle })
            .first();
          const editLink = goalRow.locator('a[href*="/edit/"]');

          await editLink.click();

          // Ждём перехода на страницу редактирования
          await page.waitForURL(/\/objectives\/edit\/\d+/, {
            timeout: TIMEOUTS.PAGE_LOAD,
          });
        });

        await test.step("Проверить что открылась страница редактирования цели", async () => {
          // Заголовок "Изменить цель"
          const heading = page.getByRole("heading", {
            name: /Изменить цель/,
            level: 1,
          });
          await heading.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await expect(heading, "Заголовок 'Изменить цель' должен быть виден").toBeVisible();

          // Поле названия содержит название нашей цели
          const titleInput = page.getByRole("textbox", { name: "Новая цель" });
          await titleInput.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await expect(titleInput).toHaveValue(objectiveTitle);

          // Кнопки "Сохранить" и "Отмена"
          await expect(
            page.getByRole("button", { name: "Сохранить" }),
            "Кнопка 'Сохранить' должна быть видна",
          ).toBeVisible();
          await expect(
            page.getByRole("button", { name: "Отмена" }),
            "Кнопка 'Отмена' должна быть видна",
          ).toBeVisible();
        });
      } finally {
        if (createdObjectiveId) {
          await test.step("Очистка: удалить тестовую цель через API", async () => {
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
  },
);
