import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ProfileMainPage } from "../../../pages/ProfileMainPage.js";
import { ProfileAdditionalInfoSettingsPage } from "../../../pages/ProfileAdditionalInfoSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe("Профиль", { tag: ["@ui", "@regression"] }, () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.PROFILE);
  });

  test("C3679: Настройка профиля — добавить вкладку/2 блока/поля, сохранить, вернуться в профиль, проверить, затем удалить вкладки и сохранить", async ({
    adminAuth,
    page,
  }, testInfo) => {
    setSeverity("normal");
    const sideMenu = new SideMenu(page, testInfo);
    const profilePage = new ProfileMainPage(page, testInfo);
    const additionalInfoSettingsPage = new ProfileAdditionalInfoSettingsPage(
      page,
      testInfo,
    );

    await test.step('Открыть "Мой профиль"', async () => {
      await sideMenu.openMyProfile();
      await profilePage.assertOpened();
    });

    await test.step('Нажать "Настроить профиль" и перейти в настройки', async () => {
      await profilePage.assertConfigureProfileButtonVisible();
      await profilePage.clickConfigureProfile();
      await additionalInfoSettingsPage.assertOpened();
    });

    const created =
      await test.step("Создать вкладку и запомнить tabId", async () => {
        const ok = await additionalInfoSettingsPage.createTabIfPossible(
          `Автотест ${Date.now()}`,
        );
        return ok;
      });

    const createdTabId = additionalInfoSettingsPage.lastCreatedTabId;

    const blocks =
      await test.step("Подготовить 2 блока (добавить, если не хватает)", async () => {
        let count = await additionalInfoSettingsPage.getBlocksCount();

        while (count < 2) {
          await additionalInfoSettingsPage.addBlock();
          count = await additionalInfoSettingsPage.getBlocksCount();
        }

        return {
          block1: await additionalInfoSettingsPage.getBlockAt(0),
          block2: await additionalInfoSettingsPage.getBlockAt(1),
        };
      });

    await test.step("Добавить в первый блок поля (Текст/Число/Дата) — без дублей", async () => {
      await additionalInfoSettingsPage.ensureFieldInBlock(
        blocks.block1,
        "Текст",
      );
      await additionalInfoSettingsPage.ensureFieldInBlock(
        blocks.block1,
        "Число",
      );
      await additionalInfoSettingsPage.ensureFieldInBlock(
        blocks.block1,
        "Дата",
      );
    });

    await test.step("Добавить во второй блок поле (Текст) — без дублей", async () => {
      await additionalInfoSettingsPage.ensureFieldInBlock(
        blocks.block2,
        "Текст",
      );
    });

    await test.step('Нажать "Сохранить изменения"', async () => {
      await additionalInfoSettingsPage.saveChanges();
    });

    await test.step('В окне после сохранения нажать "Вернуться к профилю"', async () => {
      await additionalInfoSettingsPage.clickReturnToProfile();
    });

    await test.step("Открыть созданную вкладку в профиле и проверить поля", async () => {
      await profilePage.assertProfileShellVisible();

      if (created && createdTabId) {
        const u = new URL(page.url());
        u.searchParams.set("tab", createdTabId);
        await page.goto(u.toString(), { waitUntil: "domcontentloaded" });
      } else {
        await profilePage.openTabByName("Дополнительная информация");
      }

      await profilePage.assertAdditionalInfoFieldsVisible([
        "Текст",
        "Число",
        "Дата",
      ]);
    });

    await test.step('Зайти снова в "Настроить профиль", удалить кастомные вкладки и сохранить', async () => {
      await profilePage.assertConfigureProfileButtonVisible();
      await profilePage.clickConfigureProfile();
      await additionalInfoSettingsPage.assertOpened();

      await additionalInfoSettingsPage.deleteAllCustomTabsWithHandleButtons();

      await additionalInfoSettingsPage.saveChanges();
    });
  });
});
