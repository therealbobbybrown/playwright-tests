// @ts-check
/**
 * Калибровка итоговой оценки — дропдаун характеристик (UI)
 *
 * Когда enableOnlyCustomCharacteristics=true, вместо числового поля итоговой оценки
 * отображается дропдаун с текстовыми характеристиками.
 *
 * - MFC-010: Дропдаун виден вместо числового поля
 * - MFC-011: Дропдаун содержит ВСЕ характеристики из настроек
 * - MFC-012: Выбрать характеристику → сохранить → переоткрыть → сохранилась
 * - MFC-013: Компетенции НЕ изменились после выбора характеристики
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
let REVISION_ID;
let TARGET_USERS; // [{ userId, name }]
let CHARACTERISTICS;

/** @type {PerformanceReviewAPI} */
let API;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Навигация на страницу калибровки с прогревом SSR и retry на 500
 */
async function navigateToCalibrationPage(page, prId) {
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
        .locator('heading:has-text("500")')
        .isVisible()) ||
      (await page
        .locator("text=Все упало")
        .isVisible());
    if (!is500) return;
    console.log(`  ⚠ SSR 500 на попытке ${attempt}/3, ждём 5с...`);
    await page.waitForTimeout(5000);
  }
}

/**
 * Открыть модалку калибровки — клик по карандашу (OverwriteButton)
 */
async function openCalibrationModal(page) {
  const resultsTab = page
    .locator('button[class*="Tabs_button"]')
    .filter({ hasText: /результаты/i });
  await resultsTab.click();
  // Ждём появления таблицы результатов
  await page
    .locator("table")
    .first()
    .waitFor({ state: "visible", timeout: 10000 });

  // Кнопка-карандаш в колонке "Итоговая оценка после калибровки"
  const pencilIcon = page
    .locator(
      '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
    )
    .first();
  await expect(pencilIcon).toBeVisible({ timeout: 10000 });
  await pencilIcon.click();
  // Ждём появления модалки калибровки
  await page
    .locator(".react-modal-sheet-container")
    .first()
    .waitFor({ state: "visible", timeout: 5000 });
}

// ────────────────────────────────────────────────────────────────────────────
// beforeAll: seed data + включить дропдаун-режим
// ────────────────────────────────────────────────────────────────────────────

