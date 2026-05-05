// @ts-check
/**
 * Калибровка итоговой оценки — информер (UI)
 *
 * Тестирует поведение информационного баннера при ручной калибровке итоговой оценки:
 * - MFC-016: Появление информера после изменения значения
 * - MFC-017: Корректный текст информера
 * - MFC-018: Скрытие информера после переоткрытия модалки
 *
 * Информер появляется СРАЗУ после изменения итоговой оценки (blur на input),
 * отображается НИЖЕ поля ввода итоговой оценки и ВЫШЕ списка компетенций.
 *
 * Текст информера: "Итоговая оценка изменена вручную. Оценки по компетенциям пересчитаны не будут."
 *
 * @tags @ui @calibration @critical @regression @performance-review
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

// ---------- Navigation Helper ----------

/**
 * Навигация на страницу PR с feature flag калибровки.
 * SSR workaround: сначала открываем без флага (прогрев), потом с флагом.
 */
async function navigateToCalibrationPage(page, prId) {
  const baseUrl = new URL(process.env.BASE_URL).origin;
  await page.goto(`${baseUrl}/ru/manager/performance-reviews/${prId}/`);
  await page.waitForLoadState("networkidle");
  await page.goto(buildPRUrl(prId, { statisticsSettings: true }));
  await page.waitForLoadState("networkidle");
}

/**
 * Открыть модалку калибровки (клик по карандашу)
 */
async function openCalibrationModal(page) {
  const resultsTab = page
    .locator('button[class*="Tabs_button"]')
    .filter({ hasText: /результаты/i });
  await resultsTab.click();
  await page.waitForLoadState("networkidle", { timeout: 3000 });

  const pencilIcon = page
    .locator(
      '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
    )
    .first();
  await pencilIcon.click();
  const modal = page.locator('[class*="react-modal-sheet-container"]').first();
  await modal.waitFor({ state: "visible", timeout: 3000 });
}

// ---------- Shared test data ----------

let PR_ID;
let REVISION_ID;
let TARGET_USER; // { userId, name }

