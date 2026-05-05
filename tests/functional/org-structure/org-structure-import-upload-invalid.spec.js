// tests/functional/org-structure/org-structure-import-upload-invalid.spec.js
import { test } from "../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureImportPage } from "../../../pages/StructureImportPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import fs from "fs";
import path from "path";

test.describe(
  "Орг. структура — импорт: загрузка невалидного файла",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8202: Админ загружает невалидный файл и видит ошибку",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const importPage = new StructureImportPage(page, testInfo);

        await test.step("Открыть страницу импорта", async () => {
          await importPage.openFromSideMenu();
        });

        let invalidFile;
        await test.step("Подготовить невалидный файл", async () => {
          const tempDir = testInfo.outputDir;
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          invalidFile = path.join(tempDir, "invalid.txt");
          fs.writeFileSync(invalidFile, "this is not a valid xlsx file");
        });

        await test.step("Загрузить невалидный файл через диалог выбора файла", async () => {
          let chooser;
          try {
            chooser = await importPage.openFileChooser();
          } catch {
            // fallback: setInputFiles directly
          }

          if (chooser) {
            await chooser.setFiles(invalidFile);
          } else {
            await importPage.fileInput.setInputFiles(invalidFile);
          }
        });

        await test.step("Проверить, что отображается сообщение об ошибке", async () => {
          // The app should show a validation error for an invalid file format
          const errorLocator = page
            .locator('[class*="error"], [class*="Error"], [class*="alert"]')
            .filter({ hasText: /.+/ })
            .first();

          await errorLocator.waitFor({ state: "visible", timeout: 10000 });
          await expect(errorLocator).toBeVisible();
        });
      },
    );
  },
);
