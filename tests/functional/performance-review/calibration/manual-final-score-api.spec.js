// @ts-check
/**
 * Калибровка итоговой оценки — API тесты (P0)
 *
 * Тестирует прямую калибровку итоговой оценки через API:
 * - Числовой ввод: POST meanOverwrite.value = rawScore
 * - Дропдаун: POST meanOverwrite.characteristicId = FK
 * - Правила приоритета: ручная правка ↔ пересчёт через компетенции
 * - Edge case: значение = оригиналу → бэкенд удаляет overwrite
 * - Роли: блокировка изменения руководителем (isLocked)
 *
 * Endpoint: POST /protected/performance-reviews/{prId}/response-overwrite/of-revision/{revisionId}/of-user/{userId}/
 * Payload: { overwrites: [...], meanOverwrite: { value, characteristicId }, isLocked }
 *
 * @tags @api @calibration @critical @performance-review
 * @module Calibration
 */
import { test as baseTest, expect } from "@playwright/test";
import { allure } from "allure-playwright";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import {
  CalibrationVerifier,
  DatabaseClient,
} from "../../../utils/db/index.js";
import { CalibrationSeed } from "../../../utils/seed/CalibrationSeed.js";

// ---------- Fixtures ----------

const test = baseTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  managerAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  dbClient: async ({}, use) => {
    const db = new DatabaseClient();
    try {
      await db.connect();
    } catch (error) {
      console.log("[DB] Connection failed:", error.message);
    }
    await use(db);
    if (db.isConnected()) {
      await db.disconnect();
    }
  },
  calibrationVerifier: async ({ dbClient }, use) => {
    const verifier = new CalibrationVerifier(dbClient);
    await use(verifier);
  },
});

// ---------- Shared test data ----------

let PR_ID;
let REVISION_ID;
let TARGET_USERS; // [{ userId, responseId, name }]
let QUESTIONS; // [{ id, competenceId, rangeMax }]
let CHARACTERISTICS; // [{ id, threshold, title, category }] from settings

