// tests/functional/performance-review/resume/pr-resume-text-characteristics-api.spec.js
// API тест: Resume с enableOnlyCustomCharacteristics (RESUME-030..034)

import { test as base, expect } from "../../../fixtures/full.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import { TestDataHelper } from "../../../utils/TestDataHelper.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";
import {
  setupCharacteristics,
  DEFAULT_CHARACTERISTICS,
} from "../../../utils/StatisticsSettingsHelper.js";
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
  "PR Resume - Text-only Characteristics API",
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
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Text Characteristics");
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
      "C7452: EnableOnlyCustomCharacteristics сохраняется после resume",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");

        let prId;
        let revisionId;

        await test.step("Создать PR, запустить, заполнить, остановить", async () => {
          const { seedHelper } = prSeed;
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Текстовые характеристики возобновления"),
          });
          prId = pr.id;
          createdReviewId = prId;
          revisionId = pr.revisionId;
          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);
        });

        await test.step("Включить enableOnlyCustomCharacteristics через API", async () => {
          // Настроить характеристики (Низко/Средне/Высоко) + enableCustomCharacteristics
          await setupCharacteristics(prAPI, prId, DEFAULT_CHARACTERISTICS);

          // Дополнительно включить "только текстовые" (без числовых)
          const { data: current } = await prAPI.getStatisticsSettings(prId);
          const { response: updateResp } = await prAPI.updateStatisticsSettings(
            prId,
            {
              ...current,
              settings: {
                ...current.settings,
                enableOnlyCustomCharacteristics: true,
              },
            },
          );
          assertSuccessStatus(updateResp);

          // Проверить что настройка применилась
          const { data: updatedSettings } =
            await prAPI.getStatisticsSettings(prId);
          expect(updatedSettings.settings.enableOnlyCustomCharacteristics).toBe(
            true,
          );
          expect(
            updatedSettings.characteristicSettings?.length,
          ).toBeGreaterThan(0);
        });

        await test.step("Resume PR", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
        });

        await test.step("RESUME-032: Проверить enableOnlyCustomCharacteristics=true сохранилось", async () => {
          const { data: s } = await prAPI.getStatisticsSettings(prId);
          expect(s.settings.enableOnlyCustomCharacteristics).toBe(true);
          expect(s.characteristicSettings?.length).toBeGreaterThan(0);
          console.log(
            "✓ enableOnlyCustomCharacteristics=true сохранилось после resume",
          );
        });

        await test.step("RESUME-034: Завершить → настройка на месте", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { data: s } = await prAPI.getStatisticsSettings(prId);
          expect(s.settings.enableOnlyCustomCharacteristics).toBe(true);
          console.log(
            "✓ После повторного завершения enableOnlyCustomCharacteristics=true",
          );
        });
      },
    );

    test(
      "C7453: Калибровка характеристикой сохранена после stop+resume",
      { tag: ["@critical"] },
      async ({ request, prAPI }) => {
        setSeverity("critical");
        test.setTimeout(180000);

        let prId;
        let revisionId;
        let calibratedUserId;
        let characteristicId;

        await test.step("Создать PR через CalibrationSeed (self+head, заполненный)", async () => {
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
          console.log(`✓ PR ${prId}, revision ${revisionId}`);
        });

        await test.step("Включить характеристики + калибровку и откалибровать", async () => {
          // Настроить через feature URL (как в рабочих калибровочных тестах)
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

          // Перечитать настройки — получить ID характеристик
          const { data: saved } = await prAPI.get(featureUrl);
          const chars = saved?.characteristicSettings || [];
          expect(chars.length).toBeGreaterThan(0);
          characteristicId = chars[chars.length - 1].id; // "Высоко"

          // Получить target users
          const { data: tuData } = await prAPI.getTargetUsers(prId, {
            limit: 10,
          });
          const users = tuData?.items || tuData || [];
          const allUserIds = users.map((u) => u.user?.id ?? u.userId);

          // Warm-up: прогреть кеш receiver_progress
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

          // Найти доступного пользователя (контрольная группа → 403)
          for (const u of users) {
            const uid = u.user?.id ?? u.userId;
            const { response: chk } = await prAPI.getResponseOverwritesData(
              prId,
              revisionId,
              uid,
            );
            if (chk.ok()) {
              calibratedUserId = uid;
              break;
            }
          }
          expect(
            calibratedUserId,
            "Не найден пользователь с доступным overwrite",
          ).toBeTruthy();

          // Калибровать характеристикой (без числа)
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
            `✓ Откалибровано: user=${calibratedUserId}, char=${characteristicId}`,
          );
        });

        await test.step("Остановить и resume", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { response: resumeResp } = await prAPI.resume(prId);
          assertSuccessStatus(resumeResp);
        });

        await test.step("Проверить характеристики сохранены после resume", async () => {
          const { data: s } = await prAPI.getStatisticsSettings(prId);
          expect(s.settings.enableOnlyCustomCharacteristics).toBe(true);
          expect(s.characteristicSettings?.length).toBeGreaterThan(0);

          // Калибровка должна быть на месте
          const { response: owResp, data: owData } =
            await prAPI.getResponseOverwritesData(
              prId,
              revisionId,
              calibratedUserId,
            );
          assertSuccessStatus(owResp);
          expect(owData?.meanOverwrite).toBeTruthy();
          // API возвращает overwrittenCharacteristicId (в запросе — characteristicId)
          expect(owData.meanOverwrite.overwrittenCharacteristicId).toBe(
            characteristicId,
          );
          expect(owData.isLocked).toBe(true);
          console.log("✓ Калибровка характеристикой сохранена после resume");
        });
      },
    );
  },
);
