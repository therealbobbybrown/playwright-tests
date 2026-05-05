import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureDepartmentsPage } from "../../../../pages/StructureDepartmentsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — отделы: нераспределённые сотрудники",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8186: Админ открывает раздел «Не распределены» и видит сотрудников",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const deptPage = new StructureDepartmentsPage(page, testInfo);

        await test.step(
          'Открыть страницу "Настройка отделов" через боковое меню',
          async () => {
            await deptPage.openFromSideMenu();
          },
        );

        await test.step('Нажать ссылку "Не распределены" в левой панели', async () => {
          await deptPage.outsideUsersLink.waitFor({
            state: "visible",
            timeout: 10_000,
          });
          await deptPage.outsideUsersLink.click();
        });

        await test.step(
          "Проверить, что URL содержит /departments/outside/",
          async () => {
            await page.waitForURL(/\/departments\/outside\//, {
              timeout: 15_000,
            });
          },
        );

        await test.step(
          "Проверить, что основная область страницы загрузилась",
          async () => {
            await expect(deptPage.mainArea).toBeVisible({ timeout: 10_000 });
          },
        );

        await test.step(
          "Проверить, что отображается секция с нераспределёнными сотрудниками",
          async () => {
            const employeesSection = deptPage.mainArea.locator(
              'section:has(h3:has-text("Сотрудники")), section:has(h2:has-text("Сотрудники")), [class*="SectionUsers_"], [class*="OutsideUsers_"]',
            );
            await employeesSection
              .first()
              .waitFor({ state: "visible", timeout: 15_000 });

            const employeeCards = deptPage.mainArea.locator(
              'div[class*="SectionUsers_item"], [class*="UserCard_"], [class*="OutsideUsers_item"]',
            );
            const count = await employeeCards.count();
            expect(
              count,
              "На странице нераспределённых сотрудников должен быть хотя бы один сотрудник",
            ).toBeGreaterThan(0);
          },
        );
      },
    );
  },
);