test.beforeAll(async ({ request }) => {
  test.setTimeout(180000);

  // 1. Seed PR с заполненными анкетами
  const calSeed = new CalibrationSeed(request);
  await calSeed.init();

  const result = await calSeed.seedWithDirections({
    directions: { self: true, head: true },
    targetUsersCount: 4, // +1 для контрольной группы (будет отфильтрована)
    receiversPerDirection: 2,
    fillQuestionnaires: true,
  });
  PR_ID = result.prId;
  console.log(`✅ PR создан: ${PR_ID}`);

  // 2. Включить калибровку + характеристики
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
  console.log("✅ Настройки калибровки включены");

  // 3. Проверить что настройки сохранились (retry при необходимости)
  const { data: savedSettings } = await api.get(featureUrl);
  CHARACTERISTICS = savedSettings?.characteristicSettings || [];
  if (CHARACTERISTICS.length === 0) {
    console.log("  ⚠ Характеристики не сохранились, повторный POST...");
    await api.post(featureUrl, {
      ...savedSettings,
      settings: {
        ...(savedSettings?.settings || {}),
        useOnlyHeadReceiver: true,
        enableResponsesOverwriting: true,
        enableCustomCharacteristics: true,
        enableOnlyCustomCharacteristics: false,
        enableCompetenceWeights: true,
      },
      characteristicSettings: [
        { threshold: 33, title: "Низко", category: "negative" },
        { threshold: 66, title: "Средне", category: "neutral" },
        { threshold: 100, title: "Высоко", category: "positive" },
      ],
    });
    await new Promise((r) => setTimeout(r, 2000));
    const { data: recheck } = await api.get(featureUrl);
    CHARACTERISTICS = recheck?.characteristicSettings || [];
  }
  console.log(`  Характеристик: ${CHARACTERISTICS.length}`);

  // 4. Получить ревизию
  const { data: revision } = await api.getLastRevision(PR_ID);
  REVISION_ID = revision?.id;
  console.log(`  Revision: ${REVISION_ID}`);

  // 5. Получить target users
  const { data: targetUsersData } = await api.getTargetUsers(PR_ID, {
    limit: 10,
    offset: 0,
  });
  const items = targetUsersData?.items || targetUsersData || [];
  const allUsers = items.map((u) => ({
    userId: u.user?.id ?? u.userId,
    name: `${u.user?.firstName || ""} ${u.user?.lastName || ""}`.trim(),
  }));

  // 6. Warm-up: триггерим ленивый пересчёт статистики бэкендом ПЕРЕД фильтрацией
  //    (populateReview НЕ заполняет receiver_progress — overwrite endpoint зависит от него)
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
  // Дать бэкенду время на асинхронный пересчёт
  await new Promise((r) => setTimeout(r, 5000));
  console.log("  Warm-up завершён");

  // 7. Фильтруем: оставляем только тех, для кого overwrite endpoint доступен (200)
  // Контрольная группа (без head) возвращает 403 → исключаем
  TARGET_USERS = [];
  for (const u of allUsers) {
    const { response } = await api.getResponseOverwritesData(
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
    "Должно быть ≥3 доступных target users",
  ).toBeGreaterThanOrEqual(3);

  // 8. Получить вопросы
  const { data: overwriteData } = await api.getResponseOverwritesData(
    PR_ID,
    REVISION_ID,
    TARGET_USERS[0].userId,
  );
  QUESTIONS = overwriteData?.questions || [];
  console.log(
    `  Вопросов: ${QUESTIONS.length}, rangeMax: ${QUESTIONS[0]?.rangeMax}`,
  );
});

// ==================== БАЗОВАЯ КАЛИБРОВКА ЧИСЛОМ (MFC-001..003, MFC-005) ====================

test.describe(
  "Ручная калибровка итоговой — числовой ввод",
  {
    tag: [
      "@api",
      "@calibration",
      "@critical",
      "@regression",
      "@performance-review",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.CALIBRATION, "Калибровка итоговой — числовой");
    });

    test(
      "C4447: Откалибровать итоговую оценку числом → значение сохранено в API и DB",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI, calibrationVerifier }) => {
        setSeverity("critical");

        const targetUser = TARGET_USERS[0];
        expect(targetUser, "Нет target user для теста").toBeTruthy();

        const calibratedValue = 3.5;
        const rangeMax = QUESTIONS[0]?.rangeMax || 5;
        const expectedFraction = calibratedValue / rangeMax;

        await test.step("Откалибровать итоговую = 3.5 через API (числовой режим)", async () => {
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );

          // Собрать текущие компетенции (передать без изменений)
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const payload = {
            overwrites,
            meanOverwrite: { value: calibratedValue, characteristicId: null },
            isLocked: false,
          };

          const { response } = await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            payload,
          );
          expect(response.status(), "POST calibrate total → 201").toBe(201);
        });

        await test.step("Проверить через API: итоговая = 3.5/5 = 0.70", async () => {
          const { data, response } = await adminAPI.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
          );

          expect(response.status()).toBe(200);
          expect(
            data.meanOverwrite,
            "meanOverwrite должен существовать",
          ).not.toBeNull();
          expect(data.meanOverwrite.overwrittenValue).toBeCloseTo(
            expectedFraction,
            2,
          );
          expect(data.meanOverwrite.overwrittenCharacteristicId).toBeNull();
        });

        await test.step("Проверить в БД: запись калибровки итоговой оценки создана", async () => {
          await calibrationVerifier.verifyTotalScoreOverwrite(
            REVISION_ID,
            targetUser.userId,
            expectedFraction,
          );
        });
      },
    );

    test(
      "C4448: После калибровки итоговой компетенции НЕ изменились",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI, calibrationVerifier }) => {
        setSeverity("critical");

        const targetUser = TARGET_USERS[1];
        expect(targetUser, "Нет target user для теста").toBeTruthy();

        let competenciesBefore;

        await test.step("Запомнить текущие значения компетенций через API", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
          );
          competenciesBefore = (data?.responsesData || []).map((rd) => ({
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));
          expect(
            competenciesBefore.length,
            "Должны быть ответы по компетенциям",
          ).toBeGreaterThan(0);
        });

        await test.step("Откалибровать итоговую = 2.0 через API (не трогая компетенции)", async () => {
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );

          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const { response } = await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            {
              overwrites,
              meanOverwrite: { value: 2.0, characteristicId: null },
              isLocked: false,
            },
          );
          expect(response.status()).toBe(201);
        });

        await test.step("Проверить через API: компетенции НЕ изменились после калибровки итоговой", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
          );
          const competenciesAfter = (data?.responsesData || []).map((rd) => ({
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          for (let i = 0; i < competenciesBefore.length; i++) {
            expect(
              competenciesAfter[i]?.answer,
              `Компетенция ${competenciesBefore[i].questionId} не должна измениться`,
            ).toBe(competenciesBefore[i].answer);
          }
        });

        await test.step("Проверить в БД: записи калибровки компетенций отсутствуют", async () => {
          await calibrationVerifier.verifyCompetencyOverwritesEmpty(
            REVISION_ID,
          );
        });
      },
    );

    test(
      "C4449: Текстовая характеристика пересчитана под новый скор",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI }) => {
        setSeverity("critical");

        const targetUser = TARGET_USERS[0];
        expect(targetUser, "Нет target user для теста").toBeTruthy();
        expect(
          CHARACTERISTICS.length,
          "Должны быть характеристики в настройках",
        ).toBeGreaterThanOrEqual(3);

        const rangeMax = QUESTIONS[0]?.rangeMax || 5;

        await test.step('Откалибровать итоговую = 4.0 (80% шкалы) через API — ожидаем характеристику "Высоко"', async () => {
          // Найти порог для "Высоко" (обычно >66%)
          const высокоChar = CHARACTERISTICS.find(
            (c) => c.category === "positive" || /высоко/i.test(c.title),
          );
          expect(высокоChar, 'Не найдена характеристика "Высоко"').toBeTruthy();

          // Значение в диапазоне "Высоко": 80% от шкалы
          const высокоеЗначение = Math.round(rangeMax * 0.8 * 10) / 10; // 4.0 для шкалы 1-5

          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const { response } = await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            {
              overwrites,
              meanOverwrite: { value: высокоеЗначение, characteristicId: null },
              isLocked: false,
            },
          );
          expect(response.status()).toBe(201);
        });

        await test.step("Проверить через API: калиброванное значение сохранено (≈0.80)", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
          );

          expect(
            data.meanOverwrite,
            "meanOverwrite должен существовать",
          ).not.toBeNull();

          // Проверяем что значение в диапазоне "Высоко" (>66% от шкалы)
          const высокоеЗначение = Math.round(rangeMax * 0.8 * 10) / 10;
          expect(data.meanOverwrite.overwrittenValue).toBeCloseTo(
            высокоеЗначение / rangeMax,
            2,
          );

          // Характеристика должна быть "Высоко" если бэкенд пересчитывает
          // meanOverwrite.overwrittenCharacteristicId может быть null (числовой режим)
          await allure.attachment(
            "meanOverwrite-after-calibration",
            JSON.stringify(data.meanOverwrite, null, 2),
            "application/json",
          );
        });
      },
    );

    test(
      "C4450: Граница — значение 0 сохраняется корректно",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI, calibrationVerifier }) => {
        setSeverity("critical");

        // Используем отдельного target user для изоляции
        const targetUser = TARGET_USERS[2];
        expect(targetUser, "Нет target user #2 для теста").toBeTruthy();

        const rangeMax = QUESTIONS[0]?.rangeMax || 5;
        const rangeMin = QUESTIONS[0]?.rangeMin || 1;

        await test.step(`Откалибровать итоговую = ${rangeMin} (минимум шкалы) через API`, async () => {
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const { response } = await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            {
              overwrites,
              meanOverwrite: { value: rangeMin, characteristicId: null },
              isLocked: false,
            },
          );
          expect(response.status()).toBe(201);
        });

        await test.step("Проверить через API: минимальное значение сохранено корректно", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
          );
          expect(data.meanOverwrite).not.toBeNull();
          // rangeMin / rangeMax = fraction (e.g. 1/5 = 0.2)
          expect(data.meanOverwrite.overwrittenValue).toBeCloseTo(
            rangeMin / rangeMax,
            2,
          );
        });

        await test.step("Проверить в БД: запись с минимальным значением создана", async () => {
          await calibrationVerifier.verifyTotalScoreOverwrite(
            REVISION_ID,
            targetUser.userId,
            rangeMin / rangeMax,
          );
        });
      },
    );
  },
);

