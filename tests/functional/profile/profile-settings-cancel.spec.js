// tests/functional/profile/profile-settings-cancel.spec.js
/**
 * UI тесты настройки профиля — отмена редактирования
 * @tags @ui @profile @settings @regression
 */
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ProfileMainPage } from "../../../pages/ProfileMainPage.js";
import { ProfileAdditionalInfoSettingsPage } from "../../../pages/ProfileAdditionalInfoSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Профиль — настройка (отмена редактирования)",
  { tag: ["@ui", "@profile", "@settings", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.PROFILE);
    });

    test(
      "C3865: Отмена редактирования — возврат без сохранения",
      { tag: ["@P1"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);
        const settingsPage = new ProfileAdditionalInfoSettingsPage(
          page,
          testInfo,
        );

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        await test.step('Нажать "Настроить профиль"', async () => {
          await profilePage.assertConfigureProfileButtonVisible();
          await profilePage.clickConfigureProfile();
          await settingsPage.assertOpened();
        });

        await test.step('Проверить наличие кнопки "Отменить редактирование"', async () => {
          await settingsPage.cancelEditingButton.waitFor({ state: "visible" });
        });

        await test.step('Нажать "Отменить редактирование"', async () => {
          await settingsPage.cancelEditingButton.click();
        });

        await test.step("Проверить возврат к профилю", async () => {
          // Баннер редактирования должен исчезнуть
          await settingsPage.templateEditBanner.waitFor({
            state: "hidden",
            timeout: 10000,
          });
          // Должны вернуться в режим просмотра
          await profilePage.assertProfileShellVisible();
        });
      },
    );

    test(
      "C3866: Предупреждение о доступности вкладки всем сотрудникам",
      { tag: ["@P3"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("trivial");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);
        const settingsPage = new ProfileAdditionalInfoSettingsPage(
          page,
          testInfo,
        );

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        await test.step('Нажать "Настроить профиль"', async () => {
          await profilePage.clickConfigureProfile();
          await settingsPage.assertOpened();
        });

        await test.step("Проверить наличие предупреждения о доступности", async () => {
          const { expect } = await import("@playwright/test");
          // Текст: "Внесенные изменения применятся к профилям всех сотрудников"
          const warning = page
            .getByText(
              /изменения применятся|профилям всех сотрудников|настраиваете шаблон/i,
            )
            .first();
          const warningVisible = await warning
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false);

          test.info().annotations.push({
            type: "warning",
            description: warningVisible ? "found" : "not found",
          });

          // Предупреждение должно быть видно
          expect(
            warningVisible,
            "Предупреждение о применении изменений ко всем профилям должно отображаться",
          ).toBeTruthy();
        });

        // Cleanup: отменить редактирование
        await test.step("Отменить редактирование", async () => {
          await settingsPage.cancelEditingButton.click().catch(() => null);
        });
      },
    );
  },
);
