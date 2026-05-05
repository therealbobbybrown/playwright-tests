import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { OrgStructureAPI } from "../../../utils/api/OrgStructureAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

/**
 * Блокировка калибровки администратором.
 *
 * Бизнес-логика:
 *   Админ откалибровал итоговую оценку сотрудника И заблокировал (isLocked=true).
 *   Руководитель (head) на вкладке «Распределение оценок» видит значение
 *   «после калибровки», но НЕ видит иконку-карандаш — не может редактировать.
 *   Незаблокированный сотрудник по-прежнему имеет карандаш.
 *
 * Подход:
 *   1. Админ находит 2 пользователей с distribution данными (revisionMean).
 *   2. Добавляет их как подчинённых head через OrgStructureAPI.
 *   3. Включает калибровку через ensureCalibrationOnDistributionPR.
 *   4. Блокирует одного из них через overwrite API.
 *   5. C7247 (API): isLocked=true, isOverwritten=true.
 *   6. C7246 (UI): head не видит карандаш у заблокированного.
 *   7. afterAll: разблокировка + возврат оргструктуры.
 */
test.describe(
  "Распределение оценок — Блокировка калибровки администратором (вид руководителя)",
  { tag: ["@my-team", "@regression"] },
  () => {
    test.describe.configure({ mode: "serial" });

    /** @type {{ prId: number, revisionId: number, lockedUserId: number, lockedName: string, unlockedUserId: number, unlockedName: string } | null} */
    let testData = null;
    /** @type {Array<{userId: number, originalHeadId: number}>} Для отката оргструктуры */
    let movedUsers = [];

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);

      const adminCreds = getCredentials("admin");
      const headCreds = getCredentials("head");

      // ── 1. Админ: найти PR и 2 overwritable пользователей ────
      const adminDashboard = new DashboardTeamAPI(request);
      await adminDashboard.signIn(adminCreds.email, adminCreds.password);

      const prAPI = new PerformanceReviewAPI(request);
      await prAPI.signIn(adminCreds.email, adminCreds.password);

      // Загружаем пользователей из distribution
      const { data: allUsersData } = await adminDashboard.getDistributionUsers({
        usersSubset: "all",
        limit: 500,
      });
      const allUsers = allUsersData?.items || [];
      expect(
        allUsers.length,
        "Должны быть сотрудники в distribution",
      ).toBeGreaterThan(0);
      console.log(`  Всего пользователей distribution: ${allUsers.length}`);

      // Получить distribution results — нужны для определения PR ID
      const allIds = allUsers.map((u) => u.id);
      const { data: resultsData } =
        await adminDashboard.getDistributionLastResults(allIds.slice(0, 200));

      // Собрать уникальные PR из distribution results
      const prSet = new Map(); // prId → { revisionId, prTitle, userIds: [] }
      for (const entry of Object.values(resultsData || {})) {
        if (!entry?.performanceReview?.id) continue;
        const pid = entry.performanceReview.id;
        if (!prSet.has(pid)) {
          prSet.set(pid, {
            revisionId: entry.performanceReview?.revisionId,
            prTitle: entry.performanceReview.name || entry.performanceReview.title,
            userIds: [],
          });
        }
        prSet.get(pid).userIds.push(entry.targetUserId);
      }
      console.log(`  Найдено PR в distribution: ${prSet.size}`);

      // Включить калибровку на всех PR
      const { ensureCalibrationOnDistributionPR } = await import(
        "../../../utils/helpers/ensureCalibration.js"
      );
      await ensureCalibrationOnDistributionPR(request);

      // Для каждого PR — проверить overwritable пользователей через per-user API
      // Стратегия: найти PR с ≥2 overwritable (не обязательно с revisionMean)
      let candidates = null;
      let chosenPrId = null;

      for (const [pid, prInfo] of prSet) {
        // Получить ревизию
        const { data: revision } = await prAPI.getLastRevision(pid);
        if (!revision?.id) continue;
        const revId = revision.id;

        // Проверить overwritable для всех distribution users в этом PR
        // (distribution может показать больше users, чем есть в конкретном PR)
        const overwritable = [];
        for (const uid of prInfo.userIds) {
          const { response: owResp } = await prAPI.getResponseOverwritesData(
            pid, revId, uid,
          );
          if (owResp.ok()) {
            overwritable.push({ userId: uid, prId: pid, revisionId: revId, prTitle: prInfo.prTitle });
          }
        }

        // Также проверить всех allUsers (distribution не привязан к конкретному PR)
        if (overwritable.length < 2) {
          // Попробуем ещё пользователей из allUsers (случайная выборка)
          const extraIds = allIds.filter((id) => !prInfo.userIds.includes(id)).slice(0, 50);
          for (const uid of extraIds) {
            if (overwritable.length >= 2) break;
            const { response: owResp } = await prAPI.getResponseOverwritesData(
              pid, revId, uid,
            );
            if (owResp.ok()) {
              overwritable.push({ userId: uid, prId: pid, revisionId: revId, prTitle: prInfo.prTitle });
            }
          }
        }

        console.log(`  PR ${pid} "${prInfo.prTitle}": ${overwritable.length} overwritable users`);

        if (overwritable.length >= 2) {
          candidates = overwritable.slice(0, 2);
          chosenPrId = pid;
          break;
        }
      }

      expect(
        candidates,
        "Нужен PR с ≥2 overwritable пользователями — проверьте seed: нужен PR, где 2+ сотрудников прошли оценку",
      ).toBeTruthy();

      const prId = chosenPrId;
      console.log(
        `  Найден PR ${prId} "${candidates[0].prTitle}", кандидатов: ${candidates.length}`,
      );

      // ── 2. Добавить этих пользователей как подчинённых head ───────
      const orgAPI = new OrgStructureAPI(request);
      await orgAPI.signIn(adminCreds.email, adminCreds.password);

      // HEAD_USER_ID из env (91407)
      const headUserId = Number(process.env.HEAD_USER_ID || 91407);

      for (const cand of candidates) {
        const { data: treeInfo } = await orgAPI.getTreeUserInfo(cand.userId);
        const parentUser = (treeInfo?.parents || []).find(
          (p) => p.entityType === "user",
        );
        const originalHead = parentUser?.entityId
          ? Number(parentUser.entityId)
          : null;

        if (originalHead === headUserId) {
          console.log(
            `  User ${cand.userId} уже подчинён head ${headUserId}`,
          );
          continue;
        }

        const { response: moveResp } = await orgAPI.addTreeUser(
          cand.userId,
          headUserId,
          "move",
        );

        if (moveResp.ok()) {
          movedUsers.push({
            userId: cand.userId,
            originalHeadId: originalHead,
          });
          console.log(
            `  User ${cand.userId} перемещён к head ${headUserId} (было: ${originalHead})`,
          );
        } else {
          console.log(
            `  Не удалось переместить ${cand.userId}: ${moveResp.status()}`,
          );
        }
      }

      // ── 3. Re-query distribution от HEAD ──
      const headDashboard = new DashboardTeamAPI(request);
      await headDashboard.signIn(headCreds.email, headCreds.password);

      const candidateUserIds = candidates.map((c) => c.userId);
      const { data: headDistResults } =
        await headDashboard.getDistributionLastResults(candidateUserIds);

      // Head может видеть другой PR — ищем PR, который head видит
      let headPrId = null;
      for (const entry of Object.values(headDistResults || {})) {
        if (entry?.performanceReview?.id) {
          headPrId = entry.performanceReview.id;
          break;
        }
      }
      const actualPrId = headPrId || prId;
      console.log(
        `  Head видит PR ${headPrId} (admin нашёл PR ${prId})`,
      );

      const { data: revision } = await prAPI.getLastRevision(actualPrId);
      expect(revision, `Нет ревизии для PR ${actualPrId}`).toBeTruthy();
      const revisionId = revision.id;

      // ── 4. Включить калибровку на PR который видит head ──────────
      const { data: settingsData } =
        await prAPI.getStatisticsSettings(actualPrId);
      if (!settingsData?.settings?.enableResponsesOverwriting) {
        await prAPI.updateStatisticsSettings(actualPrId, {
          ...settingsData,
          settings: {
            ...(settingsData?.settings || {}),
            enableResponsesOverwriting: true,
            useOnlyHeadReceiver: true,
          },
        });
        console.log(`  Калибровка включена на PR ${actualPrId}`);
      }

      // ── 5. Проверить overwritable и заблокировать первого ─────────
      // Candidates уже проверены как overwritable в шаге 1, но PR мог смениться (headPrId != prId)
      // Перепроверяем для actualPrId
      const overwritableIds = [];
      for (const uid of candidateUserIds) {
        const { response: owResp } = await prAPI.getResponseOverwritesData(
          actualPrId, revisionId, uid,
        );
        if (owResp.ok()) {
          overwritableIds.push(uid);
        }
      }

      // Если head видит другой PR и кандидаты не overwritable — ищем в этом PR
      if (overwritableIds.length < 2) {
        console.log(
          `  Overwritable в PR ${actualPrId}: ${overwritableIds.length} — ищем среди всех distribution users...`,
        );
        for (const uid of allIds) {
          if (overwritableIds.length >= 2) break;
          if (overwritableIds.includes(uid)) continue;
          const { response: owResp } = await prAPI.getResponseOverwritesData(
            actualPrId, revisionId, uid,
          );
          if (owResp.ok()) {
            overwritableIds.push(uid);
          }
        }
        console.log(`  Overwritable после расширенного поиска: ${overwritableIds.length}`);
      }

      expect(
        overwritableIds.length,
        `Нужно ≥2 overwritable пользователей в PR ${actualPrId}`,
      ).toBeGreaterThanOrEqual(2);

      const lockedUserId = overwritableIds[0];
      const unlockedUserId = overwritableIds[1];

      // Калибровать + заблокировать
      const { data: currentOW } = await prAPI.getResponseOverwritesData(
        actualPrId, revisionId, lockedUserId,
      );
      const overwrites = (currentOW?.responsesData || []).map((rd) => ({
        responseId: rd.responseId,
        questionId: rd.questionId,
        answer: rd.numericAnswer,
      }));

      const { response: lockResp } = await prAPI.overwriteResponsesValues(
        actualPrId, revisionId, lockedUserId,
        {
          overwrites,
          meanOverwrite: { value: 4.0, characteristicId: null },
          isLocked: true,
        },
      );
      expect(lockResp.ok(), `Lock failed: ${lockResp.status()}`).toBe(true);
      console.log(`  User ${lockedUserId} заблокирован в PR ${actualPrId}`);

      // Имена из allUsers
      const lockedUser = allUsers.find((u) => u.id === lockedUserId);
      const unlockedUser = allUsers.find((u) => u.id === unlockedUserId);

      testData = {
        prId: actualPrId,
        revisionId,
        lockedUserId,
        lockedName:
          `${lockedUser?.firstName || lockedUser?.first_name || ""} ${lockedUser?.lastName || lockedUser?.last_name || ""}`.trim(),
        unlockedUserId,
        unlockedName:
          `${unlockedUser?.firstName || unlockedUser?.first_name || ""} ${unlockedUser?.lastName || unlockedUser?.last_name || ""}`.trim(),
      };

      console.log(
        `  ✓ Locked: ${testData.lockedName} (${lockedUserId})` +
          `\n  ✓ Unlocked: ${testData.unlockedName} (${unlockedUserId})`,
      );
    });

    test.afterAll(async ({ request }) => {
      const adminCreds = getCredentials("admin");

      // ── 1. Снять блокировку ──────────────────────────────────────
      if (testData) {
        try {
          const prAPI = new PerformanceReviewAPI(request);
          await prAPI.signIn(adminCreds.email, adminCreds.password);

          const { data } = await prAPI.getResponseOverwritesData(
            testData.prId,
            testData.revisionId,
            testData.lockedUserId,
          );
          const overwrites = (data?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const { response } = await prAPI.overwriteResponsesValues(
            testData.prId,
            testData.revisionId,
            testData.lockedUserId,
            { overwrites, isLocked: false },
          );
          console.log(
            response.ok()
              ? `  afterAll: ${testData.lockedName} разблокирован`
              : `  afterAll: разблокировка ${response.status()}`,
          );
        } catch (e) {
          console.warn(`  afterAll unlock: ${e.message}`);
        }
      }

      // ── 2. Вернуть оргструктуру ─────────────────────────────────
      if (movedUsers.length > 0) {
        try {
          const orgAPI = new OrgStructureAPI(request);
          await orgAPI.signIn(adminCreds.email, adminCreds.password);

          for (const { userId, originalHeadId } of movedUsers) {
            if (!originalHeadId) {
              console.log(
                `  afterAll: user ${userId} — нет originalHeadId, пропускаем`,
              );
              continue;
            }
            const { response } = await orgAPI.addTreeUser(
              userId,
              originalHeadId,
              "move",
            );
            console.log(
              response.ok()
                ? `  afterAll: user ${userId} возвращён к head ${originalHeadId}`
                : `  afterAll: возврат user ${userId} — ${response.status()}`,
            );
          }
        } catch (e) {
          console.warn(`  afterAll org restore: ${e.message}`);
        }
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    // ─── C7247: API-сверка (запускается первым) ──────────────────

    test(
      "C7247: API-сверка — isLocked = true для заблокированного сотрудника",
      { tag: ["@api", "@critical"] },
      async ({ request }) => {
        setSeverity("critical");
        expect(
          testData,
          "beforeAll не подготовил данные — проверьте seed / наличие PR с результатами",
        ).toBeTruthy();

        await test.step("Проверить isLocked = true через overwrite API (admin)", async () => {
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          const { data } = await prAPI.getResponseOverwritesData(
            testData.prId,
            testData.revisionId,
            testData.lockedUserId,
          );

          expect(data.isLocked, "isLocked = true").toBe(true);
          expect(data.meanOverwrite, "meanOverwrite установлен").toBeTruthy();

          console.log(
            `  API overwrite: isLocked=${data.isLocked}, ` +
              `overwrittenValue=${data.meanOverwrite?.overwrittenValue}`,
          );
        });

        await test.step("Проверить revisionMean через distribution API (head видит данные)", async () => {
          const headAPI = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("head");
          await headAPI.signIn(email, password);

          const { data } = await headAPI.getDistributionLastResults([
            testData.lockedUserId,
          ]);
          const entry = Object.values(data || {})[0];

          expect(entry, "Distribution API вернул данные для locked user").toBeTruthy();
          expect(entry.revisionMean, "revisionMean не null — калибровка видна").toBeTruthy();
          expect(
            entry.revisionMean.value,
            "revisionMean.value должен быть числом",
          ).not.toBeNull();

          console.log(
            `  Distribution (head): value=${entry.revisionMean.value}, ` +
              `isOverwritten=${entry.revisionMean.isOverwritten}`,
          );
        });
      },
    );

    // ─── C7246: UI-проверка (запускается вторым) ─────────────────

    test(
      "C7246: Заблокированный сотрудник — нет иконки-карандаша у руководителя",
      { tag: ["@critical"] },
      async ({ headAuth: page }) => {
        setSeverity("critical");
        expect(
          testData,
          "beforeAll не подготовил данные — проверьте seed / наличие PR с результатами",
        ).toBeTruthy();

        const tab = new ScoreDistributionTab(page);

        await test.step("Открыть вкладку «Распределение оценок» и загрузить все строки", async () => {
          await tab.open();
          await page.waitForLoadState("networkidle");
          await tab.loadAllRows();
        });

        await test.step("Заблокированный сотрудник: нет кнопки калибровки", async () => {
          const lockedRow = tab.getRowByName(testData.lockedName);
          await expect(
            lockedRow,
            `Строка «${testData.lockedName}» найдена`,
          ).toBeVisible({ timeout: 10_000 });

          // Hover для появления кнопки (React conditional render on hover)
          const calibCell = lockedRow.locator("td").nth(2);
          await calibCell.hover();
          const cellText = (await calibCell.innerText()).trim();
          const buttonCount = await calibCell.locator("button").count();

          console.log(
            `  ${testData.lockedName}: после калибровки = "${cellText}", buttons = ${buttonCount}`,
          );

          expect(
            buttonCount,
            `У «${testData.lockedName}» НЕ должно быть кнопки калибровки (заблокирована)`,
          ).toBe(0);
        });

        await test.step("Незаблокированный сотрудник: есть кнопка калибровки", async () => {
          const unlockedRow = tab.getRowByName(testData.unlockedName);
          await expect(
            unlockedRow,
            `Строка «${testData.unlockedName}» найдена`,
          ).toBeVisible({ timeout: 10_000 });

          // Hover для появления кнопки (React conditional render on hover)
          const calibCell = unlockedRow.locator("td").nth(2);
          await calibCell.hover();
          const buttonCount = await calibCell.locator("button").count();

          console.log(`  ${testData.unlockedName}: buttons = ${buttonCount}`);

          expect(
            buttonCount,
            `У «${testData.unlockedName}» ДОЛЖНА быть кнопка калибровки`,
          ).toBeGreaterThan(0);
        });
      },
    );
  },
);
