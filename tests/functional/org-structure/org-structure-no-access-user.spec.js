// tests/functional/org-structure/org-structure-no-access-user.spec.js
import { test } from "../../fixtures/auth.js";
import { expect } from "@playwright/test";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — безопасность: доступ обычного пользователя",
  { tag: ["@ui", "@security", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8204: Обычный пользователь не видит пункт «Орг. структура» в меню",
      async ({ userAuth: page }, testInfo) => {
        setSeverity("normal");

        await test.step("Открыть главную страницу", async () => {
          await page.goto("/ru/", { waitUntil: "domcontentloaded" });
          await page.waitForLoadState("domcontentloaded");
        });

        await test.step(
          "Проверить, что пункт «Орг. структура» НЕ виден в боковом меню",
          async () => {
            // Sidebar should be visible
            const sidebar = page.locator("nav").first();
            await sidebar.waitFor({ state: "visible", timeout: 10000 });

            // "Орг. структура" menu item should NOT be present
            const orgStructureItem = page
              .getByText(/Орг\. структура/i)
              .first();
            await expect(orgStructureItem).toBeHidden({ timeout: 3000 });
          },
        );
      },
    );
  },
);
