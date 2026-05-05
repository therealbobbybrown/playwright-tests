// tests/functional/objectives/objective-draft-save.spec.js
// TestRail: C2662 - Сохранение черновика цели, C2663 - Автосохранение цели
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ObjectivesSettingsPage } from "../../../pages/ObjectivesSettingsPage.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials, getWorkerAdminRole } from "../../utils/credentials.js";

test.describe(
  "Черновики и автосохранение целей (OKR)",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    // Оба теста используют один аккаунт admin для создания черновиков;
    // параллельное выполнение вызывает конфликт автосохранения
    test.describe.configure({ mode: "serial" });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C2662: Сохранение черновика цели при отмене создания", async ({
      adminAuth,
      page,
      request,
    }, testInfo) => {
      setSeverity("normal");

      const sideMenu = new SideMenu(page, testInfo);
      const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);
      const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);

      const api = new ObjectivesAPI(request);
      const role = getWorkerAdminRole(testInfo.parallelIndex);
      const { email, password } = getCredentials(role);
      await api.signIn(email, password);

      const uniqueId = Date.now();
      const draftTitle = `Черновик отмена ${uniqueId}`;
      let draftObjectiveId = null;

      try {
        await test.step('Открыть "Создать цель"', async () => {
          const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
          if (!hasCreateItem) {
            await sideMenu.openObjectivesSettings();
            await objectivesSettingsPage.assertOpened();
            await objectivesSettingsPage.enableOkrIfDisabled();
          }
          await sideMenu.openObjectivesCreate();
        });

        await test.step("Заполнить название и дождаться автосохранения", async () => {
          // Заполняем уникальное название для идентификации
          await objectiveCreatePage.objectiveTitleTextarea.fill(draftTitle);

          // Blur через клик вне поля (Tab не всегда триггерит autosave)
          // + перехватываем ответ autosave API
          const autosavePromise = page.waitForResponse(
            (resp) =>
              resp.url().includes("/private/objectives") &&
              resp.request().method() === "POST" &&
              resp.status() < 400,
            { timeout: TIMEOUTS.MEDIUM },
          );

          await objectiveCreatePage.clickOutside();

          const autosaveResp = await autosavePromise.catch(() => null);
          if (autosaveResp) {
            console.log(`Автосохранение сработало: ${autosaveResp.status()}`);
          } else {
            console.warn("Автосохранение не перехвачено — ждём networkidle");
            await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          }
        });

        await test.step("Уйти со страницы создания через меню", async () => {
          await sideMenu.openObjectivesAll();

          // Возможен диалог подтверждения ухода
          const confirmDialog = page
            .locator('dialog, [role="dialog"], [class*="Modal"]')
            .filter({ hasText: /покинуть|уйти|сохран|leave|unsaved/i });

          let dialogVisible = false;
          try {
            await confirmDialog.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            dialogVisible = true;
          } catch {
            // Диалог не появился — продолжаем
          }

          if (dialogVisible) {
            // Ищем кнопку "Покинуть" / "Уйти" / "Leave"
            const leaveButton = page
              .getByRole("button", { name: /покинуть|уйти|leave/i })
              .first();

            let leaveVisible = false;
            try {
              await leaveButton.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
              leaveVisible = true;
            } catch {
              // Кнопка не найдена
            }

            if (leaveVisible) {
              await leaveButton.click();
            } else {
              // Fallback: нажать любую кнопку подтверждения в диалоге
              const anyConfirm = confirmDialog
                .getByRole("button")
                .first();

              let anyConfirmVisible = false;
              try {
                await anyConfirm.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
                anyConfirmVisible = true;
              } catch {
                // Кнопка не найдена
              }

              if (anyConfirmVisible) {
                await anyConfirm.click();
              } else {
                await page.keyboard.press("Escape");
              }
            }
          }

          // Ждём навигации на страницу целей
          await page.waitForURL(/objectives/, { timeout: TIMEOUTS.MEDIUM });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить наличие черновика через API", async () => {
          const { data: drafts } = await api.getDraftObjectives({ limit: 500 });
          const draftItems = drafts?.items || (Array.isArray(drafts) ? drafts : []);

          expect(
            draftItems.length,
            "Должен существовать хотя бы один черновик",
          ).toBeGreaterThan(0);

          // Ищем черновик с нашим уникальным названием
          const ourDraft = draftItems.find((d) =>
            d.title?.includes(uniqueId.toString()),
          );

          expect(
            ourDraft,
            `Черновик "${draftTitle}" должен быть сохранён при уходе со страницы`,
          ).toBeTruthy();

          if (ourDraft) {
            draftObjectiveId = ourDraft.id;
            expect(ourDraft.title).toContain(draftTitle);
            console.log(
              `Черновик найден: id=${ourDraft.id}, title="${ourDraft.title}"`,
            );
          }
        });
      } finally {
        await test.step("Cleanup: удалить черновик", async () => {
          try {
            if (draftObjectiveId) {
              await api.deleteObjective(draftObjectiveId);
              console.log(`Cleanup: черновик ${draftObjectiveId} удалён`);
            } else {
              const { data: drafts } = await api.getDraftObjectives({
                limit: 500,
              });
              const draftItems = drafts?.items || (Array.isArray(drafts) ? drafts : []);
              const ourDraft = draftItems.find((d) =>
                d.title?.includes(uniqueId.toString()),
              );
              if (ourDraft) {
                await api.deleteObjective(ourDraft.id);
                console.log(`Cleanup: черновик ${ourDraft.id} удалён`);
              }
            }
          } catch (e) {
            console.warn(`Cleanup failed: ${e.message}`);
          }
        });
      }
    });

    test("C2663: Автосохранение цели при заполнении полей", async ({
      adminAuth,
      page,
      request,
    }, testInfo) => {
      setSeverity("normal");

      const sideMenu = new SideMenu(page, testInfo);
      const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);
      const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);

      const api = new ObjectivesAPI(request);
      const role = getWorkerAdminRole(testInfo.parallelIndex);
      const { email, password } = getCredentials(role);
      await api.signIn(email, password);

      const uniqueId = Date.now();
      const objectiveTitle = `Автосохраняемая цель ${uniqueId}`;
      let draftObjectiveId = null;

      try {
        await test.step('Открыть "Создать цель"', async () => {
          const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
          if (!hasCreateItem) {
            await sideMenu.openObjectivesSettings();
            await objectivesSettingsPage.assertOpened();
            await objectivesSettingsPage.enableOkrIfDisabled();
          }
          await sideMenu.openObjectivesCreate();
        });

        await test.step("Заполнить название цели и дождаться автосохранения", async () => {
          await objectiveCreatePage.objectiveTitleTextarea.fill(objectiveTitle);

          // Blur - Tab для потери фокуса и триггера автосохранения
          await page.keyboard.press("Tab");
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Добавить КР и дождаться автосохранения", async () => {
          await objectiveCreatePage.addMilestoneButton.scrollIntoViewIfNeeded();
          await objectiveCreatePage.addMilestoneButton.click();
          await objectiveCreatePage.milestoneTitleTextarea.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await objectiveCreatePage.milestoneTitleTextarea.fill(
            `КР автосохранение ${uniqueId}`,
          );

          // Blur для триггера автосохранения
          await page.keyboard.press("Tab");
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Изменить уровень цели", async () => {
          let hasTeamButton = false;
          try {
            await objectiveCreatePage.teamLevelButton.waitFor({
              state: "visible",
              timeout: TIMEOUTS.SHORT,
            });
            hasTeamButton = true;
          } catch {
            // Кнопка не найдена — пропускаем
          }

          if (hasTeamButton) {
            await objectiveCreatePage.teamLevelButton.click();
            await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          }
        });

        await test.step("Перейти к списку целей и открыть черновики", async () => {
          await sideMenu.openObjectivesAll();

          // Обработка диалога подтверждения ухода
          const confirmDialog = page
            .locator('dialog, [role="dialog"], [class*="Modal"]')
            .filter({ hasText: /покинуть|уйти|сохран|leave|unsaved/i });

          let dialogVisible = false;
          try {
            await confirmDialog.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            dialogVisible = true;
          } catch {
            // Диалог не появился
          }

          if (dialogVisible) {
            const leaveButton = page
              .getByRole("button", { name: /покинуть|уйти|leave/i })
              .first();

            let leaveVisible = false;
            try {
              await leaveButton.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
              leaveVisible = true;
            } catch {
              // Кнопка не найдена
            }

            if (leaveVisible) {
              await leaveButton.click();
            } else {
              await page.keyboard.press("Escape");
            }
          }

          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          // Ждём появления вкладки черновиков
          const draftsTab = page
            .getByRole("tab", { name: /черновик/i })
            .first()
            .or(
              page
                .getByRole("button", { name: /черновик|Мои черновики/i })
                .first(),
            );

          let hasDrafts = false;
          try {
            await draftsTab.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
            hasDrafts = true;
          } catch {
            // Вкладка черновиков не найдена
          }

          if (hasDrafts) {
            await draftsTab.click();
            await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          }
        });

        await test.step("Проверить что черновик сохранен с данными", async () => {
          // Сначала проверяем в UI
          const draftRow = page
            .locator('tr, [class*="Row"], [class*="card"]')
            .filter({ hasText: objectiveTitle })
            .first();

          let draftRowVisible = false;
          try {
            await draftRow.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
            draftRowVisible = true;
          } catch {
            // Черновик не найден в UI
          }

          if (draftRowVisible) {
            console.log(`Черновик "${objectiveTitle}" найден в UI`);
            expect(
              draftRowVisible,
              "Черновик с заданным названием должен быть виден в списке черновиков",
            ).toBe(true);

            // Извлекаем ID для cleanup
            const draftLink = draftRow.locator('a[href*="objectives"]').first();
            const href = await draftLink.getAttribute("href") ?? "";
            const match = href?.match(/\/objectives\/(\d+)/);
            if (match) {
              draftObjectiveId = parseInt(match[1], 10);
            }
          } else {
            // Fallback: проверяем через API
            console.log("Черновик не найден в UI, проверяем через API");
            const { data: drafts } = await api.getDraftObjectives({
              limit: 500,
            });

            const draftItems = drafts?.items || (Array.isArray(drafts) ? drafts : []);
            const ourDraft = draftItems.find((d) =>
              d.title?.includes(uniqueId.toString()),
            );

            expect(
              ourDraft,
              `Черновик с uniqueId=${uniqueId} должен существовать в API`,
            ).toBeTruthy();

            if (ourDraft) {
              draftObjectiveId = ourDraft.id;
              expect(ourDraft.title).toContain(objectiveTitle);
              console.log(`Черновик найден через API: id=${ourDraft.id}`);
            }
          }
        });
      } finally {
        // Cleanup: удалить созданный черновик
        await test.step("Cleanup: удалить черновик", async () => {
          try {
            if (draftObjectiveId) {
              await api.deleteObjective(draftObjectiveId);
              console.log(`Cleanup: черновик ${draftObjectiveId} удалён`);
            } else {
              // Попробуем найти по uniqueId через API
              const { data: drafts } = await api.getDraftObjectives({
                limit: 500,
              });
              const draftItems = drafts?.items || (Array.isArray(drafts) ? drafts : []);
              const ourDraft = draftItems.find((d) =>
                d.title?.includes(uniqueId.toString()),
              );
              if (ourDraft) {
                await api.deleteObjective(ourDraft.id);
                console.log(`Cleanup: черновик ${ourDraft.id} удалён через API`);
              }
            }
          } catch (e) {
            console.warn(`Cleanup failed: ${e.message}`);
          }
        });
      }
    });
  },
);
