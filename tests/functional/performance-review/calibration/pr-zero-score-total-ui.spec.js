// @ts-check
/**
 * UI-тест: нулевые ответы — «Итоговая оценка» должна показывать "0", а не "–"
 *
 * Баг бэкенда (подтверждено разработчиками):
 *   endpoint users-competencies-results/get НЕ ВКЛЮЧАЕТ пользователя в массив ответа
 *   когда его итоговый score=0. Фронтенд корректно обрабатывает value=0 (nullish coalescing
 *   в PlainNumber, проверка typeof в getHeatMapValueAndColor), но т.к. бэкенд не отдаёт
 *   запись — HeatMapSummaryResults.tsx:161 `if (targetUserCompetenciesResult)` → false → "–".
 *
 * Сценарий:
 *   1. Seed: CalibrationSeed → анкета rangeMin=0 → все ответы = 0
 *   2. Открыть Results → вкладка «Группы»
 *   3. Найти пользователей, у которых компетенции = "0"
 *   4. Проверить, что «Итоговая оценка» для них тоже "0" (не "–")
 *
 * Ожидаемый результат: ТЕСТ ДОЛЖЕН ПАДАТЬ, фиксируя баг бэкенда.
 *
 * @tags @ui @calibration @critical @performance-review @regression
 */
import { test, expect } from "../../../fixtures/auth.js";
import { request as playwrightRequest } from "@playwright/test";
import { randomUUID } from "crypto";
import {
  PerformanceReviewAPI,
  getCredentials,
  getTestUserPassword,
} from "../../../utils/api/index.js";
import { CalibrationSeed } from "../../../utils/seed/CalibrationSeed.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { buildPRUrl } from "../../../utils/pr-urls.js";

// ── Shared state ─────────────────────────────────────────────
let TEST_PR_ID;

// ── Helpers (reused from pr-zero-score-total.spec.js) ────────

async function createZeroScaleAssessment(assessmentsAPI, competencies) {
  const { response: createResp, data: assessment } =
    await assessmentsAPI.createAssessment();
  if (!createResp.ok())
    throw new Error(`Не удалось создать анкету: ${createResp.status()}`);

  const assessmentId = assessment.id;
  const pageId = randomUUID();

  const scaleQuestions = competencies.map((comp, index) => ({
    temporaryId: randomUUID(),
    type: "scale",
    title: `Оцените ${comp.title.toLowerCase()} сотрудника`,
    description: null,
    isRequired: true,
    allowComment: false,
    allowSkip: false,
    allowCustom: false,
    disallowStepNumbers: false,
    competenceId: comp.id,
    competenceIndicatorQuestionId: null,
    widget: "slider",
    rangeMin: 0,
    rangeMax: 5,
    rangeMinLabel: "0",
    rangeMaxLabel: "5",
    position: index + 1,
    commentHeader: null,
    isCommentRequired: false,
    commentRequiredFrom: null,
    commentRequiredTo: null,
    universalTitle: null,
    selectionLimit: null,
    updatedAnswerOptions: [],
    updatedRedirects: [],
    updatedStepLabels: [
      { temporaryId: randomUUID(), text: "Не проявляется", position: 0 },
      {
        temporaryId: randomUUID(),
        text: "Значительно ниже ожиданий",
        position: 1,
      },
      { temporaryId: randomUUID(), text: "Ниже ожиданий", position: 2 },
      {
        temporaryId: randomUUID(),
        text: "Соответствует ожиданиям",
        position: 3,
      },
      { temporaryId: randomUUID(), text: "Выше ожиданий", position: 4 },
      {
        temporaryId: randomUUID(),
        text: "Значительно выше ожиданий",
        position: 5,
      },
    ],
  }));

  const { response: updateResp } = await assessmentsAPI.updateAssessment(
    assessmentId,
    {
      title: `ZeroScale_UI_${Date.now()}`,
      description: "Анкета со шкалой 0-5 для UI-теста нулевых ответов",
      theme: {
        id: 1,
        type: "color",
        mediaId: 1,
        media: { id: 1, color: "#8dd8bf" },
      },
      themeSettings: {},
      updatedPages: [
        {
          temporaryId: pageId,
          title: "Оценка компетенций",
          description: "",
          position: 1,
          updatedQuestions: scaleQuestions,
        },
      ],
      updatedArchivedQuestions: [],
    },
  );

  if (!updateResp.ok()) {
    throw new Error(
      `Не удалось обновить анкету: ${updateResp.status()} - ${await updateResp.text()}`,
    );
  }

  console.log(
    `✓ Анкета (ID: ${assessmentId}, rangeMin=0, вопросов: ${scaleQuestions.length})`,
  );
  return assessmentId;
}