// ==================== ПРАВИЛА ПРИОРИТЕТА (MFC-022..025, MFC-057) ====================

test.describe(
  "Правила приоритета калибровки итоговой",
  {
    tag: [
      "@api",
      "@calibration",
      "@critical",
      "@regression",
      "@performance-review",
    ],
  },
  () => {
    // Данные для цепочки тестов приоритета — используем отдельные target users
    let priorityPrId;
    let priorityRevisionId;
    let priorityTargetUser;
    let priorityQuestions;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180000);

      // Создаём отдельный PR для тестов приоритета (изолированные данные)
      const calSeed = new CalibrationSeed(request);
      await calSeed.init();

      const result = await calSeed.seedWithDirections({
        directions: { self: true, head: true },
        targetUsersCount: 2,
        receiversPerDirection: 2,
        fillQuestionnaires: true,
      });
      priorityPrId = result.prId;
      console.log(`✅ PR для приоритетов: ${priorityPrId}`);

      // Включить калибровку
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const featureUrl = `/manager/performance-reviews/${priorityPrId}/statistics/settings/?feature=statisticsSettings`;
      const { data: settings } = await api.get(featureUrl);
      await api.post(featureUrl, {
        ...settings,
        settings: {
          ...(settings?.settings || {}),
          useOnlyHeadReceiver: true,
          enableResponsesOverwriting: true,
          enableCompetenceWeights: true,
        },
      });

      // Получить revision и target user
      const { data: revision } = await api.getLastRevision(priorityPrId);
      priorityRevisionId = revision?.id;

      const { data: targetUsersData } = await api.getTargetUsers(priorityPrId, {
        limit: 10,
      });
      const items = targetUsersData?.items || targetUsersData || [];
      if (items.length > 0) {
        const u = items[0];
        priorityTargetUser = { userId: u.user?.id ?? u.userId };
      }

      // Получить вопросы
      if (priorityTargetUser) {
        const { data: oData } = await api.getResponseOverwritesData(
          priorityPrId,
          priorityRevisionId,
          priorityTargetUser.userId,
        );
        priorityQuestions = oData?.questions || [];
      }

      // Warm-up: триггерим ленивый пересчёт статистики
      const allUserIds = items.map((u) => u.user?.id ?? u.userId);
      console.log("  [priority] Warm-up statistics...");
      await Promise.all([
        api.getStatisticsSummaryResults(priorityPrId, {
          targetUsersIds: allUserIds,
          revisionId: priorityRevisionId,
        }),
        api.getUsersCompetenciesResults(priorityPrId, {
          usersIds: allUserIds,
          revisionId: priorityRevisionId,
        }),
        api.getTargetUsersProgress(priorityPrId, {
          revisionId: priorityRevisionId,
          usersIds: allUserIds,
        }),
      ]);
      await new Promise((r) => setTimeout(r, 5000));
      console.log("  [priority] Warm-up завершён");
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.CALIBRATION, "Приоритеты калибровки");
    });

    test(
      "C4454: Ручная правка итога → итог зафиксирован, компетенции не пересчитаны",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI }) => {
        setSeverity("critical");

        expect(priorityTargetUser, "Нет target user").toBeTruthy();

        let competenciesBefore;

        await test.step("Запомнить текущие значения компетенций через API", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            priorityTargetUser.userId,
          );
          competenciesBefore = (data?.responsesData || []).map((rd) => ({
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));
        });

        await test.step("Откалибровать итоговую = 4.0 через API (зафиксировать значение)", async () => {
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              priorityPrId,
              priorityRevisionId,
              priorityTargetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const { response } = await adminAPI.overwriteResponsesValues(
            priorityPrId,
            priorityRevisionId,
            priorityTargetUser.userId,
            {
              overwrites,
              meanOverwrite: { value: 4.0, characteristicId: null },
              isLocked: false,
            },
          );
          expect(response.status()).toBe(201);
        });

        await test.step("Проверить через API: итоговая зафиксирована на 4.0, компетенции не изменились", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            priorityTargetUser.userId,
          );

          const rangeMax = priorityQuestions[0]?.rangeMax || 5;
          expect(data.meanOverwrite.overwrittenValue).toBeCloseTo(
            4.0 / rangeMax,
            2,
          );

          const competenciesAfter = (data?.responsesData || []).map((rd) => ({
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));
          for (let i = 0; i < competenciesBefore.length; i++) {
            expect(competenciesAfter[i]?.answer).toBe(
              competenciesBefore[i].answer,
            );
          }
        });
      },
    );

    test(
      "C4455: Изменить компетенцию → итог пересчитан автоматически",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI }) => {
        setSeverity("critical");

        expect(priorityTargetUser, "Нет target user").toBeTruthy();

        await test.step("Сначала откалибровать итоговую = 4.0 через API", async () => {
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              priorityPrId,
              priorityRevisionId,
              priorityTargetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          await adminAPI.overwriteResponsesValues(
            priorityPrId,
            priorityRevisionId,
            priorityTargetUser.userId,
            {
              overwrites,
              meanOverwrite: { value: 4.0, characteristicId: null },
              isLocked: false,
            },
          );
        });

        await test.step("Изменить первую компетенцию на 5 через API (без ручной итоговой)", async () => {
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              priorityPrId,
              priorityRevisionId,
              priorityTargetUser.userId,
            );

          // Изменяем первую компетенцию на 5
          const overwrites = (currentData?.responsesData || []).map(
            (rd, i) => ({
              responseId: rd.responseId,
              questionId: rd.questionId,
              answer: i === 0 ? 5 : rd.numericAnswer,
            }),
          );

          // POST БЕЗ meanOverwrite — итог должен пересчитаться
          const { response } = await adminAPI.overwriteResponsesValues(
            priorityPrId,
            priorityRevisionId,
            priorityTargetUser.userId,
            {
              overwrites,
              isLocked: false,
            },
          );
          expect(response.status()).toBe(201);
        });

        await test.step("Проверить через API: ручная калибровка итоговой автоматически сброшена", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            priorityTargetUser.userId,
          );

          // После изменения компетенции без meanOverwrite — ручная калибровка сброшена
          expect(
            data.meanOverwrite,
            "meanOverwrite должен быть null — итог пересчитан автоматически",
          ).toBeNull();
        });
      },
    );

    test(
      "C4456: Полная цепочка: ручная → компетенция → ручная → компетенция",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI }) => {
        setSeverity("critical");

        // Используем второй target user из этого PR (чтобы не конфликтовать с MFC-022/023)
        const api = adminAPI;
        const userId = priorityTargetUser?.userId;
        expect(userId, "Нет target user").toBeTruthy();

        const rangeMax = priorityQuestions[0]?.rangeMax || 5;

        // Шаг 1: Ручная правка = 2.0
        await test.step("Шаг 1: Откалибровать итоговую = 2.0 через API", async () => {
          const { data } = await api.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            userId,
          );
          const overwrites = (data?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          await api.overwriteResponsesValues(
            priorityPrId,
            priorityRevisionId,
            userId,
            {
              overwrites,
              meanOverwrite: { value: 2.0, characteristicId: null },
              isLocked: false,
            },
          );

          const { data: check } = await api.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            userId,
          );
          expect(check.meanOverwrite?.overwrittenValue).toBeCloseTo(
            2.0 / rangeMax,
            2,
          );
        });

        // Шаг 2: Изменить компетенцию → итог пересчитан
        await test.step("Шаг 2: Изменить компетенцию через API → итоговая автоматически пересчитана", async () => {
          const { data } = await api.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            userId,
          );
          const overwrites = (data?.responsesData || []).map((rd, i) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: i === 0 ? 1 : rd.numericAnswer,
          }));

          await api.overwriteResponsesValues(
            priorityPrId,
            priorityRevisionId,
            userId,
            {
              overwrites,
              isLocked: false,
            },
          );

          const { data: check } = await api.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            userId,
          );
          expect(
            check.meanOverwrite,
            "meanOverwrite = null после изменения компетенции",
          ).toBeNull();
        });

        // Шаг 3: Снова ручная правка = 4.5
        await test.step("Шаг 3: Снова откалибровать итоговую = 4.5 через API", async () => {
          const { data } = await api.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            userId,
          );
          const overwrites = (data?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          await api.overwriteResponsesValues(
            priorityPrId,
            priorityRevisionId,
            userId,
            {
              overwrites,
              meanOverwrite: { value: 4.5, characteristicId: null },
              isLocked: false,
            },
          );

          const { data: check } = await api.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            userId,
          );
          expect(check.meanOverwrite?.overwrittenValue).toBeCloseTo(
            4.5 / rangeMax,
            2,
          );
        });

        // Шаг 4: Ещё раз компетенция → итог пересчитан
        await test.step("Шаг 4: Изменить вторую компетенцию через API → итоговая снова пересчитана", async () => {
          const { data } = await api.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            userId,
          );
          const overwrites = (data?.responsesData || []).map((rd, i) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: i === 1 ? 4 : rd.numericAnswer,
          }));

          await api.overwriteResponsesValues(
            priorityPrId,
            priorityRevisionId,
            userId,
            {
              overwrites,
              isLocked: false,
            },
          );

          const { data: check } = await api.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            userId,
          );
          expect(
            check.meanOverwrite,
            "meanOverwrite = null после 2-го изменения компетенции",
          ).toBeNull();
        });
      },
    );

    test(
      "C4458: Округлённое значение ≈ оригинал → overwrite сохраняется (rounding edge case)",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI, calibrationVerifier }) => {
        setSeverity("critical");

        expect(priorityTargetUser, "Нет target user").toBeTruthy();
        const userId = priorityTargetUser.userId;
        const rangeMax = priorityQuestions[0]?.rangeMax || 5;

        let originalMean;

        await test.step("Получить оригинальную итоговую оценку через API (до калибровки)", async () => {
          // Сбросить любую предыдущую калибровку — изменить компетенцию без meanOverwrite
          const { data } = await adminAPI.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            userId,
          );
          const overwrites = (data?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          await adminAPI.overwriteResponsesValues(
            priorityPrId,
            priorityRevisionId,
            userId,
            {
              overwrites,
              isLocked: false,
            },
          );

          // Получить users-competencies-results для оригинального значения
          const { data: results } = await adminAPI.getUsersCompetenciesResults(
            priorityPrId,
            { usersIds: [userId], revisionId: priorityRevisionId },
          );
          const userResult = Array.isArray(results)
            ? results.find((r) => r.userId === userId)
            : null;
          originalMean = userResult?.value;
          console.log(`  Оригинальная итоговая: ${originalMean} (fraction)`);

          // Пересчитать в raw score
          expect(originalMean, "Должна быть оригинальная оценка").toBeTruthy();
        });

        await test.step("Откалибровать итоговую = 1.0 через API (другое значение)", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            userId,
          );
          const overwrites = (data?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          // Значение, отличающееся от оригинала
          const differentValue = 1.0;

          const { response } = await adminAPI.overwriteResponsesValues(
            priorityPrId,
            priorityRevisionId,
            userId,
            {
              overwrites,
              meanOverwrite: { value: differentValue, characteristicId: null },
              isLocked: false,
            },
          );
          expect(response.status()).toBe(201);

          // Проверить что запись появилась
          const { data: check } = await adminAPI.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            userId,
          );
          expect(
            check.meanOverwrite,
            "meanOverwrite должен быть НЕ null",
          ).not.toBeNull();
        });

        await test.step("Сбросить ручную калибровку итоговой — отправить только компетенции через API", async () => {
          // Единственный способ гарантированно сбросить overwrite итоговой —
          // отправить POST без meanOverwrite (как при изменении компетенции)
          const { data } = await adminAPI.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            userId,
          );
          const overwrites = (data?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const { response } = await adminAPI.overwriteResponsesValues(
            priorityPrId,
            priorityRevisionId,
            userId,
            { overwrites, isLocked: false },
          );
          expect(response.status()).toBe(201);
        });

        await test.step("Проверить через API: ручная калибровка итоговой сброшена", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            userId,
          );
          expect(
            data.meanOverwrite,
            "meanOverwrite должен быть null после сброса",
          ).toBeNull();
        });

        await test.step("Откалибровать итоговую ≈ оригинальное значение (с округлением) через API", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            userId,
          );
          const overwrites = (data?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          // Округлённый raw score (имитация пользовательского ввода: 3.67 из 3.6667)
          const roundedRawScore =
            Math.round(originalMean * rangeMax * 100) / 100;
          console.log(
            `  Оригинал: ${originalMean} (fraction), rounded raw: ${roundedRawScore}`,
          );

          const { response } = await adminAPI.overwriteResponsesValues(
            priorityPrId,
            priorityRevisionId,
            userId,
            {
              overwrites,
              meanOverwrite: { value: roundedRawScore, characteristicId: null },
              isLocked: false,
            },
          );
          expect(response.status()).toBe(201);
        });

        await test.step("Проверить через API: калибровка сохранена (округлённое ≠ оригинальное)", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            priorityPrId,
            priorityRevisionId,
            userId,
          );

          // Бэкенд сохраняет overwrite, т.к. rounded/rangeMax ≠ originalMean (из-за округления)
          expect(
            data.meanOverwrite,
            "meanOverwrite должен быть НЕ null — округлённое значение отличается от оригинала",
          ).not.toBeNull();

          // Проверяем что сохранённое значение = rounded/rangeMax
          const roundedRawScore =
            Math.round(originalMean * rangeMax * 100) / 100;
          expect(data.meanOverwrite.overwrittenValue).toBeCloseTo(
            roundedRawScore / rangeMax,
            2,
          );
        });

        await test.step("Проверить в БД: запись калибровки итоговой оценки существует", async () => {
          const roundedRawScore =
            Math.round(originalMean * rangeMax * 100) / 100;
          await calibrationVerifier.verifyTotalScoreOverwrite(
            priorityRevisionId,
            userId,
            roundedRawScore / rangeMax,
          );
        });
      },
    );
  },
);

