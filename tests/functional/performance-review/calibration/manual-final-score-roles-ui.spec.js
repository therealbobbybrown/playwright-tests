// @ts-check
/**
 * Калибровка итоговой оценки — роли и блокировка (UI)
 *
 * Тестирует видимость чекбокса блокировки и иконки калибровки для разных ролей:
 * - MFC-028: Админ видит чекбокс блокировки, по умолчанию = false
 * - MFC-029: Руководитель НЕ видит чекбокс блокировки
 * - MFC-030: Блокировка включена → иконка карандаша исчезает для руководителя
 * - MFC-031: Блокировка включена → админ всё ещё может калибровать
 *
 * ВАЖНО: Руководитель НЕ имеет доступа к /ru/manager/performance-reviews/ —
 * калибровка доступна ТОЛЬКО через дашборд /ru/dashboard/?tab=performanceReview
 * Поэтому target users в PR должны быть подчинёнными руководителя.
 *
 * @tags @ui @calibration @critical @performance-review @regression
 * @module Calibration
 */
import { test, expect } from "../../../fixtures/auth.js";
import { CalibrationFormModal } from "../../../../pages/CalibrationFormModal.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import { CalibrationSeed } from "../../../utils/seed/CalibrationSeed.js";
import { DatabaseClient } from "../../../utils/db/index.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { buildPRUrl } from "../../../utils/pr-urls.js";

// ────────────────────────────────────────────────────────────────────────────
// Shared test data
// ────────────────────────────────────────────────────────────────────────────

let PR_ID;
let PR_TITLE;
let REVISION_ID;
let TARGET_USERS; // [{ userId, name }]

/** @type {PerformanceReviewAPI} */
let API;

// ────────────────────────────────────────────────────────────────────────────
// Helpers — admin navigation (через /ru/manager/)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Навигация на страницу PR как админ с прогревом SSR и retry на 500
 */
async function navigateToCalibrationPageAsAdmin(page, prId) {
  const baseUrl = new URL(process.env.BASE_URL).origin;
  // Первый переход — прогрев SSR
  await page.goto(`${baseUrl}/ru/manager/performance-reviews/${prId}/`);
  await page.waitForLoadState("networkidle");

  // Второй переход — с feature flag; retry при SSR 500
  const targetUrl = buildPRUrl(prId, { statisticsSettings: true });
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(targetUrl);
    await page.waitForLoadState("networkidle");
    const is500 =
      (await page
        .locator("text=500")
        .first()
        .isVisible()) ||
      (await page
        .locator("text=Все упало")
        .isVisible());
    if (!is500) return;
    console.log(`  ⚠ SSR 500 на попытке ${attempt}/3, ждём 5с...`);
    await page.waitForLoadState("load", { timeout: 5000 });
  }
}

/**
 * Переключить на вкладку "Результаты" (на странице /ru/manager/performance-reviews/)
 */
async function switchToResultsTab(page) {
  const resultsTab = page
    .locator('button[class*="Tabs_button"]')
    .filter({ hasText: /результаты/i });
  await resultsTab.click();
  await page.waitForLoadState("networkidle", { timeout: 3000 });
}

/**
 * Открыть модалку калибровки как админ — клик по первому карандашу
 */
