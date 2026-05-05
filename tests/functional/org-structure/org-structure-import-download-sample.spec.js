// tests/functional/org-structure/org-structure-import-download-sample.spec.js
import { test } from "../../fixtures/auth.js";
import { StructureImportPage } from "../../../pages/StructureImportPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — импорт: скачивание примера",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8201: Админ скачивает пример таблицы XLSX и файл не пустой",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const importPage = new StructureImportPage(page, testInfo);

        await test.step("Открыть страницу импорта", async () => {
          await importPage.openFromSideMenu();
        });

        await test.step("Скачать пример таблицы XLSX", async () => {
          // downloadSampleFile() checks response status and content-type
          await importPage.downloadSampleFile();
        });
      },
    );
  },
);
