// tests/functional/performance-review/resume/pr-resume-employee-tasks-api.spec.js
// API тест: RESUME-074 (полный) — задачи видны после resume с перспективы сотрудника
// Верифицирует: receivers имеют назначенные анкеты, progress незавершён до заполнения,
// и пересчитывается после populateReview.

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
import { getTargetUserIds } from "../../../utils/api/test-helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe(
  "PR Resume — Employee Tasks Visibility",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Employee Tasks");
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
      "C7421: Задачи видны после resume — PR активен и progress обновляется",
      { tag: ["@normal"] },
      async ({ request, prAPI }) => {
        setSeverity("normal");
        test.setTimeout(240000);

        let prId, revisionId;
        let targetUserIds;

        // ----------------------------------------------------------------
        await test.step("Создать PR через CalibrationSeed (self + head, 2 участника, анкеты НЕ заполнены)", async () => {
          const calSeed = new CalibrationSeed(request);
          await calSeed.init();

          const result = await calSeed.seedWithDirections({
            directions: { self: true, head: true },
            targetUsersCount: 2,
            receiversPerDirection: 1,
            fillQuestionnaires: false,
          });
          prId = result.prId;
          createdReviewId = prId;

          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);

          // Остановить перед resume
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
          console.log(`✓ PR ${prId} создан (без заполнения) и остановлен`);
        });

        // ----------------------------------------------------------------
        await test.step("Resume PR → статус active", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { response: getResp, data: prData } = await prAPI.getById(prId);
          assertSuccessStatus(getResp);
          expect(prData.status, "Статус после resume должен быть active").toBe(
            "active",
          );
          console.log(`✓ PR ${prId} возобновлён, статус: ${prData.status}`);
        });

        // ----------------------------------------------------------------
        await test.step("Получить revisionId после resume", async () => {
          const { data: revision } = await prAPI.getLastRevision(prId);
          expect(
            revision,
            "Ревизия должна существовать после resume",
          ).toBeDefined();
          revisionId = revision.id;
          expect(typeof revisionId).toBe("number");
          expect(revisionId).toBeGreaterThan(0);
          console.log(`✓ revisionId после resume: ${revisionId}`);
        });

        // ----------------------------------------------------------------
        await test.step("Receiver users назначены — анкеты существуют после resume", async () => {
          const { response, data: recData } = await prAPI.getReceiverUsers(
            prId,
            { limit: 100 },
          );
          assertSuccessStatus(response);

          const items = recData?.items || recData || [];
          expect(
            items.length,
            "Должен быть хотя бы один receiver user после resume",
          ).toBeGreaterThan(0);

          // Каждый receiver user должен иметь идентифицируемый ID
          for (const r of items) {
            const receiverId =
              r.id || r.userId || r.receiverUserId || r.user?.id;
            expect(
              typeof receiverId,
              "Каждый receiver user должен иметь числовой ID",
            ).toBe("number");
            expect(receiverId).toBeGreaterThan(0);
          }

          console.log(`✓ Receiver users после resume: ${items.length}`);
        });

        // ----------------------------------------------------------------
        await test.step("Target users progress: незаполненные задачи видны (completed < total)", async () => {
          targetUserIds = await getTargetUserIds(prAPI, prId);
          expect(
            targetUserIds.length,
            "У resumed PR должен быть хотя бы один target user",
          ).toBeGreaterThan(0);

          const { response, data: progressData } =
            await prAPI.getTargetUsersProgress(prId, {
              revisionId,
              usersIds: targetUserIds,
            });
          assertSuccessStatus(response);

          const items = progressData?.items || progressData || [];
          expect(
            items.length,
            "Прогресс должен содержать записи по target users",
          ).toBeGreaterThan(0);

          // Каждая запись должна иметь корректный targetUserId
          for (const entry of items) {
            expect(
              entry.targetUserId,
              "Каждая запись прогресса должна содержать targetUserId",
            ).toBeGreaterThan(0);
            expect(typeof entry.total, "Поле total должно быть числом").toBe(
              "number",
            );
            expect(
              typeof entry.completed,
              "Поле completed должно быть числом",
            ).toBe("number");
          }

          // Анкеты не заполнены — completed < total для хотя бы одного
          const hasIncomplete = items.some(
            (entry) => entry.completed < entry.total,
          );
          expect(
            hasIncomplete,
            "После resume без заполнения хотя бы одна запись должна иметь completed < total",
          ).toBe(true);

          console.log(
            `✓ Target users progress: ${items.length} записей, незаполненные есть: ${hasIncomplete}`,
          );
          for (const entry of items) {
            console.log(
              `  - targetUserId=${entry.targetUserId}: completed=${entry.completed}/${entry.total}, selfCompleted=${entry.selfCompleted}/${entry.selfTotal}`,
            );
          }
        });

        // ----------------------------------------------------------------
        await test.step("Receiver users progress: задачи у receivers также незавершены до заполнения", async () => {
          // Получить IDs receiver users для проверки их прогресса
          const { data: recData } = await prAPI.getReceiverUsers(prId, {
            limit: 100,
          });
          const recItems = recData?.items || recData || [];
          const receiverIds = recItems.map(
            (r) => r.id || r.userId || r.receiverUserId || r.user?.id,
          );
          expect(receiverIds.length).toBeGreaterThan(0);

          const { response, data: recProgressData } =
            await prAPI.getReceiverUsersProgress(prId, {
              revisionId,
              usersIds: receiverIds,
            });
          assertSuccessStatus(response);

          const items = recProgressData?.items || recProgressData || [];
          expect(
            items.length,
            "Прогресс receivers должен содержать записи",
          ).toBeGreaterThan(0);

          // Receivers ещё не заполняли —
          // API shape: { receiverUserId, assessmentsCount, completeResponsesCount, completeResponsesPercent }
          // Незавершено когда: assessmentsCount > 0 И completeResponsesCount < assessmentsCount
          const hasIncompleteReceiver = items.some((entry) => {
            // assessmentsCount > 0 означает анкета назначена
            const total = entry.assessmentsCount ?? entry.total ?? 0;
            const completed =
              entry.completeResponsesCount ?? entry.completed ?? 0;
            return total > 0 && completed < total;
          });
          expect(
            hasIncompleteReceiver,
            "Хотя бы один receiver должен иметь незавершённые задачи (assessmentsCount > 0, completeResponsesCount < assessmentsCount)",
          ).toBe(true);

          console.log(
            `✓ Receiver users progress: ${items.length} записей, незаполненные есть: ${hasIncompleteReceiver}`,
          );
          for (const entry of items.slice(0, 5)) {
            console.log(
              `  - receiverUserId=${entry.receiverUserId ?? entry.userId}: assessments=${entry.assessmentsCount ?? entry.total}, completed=${entry.completeResponsesCount ?? entry.completed}`,
            );
          }
        });

        // ----------------------------------------------------------------
        await test.step("Заполнить анкеты через populateReview (сотрудники выполняют задачи)", async () => {
          const settings = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };

          let filled = 0;
          // populateReview заполняет по одной анкете за вызов,
          // повторяем до тех пор пока есть незаполненные или лимит исчерпан
          for (let i = 0; i < 50; i++) {
            const { response } = await prAPI.populateReview(prId, settings, {
              timeout: 120000,
            });
            if (response.ok()) {
              filled++;
              await new Promise((r) => setTimeout(r, 500));
            } else {
              // Нет больше незаполненных анкет
              break;
            }
          }

          expect(
            filled,
            "populateReview должен заполнить хотя бы одну анкету после resume",
          ).toBeGreaterThan(0);
          console.log(`✓ Заполнено анкет после resume: ${filled}`);
        });

        // ----------------------------------------------------------------
        await test.step("Target users progress обновился — completed увеличился после заполнения", async () => {
          const { response, data: progressData } =
            await prAPI.getTargetUsersProgress(prId, {
              revisionId,
              usersIds: targetUserIds,
            });
          assertSuccessStatus(response);

          const items = progressData?.items || progressData || [];
          expect(
            items.length,
            "Прогресс должен содержать записи после заполнения",
          ).toBeGreaterThan(0);

          // После заполнения хотя бы один target user должен иметь completed > 0
          const hasCompleted = items.some((entry) => entry.completed > 0);
          expect(
            hasCompleted,
            "После populateReview хотя бы один target user должен иметь completed > 0",
          ).toBe(true);

          console.log(
            `✓ Progress обновился после заполнения: ${items.length} записей`,
          );
          for (const entry of items) {
            console.log(
              `  - targetUserId=${entry.targetUserId}: completed=${entry.completed}/${entry.total}`,
            );
          }
        });

        // ----------------------------------------------------------------
        await test.step("PR в списке активных — виден как задача (статус active)", async () => {
          const { response, data } = await prAPI.getList();
          assertSuccessStatus(response);

          const items = data?.items || data || [];
          const found = items.find((pr) => pr.id === prId);
          expect(
            found,
            `PR id=${prId} должен присутствовать в списке после resume`,
          ).toBeTruthy();
          expect(
            found.status,
            "Статус PR в списке после resume должен быть active",
          ).toBe("active");
          console.log(
            `✓ PR ${prId} в списке активных, статус: ${found.status}`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Завершить PR", async () => {
          const { response } = await prAPI.stop(prId);
          assertSuccessStatus(response);
          console.log(`✓ PR ${prId} завершён`);
        });
      },
    );
  },
);
