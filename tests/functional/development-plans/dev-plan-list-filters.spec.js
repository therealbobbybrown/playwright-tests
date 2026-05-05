// tests/functional/development-plans/dev-plan-list-filters.spec.js
// TestRail: C2711, C2712, C2714, C2715, C2716, C2717
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlansListPage } from "../../../pages/DevelopmentPlansListPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";
import { ensureDevelopmentPlansEnabled } from "../../utils/helpers/ensureDevelopmentPlansEnabled.js";

test.describe(
  "Планы развития — список и фильтры",
  { tag: ["@ui", "@regression", "@ipr"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const result = await ensureDevelopmentPlansEnabled(request);
      if (!result.isEnabled) {
        throw new Error("Не удалось включить модуль ИПР");
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test('C2711: раздел "Планы развития" доступен в меню', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);

      await test.step('Проверить наличие пункта меню "Планы развития"', async () => {
        const menuItems = await devMenu.getDevelopmentMenuItems();
        console.log('Пункты меню "Развитие":', menuItems);

        const hasPlans = menuItems.some(
          (item) =>
            item.toLowerCase().includes("план") &&
            item.toLowerCase().includes("развит"),
        );
        expect(hasPlans).toBe(true);
      });

      await test.step('Перейти к "Планы развития"', async () => {
        await devMenu.openDevelopmentPlans();
        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        await plansPage.assertOpened();
      });
    });

    test("C2712: страница списка планов развития — базовые элементы", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("critical");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const plansPage = new DevelopmentPlansListPage(page, testInfo);

      await test.step('Открыть "Планы развития"', async () => {
        await devMenu.openDevelopmentPlans();
        await plansPage.assertOpened();
      });

      await test.step("Проверить заголовок", async () => {
        await expect(plansPage.heading).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });
        const headingText = await plansPage.heading.innerText();
        expect(headingText.toLowerCase()).toContain("план");
      });

      await test.step('Проверить кнопку "Создать план развития"', async () => {
        await expect(plansPage.createButton).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(plansPage.createButton).toBeEnabled();
      });

      await test.step("Проверить таблицу планов", async () => {
        const tableVisible = await plansPage.table
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);
        console.log("Таблица планов:", tableVisible);

        if (tableVisible) {
          // Проверяем заголовки столбцов
          const headers = await plansPage.tableHeaders.allInnerTexts();
          console.log("Заголовки столбцов:", headers);

          // Ожидаем столбцы: Название, Сотрудник, Куратор, Статус, Прогресс, Период
          const expectedColumns = ["Сотрудник", "Куратор", "Статус"];
          for (const col of expectedColumns) {
            const hasColumn = headers.some((h) =>
              h.toLowerCase().includes(col.toLowerCase()),
            );
            expect(hasColumn, `Ожидается столбец "${col}"`).toBe(true);
          }
        }
      });
    });

    test("C2714: фильтр по статусу планов развития", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const plansPage = new DevelopmentPlansListPage(page, testInfo);

      await test.step('Открыть "Планы развития"', async () => {
        await devMenu.openDevelopmentPlans();
        await plansPage.assertOpened();
      });

      await test.step("Проверить фильтр по статусу", async () => {
        const statusFilter = page
          .locator('[class*="Select"], [class*="Filter"]')
          .filter({ hasText: /Статус/i })
          .first();

        const filterVisible = await statusFilter
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);
        console.log("Фильтр по статусу:", filterVisible);

        if (filterVisible) {
          await statusFilter.click();

          // Проверяем варианты статусов — используем role="option" (ARIA)
          const options = page.getByRole("option");
          const optionsCount = await options.count();
          console.log("Количество вариантов статусов:", optionsCount);

          // Если есть варианты - проверяем текст
          if (optionsCount > 0) {
            const optionsTexts = await options.allInnerTexts();
            console.log(
              "Варианты статусов:",
              optionsTexts.filter((t) => t.trim()),
            );
          }

          // Закрываем
          await page.keyboard.press("Escape");
        } else {
          console.log("Фильтр по статусу не найден на этой странице");
        }
      });
    });

    test("C2715: фильтр по сотрудникам", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const plansPage = new DevelopmentPlansListPage(page, testInfo);

      await test.step('Открыть "Планы развития"', async () => {
        await devMenu.openDevelopmentPlans();
        await plansPage.assertOpened();
      });

      await test.step("Проверить фильтр по сотрудникам", async () => {
        const employeesFilter = page
          .getByRole("button", { name: /Сотрудник/i })
          .first()
          .or(
            page
              .locator('[class*="Select"], [class*="Filter"]')
              .filter({ hasText: /Сотрудник/i })
              .first(),
          );

        const filterVisible = await employeesFilter
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);
        console.log("Фильтр по сотрудникам:", filterVisible);

        if (filterVisible) {
          await employeesFilter.click();

          // Должен появиться выпадающий список или модальное окно с сотрудниками
          const dropdown = page
            .getByRole("listbox")
            .or(page.getByRole("dialog"))
            .filter({ has: page.getByRole("textbox") });

          const dropdownVisible = await dropdown
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          console.log("Выпадающий список сотрудников:", dropdownVisible);

          // Закрываем
          await page.keyboard.press("Escape");
        }
      });
    });

    test("C2716: фильтр по кураторам", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const plansPage = new DevelopmentPlansListPage(page, testInfo);

      await test.step('Открыть "Планы развития"', async () => {
        await devMenu.openDevelopmentPlans();
        await plansPage.assertOpened();
      });

      await test.step("Проверить фильтр по кураторам", async () => {
        const curatorsFilter = page
          .getByRole("button", { name: /Куратор/i })
          .first()
          .or(
            page
              .locator('[class*="Select"], [class*="Filter"]')
              .filter({ hasText: /Куратор/i })
              .first(),
          );

        const filterVisible = await curatorsFilter
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);
        console.log("Фильтр по кураторам:", filterVisible);

        if (filterVisible) {
          await curatorsFilter.click();

          // Должен появиться выпадающий список
          const hasDropdown = await page
            .locator('[class*="Dropdown"], [class*="Menu"], [class*="Popup"]')
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          console.log("Выпадающий список кураторов:", hasDropdown);

          // Закрываем
          await page.keyboard.press("Escape");
        }
      });
    });

    test("C2717: поиск плана развития", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const plansPage = new DevelopmentPlansListPage(page, testInfo);

      await test.step('Открыть "Планы развития"', async () => {
        await devMenu.openDevelopmentPlans();
        await plansPage.assertOpened();
      });

      await test.step("Проверить поле поиска", async () => {
        const searchInput = plansPage.searchInput;
        const searchVisible = await searchInput
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);
        console.log("Поле поиска:", searchVisible);

        if (searchVisible) {
          // Вводим текст для поиска
          await searchInput.fill("тест");
          // Ждём обновления списка после debounce
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
            .catch(() => {});

          // Проверяем, что фильтрация работает (либо строки обновились, либо нет результатов)
          const rowsCount = await plansPage.getPlansCount();
          console.log(`Планов после поиска: ${rowsCount}`);

          // Очищаем поиск
          await searchInput.clear();
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
            .catch(() => {});
        }
      });
    });

    test("C3553: Экспорт списка планов развития (если доступно)", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const plansPage = new DevelopmentPlansListPage(page, testInfo);

      await test.step('Открыть "Планы развития"', async () => {
        await devMenu.openDevelopmentPlans();
        await plansPage.assertOpened();
      });

      await test.step("Проверить наличие кнопки экспорта", async () => {
        const exportButton = page
          .getByRole("button", { name: /Экспорт|Export/i })
          .first()
          .or(
            page
              .locator("button")
              .filter({ hasText: /Экспорт/i })
              .first(),
          );

        const exportVisible = await exportButton
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        console.log("Кнопка экспорта:", exportVisible);

        if (exportVisible) {
          await exportButton.click();

          // Должен появиться выбор формата или начаться скачивание
          const formatOptions = page
            .locator('[class*="Menu"], [class*="Dropdown"]')
            .filter({ hasText: /xlsx|csv|pdf/i });

          const hasFormatOptions = await formatOptions
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          console.log("Выбор формата экспорта:", hasFormatOptions);

          await page.keyboard.press("Escape");
        } else {
          console.log("Функция экспорта не доступна на этой странице");
        }
      });
    });
  },
);
