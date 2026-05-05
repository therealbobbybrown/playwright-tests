// tests/functional/org-structure/groups/org-structure-groups-rename.spec.js
import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureUserGroupsPage } from "../../../../pages/StructureUserGroupsPage.js";
import { OrgStructureAPI, getCredentials } from "../../../utils/api/index.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура - переименование группы пользователей",
  { tag: ["@ui", "@regression"] },
  () => {
    /** @type {OrgStructureAPI} */
    let api;
    /** @type {number|null} */
    let createdGroupId = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials("admin");
      api = new OrgStructureAPI(request);
      await api.signIn(email, password);

      const { data } = await api.createUserGroup({
        title: `Автотест переименование ${Date.now()}`,
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

    test.afterAll(async () => {
      if (createdGroupId) {
        await api.deleteUserGroup(createdGroupId).catch(() => {});
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8193: Админ переименовывает группу",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const groupsPage = new StructureUserGroupsPage(page, testInfo);
        const newName = `Переименованная ${Date.now()}`;

        await test.step(
          "Открыть созданную группу по прямому URL",
          async () => {
            const url = `/ru/manager/structure/user-groups/${createdGroupId}/`;
            await page.goto(url, { waitUntil: "domcontentloaded" });
            await groupsPage.assertOpened();
          },
        );

        await test.step(
          `Переименовать группу в "${newName}"`,
          async () => {
            await groupsPage.renameGroup(newName);
          },
        );

        await test.step(
          "Проверить, что название группы обновилось в списке",
          async () => {
            const groups = await groupsPage.getGroupsList();
            const found = groups.some((g) =>
              g.toLowerCase().includes(newName.toLowerCase()),
            );
            expect(found, `Группа "${newName}" должна быть в списке`).toBe(
              true,
            );
          },
        );

        await test.step("Удалить группу через UI (очистка)", async () => {
          await groupsPage.deleteGroup();
          createdGroupId = null;
        });
      },
    );
  },
);
