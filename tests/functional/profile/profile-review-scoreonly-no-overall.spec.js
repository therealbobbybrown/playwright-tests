// tests/functional/profile/profile-review-scoreonly-no-overall.spec.js
// C####: Сотрудник не видит итоговую оценку при notShowAverage=true (тоггл "отображать общую оценку" отключён)
//
// Seed: создаёт PR через PerformanceReviewSeedHelper → характеристики → калибровка
// meanOverwrite с characteristicId → stop → history API содержит characteristic.title.
// Дополнительно включает notShowAverage=true, чтобы скрыть итоговую оценку.

import { test as baseTest, expect } from "../../fixtures/auth.js";
import { ProfileEmployeeReviewPage } from "../../../pages/ProfileEmployeeReviewPage.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../utils/api/index.js";
import { PerformanceReviewSeedHelper } from "../../utils/seed/PerformanceReviewSeedHelper.js";
import {
  saveSettings,
  restoreSettings,
  patchStatisticsSettings,
} from "../../utils/StatisticsSettingsHelper.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

const test = baseTest.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

/**
 * Включить калибровку + характеристики через feature URL.
 * Возвращает characteristicSettings с ID-ами.
 */
async function setupCalibrationCharacteristics(prAPI, prId) {
  const featureUrl = `/manager/performance-reviews/${prId}/statistics/settings/?feature=statisticsSettings`;
  const { data: settings } = await prAPI.get(featureUrl);
  await prAPI.post(featureUrl, {
    ...settings,
    settings: {
      ...(settings?.settings || {}),
      enableCalibration: true,
      enableResponsesOverwriting: true,
      enableCustomCharacteristics: true,
      enableOnlyCustomCharacteristics: false,
      useOnlyHeadReceiver: true,
    },
    characteristicSettings: [
      { threshold: 33, title: "Низко", category: "negative" },
      { threshold: 66, title: "Средне", category: "neutral" },
      { threshold: 100, title: "Высоко", category: "positive" },
    ],
  });
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

test.describe(
  "Профиль сотрудника — скрытие итоговой оценки (notShowAverage)",
  {
    tag: [
      "@profile",
      "@performance-review",
      "@ui",
      "@regression",
      "@scoreOnly",
    ],
  },
  () => {
    /** PR с характеристикой (seed или найденный) */
    let charPrId = null;
    let charPrTitle = null;
    let charLabel = null;
    let userId = null;
    let originalAccess = null;
    let savedSettings = null;
    /** true если PR создан seed'ом (нужен cleanup) */
    let seededPr = false;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);

      // 1. Получить userId через JWT
      const userAPI = new PerformanceReviewAPI(request);
      const { email: userEmail, password: userPassword } =
        getCredentials("user");
      await userAPI.signIn(userEmail, userPassword);

      const tokenParts = userAPI.token?.split(".");
      if (tokenParts?.length === 3) {
        try {
          let b64 = tokenParts[1].replace(/-/g, "+").replace(/_/g, "/");
          while (b64.length % 4) b64 += "=";
          const payload = JSON.parse(Buffer.from(b64, "base64").toString());
          userId = payload.userId || payload.sub;
        } catch {
          // fallback
        }
      }
      if (!userId) throw new Error("Не удалось получить userId для USER");

      // 2. Admin API
      const adminAPI = new PerformanceReviewAPI(request);
      const { email: adminEmail, password: adminPassword } =
        getCredentials("admin");
      await adminAPI.signIn(adminEmail, adminPassword);

      // 3. Быстрый путь: найти существующий PR с characteristic
      const histUrl = `/private/performance-reviews/history/?status=all&targetUserId=${userId}&sortBy=dateStart&orderBy=DESC&limit=20&offset=0`;
      const { data: histData } = await adminAPI.get(histUrl);
      const items = histData?.items || [];

      const existing = items.find(
        (item) =>
          item.performanceReview?.status === "complete" &&
          item.finalGrade?.characteristic?.title,
      );

      if (existing) {
        charPrId = existing.performanceReview.id;
        charPrTitle = existing.performanceReview.title;
        charLabel = existing.finalGrade.characteristic.title;

        // Запомнить доступ для restore
        const { data: tuData } = await adminAPI.getStatisticsTargetUsers(
          charPrId,
          { targetUserId: userId, limit: 1, offset: 0 },
        );
        const tuItem = tuData?.items?.[0];
        originalAccess = {
          resultAccess: tuItem?.resultAccess || "head",
          contentAccess: tuItem?.contentAccess || "final",
        };

        // Сохранить оригинальные настройки статистики
        savedSettings = await saveSettings(adminAPI, charPrId);

        // Включить notShowAverage
        await patchStatisticsSettings(adminAPI, charPrId, {
          notShowAverage: true,
        });

        console.log(
          `Найден существующий PR с характеристикой: id=${charPrId}, "${charPrTitle}", ` +
            `label="${charLabel}", notShowAverage=true`,
        );
        return;
      }

      // 4. Seed: создать PR → характеристики → калибровка → stop
      console.log(
        "Нет существующего PR с характеристикой — создаём через seed...",
      );

      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");

      const pr = await seed.seedDraftPR();
      charPrId = pr.id;
      charPrTitle = pr.title;
      seededPr = true;
      if (!charPrId) throw new Error("Не удалось создать PR");

      // Включить характеристики + калибровку через feature URL
      const charSettings = await setupCalibrationCharacteristics(
        adminAPI,
        charPrId,
      );
      const highChar = charSettings.find((c) => c.title === "Высоко");
      if (!highChar?.id) {
        throw new Error(
          "Не удалось получить characteristicId после setupCalibrationCharacteristics",
        );
      }
      const characteristicId = highChar.id;

      // Добавить USER как target, привязать анкеты, запустить
      await seed.addTargetUsers(charPrId, [userId]);
      await seed.attachAssessments(charPrId);

      const { response: startResp } = await seed.prAPI.start(charPrId);
      if (!startResp.ok()) {
        throw new Error(
          `Не удалось запустить PR: ${await startResp.text()}`,
        );
      }

      // Получить revisionId
      const { data: revision } = await adminAPI.getLastRevision(charPrId);
      const revisionId = revision?.id;
      if (!revisionId) throw new Error("Не удалось получить revisionId");

      // Заполнить анкеты
      await seed.fillQuestionnaires(charPrId);

      // Прогреть кэш
      await warmUpCache(adminAPI, charPrId, revisionId, [userId]);

      // Откалибровать — meanOverwrite с characteristicId
      const { data: owData } = await adminAPI.getResponseOverwritesData(
        charPrId,
        revisionId,
        userId,
      );
      if (!owData) {
        throw new Error(
          "getResponseOverwritesData вернул пустые данные — калибровка недоступна",
        );
      }

      const { response: calibResp } = await adminAPI.overwriteResponsesValues(
        charPrId,
        revisionId,
        userId,
        {
          overwrites: owData?.overwrites || [],
          meanOverwrite: { value: null, characteristicId },
          isLocked: true,
        },
      );
      if (!calibResp.ok()) {
        throw new Error(
          `overwriteResponsesValues failed: ${calibResp.status()} ${await calibResp.text()}`,
        );
      }

      // Остановить PR (notShowAverage применяется ПОСЛЕ остановки и проверки)
      const { response: stopResp } = await adminAPI.stop(charPrId);
      if (!stopResp.ok()) {
        throw new Error(
          `Не удалось остановить PR: ${await stopResp.text()}`,
        );
      }

      // Подождать обработки и проверить characteristic в history
      await new Promise((r) => setTimeout(r, 3000));

      const { data: histAfter } = await adminAPI.get(histUrl);
      const afterItems = histAfter?.items || [];
      const seeded = afterItems.find(
        (item) =>
          item.performanceReview?.id === charPrId &&
          item.finalGrade?.characteristic?.title,
      );

      if (!seeded) {
        await new Promise((r) => setTimeout(r, 5000));
        const { data: histRetry } = await adminAPI.get(histUrl);
        const retryItems = histRetry?.items || [];
        const retryFound = retryItems.find(
          (item) =>
            item.performanceReview?.id === charPrId &&
            item.finalGrade?.characteristic?.title,
        );
        if (!retryFound) {
          const fallback = retryItems.find(
            (item) => item.performanceReview?.id === charPrId,
          );
          charLabel = fallback?.finalGrade?.characteristic?.title || null;
          if (!charLabel) {
            throw new Error(
              `Seed PR ${charPrId} создан, но characteristic.title не появилась в history`,
            );
          }
        } else {
          charLabel = retryFound.finalGrade.characteristic.title;
        }
      } else {
        charLabel = seeded.finalGrade.characteristic.title;
      }

      // Включить notShowAverage ПОСЛЕ проверки characteristic в history
      savedSettings = await saveSettings(adminAPI, charPrId);
      await patchStatisticsSettings(adminAPI, charPrId, {
        notShowAverage: true,
      });

      // Запомнить доступ
      const { data: tuData } = await adminAPI.getStatisticsTargetUsers(
        charPrId,
        { targetUserId: userId, limit: 1, offset: 0 },
      );
      const tuItem = tuData?.items?.[0];
      originalAccess = {
        resultAccess: tuItem?.resultAccess || "head",
        contentAccess: tuItem?.contentAccess || "final",
      };

      console.log(
        `Seed PR создан: id=${charPrId}, "${charPrTitle}", ` +
          `label="${charLabel}", notShowAverage=true`,
      );
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PROFILE, "ScoreOnly No Overall Score");
    });

    test(
      "C####: Сотрудник не видит итоговую оценку при notShowAverage=true (тоггл «отображать общую оценку» отключён)",
      { tag: ["@critical"] },
      async ({ userAuth: userPage, prAPI }, testInfo) => {
        setSeverity("critical");
        test.slow();

        if (!charPrId) {
          throw new Error(
            "charPrId не создан в beforeAll — seed не отработал",
          );
        }

        const reviewPage = new ProfileEmployeeReviewPage(userPage, testInfo);

        // Установить scoreOnly на найденный PR
        await test.step("API: установить scoreOnly", async () => {
          const { response } = await prAPI.changeResultAccess(charPrId, {
            targetUsersAll: true,
            exceptTargetUsersIds: [],
            targetUsersIds: [],
            resultAccess: "user",
            contentAccess: "final",
            enableNotification: false,
            notificationMessage: "",
            includePdfLink: false,
          });
          expect(response.ok(), "changeResultAccess(scoreOnly)").toBe(true);
        });

        await test.step("Открыть профиль → Оценка сотрудника", async () => {
          const baseUrl = process.env.BASE_URL;
          await userPage.goto(
            new URL(
              `/ru/profile/${userId}/?tab=review`,
              baseUrl,
            ).toString(),
          );
          await reviewPage.assertOpened();
        });

        await test.step(
          "Итоговая оценка скрыта (notShowAverage=true)",
          async () => {
            const score = await reviewPage.getFinalScoreValue(charPrTitle);
            expect(
              score,
              "Итоговая оценка должна быть скрыта (notShowAverage=true)",
            ).toBeNull();

            console.log(
              `  Score=${score} (null = корректно, итоговая оценка скрыта)`,
            );
          },
        );

        await test.step("Кнопка «Результаты» отсутствует", async () => {
          await reviewPage.assertResultsButtonHidden(charPrTitle);
        });
      },
    );

    test.afterAll(async ({ request }) => {
      if (!charPrId) return;

      try {
        const api = new PerformanceReviewAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        // Восстановить оригинальные настройки статистики
        await restoreSettings(api, charPrId, savedSettings);
        console.log(
          `Восстановлены настройки статистики для PR ${charPrId}`,
        );

        // Восстановить оригинальный доступ
        if (originalAccess) {
          await api.changeResultAccess(charPrId, {
            targetUsersAll: true,
            exceptTargetUsersIds: [],
            targetUsersIds: [],
            ...originalAccess,
            enableNotification: false,
            notificationMessage: "",
            includePdfLink: false,
          });
          console.log(
            `Восстановлен оригинальный доступ для PR ${charPrId}`,
          );
        }

        // Cleanup seeded PR
        if (seededPr) {
          await api.archive(charPrId);
          await api.remove(charPrId);
          console.log(`Seed PR ${charPrId} удалён`);
        }
      } catch {
        // ignore
      }
    });
  },
);