function extractQuestions(pageData) {
  return (
    pageData?.nextPage?.questions ||
    pageData?.questions ||
    pageData?.assessment?.pages?.[0]?.questions ||
    []
  );
}

async function fillAllQuestionnairesWithZeros(prAPI, prId, revisionAlias) {
  const baseURL = process.env.API_BASE_URL || process.env.BASE_URL;
  const testPassword = getTestUserPassword();

  const { data: receiversData } = await prAPI.getReceiverUsers(prId, {
    limit: 200,
  });
  const receivers = receiversData?.items || [];

  const userEmails = new Map();
  for (const r of receivers) {
    const email = r.user?.account?.email;
    if (email && !userEmails.has(email)) {
      userEmails.set(
        email,
        `${r.user?.firstName || ""} ${r.user?.lastName || ""}`.trim(),
      );
    }
  }

  let totalFilled = 0;

  for (const [email, userName] of userEmails) {
    let userCtx;
    try {
      userCtx = await playwrightRequest.newContext({ baseURL, timeout: 60000 });
      const userAPI = new PerformanceReviewAPI(userCtx);

      const { response: authResp } = await userAPI.signIn(email, testPassword);
      if (!authResp.ok()) {
        await userCtx.dispose();
        continue;
      }

      const { data, response } = await userAPI.get(
        `/private/performance-reviews/${prId}/${revisionAlias}/revision-users`,
      );
      if (!response.ok()) {
        await userCtx.dispose();
        continue;
      }

      const items = data?.items || data || [];

      for (const item of items) {
        if (item.response?.status === "complete") continue;

        const { data: pageData, response: pageResp } = await userAPI.post(
          `/private/performance-reviews/${prId}/${revisionAlias}/${item.id}/answer/page/start`,
          {},
        );
        if (!pageResp.ok()) continue;

        const questions = extractQuestions(pageData);
        if (questions.length === 0) continue;

        const answers = {};
        for (const q of questions) {
          answers[q.id || q.temporaryId] = {
            action: "answer",
            values: [{ value: 0, cantAnswer: false }],
          };
        }

        const { response: answerResp } = await userAPI.post(
          `/private/performance-reviews/${prId}/${revisionAlias}/${item.id}/answer/`,
          answers,
        );

        if (answerResp.ok() || answerResp.status() === 201) {
          totalFilled++;
        }
      }

      await userCtx.dispose();
    } catch (e) {
      if (userCtx) await userCtx.dispose();
    }
  }

  console.log(`  Заполнено анкет с value=0: ${totalFilled}`);
  return totalFilled;
}

// ── Навигация с прогревом SSR ────────────────────────────────

async function navigateToPRResults(page, prId) {
  const baseUrl = new URL(process.env.BASE_URL).origin;
  // Первый переход — прогрев (SSR может упасть на ?feature=... для нового PR)
  await page.goto(`${baseUrl}/ru/manager/performance-reviews/${prId}/`);
  await page.waitForLoadState("networkidle");
  // Второй переход — с feature flag
  await page.goto(buildPRUrl(prId, { statisticsSettings: true }));
  await page.waitForLoadState("networkidle");
}

// ====================================================================
// ТЕСТ
// ====================================================================

