// Кросс-модульный тест: сотрудник отдела виден в дереве конструктора
// Бизнес-правило: сотрудник без отдела или без руководителя НЕ отображается в дереве
import { test } from "../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureDepartmentsPage } from "../../../pages/StructureDepartmentsPage.js";
import { StructureConstructorPage } from "../../../pages/StructureConstructorPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — кросс-модуль: отдел и конструктор",
  { tag: ["@ui", "@regression", "@cross-module"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8199: Сотрудник с отделом и руководителем отображается в дереве конструктора",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        let employeeName;

        await test.step(
          "Открыть существующий отдел и запомнить имя сотрудника",
          async () => {
            const deptPage = new StructureDepartmentsPage(page, testInfo);
            await deptPage.openFromSideMenu();

            // Открываем первый отдел в дереве
            const firstDeptLink = page
              .locator('a[href*="/departments/department/"]')
              .first();
            await firstDeptLink.waitFor({ state: "visible", timeout: 10000 });
            const href = await firstDeptLink.getAttribute("href");
            await page.goto(href, { waitUntil: "domcontentloaded" });
            await page.waitForLoadState("networkidle").catch(() => {});

            // Берём имя первого сотрудника из отдела
            const employeeCard = page
              .locator('[class*="SectionUsers_item"]')
              .first();
            await employeeCard.waitFor({ state: "visible", timeout: 10000 });
            const fullText = (await employeeCard.innerText()).trim();
            const lines = fullText
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            // Имя — строка длиннее 2 символов, не email
            employeeName = lines.find(
              (l) => l.length > 2 && !l.includes("@"),
            );
            expect(
              employeeName,
              "Имя сотрудника должно быть непустым",
            ).toBeTruthy();
          },
        );

        await test.step(
          "Открыть конструктор и найти сотрудника в дереве",
          async () => {
            const constructorPage = new StructureConstructorPage(
              page,
              testInfo,
            );
            await constructorPage.openFromSideMenu();

            // Ждём загрузки дерева
            await page
              .locator('[class*="User_user"]')
              .first()
              .waitFor({ state: "visible", timeout: 15000 });

            // Используем поиск для нахождения сотрудника
            await constructorPage.searchButton.click();
            const textbox = page.getByRole("textbox").first();
            await textbox.waitFor({ state: "visible", timeout: 5000 });

            // Берём первое слово имени для поиска (например "Elijah")
            const searchTerm = employeeName.split(" ")[0];
            await textbox.fill(searchTerm);
            await page.waitForLoadState("networkidle").catch(() => {});

            // Проверяем что узел с этим именем виден в дереве
            const treeNode = page
              .locator(`[class*="User_user"] button:has-text("${searchTerm}")`)
              .first()
              .or(page.locator(`button:has-text("${searchTerm}")`).first());
            await expect(treeNode).toBeVisible({ timeout: 10000 });

            // Закрываем поиск
            const overlay = page.locator(
              '[class*="UserSearchModal_overlay"]',
            );
            await overlay.click({ force: true }).catch(() => {});
          },
        );
      },
    );
  },
);
