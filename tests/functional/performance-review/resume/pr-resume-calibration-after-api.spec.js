// tests/functional/performance-review/resume/pr-resume-calibration-after-api.spec.js
// API тест: Калибровка ПОСЛЕ resume — можно откалибровать в возобновлённой оценке,
// калибровка сохраняется при повторном завершении

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

test.describe(
  "PR Resume — Calibration After Resume",
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
      markAsAPITest(
        MODULES.PERFORMANCE_REVIEW,
        "Resume Calibration After Resume",
      );
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
      "C7411: Калибровка числом в возобновлённой оценке — сохраняется при повторном завершении",
      { tag: ["@critical"] },
      async ({ request, prAPI }) => {
        setSeverity("critical");
        test.setTimeout(240000);

        let prId, revisionId;
        let calibratedUserId;
        const calibratedValue = 3.5;
        let storedCalibratedValue; // нормализованное значение из API (0-1 range)

        await test.step("Создать PR через CalibrationSeed, остановить", async () => {
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

          // Остановить
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
          console.log(`✓ PR ${prId} создан и остановлен`);
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
        });

        await test.step("Включить калибровку + прогреть кэш", async () => {
          const featureUrl = `/manager/performance-reviews/${prId}/statistics/settings/?feature=statisticsSettings`;
          const { data: settings } = await prAPI.get(featureUrl);
          await prAPI.post(featureUrl, {
            ...settings,
            settings: {
              ...(settings?.settings || {}),
              enableResponsesOverwriting: true,
              enableCustomCharacteristics: true,
              useOnlyHeadReceiver: true,
            },
            characteristicSettings:
              settings?.characteristicSettings?.length > 0
                ? settings.characteristicSettings
                : [
                    {
                      threshold: 33,
                      title: "Низко",
                      category: "negative",
                    },
                    {
                      threshold: 66,
                      title: "Средне",
                      category: "neutral",
                    },
                    {
                      threshold: 100,
                      title: "Высоко",
                      category: "positive",
                    },
                  ],
          });

          // Warm-up: прогреваем кэш статистики (требуется для калибровки)
          const { data: tuData } = await prAPI.getTargetUsers(prId, {
            limit: 10,
          });
          const users = tuData?.items || tuData || [];
          const allUserIds = users.map((u) => u.user?.id ?? u.userId);

          // Первый раунд warmup
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
          // Второй раунд — иногда бэкенд пересчитывает после первого запроса
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

          // Найти доступного пользователя для калибровки
          const statuses = [];
          for (const u of users) {
            const uid = u.user?.id ?? u.userId;
            const { response: chk } = await prAPI.getResponseOverwritesData(
              prId,
              revisionId,
              uid,
            );
            statuses.push(`${uid}→${chk.status()}`);
            if (chk.ok()) {
              calibratedUserId = uid;
              break;
            }
          }
          console.log(`Overwrite доступность: ${statuses.join(", ")}`);
          expect(
            calibratedUserId,
            `Не найден пользователь с доступным overwrite (${statuses.join(", ")})`,
          ).toBeTruthy();
        });

        await test.step("Откалибровать числом после resume", async () => {
          const { data: owData } = await prAPI.getResponseOverwritesData(
            prId,
            revisionId,
            calibratedUserId,
          );

          const { response: calResp } = await prAPI.overwriteResponsesValues(
            prId,
            revisionId,
            calibratedUserId,
            {
              overwrites: owData?.overwrites || [],
              meanOverwrite: {
                value: calibratedValue,
                characteristicId: null,
              },
              isLocked: true,
            },
          );
          expect([200, 201]).toContain(calResp.status());
          console.log(
            `✓ Откалибровано: user ${calibratedUserId} → ${calibratedValue}`,
          );
        });

        await test.step("Проверить калибровку сохранилась", async () => {
          const { data: verifyData } = await prAPI.getResponseOverwritesData(
            prId,
            revisionId,
            calibratedUserId,
          );
          expect(verifyData.meanOverwrite).toBeDefined();
          // API нормализует в 0-1 (calibratedValue/rangeMax), проверяем число
          expect(typeof verifyData.meanOverwrite.overwrittenValue).toBe(
            "number",
          );
          // Запоминаем нормализованное значение для сравнения после stop → resume
          storedCalibratedValue = verifyData.meanOverwrite.overwrittenValue;
          expect(verifyData.isLocked).toBe(true);
          console.log(
            `✓ Калибровка верифицирована: overwrittenValue=${storedCalibratedValue}`,
          );
        });

        await test.step("Повторное завершение → resume → калибровка на месте", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          // Возобновляем чтобы проверить через API
          const { response: resumeResp } = await prAPI.resume(prId);
          assertSuccessStatus(resumeResp);

          const { data: afterData } = await prAPI.getResponseOverwritesData(
            prId,
            revisionId,
            calibratedUserId,
          );
          expect(afterData.meanOverwrite).toBeDefined();
          expect(afterData.meanOverwrite.overwrittenValue).toBe(
            storedCalibratedValue,
          );
          expect(afterData.isLocked).toBe(true);
          console.log("✓ Калибровка сохранена после повторного завершения");
        });
      },
    );

    test(
      "C7412: Калибровка характеристикой в возобновлённой оценке — сохраняется при повторном завершении",
      { tag: ["@critical"] },
      async ({ request, prAPI }) => {
        setSeverity("critical");
        test.setTimeout(240000);

        let prId, revisionId;
        let calibratedUserId;
        let characteristicId;

        await test.step("Создать PR через CalibrationSeed, остановить", async () => {
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

          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
          console.log(`✓ PR ${prId} создан и остановлен`);
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);
        });

        await test.step("Включить характеристики + калибровку + прогреть кэш", async () => {
          const featureUrl = `/manager/performance-reviews/${prId}/statistics/settings/?feature=statisticsSettings`;
          const { data: settings } = await prAPI.get(featureUrl);
          await prAPI.post(featureUrl, {
            ...settings,
            settings: {
              ...(settings?.settings || {}),
              enableResponsesOverwriting: true,
              enableCustomCharacteristics: true,
              useOnlyHeadReceiver: true,
            },
            characteristicSettings: [
              { threshold: 33, title: "Низко", category: "negative" },
              { threshold: 66, title: "Средне", category: "neutral" },
              { threshold: 100, title: "Высоко", category: "positive" },
            ],
          });

          // Перечитать — получить ID характеристик
          const { data: saved } = await prAPI.get(featureUrl);
          const chars = saved?.characteristicSettings || [];
          expect(chars.length).toBeGreaterThan(0);
          characteristicId = chars[chars.length - 1].id; // "Высоко"
          expect(characteristicId).toBeTruthy();

          // Warm-up (двойной — бэкенд может пересчитать после первого запроса)
          const { data: tuData } = await prAPI.getTargetUsers(prId, {
            limit: 10,
          });
          const users = tuData?.items || tuData || [];
          const allUserIds = users.map((u) => u.user?.id ?? u.userId);

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

          // Найти доступного пользователя
          const statuses2 = [];
          for (const u of users) {
            const uid = u.user?.id ?? u.userId;
            const { response: chk } = await prAPI.getResponseOverwritesData(
              prId,
              revisionId,
              uid,
            );
            statuses2.push(`${uid}→${chk.status()}`);
            if (chk.ok()) {
              calibratedUserId = uid;
              break;
            }
          }
          console.log(`Overwrite доступность: ${statuses2.join(", ")}`);
          expect(
            calibratedUserId,
            `Не найден пользователь с доступным overwrite (${statuses2.join(", ")})`,
          ).toBeTruthy();
        });

        await test.step("Откалибровать характеристикой после resume", async () => {
          const { data: owData } = await prAPI.getResponseOverwritesData(
            prId,
            revisionId,
            calibratedUserId,
          );

          const { response: calResp } = await prAPI.overwriteResponsesValues(
            prId,
            revisionId,
            calibratedUserId,
            {
              overwrites: owData?.overwrites || [],
              meanOverwrite: { value: null, characteristicId },
              isLocked: true,
            },
          );
          expect([200, 201]).toContain(calResp.status());
          console.log(
            `✓ Откалибровано характеристикой: user ${calibratedUserId} → charId ${characteristicId}`,
          );
        });

        await test.step("Проверить — характеристика сохранилась", async () => {
          const { data: verifyData } = await prAPI.getResponseOverwritesData(
            prId,
            revisionId,
            calibratedUserId,
          );
          expect(verifyData.meanOverwrite).toBeTruthy();
          expect(verifyData.meanOverwrite.overwrittenCharacteristicId).toBe(
            characteristicId,
          );
          expect(verifyData.isLocked).toBe(true);
          console.log(
            `✓ Характеристика верифицирована: overwrittenCharacteristicId=${verifyData.meanOverwrite.overwrittenCharacteristicId}`,
          );
        });

        await test.step("Повторное завершение → resume → характеристика на месте", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { response: resumeResp } = await prAPI.resume(prId);
          assertSuccessStatus(resumeResp);

          const { data: afterData } = await prAPI.getResponseOverwritesData(
            prId,
            revisionId,
            calibratedUserId,
          );
          expect(afterData.meanOverwrite).toBeTruthy();
          expect(afterData.meanOverwrite.overwrittenCharacteristicId).toBe(
            characteristicId,
          );
          console.log("✓ Характеристика сохранена после повторного завершения");
        });
      },
    );
  },
);
