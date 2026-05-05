/**
 * PR-225 / PR-234: Все назначенные коллеги и подчинённые получают анкеты
 *
 * Сценарии:
 * - PR-225: ВСЕ выбранные коллеги получили анкеты и заполнили их
 * - PR-234: ВСЕ подчинённые из структуры получили анкеты и заполнили их
 *
 * Данные: beforeAll создаёт PR с 4 направлениями, назначает 1 руководителя,
 * 3 коллег и 3 подчинённых, запускает и заполняет все анкеты.
 *
 * @tags @api @performance-review @filling @receivers @regression
 */
import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { getCredentials } from "../../../utils/credentials.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import {
  markAsAPITest,
  setSeverity,
  MODULES,
} from "../../../utils/allure-helpers.js";

const test = baseTest.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

/**
 * Сгруппировать ответы из summary по receiverType
 */
function getAnswersByDirection(data) {
  const result = {
    self: [],
    head: [],
    colleague: [],
    subordinate: [],
    other: [],
  };
  for (const assessment of data.assessments || []) {
    for (const question of assessment.questions || []) {
      for (const answer of question.answers || []) {
        const dir = answer.receiverType || "other";
        if (result[dir]) {
          result[dir].push(answer);
        } else {
          result.other.push(answer);
        }
      }
    }
  }
  return result;
}

