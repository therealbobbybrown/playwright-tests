import { expect } from "@playwright/test";
import { test } from "../../../fixtures/auth.js";
import { StructureUserGroupsPage } from "../../../../pages/StructureUserGroupsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { OrgStructureAPI, getCredentials } from "../../../utils/api/index.js";

let api;
let createdGroupId;
let groupName;
let addedUserIds;

test.describe(
  "Орг. структура — группы пользователей: удаление сотрудника из группы",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      api = new OrgStructureAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      groupName = `Автотест удаление участника ${Date.now()}`;
      const res = await api.createUserGroup({ title: groupName, emoji: "🧪" });
      createdGroupId = res.data?.id ?? res.data?.userGroup?.id;
      if (!createdGroupId) {
        throw new Error("Не удалось создать группу через API — id не получен");
      }

      const usersRes = await api.getUsers({ limit: 5 });
      const users = usersRes.data?.items || usersRes.data || [];
      addedUserIds = users.slice(0, 2).map((u) => u.id);
      if (addedUserIds.length < 2) {
        throw new Error("Недостаточно пользователей для теста — нужно минимум 2");
      }
      await api.addUsersToUserGroup(createdGroupId, addedUserIds);
    });

    test.afterAll(async () => {
      if (createdGroupId) {
        await api.deleteUserGroup(createdGroupId).catch(() => {});
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8192: Админ удаляет сотрудника из группы",
      { tag: ["@ui", "@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const groupsPage = new StructureUserGroupsPage(page, testInfo);

        await test.step("Открыть созданную группу по прямому URL", async () => {
          const url = `/ru/manager/structure/user-groups/${createdGroupId}/`;
          await page.goto(url, { waitUntil: "domcontentloaded" });
          await groupsPage.assertOpened();
        });

        await test.step("Проверить, что в группе 2 сотрудника", async () => {
          await expect
            .poll(
              async () => groupsPage.userCards.count(),
              { timeout: 10000 },
            )
            .toBe(2);
        });

        await test.step("Удалить первого сотрудника из группы", async () => {
          // Карточка UserItem_user находится внутри BlockShadow_block.
          // Кнопка три точки (MenuPopupToggle) — сиблинг UserItem_user внутри BlockShadow_block.
          const firstCardBlock = groupsPage.mainArea
            .locator('[class*="BlockShadow_block"]')
            .first();
          await firstCardBlock.hover();

          // Три точки — последняя кнопка с svg внутри блока
          const menuBtn = firstCardBlock
            .locator('button[class*="MenuPopupToggle_button"], button:has(svg)')
            .last();
          await menuBtn.waitFor({ state: "visible", timeout: 5000 });
          await menuBtn.click();

          // В popup ищем пункт "Удалить из группы" / "Убрать" / "Удалить"
          const removeItem = page
            .getByRole("button", { name: /удалить из группы|убрать из группы|удалить/i })
            .first();
          await removeItem.waitFor({ state: "visible", timeout: 3000 });
          await removeItem.click();

          // Обрабатываем диалог подтверждения если он появился
          const confirmBtn = page
            .getByRole("button", { name: /да, удалить|да|подтвердить/i })
            .first();
          const confirmVisible = await confirmBtn
            .waitFor({ state: "visible", timeout: 2000 })
            .then(() => true)
            .catch(() => false);
          if (confirmVisible) {
            await confirmBtn.click();
          }
        });

        await test.step("Проверить, что в группе стало 1 сотрудник", async () => {
          await expect
            .poll(
              async () => groupsPage.userCards.count(),
              { timeout: 10000 },
            )
            .toBe(1);
        });
      },
    );
  },
);
