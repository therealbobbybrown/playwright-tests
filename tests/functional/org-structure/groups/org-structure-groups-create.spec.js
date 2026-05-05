// tests/functional/org-structure/groups/org-structure-groups-create.spec.js
import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureUserGroupsPage } from "../../../../pages/StructureUserGroupsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура - создание группы пользователей",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8190: Админ создаёт новую группу и видит её в списке",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const groupsPage = new StructureUserGroupsPage(page, testInfo);
        const groupName = `Автотест группа ${Date.now()}`;

        await test.step(
          'Открыть страницу "Группы пользователей" через боковое меню',
          async () => {
            await groupsPage.openFromSideMenu();
          },
        );

        await test.step(`Создать новую группу с именем "${groupName}"`, async () => {
          await groupsPage.createGroup(groupName);
        });

        await test.step("Проверить, что заголовок открытой группы соответствует созданному", async () => {
          const titleText = await groupsPage.groupTitle.textContent();
          expect(titleText).toContain(groupName);
        });

        await test.step("Проверить, что группа появилась в левом списке", async () => {
          const groups = await groupsPage.getGroupsList();
          expect(groups).toContain(groupName);
        });

        await test.step("Удалить созданную группу (очистка)", async () => {
          await groupsPage.deleteGroup();
        });
      },
    );
  },
);
