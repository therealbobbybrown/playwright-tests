import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Моя команда — Ctrl+Click по аватару открывает профиль в новой вкладке",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7494: Ctrl+Click по аватару сотрудника открывает профиль в новой вкладке",
      { tag: ["@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        let employeeName;

        await test.step("Открыть «Моя команда»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Получить имя первого сотрудника", async () => {
          const names = await myTeamPage.getAllEmployeeNames();
          expect(
            names.length,
            "В таблице должен быть хотя бы один сотрудник",
          ).toBeGreaterThan(0);
          employeeName = names[0];
        });

        await test.step("Ctrl+Click по аватару — ожидать открытие новой вкладки", async () => {
          const [newPage] = await Promise.all([
            page.context().waitForEvent("page"),
            myTeamPage.clickEmployeeAvatarCtrlClick(employeeName),
          ]);
          // Новая вкладка открывается как about:blank, затем навигирует на профиль.
          // waitForLoadState("networkidle") может вернуться на about:blank.
          // Используем waitForURL для ожидания навигации на профиль.
          await newPage.waitForURL(/\/ru\/profile\/\d+/, { timeout: 15000 });
          expect(newPage.url()).toMatch(/\/ru\/profile\/\d+/);
          await newPage.close();
        });

        await test.step("Проверить, что исходная вкладка осталась на «Моя команда»", async () => {
          await myTeamPage.assertOpened();
        });
      },
    );
  },
);
