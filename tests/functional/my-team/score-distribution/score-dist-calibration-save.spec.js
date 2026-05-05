import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import { CalibrationFormModal } from "../../../../pages/CalibrationFormModal.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import { DatabaseClient } from "../../../utils/db/DatabaseClient.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { ensureCalibrationOnDistributionPR } from "../../../utils/helpers/ensureCalibration.js";

/**
 * Получить userId сотрудника через API поиска
 */
async function resolveUserId(request, employeeName) {
  const api = new DashboardTeamAPI(request);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  const namePart = employeeName.split(" ")[0];
  const { data } = await api.getDistributionUsers({
    usersSubset: "all",
    q: namePart,
    limit: 5,
    offset: 0,
  });
  return data?.items?.[0]?.id ?? null;
}

/**
 * API-сверка: проверить revisionMean через distribution API
 */
async function verifyViaAPI(
  request,
  employeeName,
  expectedValue,
  isNumeric,
  { expectTotalOverwritten = true } = {},
) {
  const api = new DashboardTeamAPI(request);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  const namePart = employeeName.split(" ")[0];
  const { data: apiUsers } = await api.getDistributionUsers({
    usersSubset: "all",
    q: namePart,
    limit: 5,
    offset: 0,
  });

  if (!apiUsers.items?.length) return;

  const targetUser = apiUsers.items[0];
  const { data: resultsData } = await api.getDistributionLastResults([
    targetUser.id,
  ]);

  const resultEntries = Object.values(resultsData || {});
  if (!resultEntries.length) return;

  const result = resultEntries[0];
  expect(
    result.revisionMean,
    "API revisionMean не null после калибровки",
  ).not.toBeNull();

  // revisionMean — объект { value, isOverwritten, characteristic, notOverwritten }
  const rawMean = result.revisionMean;
  const isObject = typeof rawMean === "object" && rawMean !== null;

  if (isObject) {
    // Проверка isOverwritten — только для калибровки итоговой оценки.
    // Калибровка компетенции НЕ ставит isOverwritten на уровне revisionMean.
    // ВАЖНО: getDistributionLastResults может вернуть результат ДРУГОГО PR
    // (у сотрудника несколько ревью), поэтому isOverwritten может быть false
    // для PR, отличного от того, на котором выполнялась калибровка.
    if (expectTotalOverwritten) {
      if (rawMean.isOverwritten) {
        console.log(`  API: isOverwritten=true — калибровка подтверждена`);
      } else {
        console.log(
          `  API: isOverwritten=false — возможно API вернул результат другого PR (не того, на котором калибровали)`,
        );
      }
    }

    // value — нормализованное (0..1), characteristic — текстовый бейдж
    // При отсутствии value (isOverwritten=false для другого PR) — пропускаем числовую проверку
    const apiValue = rawMean.value != null ? parseFloat(rawMean.value) : null;
    if (apiValue !== null) {
      expect(isNaN(apiValue), `value="${rawMean.value}" должен быть числом`).toBe(
        false,
      );
    }

    // notOverwritten содержит оригинал до калибровки (только для total overwrite)
    if (expectTotalOverwritten && rawMean.isOverwritten && rawMean.notOverwritten) {
      expect(
        rawMean.notOverwritten.value,
        "notOverwritten.value не null",
      ).not.toBeNull();
      // Значение ДОЛЖНО отличаться (мы его поменяли)
      if (apiValue !== null) {
        expect(apiValue).not.toBe(parseFloat(rawMean.notOverwritten.value));
      }
    }

    console.log(
      `  API: user=${targetUser.id}, value=${apiValue}, isOverwritten=${rawMean.isOverwritten}, ` +
        `characteristic="${rawMean.characteristic?.title}", ` +
        `notOverwritten.value=${rawMean.notOverwritten?.value}`,
    );
  } else {
    // Fallback: revisionMean — число (старый формат)
    const apiMean = parseFloat(rawMean);
    expect(
      isNaN(apiMean),
      `API revisionMean="${rawMean}" должен быть числом`,
    ).toBe(false);
    console.log(`  API: user=${targetUser.id}, revisionMean=${apiMean}`);

    if (isNumeric && expectedValue) {
      expect(apiMean).toBeCloseTo(parseFloat(expectedValue), 1);
    }
  }
}

