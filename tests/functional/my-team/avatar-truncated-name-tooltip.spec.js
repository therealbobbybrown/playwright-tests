import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import { DashboardStatusSeed } from "../../utils/seed/DashboardStatusSeed.js";
import { OrgStructureAPI } from "../../utils/api/OrgStructureAPI.js";
import { PerformanceReviewAPI } from "../../utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

const LONG_FIRST_NAME =
  "Чрезвычайно-Длинное-Составное-Имя-Сотрудника-Ивановича";

test.describe(
  "Моя команда — Усечённое имя показывает тултип с полным ФИО",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    let testPrId;
    let testPrTitle;
    let targetUserId;
    let originalFirstName;
    let originalLastName;
    let originalRoleIds;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(120_000);

      const { email, password } = getCredentials("admin");

      // Шаг 1: Инициализировать seed, найти subordinate
      const seed = new DashboardStatusSeed(request);
      await seed.init();
      const subordinateIds = seed.getSubordinateIds(1);
      if (subordinateIds.length === 0) {
        throw new Error(
          "Нет подчинённых менеджера. У менеджера должны быть существующие PRs в дашборде.",
        );
      }
      targetUserId = subordinateIds[0];

      // Шаг 2: Сохранить оригинальное имя и обновить на длинное
      const orgApi = new OrgStructureAPI(request);
      await orgApi.signIn(email, password);
      const { data: userData } = await orgApi.get(
        `/manager/users/${targetUserId}/`,
      );
      originalFirstName = userData.firstName;
      originalLastName = userData.lastName;
      originalRoleIds = (userData.roles || []).map((r) => r.id);

      const updateResp = await orgApi.post(`/manager/users/${targetUserId}/`, {
        firstName: LONG_FIRST_NAME,
        lastName: originalLastName,
        rolesIds: originalRoleIds,
      });
      if (!updateResp.response.ok()) {
        throw new Error(
          `Не удалось обновить имя пользователя ${targetUserId}: ${await updateResp.response.text()}`,
        );
      }

      // Шаг 3: Создать тестовый PR, добавить пользователя, запустить
      testPrTitle = `C7494_Truncated_${Date.now()}`;
      const { id } = await seed.createPR({
        title: testPrTitle,
        directions: { self: true, head: true },
      });
      testPrId = id;
      await seed.addTargetUsers(testPrId, [targetUserId]);

      const assessment = await seed.getAvailableAssessment();
      if (!assessment) {
        throw new Error("Нет опубликованных анкет для запуска PR");
      }
      await seed.attachAssessment(testPrId, assessment.id);

      const started = await seed.startPR(testPrId);
      if (!started) {
        throw new Error(`Не удалось запустить PR ${testPrId}`);
      }
    });

    test.afterAll(async ({ request }) => {
      const { email, password } = getCredentials("admin");

      // Архивировать тестовый PR
      if (testPrId) {
        const prApi = new PerformanceReviewAPI(request);
        await prApi.signIn(email, password);
        await prApi.stop(testPrId).catch(() => {});
        await prApi.archive(testPrId).catch(() => {});
      }

      // Восстановить оригинальное имя
      if (targetUserId !== undefined && originalFirstName !== undefined) {
        const orgApi = new OrgStructureAPI(request);
        await orgApi.signIn(email, password);
        await orgApi.post(`/manager/users/${targetUserId}/`, {
          firstName: originalFirstName,
          lastName: originalLastName,
          rolesIds: originalRoleIds,
        });
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7490: Усечённое имя сотрудника при наведении показывает тултип с полным ФИО",
      { tag: ["@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        let truncatedRow = null;
        let fullName = null;

        await test.step("Открыть «Моя команда»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Выбрать тестовый PR из фильтра", async () => {
          await myTeamPage.selectPRFromModal(testPrTitle);
        });

        await test.step("Найти сотрудника с усечённым именем", async () => {
          const result = await myTeamPage.findTruncatedNameRow();
          expect(
            result,
            "Должен быть найден сотрудник с усечённым именем (beforeAll задал длинное имя)",
          ).not.toBeNull();
          truncatedRow = result.row;
          fullName = result.fullName;
        });

        await test.step("Навести курсор на усечённое имя", async () => {
          const nameEl = truncatedRow
            .locator('[class*="User_full-name-wrapper"] > div')
            .first();
          await nameEl.hover();
        });

        await test.step("Проверить, что тултип содержит полное ФИО", async () => {
          const tooltipText = await myTeamPage.getTooltipText();
          expect(
            tooltipText,
            `Тултип должен содержать полное ФИО «${fullName}»`,
          ).toContain(fullName);
        });
      },
    );
  },
);
