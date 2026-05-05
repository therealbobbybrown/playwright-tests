// tests/functional/profile/profile-roles-access.spec.js
/**
 * UI тесты ролей и прав доступа к профилю
 * @tags @ui @profile @roles @regression
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
  "Профиль — роли и права доступа",
  { tag: ["@ui", "@profile", "@roles", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.PROFILE);
    });

    test(
      'C3869: Обычный пользователь — свой профиль (нет кнопки "Настроить")',
      { tag: ["@P0", "@critical"] },
      async ({ userAuth, page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        await test.step("Проверить, что основные блоки видны", async () => {
          await profilePage.assertMainTabBlocksPresent();
        });

        await test.step('Проверить, что кнопка "Настроить профиль" НЕ видна', async () => {
          await profilePage.assertConfigureProfileButtonNotVisible();
        });
      },
    );

    test(
      "C3861: Обычный пользователь — может открыть чужой профиль",
      { tag: ["@P1"] },
      async ({ userAuth, page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);
        const { StructureUsersPage } = await import(
          "../../../pages/StructureUsersPage.js"
        );

        await test.step("Открыть свой профиль", async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        // Получаем свой ID из URL
        const currentUrl = page.url();
        const myIdMatch = currentUrl.match(/\/profile\/(\d+)/);
        const myId = myIdMatch ? parseInt(myIdMatch[1], 10) : null;

        // Открываем оргструктуру и ищем другого пользователя
        const structureUsersPage = new StructureUsersPage(page, testInfo);
        await test.step("Открыть список сотрудников", async () => {
          await structureUsersPage.openFromSideMenu();
        });

        const otherUser =
          await test.step("Найти профиль другого пользователя", async () => {
            return structureUsersPage.getOtherUserProfileId(myId);
          });

        test.skip(!otherUser, "Не найден доступный профиль другого сотрудника");

        // Теперь мы на странице профиля другого пользователя
        const otherProfilePage = new ProfileMainPage(otherUser.page, testInfo);

        await test.step("Проверить, что блоки профиля видны", async () => {
          await otherProfilePage.teamBlockTitle.waitFor({ state: "visible" });
        });

        await test.step('Проверить, что кнопка "Настроить профиль" НЕ видна', async () => {
          await otherProfilePage.assertConfigureProfileButtonNotVisible();
        });

        // Закрываем вкладку если это новая
        if (otherUser.page !== page) {
          await otherUser.page.close();
        }
      },
    );

    test(
      'C3870: Админ — кнопка "Настроить профиль" видна',
      { tag: ["@P0", "@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        await test.step('Проверить наличие кнопки "Настроить профиль"', async () => {
          const visible = await profilePage.isConfigureProfileButtonVisible();
          expect(
            visible,
            'Кнопка "Настроить профиль" должна быть видна для админа',
          ).toBe(true);
        });
      },
    );

    test(
      "C3862: Админ — может открыть чужой профиль с кнопкой настройки",
      { tag: ["@P1"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);
        const { StructureUsersPage } = await import(
          "../../../pages/StructureUsersPage.js"
        );

        await test.step("Открыть свой профиль", async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        // Получаем свой ID из URL
        const currentUrl = page.url();
        const myIdMatch = currentUrl.match(/\/profile\/(\d+)/);
        const myId = myIdMatch ? parseInt(myIdMatch[1], 10) : null;

        // Открываем оргструктуру и ищем другого пользователя
        const structureUsersPage = new StructureUsersPage(page, testInfo);
        await test.step("Открыть список сотрудников", async () => {
          await structureUsersPage.openFromSideMenu();
        });

        const otherUser =
          await test.step("Найти профиль другого пользователя", async () => {
            return structureUsersPage.getOtherUserProfileId(myId);
          });

        test.skip(!otherUser, "Не найден доступный профиль другого сотрудника");

        // Теперь мы на странице профиля другого пользователя
        const otherProfilePage = new ProfileMainPage(otherUser.page, testInfo);

        await test.step('Проверить наличие кнопки "Настроить профиль"', async () => {
          await otherProfilePage.assertConfigureProfileButtonVisible();
        });

        // Закрываем вкладку если это новая
        if (otherUser.page !== page) {
          await otherUser.page.close();
        }
      },
    );

    test(
      "C3863: Навигация по breadcrumb",
      { tag: ["@P2"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("minor");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        await test.step("Проверить breadcrumb и переход на главную", async () => {
          // Breadcrumb — это ссылка "Главная" в шапке страницы (с иконкой домика)
          const homeLink = page.getByRole("link", { name: /главная/i }).first();
          const linkVisible = await homeLink
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false);

          test.info().annotations.push({
            type: "breadcrumb",
            description: linkVisible ? "found" : "not found",
          });
          expect(
            linkVisible,
            'Ссылка "Главная" (breadcrumb) должна присутствовать на странице профиля',
          ).toBe(true);

          await homeLink.waitFor({ state: "visible", timeout: 5000 });

          const urlBefore = page.url();

          // Кликаем и ждём изменения URL (SPA-навигация)
          await Promise.all([
            page.waitForURL((url) => !url.href.includes("/profile/"), {
              timeout: 10000,
            }),
            homeLink.click(),
          ]);

          const urlAfter = page.url();
          expect(
            urlAfter !== urlBefore,
            `Переход по breadcrumb не произошёл. URL до: ${urlBefore}, URL после: ${urlAfter}`,
          ).toBeTruthy();

          // Проверяем что попали на главную (URL не содержит /profile/)
          expect(
            !urlAfter.includes("/profile/"),
            `Ожидался переход с профиля. Текущий URL: ${urlAfter}`,
          ).toBeTruthy();
        });
      },
    );

    test(
      "C3864: Переход в профиль из оргструктуры (контекстное меню)",
      { tag: ["@P1"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const { StructureUsersPage } = await import(
          "../../../pages/StructureUsersPage.js"
        );
        const structureUsersPage = new StructureUsersPage(page, testInfo);

        await test.step('Открыть страницу "Сотрудники и позиции"', async () => {
          await structureUsersPage.openFromSideMenu();
        });

        await test.step("Дождаться загрузки таблицы", async () => {
          await structureUsersPage.table.waitFor({ state: "visible" });
          const rowsCount = await structureUsersPage.tableRows.count();
          expect(
            rowsCount,
            "Таблица сотрудников должна содержать хотя бы одну строку",
          ).toBeGreaterThan(0);
        });

        // Профиль может открыться в новой вкладке
        const profilePageInstance =
          await test.step("Открыть профиль через контекстное меню", async () => {
            return await structureUsersPage.openEmployeeProfileFromContextMenu(
              0,
            );
          });

        await test.step("Проверить, что профиль открылся", async () => {
          const profilePage = new ProfileMainPage(
            profilePageInstance,
            testInfo,
          );
          await profilePage.assertOpened();

          // Проверяем URL — должен содержать /profile/
          const profileUrl = profilePageInstance.url();
          expect(
            /\/profile\/\d+/i.test(profileUrl),
            `URL должен содержать /profile/{id}. Текущий URL: ${profileUrl}`,
          ).toBeTruthy();

          // Логируем URL для отладки
          test
            .info()
            .annotations.push({ type: "profile_url", description: profileUrl });

          // Закрываем новую вкладку, если это не основная страница
          if (profilePageInstance !== page) {
            await profilePageInstance.close();
          }
        });
      },
    );
  },
);
