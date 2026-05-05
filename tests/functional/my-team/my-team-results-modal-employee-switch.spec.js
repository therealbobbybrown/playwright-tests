// tests/functional/my-team/my-team-results-modal-employee-switch.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import { EmployeeResultsModal } from "../../../pages/EmployeeResultsModal.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Моя команда — Смена сотрудника в фильтре",
  { tag: ["@ui", "@regression", "@my-team"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    /**
     * Дашборд корректно работает при PR с 2 активными направлениями (self + head).
     * PR создаётся с 4 направлениями (как в UI), 2 из которых isSelected=false.
     */
    test(
      "C3666: Дашборд при PR с 2 направлениями",
      { tag: ["@critical"] },
      async ({ adminAuth: page, prSeed }, testInfo) => {
        setSeverity("critical");

        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        let prId;
        await test.step("Создать PR с 2 активными направлениями (self + head)", async () => {
          const result = await prSeed.createPRWithLimitedDirections(2, {
            directionsCount: 2,
          });
          prId = result.prId;
          console.log(
            `✓ PR ${prId} создан с 2 активными направлениями (${result.targetUsersCount} сотрудников)`,
          );
        });

        await test.step('Открыть дашборд "Моя команда"', async () => {
          await sideMenu.openMyTeam();
        });

        await test.step("Проверить, что дашборд открылся без ошибки", async () => {
          await myTeamPage.assertOpened();
          const employeesCount = await myTeamPage.getEmployeesCount();
          console.log(`✓ Дашборд открыт, сотрудников: ${employeesCount}`);
          expect(employeesCount).toBeGreaterThanOrEqual(1);
        });

        await test.step("Cleanup: архивировать PR", async () => {
          try {
            await prSeed.prAPI.stop(prId);
            await prSeed.prAPI.archive(prId);
            console.log(`✓ PR ${prId} заархивирован`);
          } catch {
            console.log(`⚠️ Не удалось заархивировать PR ${prId}`);
          }
        });
      },
    );

    /**
     * Позитивный кейс: дашборд работает при PR с 4 направлениями.
     * PR создаётся с 4 направлениями (как UI), часть могут быть isSelected=false.
     */
    test(
      "C3667: Дашборд работает при PR с 4 направлениями",
      { tag: [] },
      async ({ adminAuth: page, prSeed }, testInfo) => {
        setSeverity("critical");

        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step("Создать PR с 4 направлениями (корректный вариант)", async () => {
          // seedHelper теперь создаёт PR с 4 направлениями как UI
          const result = await prSeed.findOrCreatePRWithMultipleTargetUsers(2, {
            forceCreate: true,
          });
          console.log(
            `✓ PR ${result.prId} создан с 4 направлениями (${result.targetUsersCount} сотрудников)`,
          );
        });

        await test.step('Открыть дашборд "Моя команда"', async () => {
          await sideMenu.openMyTeam();
        });

        await test.step("Проверить, что дашборд открылся без ошибки", async () => {
          await myTeamPage.assertOpened();

          const employeesCount = await myTeamPage.getEmployeesCount();
          console.log(`✓ Дашборд открыт, сотрудников: ${employeesCount}`);
          expect(employeesCount).toBeGreaterThanOrEqual(2);
        });
      },
    );

    /**
     * Позитивный кейс: открытие модалки для разных сотрудников.
     * Проверяет, что модалка открывается для каждого сотрудника в таблице.
     */
    test("C3668: Открытие модалки для разных сотрудников", async ({
      adminAuth: page,
      prSeed,
    }, testInfo) => {
      setSeverity("normal");

      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);
      const modal = new EmployeeResultsModal(page, testInfo);

      await test.step("Обеспечить наличие PR с 2+ сотрудниками", async () => {
        const result = await prSeed.findOrCreatePRWithMultipleTargetUsers(2);
        expect(
          result?.prId,
          "Должен быть найден или создан PR с 2+ target users",
        ).toBeTruthy();
        console.log(
          `✓ PR ${result.prId} с ${result.targetUsersCount} сотрудниками (создан: ${result.created})`,
        );
      });

      await test.step('Открыть дашборд "Моя команда"', async () => {
        await sideMenu.openMyTeam();
        await myTeamPage.assertOpened();
      });

      // Получаем имена сотрудников из таблицы
      let employeeNames = [];
      await test.step("Получить список сотрудников из таблицы", async () => {
        employeeNames = await myTeamPage.getAllEmployeeNames();
        expect(employeeNames.length).toBeGreaterThanOrEqual(2);
      });

      // Открываем модалку для первого сотрудника по имени
      await test.step(`Открыть модалку для "${employeeNames[0]}"`, async () => {
        await myTeamPage.clickResultsForEmployeeByName(employeeNames[0]);
        await modal.assertModalOpened();
        // Ждём загрузки данных сотрудника (модалка сначала грузит, потом обновляет ФИО)
        const expectedName = employeeNames[0].split(" ")[0]; // Первое слово (ID или имя)
        await modal.waitForEmployeeLoaded(expectedName);
        const modalName = await modal.getEmployeeName();
        console.log(`✓ Модалка открыта для: ${modalName}`);
        expect(modalName).toContain(expectedName);
        await modal.closeModal();
      });

      // Открываем модалку для второго сотрудника по имени
      await test.step(`Открыть модалку для "${employeeNames[1]}"`, async () => {
        await myTeamPage.clickResultsForEmployeeByName(employeeNames[1]);
        await modal.assertModalOpened();
        // Ждём загрузки данных сотрудника
        const expectedName = employeeNames[1].split(" ")[0];
        await modal.waitForEmployeeLoaded(expectedName);
        const modalName = await modal.getEmployeeName();
        console.log(`✓ Модалка открыта для: ${modalName}`);
        expect(modalName).toContain(expectedName);
        await modal.closeModal();
      });

      await test.step("Проверить, что сотрудники в таблице разные", async () => {
        expect(employeeNames[0]).not.toBe(employeeNames[1]);
        console.log(
          `✓ Сотрудники разные: "${employeeNames[0]}" и "${employeeNames[1]}"`,
        );
      });
    });
  },
);