test.describe(
  "Нулевые ответы: UI отображает «Итоговая оценка» = 0",
  {
    tag: [
      "@ui",
      "@calibration",
      "@critical",
      "@performance-review",
      "@regression",
    ],
  },
  () => {
    test.describe.configure({ mode: "serial" });

    test.beforeAll(async ({ request }) => {
      if (TEST_PR_ID) return;

      const calSeed = new CalibrationSeed(request);
      await calSeed.init();

      console.log("1️⃣ Компетенции...");
      const groups = await calSeed.createCompetenceGroups();
      const competencies = await calSeed.createCompetencies(groups);
      if (competencies.length === 0)
        throw new Error("Не удалось создать компетенции");

      console.log("2️⃣ Анкета со шкалой 0-5...");
      const assessmentId = await createZeroScaleAssessment(
        calSeed.assessmentsAPI,
        competencies,
      );

      console.log("3️⃣ PR (self + head)...");
      const directionsConfig = {
        self: true,
        head: true,
        subordinate: false,
        colleague: false,
        custom: [],
      };
      const prId = await calSeed.createPRWithDirections(
        assessmentId,
        directionsConfig,
      );
      TEST_PR_ID = prId;

      console.log("4️⃣ Target users...");
      const { targetUsers, allUsers } = await calSeed.addTargetUsers(prId, 3);
      if (targetUsers.length === 0) throw new Error("Нет target users");

      console.log("5️⃣ Receivers...");
      await calSeed.assignReceiversForDirections(
        prId,
        targetUsers,
        allUsers,
        directionsConfig,
        2,
      );

      console.log("6️⃣ Запуск PR...");
      const revision = await calSeed.startPR(prId);
      if (!revision) throw new Error("Не удалось запустить PR");
      const revisionAlias = revision.alias || String(revision.id);

      console.log("7️⃣ Заполнение value=0...");
      const filled = await fillAllQuestionnairesWithZeros(
        calSeed.prAPI,
        prId,
        revisionAlias,
      );
      if (filled === 0) throw new Error("Не заполнено ни одной анкеты");

      // Включить веса компетенций
      const { data: currentSettings } =
        await calSeed.prAPI.getStatisticsSettings(prId);
      await calSeed.prAPI.updateStatisticsSettings(prId, {
        ...currentSettings,
        settings: {
          ...(currentSettings?.settings || {}),
          enableCompetenceWeights: true,
        },
      });

      console.log(`✅ PR ${TEST_PR_ID} готов к UI-проверке.`);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Zero Score UI");
    });

    test(
      'C4444: Итоговая оценка отображает "0", а не "–", при всех нулевых ответах',
      {
        tag: ["@critical"],
      },
      async ({ adminAuth: page }) => {
        setSeverity("critical");
        test.slow(); // seed-данные + навигация

        // ── Шаг 1: открыть страницу результатов ──────────────────
        await test.step("Открыть страницу PR → вкладка «Результаты»", async () => {
          await navigateToPRResults(page, TEST_PR_ID);

          // Кликаем вкладку "Результаты" — через CSS-класс Tabs, не getByRole (чтобы не зацепить кнопки в строках таблицы)
          const resultsTab = page
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /^Результаты$/i });
          await resultsTab.click();
          await page.waitForLoadState("networkidle", { timeout: 3000 });
        });

        // ── Шаг 2: переключиться на «Группы» (если не активна) ──
        await test.step("Переключить на sub-tab «Группы»", async () => {
          const groupsTab = page.getByRole("button", { name: /^Группы$/i });
          if (
            await groupsTab
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await groupsTab.click();
            await page.waitForLoadState("networkidle", { timeout: 2000 });
          }
        });

        // ── Шаг 3: собрать данные из таблицы ─────────────────────
        const rowsData = [];

        await test.step("Собрать данные из heatmap-таблицы", async () => {
          // Первая таблица на странице — heatmap (Сотрудники | Итоговая оценка | группы...)
          const table = page.locator("table").first();
          await expect(table).toBeVisible({ timeout: 10000 });

          // Все строки body (не header)
          const bodyRows = table.locator(
            "tbody tr, rowgroup:nth-of-type(2) tr",
          );
          const rowCount = await bodyRows.count();
          console.log(`Строк в heatmap-таблице: ${rowCount}`);

          for (let i = 0; i < rowCount; i++) {
            const row = bodyRows.nth(i);
            const cells = row.locator('td, th[scope="row"]');
            const cellCount = await cells.count();
            if (cellCount < 3) continue; // Минимум: имя + итоговая + 1 группа

            const nameCell = await cells
              .nth(0)
              .innerText()
              .catch(() => "");
            const totalCell = await cells
              .nth(1)
              .innerText()
              .catch(() => "");

            // Остальные ячейки — компетенции/группы
            const groupCells = [];
            for (let j = 2; j < cellCount; j++) {
              groupCells.push(
                await cells
                  .nth(j)
                  .innerText()
                  .catch(() => ""),
              );
            }

            rowsData.push({
              name: nameCell.trim(),
              total: totalCell.trim(),
              groups: groupCells.map((c) => c.trim()),
            });
          }

          console.log("Данные таблицы:");
          for (const r of rowsData) {
            console.log(
              `  ${r.name}: итоговая="${r.total}" | группы=${JSON.stringify(r.groups)}`,
            );
          }
        });

        // ── Шаг 4: проверить — если группы = "0", итоговая тоже = "0" ──
        await test.step('Проверить: «Итоговая оценка» = "0" для пользователей с нулевыми оценками', async () => {
          expect(
            rowsData.length,
            "Таблица должна содержать строки",
          ).toBeGreaterThan(0);

          // Находим строки, где хотя бы одна группа = "0" (т.е. данные есть, но все ответы = 0)
          const rowsWithZeroData = rowsData.filter((r) =>
            r.groups.some((g) => g === "0"),
          );

          console.log(
            `Строки с нулевыми оценками (группы = "0"): ${rowsWithZeroData.length}`,
          );
          expect(
            rowsWithZeroData.length,
            "Должны быть пользователи с нулевыми оценками",
          ).toBeGreaterThan(0);

          // Основная проверка: «Итоговая оценка» должна быть "0", а не "–"
          for (const row of rowsWithZeroData) {
            console.log(
              `  🔍 ${row.name}: итоговая="${row.total}" (ожидаем "0")`,
            );
            expect(
              row.total,
              `${row.name}: «Итоговая оценка» должна быть "0" (все ответы = 0), но UI показывает "${row.total}". ` +
                `Баг бэкенда: users-competencies-results/get не возвращает value при score=0.`,
            ).toBe("0");
          }
        });

        // ── Скриншот для отчёта ──────────────────────────────────
        await page.screenshot({
          path: "test-results/zero-score-total-ui-default.png",
          fullPage: false,
        });
      },
    );

    test(
      'C4445: Итоговая оценка = "0" в режиме «Только руководитель» (useOnlyHeadReceiver)',
      {
        tag: ["@critical"],
      },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");
        test.slow();

        // ── Переключить на режим «Только руководитель» через API ──
        await test.step("Включить useOnlyHeadReceiver через API", async () => {
          const api = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { data: current } = await api.getStatisticsSettings(TEST_PR_ID);
          await api.updateStatisticsSettings(TEST_PR_ID, {
            ...current,
            settings: {
              ...(current?.settings || {}),
              useOnlyHeadReceiver: true,
              enableCompetenceWeights: true,
            },
          });
          console.log("✓ Режим «Только руководитель» включён");
        });

        // ── Открыть страницу результатов ──
        await test.step("Открыть страницу PR → вкладка «Результаты»", async () => {
          await navigateToPRResults(page, TEST_PR_ID);

          const resultsTab = page
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /^Результаты$/i });
          await resultsTab.click();
          await page.waitForTimeout(2000);
        });

        await test.step("Переключить на sub-tab «Группы»", async () => {
          const groupsTab = page.getByRole("button", { name: /^Группы$/i });
          if (
            await groupsTab
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await groupsTab.click();
            await page.waitForLoadState("networkidle", { timeout: 2000 });
          }
        });

        // ── Собрать данные из таблицы ──
        const rowsData = [];

        await test.step("Собрать данные из heatmap-таблицы (режим руководитель)", async () => {
          const table = page.locator("table").first();
          await expect(table).toBeVisible({ timeout: 10000 });

          const bodyRows = table.locator(
            "tbody tr, rowgroup:nth-of-type(2) tr",
          );
          const rowCount = await bodyRows.count();
          console.log(`Строк в heatmap-таблице (руководитель): ${rowCount}`);

          for (let i = 0; i < rowCount; i++) {
            const row = bodyRows.nth(i);
            const cells = row.locator('td, th[scope="row"]');
            const cellCount = await cells.count();
            if (cellCount < 3) continue;

            const nameCell = await cells
              .nth(0)
              .innerText()
              .catch(() => "");
            const totalCell = await cells
              .nth(1)
              .innerText()
              .catch(() => "");

            const groupCells = [];
            for (let j = 2; j < cellCount; j++) {
              groupCells.push(
                await cells
                  .nth(j)
                  .innerText()
                  .catch(() => ""),
              );
            }

            rowsData.push({
              name: nameCell.trim(),
              total: totalCell.trim(),
              groups: groupCells.map((c) => c.trim()),
            });
          }

          console.log("Данные таблицы (режим руководитель):");
          for (const r of rowsData) {
            console.log(
              `  ${r.name}: итоговая="${r.total}" | группы=${JSON.stringify(r.groups)}`,
            );
          }
        });

        // ── Проверка ──
        await test.step('Проверить: «Итоговая оценка» = "0" для пользователей с нулевыми оценками', async () => {
          expect(
            rowsData.length,
            "Таблица должна содержать строки",
          ).toBeGreaterThan(0);

          const rowsWithZeroData = rowsData.filter((r) =>
            r.groups.some((g) => g === "0"),
          );

          console.log(
            `Строки с нулевыми оценками (режим руководитель): ${rowsWithZeroData.length}`,
          );
          expect(
            rowsWithZeroData.length,
            "Должны быть пользователи с нулевыми оценками в режиме руководитель",
          ).toBeGreaterThan(0);

          for (const row of rowsWithZeroData) {
            console.log(
              `  🔍 ${row.name}: итоговая="${row.total}" (ожидаем "0")`,
            );
            expect(
              row.total,
              `${row.name}: «Итоговая оценка» в режиме «Только руководитель» должна быть "0", но UI показывает "${row.total}". ` +
                `Баг бэкенда: users-competencies-results/get не возвращает value при score=0.`,
            ).toBe("0");
          }
        });

        await page.screenshot({
          path: "test-results/zero-score-total-ui-head-only.png",
          fullPage: false,
        });
      },
    );

    test(
      'C4446: Итоговая оценка = "0" в режиме «Калибровка» (enableResponsesOverwriting)',
      {
        tag: ["@critical"],
      },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");
        test.slow();

        // ── Переключить на режим «Калибровка» через API ──
        await test.step("Включить калибровку через API", async () => {
          const api = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { data: current } = await api.getStatisticsSettings(TEST_PR_ID);
          await api.updateStatisticsSettings(TEST_PR_ID, {
            ...current,
            settings: {
              ...(current?.settings || {}),
              useOnlyHeadReceiver: true,
              enableCompetenceWeights: true,
              enableResponsesOverwriting: true,
            },
          });
          console.log("✓ Режим «Калибровка» включён");
        });

        // ── Открыть страницу результатов ──
        await test.step("Открыть страницу PR → вкладка «Результаты»", async () => {
          await navigateToPRResults(page, TEST_PR_ID);

          const resultsTab = page
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /^Результаты$/i });
          await resultsTab.click();
          await page.waitForTimeout(2000);
        });

        await test.step("Переключить на sub-tab «Группы»", async () => {
          const groupsTab = page.getByRole("button", { name: /^Группы$/i });
          if (
            await groupsTab
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await groupsTab.click();
            await page.waitForLoadState("networkidle", { timeout: 2000 });
          }
        });

        // ── Собрать данные из таблицы ──
        const rowsData = [];

        await test.step("Собрать данные из heatmap-таблицы (режим калибровка)", async () => {
          const table = page.locator("table").first();
          await expect(table).toBeVisible({ timeout: 10000 });

          const bodyRows = table.locator(
            "tbody tr, rowgroup:nth-of-type(2) tr",
          );
          const rowCount = await bodyRows.count();
          console.log(`Строк в heatmap-таблице (калибровка): ${rowCount}`);

          for (let i = 0; i < rowCount; i++) {
            const row = bodyRows.nth(i);
            const cells = row.locator('td, th[scope="row"]');
            const cellCount = await cells.count();
            if (cellCount < 3) continue;

            const nameCell = await cells
              .nth(0)
              .innerText()
              .catch(() => "");
            const totalCell = await cells
              .nth(1)
              .innerText()
              .catch(() => "");

            const groupCells = [];
            for (let j = 2; j < cellCount; j++) {
              groupCells.push(
                await cells
                  .nth(j)
                  .innerText()
                  .catch(() => ""),
              );
            }

            rowsData.push({
              name: nameCell.trim(),
              total: totalCell.trim(),
              groups: groupCells.map((c) => c.trim()),
            });
          }

          console.log("Данные таблицы (режим калибровка):");
          for (const r of rowsData) {
            console.log(
              `  ${r.name}: итоговая="${r.total}" | группы=${JSON.stringify(r.groups)}`,
            );
          }
        });

        // ── Проверка ──
        await test.step('Проверить: «Итоговая оценка» = "0" для пользователей с нулевыми оценками', async () => {
          expect(
            rowsData.length,
            "Таблица должна содержать строки",
          ).toBeGreaterThan(0);

          const rowsWithZeroData = rowsData.filter((r) =>
            r.groups.some((g) => g === "0"),
          );

          console.log(
            `Строки с нулевыми оценками (режим калибровка): ${rowsWithZeroData.length}`,
          );
          expect(
            rowsWithZeroData.length,
            "Должны быть пользователи с нулевыми оценками в режиме калибровка",
          ).toBeGreaterThan(0);

          for (const row of rowsWithZeroData) {
            console.log(
              `  🔍 ${row.name}: итоговая="${row.total}" (ожидаем "0")`,
            );
            expect(
              row.total,
              `${row.name}: «Итоговая оценка» в режиме «Калибровка» должна быть "0", но UI показывает "${row.total}". ` +
                `Баг бэкенда: users-competencies-results/get не возвращает value при score=0.`,
            ).toBe("0");
          }
        });

        await page.screenshot({
          path: "test-results/zero-score-total-ui-calibration.png",
          fullPage: false,
        });
      },
    );
  },
);
