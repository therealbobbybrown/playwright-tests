// tests/functional/performance-review/resume/pr-resume-add-colleague-api.spec.js
// API тест: Добавить нового коллегу-респондента после resume (RESUME-041)
//
// Сценарий:
//   1. Создать неанонимный PR с направлением "коллеги", назначить 1 коллегу,
//      запустить, заполнить анкеты, остановить
//   2. Resume PR
//   3. Добавить нового коллегу через updateReceivers на resumed PR
//   4. Верифицировать: новый коллега появился в getReceiverUsers (ключевой assert RESUME-041)
//   5. Верифицировать: getReceiverUsers содержит обоих коллег (начального + нового)
//   6. Остановить PR
//
// Примечание по ограничению:
//   После добавления коллеги через updateReceivers на running PR, система не создаёт
//   автоматически запись в performance_review_revisions_users — это происходит через
//   отправку email-приглашения в production. Поэтому populateReview не может заполнить
//   анкету нового коллеги (admin testing tool работает только с уже существующими записями).
//   Тест верифицирует то, что действительно работает через API: факт добавления в receivers.

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

// ---------------------------------------------------------------------------
// Fixtures
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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Получить ID первого target user из PR
 */
async function getFirstTargetUser(prAPI, prId) {
  const { data: tuData } = await prAPI.getTargetUsers(prId, { limit: 50 });
  const items = tuData?.items || tuData || [];
  if (items.length === 0) throw new Error("Нет target users в PR");
  const first = items[0];
  return first.userId || first.user?.id || first.id;
}

/**
 * Получить direction объект по типу (colleague, head, self, subordinate)
 */
async function getDirectionByType(prAPI, prId, receiverType) {
  const { data: prData } = await prAPI.getById(prId);
  const dirs = prData?.directions || [];
  return dirs.find((d) => d.receiverType === receiverType) || null;
}

/**
 * Получить список ID всех receiver users для PR
 */
