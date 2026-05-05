// tests/functional/org-structure/org-structure-no-access-direct-url.spec.js
import { test } from "../../fixtures/auth.js";
import { expect } from "@playwright/test";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — безопасность: прямой URL для обычного пользователя",
  { tag: ["@ui", "@security", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8203: Обычный пользователь при переходе по прямому URL не видит страницу оргструктуры",
      async ({ userAuth: page }, testInfo) => {
        setSeverity("normal");

        await test.step("Перейти по прямому URL на список сотрудников", async () => {
          await page.goto("/ru/manager/structure/users/", {
            waitUntil: "domcontentloaded",
          });
        });

        await test.step(
          "Проверить, что пользователь не видит страницу оргструктуры",
          async () => {
            // Should either redirect to home/403, or show 404/access denied
            // Wait for page to settle
            await page.waitForLoadState("networkidle").catch(() => {});

            const url = page.url();
            const hasTable = await page
              .locator('[class*="Table_table"]')
              .isVisible()
              .catch(() => false);

            // Either redirected away from /structure/users/ or no table visible
            const redirected = !url.includes("/structure/users/");
            const noAccess = !hasTable;

            expect(
              redirected || noAccess,
              `Пользователь не должен видеть список сотрудников. URL: ${url}, таблица видна: ${hasTable}`,
            ).toBe(true);
          },
        );
      },
    );
  },
);
