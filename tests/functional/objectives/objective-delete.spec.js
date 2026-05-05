// tests/functional/objectives/objective-delete.spec.js
// TestRail: C2684 - Список целей удаление цели
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ObjectivesSettingsPage } from "../../../pages/ObjectivesSettingsPage.js";
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
  "Удаление цели из списка (OKR)",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C2684: удаление цели из списка целей", async ({
      adminAuth,
      page,
      request,
    }, testInfo) => {
      test.setTimeout(120_000);
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const userId = api.getCurrentUserId();
      if (!userId) {
        throw new Error("Не удалось получить userId после signIn — проверь credentials");
      }

      const uniqueId = Date.now();
      const objectiveTitle = `Цель для удаления ${uniqueId}`;
      let createdObjectiveId = null;

      await test.step("Включить OKR", async () => {
        const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
        if (!hasCreateItem) {
          await sideMenu.openObjectivesSettings();
          await objectivesSettingsPage.assertOpened();
          await objectivesSettingsPage.enableOkrIfDisabled();
        }
      });

      await test.step("Создать цель для последующего удаления через API", async () => {
        const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
        const { response, data } = await api.saveObjective({
          title: objectiveTitle,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-del-${uniqueId}`,
              title: `КР удаляемой цели ${uniqueId}`,
              type: "percent",
              weight: 1,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });

        expect(response.ok(), `Создание цели через API вернуло ${response.status()}`).toBe(true);
        createdObjectiveId = data?.id;
        if (!createdObjectiveId) {
          throw new Error(`API не вернул ID созданной цели. Ответ: ${JSON.stringify(data)}`);
        }
        console.log(`Создана цель через API: id=${createdObjectiveId}`);
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
        await searchInput.fill(objectiveTitle);
        await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

        const goalRow = page
          .getByRole("row")
          .filter({ hasText: objectiveTitle });
        await goalRow.first().waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(
          goalRow.first(),
          `Цель "${objectiveTitle}" должна быть видна в списке`,
        ).toBeVisible();
      });

      await test.step("Раскрыть строку цели и удалить", async () => {
        const goalRow = page
          .getByRole("row")
          .filter({ hasText: objectiveTitle })
          .first();

        // Клик по строке раскрывает действия (иконки без текста)
        await goalRow.click();

        // Ячейка действий содержит: button(delete-icon) + link(edit) + link(view)
        // Находим ячейку с ссылкой на edit, затем кликаем button внутри неё
        const actionCell = goalRow.locator("td").filter({
          has: page.locator('a[href*="/objectives/edit/"]'),
        });
        const deleteButton = actionCell.locator("button").first();
        await expect(
          deleteButton,
          "Кнопка удаления (иконка) должна появиться после раскрытия строки",
        ).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        await deleteButton.click();
      });

      await test.step("Подтвердить удаление в диалоге", async () => {
        const dialog = page.getByRole("dialog");
        await dialog.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        await expect(
          dialog,
          "Диалог подтверждения удаления должен появиться",
        ).toContainText(/удалить цель/i);

        const confirmButton = dialog.getByRole("button", { name: "Удалить" });
        await confirmButton.click();

        createdObjectiveId = null; // Цель удалена, cleanup не нужен
      });

      await test.step("Проверить что цель удалена из списка", async () => {
        await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

        // Цель не должна присутствовать в списке
        const goalRow = page
          .getByRole("row")
          .filter({ hasText: objectiveTitle });

        await expect(
          goalRow,
          `Цель "${objectiveTitle}" НЕ должна быть видна в списке после удаления`,
        ).toHaveCount(0);
      });

      // Cleanup — только если удаление UI не прошло (createdObjectiveId не был обнулён)
      if (createdObjectiveId) {
        await api.deleteObjective(createdObjectiveId).catch((e) => {
          console.warn(`Cleanup failed: ${e.message}`);
        });
      }
    });
  },
);