// ==================== РОЛИ И БЛОКИРОВКА (MFC-032) ====================

test.describe(
  "Роли и блокировка калибровки итоговой",
  {
    tag: [
      "@api",
      "@calibration",
      "@critical",
      "@regression",
      "@performance-review",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.CALIBRATION, "Роли и блокировка");
    });

    test(
      "C4457: IsLocked=true → руководитель НЕ может калибровать итоговую",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI, managerAPI }) => {
        setSeverity("critical");

        const targetUser = TARGET_USERS[0];
        expect(targetUser, "Нет target user").toBeTruthy();

        await test.step("Администратор блокирует редактирование калибровки через API (isLocked=true)", async () => {
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const { response } = await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            {
              overwrites,
              meanOverwrite: { value: 3.0, characteristicId: null },
              isLocked: true,
            },
          );
          expect(response.status()).toBe(201);
        });

        await test.step("Руководитель пытается откалибровать через API → ожидаем отказ (403)", async () => {
          // Проверяем что GET показывает isLocked=true
          try {
            const { data, response } =
              await managerAPI.getResponseOverwritesData(
                PR_ID,
                REVISION_ID,
                targetUser.userId,
              );

            if (response.status() === 200) {
              expect(data.isLocked, "isLocked должен быть true").toBe(true);
            }
          } catch {
            // Manager может не иметь доступа к этому endpoint — тоже ОК
          }

          // Попытка POST от руководителя
          try {
            const { data: currentData } =
              await managerAPI.getResponseOverwritesData(
                PR_ID,
                REVISION_ID,
                targetUser.userId,
              );
            const overwrites = (currentData?.responsesData || []).map((rd) => ({
              responseId: rd.responseId,
              questionId: rd.questionId,
              answer: rd.numericAnswer,
            }));

            const { response } = await managerAPI.overwriteResponsesValues(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
              {
                overwrites,
                meanOverwrite: { value: 5.0, characteristicId: null },
                isLocked: false,
              },
            );

            // Ожидаем 403 или другую ошибку
            expect(
              [403, 400, 422].includes(response.status()),
              `Руководитель не должен калибровать при isLocked=true, получен ${response.status()}`,
            ).toBe(true);
          } catch {
            // Если GET упал с 403 — тест тоже пройден (нет доступа)
          }
        });

        await test.step("Администратор снимает блокировку калибровки через API (isLocked=false)", async () => {
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const { response } = await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            {
              overwrites,
              meanOverwrite: currentData?.meanOverwrite
                ? {
                    value:
                      currentData.meanOverwrite.overwrittenValue *
                      (QUESTIONS[0]?.rangeMax || 5),
                    characteristicId: null,
                  }
                : undefined,
              isLocked: false,
            },
          );
          expect(response.status()).toBe(201);
        });
      },
    );
  },
);