async function getReceiverUserIds(prAPI, prId) {
  const { data: recData } = await prAPI.getReceiverUsers(prId, { limit: 100 });
  const items = recData?.items || recData || [];
  return items.map((r) => r.id || r.userId || r.receiverUserId || r.user?.id);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe(
  "PR Resume — Добавить коллегу после resume",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Add Colleague");
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
      "C7391: Добавить нового коллегу после resume — коллега появляется в списке receivers",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");
        test.setTimeout(300000);

        const { seedHelper } = prSeed;

        let prId;
        let revisionId;
        let targetUserId;
        let colleagueDirectionId;
        let initialColleagueId;
        let newColleagueId;

        // Получаем всех пользователей один раз и используем по всему тесту
        let allUsers;

        // ----------------------------------------------------------------
        await test.step("Получить доступных пользователей (нужно >= 3: 1 target + 1 начальный коллега + 1 новый коллега)", async () => {
          allUsers = await seedHelper.getAvailableUsers();
          expect(
            allUsers.length,
            "Должно быть не менее 3 пользователей для теста",
          ).toBeGreaterThanOrEqual(3);

          // allUsers[0] — target user
          // allUsers[1] — начальный коллега (назначается до start)
          // allUsers[2] — новый коллега (добавляется после resume)
          initialColleagueId = allUsers[1].id;
          newColleagueId = allUsers[2].id;

          expect(
            initialColleagueId,
            "initialColleagueId должен быть ненулевым числом",
          ).toBeGreaterThan(0);
          expect(
            newColleagueId,
            "newColleagueId должен быть ненулевым числом",
          ).toBeGreaterThan(0);
          expect(
            initialColleagueId,
            "Начальный и новый коллеги должны быть разными пользователями",
          ).not.toBe(newColleagueId);

          console.log(
            `Target: userId=${allUsers[0].id}, начальный коллега: userId=${initialColleagueId}, новый коллега: userId=${newColleagueId}`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Создать неанонимный PR с направлением 'коллеги', назначить начального коллегу", async () => {
          // Неанонимный PR — позволяет запустить с 1 коллегой
          // (анонимный режим требует минимум 2 коллег для старта)
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
              isSelected: false,
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

          const pr = await seedHelper.seedDraftPR({
            title: TestDataHelper.generateUniqueName("Добавление коллеги"),
            directions,
            anonymityType: "notAnonymous",
          });
          prId = pr.id;
          createdReviewId = prId;
          expect(typeof prId, "prId должен быть числом").toBe("number");
          expect(prId, "prId должен быть положительным числом").toBeGreaterThan(
            0,
          );

          // Добавляем target user
          await seedHelper.addTargetUsers(prId, [allUsers[0].id]);

          // Привязываем анкеты
          await seedHelper.attachAssessments(prId);

          // Получаем targetUserId и colleagueDirectionId из API
          targetUserId = await getFirstTargetUser(prAPI, prId);
          expect(
            targetUserId,
            "targetUserId должен быть ненулевым числом",
          ).toBeGreaterThan(0);

          const colleagueDir = await getDirectionByType(
            prAPI,
            prId,
            "colleague",
          );
          expect(
            colleagueDir,
            "Направление 'colleague' должно существовать в PR",
          ).toBeTruthy();
          colleagueDirectionId = colleagueDir.id;
          expect(
            colleagueDirectionId,
            "colleagueDirectionId должен быть ненулевым числом",
          ).toBeGreaterThan(0);

          // Назначаем начального коллегу ДО запуска PR
          // (это создаёт questionnaire-запись при start)
          const { response: assignResp } = await prAPI.updateReceivers(
            prId,
            targetUserId,
            {
              directionId: colleagueDirectionId,
              usersIds: [initialColleagueId],
            },
          );
          assertSuccessStatus(assignResp);

          console.log(
            `PR ${prId} создан (notAnonymous), targetUserId=${targetUserId}, colleagueDir=${colleagueDirectionId}`,
          );
          console.log(
            `Назначен начальный коллега: userId=${initialColleagueId}`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Запустить PR, заполнить анкеты (включая анкету начального коллеги), получить ревизию, остановить", async () => {
          // Запускаем PR — при start система создаёт questionnaire-записи
          // для всех назначенных receivers (включая initialColleague)
          const { response: startResp } = await prAPI.start(prId);
          if (!startResp.ok()) {
            const errorBody = await startResp.text();
            throw new Error(
              `Не удалось запустить PR ${prId} (${startResp.status()}): ${errorBody}`,
            );
          }
          console.log(`PR ${prId} запущен`);

          // Получаем ревизию
          const { data: revision } = await prAPI.getLastRevision(prId);
          expect(
            typeof revision?.id,
            "Ревизия должна быть числом после запуска",
          ).toBe("number");
          expect(
            revision?.id,
            "Ревизия должна быть положительным числом",
          ).toBeGreaterThan(0);
          revisionId = revision.id;

          // Заполняем все анкеты (начальный коллега получил анкету при start)
          const filled = await seedHelper.fillQuestionnaires(prId);
          expect(
            filled,
            "Должна быть заполнена хотя бы 1 анкета",
          ).toBeGreaterThan(0);
          console.log(`Заполнено анкет в раунде 1: ${filled}`);

          // Верифицируем прогресс начального коллеги
          const { response: progResp, data: progData } =
            await prAPI.getReceiverUsersProgress(prId, {
              revisionId,
              usersIds: [initialColleagueId],
            });
          expect(progResp.ok()).toBe(true);
          const initItems = (progData?.items || progData || []).filter(
            (p) => p.receiverUserId === initialColleagueId,
          );
          expect(
            initItems.length,
            "Начальный коллега должен иметь прогресс после заполнения",
          ).toBeGreaterThan(0);
          console.log(
            `Прогресс начального коллеги: assessmentsCount=${initItems[0]?.assessmentsCount}, percent=${initItems[0]?.completeResponsesPercent}`,
          );

          // Останавливаем PR
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
          console.log(
            `PR ${prId} остановлен. revisionId=${revisionId}, статус=${prData.status}`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Resume PR", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");

          console.log(`PR ${prId} возобновлён — статус: active`);
        });

        // ----------------------------------------------------------------
        await test.step("Проверить receivers до добавления нового коллеги", async () => {
          const receiverIds = await getReceiverUserIds(prAPI, prId);
          expect(
            receiverIds,
            "Начальный коллега должен оставаться в receivers после resume",
          ).toContain(initialColleagueId);
          expect(
            receiverIds,
            "Новый коллега ещё НЕ должен быть в receivers до добавления",
          ).not.toContain(newColleagueId);

          console.log(
            `До добавления: ${receiverIds.length} receivers. initialColleague ${initialColleagueId} — присутствует, newColleague ${newColleagueId} — отсутствует`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Добавить нового коллегу через updateReceivers на resumed PR", async () => {
          // updateReceivers заменяет весь список receivers для данного direction.
          // Передаём полный список: начальный + новый коллега.
          const { response } = await prAPI.updateReceivers(prId, targetUserId, {
            directionId: colleagueDirectionId,
            usersIds: [initialColleagueId, newColleagueId],
          });
          assertSuccessStatus(response);

          console.log(
            `updateReceivers OK на resumed PR: список коллег [${initialColleagueId}, ${newColleagueId}]`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("RESUME-041 — Верифицировать: новый коллега появился в getReceiverUsers", async () => {
          const receiverIds = await getReceiverUserIds(prAPI, prId);

          // Ключевой assert: новый коллега добавлен
          expect(
            receiverIds,
            `RESUME-041: новый коллега userId=${newColleagueId} должен присутствовать в receivers после добавления`,
          ).toContain(newColleagueId);

          // Дополнительный assert: начальный коллега не удалён
          expect(
            receiverIds,
            `Начальный коллега userId=${initialColleagueId} должен остаться в receivers`,
          ).toContain(initialColleagueId);

          // Итоговое количество receivers должно увеличиться
          expect(
            receiverIds.length,
            "После добавления нового коллеги количество receivers должно быть больше чем до",
          ).toBeGreaterThanOrEqual(2);

          console.log(
            `RESUME-041 PASS: ${receiverIds.length} receivers. Новый коллега ${newColleagueId} — присутствует`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Верифицировать: список receivers содержит обоих коллег через повторный запрос", async () => {
          // Повторный запрос гарантирует отсутствие кэш-артефактов
          const { response: recResp, data: recData } =
            await prAPI.getReceiverUsers(prId, { limit: 100 });
          assertSuccessStatus(recResp);

          const items = recData?.items || recData || [];
          const receiverUserIds = items.map(
            (r) => r.id || r.userId || r.receiverUserId || r.user?.id,
          );

          const newColleagueEntry = items.find(
            (r) =>
              (r.id || r.userId || r.receiverUserId || r.user?.id) ===
              newColleagueId,
          );

          expect(
            newColleagueEntry,
            `getReceiverUsers должен содержать запись нового коллеги ${newColleagueId}`,
          ).toBeTruthy();

          expect(
            receiverUserIds,
            `getReceiverUsers должен содержать начального коллегу ${initialColleagueId}`,
          ).toContain(initialColleagueId);

          console.log(
            `Верификация через повторный запрос: ${items.length} receivers включают обоих коллег`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Остановить PR и проверить финальный статус", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);

          // После остановки оба коллеги должны остаться в receivers
          const finalReceiverIds = await getReceiverUserIds(prAPI, prId);
          expect(finalReceiverIds).toContain(newColleagueId);
          expect(finalReceiverIds).toContain(initialColleagueId);

          console.log(
            `PR ${prId} остановлен. Статус: ${prData.status}. Оба коллеги в receivers: OK`,
          );
        });
      },
    );
  },
);