test.beforeAll(async ({ request }) => {
  test.setTimeout(180000);

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

  // 2. Включить калибровку (числовой режим) + характеристики
  const api = new PerformanceReviewAPI(request);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
  const { data: settings } = await api.get(featureUrl);
  await api.post(featureUrl, {
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
  console.log("✅ Настройки калибровки включены (числовой режим)");

  // 3. Получить ревизию
  const { data: revision } = await api.getLastRevision(PR_ID);
  REVISION_ID = revision?.id;
  console.log(`  Revision: ${REVISION_ID}`);

  // 4. Получить target users
  const { data: targetUsersData } = await api.getTargetUsers(PR_ID, {
    limit: 10,
    offset: 0,
  });
  const items = targetUsersData?.items || targetUsersData || [];
  const allUsers = items.map((u) => ({
    userId: u.user?.id ?? u.userId,
    name: `${u.user?.firstName || ""} ${u.user?.lastName || ""}`.trim(),
  }));

  // 5. Warm-up: триггерим ленивый пересчёт статистики
  const allUserIds = allUsers.map((u) => u.userId);
  console.log("  Warm-up: вызываем statistics endpoints...");
  await Promise.all([
    api.getStatisticsSummaryResults(PR_ID, {
      targetUsersIds: allUserIds,
      revisionId: REVISION_ID,
    }),
    api.getUsersCompetenciesResults(PR_ID, {
      usersIds: allUserIds,
      revisionId: REVISION_ID,
    }),
    api.getTargetUsersProgress(PR_ID, {
      revisionId: REVISION_ID,
      usersIds: allUserIds,
    }),
  ]);
  await new Promise((r) => setTimeout(r, 5000));
  console.log("  Warm-up завершён");

  // 6. Фильтруем: оставляем только тех, для кого overwrite endpoint доступен (200)
  const accessibleUsers = [];
  for (const u of allUsers) {
    const { response } = await api.getResponseOverwritesData(
      PR_ID,
      REVISION_ID,
      u.userId,
    );
    if (response.ok()) {
      accessibleUsers.push(u);
    } else {
      console.log(
        `  ⚠ Пропускаем ${u.name} (userId=${u.userId}) — overwrite status ${response.status()}`,
      );
    }
  }
  expect(
    accessibleUsers.length,
    "Должен быть хотя бы 1 доступный target user",
  ).toBeGreaterThanOrEqual(1);

  TARGET_USER = accessibleUsers[0];
  console.log(
    `  Target user: ${TARGET_USER.name} (userId=${TARGET_USER.userId})`,
  );
});

// ==================== ИНФОРМЕР КАЛИБРОВКИ ИТОГОВОЙ ====================

test.describe(
  "Информер ручной калибровки итоговой оценки",
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
    // Serial mode: тесты делят состояние PR
    test.describe.configure({ mode: "serial" });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Информер ручной калибровки");
    });

    test(
      "C4469: Изменить значение итоговой оценки → информер появляется немедленно",
      {
        tag: ["@critical"],
      },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        const calibrationForm = new CalibrationFormModal(page, testInfo);

        await test.step("Открыть страницу результатов PR", async () => {
          await navigateToCalibrationPage(page, PR_ID);
        });

        await test.step("Открыть модалку калибровки (клик на карандаш)", async () => {
          await openCalibrationModal(page);
          await calibrationForm.assertOpened();
        });

        await test.step("Проверить: информер НЕ отображается при открытии модалки (до изменения)", async () => {
          const isVisible = await calibrationForm.isInfoBannerVisible();
          expect(
            isVisible,
            "Информер не должен быть виден при открытии модалки",
          ).toBe(false);
        });

        await test.step("Ввести новое значение итоговой оценки в числовое поле модалки", async () => {
          // Изменить значение (fill + Tab → blur → триггер информера)
          await calibrationForm.setTotalScore(4.2);
        });

        await test.step("Проверить: информер об изменении итоговой оценки появился", async () => {
          const isVisible = await calibrationForm.isInfoBannerVisible();
          expect(
            isVisible,
            "Информер должен появиться после изменения итоговой оценки",
          ).toBe(true);
        });
      },
    );

    test(
      "C4470: Текст информера соответствует спецификации",
      {
        tag: ["@critical"],
      },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        const calibrationForm = new CalibrationFormModal(page, testInfo);

        await test.step("Открыть модалку калибровки", async () => {
          await navigateToCalibrationPage(page, PR_ID);
          await openCalibrationModal(page);
          await calibrationForm.assertOpened();
        });

        await test.step("Ввести новое значение итоговой оценки в числовое поле модалки", async () => {
          await calibrationForm.setTotalScore(3.7);
        });

        await test.step("Проверить текст информера: «Итоговая оценка изменена вручную. Оценки по компетенциям пересчитаны не будут»", async () => {
          const isVisible = await calibrationForm.isInfoBannerVisible();
          expect(isVisible, "Информер должен быть виден").toBe(true);

          const text = await calibrationForm.getInfoBannerText();
          expect(text, "Информер должен содержать текст").toBeTruthy();

          // Проверяем наличие обеих частей текста
          expect(
            text,
            'Информер должен содержать текст "Итоговая оценка изменена вручную"',
          ).toContain("Итоговая оценка изменена вручную");

          expect(
            text,
            'Информер должен содержать текст "Оценки по компетенциям пересчитаны не будут"',
          ).toContain("Оценки по компетенциям пересчитаны не будут");

          console.log(`Полный текст информера: "${text}"`);
        });
      },
    );

    test(
      "C4471: Закрыть модалку → переоткрыть → информер НЕ виден",
      {
        tag: ["@critical"],
      },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        const calibrationForm = new CalibrationFormModal(page, testInfo);

        await test.step("Открыть модалку калибровки", async () => {
          await navigateToCalibrationPage(page, PR_ID);
          await openCalibrationModal(page);
          await calibrationForm.assertOpened();
        });

        await test.step("Ввести новое значение итоговой оценки в числовое поле модалки", async () => {
          await calibrationForm.setTotalScore(4.5);
        });

        await test.step("Проверить: информер об изменении итоговой оценки появился", async () => {
          const isVisible = await calibrationForm.isInfoBannerVisible();
          expect(isVisible, "Информер должен быть виден после изменения").toBe(
            true,
          );
        });

        await test.step("Сохранить калибровку в модалке", async () => {
          await calibrationForm.save();
          await page.waitForLoadState("networkidle", { timeout: 2000 });
        });

        await test.step("Переоткрыть модалку калибровки (карандаш)", async () => {
          await openCalibrationModal(page);
          await calibrationForm.assertOpened();
        });

        await test.step("Проверить: информер НЕ отображается при повторном открытии после сохранения", async () => {
          // Даже если итоговая оценка откалиброванная, информер не должен появляться
          // при открытии модалки — только после изменения значения в текущей сессии
          const isVisible = await calibrationForm.isInfoBannerVisible();
          expect(
            isVisible,
            "Информер не должен быть виден при повторном открытии модалки (после сохранения)",
          ).toBe(false);
        });

        await test.step("Изменить значение → информер появляется снова", async () => {
          // Изменить значение ещё раз
          await calibrationForm.setTotalScore(3.9);

          // Информер должен появиться
          const isVisible = await calibrationForm.isInfoBannerVisible();
          expect(
            isVisible,
            "Информер должен появиться снова при новом изменении",
          ).toBe(true);
        });
      },
    );
  },
);

