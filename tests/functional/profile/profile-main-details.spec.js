// tests/functional/profile/profile-main-details.spec.js
/**
 * UI тесты вкладки "Главное" профиля — детальные проверки
 * @tags @ui @profile @regression
 */
import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ProfileMainPage } from "../../../pages/ProfileMainPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  'Профиль — вкладка "Главное"',
  { tag: ["@ui", "@profile", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.PROFILE);
    });

    test(
      "C3867: Аватар и имя профиля отображаются",
      { tag: ["@P0", "@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        await test.step("Проверить отображение аватара", async () => {
          await profilePage.assertProfileAvatarVisible();
        });

        await test.step("Проверить отображение имени пользователя", async () => {
          await profilePage.assertUserNameVisible();
          const name = await profilePage.getUserName();
          test.info().annotations.push({
            type: "user_name",
            description: name || "N/A",
          });
        });
      },
    );

    test(
      'C3871: Блок "Команда" — отдел и руководитель',
      { tag: ["@P1"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        await test.step('Проверить блок "Команда"', async () => {
          await profilePage.assertTeamBlockDetailsPresent();
        });

        await test.step("Проверить наличие основного руководителя", async () => {
          await profilePage.assertMainManagerVisible();
        });
      },
    );

    test(
      'C3872: Кнопка "Структура компании" кликабельна',
      { tag: ["@P1"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        // Скроллим к блоку "Команда" чтобы кнопка стала видна
        await test.step('Скролл к блоку "Команда"', async () => {
          await profilePage.teamBlockTitle
            .scrollIntoViewIfNeeded()
            .catch(() => null);
          await profilePage.teamBlockTitle
            .waitFor({ state: "visible", timeout: 2000 })
            .catch(() => {});
        });

        await test.step('Проверить наличие кнопки "Структура компании"', async () => {
          await profilePage.assertCompanyStructureButtonVisible();
        });

        await test.step("Нажать кнопку и проверить переход", async () => {
          await profilePage.companyStructureButton.scrollIntoViewIfNeeded();
          await profilePage.clickCompanyStructure();
          await page.waitForURL(/structure|constructor/, { timeout: 15_000 });

          const urlAfter = page.url();
          test
            .info()
            .annotations.push({ type: "url_after", description: urlAfter });

          expect(
            /structure|constructor/i.test(urlAfter),
            `Ожидалась страница структуры компании, получен URL: ${urlAfter}`,
          ).toBeTruthy();
        });
      },
    );

    test(
      'C3873: Блоки "Контакты" и "О себе" отображаются',
      { tag: ["@P2"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("minor");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        await test.step('Проверить блок "Контакты"', async () => {
          await profilePage.contactsBlockTitle.waitFor({ state: "visible" });
        });

        await test.step('Проверить блок "О себе"', async () => {
          await profilePage.aboutBlockTitle.waitFor({ state: "visible" });
          await profilePage.assertAboutBlockDetailsPresent();
        });
      },
    );

    test(
      'C3874: Кнопка "Настроить профиль" видна для админа',
      { tag: ["@P1"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        await test.step('Проверить наличие кнопки "Настроить профиль"', async () => {
          await profilePage.assertConfigureProfileButtonVisible();
        });
      },
    );
  },
);
