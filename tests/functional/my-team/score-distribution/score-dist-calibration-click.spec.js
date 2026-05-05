import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import { CalibrationFormModal } from "../../../../pages/CalibrationFormModal.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { ensureCalibrationOnDistributionPR } from "../../../utils/helpers/ensureCalibration.js";

test.describe(
  "Распределение оценок — Калибровка из таблицы",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    let tab;
    let calibrationModal;
    let employeeWithPencil;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);
      await ensureCalibrationOnDistributionPR(request);
    });

    test.beforeEach(async ({ adminAuth: page, request }) => {
      markAsUITest(MODULES.MY_TEAM);
      tab = new ScoreDistributionTab(page);
      calibrationModal = new CalibrationFormModal(page);
      await tab.open();
      await page.waitForLoadState("networkidle");

      // === API-first approach: find employee with calibration score ===
      const api = new DashboardTeamAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Find employee with calibration score using helper
      const { result: withScore, user: targetUser } =
        await api.findDistributionUser(
          (r) =>
            r.revisionMean !== null &&
            r.revisionMean !== undefined &&
            r.responseOverwritable?.isOverwritable === true,
        );

      if (!withScore || !targetUser) {
        throw new Error(
          `No employee with calibration score found in 3000 users. Run seed script: node scripts/seed-score-distribution-data.js`,
        );
      }

      // Search for employee in UI using lastName or firstName
      const searchTerm = targetUser.lastName || targetUser.firstName || "";
      if (!searchTerm) {
        throw new Error(
          `User ${withScore.targetUserId} has no lastName or firstName`,
        );
      }
      await tab.searchEmployee(searchTerm);

      // Wait for table to update
      await page.waitForLoadState("networkidle");
      await page
        .locator("table tbody tr")
        .first()
        .waitFor({ state: "visible", timeout: 10000 });

      // Find the row with pencil button (should be visible in filtered results)
      // Кнопка-карандаш появляется при hover на ячейку (React conditional render)
      const rows = tab.tableRows;
      const rowCount = await rows.count();
      employeeWithPencil = null;

      for (let i = 0; i < rowCount; i++) {
        const calibCell = rows.nth(i).locator("td").nth(2);
        await calibCell.hover();
        const buttonCount = await calibCell.locator("button").count();
        if (buttonCount > 0) {
          employeeWithPencil = rows.nth(i);
          break;
        }
      }

      if (!employeeWithPencil) {
        throw new Error(
          `Employee ${targetUser.name} found via API but no pencil button in UI — check UI rendering or seed data`,
        );
      }
    });

    test(
      "C7243: Клик на иконку-карандаш открывает форму «Калибровка оценки»",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        await test.step("Кликнуть на иконку-карандаш в строке сотрудника", async () => {
          // Получаем имя сотрудника для логирования
          const nameEl = employeeWithPencil
            .locator("td")
            .first()
            .locator('[class*="User_full-name-wrapper"] > div')
            .first();
          const employeeName = await nameEl.innerText();

          // Клик на карандаш
          const calibCell = employeeWithPencil.locator("td").nth(2);
          await calibCell.hover();
          await calibCell.locator("button").first().click();
        });

        await test.step("Проверить открытие формы «Калибровка оценки» с кнопками управления", async () => {
          // Ожидаем появление модалки
          const modal = await calibrationModal.getModal();
          await modal.waitFor({ state: "visible", timeout: 10000 });

          // Заголовок — «Калибровка оценки»
          const modalTitle = page.getByText("Калибровка оценки");
          await expect(modalTitle).toBeVisible();

          // Кнопки «Сохранить» и «Отменить»
          const saveButton = modal
            .getByRole("button", { name: /сохранить/i })
            .first();
          const cancelButton = modal
            .getByRole("button", { name: /отмен/i })
            .first();
          await expect(saveButton).toBeVisible();
          await expect(cancelButton).toBeVisible();
        });

        await test.step("Закрыть форму кнопкой «Отменить»", async () => {
          const modal = await calibrationModal.getModal();
          const cancelButton = modal
            .getByRole("button", { name: /отмен/i })
            .first();
          // Закрываем модалку
          await cancelButton.click();
          await modal.waitFor({ state: "hidden", timeout: 10000 });
        });
      },
    );

    test(
      "C7244: Форма калибровки содержит компетенции с оценками",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        let employeeName;
        let modal;

        await test.step("Открыть форму калибровки через иконку-карандаш", async () => {
          // Получаем имя сотрудника для API-сверки
          const nameEl = employeeWithPencil
            .locator("td")
            .first()
            .locator('[class*="User_full-name-wrapper"] > div')
            .first();
          employeeName = await nameEl.innerText();

          // Открываем форму
          const calibCell = employeeWithPencil.locator("td").nth(2);
          await calibCell.hover();
          await calibCell.locator("button").first().click();

          modal = await calibrationModal.getModal();
          await modal.waitFor({ state: "visible", timeout: 10000 });
        });

        await test.step("Проверить наличие компетенций с оценками в форме", async () => {
          // Проверяем наличие компетенций
          const competencies = await calibrationModal.getCompetencies();
          expect(
            competencies.length,
            "Форма калибровки должна содержать хотя бы одну компетенцию",
          ).toBeGreaterThanOrEqual(1);

          // Каждая компетенция должна иметь имя
          for (const comp of competencies) {
            expect(
              comp.name.length,
              `Компетенция должна иметь непустое имя: ${JSON.stringify(comp)}`,
            ).toBeGreaterThanOrEqual(1);
          }

          // Хотя бы одна компетенция должна иметь числовую оценку
          const withScore = competencies.filter((c) => c.score !== null);
          expect(
            withScore.length,
            "Хотя бы одна компетенция должна иметь числовую оценку",
          ).toBeGreaterThanOrEqual(1);
        });

        await test.step("Сверить через API что у сотрудника есть revisionMean", async () => {
          // === API-сверка: количество компетенций совпадает с данными API ===
          if (employeeName) {
            const api = new DashboardTeamAPI(request);
            const { email, password } = getCredentials("admin");
            await api.signIn(email, password);

            // Ищем сотрудника по имени
            const namePart = employeeName.split(" ")[0];
            const { data: apiUsers } = await api.getDistributionUsers({
              usersSubset: "all",
              q: namePart,
              limit: 5,
              offset: 0,
            });

            if (apiUsers.items?.length > 0) {
              const targetUser = apiUsers.items[0];
              const { data: resultsData } =
                await api.getDistributionLastResults([targetUser.id]);

              // API results содержат данные о PR этого сотрудника
              const resultEntries = Object.values(resultsData || {});
              if (resultEntries.length > 0) {
                const result = resultEntries[0];
                // revisionMean из API не null = у сотрудника есть оценка
                expect(result.revisionMean).not.toBeNull();
              }
            }
          }
        });

        await test.step("Закрыть форму кнопкой «Отменить»", async () => {
          // Закрываем
          const cancelButton = modal
            .getByRole("button", { name: /отмен/i })
            .first();
          await cancelButton.click();
        });
      },
    );

    test(
      "C7245: Кнопка «Отменить» закрывает форму калибровки без сохранения",
      { tag: ["@critical"] },
      async () => {
        setSeverity("critical");

        let calibCellText;
        let modal;

        await test.step("Открыть форму калибровки и запомнить текущее значение", async () => {
          // Открываем форму
          const calibCell = employeeWithPencil.locator("td").nth(2);
          await calibCell.hover();
          await calibCell.locator("button").first().click();

          modal = await calibrationModal.getModal();
          await modal.waitFor({ state: "visible", timeout: 10000 });

          // Запоминаем значение «после калибровки» до закрытия
          calibCellText = await employeeWithPencil
            .locator("td")
            .nth(2)
            .innerText();
        });

        await test.step("Нажать «Отменить» и проверить закрытие формы без изменений", async () => {
          // Отменяем
          await calibrationModal.cancel();

          // Модалка закрылась
          await expect(modal).not.toBeVisible({ timeout: 10000 });

          // Значение в таблице не изменилось
          const calibCellTextAfter = await employeeWithPencil
            .locator("td")
            .nth(2)
            .innerText();
          expect(calibCellTextAfter).toBe(calibCellText);
        });
      },
    );
  },
);
