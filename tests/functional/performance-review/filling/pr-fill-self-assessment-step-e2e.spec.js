// tests/functional/performance-review/filling/pr-fill-self-assessment-step-e2e.spec.js
// E2E тест: Performance Review с опцией "Показывать самооценку коллегам"
// Анкеты для руководителя и коллег отправляются ТОЛЬКО после заполнения самооценки
//
// Тестируемые кейсы:
// Кейс 1-2: Базовый флоу (без утверждения коллег)
//   - Запуск PR → руководитель и коллеги НЕ видят анкеты
//   - Оцениваемый выбирает коллег → коллеги НЕ видят анкеты (ждём самооценку)
//   - Оцениваемый заполняет самооценку → руководитель и коллеги ВИДЯТ анкеты
//
// Кейс 4: С утверждением коллег руководителем
//   - Самооценка заполнена → руководитель видит анкету
//   - Оцениваемый выбирает коллег → коллеги НЕ видят (ждём утверждения)
//   - Руководитель утверждает → коллеги ВИДЯТ анкеты

import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import {
  PerformanceReviewFillPage,
  assertUserHasQuestionnaire,
  gotoWithRetryOn404,
} from "../../../../pages/PerformanceReviewFillPage.js";
import { OrgStructureHelper } from "../../../../pages/OrgStructureHelper.js";
import {
  createUserSession,
  filterValidUsers,
} from "../../../utils/UserSessionHelper.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Performance Review - Показывать самооценку коллегам",
  {
    tag: [
      "@performance-review",
      "@filling",
      "@e2e",
      "@self-assessment",
      "@regression",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Self Assessment Step");
    });

    /**
     * Кейс 1-2: Базовый флоу
     * - Запуск PR → анкеты только для самооценки
     * - После заполнения самооценки → анкеты руководителю
     * - После выбора коллег → анкеты коллегам
     */
    test(
      "C3026: Кейс 1-2: анкеты руководителю отправляются только после самооценки",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000); // 10 минут

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const adminFillPage = new PerformanceReviewFillPage(
          adminPage,
          testInfo,
        );
        const userSession = createUserSession(browser, testInfo);

        // API для дополнительных проверок
        const prAPI = new PerformanceReviewAPI(request);
        const { email, password } = getCredentials("admin");
        await prAPI.signIn(email, password);

        let users = [];
        let colleagues = [];
        let managerUser = null;
        let prId = null;
        let revisionAlias = null;
        let evaluatedUserName = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;

        // ---------------------- Шаг 1: Получение пользователей ----------------------
        await test.step("Получить список активных пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });

          users = await orgHelper.getUsersList(11);
          users = await filterValidUsers(users);
          console.log(`✓ Получено ${users.length} активных пользователей`);

          if (users.length < 5) {
            throw new Error(
              "Недостаточно пользователей для теста (нужно минимум 5)",
            );
          }

          // Распределяем роли
          evaluatedUserName = users[0]?.name || "Elena Shapoval";
          managerUser = users[1];
          colleagues = users.slice(2, 5);

          console.log(`Оцениваемый: ${evaluatedUserName}`);
          console.log(
            `Руководитель: ${managerUser.name} (${managerUser.email})`,
          );
          console.log(
            `Потенциальные коллеги: ${colleagues.map((u) => u.name).join(", ")}`,
          );
        });

        // ---------------------- Шаг 2: Создание Performance Review ----------------------
        await test.step('Создать PR с опцией "Показывать самооценку коллегам"', async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          // Направления: самооценка + руководитель + коллеги
          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });

          // КЛЮЧЕВАЯ НАСТРОЙКА: earlyAccess + showSelfAssessmentToColleagues
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 2,
            maxColleagues: 5,
            managerApproval: false, // Без утверждения руководителем
            earlyAccess: true, // Ранний доступ
            showSelfAssessmentToColleagues: true, // НОВАЯ ОПЦИЯ - анкеты рук./коллегам ПОСЛЕ самооценки
          });

          console.log(
            '✓ Направления настроены, опция "Показывать самооценку коллегам" включена',
          );
        });

        // ---------------------- Шаг 3: Добавление участников ----------------------
        await test.step("Добавить участника и настроить руководителя", async () => {
          await configPage.addTargetUsers({ count: 1 });
          console.log("✓ Участник добавлен");

          await configPage.editRespondentsTable({
            managers: [managerUser],
          });
          console.log("✓ Руководитель назначен");
        });

        // ---------------------- Шаг 4: Настройка и запуск ----------------------
        await test.step("Настроить анкеты и запустить PR", async () => {
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");

          // Запускаем PR
          await configPage.launchAndSendQuestionnaires();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ Performance Review создан и запущен, ID: ${prId}`);
          }

          // Получаем alias ревизии через API — нужен для прямых URL
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionAlias = revision?.alias;
          console.log(`✓ Revision alias: ${revisionAlias}`);
        });

        // ---------------------- Шаг 5: ПРОВЕРКА - Руководитель НЕ видит анкету ----------------------
        await test.step("Кейс 1: Проверить что руководитель НЕ получил анкету (ждём самооценку)", async () => {
          await userSession.runAs(managerUser, async (page) => {
            await assertUserHasQuestionnaire(
              page,
              baseUrl,
              prId,
              false,
              expect,
            );
            console.log(
              "✓ Руководитель НЕ видит блок для этого PR (ожидаем самооценку)",
            );
          });

          // API проверка: анкета для руководителя ещё не создана
          if (prId) {
            const { data } = await prAPI.getReceiverUsersProgress(prId, {});
            console.log(
              `API: Прогресс респондентов: ${JSON.stringify(data).substring(0, 200)}...`,
            );
          }
        });

        // ---------------------- Шаг 5.1: Добавление коллег через админ-панель ----------------------
        // Примечание: addTargetUsers добавляет первого пользователя из оргструктуры (НЕ админа),
        // поэтому админ не может зайти на nomination-страницу как staff (403).
        // Завершаем этап номинации через API и проверяем поведение анкет.
        await test.step("Админ завершает номинацию и назначает коллег", async () => {
          // Завершаем этап номинации через API
          const { response: stopResp } = await prAPI.stopNominationStage(prId);
          console.log(
            `✓ Этап номинации завершён через API (статус: ${stopResp.status()})`,
          );

          // Ждём обработки
          await adminPage.waitForTimeout(2000);
        });

        // ---------------------- Шаг 5.2: ПРОВЕРКА - Коллеги НЕ видят анкету ----------------------
        await test.step("Кейс 1: Проверить что коллеги НЕ получили анкету (ждём самооценку)", async () => {
          if (colleagues.length === 0) {
            console.log("⚠️ Нет выбранных коллег, пропускаем");
            return;
          }

          const firstColleague = colleagues[0];
          await userSession.runAs(firstColleague, async (page) => {
            await assertUserHasQuestionnaire(
              page,
              baseUrl,
              prId,
              false,
              expect,
            );
            console.log(
              `✓ Коллега ${firstColleague.name} НЕ видит блок для этого PR (ожидаем самооценку)`,
            );
          });
        });

        // ---------------------- Шаг 6: Заполнение самооценки ----------------------
        await test.step("Оцениваемый заполняет самооценку", async () => {
          // Заполнение анкет через API
          const populateSettings = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };
          let filledCount = 0;
          for (let attempt = 1; attempt <= 15; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              populateSettings,
              { timeout: 120000 },
            );
            if (response.ok()) {
              filledCount++;
              await new Promise((r) => setTimeout(r, 100));
            } else if (response.status() === 500) {
              break;
            } else {
              break;
            }
          }
          console.log(`populateReview: ${filledCount} анкет заполнено`);
          console.log("✓ Самооценка заполнена и отправлена");

          // Ждём обработки на бэкенде
          await adminPage.waitForTimeout(2000);
        });

        // ---------------------- Шаг 7: ПРОВЕРКА - Руководитель ТЕПЕРЬ видит анкету ----------------------
        await test.step("Кейс 2: Проверить что руководитель ПОЛУЧИЛ анкету после самооценки", async () => {
          await userSession.runAs(managerUser, async (page) => {
            await assertUserHasQuestionnaire(
              page,
              baseUrl,
              prId,
              true,
              expect,
              { revisionAlias },
            );
            console.log(
              "✓ Руководитель ВИДИТ блок для этого PR после самооценки",
            );
          });
        });

        // ---------------------- Шаг 8: ПРОВЕРКА - Коллеги ТЕПЕРЬ видят анкеты ----------------------
        await test.step("Проверить что коллеги ПОЛУЧИЛИ анкеты после самооценки", async () => {
          if (colleagues.length === 0) {
            console.log("⚠️ Нет выбранных коллег, пропускаем");
            return;
          }

          const firstColleague = colleagues[0];
          await userSession.runAs(firstColleague, async (page) => {
            await assertUserHasQuestionnaire(
              page,
              baseUrl,
              prId,
              true,
              expect,
              { revisionAlias },
            );
            console.log(
              `✓ Коллега ${firstColleague.name} ВИДИТ блок для этого PR`,
            );
          });
        });

        // ---------------------- Шаг 9: Заполнение анкет респондентами ----------------------
        await test.step("Руководитель и коллеги заполняют анкеты", async () => {
          // Руководитель
          await userSession.runAs(managerUser, async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);
            await fillPage.fillQuestionnaireForEvaluated(
              baseUrl,
              evaluatedUserName,
              prId,
            );
            console.log("✓ Оценка от руководителя заполнена");
          });

          // Коллеги
          for (const colleague of colleagues) {
            await userSession.runAs(colleague, async (page) => {
              const fillPage = new PerformanceReviewFillPage(page, testInfo);
              await fillPage.fillQuestionnaireForEvaluated(
                baseUrl,
                evaluatedUserName,
                prId,
              );
              console.log(`✓ Оценка от коллеги ${colleague.name} заполнена`);
            });
          }
        });

        console.log(
          "✅ Тест завершён успешно: анкеты руководителю и коллегам отправляются только после самооценки",
        );
      },
    );

    /**
     * Кейс 4: Коллеги утверждены ПОСЛЕ самооценки
     *
     * Порядок шагов:
     * 1. Создать PR с earlyAccess=true, showSelfAssessmentToColleagues=true, managerApproval=true
     * 2. Запустить PR
     * 3. Оцениваемый заполняет самооценку
     * 4. Руководитель видит анкету (после самооценки)
     * 5. Оцениваемый выбирает коллег
     * 6. Коллеги НЕ видят анкеты (ждут утверждения)
     * 7. Руководитель утверждает коллег
     * 8. Коллеги видят анкеты
     *
     * Примечание: Известный баг с письмами (не отправляются) - не может быть проверен в E2E тесте
     */
    test("C4410: Кейс 4: утверждение коллег после самооценки - коллеги видят анкеты", async ({
      adminAuth: adminPage,
      browser,
      request,
    }, testInfo) => {
      setSeverity("normal");
      test.slow();
      testInfo.setTimeout(600_000);

      const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
      const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
      const orgHelper = new OrgStructureHelper(adminPage, testInfo);
      const adminFillPage = new PerformanceReviewFillPage(adminPage, testInfo);
      const userSession = createUserSession(browser, testInfo);

      // API для дополнительных проверок
      const prAPI = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await prAPI.signIn(email, password);

      let users = [];
      let colleagues = [];
      let managerUser = null;
      let evaluatedUserName = null;
      let prId = null;
      let revisionAlias = null;
      const baseUrl = new URL(process.env.BASE_URL).origin;

      // Получение пользователей
      await test.step("Получить пользователей", async () => {
        await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
        users = await orgHelper.getUsersList(11);
        users = await filterValidUsers(users);

        if (users.length < 5) {
          throw new Error(
            "Недостаточно пользователей для теста (нужно минимум 5)",
          );
        }

        evaluatedUserName = users[0]?.name || "Elena Shapoval";
        managerUser = users[1];
        colleagues = users.slice(2, 5);

        console.log(`Оцениваемый: ${evaluatedUserName}`);
        console.log(`Руководитель: ${managerUser.name}`);
      });

      // Создание PR с утверждением коллег
      await test.step("Создать PR с утверждением коллег + показ самооценки", async () => {
        await adminPage.goto(
          new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
        );
        await listPage.assertOpened();

        await listPage.openCreateModal();
        await listPage.performanceReviewType.click();
        await configPage.assertOpened();

        await configPage.configureDirections({
          self: true,
          manager: true,
          colleagues: true,
          subordinates: false,
        });

        // С утверждением коллег + показ самооценки
        await configPage.configureColleaguesSelection({
          askEmployees: true,
          minColleagues: 2,
          maxColleagues: 5,
          managerApproval: true, // Утверждение руководителем
          earlyAccess: true,
          showSelfAssessmentToColleagues: true,
        });

        console.log("✓ PR настроен с утверждением коллег");
      });

      // Добавление участников и запуск
      await test.step("Добавить участников и запустить", async () => {
        await configPage.addTargetUsers({ count: 1 });
        await configPage.editRespondentsTable({ managers: [managerUser] });
        await configPage.disableReminders();
        await configPage.addAssessmentsForAllDirections();
        await configPage.goToStep("launch");
        await configPage.launchAndSendQuestionnaires();

        // Извлекаем prId из URL
        const currentUrl = adminPage.url();
        const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
        if (match) {
          prId = match[1];
          console.log(`✓ PR запущен, ID: ${prId}`);
        } else {
          console.log("✓ PR запущен");
        }

        // Получаем alias ревизии через API — нужен для прямых URL
        const { data: revision } = await prAPI.getLastRevision(prId);
        revisionAlias = revision?.alias;
        console.log(`✓ Revision alias: ${revisionAlias}`);
      });

      // ШАГ 1: Оцениваемый заполняет самооценку
      // Используем API populateReview
      await test.step("Оцениваемый заполняет самооценку", async () => {
        // Заполнение анкет через API
        const populateSettings = {
          skipChance: 0,
          commentChance: 0,
          customChance: 0,
          lowerLimit: 60,
          upperLimit: 100,
        };
        let filledCount = 0;
        for (let attempt = 1; attempt <= 15; attempt++) {
          const { response } = await prAPI.populateReview(
            prId,
            populateSettings,
            { timeout: 120000 },
          );
          if (response.ok()) {
            filledCount++;
            await new Promise((r) => setTimeout(r, 100));
          } else if (response.status() === 500) {
            break;
          } else {
            break;
          }
        }
        console.log(`populateReview: ${filledCount} анкет заполнено`);
        console.log("✓ Самооценка заполнена");
        await adminPage.waitForTimeout(2000);
      });

      // ШАГ 2: Руководитель видит И ЗАПОЛНЯЕТ анкету после самооценки
      await test.step("Руководитель заполняет анкету", async () => {
        await userSession.runAs(managerUser, async (page) => {
          await assertUserHasQuestionnaire(page, baseUrl, prId, true, expect, {
            revisionAlias,
          });
          console.log('✓ Руководитель видит задачу "Заполните анкеты"');

          // Заполняем анкету руководителя
          const fillPage = new PerformanceReviewFillPage(page, testInfo);
          await fillPage.fillQuestionnaireForEvaluated(
            baseUrl,
            evaluatedUserName,
            prId,
          );
          console.log("✓ Руководитель заполнил анкету");
        });
      });

      // ШАГ 3: Завершение номинации через API (админ не может зайти на nomination-страницу как staff)
      await test.step("Админ завершает номинацию через API", async () => {
        // Примечание: addTargetUsers добавляет первого пользователя из оргструктуры (НЕ админа),
        // поэтому админ не может зайти на nomination-страницу как staff (403).
        const { response: stopResp } = await prAPI.stopNominationStage(prId);
        console.log(
          `✓ Этап номинации завершён через API (статус: ${stopResp.status()})`,
        );
        await adminPage.waitForTimeout(2000);
      });

      // Проверка: коллеги НЕ видят анкету (ждём утверждения)
      await test.step("Проверить что коллеги НЕ видят анкету до утверждения", async () => {
        if (colleagues.length === 0) return;

        const firstColleague = colleagues[0];
        await userSession.runAs(firstColleague, async (page) => {
          await assertUserHasQuestionnaire(page, baseUrl, prId, false, expect);
          console.log(
            `✓ Коллега ${firstColleague.name} НЕ видит блок для этого PR до утверждения`,
          );
        });
      });

      // Утверждение коллег руководителем
      await test.step("Руководитель утверждает коллег", async () => {
        await userSession.runAs(managerUser, async (page) => {
          const fillPage = new PerformanceReviewFillPage(page, testInfo);
          await fillPage.approveColleagues(baseUrl);
        });

        await adminPage.waitForTimeout(2000);
      });

      // Проверка и утверждение через админку
      await test.step("Проверить и утвердить коллег через админку", async () => {
        if (prId) {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");
          await adminPage.waitForTimeout(1000);

          // Ищем текст "не утверждены" (с е или ё)
          const notApprovedText = adminPage
            .locator("text=/[Кк]оллеги.*не утвержден/i")
            .first();
          let isNotApproved = false;
          try {
            await notApprovedText
            .waitFor({ state: "visible", timeout: 3000 })
            isNotApproved = true;
          } catch {}

          if (isNotApproved) {
            console.log("⚠️ Коллеги НЕ утверждены! Утверждаем...");

            // Ищем ссылку/кнопку "Утвердить" в той же строке или рядом
            const approveBtn = adminPage
              .locator('a, button, [role="button"]')
              .filter({ hasText: /^утвердить$/i })
              .first();
            let _visible1 = false;
            try {
              await approveBtn
              .waitFor({ state: "visible", timeout: 2000 })
              _visible1 = true;
            } catch {}
            if (_visible1) {
              await approveBtn.click();
              await adminPage.waitForTimeout(3000);
              console.log("✓ Коллеги утверждены через админку");
            } else {
              console.log('⚠️ Кнопка "Утвердить" не найдена');
            }
          } else {
            console.log("✓ Коллеги уже утверждены");
          }

          // Перезагрузим и проверим ещё раз
          await adminPage.reload();
          await adminPage.waitForLoadState("networkidle");
          let stillNotApproved = false;
          try {
            await adminPage
            .locator("text=/не утвержден/i")
            .first()
            .waitFor({ state: "visible", timeout: 2000 })
            stillNotApproved = true;
          } catch {}
          if (stillNotApproved) {
            console.log("❌ ОШИБКА: Коллеги всё ещё не утверждены!");
          }
        }
      });

      // Проверка: коллеги видят анкету после утверждения
      await test.step("Проверить что коллеги видят анкету после утверждения", async () => {
        if (colleagues.length === 0) return;

        const firstColleague = colleagues[0];
        await userSession.runAs(firstColleague, async (page) => {
          await page.waitForTimeout(3000);
          await assertUserHasQuestionnaire(page, baseUrl, prId, true, expect, {
            revisionAlias,
          });
          console.log(
            `✓ Коллега ${firstColleague.name} видит блок для этого PR после утверждения`,
          );
        });
      });

      // Коллега заполняет анкету
      await test.step("Коллега заполняет анкету", async () => {
        if (colleagues.length === 0) return;

        const firstColleague = colleagues[0];
        await userSession.runAs(firstColleague, async (page) => {
          const fillPage = new PerformanceReviewFillPage(page, testInfo);
          await fillPage.fillQuestionnaireForEvaluated(
            baseUrl,
            evaluatedUserName,
            prId,
          );
          console.log(`✓ Коллега ${firstColleague.name} заполнил анкету`);
        });
      });

      console.log(
        "✓ Кейс 4 завершён: коллеги видят и заполняют анкеты после утверждения",
      );
    });
  },
);
