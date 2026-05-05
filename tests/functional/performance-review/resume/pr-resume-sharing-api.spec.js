// tests/functional/performance-review/resume/pr-resume-sharing-api.spec.js
// API тест: Шаринг результатов + resume — resultAccess/contentAccess не сбрасываются после resume

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
import { getTargetUserIds } from "../../../utils/api/test-helpers.js";

/**
 * Прочитать текущие настройки доступа для каждого target user
 */
async function getAccessSnapshot(prAPI, prId) {
  const { response, data } = await prAPI.getTargetUsersForAccess(prId, {
    limit: 50,
    offset: 0,
  });
  assertSuccessStatus(response);

  const items = data?.items || data || [];
  const byUser = {};
  for (const item of items) {
    const uid = item.userId || item.user?.id || item.id;
    byUser[uid] = {
      resultAccess: item.resultAccess,
      contentAccess: item.contentAccess,
    };
  }
  return byUser;
}

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "PR Resume — Sharing Persistence",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Sharing");
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
      "C7448: ScoreOnly шаринг сохраняется после resume",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");
        test.setTimeout(180000);

        const { seedHelper } = prSeed;
        let prId, revisionId;
        let targetUserId;

        await test.step("Создать PR, заполнить, остановить", async () => {
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Шеринг только оценки"),
          });
          prId = pr.id;
          createdReviewId = prId;
          revisionId = pr.revisionId;

          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          expect(targetUsersIds.length).toBeGreaterThan(0);
          targetUserId = targetUsersIds[0];
        });

        await test.step("Расшарить scoreOnly одному пользователю", async () => {
          const { response } = await prAPI.changeResultAccess(prId, {
            targetUsersAll: false,
            exceptTargetUsersIds: [],
            targetUsersIds: [targetUserId],
            resultAccess: "user",
            contentAccess: "final",
            enableNotification: false,
            notificationMessage: "",
            includePdfLink: false,
          });
          assertSuccessStatus(response);

          // Верификация
          const accessMap = await getAccessSnapshot(prAPI, prId);
          expect(accessMap[targetUserId]?.resultAccess).toBe("user");
          expect(accessMap[targetUserId]?.contentAccess).toBe("final");
          console.log(
            `✓ ScoreOnly расшарен: user ${targetUserId} → resultAccess=user, contentAccess=final`,
          );
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
        });

        await test.step("scoreOnly настройки сохранены после resume", async () => {
          const accessMap = await getAccessSnapshot(prAPI, prId);
          expect(accessMap[targetUserId]?.resultAccess).toBe("user");
          expect(accessMap[targetUserId]?.contentAccess).toBe("final");
          console.log("✓ scoreOnly сохранён после resume");
        });

        await test.step("Повторное завершение — scoreOnly на месте", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const accessMap = await getAccessSnapshot(prAPI, prId);
          expect(accessMap[targetUserId]?.resultAccess).toBe("user");
          expect(accessMap[targetUserId]?.contentAccess).toBe("final");
          console.log("✓ scoreOnly сохранён после повторного завершения");
        });
      },
    );

    test(
      "C7449: Полный шаринг (finalAndResults) сохраняется после resume",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");
        test.setTimeout(180000);

        const { seedHelper } = prSeed;
        let prId;
        let allUserIds;

        await test.step("Создать PR, заполнить, остановить", async () => {
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Шеринг полного доступа"),
          });
          prId = pr.id;
          createdReviewId = prId;

          allUserIds = await getTargetUserIds(prAPI, prId);
          expect(allUserIds.length).toBeGreaterThan(0);
        });

        await test.step("Расшарить полный доступ ВСЕМ пользователям", async () => {
          const { response } = await prAPI.changeResultAccess(prId, {
            targetUsersAll: true,
            exceptTargetUsersIds: [],
            targetUsersIds: [],
            resultAccess: "user",
            contentAccess: "finalAndResults",
            enableNotification: false,
            notificationMessage: "",
            includePdfLink: false,
          });
          assertSuccessStatus(response);

          // Верификация всех
          const accessMap = await getAccessSnapshot(prAPI, prId);
          for (const uid of allUserIds) {
            expect(
              accessMap[uid]?.resultAccess,
              `User ${uid}: resultAccess должен быть 'user'`,
            ).toBe("user");
            expect(
              accessMap[uid]?.contentAccess,
              `User ${uid}: contentAccess должен быть 'finalAndResults'`,
            ).toBe("finalAndResults");
          }
          console.log(
            `✓ Полный шаринг расшарен: ${allUserIds.length} пользователям`,
          );
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);
        });

        await test.step("Полный шаринг сохранён у всех пользователей после resume", async () => {
          const accessMap = await getAccessSnapshot(prAPI, prId);
          for (const uid of allUserIds) {
            expect(accessMap[uid]?.resultAccess).toBe("user");
            expect(accessMap[uid]?.contentAccess).toBe("finalAndResults");
          }
          console.log(
            `✓ Полный шаринг сохранён после resume: ${allUserIds.length} пользователей`,
          );
        });

        await test.step("Повторное завершение — полный шаринг на месте", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const accessMap = await getAccessSnapshot(prAPI, prId);
          for (const uid of allUserIds) {
            expect(accessMap[uid]?.resultAccess).toBe("user");
            expect(accessMap[uid]?.contentAccess).toBe("finalAndResults");
          }
          console.log("✓ Полный шаринг сохранён после повторного завершения");
        });
      },
    );
  },
);
