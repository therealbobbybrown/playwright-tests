import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import { ProfileMainPage } from "../../../pages/ProfileMainPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { DashboardStatusSeed } from "../../utils/seed/DashboardStatusSeed.js";
import { PerformanceReviewAPI } from "../../utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../../utils/credentials.js";

test.describe(
  "Моя команда — Навигация назад после перехода в профиль через аватар",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    // PR с ≥2 сотрудниками, видимыми менеджеру (используем manager-credentials)
    let prTitleForBackNav;
    /** ID созданного PR (для cleanup в afterAll), null если использовали существующий */
    let seededPrId = null;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);

      // findPRWithMultipleEmployees не подходит: API target-users может вернуть
      // пользователей из других команд, которые не отображаются в таблице менеджера.
      // Всегда используем DashboardStatusSeed — он создаёт PR с 3 подчинёнными менеджера.
      const seed = new DashboardStatusSeed(request);
      await seed.init();

      // seedAllAwaiting создаёт PR с 3 подчинёнными менеджера
      const pr = await seed.seedAllAwaiting();
      seededPrId = pr.id;
      prTitleForBackNav = pr.title;
      console.log(`[beforeAll] Создан seed PR: "${pr.title}" (ID: ${pr.id})`);
    });

    test.afterAll(async ({ request }) => {
      if (!seededPrId) return;

      // Cleanup: архивируем созданный PR
      try {
        const prAPI = new PerformanceReviewAPI(request);
        const { email, password } = getCredentials("admin");
        await prAPI.signIn(email, password);

        // Сначала останавливаем (если ещё активен), потом архивируем
        await prAPI.stop(seededPrId).catch(() => {});
        await prAPI.archive(seededPrId);
        console.log(`[afterAll] PR ${seededPrId} архивирован`);
      } catch (e) {
        console.warn(`[afterAll] Не удалось архивировать PR ${seededPrId}: ${e.message}`);
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7466: A8: Клик по аватару 1-го сотрудника → профиль → назад → клик по аватару 2-го сотрудника → другой профиль",
      { tag: ["@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        let firstName;
        let secondName;

        await test.step("Открыть «Моя команда»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Выбрать PR с несколькими сотрудниками", async () => {
          await myTeamPage.selectPRFromModal(prTitleForBackNav);
        });

        await test.step("Получить список сотрудников", async () => {
          // После выбора PR таблица загружается асинхронно — ждём стабилизации
          await page.waitForLoadState("networkidle").catch(() => {});
          // Ждём появления хотя бы 2-й строки в таблице
          await myTeamPage.tableRows.nth(1).waitFor({
            state: "visible",
            timeout: 15000,
          });
          const names = await myTeamPage.getAllEmployeeNames();
          expect(
            names.length,
            "В таблице должно быть не менее 2 сотрудников",
          ).toBeGreaterThanOrEqual(2);
          firstName = names[0];
          secondName = names[1];
        });

        await test.step("Кликнуть по аватару первого сотрудника", async () => {
          await myTeamPage.clickEmployeeAvatar(firstName);
        });

        await test.step("Проверить переход в профиль первого сотрудника", async () => {
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 10000 });
          expect(page.url()).toMatch(/\/ru\/profile\/\d+/);
          await profilePage.assertProfileBelongsTo(firstName);
        });

        await test.step("Вернуться назад на страницу «Моя команда» и восстановить PR", async () => {
          await page.goBack();
          await myTeamPage.assertOpened();
          // После goBack фильтр PR может сброситься — проверяем наличие сотрудника
          let rowVisible = false;
          try {
            await myTeamPage
              .getEmployeeRowByName(secondName)
              .first()
              .waitFor({ state: "visible", timeout: 3000 });
            rowVisible = true;
          } catch {
            rowVisible = false;
          }
          if (!rowVisible) {
            // Фильтр сбросился — перевыбираем PR
            await myTeamPage.selectPRFromModal(prTitleForBackNav);
          }
        });

        await test.step("Кликнуть по аватару второго сотрудника", async () => {
          await myTeamPage.clickEmployeeAvatar(secondName);
        });

        await test.step("Проверить переход в профиль второго сотрудника (отличный от первого)", async () => {
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 10000 });
          expect(page.url()).toMatch(/\/ru\/profile\/\d+/);
          await profilePage.assertProfileBelongsTo(secondName);
        });
      },
    );
  },
);
