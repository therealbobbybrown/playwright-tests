// tests/functional/api/objectives-approval-api-ceo-branches.spec.js
// TestRail: C-APPROVAL-CEO-01, C-APPROVAL-CEO-02
// Генеральный своей ветки может утвердить, чужой ветки — нет
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

// Оргструктура компании 538:
// user (91461) → head (91407) → manager/CEO-A (54288, head=самому себе)
// Андрей Павлов (68356, head=самому себе) — корневой в ОТДЕЛЬНОЙ ветке
// CEO-A — генеральный в ветке user'а (косвенный руководитель)
// Stranger — генеральный в совершенно ЧУЖОЙ ветке (никак не связан с user)
// Проверено: 68356 не является ни прямым, ни косвенным руководителем user(91461)

const STRANGER_EMAIL = "qaadmin+acc+3@example.org";
const STRANGER_PASSWORD = "DemoPass_7421!";

let objectiveIdForCeoA = null;
let objectiveIdForCeoB = null;
let initialApprovalEnabled = null;
const createdIds = [];

test.describe(
  "Objectives Approval API — CEO из разных веток",
  { tag: ["@api", "@objectives", "@approval", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email: ae, password: ap } = getCredentials("admin");
      await adminApi.signIn(ae, ap);

      const { data: settings } = await adminApi.getCompanySettings();
      initialApprovalEnabled =
        settings?.isObjectivesApprovalEnabled ??
        settings?.is_objectives_approval_enabled ??
        false;
      await adminApi.setApprovalEnabled(true);

      const userApi = new ObjectivesAPI(request);
      const { email: ue, password: up } = getCredentials("user");
      await userApi.signIn(ue, up);
      const userId = userApi.getCurrentUserId();
      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();

      // Цель 1 — для CEO-A (manager, своя ветка)
      const { data: obj1 } = await userApi.saveObjective({
        title: `CEO-A test ${Date.now()}`,
        startDate, endDate, status: "active", level: "self",
        responsibleUserId: userId, userAccessType: "everybody",
        milestones: [{ temporaryId: `t-ceoa-${Date.now()}`, title: "KR", type: "percent", weight: 100, progress: 0, responsibleUserId: userId }],
      });
      objectiveIdForCeoA = obj1.id;
      createdIds.push(obj1.id);
      await userApi.sendForApproval(obj1.id);
      console.log(`[beforeAll] Цель для CEO-A id=${obj1.id}`);

      // Цель 2 — для Stranger (Андрей Павлов 68356, полностью чужая ветка)
      const { data: obj2 } = await userApi.saveObjective({
        title: `Stranger test ${Date.now()}`,
        startDate, endDate, status: "active", level: "self",
        responsibleUserId: userId, userAccessType: "everybody",
        milestones: [{ temporaryId: `t-ceob-${Date.now()}`, title: "KR", type: "percent", weight: 100, progress: 0, responsibleUserId: userId }],
      });
      objectiveIdForCeoB = obj2.id;
      createdIds.push(obj2.id);
      await userApi.sendForApproval(obj2.id);
      console.log(`[beforeAll] Цель для Stranger id=${obj2.id}`);
    });

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of createdIds) {
        await api.deleteObjective(id).catch(() => {});
      }

      if (initialApprovalEnabled !== null) {
        await api.setApprovalEnabled(initialApprovalEnabled).catch(() => {});
      }
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES);
    });

    test(
      "C8371: Генеральный своей ветки (косвенный руководитель) может утвердить цель",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const managerApi = new ObjectivesAPI(request);
        const { email, password } = getCredentials("manager");
        await managerApi.signIn(email, password);

        await test.step("CEO своей ветки (manager) утверждает цель подчинённого", async () => {
          const { response } = await managerApi.approveObjective(objectiveIdForCeoA);
          expect(
            response.status(),
            "Генеральный своей ветки (manager=CEO-A) должен мочь утвердить цель подчинённого",
          ).toBe(200);
        });

        await test.step("Проверить что статус стал approved", async () => {
          const userApi = new ObjectivesAPI(request);
          await userApi.signIn(getCredentials("user").email, getCredentials("user").password);
          const { data } = await userApi.getObjectiveById(objectiveIdForCeoA);
          const obj = data?.objective || data;
          expect(obj.approvalStatus).toBe("approved");
        });
      },
    );

    test(
      "C8372: Совершенно чужой сотрудник НЕ может утвердить цель",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        // Stranger = Андрей Павлов (68356) — корневой в отдельной ветке,
        // НЕ является ни прямым, ни косвенным руководителем user(91461)
        const strangerApi = new ObjectivesAPI(request);
        await strangerApi.signIn(STRANGER_EMAIL, STRANGER_PASSWORD);

        await test.step("Чужой сотрудник пытается утвердить цель → ожидаем 403", async () => {
          const { response } = await strangerApi.approveObjective(objectiveIdForCeoB);

          // APP_BUG (проверено 2026-03-20): бэкенд возвращает 200 — ЛЮБОЙ сотрудник может утвердить чужую цель
          expect(
            response.status(),
            "APP_BUG: чужой сотрудник (не руководитель, не в цепочке) получает 200 вместо 403. Бэкенд не проверяет оргструктуру",
          ).toBe(403);
        });
      },
    );
  },
);
