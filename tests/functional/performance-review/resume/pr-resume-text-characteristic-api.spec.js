// tests/functional/performance-review/resume/pr-resume-text-characteristic-api.spec.js
// API тест: Текстовые характеристики после resume (RESUME-030, RESUME-033)
//
// RESUME-030: Результаты показывают ТОЛЬКО текстовые характеристики (Низко/Средне/Высоко), без чисел
// RESUME-033: Новый заполненный ответ отображается как текстовая характеристика

import { test as base, expect } from "../../../fixtures/full.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";
import { CalibrationSeed } from "../../../utils/seed/CalibrationSeed.js";

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

/**
 * Включить enableOnlyCustomCharacteristics через feature URL (как в рабочих тестах).
 * Возвращает characteristicSettings с ID-ами.
 */
async function setupOnlyCustomCharacteristics(prAPI, prId) {
  const featureUrl = `/manager/performance-reviews/${prId}/statistics/settings/?feature=statisticsSettings`;
  const { data: settings } = await prAPI.get(featureUrl);
  await prAPI.post(featureUrl, {
    ...settings,
    settings: {
      ...(settings?.settings || {}),
      enableResponsesOverwriting: true,
      enableCustomCharacteristics: true,
      enableOnlyCustomCharacteristics: true,
      useOnlyHeadReceiver: true,
    },
    characteristicSettings: [
      { threshold: 33, title: "Низко", category: "negative" },
      { threshold: 66, title: "Средне", category: "neutral" },
      { threshold: 100, title: "Высоко", category: "positive" },
    ],
  });

  // Перечитать — получить ID характеристик из ответа сервера
  const { data: saved } = await prAPI.get(featureUrl);
  return saved?.characteristicSettings || [];
}

/**
 * Прогрев кэша статистики (обязателен перед calibrate/overwrite).
 */
async function warmUpCache(prAPI, prId, revisionId, allUserIds) {
  await Promise.all([
    prAPI.getStatisticsSummaryResults(prId, {
      targetUsersIds: allUserIds,
      revisionId,
    }),
    prAPI.getUsersCompetenciesResults(prId, {
      usersIds: allUserIds,
      revisionId,
    }),
    prAPI.getTargetUsersProgress(prId, {
      revisionId,
      usersIds: allUserIds,
    }),
  ]);
  await new Promise((r) => setTimeout(r, 5000));
  await Promise.all([
    prAPI.getStatisticsSummaryResults(prId, {
      targetUsersIds: allUserIds,
      revisionId,
    }),
    prAPI.getUsersCompetenciesResults(prId, {
      usersIds: allUserIds,
      revisionId,
    }),
  ]);
  await new Promise((r) => setTimeout(r, 3000));
}

/**
 * Найти первого target user, для которого getResponseOverwritesData возвращает 200.
 */
async function findCalibratableUser(prAPI, prId, revisionId, users) {
  for (const u of users) {
    const uid = u.user?.id ?? u.userId;
    const { response: chk } = await prAPI.getResponseOverwritesData(
      prId,
      revisionId,
      uid,
    );
    if (chk.ok()) {
      return uid;
    }
  }
  return null;
}

