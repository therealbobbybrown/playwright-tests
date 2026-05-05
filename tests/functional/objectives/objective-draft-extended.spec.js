// tests/functional/objectives/objective-draft-extended.spec.js
// TestRail: C3670, C3671
// Расширенные тесты черновиков — КР в черновике + удаление черновика

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
  "Расширенные тесты черновиков (OKR)",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.describe.configure({ mode: "serial" });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test(
      "C3670: Черновик с частично заполненными полями и КР",
      { tag: ["@normal"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("normal");
        testInfo.setTimeout(180_000);

        const sideMenu = new SideMenu(page, testInfo);
        const objectivesSettingsPage = new ObjectivesSettingsPage(
          page,
          testInfo,
        );
        const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);

        const api = new ObjectivesAPI(request);
        const role = getWorkerAdminRole(testInfo.parallelIndex);
        const { email, password } = getCredentials(role);
        await api.signIn(email, password);

        const uniqueId = Date.now();
        const draftTitle = `Черновик расширенный ${uniqueId}`;
        const kr1Title = `КР черновика 1 - ${uniqueId}`;
        const kr2Title = `КР черновика 2 - ${uniqueId}`;
        let draftObjectiveId = null;

        try {
          await test.step("Открыть форму создания цели", async () => {
            const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
            if (!hasCreateItem) {
              await sideMenu.openObjectivesSettings();
              await objectivesSettingsPage.assertOpened();
              await objectivesSettingsPage.enableOkrIfDisabled();
            }
            await sideMenu.openObjectivesCreate();
            console.log("Форма создания цели открыта");
          });

          await test.step("Заполнить название и добавить 2 КР", async () => {
            // Заполняем название
            await objectiveCreatePage.objectiveTitleTextarea.fill(draftTitle);
            await page.keyboard.press("Tab");
            console.log(`Название: ${draftTitle}`);

            // Добавить первый КР
            await objectiveCreatePage.addMilestoneButton.scrollIntoViewIfNeeded();
            await objectiveCreatePage.addMilestoneButton.click();
            await objectiveCreatePage.milestoneTitleTextarea.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await objectiveCreatePage.milestoneTitleTextarea.fill(kr1Title);
            await page.keyboard.press("Tab");
            console.log(`КР 1: ${kr1Title}`);

            // Добавить второй КР
            await objectiveCreatePage.addMilestoneButton.scrollIntoViewIfNeeded();
            await objectiveCreatePage.addMilestoneButton.click();

            await expect(objectiveCreatePage.milestoneTitleTextarea).toHaveCount(2, {
              timeout: TIMEOUTS.MEDIUM,
            });

            const secondKr = objectiveCreatePage.milestoneTitleTextarea.nth(1);
            await secondKr.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await secondKr.fill(kr2Title);
            console.log(`КР 2: ${kr2Title}`);

            // Финальный blur для триггера автосохранения
            await objectiveCreatePage.clickOutside();
            await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          });

          await test.step("Покинуть страницу для сохранения черновика", async () => {
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
                // Fallback: нажать любую кнопку подтверждения в диалоге
                const anyConfirm = confirmDialog.getByRole("button").first();

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
            console.log("Перешли на страницу целей");
          });

          await test.step("Проверить черновик и КР через API", async () => {
            const { data: drafts } = await api.getDraftObjectives({
              limit: 5000,
            });
            const draftItems = drafts?.items || (Array.isArray(drafts) ? drafts : []);

            expect(
              draftItems.length,
              "Должен существовать хотя бы один черновик",
            ).toBeGreaterThan(0);

            // Ищем черновик с нашим уникальным ID
            const ourDraft = draftItems.find((d) =>
              d.title?.includes(uniqueId.toString()),
            );

            expect(
              ourDraft,
              `Черновик "${draftTitle}" должен быть сохранён`,
            ).toBeTruthy();

            draftObjectiveId = ourDraft.id;
            expect(ourDraft.title).toContain(draftTitle);
            console.log(
              `Черновик найден через API: id=${ourDraft.id}, title="${ourDraft.title}"`,
            );

            // КР доступны прямо в объекте черновика из списка
            const milestones = ourDraft.milestones || [];
            expect(
              milestones.length,
              "Черновик должен содержать 2 КР",
            ).toBe(2);

            console.log(
              `КР в черновике: ${milestones.length} шт. (${milestones.map((m) => m.title).join(", ")})`,
            );

            // Проверяем что оба КР содержат наш уникальный ID
            const kr1Found = milestones.some((m) =>
              m.title?.includes(kr1Title),
            );
            const kr2Found = milestones.some((m) =>
              m.title?.includes(kr2Title),
            );
            expect(kr1Found, `КР 1 "${kr1Title}" должен быть в черновике`).toBe(true);
            expect(kr2Found, `КР 2 "${kr2Title}" должен быть в черновике`).toBe(true);
          });
        } finally {
          await test.step("Cleanup: удалить черновик", async () => {
            try {
              if (draftObjectiveId) {
                await api.deleteObjective(draftObjectiveId);
                console.log(`Cleanup: черновик ${draftObjectiveId} удален`);
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
                  console.log(`Cleanup: черновик ${ourDraft.id} удален`);
                }
              }
            } catch (e) {
              console.warn(`Cleanup failed: ${e.message}`);
            }
          });
        }
      },
    );

    test(
      "C3671: Удаление черновика",
      { tag: ["@normal"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("normal");
        testInfo.setTimeout(120_000);

        const sideMenu = new SideMenu(page, testInfo);
        const objectivesSettingsPage = new ObjectivesSettingsPage(
          page,
          testInfo,
        );
        const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);

        const api = new ObjectivesAPI(request);
        const role = getWorkerAdminRole(testInfo.parallelIndex);
        const { email, password } = getCredentials(role);
        await api.signIn(email, password);

        const uniqueId = Date.now();
        const draftTitle = `Черновик для удаления ${uniqueId}`;
        let draftObjectiveId = null;

        await test.step("Создать черновик через UI", async () => {
          const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
          if (!hasCreateItem) {
            await sideMenu.openObjectivesSettings();
            await objectivesSettingsPage.assertOpened();
            await objectivesSettingsPage.enableOkrIfDisabled();
          }
          await sideMenu.openObjectivesCreate();

          await objectiveCreatePage.objectiveTitleTextarea.fill(draftTitle);

          // Blur через клик вне поля + ждём autosave API
          const autosavePromise = page.waitForResponse(
            (resp) =>
              resp.url().includes("/private/objectives") &&
              resp.request().method() === "POST" &&
              resp.status() < 400,
            { timeout: TIMEOUTS.MEDIUM },
          );
          await objectiveCreatePage.titleSpan.click({ force: true });
          const autosaveResp = await autosavePromise.catch(() => null);
          if (autosaveResp) {
            console.log(`Автосохранение: ${autosaveResp.status()}`);
          } else {
            await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          }

          // Уходим со страницы чтобы черновик сохранился
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
              const anyConfirm = confirmDialog.getByRole("button").first();

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

          // Ждём навигации
          await page.waitForURL(/objectives/, { timeout: TIMEOUTS.MEDIUM });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          console.log(`Черновик "${draftTitle}" создан через UI`);
        });

        await test.step("Убедиться что черновик сохранен через API", async () => {
          const { data: drafts } = await api.getDraftObjectives({ limit: 500 });
          const draftItems = drafts?.items || (Array.isArray(drafts) ? drafts : []);

          const ourDraft = draftItems.find((d) =>
            d.title?.includes(uniqueId.toString()),
          );

          expect(
            ourDraft,
            `Черновик "${draftTitle}" должен существовать`,
          ).toBeTruthy();

          draftObjectiveId = ourDraft.id;
          console.log(`Черновик найден: id=${draftObjectiveId}`);
        });

        await test.step("Удалить черновик через API", async () => {
          expect(
            draftObjectiveId,
            "ID черновика должен быть известен",
          ).toBeTruthy();

          const { response } = await api.deleteObjective(draftObjectiveId);

          expect(
            response.ok(),
            `Удаление черновика ${draftObjectiveId} должно вернуть OK`,
          ).toBe(true);

          console.log(`Черновик ${draftObjectiveId} удален через API`);
        });

        await test.step("Проверить что черновик удален", async () => {
          const { data: drafts } = await api.getDraftObjectives({ limit: 500 });
          const draftItems = drafts?.items || (Array.isArray(drafts) ? drafts : []);

          const deletedDraft = draftItems.find(
            (d) => d.id === draftObjectiveId,
          );

          expect(
            deletedDraft,
            `Черновик ${draftObjectiveId} НЕ должен существовать после удаления`,
          ).toBeFalsy();

          console.log("Черновик успешно удален — не найден в API");
        });
      },
    );
  },
);
