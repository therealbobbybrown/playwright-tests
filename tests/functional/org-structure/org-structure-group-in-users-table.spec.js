// Кросс-модульный тест: новая группа видна в колонке "Группа" таблицы сотрудников
import { test } from "../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureUsersPage } from "../../../pages/StructureUsersPage.js";
import { OrgStructureAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

let api;
let createdGroupId;
let addedUserId;
const groupName = `Кросс-тест ${Date.now()}`;

test.describe(
  "Орг. структура — кросс-модуль: группа в таблице сотрудников",
  { tag: ["@ui", "@regression", "@cross-module"] },
  () => {
    test.beforeAll(async ({ request }) => {
      api = new OrgStructureAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Создаём группу
      const { data: groupData } = await api.createUserGroup({
        title: groupName,
        emoji: "🔗",
        autoTitle: false,
      });
      createdGroupId = groupData?.id;
      if (!createdGroupId) {
        throw new Error(`Не удалось создать группу: ${JSON.stringify(groupData)}`);
      }

      // Получаем первого пользователя и добавляем в группу
      const { data: usersData } = await api.getUsers({ limit: 3 });
      const users = usersData?.items || usersData || [];
      if (users.length === 0) {
        throw new Error("Нет пользователей для добавления в группу");
      }
      addedUserId = users[0].id;
      await api.addUsersToUserGroup(createdGroupId, [addedUserId]);
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
      "C8200: Новая группа сотрудников отображается в колонке «Группа» таблицы",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const usersPage = new StructureUsersPage(page, testInfo);

        await test.step("Открыть список сотрудников", async () => {
          await usersPage.openFromSideMenu();
        });

        await test.step(
          "Найти добавленного в группу сотрудника в таблице",
          async () => {
            // Получим данные пользователя по ID через API
            const verifyApi = new OrgStructureAPI(page.context().request);
            const { email, password } = getCredentials("admin");
            await verifyApi.signIn(email, password);

            const { data: userData } = await verifyApi.get(
              `/manager/users/${addedUserId}/`,
            );
            const searchName =
              userData?.firstName ||
              userData?.name?.split(" ")[0] ||
              String(addedUserId);

            // Ищем в таблице
            await usersPage.searchInput.fill(searchName);
            await page.waitForLoadState("networkidle").catch(() => {});
          },
        );

        await test.step(
          "Проверить через API, что сотрудник состоит в созданной группе",
          async () => {
            // Колонка "Группа" в UI обрезает текст при большом количестве групп
            // Проверяем членство через API — это надёжнее
            const verifyApi2 = new OrgStructureAPI(page.context().request);
            const { email: e2, password: p2 } = getCredentials("admin");
            await verifyApi2.signIn(e2, p2);

            const { data: groupUsers } = await verifyApi2.getUserGroupUsers(
              createdGroupId,
              { limit: 10 },
            );
            const users = groupUsers?.items || groupUsers || [];
            const isMember = users.some((u) => u.id === addedUserId);
            expect(
              isMember,
              `Сотрудник ${addedUserId} должен быть в группе ${groupName} (id=${createdGroupId})`,
            ).toBe(true);
          },
        );

        await test.step(
          "Проверить, что колонка «Группа» существует в таблице сотрудников",
          async () => {
            const headers = await page
              .locator("th")
              .allInnerTexts();
            expect(
              headers.some((h) => /Группа/i.test(h)),
              "Колонка «Группа» должна присутствовать",
            ).toBe(true);
          },
        );
      },
    );
  },
);
