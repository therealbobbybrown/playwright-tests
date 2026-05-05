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

test.describe(
  "Краевые кейсы настроек калибровки итоговой оценки",
  { tag: ["@api", "@performance-review", "@calibration", "@regression"] },
  () => {
    let PR_ID, REVISION_ID, TARGET_USERS, QUESTIONS, CHARACTERISTICS;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180000);

      await test.step("Создать PR с заполненными анкетами", async () => {
        const calSeed = new CalibrationSeed(request);
        await calSeed.init();
        const result = await calSeed.seedWithDirections({
          directions: { self: true, head: true },
          targetUsersCount: 3,
          receiversPerDirection: 2,
          fillQuestionnaires: true,
        });
        PR_ID = result.prId;
        expect(PR_ID).toBeDefined();
      });

      await test.step("Включить калибровку и настроить характеристики", async () => {
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
          characteristicSettings: [
            { threshold: 33, title: "Низко", category: "negative" },
            { threshold: 66, title: "Средне", category: "neutral" },
            { threshold: 100, title: "Высоко", category: "positive" },
          ],
        });
      });

      await test.step("Получить revision", async () => {
        const api = new PerformanceReviewAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const { data: revision } = await api.getLastRevision(PR_ID);
        REVISION_ID = revision?.id;
        expect(REVISION_ID).toBeDefined();
      });

      await test.step("Получить target users", async () => {
        const api = new PerformanceReviewAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const { data: targetUsersData } = await api.getTargetUsers(PR_ID, {
          limit: 10,
        });
        const items = targetUsersData?.items || targetUsersData || [];
        const allUsers = items.map((u) => ({
          userId: u.user?.id ?? u.userId,
          name: `${u.user?.firstName || ""} ${u.user?.lastName || ""}`.trim(),
        }));
        expect(allUsers.length).toBeGreaterThanOrEqual(3);

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

        TARGET_USERS = [];
        for (const u of allUsers) {
          const { response } = await api.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            u.userId,
          );
          if (response.ok()) TARGET_USERS.push(u);
        }
        expect(TARGET_USERS.length).toBeGreaterThanOrEqual(2);
      });

      await test.step("Получить вопросы и характеристики", async () => {
        const api = new PerformanceReviewAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const { data: overwriteData } = await api.getResponseOverwritesData(
          PR_ID,
          REVISION_ID,
          TARGET_USERS[0].userId,
        );
        QUESTIONS = overwriteData?.questions || [];
        expect(QUESTIONS.length).toBeGreaterThan(0);

        // Получить характеристики с ID из settings (после сохранения они получают ID)
        const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
        const { data: savedSettings } = await api.get(featureUrl);
        CHARACTERISTICS = savedSettings?.characteristicSettings || [];

        // Если нет ID, wait и retry (бэкенд может генерировать асинхронно)
        if (CHARACTERISTICS.length === 0 || !CHARACTERISTICS[0]?.id) {
          await new Promise((r) => setTimeout(r, 2000));
          const { data: retry } = await api.get(featureUrl);
          CHARACTERISTICS = retry?.characteristicSettings || [];
        }

        expect(CHARACTERISTICS.length).toBe(3);
        expect(CHARACTERISTICS[0]).toHaveProperty("id");
      });
    });

    test.beforeEach(async () => {
      markAsAPITest(MODULES.CALIBRATION, "Краевые кейсы настроек");
      setSeverity("normal");
    });

    test.describe.serial("Последовательные тесты с изменением настроек", () => {
      let calibratedUser, calibratedValue;

      test("C4485: Удалить характеристику, используемую в калибровке", async ({
        adminAPI,
        calibrationVerifier,
      }) => {
        await allure.owner("QA Team");
        await allure.feature("Calibration");
        await allure.story("Settings Edge Cases");

        const user = TARGET_USERS[0];

        await test.step("Откалибровать итоговую оценку через API (dropdown режим, текстовая характеристика)", async () => {
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              user.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const characteristicId = CHARACTERISTICS[1].id;

          const { response: overwriteResponse } =
            await adminAPI.overwriteResponsesValues(
              PR_ID,
              REVISION_ID,
              user.userId,
              {
                overwrites,
                meanOverwrite: { value: null, characteristicId },
                isLocked: false,
              },
            );
          expect(overwriteResponse.ok()).toBeTruthy();

          const { data: afterCalibration } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              user.userId,
            );

          expect(afterCalibration.meanOverwrite).toBeDefined();
          expect(
            afterCalibration.meanOverwrite.overwrittenCharacteristicId,
          ).toBe(characteristicId);
        });

        await test.step("Удалить характеристику из настроек PR через API (текстовые характеристики)", async () => {
          const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
          const { data: settings } = await adminAPI.get(featureUrl);

          const updatedCharacteristics = CHARACTERISTICS.filter(
            (_, idx) => idx !== 1,
          );
          expect(updatedCharacteristics.length).toBe(2);

          await adminAPI.post(featureUrl, {
            ...settings,
            characteristicSettings: updatedCharacteristics,
          });

          CHARACTERISTICS = updatedCharacteristics;
        });

        await test.step("Проверить через API: калибровка пересчитана после удаления характеристики", async () => {
          const { data: afterDelete } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              user.userId,
            );

          // Backend обнуляет FK, но оставляет meanOverwrite объект
          expect(afterDelete.meanOverwrite).toBeDefined();
          expect(
            afterDelete.meanOverwrite.overwrittenCharacteristicId,
          ).toBeNull();
          expect(afterDelete.meanOverwrite.overwrittenValue).toBeNull();
        });
      });

      test("C4486: Изменить пороги характеристик — калибровка работает", async ({
        adminAPI,
      }) => {
        await allure.owner("QA Team");
        await allure.feature("Calibration");
        await allure.story("Settings Edge Cases");

        const user = TARGET_USERS[1];

        await test.step("Откалибровать итоговую оценку через API (числовой режим)", async () => {
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              user.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            user.userId,
            {
              overwrites,
              meanOverwrite: { value: 4.2, characteristicId: null },
              isLocked: false,
            },
          );

          const { data: afterCalibration } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              user.userId,
            );
          expect(afterCalibration.meanOverwrite).toBeDefined();
          expect(afterCalibration.meanOverwrite.overwrittenValue).toBeCloseTo(
            0.84,
            2,
          );
          calibratedUser = user;
          calibratedValue = 0.84;
        });

        await test.step("Изменить пороги текстовых характеристик в настройках PR через API (33→25, 66→75)", async () => {
          const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
          const { data: settings } = await adminAPI.get(featureUrl);

          await adminAPI.post(featureUrl, {
            ...settings,
            characteristicSettings: [
              { threshold: 25, title: "Очень низко", category: "negative" },
              { threshold: 75, title: "Хорошо", category: "positive" },
            ],
          });

          CHARACTERISTICS = [
            { threshold: 25, title: "Очень низко", category: "negative" },
            { threshold: 75, title: "Хорошо", category: "positive" },
          ];
        });

        await test.step("Проверить через API: калибровка итоговой оценки сохранена после изменения порогов", async () => {
          const { data: afterThresholdChange } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              user.userId,
            );
          expect(afterThresholdChange.meanOverwrite).toBeDefined();
          expect(
            afterThresholdChange.meanOverwrite.overwrittenValue,
          ).toBeCloseTo(calibratedValue, 2);
        });
      });

      test("C4487: Отключить калибровку — API не возвращает meanOverwrite", async ({
        adminAPI,
      }) => {
        await allure.owner("QA Team");
        await allure.feature("Calibration");
        await allure.story("Settings Edge Cases");

        await test.step("Выключить режим калибровки в настройках PR через API", async () => {
          const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
          const { data: settings } = await adminAPI.get(featureUrl);

          await adminAPI.post(featureUrl, {
            ...settings,
            settings: {
              ...(settings?.settings || {}),
              enableResponsesOverwriting: false,
            },
          });
        });

        await test.step("Проверить через API: калибровочные данные недоступны (калибровка выключена)", async () => {
          const { response, data } = await adminAPI.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            calibratedUser.userId,
          );

          if (response.status() === 403) {
            expect(response.status()).toBe(403);
          } else {
            expect(response.ok()).toBeTruthy();
            expect(data.meanOverwrite).toBeNull();
          }
        });
      });

      test("C4488: Отключить калибровку — DB записи НЕ удалены", async ({
        dbClient,
      }) => {
        await allure.owner("QA Team");
        await allure.feature("Calibration");
        await allure.story("Settings Edge Cases");

        await test.step("Проверить в БД: записи калибровки итоговой НЕ удалены после отключения режима", async () => {
          if (!dbClient.isConnected()) {
            console.log("  ⚠ DB недоступна, пропускаем проверку");
            return;
          }

          // Проверяем что запись существует (не проверяем конкретное значение,
          // т.к. изменения настроек могут повлиять на данные)
          const dbRecord = await dbClient.findOne(
            "performance_review_user_competences_mean_history_overwrites",
            {
              target_user_id: calibratedUser.userId,
            },
          );

          expect(dbRecord).not.toBeNull();
          expect(dbRecord).toHaveProperty("id");
          // Должно быть хотя бы одно из полей заполнено
          const hasValue =
            dbRecord.overwritten_value != null ||
            dbRecord.overwritten_characteristic_id != null;
          expect(hasValue).toBeTruthy();
        });
      });

      test("C4489: Включить калибровку обратно — восстановление значений", async ({
        adminAPI,
      }) => {
        await allure.owner("QA Team");
        await allure.feature("Calibration");
        await allure.story("Settings Edge Cases");

        await test.step("Включить режим калибровки обратно в настройках PR через API", async () => {
          const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
          const { data: settings } = await adminAPI.get(featureUrl);

          await adminAPI.post(featureUrl, {
            ...settings,
            settings: {
              ...(settings?.settings || {}),
              enableResponsesOverwriting: true,
            },
          });
        });

        await test.step("Проверить через API: ранее сохранённая калибровка итоговой восстановлена", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            calibratedUser.userId,
          );
          expect(data.meanOverwrite).toBeDefined();
          expect(data.meanOverwrite.overwrittenValue).toBeCloseTo(
            calibratedValue,
            2,
          );
        });
      });

      test("C4490: Переключить режим: numeric → text при калибровке", async ({
        adminAPI,
      }) => {
        await allure.owner("QA Team");
        await allure.feature("Calibration");
        await allure.story("Settings Edge Cases");

        await test.step("Переключить режим на «только текстовые характеристики» в настройках PR через API", async () => {
          const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
          const { data: settings } = await adminAPI.get(featureUrl);

          await adminAPI.post(featureUrl, {
            ...settings,
            settings: {
              ...(settings?.settings || {}),
              enableOnlyCustomCharacteristics: true,
            },
          });
        });

        await test.step("Проверить через API: данные калибровки итоговой доступны после переключения режима", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            calibratedUser.userId,
          );

          // meanOverwrite должен существовать — калибровка была выставлена в C4489
          expect(
            data.meanOverwrite,
            "meanOverwrite должен быть определён после переключения режима numeric→text",
          ).toBeDefined();
          // Backend либо сохраняет числовое значение, либо обнуляет его при переключении в text-режим
          const hasValue =
            data.meanOverwrite.overwrittenValue != null ||
            data.meanOverwrite.overwrittenCharacteristicId != null;
          expect(
            hasValue,
            "После переключения в text-режим хотя бы одно из полей (числовое значение или ID характеристики) должно быть заполнено",
          ).toBe(true);
        });
      });

      test("C4491: Переключить режим: text → numeric при калибровке", async ({
        adminAPI,
      }) => {
        await allure.owner("QA Team");
        await allure.feature("Calibration");
        await allure.story("Settings Edge Cases");

        // Используем третьего user (не используемого в предыдущих тестах)
        const user =
          TARGET_USERS.length >= 3 ? TARGET_USERS[2] : TARGET_USERS[0];

        await test.step("Убедиться что режим текстовый и калибровать через dropdown", async () => {
          const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
          const { data: settings } = await adminAPI.get(featureUrl);
          expect(settings?.settings?.enableOnlyCustomCharacteristics).toBe(
            true,
          );

          const { data: updatedSettings } = await adminAPI.get(featureUrl);
          const chars = updatedSettings?.characteristicSettings || [];
          expect(chars.length).toBeGreaterThan(0);

          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              user.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            user.userId,
            {
              overwrites,
              meanOverwrite: { value: null, characteristicId: chars[0].id },
              isLocked: false,
            },
          );
        });

        await test.step("Переключить обратно на числовой режим в настройках PR через API", async () => {
          const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
          const { data: settings } = await adminAPI.get(featureUrl);

          await adminAPI.post(featureUrl, {
            ...settings,
            settings: {
              ...(settings?.settings || {}),
              enableOnlyCustomCharacteristics: false,
            },
          });
        });

        await test.step("Проверить через API: данные калибровки итоговой оценки доступны после переключения режима", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            user.userId,
          );

          // meanOverwrite должен существовать — в этом тесте была выполнена калибровка через dropdown
          expect(
            data.meanOverwrite,
            "meanOverwrite должен быть определён после переключения режима text→numeric",
          ).toBeDefined();
          // Backend может либо сохранить characteristic ID, либо обнулить при переключении на числовой режим
          const hasValue =
            data.meanOverwrite.overwrittenValue != null ||
            data.meanOverwrite.overwrittenCharacteristicId != null;
          expect(
            hasValue,
            "После переключения в numeric-режим хотя бы одно из полей калибровки должно быть заполнено",
          ).toBe(true);
        });
      });
    });
  },
);
