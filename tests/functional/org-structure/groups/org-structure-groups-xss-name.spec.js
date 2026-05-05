import { expect } from "@playwright/test";
import { test } from "../../../fixtures/auth.js";
import { StructureUserGroupsPage } from "../../../../pages/StructureUserGroupsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — группы пользователей: спецсимволы в названии группы",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8194: Админ создаёт группу со спецсимволами в названии — они отображаются как текст",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const groupsPage = new StructureUserGroupsPage(page, testInfo);
        const xssName = `<b>Bold</b> &amp; "quotes" ${Date.now()}`;

        await test.step("Открыть страницу групп пользователей через боковое меню", async () => {
          await groupsPage.openFromSideMenu();
        });

        await test.step(`Создать группу с названием содержащим HTML: ${xssName}`, async () => {
          await groupsPage.createGroup(xssName);
        });

        await test.step("Проверить, что название группы отображается как текст, а не как HTML", async () => {
          const titleText = await groupsPage.groupTitle.textContent();
          expect(titleText).toContain("<b>Bold</b>");
          expect(titleText).toContain("&amp;");
          expect(titleText).toContain('"quotes"');
        });

        await test.step("Проверить, что группа присутствует в списке с корректным названием", async () => {
          const groupsList = await groupsPage.getGroupsList();
          const found = groupsList.some((g) => g.includes("<b>Bold</b>"));
          expect(found, "Группа со спецсимволами должна присутствовать в списке").toBe(true);
        });

        await test.step("Удалить созданную группу", async () => {
          await groupsPage.deleteGroup();
        });
      },
    );
  },
);