test.describe(
  "Все назначенные получают анкеты",
  {
    tag: [
      "@api",
      "@performance-review",
      "@filling",
      "@receivers",
      "@regression",
    ],
  },
  () => {
    /** @type {number} */ let testPrId;
    /** @type {number} */ let testTargetUserId;
    /** @type {string} */ let testRevisionId;
    /** @type {Object} */ let summaryData;
    /** @type {Array} */ let receiversList;
    /** @type {number[]} */ let assignedColleagueIds;
    /** @type {number[]} */ let assignedSubordinateIds;
    /** @type {number} */ let assignedHeadId;

    test.beforeAll(async ({ prSeed }) => {
      test.setTimeout(600_000);
      const prAPI = prSeed.prAPI;

      // 1. Получить пользователей (минимум 8: 1 target + 1 head + 3 colleague + 3 subordinate)
      const users = await prSeed.getAvailableUsers();
      if (users.length < 8) {
        throw new Error(`Нужно >= 8 пользователей, доступно ${users.length}`);
      }
      console.log(`📋 Доступно ${users.length} пользователей`);

      // 2. Создать черновик PR с 4 направлениями
      const directions = [
        {
          id: null,
          receiverType: "self",
          isSelected: true,
          title: null,
          description: null,
        },
        {
          id: null,
          receiverType: "head",
          isSelected: true,
          title: null,
          description: null,
        },
        {
          id: null,
          receiverType: "subordinate",
          isSelected: true,
          title: null,
          description: null,
        },
        {
          id: null,
          receiverType: "colleague",
          isSelected: true,
          title: null,
          description: null,
        },
      ];
      const pr = await prSeed.seedDraftPR({ directions });
      testPrId = pr.id;
      console.log(`📝 Черновик: ${testPrId}`);

      // 3. Добавить target user
      await prSeed.addTargetUsers(pr.id, [users[0].id]);
      const { data: tuData } = await prAPI.getTargetUsers(pr.id, {});
      const targetItems = tuData?.items || tuData || [];
      testTargetUserId =
        targetItems[0]?.user?.id ??
        targetItems[0]?.userId ??
        targetItems[0]?.id;
      if (!testTargetUserId) throw new Error("targetUserId не получен");
      console.log(`👤 Target user: ${testTargetUserId}`);

      // 4. Прикрепить анкеты
      await prSeed.attachAssessments(pr.id);

      // 5. Получить direction IDs
      const { data: prData } = await prAPI.getById(pr.id);
      const dirs = prData.directions || [];
      const headDir = dirs.find((d) => d.receiverType === "head");
      const colleagueDir = dirs.find((d) => d.receiverType === "colleague");
      const subordinateDir = dirs.find((d) => d.receiverType === "subordinate");

      // 6. Назначить receivers
      assignedHeadId = users[7].id;
      assignedColleagueIds = [users[1].id, users[2].id, users[3].id];
      assignedSubordinateIds = [users[4].id, users[5].id, users[6].id];

      if (headDir) {
        const { response } = await prAPI.updateReceivers(
          pr.id,
          testTargetUserId,
          {
            directionId: headDir.id,
            usersIds: [assignedHeadId],
          },
        );
        console.log(
          `👤 Руководитель: ${response.ok() ? "OK" : response.status()}`,
        );
      }

      if (colleagueDir) {
        const { response } = await prAPI.updateReceivers(
          pr.id,
          testTargetUserId,
          {
            directionId: colleagueDir.id,
            usersIds: assignedColleagueIds,
          },
        );
        console.log(
          `👥 Коллеги (${assignedColleagueIds.length}): ${response.ok() ? "OK" : response.status()}`,
        );
      }

      if (subordinateDir) {
        const { response } = await prAPI.updateReceivers(
          pr.id,
          testTargetUserId,
          {
            directionId: subordinateDir.id,
            usersIds: assignedSubordinateIds,
          },
        );
        console.log(
          `👥 Подчинённые (${assignedSubordinateIds.length}): ${response.ok() ? "OK" : response.status()}`,
        );
      }

      // 7. Запустить PR
      const { response: startResp } = await prAPI.start(pr.id);
      if (!startResp.ok()) {
        throw new Error(`Не удалось запустить PR: ${await startResp.text()}`);
      }
      console.log(`🚀 PR запущен`);

      // 8. Получить ревизию
      const { data: revision } = await prAPI.getLastRevision(pr.id);
      if (!revision?.id) throw new Error("Ревизия не найдена");
      testRevisionId = revision.id;

      // 9. Заполнить все анкеты
      const filled = await prSeed.fillQuestionnaires(pr.id);
      console.log(`✏️ Заполнено анкет: ${filled}`);

      // 10. Загрузить summary
      const { response: summResp, data } = await prAPI.getStatisticsSummary(
        pr.id,
        {
          revisionId: testRevisionId,
          targetUserId: testTargetUserId,
        },
      );
      if (!summResp.ok()) {
        throw new Error(`getStatisticsSummary: ${summResp.status()}`);
      }
      summaryData = data;

      // 11. Загрузить список receivers
      const { data: recData } = await prAPI.getReceiverUsers(pr.id, {
        limit: 50,
      });
      receiversList = recData?.items || recData || [];

      const byDir = getAnswersByDirection(summaryData);
      console.log(
        `✅ PR ${testPrId} готов. receivers=${receiversList.length} ` +
          `self=${byDir.self.length} head=${byDir.head.length} ` +
          `colleague=${byDir.colleague.length} subordinate=${byDir.subordinate.length}`,
      );
    });

    test.beforeEach(async () => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Receivers Completeness");
    });

    // ==========================================
    // PR-225: ВСЕ выбранные коллеги получили анкеты
    // ==========================================
    test("C4353: Все назначенные коллеги получили и заполнили анкеты", async ({
      prAPI,
    }) => {
      setSeverity("critical");

      await test.step("Назначенные коллеги присутствуют в списке receivers", async () => {
        // Receiver users — плоский список всех назначенных (без направления)
        // Проверяем что каждый назначенный коллега есть в списке
        const receiverUserIds = receiversList.map(
          (r) => r.id || r.userId || r.receiverUserId || r.user?.id,
        );

        for (const colleagueId of assignedColleagueIds) {
          expect(
            receiverUserIds.includes(colleagueId),
            `Коллега ${colleagueId} присутствует в receivers`,
          ).toBeTruthy();
        }
        console.log(
          `✅ Все ${assignedColleagueIds.length} коллег в списке receivers`,
        );
      });

      await test.step("Ответы от всех коллег присутствуют в summary", async () => {
        const byDir = getAnswersByDirection(summaryData);

        // Должно быть >= 3 ответов коллег (по количеству назначенных)
        expect(
          byDir.colleague.length,
          `Ответы коллег >= ${assignedColleagueIds.length}`,
        ).toBeGreaterThanOrEqual(assignedColleagueIds.length);

        console.log(
          `✅ Ответов коллег: ${byDir.colleague.length} (назначено: ${assignedColleagueIds.length})`,
        );
      });

      await test.step("Прогресс заполнения для коллег > 0", async () => {
        const { response, data } = await prAPI.getReceiverUsersProgress(
          testPrId,
          {
            revisionId: testRevisionId,
            usersIds: assignedColleagueIds,
          },
        );

        expect(response.ok(), "getReceiverUsersProgress OK").toBeTruthy();

        const progressItems = data?.items || data || [];
        console.log(`📊 Progress items: ${progressItems.length}`);

        // Каждый назначенный коллега должен иметь прогресс
        // Progress item: { receiverUserId, assessmentsCount, completeResponsesCount, completeResponsesPercent }
        expect(progressItems.length, "Прогресс для каждого коллеги").toBe(
          assignedColleagueIds.length,
        );

        const progressReceiverIds = progressItems.map((p) => p.receiverUserId);
        for (const colleagueId of assignedColleagueIds) {
          expect(
            progressReceiverIds,
            `Коллега ${colleagueId} в прогрессе`,
          ).toContain(colleagueId);
        }

        // Каждый коллега получил анкету (assessmentsCount > 0) и заполнил (completeResponsesPercent = 1)
        for (const item of progressItems) {
          expect(
            item.assessmentsCount,
            `Коллега ${item.receiverUserId}: получил анкету`,
          ).toBeGreaterThan(0);
          expect(
            item.completeResponsesCount,
            `Коллега ${item.receiverUserId}: заполнил`,
          ).toBeGreaterThan(0);
          expect(
            item.completeResponsesPercent,
            `Коллега ${item.receiverUserId}: 100%`,
          ).toBe(1);
        }
        console.log(
          `✅ Все ${progressItems.length} коллег заполнили анкеты (100%)`,
        );
      });
    });

    // ==========================================
    // PR-234: ВСЕ подчинённые получили анкеты
    // ==========================================
    test("C4354: Все назначенные подчинённые получили и заполнили анкеты", async ({
      prAPI,
    }) => {
      setSeverity("critical");

      await test.step("Назначенные подчинённые присутствуют в списке receivers", async () => {
        const receiverUserIds = receiversList.map(
          (r) => r.id || r.userId || r.receiverUserId || r.user?.id,
        );

        for (const subId of assignedSubordinateIds) {
          expect(
            receiverUserIds.includes(subId),
            `Подчинённый ${subId} присутствует в receivers`,
          ).toBeTruthy();
        }
        console.log(
          `✅ Все ${assignedSubordinateIds.length} подчинённых в списке receivers`,
        );
      });

      await test.step("Ответы от всех подчинённых присутствуют в summary", async () => {
        const byDir = getAnswersByDirection(summaryData);

        expect(
          byDir.subordinate.length,
          `Ответы подчинённых >= ${assignedSubordinateIds.length}`,
        ).toBeGreaterThanOrEqual(assignedSubordinateIds.length);

        console.log(
          `✅ Ответов подчинённых: ${byDir.subordinate.length} (назначено: ${assignedSubordinateIds.length})`,
        );
      });

      await test.step("Прогресс заполнения для подчинённых > 0", async () => {
        const { response, data } = await prAPI.getReceiverUsersProgress(
          testPrId,
          {
            revisionId: testRevisionId,
            usersIds: assignedSubordinateIds,
          },
        );

        expect(response.ok(), "getReceiverUsersProgress OK").toBeTruthy();

        const progressItems = data?.items || data || [];
        console.log(`📊 Progress items: ${progressItems.length}`);

        expect(progressItems.length, "Прогресс для каждого подчинённого").toBe(
          assignedSubordinateIds.length,
        );

        const progressReceiverIds = progressItems.map((p) => p.receiverUserId);
        for (const subId of assignedSubordinateIds) {
          expect(
            progressReceiverIds,
            `Подчинённый ${subId} в прогрессе`,
          ).toContain(subId);
        }

        for (const item of progressItems) {
          expect(
            item.assessmentsCount,
            `Подчинённый ${item.receiverUserId}: получил анкету`,
          ).toBeGreaterThan(0);
          expect(
            item.completeResponsesCount,
            `Подчинённый ${item.receiverUserId}: заполнил`,
          ).toBeGreaterThan(0);
          expect(
            item.completeResponsesPercent,
            `Подчинённый ${item.receiverUserId}: 100%`,
          ).toBe(1);
        }
        console.log(
          `✅ Все ${progressItems.length} подчинённых заполнили анкеты (100%)`,
        );
      });
    });
  },
);