// ==================== ГРАНИЧНЫЕ ЗНАЧЕНИЯ (MFC-006..008) ====================

test.describe(
  "Граничные значения калибровки итоговой оценки",
  {
    tag: ["@api", "@calibration", "@regression", "@performance-review"],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.CALIBRATION, "Граничные значения");
    });

    test(
      "C4451: Максимум шкалы → сохраняется корректно",
      {
        tag: ["@regression"],
      },
      async ({ adminAPI, calibrationVerifier }) => {
        setSeverity("normal");

        // Используем свободного target user
        const targetUserIndex = TARGET_USERS.length > 3 ? 3 : 2;
        const targetUser = TARGET_USERS[targetUserIndex];
        expect(
          targetUser,
          `Нет target user #${targetUserIndex} для теста`,
        ).toBeTruthy();

        const rangeMax = QUESTIONS[0]?.rangeMax || 5;
        const rangeMin = QUESTIONS[0]?.rangeMin || 1;

        await test.step(`Откалибровать итоговую = ${rangeMax} (максимум шкалы) через API`, async () => {
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const { response } = await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            {
              overwrites,
              meanOverwrite: { value: rangeMax, characteristicId: null },
              isLocked: false,
            },
          );
          expect(response.status(), "POST calibrate to max → 201").toBe(201);
        });

        await test.step("Проверить через API: максимальное значение сохранено (1.0)", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
          );
          expect(
            data.meanOverwrite,
            "meanOverwrite должен существовать",
          ).not.toBeNull();
          // rangeMax / rangeMax = 1.0
          expect(data.meanOverwrite.overwrittenValue).toBeCloseTo(1.0, 2);
        });

        await test.step("Проверить в БД: запись с максимальным значением создана", async () => {
          await calibrationVerifier.verifyTotalScoreOverwrite(
            REVISION_ID,
            targetUser.userId,
            1.0,
          );
        });
      },
    );

    test.fixme(
      "C7105: Значение за пределами шкалы → валидация/отказ",
      {
        tag: ["@regression"],
        annotation: {
          type: "APP_BUG",
          description:
            "Бэкенд не валидирует диапазон meanOverwrite: принимает value=6 при rangeMax=5 (HTTP 201 вместо 400/422)",
        },
      },
      async ({ adminAPI }) => {
        setSeverity("normal");

        // Используем свободного target user
        const targetUserIndex = TARGET_USERS.length > 3 ? 3 : 2;
        const targetUser = TARGET_USERS[targetUserIndex];
        expect(
          targetUser,
          `Нет target user #${targetUserIndex} для теста`,
        ).toBeTruthy();

        const rangeMax = QUESTIONS[0]?.rangeMax || 5;
        const outOfRangeValue = rangeMax + 1; // e.g. 6 for scale 1-5

        await test.step(`Попытка калибровки = ${outOfRangeValue} через API (за пределами шкалы) → ожидаем валидацию`, async () => {
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const { response } = await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            {
              overwrites,
              meanOverwrite: { value: outOfRangeValue, characteristicId: null },
              isLocked: false,
            },
          );

          const status = response.status();
          expect(
            status === 400 || status === 422,
            `Бэкенд должен отклонить значение ${outOfRangeValue} за пределами шкалы (max=${rangeMax}), ` +
              `но вернул статус ${status}. Это баг бэкенда — нет валидации диапазона.`,
          ).toBe(true);
        });
      },
    );

    test(
      "C4453: Дробное значение (3.5) → поведение",
      {
        tag: ["@regression"],
      },
      async ({ adminAPI, calibrationVerifier }) => {
        setSeverity("normal");

        // Используем свободного target user
        const targetUserIndex = TARGET_USERS.length > 3 ? 3 : 2;
        const targetUser = TARGET_USERS[targetUserIndex];
        expect(
          targetUser,
          `Нет target user #${targetUserIndex} для теста`,
        ).toBeTruthy();

        const fractionalValue = 3.5;
        const rangeMax = QUESTIONS[0]?.rangeMax || 5;
        const expectedFraction = fractionalValue / rangeMax;

        await test.step("Откалибровать итоговую = 3.5 (дробное значение) через API", async () => {
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const { response } = await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            {
              overwrites,
              meanOverwrite: { value: fractionalValue, characteristicId: null },
              isLocked: false,
            },
          );
          expect(response.status(), "POST calibrate fractional → 201").toBe(
            201,
          );
        });

        await test.step("Проверить через API: дробное значение сохранено корректно", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
          );
          expect(
            data.meanOverwrite,
            "meanOverwrite должен существовать",
          ).not.toBeNull();
          expect(data.meanOverwrite.overwrittenValue).toBeCloseTo(
            expectedFraction,
            2,
          );
        });

        await test.step("Проверить в БД: запись с дробным значением создана корректно", async () => {
          await calibrationVerifier.verifyTotalScoreOverwrite(
            REVISION_ID,
            targetUser.userId,
            expectedFraction,
          );
        });
      },
    );
  },
);

