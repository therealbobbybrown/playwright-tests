// tests/functional/profile/profile-employee-review-details.spec.js
/**
 * UI тесты вкладки "Оценка сотрудника" — детальные проверки
 * @tags @ui @profile @regression
 */
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ProfileMainPage } from "../../../pages/ProfileMainPage.js";
import { ProfileEmployeeReviewPage } from "../../../pages/ProfileEmployeeReviewPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  'Профиль — вкладка "Оценка сотрудника"',
  { tag: ["@ui", "@profile", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.PROFILE);
    });

    test(
      "C3858: Фильтры по статусам отображаются",
      { tag: ["@P1"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);
        const reviewPage = new ProfileEmployeeReviewPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        const available =
          await test.step('Проверить доступность вкладки "Оценка сотрудника"', async () => {
            return profilePage.isEmployeeReviewTabAvailable();
          });

        test.skip(
          !available,
          'Вкладка "Оценка сотрудника" недоступна на этом стенде',
        );

        await test.step('Открыть вкладку "Оценка сотрудника"', async () => {
          await profilePage.openEmployeeReviewTab();
          await reviewPage.assertOpened();
        });

        await test.step("Проверить наличие фильтров", async () => {
          await reviewPage.assertFiltersVisible();
        });
      },
    );

    test(
      'C3875: Переключение фильтра "Активные"',
      { tag: ["@P1"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);
        const reviewPage = new ProfileEmployeeReviewPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        const available = await profilePage.isEmployeeReviewTabAvailable();
        test.skip(!available, 'Вкладка "Оценка сотрудника" недоступна');

        await test.step('Открыть вкладку "Оценка сотрудника"', async () => {
          await profilePage.openEmployeeReviewTab();
          await reviewPage.assertOpened();
        });

        await test.step('Нажать фильтр "Активные"', async () => {
          await reviewPage.clickFilterActive();
        });

        await test.step("Проверить, что таблица или сообщение об отсутствии данных отображается", async () => {
          const { expect } = await import("@playwright/test");
          const tableVisible = await reviewPage.historyTable
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
            .then(() => true)
            .catch(() => false);
          if (!tableVisible) {
            // Нет активных циклов — должно отображаться сообщение об отсутствии данных
            const emptyState = page.getByText(
              /нет данных|нет активных|no data|пусто/i,
            );
            const emptyVisible = await emptyState
              .first()
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);
            expect(
              emptyVisible,
              'После фильтра "Активные": должна быть таблица или сообщение об отсутствии данных',
            ).toBe(true);
          }
        });
      },
    );

    test(
      "C3859: Таблица циклов оценок содержит данные",
      { tag: ["@P1"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);
        const reviewPage = new ProfileEmployeeReviewPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        const available = await profilePage.isEmployeeReviewTabAvailable();
        test.skip(!available, 'Вкладка "Оценка сотрудника" недоступна');

        await test.step('Открыть вкладку "Оценка сотрудника"', async () => {
          await profilePage.openEmployeeReviewTab();
          await reviewPage.assertOpened();
        });

        await test.step("Проверить наличие таблицы", async () => {
          await reviewPage.assertTableVisible();
        });

        const rowsCount =
          await test.step("Получить количество строк", async () => {
            return reviewPage.getRowsCount();
          });

        test.info().annotations.push({
          type: "rows_count",
          description: String(rowsCount),
        });

        await test.step("Проверить, что в таблице есть строки с данными", async () => {
          const { expect } = await import("@playwright/test");
          expect(
            rowsCount,
            "Таблица циклов оценок должна содержать хотя бы одну строку",
          ).toBeGreaterThan(0);
        });
      },
    );

    test(
      'C3876: Клик по "Результаты" открывает детализацию',
      { tag: ["@P1"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);
        const reviewPage = new ProfileEmployeeReviewPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        const available = await profilePage.isEmployeeReviewTabAvailable();
        test.skip(!available, 'Вкладка "Оценка сотрудника" недоступна');

        await test.step('Открыть вкладку "Оценка сотрудника"', async () => {
          await profilePage.openEmployeeReviewTab();
          await reviewPage.assertOpened();
        });

        const rowsCount = await reviewPage.getRowsCount();
        if (rowsCount === 0) {
          throw new Error(
            'Нет данных для проверки кнопки "Результаты" — убедитесь, что PR с доступом к результатам существует для аккаунта ADMIN_LOGIN',
          );
        }

        const urlBefore = page.url();

        await test.step('Нажать первую кнопку "Результаты" и дождаться навигации', async () => {
          const { expect } = await import("@playwright/test");
          await Promise.all([
            page.waitForURL(
              (url) => url.toString() !== urlBefore,
              { timeout: TIMEOUTS.PAGE_LOAD },
            ),
            reviewPage.clickFirstResultsButton(),
          ]);

          const urlAfter = page.url();
          // URL должен измениться после клика на "Результаты"
          expect(
            urlAfter,
            `URL должен измениться после перехода к детализации (было: ${urlBefore})`,
          ).not.toBe(urlBefore);

          // Страница результатов должна отобразиться
          await reviewPage.assertResultsPageLoaded();
        });
      },
    );

    test(
      'C3877: Блок "Кто видит эту информацию" отображается',
      { tag: ["@P2"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("minor");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);
        const reviewPage = new ProfileEmployeeReviewPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        const available = await profilePage.isEmployeeReviewTabAvailable();
        test.skip(!available, 'Вкладка "Оценка сотрудника" недоступна');

        await test.step('Открыть вкладку "Оценка сотрудника"', async () => {
          await profilePage.openEmployeeReviewTab();
          await reviewPage.assertOpened();
        });

        await test.step('Проверить блок "Кто видит"', async () => {
          await reviewPage.assertWhoSeesBlockVisible();
        });
      },
    );
  },
);
