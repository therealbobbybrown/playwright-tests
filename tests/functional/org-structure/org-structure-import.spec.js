// tests/org-structure-import.spec.js
import { test } from "../../fixtures/auth.js";
import { StructureImportPage } from "../../../pages/StructureImportPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Орг. структура - импорт сотрудников",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test("C3518: Админ открывает страницу импорта и видит основные элементы", async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");
      const importPage = new StructureImportPage(page, testInfo);

      await test.step('Открыть страницу "Загрузить таблицу" через боковое меню', async () => {
        await importPage.openFromSideMenu();
      });

      await test.step("Проверить основные элементы страницы импорта", async () => {
        await importPage.assertMainElementsVisible();
      });

      await test.step("Скачать пример таблицы XLSX", async () => {
        await importPage.downloadSampleFile();
      });

      await test.step("Открыть окно выбора файла", async () => {
        await importPage.openFileChooser();
      });
    });
  },
);