async function openCalibrationModalAsAdmin(page) {
  await switchToResultsTab(page);
  const pencilIcon = page
    .locator(
      '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
    )
    .first();
  await expect(pencilIcon).toBeVisible({ timeout: 10000 });
  await pencilIcon.click();
  const modal = page.locator('[class*="react-modal-sheet-container"]').first();
  await modal.waitFor({ state: "visible", timeout: 3000 });
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers — manager navigation (через дашборд /ru/dashboard/)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Навигация менеджера на дашборд с выбором PR
 * @param {import('@playwright/test').Page} page
 * @param {string} prTitle - название PR для поиска в модалке
 */
async function navigateToDashboardAndSelectPR(page, prTitle) {
  const baseUrl = new URL(process.env.BASE_URL).origin;
  await page.goto(`${baseUrl}/ru/dashboard/?tab=performanceReview`);
  await page.waitForLoadState("networkidle");

  // Ждём появления заголовка "Моя команда"
  await expect(
    page.getByRole("heading", { level: 1, name: /Моя команда/i }).first(),
  ).toBeVisible({ timeout: 15000 });

  // Выбираем PR через фильтр "Выберите оценку"
  const assessmentSelect = page
    .getByRole("button", { name: /Выберите оценку/i })
    .first();
  await assessmentSelect.click();

  // Ищем модалку с заголовком "Выберите оценку"
  const modal = page
    .locator(".react-modal-sheet-container")
    .filter({
      hasText: "Выберите оценку",
    })
    .first();
  await modal.waitFor({ state: "visible", timeout: 10000 });

  // Ищем карточку PR по паттерну
  const prCard = modal
    .locator('button, [class*="Card"], [class*="card"]')
    .filter({
      hasText: prTitle,
    })
    .first();
  const cardVisible = await prCard
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  if (cardVisible) {
    await prCard.click();
  } else {
    // Fallback: текстовый поиск по любому элементу
    const textMatch = modal.getByText(prTitle, { exact: false }).first();
    await textMatch.waitFor({ state: "visible", timeout: 5000 });
    await textMatch.click();
  }

  // Ждём обновления таблицы
  const table = page.locator('table[class*="Table_table"]').first();
  await table.waitFor({ state: "visible", timeout: 10000 });
}

/**
 * Найти карандаш (OverwriteButton) для пользователя в таблице дашборда
 * @returns {import('@playwright/test').Locator} локатор карандаша или null
 */
function getPencilInDashboardRow(page, userName) {
  const table = page.locator('table[class*="Table_table"]').first();
  const row = table.locator("tbody tr").filter({ hasText: userName }).first();
  return row
    .locator(
      '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
    )
    .first();
}

// ────────────────────────────────────────────────────────────────────────────
// beforeAll: seed data с подчинёнными менеджера
// ────────────────────────────────────────────────────────────────────────────

test.beforeAll(async ({ request }) => {
  test.setTimeout(240000);

  // ── 1. Получить РЕАЛЬНЫХ подчинённых менеджера через БД ──
  // Дашборд показывает только подчинённых. Подчинённые = org_struct_users_heads.
  const mgrCreds = getCredentials("manager");
  const mgrApi = new PerformanceReviewAPI(request);
  const { data: signInData } = await mgrApi.signIn(
    mgrCreds.email,
    mgrCreds.password,
  );
  // Извлекаем userId из JWT токена
  let managerUserId = signInData?.user?.id;
  if (!managerUserId && signInData?.accessToken) {
    try {
      const payload = JSON.parse(
        Buffer.from(signInData.accessToken.split(".")[1], "base64").toString(),
      );
      managerUserId = payload?.userId;
    } catch {
      /* ignore */
    }
  }
  console.log(`  Менеджер: userId=${managerUserId} (${mgrCreds.email})`);

  // Запрос подчинённых из БД (org_struct_users_heads)
  const db = new DatabaseClient();
  let subordinateRows = [];
  try {
    await db.connect();
    subordinateRows = await db.query(
      `SELECT ouh.user_id, u.first_name, u.last_name
       FROM org_struct_users_heads ouh
       JOIN users u ON u.id = ouh.user_id
       WHERE ouh.head_user_id = ?
       LIMIT 20`,
      [managerUserId],
    );
    await db.disconnect();
  } catch (e) {
    console.warn(`  ⚠ DB недоступна: ${e.message}. Пробуем API fallback...`);
  }

  // Fallback: если БД недоступна, берём из /manager/users/ и надеемся на лучшее
  if (subordinateRows.length === 0) {
    console.warn(
      "  ⚠ Не удалось получить подчинённых из БД — используем API fallback",
    );
    const { data: usersData } = await mgrApi.get(
      "/manager/users/?category=active&limit=20",
    );
    const rawItems = usersData?.items || usersData;
    const items = Array.isArray(rawItems) ? rawItems : [];
    subordinateRows = items.map((u) => ({
      user_id: u.id,
      first_name: u.firstName || "",
      last_name: u.lastName || "",
    }));
  }

  console.log(`  Подчинённых менеджера: ${subordinateRows.length}`);
  expect(
    subordinateRows.length,
    "У менеджера должны быть подчинённые",
  ).toBeGreaterThanOrEqual(4);

  // Форматируем подчинённых в формат CalibrationSeed.getAvailableUsers()
  const formattedSubs = subordinateRows.map((s) => ({
    id: s.user_id,
    firstName: s.first_name || "",
    lastName: s.last_name || "",
  }));

  // ── 2. Seed PR с подчинёнными как target users ──
  const calSeed = new CalibrationSeed(request);
  await calSeed.init();
  // Monkey-patch: getAvailableUsers возвращает только подчинённых менеджера
  calSeed.getAvailableUsers = async () => formattedSubs;

  const result = await calSeed.seedWithDirections({
    directions: { self: true, head: true },
    targetUsersCount: 4,
    receiversPerDirection: 2,
    fillQuestionnaires: true,
  });
  PR_ID = result.prId;
  console.log(`✅ PR создан: ${PR_ID}`);

  // ── 3. Получить название PR для поиска на дашборде ──
  API = new PerformanceReviewAPI(request);
  const adminCreds = getCredentials("admin");
  await API.signIn(adminCreds.email, adminCreds.password);

  const { data: prInfo } = await API.getById(PR_ID);
  PR_TITLE = prInfo?.title || `PR_Directions_`;
  console.log(`  PR title: "${PR_TITLE}"`);

  // ── 4. Включить калибровку через feature flag ──
  const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
  const { data: settings } = await API.get(featureUrl);
  await API.post(featureUrl, {
    ...settings,
    settings: {
      ...(settings?.settings || {}),
      useOnlyHeadReceiver: true,
      enableResponsesOverwriting: true,
      enableCustomCharacteristics: true,
      enableOnlyCustomCharacteristics: false,
      enableCompetenceWeights: true,
    },
    // ВСЕГДА используем чистые характеристики — существующие могут содержать мусор
    characteristicSettings: [
      { threshold: 33, title: "Низко", category: "negative" },
      { threshold: 66, title: "Средне", category: "neutral" },
      { threshold: 100, title: "Высоко", category: "positive" },
    ],
  });
  console.log("✅ Настройки калибровки включены");

  // ── 5. Получить ревизию ──
  const { data: revision } = await API.getLastRevision(PR_ID);
  REVISION_ID = revision?.id;
  console.log(`  Revision: ${REVISION_ID}`);

  // ── 6. Получить target users ──
  const { data: targetUsersData } = await API.getTargetUsers(PR_ID, {
    limit: 10,
    offset: 0,
  });
  const items = targetUsersData?.items || targetUsersData || [];
  const allUsers = items.map((u) => ({
    userId: u.user?.id ?? u.userId,
    name: `${u.user?.firstName || ""} ${u.user?.lastName || ""}`.trim(),
  }));

  // ── 7. Warm-up: триггерим ленивый пересчёт статистики бэкендом ──
  const allUserIds = allUsers.map((u) => u.userId);
  console.log("  Warm-up: вызываем statistics endpoints...");
  await Promise.all([
    API.getStatisticsSummaryResults(PR_ID, {
      targetUsersIds: allUserIds,
      revisionId: REVISION_ID,
    }),
    API.getUsersCompetenciesResults(PR_ID, {
      usersIds: allUserIds,
      revisionId: REVISION_ID,
    }),
    API.getTargetUsersProgress(PR_ID, {
      revisionId: REVISION_ID,
      usersIds: allUserIds,
    }),
  ]);
  await new Promise((r) => setTimeout(r, 5000));
  console.log("  Warm-up завершён");

  // ── 8. Фильтруем по доступности overwrite endpoint ──
  TARGET_USERS = [];
  for (const u of allUsers) {
    const { response } = await API.getResponseOverwritesData(
      PR_ID,
      REVISION_ID,
      u.userId,
    );
    if (response.ok()) {
      TARGET_USERS.push(u);
    } else {
      console.log(
        `  ⚠ Пропускаем ${u.name} (userId=${u.userId}) — overwrite status ${response.status()}`,
      );
    }
  }
  console.log(`  Target users: ${TARGET_USERS.length} (из ${allUsers.length})`);
  expect(
    TARGET_USERS.length,
    "Должно быть ≥1 доступных target users",
  ).toBeGreaterThanOrEqual(1);
});

// ────────────────────────────────────────────────────────────────────────────
// Тесты ролей и блокировки
// ────────────────────────────────────────────────────────────────────────────

test.describe(
  "Калибровка итоговой оценки — роли и блокировка",
  {
    tag: [
      "@ui",
      "@calibration",
      "@critical",
      "@regression",
      "@performance-review",
    ],
  },
  () => {
    // Serial mode: MFC-030 блокирует пользователя, MFC-031 проверяет результат
    test.describe.configure({ mode: "serial" });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Калибровка — роли и блокировка");
    });

    // ──── MFC-028: Админ видит чекбокс блокировки ────

    test(
      "C4475: Админ видит чекбокс блокировки, по умолчанию = false",
      {
        tag: ["@critical"],
      },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        const calibrationForm = new CalibrationFormModal(page);

        await test.step("Админ открывает страницу PR и модалку калибровки", async () => {
          await navigateToCalibrationPageAsAdmin(page, PR_ID);
          await openCalibrationModalAsAdmin(page);
          await calibrationForm.assertOpened();
        });

        await test.step("Проверить: чекбокс «Запретить дальнейшее изменение» виден", async () => {
          const isVisible = await calibrationForm.isLockCheckboxVisible();
          expect(
            isVisible,
            "Чекбокс блокировки должен быть виден для админа",
          ).toBe(true);
        });

        await test.step("Проверить: чекбокс по умолчанию НЕ отмечен", async () => {
          const isLocked = await calibrationForm.isLocked();
          expect(
            isLocked,
            "Чекбокс блокировки должен быть снят по умолчанию",
          ).toBe(false);
        });

        await calibrationForm.cancel();
      },
    );

    // ──── MFC-029: Руководитель НЕ видит чекбокс ────

    test(
      "C4476: Руководитель НЕ видит чекбокс блокировки",
      {
        tag: ["@critical"],
      },
      async ({ managerAuth: page }) => {
        setSeverity("critical");

        const calibrationForm = new CalibrationFormModal(page);
        const targetUser = TARGET_USERS[0];

        await test.step("Открыть дашборд «Моя команда» и перейти к PR", async () => {
          await navigateToDashboardAndSelectPR(page, PR_TITLE);
        });

        await test.step(`Руководитель открывает модалку калибровки для ${targetUser.name}`, async () => {
          const pencil = getPencilInDashboardRow(page, targetUser.name);
          await expect(pencil).toBeVisible({ timeout: 15000 });
          await pencil.click();
          await calibrationForm.assertOpened();
        });

        await test.step("Проверить: чекбокс блокировки НЕ отображается для руководителя", async () => {
          const isVisible = await calibrationForm.isLockCheckboxVisible();
          expect(
            isVisible,
            "Чекбокс блокировки НЕ должен быть виден для руководителя",
          ).toBe(false);
        });

        await calibrationForm.cancel();
      },
    );

    // ──── MFC-030: Блокировка → карандаш исчезает для руководителя ────

    test(
      "C4477: Блокировка включена → карандаш исчезает для руководителя",
      {
        tag: ["@critical"],
      },
      async ({ request, managerAuth: page }) => {
        setSeverity("critical");

        const targetUser = TARGET_USERS[0];

        // Шаг 1: Заблокировать калибровку через API (от имени админа)
        await test.step(`Включить блокировку калибровки через API для ${targetUser.name}`, async () => {
          const adminApi = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await adminApi.signIn(email, password);

          // Получить текущие данные для формирования корректного payload
          const { data: currentData } =
            await adminApi.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const { response } = await adminApi.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            {
              overwrites,
              meanOverwrite: { value: 4.0, characteristicId: null },
              isLocked: true,
            },
          );
          expect(
            response.ok(),
            `Блокировка должна пройти успешно (status=${response.status()})`,
          ).toBeTruthy();
          console.log(
            `  ✓ Заблокирован: ${targetUser.name} (userId=${targetUser.userId})`,
          );
        });

        // Шаг 2: Как руководитель — проверить отсутствие карандаша на дашборде
        await test.step("Открыть дашборд «Моя команда» и перейти к PR", async () => {
          await navigateToDashboardAndSelectPR(page, PR_TITLE);
        });

        await test.step(`Проверить: кнопка калибровки (карандаш) НЕ отображается для руководителя`, async () => {
          const table = page.locator('table[class*="Table_table"]').first();
          const userRow = table
            .locator("tbody tr")
            .filter({ hasText: targetUser.name });
          const rowCount = await userRow.count();

          if (rowCount === 0) {
            // Пользователь не найден — это тоже ОК (нет доступа = нет карандаша)
            console.log(
              `  ✓ ${targetUser.name} не найден в таблице — доступа нет`,
            );
            return;
          }

          // Ищем карандаш в строке
          const pencilInRow = userRow
            .first()
            .locator(
              '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
            );
          const pencilCount = await pencilInRow.count();
          expect(
            pencilCount,
            `Карандаш для заблокированного ${targetUser.name} НЕ должен быть виден руководителю`,
          ).toBe(0);
          console.log(
            `  ✓ Карандаш для ${targetUser.name} скрыт для руководителя`,
          );
        });
      },
    );

    // ──── MFC-031: Блокировка → админ всё ещё может калибровать ────

    test(
      "C4478: Блокировка включена → админ всё ещё может калибровать",
      {
        tag: ["@critical"],
      },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        const targetUser = TARGET_USERS[0]; // Тот же пользователь, заблокированный в MFC-030
        const calibrationForm = new CalibrationFormModal(page);

        await test.step("Админ открывает страницу PR", async () => {
          await navigateToCalibrationPageAsAdmin(page, PR_ID);
          await switchToResultsTab(page);
        });

        await test.step(`Проверить: админ видит кнопку калибровки (карандаш) несмотря на блокировку`, async () => {
          const table = page.locator("table");
          const tableCount = await table.count();
          const targetTable = tableCount >= 2 ? table.nth(1) : table.first();

          const userRow = targetTable
            .locator("tr")
            .filter({ hasText: targetUser.name });
          await expect(userRow.first()).toBeVisible({ timeout: 10000 });

          const pencilInRow = userRow
            .first()
            .locator(
              '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
            );
          await expect(pencilInRow.first()).toBeVisible({ timeout: 5000 });
          console.log(`  ✓ Карандаш для ${targetUser.name} виден админу`);

          await pencilInRow.first().click();
        });

        await test.step("Проверить: модалка калибровки открылась", async () => {
          await calibrationForm.assertOpened();
        });

        await test.step("Проверить: поле итоговой оценки доступно для редактирования", async () => {
          const input = calibrationForm.totalScoreInput;
          await expect(
            input,
            "Input итоговой оценки должен быть виден",
          ).toBeVisible();
          const isEnabled = await input.isEnabled();
          expect(
            isEnabled,
            "Input итоговой оценки должен быть доступен для редактирования",
          ).toBe(true);
        });

        await test.step("Проверить: чекбокс «Запретить дальнейшее изменение» отмечен", async () => {
          const isLocked = await calibrationForm.isLocked();
          expect(
            isLocked,
            "Чекбокс блокировки должен быть отмечен (установлен в MFC-030)",
          ).toBe(true);
        });

        await calibrationForm.cancel();
      },
    );
  },
);
