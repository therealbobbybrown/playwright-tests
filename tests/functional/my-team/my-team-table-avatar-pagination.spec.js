import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import { OrgStructureAPI } from "../../utils/api/OrgStructureAPI.js";
import { PerformanceReviewAPI } from "../../utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Моя команда — Аватар сотрудника на 2-й странице пагинации ведёт в профиль",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    let testPrId;
    let testPrTitle;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(120_000);

      const { email, password } = getCredentials("admin");

      // Получаем активных пользователей (любых, не обязательно подчинённых)
      const orgApi = new OrgStructureAPI(request);
      await orgApi.signIn(email, password);
      const { data: usersData } = await orgApi.getUsers({
        limit: 3000,
        category: "active",
      });
      const allUsers =
        usersData?.items || (Array.isArray(usersData) ? usersData : []);

      // Берём 40 активных пользователей для target users
      const userIds = allUsers
        .map((u) => u.id)
        .filter(Boolean)
        .slice(0, 40);

      if (userIds.length < 26) {
        throw new Error(
          `Нужно минимум 26 активных пользователей для пагинации (размер страницы 25), найдено ${userIds.length}.`,
        );
      }

      console.log(`Найдено ${allUsers.length} активных пользователей, используем ${userIds.length} для target users`);

      // Создаём PR через admin API
      const prApi = new PerformanceReviewAPI(request);
      await prApi.signIn(email, password);

      // Получаем доступную анкету
      const { data: assessmentsData } = await prApi.get(
        "/manager/assessments/?limit=10&status=published",
      );
      const assessments = assessmentsData?.items || [];
      if (assessments.length === 0) {
        throw new Error("Нет опубликованных анкет для запуска PR");
      }
      const assessmentId = assessments[0].id;

      // Создаём PR
      testPrTitle = `C7493_Pagination_${Date.now()}`;
      const { response: createResp, data: createData } = await prApi.create({
        title: testPrTitle,
        directions: [
          { id: null, receiverType: "self", isSelected: true, title: null, description: null },
          { id: null, receiverType: "head", isSelected: true, title: null, description: null },
          { id: null, receiverType: "subordinate", isSelected: false, title: null, description: null },
          { id: null, receiverType: "colleague", isSelected: false, title: null, description: null },
        ],
        anonymityType: "anonymous",
        workflowType: "basic",
        notificationsSchedule: {
          enableReminds: false,
          baseDate: new Date().toISOString(),
          repeatType: "everyWorkDay",
          timezoneOffset: new Date().getTimezoneOffset(),
        },
        isApprovalStep: false,
        isAsyncSteps: false,
        isAsyncStepsSelfResponseStep: false,
        minReceiversCount: 1,
        maxReceiversCount: 10,
      });

      if (!createResp.ok()) {
        throw new Error(
          `Не удалось создать PR: ${await createResp.text()}`,
        );
      }
      testPrId = createData.id;
      console.log(`Создан PR "${testPrTitle}" (ID: ${testPrId})`);

      // Добавляем target users
      const targets = userIds.map((userId) => ({
        targetType: "user",
        entityId: userId,
      }));
      await prApi.addTargetUsers(testPrId, { targets });

      // Привязываем анкету к направлениям
      const { data: prData } = await prApi.getById(testPrId);
      for (const dir of prData?.directions || []) {
        if (dir.isSelected) {
          await prApi.setAssessments(testPrId, {
            directionId: dir.id,
            assessmentsIds: [assessmentId],
          });
        }
      }

      // Запускаем PR
      const { response: startResp } = await prApi.start(testPrId);
      if (!startResp.ok()) {
        const errText = await startResp.text();
        throw new Error(`Не удалось запустить PR ${testPrId}: ${errText}`);
      }
      console.log(`PR ${testPrId} запущен с ${userIds.length} target users`);
    });

    test.afterAll(async ({ request }) => {
      if (!testPrId) return;
      const prApi = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await prApi.signIn(email, password);
      await prApi.stop(testPrId).catch(() => {});
      await prApi.archive(testPrId).catch(() => {});
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7495: Клик по аватару сотрудника на 2-й странице пагинации открывает его профиль",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        let expectedProfileUrl;

        await test.step("Открыть «Моя команда»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Выбрать тестовый PR из фильтра", async () => {
          await myTeamPage.selectPRFromModal(testPrTitle);
        });

        await test.step("Перейти на 2-ю страницу пагинации", async () => {
          // Пагинация — ссылки <a href="/ru/dashboard/?page=2">
          const page2Link = page
            .locator('a[href*="page=2"]')
            .or(page.getByRole("link", { name: "2", exact: true }))
            .first();

          await page2Link.waitFor({ state: "visible", timeout: 15000 });
          await page2Link.click();
          await page.waitForURL(/page=2/, { timeout: 10000 });
          await page.waitForLoadState("networkidle");
        });

        await test.step("Получить ссылку на профиль первого сотрудника на 2-й странице", async () => {
          const firstRow = myTeamPage.tableRows.first();
          await firstRow.waitFor({ state: "visible", timeout: 10000 });
          const avatarLink = firstRow
            .locator("td")
            .first()
            .locator('a[href*="/ru/profile/"]')
            .first();
          await avatarLink.waitFor({ state: "visible", timeout: 10000 });
          expectedProfileUrl = await avatarLink.getAttribute("href");
          expect(
            expectedProfileUrl,
            "На 2-й странице должна быть ссылка на профиль сотрудника",
          ).toMatch(/\/ru\/profile\/\d+/);
        });

        await test.step("Кликнуть по аватару сотрудника", async () => {
          const firstRow = myTeamPage.tableRows.first();
          const avatarLink = firstRow
            .locator("td")
            .first()
            .locator('a[href*="/ru/profile/"]')
            .first();
          await avatarLink.waitFor({ state: "visible", timeout: 10000 });
          await avatarLink.scrollIntoViewIfNeeded();
          await avatarLink.click();
        });

        await test.step("Проверить переход в профиль", async () => {
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 10000 });
          const currentUrl = page.url();
          expect(currentUrl).toMatch(/\/ru\/profile\/\d+/);
          expect(currentUrl).toContain(expectedProfileUrl);
        });
      },
    );
  },
);