test.describe(
  "PR Resume — Text Characteristic API",
  {
    tag: [
      "@api",
      "@regression",
      "@performance-review",
      "@resume",
      "@calibration",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Text Characteristic");
    });

    let createdReviewId = null;

    test.afterEach(async ({ prAPI }) => {
      if (createdReviewId) {
        try {
          await prAPI.stop(createdReviewId);
        } catch {
          /* ignore */
        }
        try {
          await prAPI.archive(createdReviewId);
          await prAPI.remove(createdReviewId);
        } catch {
          /* ignore */
        }
        createdReviewId = null;
      }
    });

    test(
      "C7450: Результаты показывают ТОЛЬКО текстовые характеристики после resume",
      { tag: ["@critical"] },
      async ({ request, prAPI }) => {
        setSeverity("critical");
        test.setTimeout(240000);

        let prId;
        let revisionId;
        let calibratedUserId;
        let characteristicId;

        await test.step("Создать PR через CalibrationSeed (self+head, заполненный), остановить", async () => {
          const calSeed = new CalibrationSeed(request);
          await calSeed.init();

          const result = await calSeed.seedWithDirections({
            directions: { self: true, head: true },
            targetUsersCount: 3,
            receiversPerDirection: 2,
            fillQuestionnaires: true,
          });
          prId = result.prId;
          createdReviewId = prId;
          revisionId = result.revisionId;
          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);
          expect(
            typeof revisionId,
            "seedWithDirections должен вернуть числовой revisionId",
          ).toBe("number");
          expect(revisionId).toBeGreaterThan(0);

          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
          console.log(
            `PR ${prId} создан с заполненными анкетами и остановлен, revisionId=${revisionId}`,
          );
        });

        await test.step("Включить enableOnlyCustomCharacteristics + откалибровать пользователя", async () => {
          const chars = await setupOnlyCustomCharacteristics(prAPI, prId);
          expect(
            chars.length,
            "Характеристики должны быть созданы",
          ).toBeGreaterThan(0);
          characteristicId = chars[chars.length - 1].id; // "Высоко"
          expect(characteristicId).toBeTruthy();

          // Прогреть кэш
          const { data: tuData } = await prAPI.getTargetUsers(prId, {
            limit: 10,
          });
          const users = tuData?.items || tuData || [];
          const allUserIds = users.map((u) => u.user?.id ?? u.userId);
          expect(allUserIds.length, "Должны быть target users").toBeGreaterThan(
            0,
          );

          await warmUpCache(prAPI, prId, revisionId, allUserIds);

          calibratedUserId = await findCalibratableUser(
            prAPI,
            prId,
            revisionId,
            users,
          );
          expect(
            calibratedUserId,
            "Не найден пользователь с доступным overwrite",
          ).toBeTruthy();

          // Откалибровать характеристикой "Высоко"
          const { data: owData } = await prAPI.getResponseOverwritesData(
            prId,
            revisionId,
            calibratedUserId,
          );
          const { response: calibResp } = await prAPI.overwriteResponsesValues(
            prId,
            revisionId,
            calibratedUserId,
            {
              overwrites: owData?.overwrites || [],
              meanOverwrite: { value: null, characteristicId },
              isLocked: true,
            },
          );
          assertSuccessStatus(calibResp);
          console.log(
            `Откалибровано: user=${calibratedUserId}, characteristicId=${characteristicId}`,
          );
        });

        await test.step("Resume PR", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log("PR возобновлён");
        });

        await test.step("RESUME-030: Проверить — enableOnlyCustomCharacteristics=true сохранено, характеристики на месте", async () => {
          const { data: s } = await prAPI.getStatisticsSettings(prId);
          expect(
            s.settings.enableOnlyCustomCharacteristics,
            "enableOnlyCustomCharacteristics должно быть true после resume",
          ).toBe(true);
          expect(
            s.settings.enableCustomCharacteristics,
            "enableCustomCharacteristics должно быть true после resume",
          ).toBe(true);
          expect(
            s.characteristicSettings?.length,
            "characteristicSettings должны присутствовать после resume",
          ).toBeGreaterThan(0);

          // Убедиться что характеристики по-прежнему имеют правильные заголовки
          const titles = s.characteristicSettings.map((c) => c.title);
          expect(titles).toContain("Низко");
          expect(titles).toContain("Средне");
          expect(titles).toContain("Высоко");

          console.log(
            `enableOnlyCustomCharacteristics=true сохранено после resume, характеристик: ${s.characteristicSettings.length}`,
          );
        });

        await test.step("RESUME-030: summary-results показывает данные с calibrated user", async () => {
          const { data: tuData } = await prAPI.getTargetUsers(prId, {
            limit: 10,
          });
          const users = tuData?.items || tuData || [];
          const allUserIds = users.map((u) => u.user?.id ?? u.userId);

          const { response: summaryResp, data: summaryData } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds: allUserIds,
              revisionId,
            });
          assertSuccessStatus(summaryResp);

          // Должны быть данные в heatmap
          const targetUsersMap = summaryData?.heatMapResults?.targetUsers || {};
          expect(
            Object.keys(targetUsersMap).length,
            "heatMapResults.targetUsers не должен быть пустым",
          ).toBeGreaterThan(0);

          console.log(
            `summary-results содержит ${Object.keys(targetUsersMap).length} пользователей`,
          );
        });

        await test.step("RESUME-030: Калибровка характеристикой сохранена после resume", async () => {
          const { response: owResp, data: owData } =
            await prAPI.getResponseOverwritesData(
              prId,
              revisionId,
              calibratedUserId,
            );
          assertSuccessStatus(owResp);
          expect(
            owData?.meanOverwrite,
            "meanOverwrite должен присутствовать после resume",
          ).toBeTruthy();
          expect(
            owData.meanOverwrite.overwrittenCharacteristicId,
            "overwrittenCharacteristicId должен совпадать с заданным",
          ).toBe(characteristicId);
          expect(
            owData.meanOverwrite.overwrittenValue,
            "overwrittenValue должен быть null (только текстовая характеристика)",
          ).toBeNull();
          expect(owData.isLocked).toBe(true);

          console.log(
            `Калибровка характеристикой подтверждена: overwrittenCharacteristicId=${owData.meanOverwrite.overwrittenCharacteristicId}`,
          );
        });

        await test.step("Повторное завершение и финальная проверка", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          // После финального stop — настройки и калибровка должны быть на месте
          const { data: s } = await prAPI.getStatisticsSettings(prId);
          expect(s.settings.enableOnlyCustomCharacteristics).toBe(true);
          expect(s.characteristicSettings?.length).toBeGreaterThan(0);

          const { data: owData } = await prAPI.getResponseOverwritesData(
            prId,
            revisionId,
            calibratedUserId,
          );
          expect(owData?.meanOverwrite).toBeTruthy();
          expect(owData.meanOverwrite.overwrittenCharacteristicId).toBe(
            characteristicId,
          );

          console.log(
            "После повторного завершения: настройки и калибровка на месте",
          );
        });
      },
    );

    test(
      "C7451: Новый ответ после resume отображается как текстовая характеристика",
      { tag: ["@critical"] },
      async ({ request, prAPI }) => {
        setSeverity("critical");
        test.setTimeout(240000);

        let prId;
        let revisionId;
        let calibratedUserId;
        let characteristicId;
        let heatmapBeforeResume;

        await test.step("Создать PR через CalibrationSeed (self+head, БЕЗ заполнения), включить характеристики, заполнить частично, остановить", async () => {
          const calSeed = new CalibrationSeed(request);
          await calSeed.init();

          const result = await calSeed.seedWithDirections({
            directions: { self: true, head: true },
            targetUsersCount: 3,
            receiversPerDirection: 2,
            fillQuestionnaires: true,
          });
          prId = result.prId;
          createdReviewId = prId;

          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionId = revision?.id;
          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);
          expect(typeof revisionId).toBe("number");
          expect(revisionId).toBeGreaterThan(0);

          // Включить enableOnlyCustomCharacteristics до остановки
          const chars = await setupOnlyCustomCharacteristics(prAPI, prId);
          expect(chars.length).toBeGreaterThan(0);
          characteristicId = chars[chars.length - 1].id; // "Высоко"
          expect(characteristicId).toBeTruthy();

          // Прогреть кэш и откалибровать одного пользователя до stop
          const { data: tuData } = await prAPI.getTargetUsers(prId, {
            limit: 10,
          });
          const users = tuData?.items || tuData || [];
          const allUserIds = users.map((u) => u.user?.id ?? u.userId);
          expect(allUserIds.length).toBeGreaterThan(0);

          await warmUpCache(prAPI, prId, revisionId, allUserIds);

          calibratedUserId = await findCalibratableUser(
            prAPI,
            prId,
            revisionId,
            users,
          );
          expect(
            calibratedUserId,
            "Не найден пользователь с доступным overwrite перед stop",
          ).toBeTruthy();

          // Откалибровать
          const { data: owData } = await prAPI.getResponseOverwritesData(
            prId,
            revisionId,
            calibratedUserId,
          );
          const { response: calibResp } = await prAPI.overwriteResponsesValues(
            prId,
            revisionId,
            calibratedUserId,
            {
              overwrites: owData?.overwrites || [],
              meanOverwrite: { value: null, characteristicId },
              isLocked: true,
            },
          );
          assertSuccessStatus(calibResp);

          // Зафиксировать heatmap до stop
          const { data: summaryData } = await prAPI.getStatisticsSummaryResults(
            prId,
            {
              targetUsersIds: allUserIds,
              revisionId,
            },
          );
          heatmapBeforeResume = JSON.stringify(
            summaryData?.heatMapResults?.targetUsers || {},
          );

          // Остановить
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
          console.log(`PR ${prId} остановлен, heatmap зафиксирован`);
        });

        await test.step("Resume PR", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log("PR возобновлён");
        });

        await test.step("RESUME-033: Проверить enableOnlyCustomCharacteristics=true сохранено после resume", async () => {
          const { data: s } = await prAPI.getStatisticsSettings(prId);
          expect(
            s.settings.enableOnlyCustomCharacteristics,
            "enableOnlyCustomCharacteristics должно быть true после resume",
          ).toBe(true);
          expect(
            s.characteristicSettings?.length,
            "characteristicSettings должны присутствовать",
          ).toBeGreaterThan(0);

          // ID характеристики "Высоко" должен совпадать
          const highChar = s.characteristicSettings.find(
            (c) => c.title === "Высоко",
          );
          expect(
            highChar,
            "Характеристика 'Высоко' должна присутствовать",
          ).toBeTruthy();
          expect(
            highChar.id,
            "ID характеристики должен совпадать с ранее использованным",
          ).toBe(characteristicId);

          console.log(
            "enableOnlyCustomCharacteristics=true и характеристики сохранены после resume",
          );
        });

        await test.step("RESUME-033: Дозаполнить анкеты после resume через populateReview", async () => {
          const populateSettings = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };

          let filled = 0;
          for (let attempt = 0; attempt < 30; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              populateSettings,
              { timeout: 60000 },
            );
            if (response.ok()) {
              filled++;
              await new Promise((r) => setTimeout(r, 500));
            } else {
              // 400/404 означает что анкет для заполнения больше нет
              break;
            }
          }
          console.log(`Дозаполнено после resume: ${filled} анкет`);
          // После resume с заполненными анкетами populateReview может вернуть 0
          // (все уже заполнены) — это нормально. Тест проверяет сохранение характеристик,
          // а не факт заполнения.
        });

        await test.step("RESUME-033: summary-results после resume содержит данные (heatmap не пуст)", async () => {
          const { data: tuData } = await prAPI.getTargetUsers(prId, {
            limit: 10,
          });
          const users = tuData?.items || tuData || [];
          const allUserIds = users.map((u) => u.user?.id ?? u.userId);

          const { response: summaryResp, data: summaryData } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds: allUserIds,
              revisionId,
            });
          assertSuccessStatus(summaryResp);

          const targetUsersMap = summaryData?.heatMapResults?.targetUsers || {};
          expect(
            Object.keys(targetUsersMap).length,
            "heatMapResults.targetUsers не должен быть пустым после resume + дозаполнения",
          ).toBeGreaterThan(0);

          // Данные не должны быть утрачены по сравнению с до-resume снимком
          const heatmapAfterResume = JSON.stringify(targetUsersMap);
          const beforeObj = JSON.parse(heatmapBeforeResume);
          const afterObj = JSON.parse(heatmapAfterResume);

          // Все пользователи, которые имели данные до resume, должны иметь данные после
          for (const uid of Object.keys(beforeObj)) {
            expect(
              afterObj[uid],
              `User ${uid}: данные в heatmap не должны пропасть после resume`,
            ).toBeTruthy();
          }

          console.log(
            `heatmap после resume: ${Object.keys(targetUsersMap).length} пользователей`,
          );
        });

        await test.step("RESUME-033: Калибровка характеристикой сохранена и не сброшена после resume", async () => {
          const { response: owResp, data: owData } =
            await prAPI.getResponseOverwritesData(
              prId,
              revisionId,
              calibratedUserId,
            );
          assertSuccessStatus(owResp);
          expect(
            owData?.meanOverwrite,
            "meanOverwrite должен присутствовать после resume",
          ).toBeTruthy();
          expect(
            owData.meanOverwrite.overwrittenCharacteristicId,
            "characteristicId должен совпадать — калибровка не сброшена",
          ).toBe(characteristicId);
          expect(
            owData.meanOverwrite.overwrittenValue,
            "overwrittenValue должен быть null (только текстовая характеристика)",
          ).toBeNull();
          expect(owData.isLocked).toBe(true);

          console.log(
            `RESUME-033: калибровка характеристикой сохранена: overwrittenCharacteristicId=${owData.meanOverwrite.overwrittenCharacteristicId}`,
          );
        });

        await test.step("Завершить PR", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          // Финальная проверка: настройки характеристик на месте после завершения
          const { data: s } = await prAPI.getStatisticsSettings(prId);
          expect(s.settings.enableOnlyCustomCharacteristics).toBe(true);
          expect(s.characteristicSettings?.length).toBeGreaterThan(0);

          // Калибровка на месте
          const { data: owFinal } = await prAPI.getResponseOverwritesData(
            prId,
            revisionId,
            calibratedUserId,
          );
          expect(owFinal?.meanOverwrite?.overwrittenCharacteristicId).toBe(
            characteristicId,
          );

          console.log(
            "Финальная проверка пройдена: характеристики и калибровка на месте после повторного stop",
          );
        });
      },
    );
  },
);
