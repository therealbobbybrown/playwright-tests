// tests/functional/api/objectives-approval-api-author-edit-process.spec.js
// TestRail: C-APPROVAL-AUTHEDIT-01, C-APPROVAL-AUTHEDIT-02
// По брифу 6.1.3: автор в статусе "На утверждении" может редактировать и удалять цель
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

let objectiveId1 = null;
let objectiveId2 = null;
let milestones = null;
let initialApprovalEnabled = null;

test.describe(
  "Objectives Approval API — Автор может edit/delete в approvalProcess",
  { tag: ["@api", "@objectives", "@approval", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      await adminApi.signIn(getCredentials("admin").email, getCredentials("admin").password);

      const { data: settings } = await adminApi.getCompanySettings();
      initialApprovalEnabled =
        settings?.isObjectivesApprovalEnabled ??
        settings?.is_objectives_approval_enabled ??
        false;
      await adminApi.setApprovalEnabled(true);

      const userApi = new ObjectivesAPI(request);
      await userApi.signIn(getCredentials("user").email, getCredentials("user").password);
      const userId = userApi.getCurrentUserId();
      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
      const ts = Date.now();

      // Цель 1 — для редактирования
      const { data: obj1 } = await userApi.saveObjective({
        title: `AUTHEDIT-edit ${ts}`, startDate, endDate, status: "active", level: "self",
        responsibleUserId: userId, userAccessType: "everybody",
        milestones: [{ temporaryId: `t-ae1-${ts}`, title: "KR", type: "percent", weight: 100, progress: 0, responsibleUserId: userId }],
      });
      objectiveId1 = obj1.id;
      await userApi.sendForApproval(objectiveId1);

      // Получаем полный объект (с milestones) для редактирования
      const { data: full } = await userApi.getObjectiveById(objectiveId1);
      const o = full?.objective || full;
      milestones = o.milestones;

      // Цель 2 — для удаления
      const { data: obj2 } = await userApi.saveObjective({
        title: `AUTHEDIT-delete ${ts}`, startDate, endDate, status: "active", level: "self",
        responsibleUserId: userId, userAccessType: "everybody",
        milestones: [{ temporaryId: `t-ae2-${ts}`, title: "KR2", type: "percent", weight: 100, progress: 0, responsibleUserId: userId }],
      });
      objectiveId2 = obj2.id;
      await userApi.sendForApproval(objectiveId2);

      console.log(`[beforeAll] obj1=${objectiveId1} obj2=${objectiveId2} (approvalProcess)`);
    });

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      await api.signIn(getCredentials("admin").email, getCredentials("admin").password);
      if (objectiveId1) await api.deleteObjective(objectiveId1).catch(() => {});
      if (objectiveId2) await api.deleteObjective(objectiveId2).catch(() => {});
      if (initialApprovalEnabled !== null) {
        await api.setApprovalEnabled(initialApprovalEnabled).catch(() => {});
      }
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES);
    });

    test(
      "C8386: Автор может редактировать цель в статусе approvalProcess через API",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const userApi = new ObjectivesAPI(request);
        await userApi.signIn(getCredentials("user").email, getCredentials("user").password);
        const userId = userApi.getCurrentUserId();
        const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();

        const newTitle = `AUTHEDIT-modified ${Date.now()}`;

        await test.step("Автор вызывает saveObjective с новым title", async () => {
          const { response } = await userApi.saveObjective({
            id: objectiveId1,
            title: newTitle,
            startDate, endDate, status: "active", level: "self",
            responsibleUserId: userId, userAccessType: "everybody",
            milestones,
          });
          expect(
            response.status(),
            "Автор должен мочь редактировать цель в approvalProcess (по брифу 6.1.3)",
          ).toBe(201);
        });

        await test.step("Title обновился", async () => {
          const { data } = await userApi.getObjectiveById(objectiveId1);
          const obj = data?.objective || data;
          expect(obj.title).toBe(newTitle);
        });

        await test.step("Статус остался approvalProcess", async () => {
          const { data } = await userApi.getObjectiveById(objectiveId1);
          const obj = data?.objective || data;
          expect(obj.approvalStatus).toBe("approvalProcess");
        });
      },
    );

    test(
      "C8387: Автор может удалить цель в статусе approvalProcess через API",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const userApi = new ObjectivesAPI(request);
        await userApi.signIn(getCredentials("user").email, getCredentials("user").password);

        await test.step("Автор удаляет цель", async () => {
          const { response } = await userApi.deleteObjective(objectiveId2);
          expect(
            response.status(),
            "Автор должен мочь удалить цель в approvalProcess (по брифу 6.1.3)",
          ).toBe(200);
        });

        await test.step("Цель больше недоступна", async () => {
          const { response } = await userApi.getObjectiveById(objectiveId2);
          // Удалённая цель: 404 или пустой ответ
          const status = response.status();
          expect([200, 404].includes(status)).toBe(true);
          if (status === 200) {
            const { data } = await userApi.getObjectiveById(objectiveId2);
            const obj = data?.objective || data;
            // Если API возвращает удалённую цель — проверяем статус
            if (obj) {
              expect(obj.status === "deleted" || obj.status === "archived").toBe(true);
            }
          }
        });

        // Обнуляем чтобы afterAll не пытался удалить
        objectiveId2 = null;
      },
    );
  },
);
