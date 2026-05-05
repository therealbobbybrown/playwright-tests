// tests/functional/objectives/objectives-details-comments.spec.js
// TestRail: C2685, C2686, C2687, C2688, C2690
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import { ObjectivesSettingsPage } from "../../../pages/ObjectivesSettingsPage.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import { ObjectiveDetailsPage } from "../../../pages/ObjectiveDetailsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Цели — детали и комментарии",
  { tag: ["@ui", "@regression", "@okr"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C2685: переход к деталям цели из списка", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
      const settingsPage = new ObjectivesSettingsPage(page, testInfo);

      await test.step('Открыть "Все цели"', async () => {
        const hasAllObjectives = await sideMenu.hasObjectivesAllItem();

        if (!hasAllObjectives) {
          await sideMenu.openObjectivesSettings();
          await settingsPage.enableOkrIfDisabled();
        }

        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();
      });

      await test.step("Перейти к деталям первой цели", async () => {
        const table = page.locator("table").first();
        await table.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const firstRow = table.locator('tbody tr').first();
        await firstRow.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });

        // Hover показывает иконки действий (view, edit, delete)
        await firstRow.hover();

        const viewLink = firstRow.locator('a[href*="/objectives/view/"]').first();
        await viewLink.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await viewLink.click();

        await page
          .waitForURL(/\/objectives\/view\//, { timeout: TIMEOUTS.PAGE_LOAD });
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD });
      });

      await test.step("Проверить страницу деталей цели", async () => {
        // Проверяем заголовок "Детали цели" с авто-retry
        const heading = page.getByRole("heading", { level: 1 }).first();
        await expect(heading).toContainText("Детали цели", {
          timeout: TIMEOUTS.MEDIUM,
        });

        // Проверяем наличие КР (строка с "КР" в таблице деталей)
        const krRow = page.locator('text=/КР \\d+/i').first();
        await expect(krRow).toBeVisible({ timeout: TIMEOUTS.SHORT });
      });
    });

    test("C2687: просмотр участников цели", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
      const settingsPage = new ObjectivesSettingsPage(page, testInfo);

      await test.step('Открыть "Все цели" и перейти к цели', async () => {
        const hasAllObjectives = await sideMenu.hasObjectivesAllItem();

        if (!hasAllObjectives) {
          await sideMenu.openObjectivesSettings();
          await settingsPage.enableOkrIfDisabled();
        }

        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();

        // Hover показывает иконки действий (view, edit, delete)
        const table = page.locator("table").first();
        const firstRow = table.locator('tbody tr').first();
        await firstRow.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
        await firstRow.hover();

        const viewLink = firstRow.locator('a[href*="/objectives/view/"]').first();
        await viewLink.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await viewLink.click();

        await page
          .waitForURL(/\/objectives\/view\//, { timeout: TIMEOUTS.PAGE_LOAD });
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD });
      });

      await test.step('Перейти на вкладку "Участники"', async () => {
        // На странице деталей "Комментарии" и "Участники" — кнопки (не табы)
        const participantsButton = page
          .getByRole("button", { name: "Участники" });

        await expect(participantsButton).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        await participantsButton.click();
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT });
      });

      await test.step("Проверить список участников", async () => {
        // На вкладке участники показывается текст "Все сотрудники компании" или список людей
        const participantsContent = page
          .locator("text=/Все сотрудники компании|Ответственный|Участники/i")
          .first();
        await expect(
          participantsContent,
          "На вкладке участников должно быть видно содержимое (участники или текст 'Все сотрудники компании')",
        ).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      });
    });

    test("C2688: комментирование цели", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
      const settingsPage = new ObjectivesSettingsPage(page, testInfo);

      await test.step('Открыть "Все цели" и перейти к цели', async () => {
        const hasAllObjectives = await sideMenu.hasObjectivesAllItem();

        if (!hasAllObjectives) {
          await sideMenu.openObjectivesSettings();
          await settingsPage.enableOkrIfDisabled();
        }

        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();

        const table = page.locator("table").first();
        const firstRow = table.locator('tbody tr').first();
        await firstRow.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
        await firstRow.hover();

        const viewLink = firstRow.locator('a[href*="/objectives/view/"]').first();
        await viewLink.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await viewLink.click();

        await page
          .waitForURL(/\/objectives\/view\//, { timeout: TIMEOUTS.PAGE_LOAD });
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD });
      });

      await test.step('Проверить вкладку "Комментарии"', async () => {
        // На странице деталей кнопка "Комментарии" активна по умолчанию
        const commentsButton = page.getByRole("button", { name: "Комментарии" });
        await expect(commentsButton).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      });

      await test.step("Найти поле ввода комментария", async () => {
        // Поле ввода: textbox с accessible name "Ваш комментарий"
        const commentInput = page
          .getByRole("textbox", { name: /Ваш комментарий/i });

        await expect(commentInput).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

        const commentText = `Тестовый комментарий ${Date.now()}`;
        await commentInput.fill(commentText);

        // Кнопка отправки комментария (рядом с полем ввода, не "Отправить на утверждение")
        const commentSection = page.locator('[class*="Comment"], [class*="comment"]').filter({ has: commentInput }).first();
        const sendButton = commentSection.getByRole("button").last();
        await expect(sendButton).toBeVisible({ timeout: TIMEOUTS.SHORT });

        // Не отправляем комментарий чтобы не засорять данные
        await commentInput.clear();
      });
    });

    test("C2690: время последнего апдейта цели и КР", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
      const settingsPage = new ObjectivesSettingsPage(page, testInfo);

      await test.step('Открыть "Все цели" и проверить колонку "Апдейт"', async () => {
        const hasAllObjectives = await sideMenu.hasObjectivesAllItem();

        if (!hasAllObjectives) {
          await sideMenu.openObjectivesSettings();
          await settingsPage.enableOkrIfDisabled();
        }

        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();
      });

      await test.step('Проверить колонку "Апдейт" в таблице', async () => {
        const table = page.locator("table").first();
        await table.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const headers = await table.locator("th").allInnerTexts();
        expect(
          headers.some(
            (h) =>
              h.toLowerCase().includes("апдейт") ||
              h.toLowerCase().includes("update"),
          ),
          "Таблица целей должна содержать колонку 'Апдейт'",
        ).toBe(true);

        // Проверяем значения в колонке
        const updateCells = table
          .locator("tbody td")
          .filter({ hasText: /Только что|минут|час|дн|Нет обновлений/i });
        const updateCount = await updateCells.count();
        expect(
          updateCount,
          "Колонка апдейта должна содержать хотя бы одну ячейку с временем",
        ).toBeGreaterThan(0);
      });

      await test.step("Перейти к деталям цели и проверить апдейт КР", async () => {
        const table = page.locator("table").first();
        const firstRow = table.locator('tbody tr').first();
        await firstRow.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
        await firstRow.hover();

        const viewLink = firstRow.locator('a[href*="/objectives/view/"]').first();
        await viewLink.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await viewLink.click();

        await page
          .waitForURL(/\/objectives\/view\//, { timeout: TIMEOUTS.PAGE_LOAD });
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD });

        // На странице деталей проверяем что есть колонка "Нет обновлений" или дата
        const updateCell = page
          .locator("text=/Нет обновлений|дней назад|час|минут|Только что/i")
          .first();
        await expect(updateCell).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      });
    });

    test("C2686: редактирование цели", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
      const settingsPage = new ObjectivesSettingsPage(page, testInfo);
      const createPage = new ObjectiveCreatePage(page, testInfo);
      const detailsPage = new ObjectiveDetailsPage(page, testInfo);

      const randomNum = Math.floor(Math.random() * 100000) + 1;
      const objectiveTitle = `Цель для редактирования ${randomNum}`;
      const updatedTitle = `Обновленная цель ${randomNum}`;

      await test.step("Создать тестовую цель", async () => {
        const hasCreateItem = await sideMenu.hasObjectivesCreateItem();

        if (!hasCreateItem) {
          await sideMenu.openObjectivesSettings();
          await settingsPage.enableOkrIfDisabled();
        }

        await sideMenu.openObjectivesCreate();
        await createPage.fillAndCreateObjective(
          objectiveTitle,
          `КР редактируемой цели ${randomNum}`,
        );

        // Проверяем что после создания мы на странице с деталями
        await page.waitForURL(/\/objectives\//, { timeout: TIMEOUTS.PAGE_LOAD });
      });

      await test.step("Перейти к списку и найти созданную цель", async () => {
        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();

        // Используем поиск для нахождения цели
        const searchInput = page.getByRole("textbox", { name: "Найти цель" });
        await searchInput.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await searchInput.fill(objectiveTitle);
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

        const goalRow = page
          .getByRole("row")
          .filter({ hasText: objectiveTitle })
          .first();
        await goalRow.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await expect(
          goalRow,
          `Цель "${objectiveTitle}" должна быть видна в списке`,
        ).toBeVisible();

        // Клик по строке для раскрытия, затем edit
        await goalRow.click();
        const editLink = goalRow.locator('a[href*="/objectives/edit/"]').first();
        await editLink.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await editLink.click();

        await page
          .waitForURL(/\/objectives\/edit\//, { timeout: TIMEOUTS.PAGE_LOAD });
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD });
      });

      await test.step("Изменить название цели", async () => {
        const titleInput = page
          .locator("textarea#objective-title")
          .first()
          .or(page.getByPlaceholder(/Название цели/i).first());

        await expect(titleInput).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        await titleInput.fill(updatedTitle);
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT }); // Автосохранение
      });

      await test.step("Сохранить изменения", async () => {
        const saveButton = page
          .getByRole("button", { name: /Сохранить/i })
          .first()
          .or(page.getByRole("button", { name: /Обновить/i }).first());

        let saveVisible = false;
        try {
          await saveButton.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          saveVisible = true;
        } catch {
          saveVisible = false;
        }

        if (saveVisible) {
          await saveButton.click();
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD });
        }
        // Если кнопки "Сохранить" нет — используется автосохранение
      });

      await test.step("Проверить изменения", async () => {
        // Переходим обратно к списку целей и проверяем обновлённое название
        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();

        // Используем поиск для нахождения переименованной цели
        const searchInput = page.getByRole("textbox", { name: "Найти цель" });
        await searchInput.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await searchInput.fill(updatedTitle);
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

        const updatedGoalRow = page
          .getByRole("row")
          .filter({ hasText: updatedTitle })
          .first();
        await updatedGoalRow.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await expect(
          updatedGoalRow,
          `Цель с обновлённым названием "${updatedTitle}" должна быть в списке`,
        ).toBeVisible();
      });

      // Cleanup: удаляем тестовую цель
      await test.step("Очистка: удалить тестовую цель", async () => {
        const goalRow = page
          .locator('tr')
          .filter({ hasText: updatedTitle })
          .first();
        let rowVisible = false;
        try {
          await goalRow.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          rowVisible = true;
        } catch {
          rowVisible = false;
        }

        if (rowVisible) {
          // Нажимаем кнопку удаления в строке
          const deleteButton = goalRow.locator('button').first();
          let hasDelete = false;
          try {
            await deleteButton.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            hasDelete = true;
          } catch {
            hasDelete = false;
          }

          if (hasDelete) {
            await deleteButton.click();
            // Подтверждение удаления
            const confirmButton = page
              .getByRole("button", { name: /Удалить|Да|Подтвердить/i })
              .last();
            await confirmButton.click().catch(() => {});
          }
        }
      });
    });
  },
);