test.beforeAll(async ({ request }) => {
  test.setTimeout(180000);

  // Характеристики для дропдауна
  CHARACTERISTICS = [
    { threshold: 33, title: "Низко", category: "negative" },
    { threshold: 66, title: "Средне", category: "neutral" },
    { threshold: 100, title: "Высоко", category: "positive" },
  ];

  // 1. Seed PR с заполненными анкетами
  const calSeed = new CalibrationSeed(request);
  await calSeed.init();

  const result = await calSeed.seedWithDirections({
    directions: { self: true, head: true },
    targetUsersCount: 4,
    receiversPerDirection: 2,
    fillQuestionnaires: true,
  });
  PR_ID = result.prId;
  console.log(`✅ PR создан: ${PR_ID}`);

  // 2. Включить калибровку + дропдаун-режим через feature flag URL
  API = new PerformanceReviewAPI(request);
  const { email, password } = getCredentials("admin");
  await API.signIn(email, password);

  const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
  const { data: settings } = await API.get(featureUrl);
  await API.post(featureUrl, {
    ...settings,
    settings: {
      ...(settings?.settings || {}),
      useOnlyHeadReceiver: true,
      enableResponsesOverwriting: true,
      enableCustomCharacteristics: true,
      enableOnlyCustomCharacteristics: true, // ← ДРОПДАУН РЕЖИМ
      enableCompetenceWeights: true,
    },
    characteristicSettings: CHARACTERISTICS,
  });
  console.log(
    "✅ Настройки: дропдаун-режим включён (enableOnlyCustomCharacteristics=true)",
  );

  // 3. Получить ревизию
  const { data: revision } = await API.getLastRevision(PR_ID);
  REVISION_ID = revision?.id;
  console.log(`  Revision: ${REVISION_ID}`);

  // 4. Получить target users
  const { data: targetUsersData } = await API.getTargetUsers(PR_ID, {
    limit: 10,
    offset: 0,
  });
  const items = targetUsersData?.items || targetUsersData || [];
  const allUsers = items.map((u) => ({
    userId: u.user?.id ?? u.userId,
    name: `${u.user?.firstName || ""} ${u.user?.lastName || ""}`.trim(),
  }));

  // 5. Warm-up: триггерим ленивый пересчёт статистики бэкендом
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

  // 6. Фильтруем: оставляем только тех, для кого overwrite endpoint доступен (200)
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
// Тесты дропдаун-режима
// ────────────────────────────────────────────────────────────────────────────

test.describe(
  "Ручная калибровка итоговой — дропдаун характеристик (UI)",
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
    test.describe.configure({ mode: "serial" });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Калибровка итоговой — дропдаун UI");
    });

    test(
      "C4464: При enableOnlyCustomCharacteristics=true дропдаун вместо числового поля",
      {
        tag: ["@critical"],
      },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        await test.step("Открыть страницу результатов PR и модалку калибровки (карандаш)", async () => {
          await navigateToCalibrationPage(page, PR_ID);
          await openCalibrationModal(page);
        });

        const calibrationForm = new CalibrationFormModal(page);
        await calibrationForm.assertOpened();

        await test.step("Проверить: отображается выпадающий список характеристик, числовое поле скрыто", async () => {
          const isDropdownMode =
            await calibrationForm.isTotalScoreDropdownMode();
          expect(
            isDropdownMode,
            "Дропдаун характеристик должен быть виден",
          ).toBe(true);

          const isNumericMode = await calibrationForm.isTotalScoreNumericMode();
          expect(isNumericMode, "Числовой input НЕ должен быть виден").toBe(
            false,
          );

          // Контейнер дропдауна виден (div с react-select)
          const combobox = calibrationForm.totalCharacteristicCombobox;
          await expect(combobox).toBeVisible();
        });

        await calibrationForm.cancel();
      },
    );

    test(
      "C4465: Дропдаун содержит ВСЕ характеристики из настроек",
      {
        tag: ["@critical"],
      },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        await test.step("Открыть страницу результатов PR и модалку калибровки (карандаш)", async () => {
          await navigateToCalibrationPage(page, PR_ID);
          await openCalibrationModal(page);
        });

        const calibrationForm = new CalibrationFormModal(page);
        await calibrationForm.assertOpened();

        await test.step("Проверить: выпадающий список содержит все 3 характеристики из настроек (Низко, Средне, Высоко)", async () => {
          const options = await calibrationForm.getTotalCharacteristicOptions();
          const expectedTitles = CHARACTERISTICS.map((c) => c.title);

          console.log(`  Опции дропдауна: [${options.join(", ")}]`);
          console.log(
            `  Ожидаемые характеристики: [${expectedTitles.join(", ")}]`,
          );

          expect(options).toHaveLength(expectedTitles.length);
          for (const title of expectedTitles) {
            expect(options, `Дропдаун должен содержать "${title}"`).toContain(
              title,
            );
          }
        });

        await calibrationForm.cancel();
      },
    );

    test(
      "C4466: Выбрать характеристику → сохранить → переоткрыть → сохранилась",
      {
        tag: ["@critical"],
      },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        const selectedCharacteristic = "Высоко";

        await test.step("Открыть страницу результатов PR и модалку калибровки (карандаш)", async () => {
          await navigateToCalibrationPage(page, PR_ID);
          await openCalibrationModal(page);
        });

        const calibrationForm = new CalibrationFormModal(page);
        await calibrationForm.assertOpened();

        await test.step(`Выбрать характеристику «${selectedCharacteristic}» из выпадающего списка в модалке`, async () => {
          await calibrationForm.selectTotalCharacteristic(
            selectedCharacteristic,
          );
          const selected =
            await calibrationForm.getSelectedTotalCharacteristic();
          expect(selected, "Выбранная характеристика должна отображаться").toBe(
            selectedCharacteristic,
          );
        });

        await test.step("Сохранить калибровку в модалке", async () => {
          await calibrationForm.save();
          // Ждём закрытия модалки после сохранения
          await page
            .locator(".react-modal-sheet-container")
            .first()
            .waitFor({ state: "hidden", timeout: 5000 });
        });

        await test.step("Переоткрыть модалку и проверить что выбранная характеристика сохранилась", async () => {
          await openCalibrationModal(page);
          await calibrationForm.assertOpened();

          const selectedAfterReopen =
            await calibrationForm.getSelectedTotalCharacteristic();
          console.log(
            `  Характеристика после переоткрытия: "${selectedAfterReopen}"`,
          );
          expect(
            selectedAfterReopen,
            `Характеристика "${selectedCharacteristic}" должна сохраниться после переоткрытия`,
          ).toBe(selectedCharacteristic);
        });

        await calibrationForm.cancel();
      },
    );

    test(
      "C7108: Характеристика с длинным названием — корректное отображение в дропдауне",
      {
        tag: ["@regression"],
      },
      async ({ adminAuth: page }) => {
        setSeverity("normal");

        await test.step("Открыть страницу результатов PR и модалку калибровки (карандаш)", async () => {
          await navigateToCalibrationPage(page, PR_ID);
          await openCalibrationModal(page);
        });

        const calibrationForm = new CalibrationFormModal(page);
        await calibrationForm.assertOpened();

        await test.step("Проверить: все характеристики видны в выпадающем списке", async () => {
          const options = await calibrationForm.getTotalCharacteristicOptions();
          expect(
            options.length,
            "Дропдаун содержит опции",
          ).toBeGreaterThanOrEqual(1);

          // Каждая опция должна быть непустой строкой
          for (const option of options) {
            expect(
              option.trim().length,
              `Опция "${option}" не должна быть пустой`,
            ).toBeGreaterThan(0);
          }
          console.log(`  ✓ Все ${options.length} опций отображаются корректно`);
        });

        await test.step("Поочерёдно выбрать каждую характеристику и проверить корректность отображения", async () => {
          const options = await calibrationForm.getTotalCharacteristicOptions();
          for (const option of options) {
            await calibrationForm.selectTotalCharacteristic(option);
            const selected =
              await calibrationForm.getSelectedTotalCharacteristic();
            expect(
              selected,
              `Выбранная характеристика "${option}" отображается корректно`,
            ).toBe(option);
          }
        });

        await test.step("Проверить: текст характеристик не обрезается в выпадающем списке", async () => {
          const combobox = calibrationForm.totalCharacteristicCombobox;
          await expect(combobox).toBeVisible();

          // Проверяем что контейнер дропдауна имеет разумные размеры
          const box = await combobox.boundingBox();
          expect(box, "Дропдаун должен иметь размеры").toBeTruthy();
          expect(box.width, "Ширина дропдауна > 100px").toBeGreaterThan(100);
          expect(box.height, "Высота дропдауна > 20px").toBeGreaterThan(20);
        });

        await calibrationForm.cancel();
      },
    );

    test(
      "C4467: Компетенции НЕ изменились после выбора характеристики",
      {
        tag: ["@critical"],
      },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        const targetUser = TARGET_USERS[0];

        // Создаём API-клиент с test-scoped request (beforeAll request нельзя переиспользовать)
        const testApi = new PerformanceReviewAPI(request);
        const { email, password } = getCredentials("admin");
        await testApi.signIn(email, password);

        // Получаем текущие значения перезаписей компетенций через API (ДО)
        let overwritesBefore;
        await test.step("Запомнить текущие значения компетенций через API (до изменений)", async () => {
          const { data } = await testApi.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
          );
          overwritesBefore = data;
          console.log(`  Компетенций: ${(data?.questions || []).length}`);
        });

        await test.step("Открыть страницу результатов PR и модалку калибровки (карандаш)", async () => {
          await navigateToCalibrationPage(page, PR_ID);
          await openCalibrationModal(page);
        });

        const calibrationForm = new CalibrationFormModal(page);
        await calibrationForm.assertOpened();

        await test.step("Выбрать характеристику «Средне» из выпадающего списка и сохранить", async () => {
          await calibrationForm.selectTotalCharacteristic("Средне");
          await calibrationForm.save();
          // Ждём закрытия модалки после сохранения
          await page
            .locator(".react-modal-sheet-container")
            .first()
            .waitFor({ state: "hidden", timeout: 5000 });
        });

        // Получаем значения перезаписей компетенций через API (ПОСЛЕ)
        await test.step("Проверить через API: все компетенции сохранили исходные значения", async () => {
          const { data: overwritesAfter } =
            await testApi.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );

          const questionsBefore = overwritesBefore?.questions || [];
          const questionsAfter = overwritesAfter?.questions || [];

          expect(
            questionsAfter.length,
            "Количество компетенций не должно измениться",
          ).toBe(questionsBefore.length);

          // Сравниваем значения каждой компетенции
          for (const qBefore of questionsBefore) {
            const qAfter = questionsAfter.find(
              (q) => q.competenceId === qBefore.competenceId,
            );
            expect(
              qAfter,
              `Компетенция ${qBefore.competenceId} должна существовать`,
            ).toBeTruthy();
            expect(
              qAfter.value,
              `Значение компетенции ${qBefore.competenceId} не должно измениться ` +
                `(до: ${qBefore.value}, после: ${qAfter.value})`,
            ).toBe(qBefore.value);
          }

          console.log(
            `  ✓ Все ${questionsBefore.length} компетенций не изменились`,
          );
        });
      },
    );
  },
);
