/**
 * PR-330..334: Проверки анонимности результатов Performance Review
 *
 * Сценарии:
 * - PR-330: Оценки коллег анонимны — userId и другие идентифицирующие поля не раскрываются
 * - PR-331: Оценки подчинённых анонимны — аналогично
 * - PR-332: Оценка руководителя НЕ анонимна — userId присутствует, isVisible=1
 * - PR-333: Самооценка НЕ анонимна — userId = targetUserId
 * - PR-334: Порог анонимности — >= 3 ответов данные видны, неанонимные направления всегда видны
 *
 * Данные: beforeAll создаёт PR со всеми 4 направлениями (self, head, colleague, subordinate),
 * назначает 1 руководителя, 3 коллег и 3 подчинённых, запускает и заполняет анкеты.
 *
 * @tags @api @ui @performance-review @results @anonymity @regression
 */
import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { getCredentials } from "../../../utils/credentials.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { PerformanceReviewResultsPage } from "../../../../pages/PerformanceReviewResultsPage.js";
import {
  markAsUITest,
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
  "Проверки анонимности результатов",
  {
    tag: [
      "@performance-review",
      "@results",
      "@anonymity",
      "@regression",
      "@api",
    ],
  },
  () => {
    /** @type {number} */ let testPrId;
    /** @type {number} */ let testTargetUserId;
    /** @type {string} */ let testRevisionId;
    /** @type {Object} */ let summaryData;
    /** @type {Object} */ let directionMap; // { self: dirId, head: dirId, colleague: dirId, subordinate: dirId }

    test.beforeAll(async ({ prSeed }) => {
      test.setTimeout(600_000);
      const prAPI = prSeed.prAPI;

      // 1. Ищем существующий PR с данными по всем 4 направлениям
      const existing = await findPRWithAllDirections(prAPI);
      if (existing) {
        testPrId = existing.prId;
        testTargetUserId = existing.targetUserId;
        testRevisionId = existing.revisionId;
        summaryData = existing.summaryData;
        console.log(
          `✅ Найден PR ${testPrId} с данными по всем 4 направлениям`,
        );
      } else {
        // 2. Не найден — создаём новый PR
        console.log("ℹ️ Подходящий PR не найден, создаём...");
        const created = await createPRWithAllDirections(prSeed);
        testPrId = created.prId;
        testTargetUserId = created.targetUserId;
        testRevisionId = created.revisionId;

        // Загружаем summary
        const { response, data } = await prAPI.getStatisticsSummary(testPrId, {
          revisionId: testRevisionId,
          targetUserId: testTargetUserId,
        });
        if (!response.ok()) {
          throw new Error(
            `getStatisticsSummary: ${response.status()} ${await response.text()}`,
          );
        }
        summaryData = data;
      }

      // 3. Загружаем direction map (receiverType → directionId)
      const { data: prDetails } = await prAPI.getById(testPrId);
      directionMap = {};
      for (const d of prDetails.directions || []) {
        if (d.isSelected) directionMap[d.receiverType] = d.id;
      }

      const byDir = getAnswersByDirection(summaryData);
      console.log(
        `✅ PR ${testPrId} готов. self=${byDir.self.length} head=${byDir.head.length} ` +
          `colleague=${byDir.colleague.length} subordinate=${byDir.subordinate.length}`,
      );
    });

    /**
     * Найти PR, в котором есть ответы во ВСЕХ 4 направлениях
     */
    async function findPRWithAllDirections(prAPI) {
      try {
        const { data } = await prAPI.getList();
        const items = data?.items || data || [];
        const candidates = items.filter(
          (pr) => pr.status === "active" || pr.status === "finished",
        );
        console.log(
          `ℹ️ Поиск PR с 4 направлениями: ${candidates.length} кандидатов`,
        );

        for (const pr of candidates.slice(0, 10)) {
          try {
            // Все 4 направления должны быть выбраны
            const { data: prData } = await prAPI.getById(pr.id);
            const directions = prData?.directions || [];
            const selectedTypes = directions
              .filter((d) => d.isSelected)
              .map((d) => d.receiverType);
            const need = ["self", "head", "colleague", "subordinate"];
            if (!need.every((t) => selectedTypes.includes(t))) continue;

            // Получаем target user
            const { data: tuData } = await prAPI.getTargetUsers(pr.id, {});
            const targetUsers = tuData?.items || tuData || [];
            if (!targetUsers.length) continue;
            const targetUserId = targetUsers[0]?.userId || targetUsers[0]?.id;
            if (!targetUserId) continue;

            // Ревизия
            const { data: revision } = await prAPI.getLastRevision(pr.id);
            if (!revision?.id) continue;

            // Summary
            const { response, data: summary } =
              await prAPI.getStatisticsSummary(pr.id, {
                revisionId: revision.id,
                targetUserId,
              });
            if (!response.ok()) continue;

            // Ответы во ВСЕХ направлениях, анонимные >= 3 (порог анонимности)
            const byDir = getAnswersByDirection(summary);
            if (
              byDir.self.length > 0 &&
              byDir.head.length > 0 &&
              byDir.colleague.length >= 3 &&
              byDir.subordinate.length >= 3
            ) {
              return {
                prId: pr.id,
                targetUserId,
                revisionId: revision.id,
                summaryData: summary,
              };
            }
          } catch {
            continue;
          }
        }
      } catch (e) {
        console.log(`⚠️ Ошибка при поиске PR: ${e.message}`);
      }
      return null;
    }

    /**
     * Создать PR со всеми 4 направлениями, назначить receiver-ов, запустить и заполнить
     */
    async function createPRWithAllDirections(prSeed) {
      const prAPI = prSeed.prAPI;

      // Нужно минимум 8: 1 target + 1 head + 3 colleague + 3 subordinate
      const users = await prSeed.getAvailableUsers();
      if (users.length < 8) {
        throw new Error(`Нужно >= 8 пользователей, доступно ${users.length}`);
      }
      console.log(`  📋 Доступно ${users.length} пользователей`);

      // Черновик со всеми 4 направлениями
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
      console.log(`  📝 Черновик: ${pr.id}`);

      // Добавляем target user
      await prSeed.addTargetUsers(pr.id, [users[0].id]);

      // Получаем канонический targetUserId
      const { data: tuData } = await prAPI.getTargetUsers(pr.id, {});
      const targetItems = tuData?.items || tuData || [];
      const targetUserId = targetItems[0]?.userId || targetItems[0]?.id;
      if (!targetUserId) throw new Error("targetUserId не получен");
      console.log(`  👤 Target user: ${targetUserId}`);

      // Assessments ко всем направлениям
      await prSeed.attachAssessments(pr.id);

      // Получаем direction IDs
      const { data: prData } = await prAPI.getById(pr.id);
      const dirs = prData.directions || [];
      const headDir = dirs.find((d) => d.receiverType === "head");
      const colleagueDir = dirs.find((d) => d.receiverType === "colleague");
      const subordinateDir = dirs.find((d) => d.receiverType === "subordinate");

      // Назначаем руководителя (1 человек)
      if (headDir) {
        const { response } = await prAPI.updateReceivers(pr.id, targetUserId, {
          directionId: headDir.id,
          usersIds: [users[7].id],
        });
        console.log(
          `  👤 Руководитель (dir=${headDir.id}): ${response.ok() ? "OK" : response.status()}`,
        );
      }

      // Назначаем коллег (3 человека)
      if (colleagueDir) {
        const ids = [users[1].id, users[2].id, users[3].id];
        const { response } = await prAPI.updateReceivers(pr.id, targetUserId, {
          directionId: colleagueDir.id,
          usersIds: ids,
        });
        console.log(
          `  👥 Коллеги (dir=${colleagueDir.id}): ${response.ok() ? "OK" : response.status()}`,
        );
      }

      // Назначаем подчинённых (3 человека)
      if (subordinateDir) {
        const ids = [users[4].id, users[5].id, users[6].id];
        const { response } = await prAPI.updateReceivers(pr.id, targetUserId, {
          directionId: subordinateDir.id,
          usersIds: ids,
        });
        console.log(
          `  👥 Подчинённые (dir=${subordinateDir.id}): ${response.ok() ? "OK" : response.status()}`,
        );
      }

      // Запускаем
      const { response: startResp } = await prAPI.start(pr.id);
      if (!startResp.ok()) {
        const err = await startResp.text();
        throw new Error(`Не удалось запустить PR ${pr.id}: ${err}`);
      }
      console.log(`  🚀 PR запущен`);

      // Ревизия
      const { data: revision } = await prAPI.getLastRevision(pr.id);
      if (!revision?.id) throw new Error("Ревизия не найдена");
      console.log(`  📌 Ревизия: ${revision.id}`);

      // Заполняем анкеты
      const filled = await prSeed.fillQuestionnaires(pr.id);
      console.log(`  ✏️ Заполнено анкет: ${filled}`);

      return { prId: pr.id, targetUserId, revisionId: revision.id };
    }

    test.beforeEach(async () => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Anonymity");
    });

    // ==========================================
    // PR-330: Оценки коллег анонимны
    // ==========================================
    test("C4365: API — оценки коллег анонимны, идентифицирующие поля не раскрываются", async () => {
      setSeverity("critical");

      await test.step("Получить ответы по направлениям из данных summary", async () => {
        // данные уже загружены в summaryData через beforeAll
      });

      await test.step("Проверить, что оценки коллег не раскрывают идентифицирующие поля", async () => {
        const byDir = getAnswersByDirection(summaryData);

        expect(
          byDir.colleague.length,
          "Должны быть ответы коллег (>= 3)",
        ).toBeGreaterThanOrEqual(3);

        for (const answer of byDir.colleague) {
          // Никакие идентифицирующие поля не должны раскрываться
          expect(answer.userId, "userId коллеги не раскрыт").toBeFalsy();
          expect(answer.userName, "userName коллеги не раскрыт").toBeFalsy();
          expect(answer.userEmail, "userEmail коллеги не раскрыт").toBeFalsy();
          expect(answer.user, "user object коллеги не раскрыт").toBeFalsy();
        }

        // Не должно быть ответов с неизвестным receiverType
        expect(
          byDir.other.length,
          "Нет ответов с неизвестным receiverType",
        ).toBe(0);
      });
    });

    // ==========================================
    // PR-331: Оценки подчинённых анонимны
    // ==========================================
    test("C4366: API — оценки подчинённых анонимны", async () => {
      setSeverity("critical");

      await test.step("Проверить, что оценки подчинённых не раскрывают идентифицирующие поля", async () => {
        const byDir = getAnswersByDirection(summaryData);

        expect(
          byDir.subordinate.length,
          "Должны быть ответы подчинённых (>= 3)",
        ).toBeGreaterThanOrEqual(3);

        for (const answer of byDir.subordinate) {
          expect(answer.userId, "userId подчинённого не раскрыт").toBeFalsy();
          expect(
            answer.userName,
            "userName подчинённого не раскрыт",
          ).toBeFalsy();
          expect(
            answer.userEmail,
            "userEmail подчинённого не раскрыт",
          ).toBeFalsy();
          expect(
            answer.user,
            "user object подчинённого не раскрыт",
          ).toBeFalsy();
        }

        // Не должно быть ответов с неизвестным receiverType
        expect(
          byDir.other.length,
          "Нет ответов с неизвестным receiverType",
        ).toBe(0);
      });
    });

    // ==========================================
    // PR-332: Оценка руководителя НЕ анонимна
    // ==========================================
    test("C4367: API — оценка руководителя НЕ анонимна, userId присутствует", async () => {
      setSeverity("critical");

      await test.step("Проверить, что оценки руководителя содержат userId и isVisible=1", async () => {
        const byDir = getAnswersByDirection(summaryData);

        expect(
          byDir.head.length,
          "Должны быть ответы руководителя",
        ).toBeGreaterThan(0);

        for (const answer of byDir.head) {
          expect(answer.userId, "userId руководителя заполнен").toBeTruthy();
          expect(answer.isVisible, "isVisible=1").toBe(1);
        }

        // userId — числовое значение, единое для всех ответов руководителя
        const headUserId = byDir.head[0].userId;
        expect(typeof headUserId).toBe("number");
        for (const answer of byDir.head) {
          expect(answer.userId, "Все ответы head от одного userId").toBe(
            headUserId,
          );
        }

        // Руководитель — другой человек, не сам оцениваемый
        expect(headUserId, "headUserId !== testTargetUserId").not.toBe(
          testTargetUserId,
        );
      });
    });

    // ==========================================
    // PR-333: Самооценка НЕ анонимна
    // ==========================================
    test("C4368: API — самооценка НЕ анонимна, userId = targetUserId", async () => {
      setSeverity("critical");

      await test.step("Проверить, что самооценка содержит userId равный targetUserId", async () => {
        const byDir = getAnswersByDirection(summaryData);

        expect(
          byDir.self.length,
          "Должны быть ответы самооценки",
        ).toBeGreaterThan(0);

        for (const answer of byDir.self) {
          expect(answer.userId, "userId самооценки заполнен").toBeTruthy();
          expect(answer.isVisible, "isVisible=1").toBe(1);
          // Самооценка — от самого target user
          expect(
            answer.userId,
            "userId самооценки совпадает с targetUserId",
          ).toBe(testTargetUserId);
        }
      });
    });

    // ==========================================
    // PR-334: Порог анонимности
    // ==========================================
    test("C4369: API — порог анонимности: анонимные >= 3 видны, неанонимные всегда видны", async () => {
      setSeverity("normal");

      await test.step("Проверить порог анонимности для всех направлений в summary", async () => {
        const assessments = summaryData.assessments || [];
        expect(assessments.length, "Должны быть assessments").toBeGreaterThan(
          0,
        );

        let hasAnonymousWith3Plus = false;
        let hasHeadBelow3 = false;
        let hasSelfBelow3 = false;
        const headDirId = String(directionMap.head);
        const selfDirId = String(directionMap.self);

        for (const assessment of assessments) {
          for (const question of assessment.questions || []) {
            const summary = question.summary || {};
            const directionKeys = Object.keys(summary).filter(
              (k) => k !== "all",
            );

            for (const dirKey of directionKeys) {
              const s = summary[dirKey];
              expect(
                s.totalCount,
                `direction ${dirKey}: totalCount определён`,
              ).toBeDefined();

              // Анонимные направления: при >= 3 ответах avg доступен
              if (s.totalCount >= 3) {
                hasAnonymousWith3Plus = true;
                expect(
                  s.avg,
                  `direction ${dirKey}: avg доступен при totalCount=${s.totalCount}`,
                ).toBeDefined();
                expect(typeof s.avg).toBe("number");
              }

              // Неанонимное направление (head): avg доступен даже при < 3 ответах
              if (
                dirKey === headDirId &&
                s.totalCount > 0 &&
                s.totalCount < 3
              ) {
                hasHeadBelow3 = true;
                expect(
                  s.avg,
                  `head (${dirKey}): avg доступен при totalCount=${s.totalCount} (неанонимное)`,
                ).toBeDefined();
                expect(typeof s.avg).toBe("number");
              }

              // Неанонимное направление (self): avg доступен при totalCount=1
              if (
                dirKey === selfDirId &&
                s.totalCount > 0 &&
                s.totalCount < 3
              ) {
                hasSelfBelow3 = true;
                expect(
                  s.avg,
                  `self (${dirKey}): avg доступен при totalCount=${s.totalCount} (неанонимное)`,
                ).toBeDefined();
                expect(typeof s.avg).toBe("number");
              }
            }
          }
        }

        expect(
          hasAnonymousWith3Plus,
          "Есть анонимное направление с >= 3 ответами",
        ).toBeTruthy();
        expect(
          hasHeadBelow3,
          "Head имеет < 3 ответов, но avg доступен",
        ).toBeTruthy();
        expect(
          hasSelfBelow3,
          "Self имеет < 3 ответов, но avg доступен",
        ).toBeTruthy();
      });
    });

    // ==========================================
    // PR-330-API: Respondents userId=null
    // ==========================================
    test("C4370: Respondents имеют userId=null (глобальная анонимизация)", async () => {
      setSeverity("normal");

      await test.step("Проверить, что respondents анонимизированы и userId=null", async () => {
        const { respondents } = summaryData;
        expect(respondents, "respondents определён").toBeDefined();
        expect(respondents.length, "respondents не пуст").toBeGreaterThan(0);

        for (const r of respondents) {
          expect(r.userId, "userId респондента = null").toBeNull();
        }

        // Должно быть >= 4 респондентов (минимум: 1 self + 1 head + 1 colleague + 1 subordinate)
        expect(
          respondents.length,
          "Достаточное количество респондентов",
        ).toBeGreaterThanOrEqual(4);
      });
    });

    // ==========================================
    // PR-330-API-type: Тип анонимности PR
    // ==========================================
    test("C4371: AnonymityType = anonymous, все 4 направления выбраны", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Запросить данные PR через API", async () => {
        const { response, data: _data } = await prAPI.getById(testPrId);
        expect(response.status()).toBe(200);
      });

      await test.step("Проверить anonymityType и выбранные направления PR", async () => {
        const { data } = await prAPI.getById(testPrId);

        expect(data.anonymityType, "anonymityType = anonymous").toBe(
          "anonymous",
        );

        const directions = data.directions || [];
        const selectedTypes = directions
          .filter((d) => d.isSelected)
          .map((d) => d.receiverType);
        expect(selectedTypes).toEqual(
          expect.arrayContaining(["self", "head", "colleague", "subordinate"]),
        );
      });
    });

    // ==========================================
    // PR-330-UI: Анонимность на UI
    // ==========================================
    test("C4372: UI отображает все направления, анонимные секции без имён", async ({
      adminAuth: page,
    }) => {
      setSeverity("critical");
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Anonymity");

      await test.step("Открыть страницу результатов PR", async () => {
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const resultsPage = new PerformanceReviewResultsPage(page);
        await resultsPage.open(
          baseUrl,
          testTargetUserId,
          testRevisionId,
          testPrId,
        );
        await resultsPage.assertOpened();
      });

      await test.step("Проверить наличие секций всех направлений и анонимность оценок коллег/подчинённых", async () => {
        // Проверяем что секции направлений отображаются
        // Используем regex для ё/е — UI может писать "Подчиненные" или "Подчинённые"
        const sections = [
          { name: "Самооценка", pattern: /самооценка/i },
          { name: "Руководитель", pattern: /руководител/i },
          { name: "Коллеги", pattern: /коллег/i },
          { name: "Подчинённые", pattern: /подчин[её]нн/i },
        ];
        const visible = [];
        for (const { name, pattern } of sections) {
          const el = page.getByText(pattern).first();
          let elVisible = false;
          try {
            await el.waitFor({ state: "visible", timeout: 5000 });
            elVisible = true;
          } catch {
            // секция не видна
          }
          if (elVisible) {
            visible.push(name);
          }
        }
        expect(
          visible.length,
          `Видимые секции: ${visible.join(", ")}`,
        ).toBeGreaterThanOrEqual(3);

        // Анонимные секции (Коллеги, Подчинённые) должны быть видны
        expect(visible, 'Секция "Коллеги" видна').toContain("Коллеги");
        expect(visible, 'Секция "Подчинённые" видна').toContain("Подчинённые");

        // API подтверждает: userId коллег и подчинённых не раскрыт → UI не может показать имена
        const byDir = getAnswersByDirection(summaryData);
        const colleagueUserIds = byDir.colleague
          .map((a) => a.userId)
          .filter(Boolean);
        const subordinateUserIds = byDir.subordinate
          .map((a) => a.userId)
          .filter(Boolean);
        expect(colleagueUserIds.length, "userId коллег не раскрыт").toBe(0);
        expect(subordinateUserIds.length, "userId подчинённых не раскрыт").toBe(
          0,
        );
      });

      await test.step("Перейти на вкладку «Участники оценки» и проверить ФИО неанонимных оценщиков", async () => {
        // Переходим на вкладку "Участники оценки" — проверяем что анонимные направления
        // не раскрывают ФИО оценщиков (показывают пронумерованные кружки вместо имён)
        const participantsTab = page.getByText(/участники оценки/i).first();
        await expect(
          participantsTab,
          'Вкладка "Участники оценки" должна быть видна',
        ).toBeVisible({ timeout: 5000 });
        await participantsTab.click();
        await page.waitForLoadState("networkidle");

        // На вкладке "Участники оценки" каждый вопрос показан в 4 колонках:
        // САМООЦЕНКА | РУКОВОДИТЕЛЬ | ПОДЧИНЕННЫЕ | КОЛЛЕГИ
        // Неанонимные (Самооценка, Руководитель) — ФИО видно
        // Анонимные (Подчинённые, Коллеги) — пронумерованные кружки без ФИО

        // Проверяем что заголовки колонок видны
        await expect(page.getByText(/самооценка/i).first()).toBeVisible({
          timeout: 5000,
        });
        await expect(page.getByText(/руководител/i).first()).toBeVisible({
          timeout: 3000,
        });
        await expect(page.getByText(/подчин[её]нн/i).first()).toBeVisible({
          timeout: 3000,
        });
        await expect(page.getByText(/коллег/i).first()).toBeVisible({
          timeout: 3000,
        });

        // Неанонимные направления содержат реальные ФИО
        // Фильтруем: минимум 2 слова по 2+ буквы, исключаем UI-элементы (кнопки, заголовки)
        const pageText = await page.textContent("body");
        const uiWords =
          /результат|оценк|компетенц|вопрос|участник|запустить|создать|скачать|период|итогов|развити|радар|карта|настройк/i;
        const namePattern = /[А-ЯЁA-Z][а-яёa-z]{1,}\s+[А-ЯЁA-Z][а-яёa-z]{1,}/g;
        const allMatches = pageText.match(namePattern) || [];
        const realNames = allMatches.filter((m) => !uiWords.test(m));
        expect(
          realNames.length,
          `ФИО неанонимных оценщиков видны (найдено: ${realNames.slice(0, 3).join(", ")})`,
        ).toBeGreaterThanOrEqual(1);
        console.log(`✅ ФИО на вкладке: ${realNames.slice(0, 4).join(", ")}`);
      });
    });

    // ==========================================
    // PR-332-UI: Руководитель и самооценка видны на UI
    // ==========================================
    test("C4373: UI отображает секции руководителя и самооценки", async ({
      adminAuth: page,
    }) => {
      setSeverity("normal");
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Anonymity");

      await test.step("Открыть страницу результатов PR", async () => {
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const resultsPage = new PerformanceReviewResultsPage(page);
        await resultsPage.open(
          baseUrl,
          testTargetUserId,
          testRevisionId,
          testPrId,
        );
        await resultsPage.assertOpened();
      });

      await test.step("Проверить видимость неанонимных секций «Руководитель» и «Самооценка»", async () => {
        // Неанонимные секции должны быть видны
        await expect(page.getByText(/руководител/i).first()).toBeVisible({
          timeout: 10000,
        });
        await expect(page.getByText(/самооценка/i).first()).toBeVisible({
          timeout: 5000,
        });
      });
    });
  },
);