// ==================== ИНФОРМЕР — РАСШИРЕННЫЕ СЦЕНАРИИ ====================

test.describe(
  "Информер — расширенные сценарии",
  {
    tag: ["@ui", "@calibration", "@regression", "@performance-review"],
  },
  () => {
    test.describe.configure({ mode: "serial" });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Информер — расширенные сценарии");
    });

    test(
      "C4472: Информер появляется и при числовом вводе, и при выборе из дропдауна",
      {
        tag: ["@regression"],
      },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");

        const calibrationForm = new CalibrationFormModal(page, testInfo);

        await test.step("Включить дропдаун режим (enableOnlyCustomCharacteristics)", async () => {
          const api = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
          const { data: settings } = await api.get(featureUrl);
          await api.post(featureUrl, {
            ...settings,
            settings: {
              ...(settings?.settings || {}),
              useOnlyHeadReceiver: true,
              enableResponsesOverwriting: true,
              enableCustomCharacteristics: true,
              enableOnlyCustomCharacteristics: true,
              enableCompetenceWeights: true,
            },
            // ВСЕГДА используем чистые характеристики — существующие могут содержать мусор
            characteristicSettings: [
              { threshold: 33, title: "Низко", category: "negative" },
              { threshold: 66, title: "Средне", category: "neutral" },
              { threshold: 100, title: "Высоко", category: "positive" },
            ],
          });
          console.log("✅ Включен режим дропдауна характеристик");
        });

        await test.step("Открыть страницу результатов PR", async () => {
          await navigateToCalibrationPage(page, PR_ID);
        });

        await test.step("Открыть модалку калибровки", async () => {
          await openCalibrationModal(page);
          await calibrationForm.assertOpened();
        });

        await test.step("Проверить: информер скрыт при первом открытии модалки", async () => {
          const isVisible = await calibrationForm.isInfoBannerVisible();
          expect(isVisible, "Информер не должен быть виден при открытии").toBe(
            false,
          );
        });

        await test.step("Проверить, что активен дропдаун режим", async () => {
          const isDropdownMode =
            await calibrationForm.isTotalScoreDropdownMode();
          expect(isDropdownMode, "Должен быть активен дропдаун режим").toBe(
            true,
          );
        });

        await test.step("Выбрать характеристику из выпадающего списка в модалке", async () => {
          await calibrationForm.selectTotalCharacteristic("Средне");
        });

        await test.step("Проверить: информер об изменении итоговой оценки появился", async () => {
          const isVisible = await calibrationForm.isInfoBannerVisible();
          expect(
            isVisible,
            "Информер должен появиться после выбора характеристики из дропдауна",
          ).toBe(true);
        });

        // Вернуть числовой режим для следующих тестов
        await test.step("Вернуть числовой режим (cleanup)", async () => {
          // Закрыть модалку без сохранения
          await calibrationForm.cancel().catch(() => {
            // Если cancel не работает — закрыть через Escape
            return page.keyboard.press("Escape");
          });

          const api = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
          const { data: settings } = await api.get(featureUrl);
          await api.post(featureUrl, {
            ...settings,
            settings: {
              ...(settings?.settings || {}),
              enableOnlyCustomCharacteristics: false,
            },
          });
          console.log("✅ Числовой режим возвращён");
        });
      },
    );

    test(
      "C4473: Изменить итоговую (информер) → изменить компетенцию → информер исчезает",
      {
        tag: ["@regression"],
      },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const calibrationForm = new CalibrationFormModal(page, testInfo);

        await test.step("Открыть страницу результатов PR", async () => {
          await navigateToCalibrationPage(page, PR_ID);
        });

        await test.step("Открыть модалку калибровки", async () => {
          await openCalibrationModal(page);
          await calibrationForm.assertOpened();
        });

        await test.step("Ввести новое значение итоговой оценки в числовое поле модалки", async () => {
          await calibrationForm.setTotalScore(4.8);
        });

        await test.step("Проверить: информер об изменении итоговой оценки появился", async () => {
          const isVisible = await calibrationForm.isInfoBannerVisible();
          expect(
            isVisible,
            "Информер должен появиться после изменения итоговой",
          ).toBe(true);
        });

        await test.step("Изменить оценку первой компетенции в модалке", async () => {
          // Важно: значение ДОЛЖНО отличаться от текущего, иначе fill() не триггерит change event.
          // Используем 1 — минимум шкалы, гарантированно отличается от seed-ответов (обычно 3-5).
          await calibrationForm.setCompetencyScore(0, 1);
        });

        await test.step("Проверить: информер исчез после изменения компетенции", async () => {
          // Ждём исчезновения информера (recalc итоговой → manual override сброшен)
          await calibrationForm.infoBanner
            .waitFor({ state: "hidden", timeout: 5000 });

          const isVisible = await calibrationForm.isInfoBannerVisible();
          expect(
            isVisible,
            "Информер должен исчезнуть после изменения компетенции (manual calibration сброшен)",
          ).toBe(false);
        });
      },
    );

    test(
      "C4474: При изменении компетенции (без ручной правки итога) → информер НЕ появляется",
      {
        tag: ["@regression"],
      },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const calibrationForm = new CalibrationFormModal(page, testInfo);

        await test.step("Открыть страницу результатов PR", async () => {
          await navigateToCalibrationPage(page, PR_ID);
        });

        await test.step("Открыть модалку калибровки", async () => {
          await openCalibrationModal(page);
          await calibrationForm.assertOpened();
        });

        await test.step("Проверить: информер скрыт при первом открытии модалки", async () => {
          const isVisible = await calibrationForm.isInfoBannerVisible();
          expect(isVisible, "Информер не должен быть виден при открытии").toBe(
            false,
          );
        });

        await test.step("Изменить оценку компетенции в модалке (без изменения итоговой)", async () => {
          // Значение ДОЛЖНО отличаться от текущего (см. MFC-020 — fill() не триггерит change при том же значении)
          await calibrationForm.setCompetencyScore(0, 1);
        });

        await test.step("Проверить: информер НЕ появился (изменена только компетенция)", async () => {
          // Информер НЕ должен появиться (не было ручной правки итоговой)
          const isVisible = await calibrationForm.isInfoBannerVisible();
          expect(
            isVisible,
            "Информер НЕ должен появляться при изменении только компетенции",
          ).toBe(false);
        });
      },
    );
  },
);
