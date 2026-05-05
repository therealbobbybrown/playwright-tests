// tests/functional/org-structure/users/org-structure-users-export.spec.js
import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureUsersPage } from "../../../../pages/StructureUsersPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура - экспорт сотрудников",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8206: Админ скачивает экспорт списка сотрудников",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const usersPage = new StructureUsersPage(page, testInfo);

        await test.step(
          'Открыть "Список сотрудников" через боковое меню',
          async () => {
            await usersPage.openFromSideMenu();
          },
        );

        await test.step("Дождаться загрузки таблицы", async () => {
          await usersPage.table.waitFor({ state: "visible" });
          await usersPage.exportButton.waitFor({ state: "visible" });
        });

        await test.step(
          "Нажать «Скачать» и проверить, что открылась вкладка экспорта",
          async () => {
            // "Скачать" открывает новую вкладку /ru/download/?url=...export/xlsx?token=...
            const [exportPage] = await Promise.all([
              page.context().waitForEvent("page", { timeout: 15000 }),
              usersPage.exportButton.click(),
            ]);

            await exportPage.waitForLoadState("domcontentloaded", {
              timeout: 15000,
            });

            // Проверяем URL новой вкладки — должен содержать /download/ и export/xlsx
            const exportUrl = decodeURIComponent(exportPage.url());
            expect(
              exportUrl,
              "URL экспорта должен содержать /download/",
            ).toContain("/download/");
            expect(
              exportUrl,
              "URL экспорта должен содержать export/xlsx",
            ).toMatch(/export\/(xlsx|csv)/);

            // Закрываем вкладку экспорта
            await exportPage.close();
          },
        );
      },
    );
  },
);
