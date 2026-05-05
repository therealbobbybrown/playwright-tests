// tests/functional/org-structure/groups/org-structure-groups-basic.spec.js
import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureUserGroupsPage } from "../../../../pages/StructureUserGroupsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура - группы пользователей (каркас)",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      'C8189: Админ открывает "Настройка групп" и видит список групп',
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const groupsPage = new StructureUserGroupsPage(page, testInfo);

        await test.step(
          'Открыть страницу "Группы пользователей" через боковое меню',
          async () => {
            await groupsPage.openFromSideMenu();
          },
        );

        await test.step(
          "Проверить видимость левой панели и заголовка меню",
          async () => {
            await expect(groupsPage.leftSide).toBeVisible();
            await expect(groupsPage.menuTitle).toBeVisible();
          },
        );

        await test.step(
          "Проверить, что список групп не пуст",
          async () => {
            const groups = await groupsPage.getGroupsList();
            expect(groups.length).toBeGreaterThan(0);
          },
        );

        await test.step(
          "Проверить, что основная область с деталями группы отображается",
          async () => {
            await expect(groupsPage.mainArea).toBeVisible();
          },
        );
      },
    );
  },
);
