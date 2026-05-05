import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureDepartmentsPage } from "../../../../pages/StructureDepartmentsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — отделы: спецсимволы в названии отдела",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      'C8187: Админ создаёт отдел со спецсимволами в названии — они отображаются как текст',
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const departmentsPage = new StructureDepartmentsPage(page, testInfo);
        const xssName = `<b>Bold</b> &amp; "test" ${Date.now()}`;

        await test.step(
          'Открыть страницу "Настройка отделов" через боковое меню',
          async () => {
            await departmentsPage.openFromSideMenu();
          },
        );

        await test.step("Создать новый отдел через UI", async () => {
          await departmentsPage.createDepartmentAndOpen();
        });

        await test.step(
          `Переименовать отдел в название с HTML/XSS: ${xssName}`,
          async () => {
            await departmentsPage.renameOpenedDepartment(xssName);
          },
        );

        await test.step(
          "Проверить, что название отображается как обычный текст, а не как HTML",
          async () => {
            const titleText = await departmentsPage.departmentTitleText
              .textContent()
              .then((t) => t?.trim() ?? "");

            expect(
              titleText,
              "Название отдела должно содержать литеральный тег <b>Bold</b> как текст",
            ).toContain("<b>Bold</b>");

            expect(
              titleText,
              'Название отдела должно содержать литеральный "&amp;" как текст',
            ).toContain("&amp;");

            expect(
              titleText,
              'Название отдела должно содержать кавычки "test" как текст',
            ).toContain('"test"');

            // Убеждаемся, что HTML-тег не был интерпретирован браузером —
            // если бы <b> был рендером, textContent вернул бы "Bold", а не "<b>Bold</b>"
            expect(
              titleText,
              "Тег <b> не должен быть отрендерен как HTML (Bold без угловых скобок означало бы уязвимость)",
            ).not.toMatch(/^Bold\s/);
          },
        );

        await test.step("Удалить созданный отдел (очистка)", async () => {
          await departmentsPage.deleteOpenedDepartment();
        });
      },
    );
  },
);
