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

test.describe(
  "Орг. структура — группы пользователей: удаление группы",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      api = new OrgStructureAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      groupName = `Автотест удаление ${Date.now()}`;
      const { data } = await api.createUserGroup({
        title: groupName,
        emoji: "🧪",
        autoTitle: false,
      });
      createdGroupId = data?.id ?? null;
      if (!createdGroupId) {
        throw new Error(
          `Не удалось создать группу через API. Response: ${JSON.stringify(data)}`,
        );
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8191: Админ удаляет группу и она исчезает из списка",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const groupsPage = new StructureUserGroupsPage(page, testInfo);

        await test.step("Открыть созданную группу по прямому URL", async () => {
          const url = `/ru/manager/structure/user-groups/${createdGroupId}/`;
          await page.goto(url, { waitUntil: "domcontentloaded" });
          await groupsPage.assertOpened();
        });

        await test.step(
          "Проверить, что группа есть в списке до удаления",
          async () => {
            const groupsBefore = await groupsPage.getGroupsList();
            expect(groupsBefore).toContain(groupName);
          },
        );

        await test.step(
          "Удалить группу через контекстное меню",
          async () => {
            await groupsPage.deleteGroup();
          },
        );

        await test.step(
          "Проверить, что удалённая группа исчезла из списка",
          async () => {
            const groupsAfter = await groupsPage.getGroupsList();
            expect(groupsAfter).not.toContain(groupName);
          },
        );
      },
    );
  },
);