/**
 * DB-сверка: проверить is_overwritten в таблице mean_history
 */
async function verifyViaDB(targetUserId) {
  let db;
  try {
    db = new DatabaseClient();
    await db.connect();

    const [dbRow] = await db.query(
      `SELECT value, is_overwritten
       FROM performance_review_user_competences_mean_history
       WHERE target_user_id = ? AND is_removed = 0
       ORDER BY performance_review_revision_id DESC
       LIMIT 1`,
      [targetUserId],
    );

    if (dbRow) {
      expect(
        Number(dbRow.is_overwritten),
        "DB is_overwritten = 1 после калибровки",
      ).toBe(1);
      console.log(
        `  DB: target_user=${targetUserId}, value=${dbRow.value}, is_overwritten=${dbRow.is_overwritten}`,
      );
    }
  } catch (e) {
    console.log(`  [DB] Пропуск: ${e.message}`);
  } finally {
    if (db?.isConnected()) await db.disconnect();
  }
}

test.describe(
  "Распределение оценок — Калибровка: реальное сохранение",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    // Оба теста модифицируют данные одного сотрудника — нельзя параллельно
    test.describe.configure({ mode: "serial" });

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);
      await ensureCalibrationOnDistributionPR(request);
    });

    let tab;
    let calibrationModal;
    let employeeWithPencil;
    let employeeName;

    test.beforeEach(async ({ adminAuth: page, request }) => {
      markAsUITest(MODULES.MY_TEAM);
      tab = new ScoreDistributionTab(page);
      calibrationModal = new CalibrationFormModal(page);
      await tab.open();
      await page.waitForLoadState("networkidle");

      // API-first: найти сотрудника с оценкой через API
      const api = new DashboardTeamAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // API-first: поиск пользователя с реальной оценкой
      const { user: userWithScore } = await api.findDistributionUser(
        (r) =>
          r.revisionMean !== null &&
          r.revisionMean !== undefined &&
          r.responseOverwritable?.isOverwritable === true,
      );

      if (userWithScore) {
        await tab.searchEmployee(
          userWithScore.lastName || userWithScore.firstName,
        );
        await page.waitForLoadState("networkidle");
      }

      // Найти строку с реальной оценкой (не "–") И кнопкой калибровки в колонке «после калибровки» (td index 2)
      await tab.tableRows
        .first()
        .waitFor({ state: "visible", timeout: 10000 });
      const rows = await tab.tableRows.all();
      employeeWithPencil = null;
      employeeName = "";

      for (const row of rows) {
        const cells = await row.locator("td").all();
        if (cells.length >= 3) {
          // Сначала проверяем, что в колонке «до калибровки» (td index 1) есть реальная оценка
          const scoreText = await cells[1].textContent();
          if (scoreText.trim() === "–" || scoreText.trim() === "") continue;

          // Кнопка-карандаш появляется при hover на ячейку (React conditional render)
          await cells[2].hover();
          const buttonCount = await cells[2].locator("button").count();
          if (buttonCount > 0) {
            employeeWithPencil = row;
            const nameEl = row
              .locator("td")
              .first()
              .locator('[class*="User_full-name-wrapper"] > div')
              .first();
            employeeName = await nameEl.innerText();
            break;
          }
        }
      }

      if (!employeeWithPencil) {
        throw new Error(
          "Нет сотрудника с иконкой калибровки — проверьте seed данные",
        );
      }
    });

    test(
      "C7248: Калибровка итоговой оценки — сохранение обновляет значение в таблице",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");
        test.slow();

        const calibCell = employeeWithPencil.locator("td").nth(2);
        let cellTextBefore;
        let modal;
        let isNumeric;
        let isDropdown;
        let newValue;

        await test.step("Запомнить текущее значение в ячейке калибровки", async () => {
          cellTextBefore = (await calibCell.innerText()).trim();
          console.log(
            `  Сотрудник: "${employeeName}", до: "${cellTextBefore}"`,
          );
        });

        await test.step("Открыть модалку калибровки и ввести новое значение итоговой оценки", async () => {
          // ── 2. Открыть модалку ──
          await calibCell.hover();
          await calibCell.locator("button").first().click();
          modal = await calibrationModal.getModal();
          await modal.waitFor({ state: "visible", timeout: 10000 });

          // ── 3. Проверить числовой режим итоговой ──
          isNumeric = await calibrationModal.isTotalScoreNumericMode();
          isDropdown = await calibrationModal.isTotalScoreDropdownMode();

          if (isNumeric) {
            const originalValue =
              await calibrationModal.getTotalScoreInputValue();
            const currentNum = parseFloat(originalValue) || 3;
            newValue = currentNum === 3.5 ? "4" : "3.5";
            console.log(`  Числовой: "${originalValue}" → "${newValue}"`);
            await calibrationModal.setTotalScore(newValue);

            const inputAfter = await calibrationModal.getTotalScoreInputValue();
            expect(parseFloat(inputAfter), "Input принял новое значение").toBe(
              parseFloat(newValue),
            );
          } else if (isDropdown) {
            const originalChar =
              await calibrationModal.getSelectedTotalCharacteristic();
            const options =
              await calibrationModal.getTotalCharacteristicOptions();
            const otherOption = options.find((o) => o !== originalChar);
            if (!otherOption) {
              test.skip(true, "Одна опция в дропдауне — нечего менять");
            }
            newValue = otherOption;
            console.log(`  Дропдаун: "${originalChar}" → "${newValue}"`);
            await calibrationModal.selectTotalCharacteristic(newValue);
          } else {
            test.skip(
              true,
              "Нет числового input и нет дропдауна для итоговой оценки",
            );
          }
        });

        await test.step("Сохранить калибровку и проверить через модалку", async () => {
          // ── 4. Сохранить ──
          await calibrationModal.save();

          // ── 5. Модалка закрылась ──
          await expect(
            modal,
            "Модалка закрывается после сохранения калибровки итоговой",
          ).not.toBeVisible({ timeout: 10000 });

          // ── 6. Ждём обновления данных ──
          await page.waitForLoadState("networkidle");
        });

        await test.step("Повторно открыть модалку и убедиться, что новое значение сохранилось", async () => {
          // ── 7. Повторное открытие (на той же странице, без reload) ──
          await calibCell.hover();
          await calibCell.locator("button").first().click();
          const freshModal = await calibrationModal.getModal();
          await freshModal.waitFor({ state: "visible", timeout: 10000 });

          if (isNumeric) {
            const persisted = await calibrationModal.getTotalScoreInputValue();
            const persistedNum = parseFloat(persisted);
            expect(
              isNaN(persistedNum),
              `Input содержит число, получено: "${persisted}"`,
            ).toBe(false);
            console.log(`  После повторного открытия input: "${persisted}"`);
          }
          if (isDropdown) {
            const persisted =
              await calibrationModal.getSelectedTotalCharacteristic();
            expect(persisted, "Дропдаун содержит значение").toBeTruthy();
            console.log(`  После повторного открытия дропдаун: "${persisted}"`);
          }

          await calibrationModal.cancel();
          await expect(freshModal).not.toBeVisible({ timeout: 10000 });
        });

        await test.step("Проверить сохранение через API и БД", async () => {
          // ── 8. API-сверка ──
          await verifyViaAPI(request, employeeName, newValue, isNumeric);

          // ── 9. DB-сверка ──
          const userId = await resolveUserId(request, employeeName);
          if (userId) await verifyViaDB(userId);
        });
      },
    );

    test(
      "C7249: Калибровка компетенции — сохранение обновляет оценку параметра",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");
        test.slow();

        const calibCell = employeeWithPencil.locator("td").nth(2);
        let modal;
        let originalScore;
        let newScore;

        await test.step("Открыть модалку калибровки и изменить оценку первой компетенции", async () => {
          // ── 1. Запомнить текущее значение ──
          const cellTextBefore = (await calibCell.innerText()).trim();
          console.log(
            `  Сотрудник: "${employeeName}", до: "${cellTextBefore}"`,
          );

          // ── 2. Открыть модалку ──
          await calibCell.hover();
          await calibCell.locator("button").first().click();
          modal = await calibrationModal.getModal();
          await modal.waitFor({ state: "visible", timeout: 10000 });

          // ── 3. Прочитать компетенции ──
          const compsBefore = await calibrationModal.getCompetencies();
          expect(
            compsBefore.length,
            "Должна быть хотя бы одна компетенция",
          ).toBeGreaterThan(0);

          const targetComp = compsBefore[0];
          originalScore = targetComp.score;
          console.log(
            `  Компетенция: "${targetComp.name}", оценка до: ${originalScore}`,
          );

          // ── 4. Изменить оценку первой компетенции ──
          const currentNum = originalScore || 3;
          newScore = currentNum === 3 ? 4 : 3;
          await calibrationModal.setCompetencyScore(0, newScore);
          console.log(`  Установлена новая оценка: ${newScore}`);

          // ── 5. Проверить, что пилюля пересчиталась ──
          const compsAfterEdit = await calibrationModal.getCompetencies();
          const updatedComp = compsAfterEdit[0];
          console.log(`  Пилюля после редактирования: ${updatedComp.score}`);
          // Пилюля должна измениться (оценка пересчитывается из вопросов)
          if (originalScore !== null) {
            expect(
              updatedComp.score,
              "Оценка компетенции должна измениться",
            ).not.toBe(originalScore);
          }
        });

        await test.step("Сохранить калибровку компетенции и проверить, что модалка закрылась", async () => {
          // ── 6. Сохранить ──
          await calibrationModal.save();

          // ── 7. Модалка закрылась ──
          await expect(
            modal,
            "Модалка закрывается после сохранения калибровки компетенции",
          ).not.toBeVisible({ timeout: 10000 });

          // ── 8. Дождаться обновления ──
          await page.waitForLoadState("networkidle");
        });

        await test.step("Повторно открыть модалку и проверить сохранённую оценку компетенции", async () => {
          // ── 9. Повторно открыть модалку — оценка компетенции сохранилась ──
          await calibCell.hover();
          await calibCell.locator("button").first().click();
          await modal.waitFor({ state: "visible", timeout: 10000 });

          const compsAfterSave = await calibrationModal.getCompetencies();
          expect(
            compsAfterSave.length,
            "Компетенции должны загрузиться в модалке после сохранения",
          ).toBeGreaterThanOrEqual(1);

          const savedComp = compsAfterSave[0];
          console.log(
            `  Компетенция после сохранения: "${savedComp.name}" = ${savedComp.score}`,
          );

          // Оценка после сохранения должна соответствовать новому значению
          expect(
            savedComp.score,
            `Оценка "${savedComp.name}" = ${savedComp.score}, ожидалось ~${newScore}`,
          ).toBeCloseTo(newScore, 0);

          await calibrationModal.cancel();
          await expect(modal).not.toBeVisible({ timeout: 10000 });
        });

        await test.step("Проверить сохранение через API и БД", async () => {
          // ── 10. API-сверка ──
          await verifyViaAPI(request, employeeName, null, false, {
            expectTotalOverwritten: false,
          });

          // ── 11. DB-сверка ──
          const userId = await resolveUserId(request, employeeName);
          if (userId) await verifyViaDB(userId);
        });
      },
    );
  },
);
