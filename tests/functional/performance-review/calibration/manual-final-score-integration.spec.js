// @ts-check
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

const test = baseTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
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

test.describe.serial(
  "Интеграция калибровки итоговой оценки",
  { tag: ["@api", "@performance-review", "@calibration", "@regression"] },
  () => {
    let PR_ID, REVISION_ID, TARGET_USERS, QUESTIONS, CHARACTERISTICS, RANGE_MAX;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180000);

      await test.step("Создание PR с калибровкой итоговой оценки", async () => {
        const calSeed = new CalibrationSeed(request);
        await calSeed.init();
        const result = await calSeed.seedWithDirections({
          directions: { self: true, head: true },
          targetUsersCount: 4,
          receiversPerDirection: 2,
          fillQuestionnaires: true,
        });
        PR_ID = result.prId;
        RANGE_MAX = result.rangeMax;
      });

      await test.step("Настройка калибровки и характеристик", async () => {
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

        const { data: savedSettings } = await api.get(featureUrl);
        CHARACTERISTICS = savedSettings?.characteristicSettings || [];
        expect(CHARACTERISTICS.length).toBeGreaterThanOrEqual(3);
      });

      await test.step("Получение ревизии и пользователей", async () => {
        const api = new PerformanceReviewAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const { data: revision } = await api.getLastRevision(PR_ID);
        REVISION_ID = revision?.id;
        expect(REVISION_ID).toBeTruthy();

        const { data: targetUsersData } = await api.getTargetUsers(PR_ID, {
          limit: 10,
        });
        const items = targetUsersData?.items || targetUsersData || [];
        const allUsers = items.map((u) => ({
          userId: u.user?.id ?? u.userId,
          name: `${u.user?.firstName || ""} ${u.user?.lastName || ""}`.trim(),
        }));
        expect(allUsers.length).toBeGreaterThanOrEqual(4);

        await test.step("Прогрев статистики", async () => {
          const allUserIds = allUsers.map((u) => u.userId);
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
        });

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
        console.log(
          `  Target users: ${TARGET_USERS.length} (из ${allUsers.length})`,
        );
        expect(
          TARGET_USERS.length,
          "Должно быть ≥3 доступных target users",
        ).toBeGreaterThanOrEqual(3);

        const { data: overwriteData } = await api.getResponseOverwritesData(
          PR_ID,
          REVISION_ID,
          TARGET_USERS[0].userId,
        );
        QUESTIONS = overwriteData?.questions || [];
        expect(QUESTIONS.length).toBeGreaterThan(0);

        // Если RANGE_MAX не был установлен seed-ом, берём из вопросов
        if (!RANGE_MAX && QUESTIONS[0]?.rangeMax) {
          RANGE_MAX = QUESTIONS[0].rangeMax;
        }
        expect(RANGE_MAX).toBeGreaterThan(0);
        console.log(`  Вопросов: ${QUESTIONS.length}, RANGE_MAX: ${RANGE_MAX}`);
      });
    });

    test.beforeEach(async () => {
      markAsAPITest(MODULES.CALIBRATION, "Интеграция калибровки итоговой");
      setSeverity("normal");
      allure.parameter("PR ID", PR_ID);
      allure.parameter("Revision ID", REVISION_ID);
    });

    test("C4492: Heatmap НЕ изменяется после калибровки итоговой оценки", async ({
      adminAPI,
    }) => {
      const testUser = TARGET_USERS[0];
      const calibratedValue = 4.5;

      let heatmapBefore;

      await test.step("Получить данные тепловой карты компетенций через API (до калибровки итоговой)", async () => {
        const { data } = await adminAPI.getStatisticsSummaryResults(PR_ID, {
          targetUsersIds: [testUser.userId],
          revisionId: REVISION_ID,
        });

        const heatMapUser =
          data?.heatMapResults?.targetUsers?.[testUser.userId];
        expect(heatMapUser).toBeTruthy();

        heatmapBefore = heatMapUser?.avrCompetencesCommon;
        expect(heatmapBefore).toBeTruthy();
        expect(heatmapBefore.value).toBeGreaterThan(0);
      });

      await test.step("Откалибровать итоговую оценку через API (числовой режим)", async () => {
        const { data: currentData } = await adminAPI.getResponseOverwritesData(
          PR_ID,
          REVISION_ID,
          testUser.userId,
        );
        const overwrites = (currentData?.responsesData || []).map((rd) => ({
          responseId: rd.responseId,
          questionId: rd.questionId,
          answer: rd.numericAnswer,
        }));

        const { response } = await adminAPI.overwriteResponsesValues(
          PR_ID,
          REVISION_ID,
          testUser.userId,
          {
            overwrites,
            meanOverwrite: { value: calibratedValue, characteristicId: null },
            isLocked: false,
          },
        );
        expect(response.status()).toBe(201);
      });

      await test.step("Проверить через API: тепловая карта компетенций НЕ изменилась (калибровка итоговой не влияет на компетенции)", async () => {
        const { data } = await adminAPI.getStatisticsSummaryResults(PR_ID, {
          targetUsersIds: [testUser.userId],
          revisionId: REVISION_ID,
        });

        const heatMapUser =
          data?.heatMapResults?.targetUsers?.[testUser.userId];
        expect(heatMapUser).toBeTruthy();

        const heatmapAfter = heatMapUser?.avrCompetencesCommon;
        expect(heatmapAfter).toBeTruthy();

        // Heatmap показывает average по компетенциям, НЕ ручную калибровку итога
        expect(heatmapAfter.value).toBeCloseTo(heatmapBefore.value, 2);
        expect(heatmapAfter.color).toBe(heatmapBefore.color);
      });
    });

    test('C4493: Dashboard "Общая оценка" показывает калиброванное значение', async ({
      adminAPI,
    }) => {
      const testUser = TARGET_USERS[1];
      const calibratedValue = 3.0;

      await test.step("Откалибровать итоговую оценку через API (числовой режим)", async () => {
        const { data: currentData } = await adminAPI.getResponseOverwritesData(
          PR_ID,
          REVISION_ID,
          testUser.userId,
        );
        const overwrites = (currentData?.responsesData || []).map((rd) => ({
          responseId: rd.responseId,
          questionId: rd.questionId,
          answer: rd.numericAnswer,
        }));

        const { response } = await adminAPI.overwriteResponsesValues(
          PR_ID,
          REVISION_ID,
          testUser.userId,
          {
            overwrites,
            meanOverwrite: { value: calibratedValue, characteristicId: null },
            isLocked: false,
          },
        );
        expect(response.status()).toBe(201);
      });

      await test.step("Проверить через API: итоговая оценка обновилась после калибровки", async () => {
        const expectedFraction = calibratedValue / RANGE_MAX;

        // Бэкенд пересчитывает статистику асинхронно — poll до появления обновлённого значения
        let userResult;
        const maxAttempts = 5;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          await new Promise((r) => setTimeout(r, 3000));

          const { data } = await adminAPI.getUsersCompetenciesResults(PR_ID, {
            usersIds: [testUser.userId],
            revisionId: REVISION_ID,
          });

          expect(Array.isArray(data)).toBe(true);
          userResult = data.find((u) => u.userId === testUser.userId);
          expect(userResult).toBeTruthy();

          if (
            userResult.isOverwritten &&
            Math.abs(userResult.value - expectedFraction) < 0.05
          ) {
            console.log(
              `  Кеш обновился на попытке ${attempt}: value=${userResult.value}`,
            );
            break;
          }
          console.log(
            `  Попытка ${attempt}/${maxAttempts}: value=${userResult.value}, isOverwritten=${userResult.isOverwritten} (ждём ${expectedFraction})`,
          );
        }

        expect(userResult.value).toBeCloseTo(expectedFraction, 2);
        expect(userResult.isOverwritten).toBe(true);
        expect(userResult.valueColor).toBeTruthy();
      });
    });

    test('C4494: Колонки "До/После калибровки" корректны', async ({
      adminAPI,
    }) => {
      const testUser = TARGET_USERS[2];
      const calibratedValue = 4.0;

      let originalValue, originalColor;

      await test.step("Запомнить оригинальную итоговую оценку через API (до калибровки)", async () => {
        // Этот user ещё не калибровался (user[0] в MFC-048, user[1] в MFC-049)
        const { data } = await adminAPI.getUsersCompetenciesResults(PR_ID, {
          usersIds: [testUser.userId],
          revisionId: REVISION_ID,
        });

        const userResult = data.find((u) => u.userId === testUser.userId);
        expect(userResult, "Должен быть результат для user[2]").toBeTruthy();

        originalValue = userResult.value;
        originalColor = userResult.valueColor;
        expect(originalValue, "Оригинальная оценка > 0").toBeGreaterThan(0);
        console.log(
          `  Original value: ${originalValue}, color: ${originalColor}`,
        );
      });

      await test.step("Откалибровать итоговую оценку через API (числовой режим)", async () => {
        const { data: currentData } = await adminAPI.getResponseOverwritesData(
          PR_ID,
          REVISION_ID,
          testUser.userId,
        );
        const overwrites = (currentData?.responsesData || []).map((rd) => ({
          responseId: rd.responseId,
          questionId: rd.questionId,
          answer: rd.numericAnswer,
        }));

        const { response } = await adminAPI.overwriteResponsesValues(
          PR_ID,
          REVISION_ID,
          testUser.userId,
          {
            overwrites,
            meanOverwrite: { value: calibratedValue, characteristicId: null },
            isLocked: false,
          },
        );
        expect(response.status()).toBe(201);

        // Верификация через GET
        const { data: verifyData } = await adminAPI.getResponseOverwritesData(
          PR_ID,
          REVISION_ID,
          testUser.userId,
        );
        const expectedFraction = calibratedValue / RANGE_MAX;
        expect(verifyData.meanOverwrite?.overwrittenValue).toBeCloseTo(
          expectedFraction,
          2,
        );
      });

      await test.step("Проверить через API: значения «до калибровки» и «после калибровки» различаются", async () => {
        const expectedFraction = calibratedValue / RANGE_MAX;

        // Подождать обновление кеша бэкенда
        await new Promise((r) => setTimeout(r, 5000));

        const { data } = await adminAPI.getUsersCompetenciesResults(PR_ID, {
          usersIds: [testUser.userId],
          revisionId: REVISION_ID,
        });

        const userResult = data.find((u) => u.userId === testUser.userId);
        expect(
          userResult,
          "Должен быть результат после калибровки",
        ).toBeTruthy();
        console.log(
          `  After: value=${userResult.value}, isOverwritten=${userResult.isOverwritten}`,
        );

        expect(userResult.value).toBeCloseTo(expectedFraction, 2);
        expect(userResult.isOverwritten).toBe(true);

        // notOverwritten содержит оригинальное значение ("До калибровки")
        expect(
          userResult.notOverwritten,
          "Должно быть поле notOverwritten",
        ).toBeTruthy();
        expect(userResult.notOverwritten.value).toBeCloseTo(originalValue, 2);
      });
    });

    test("C4495: Калибровка привязана к ревизии", async ({
      adminAPI,
      calibrationVerifier,
    }) => {
      const testUser = TARGET_USERS[TARGET_USERS.length - 1];
      expect(testUser, "Должен быть доступный test user").toBeTruthy();
      const calibratedValue = 3.5;

      await test.step("Откалибровать итоговую оценку через API (числовой режим)", async () => {
        const { data: currentData } = await adminAPI.getResponseOverwritesData(
          PR_ID,
          REVISION_ID,
          testUser.userId,
        );
        const overwrites = (currentData?.responsesData || []).map((rd) => ({
          responseId: rd.responseId,
          questionId: rd.questionId,
          answer: rd.numericAnswer,
        }));

        const { response } = await adminAPI.overwriteResponsesValues(
          PR_ID,
          REVISION_ID,
          testUser.userId,
          {
            overwrites,
            meanOverwrite: { value: calibratedValue, characteristicId: null },
            isLocked: false,
          },
        );
        expect(response.status()).toBe(201);
      });

      await test.step("Проверить через API: калибровка привязана к конкретной ревизии PR", async () => {
        const { data } = await adminAPI.getResponseOverwritesData(
          PR_ID,
          REVISION_ID,
          testUser.userId,
        );

        expect(
          data.meanOverwrite,
          "meanOverwrite должен существовать",
        ).toBeTruthy();
        const expectedFraction = calibratedValue / RANGE_MAX;
        expect(data.meanOverwrite.overwrittenValue).toBeCloseTo(
          expectedFraction,
          2,
        );
        expect(data.meanOverwrite.overwrittenCharacteristicId).toBeNull();

        // Ревизия = обязательный параметр в endpoint URL
        // Данные привязаны к конкретной ревизии
        console.log(`  Калибровка привязана к revision ${REVISION_ID}`);
      });

      await test.step("DB: запись содержит корректный revision_id", async () => {
        await calibrationVerifier.verifyTotalScoreOverwrite(
          REVISION_ID,
          testUser.userId,
          calibratedValue / RANGE_MAX,
        );
      });
    });

    test("C4496: Калибровка одного сотрудника не влияет на другого", async ({
      adminAPI,
    }) => {
      const userA = TARGET_USERS[0];
      const userB = TARGET_USERS[1];
      const calibratedValue = 2.0;

      let userBValueBefore;

      await test.step("Запомнить итоговую оценку сотрудника B через API (до калибровки A)", async () => {
        const { data } = await adminAPI.getUsersCompetenciesResults(PR_ID, {
          usersIds: [userB.userId],
          revisionId: REVISION_ID,
        });

        const userResult = data.find((u) => u.userId === userB.userId);
        expect(userResult).toBeTruthy();
        userBValueBefore = userResult.value;
        expect(userBValueBefore).toBeGreaterThan(0);
      });

      await test.step("Откалибровать итоговую оценку сотрудника A через API (числовой режим)", async () => {
        const { data: currentData } = await adminAPI.getResponseOverwritesData(
          PR_ID,
          REVISION_ID,
          userA.userId,
        );
        const overwrites = (currentData?.responsesData || []).map((rd) => ({
          responseId: rd.responseId,
          questionId: rd.questionId,
          answer: rd.numericAnswer,
        }));

        const { response } = await adminAPI.overwriteResponsesValues(
          PR_ID,
          REVISION_ID,
          userA.userId,
          {
            overwrites,
            meanOverwrite: { value: calibratedValue, characteristicId: null },
            isLocked: false,
          },
        );
        expect(response.status()).toBe(201);
      });

      await test.step("Проверить через API: итоговая оценка другого сотрудника НЕ изменилась", async () => {
        // Подождать кеш
        await new Promise((r) => setTimeout(r, 3000));

        const { data } = await adminAPI.getUsersCompetenciesResults(PR_ID, {
          usersIds: [userB.userId],
          revisionId: REVISION_ID,
        });

        const userResult = data.find((u) => u.userId === userB.userId);
        expect(userResult).toBeTruthy();
        expect(userResult.value).toBeCloseTo(userBValueBefore, 2);
        console.log(
          `  User B: value=${userResult.value} (was ${userBValueBefore}) — не изменился`,
        );
      });
    });
  },
);
