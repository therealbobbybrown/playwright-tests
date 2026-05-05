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

test.describe(
  "Орг. структура — группы пользователей: добавление участников",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      api = new OrgStructureAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      const groupName = `Автотест участники ${Date.now()}`;
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

    test.afterAll(async () => {
      if (createdGroupId) {
        await api.deleteUserGroup(createdGroupId).catch(() => {});
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8188: Админ добавляет сотрудников в группу",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const groupsPage = new StructureUserGroupsPage(page, testInfo);

        await test.step("Открыть созданную группу по прямому URL", async () => {
          const url = `/ru/manager/structure/user-groups/${createdGroupId}/`;
          await page.goto(url, { waitUntil: "domcontentloaded" });
          await groupsPage.assertOpened();
        });

        await test.step("Добавить 2 сотрудников в группу", async () => {
          await groupsPage.addUsersToGroup(2);
        });

        await test.step(
          "Перезагрузить страницу и проверить, что участники сохранились",
          async () => {
            // Перезагружаем чтобы убедиться что данные сохранились
            await page.reload({ waitUntil: "domcontentloaded" });
            await groupsPage.assertOpened();

            // Проверяем через API — новый контекст запроса
            const verifyApi = new OrgStructureAPI(page.context().request);
            const { email, password } = getCredentials("admin");
            await verifyApi.signIn(email, password);

            const { data: groupUsers } = await verifyApi.getUserGroupUsers(
              createdGroupId,
              { limit: 10 },
            );
            const users = groupUsers?.items || groupUsers || [];
            expect(users.length).toBeGreaterThanOrEqual(2);
          },
        );
      },
    );
  },
);