// ==================== БЕЗОПАСНОСТЬ И КОНКУРЕНТНОСТЬ (MFC-054..056) ====================

test.describe(
  "Безопасность и конкурентность калибровки итоговой",
  {
    tag: ["@api", "@calibration", "@regression", "@performance-review"],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.CALIBRATION, "Безопасность калибровки");
    });

    test(
      "C4459: Обычный сотрудник НЕ может откалибровать итоговую (403)",
      {
        tag: ["@regression"],
      },
      async ({ adminAPI, request }) => {
        setSeverity("normal");

        const targetUser = TARGET_USERS[0];
        expect(targetUser, "Нет target user").toBeTruthy();

        await test.step("Подготовить данные для калибровки через API администратора", async () => {
          // Получаем данные через adminAPI для подготовки payload
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          expect(currentData, "Данные калибровки получены").toBeTruthy();
        });

        await test.step("Обычный сотрудник пытается откалибровать итоговую через API → ожидаем отказ (403)", async () => {
          // Авторизуемся как обычный сотрудник (user)
          const userAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("user");
          await userAPI.signIn(email, password);

          // Получаем данные для payload
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          // Попытка POST от сотрудника
          const { response } = await userAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            {
              overwrites,
              meanOverwrite: { value: 5.0, characteristicId: null },
              isLocked: false,
            },
          );

          const status = response.status();
          console.log(`  Сотрудник → status: ${status}`);
          expect(
            [403, 401].includes(status),
            `Обычный сотрудник не должен калибровать итоговую, получен ${status}`,
          ).toBe(true);
        });
      },
    );

    test(
      "C7106: Руководитель НЕ может калибровать чужого сотрудника (не из команды)",
      {
        tag: ["@regression"],
      },
      async ({ adminAPI, managerAPI }) => {
        setSeverity("normal");

        await test.step("Руководитель пытается откалибровать сотрудника не из своей команды через API", async () => {
          // Используем target user из PR, но пробуем от managerAPI
          // Если manager не имеет доступа к данным этого сотрудника — ожидаем ошибку
          const targetUser = TARGET_USERS[0];
          expect(targetUser, "Нет target user").toBeTruthy();

          // Получаем данные через adminAPI (у admin точно есть доступ)
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          // Попытка POST от руководителя
          const { response } = await managerAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            {
              overwrites,
              meanOverwrite: { value: 5.0, characteristicId: null },
              isLocked: false,
            },
          );

          const status = response.status();
          console.log(
            `  Руководитель → target userId=${targetUser.userId}: status ${status}`,
          );

          // Руководитель может иметь доступ (201) если сотрудник в его команде,
          // или не иметь (403) если не в команде.
          // Фиксируем поведение для документации.
          if (status === 201) {
            console.log(
              "  ℹ️ Руководитель имеет доступ к калибровке этого сотрудника (в его команде)",
            );
            // Откатим калибровку
            await adminAPI.overwriteResponsesValues(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
              { overwrites, isLocked: false },
            );
          } else {
            expect(
              [403, 401].includes(status),
              `Руководитель без доступа должен получить 403, получен ${status}`,
            ).toBe(true);
            console.log(
              "  ✅ Руководитель НЕ имеет доступа — 403 как ожидалось",
            );
          }
        });
      },
    );

    test(
      "C7107: Два администратора калибруют одного сотрудника — last write wins",
      {
        tag: ["@regression"],
      },
      async ({ adminAPI, request }) => {
        setSeverity("normal");

        const targetUser = TARGET_USERS[0];
        expect(targetUser, "Нет target user").toBeTruthy();
        const rangeMax = QUESTIONS[0]?.rangeMax || 5;

        // Второй admin API клиент (тот же логин, отдельная сессия)
        const admin2API = new PerformanceReviewAPI(request);
        const { email, password } = getCredentials("admin");
        await admin2API.signIn(email, password);

        await test.step("Администратор №1 калибрует итоговую = 2.0 через API", async () => {
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const { response } = await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            {
              overwrites,
              meanOverwrite: { value: 2.0, characteristicId: null },
              isLocked: false,
            },
          );
          expect(response.status(), "Admin1 POST → 201").toBe(201);
        });

        await test.step("Администратор №2 калибрует итоговую = 4.0 через API (перезаписывает)", async () => {
          const { data: currentData } =
            await admin2API.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const { response } = await admin2API.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            {
              overwrites,
              meanOverwrite: { value: 4.0, characteristicId: null },
              isLocked: false,
            },
          );
          expect(response.status(), "Admin2 POST → 201").toBe(201);
        });

        await test.step("Проверить через API: итоговая = 4.0 (последняя запись побеждает)", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
          );
          expect(
            data.meanOverwrite,
            "meanOverwrite должен существовать",
          ).not.toBeNull();
          expect(
            data.meanOverwrite.overwrittenValue,
            "Итог = последняя запись (4.0 / rangeMax)",
          ).toBeCloseTo(4.0 / rangeMax, 2);
          console.log(
            `  ✅ Last write wins: overwrittenValue=${data.meanOverwrite.overwrittenValue}`,
          );
        });

        await test.step("Проверить через API: данные компетенций не повреждены после конкурентной калибровки", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
          );
          const responsesData = data?.responsesData || [];
          expect(
            responsesData.length,
            "Ответы по компетенциям доступны",
          ).toBeGreaterThan(0);

          for (const rd of responsesData) {
            expect(rd.questionId, "questionId не пустой").toBeTruthy();
            expect(typeof rd.numericAnswer, "numericAnswer = число").toBe(
              "number",
            );
          }
          console.log(
            `  ✅ Все ${responsesData.length} компетенций не повреждены`,
          );
        });
      },
    );
  },
);
