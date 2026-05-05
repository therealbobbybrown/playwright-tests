// tests/functional/org-structure/department-empty-name-validation.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { StructureDepartmentsPage } from "../../../pages/StructureDepartmentsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Орг. структура — негативные сценарии: пустое название отдела",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test("C3998: Нельзя сохранить отдел с пустым названием", async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");
      const departmentsPage = new StructureDepartmentsPage(page, testInfo);

      await test.step('Открыть страницу "Настройка отделов"', async () => {
        await departmentsPage.openFromSideMenu();
      });

      await test.step("Выбрать первый доступный отдел в дереве", async () => {
        // Находим первый отдел в дереве (не корневой элемент и не "Не распределены")
        const treeItems = departmentsPage.treeMenu.locator(
          'a[href*="/departments/department/"]',
        );

        const count = await treeItems.count();
        expect(
          count,
          "В дереве должен быть хотя бы один отдел для тестирования",
        ).toBeGreaterThan(0);

        // Кликаем на первый отдел
        await treeItems.first().click();
        await page.waitForLoadState("networkidle", {
          timeout: TIMEOUTS.MEDIUM,
        });

        // Ждём загрузки деталей отдела
        await departmentsPage.departmentDetailsTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      });

      await test.step("Попробовать очистить название отдела", async () => {
        // Запоминаем текущее название
        const originalTitle =
          await departmentsPage.departmentTitleText.textContent();
        console.log(`Исходное название: "${originalTitle}"`);

        // Кликаем на иконку редактирования (карандаш) рядом с названием
        const editIcon = departmentsPage.departmentTitleEditButton;

        await editIcon.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await editIcon.click();

        // Ждём появления поля ввода
        const input = departmentsPage.departmentTitleInput;
        await input.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        // Очищаем поле
        await input.fill("");

        // Пробуем сохранить (нажимаем Enter)
        await input.press("Enter");
        await page
          .waitForLoadState("networkidle", { timeout: 3_000 })
          .catch(() => null);

        // Ожидание: система не должна позволить сохранить пустое название.
        // Возможные варианты защиты:
        // 1. Поле ввода остаётся открытым (сохранение отклонено)
        // 2. Появляется сообщение об ошибке валидации
        // 3. Название восстанавливается до непустого значения (дефолтное или прежнее)
        const inputStillVisible = await input
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);

        if (inputStillVisible) {
          // Поле ввода осталось открытым — валидация сработала корректно (вариант 1)
          await expect(
            input,
            "Поле ввода должно остаться открытым при пустом названии",
          ).toBeVisible();
        } else {
          // Поле закрылось — проверяем, что заголовок не стал пустым (вариант 3)
          // или появилась ошибка (вариант 2)
          await departmentsPage.departmentTitleText.waitFor({
            state: "visible",
            timeout: TIMEOUTS.SHORT,
          });
          const newTitle = await departmentsPage.departmentTitleText.textContent();
          const titleNotEmpty = (newTitle ?? "").trim() !== "";
          expect(
            titleNotEmpty,
            `Название отдела не должно стать пустым. Текущее значение: "${newTitle}"`,
          ).toBe(true);
        }
      });

      await test.step("Восстановить оригинальное название отдела", async () => {
        // Проверяем, открыто ли поле ввода уже
        const input = departmentsPage.departmentTitleInput;
        const inputAlreadyVisible = await input
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);

        if (!inputAlreadyVisible) {
          // Поле ввода закрыто — нужно кликнуть на карандаш
          const editIcon = departmentsPage.departmentTitleEditButton;
          const editIconVisible = await editIcon
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          if (editIconVisible) {
            await editIcon.click();
            await input.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
          }
        }

        // Восстанавливаем название если поле ввода видимо
        const canRestore = await input
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        if (canRestore) {
          await input.fill("Отдел продаж");
          await input.press("Enter");
          await page
            .waitForLoadState("networkidle", { timeout: 3_000 })
            .catch(() => null);
        }
      });
    });
  },
);
