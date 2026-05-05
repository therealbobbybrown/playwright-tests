// tests/functional/objectives/objective-approval-reenable-restore.spec.js
// TestRail: C-APPROVAL-TOGGLE-03 — Повторное включение утверждения: предыдущие статусы восстанавливаются
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

let initialApprovalEnabled = null;
const createdObjectiveIds = [];

/**
 * Создать активную цель от имени user.
 */
async function createUserObjective(userApi, suffix) {
  const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
  const userId = userApi.getCurrentUserId();
  if (!userId) {
    throw new Error(
      "Не удалось получить userId — проверь credentials",
    );
  }

  const { response, data } = await userApi.saveObjective({
    title: `Цель для toggle-reenable ${suffix}`,
    startDate,
    endDate,
    status: "active",
    level: "self",
    responsibleUserId: userId,
    userAccessType: "everybody",
    milestones: [
      {
        temporaryId: `temp-toggle-reenable-${suffix}`,
        title: `КР toggle-reenable ${suffix}`,
        type: "percent",
        weight: 100,
        progress: 0,
        responsibleUserId: userId,
      },
    ],
  });

  if (!response.ok()) {
    throw new Error(
      `Не удалось создать цель "${suffix}": ${response.status()} ${JSON.stringify(data)}`,
    );
  }
  const id = data?.id;
  if (!id) {
    throw new Error(
      `API не вернул ID для цели "${suffix}". Ответ: ${JSON.stringify(data)}`,
    );
  }
  return id;
}

/**
 * Получить approvalStatus цели через GET.
 */
async function getApprovalStatus(api, objectiveId) {
  const { response, data } = await api.getObjectiveById(objectiveId);
  if (!response.ok()) {
    throw new Error(
      `GET /private/objectives/${objectiveId}/ вернул ${response.status()}`,
    );
  }
  const obj = data?.objective || data;
  return obj?.approvalStatus ?? null;
}

test.describe(
  "Утверждение целей — повторное включение: восстановление предыдущих статусов",
  { tag: ["@ui", "@objectives", "@approval", "@approval-toggle", "@regression"] },
  () => {
    // Записи формата { id, statusBeforeDisable }
    const objectiveSnapshots = [];

    test.beforeAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email: adminEmail, password: adminPassword } =
        getCredentials("admin");
      await adminApi.signIn(adminEmail, adminPassword);

      // Сохраняем начальное состояние
      const { data: settingsData } = await adminApi.getCompanySettings();
      initialApprovalEnabled =
        settingsData?.isObjectivesApprovalEnabled ??
        settingsData?.is_objectives_approval_enabled ??
        false;

      // Включаем утверждение
      const { response: enableResp } = await adminApi.setApprovalEnabled(true);
      if (!enableResp.ok()) {
        throw new Error(
          `Не удалось включить утверждение: ${enableResp.status()}`,
        );
      }

      const userApi = new ObjectivesAPI(request);
      const { email: userEmail, password: userPassword } =
        getCredentials("user");
      await userApi.signIn(userEmail, userPassword);

      const headApi = new ObjectivesAPI(request);
      const { email: headEmail, password: headPassword } =
        getCredentials("head");
      await headApi.signIn(headEmail, headPassword);

      const ts = Date.now();

      // Цель 1: approvalWaiting
      const id1 = await createUserObjective(userApi, `rw-${ts}-1`);
      createdObjectiveIds.push(id1);

      // Цель 2: approvalProcess
      const id2 = await createUserObjective(userApi, `rp-${ts}-2`);
      createdObjectiveIds.push(id2);
      const { response: sendResp } = await userApi.sendForApproval(id2);
      if (!sendResp.ok()) {
        throw new Error(
          `Не удалось отправить цель ${id2} на утверждение: ${sendResp.status()}`,
        );
      }

      // Цель 3: approved
      const id3 = await createUserObjective(userApi, `ra-${ts}-3`);
      createdObjectiveIds.push(id3);
      await userApi.sendForApproval(id3);
      const { response: approveResp } = await headApi.approveObjective(id3);
      if (!approveResp.ok()) {
        // Fallback: от admin
        await adminApi.approveObjective(id3).catch(() => {});
      }

      // Фиксируем статусы ДО выключения
      for (const id of createdObjectiveIds) {
        const status = await getApprovalStatus(adminApi, id);
        objectiveSnapshots.push({ id, statusBeforeDisable: status });
        console.log(
          `[beforeAll] Цель id=${id} statusBeforeDisable='${status}'`,
        );
      }
    });

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of createdObjectiveIds) {
        await api.deleteObjective(id).catch((e) => {
          console.warn(
            `[afterAll] Не удалось удалить цель ${id}: ${e.message}`,
          );
        });
      }
      createdObjectiveIds.length = 0;
      objectiveSnapshots.length = 0;

      if (initialApprovalEnabled !== null) {
        await api.setApprovalEnabled(initialApprovalEnabled).catch((e) => {
          console.warn(
            `[afterAll] Не удалось восстановить настройку утверждения: ${e.message}`,
          );
        });
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8300: Повторное включение — восстановление предыдущих статусов утверждения",
      { tag: ["@critical"] },
      async ({ adminAuth, request }, testInfo) => {
        setSeverity("critical");

        if (objectiveSnapshots.length < 3) {
          throw new Error(
            "objectiveSnapshots не заполнен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const api = new ObjectivesAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        // Шаг 1: Выключить утверждение
        await test.step("Выключить утверждение целей через API", async () => {
          const { response } = await api.setApprovalEnabled(false);
          expect(
            response.ok(),
            `Не удалось выключить утверждение: ${response.status()}`,
          ).toBe(true);
        });

        // Шаг 2: Проверить что цели доступны (бэкенд НЕ меняет approvalStatus — by design)
        await test.step(
          "API: после выключения цели доступны, approvalStatus сохраняется",
          async () => {
            for (const { id, statusBeforeDisable } of objectiveSnapshots) {
              const { response, data } = await api.getObjectiveById(id);
              expect(response.ok(), `GET цели ${id} упал`).toBe(true);
              const obj = data?.objective || data;
              // Бэкенд сохраняет approvalStatus как есть, фронтенд скрывает колонку
              expect(obj?.approvalStatus).toBe(statusBeforeDisable);
            }
          },
        );

        // Шаг 3: Повторно включить утверждение
        await test.step("Повторно включить утверждение через API", async () => {
          const { response } = await api.setApprovalEnabled(true);
          expect(
            response.ok(),
            `Не удалось повторно включить утверждение: ${response.status()}`,
          ).toBe(true);
        });

        // Шаг 4: Проверить что статусы восстановились
        await test.step(
          "API: после повторного включения approvalStatus восстановился до прежних значений",
          async () => {
            for (const { id, statusBeforeDisable } of objectiveSnapshots) {
              const { response, data } = await api.getObjectiveById(id);
              expect(response.ok(), `GET цели ${id} упал`).toBe(true);
              const obj = data?.objective || data;
              const statusAfterReenable = obj?.approvalStatus;

              // При повторном включении статусы должны вернуться к прежним значениям.
              // approvalWaiting/approvalProcess/approved — все должны быть восстановлены.
              expect(
                statusAfterReenable,
                `Цель id=${id}: ожидался восстановленный статус '${statusBeforeDisable}', получено: '${statusAfterReenable}'`,
              ).toBe(statusBeforeDisable);
            }
          },
        );
      },
    );
  },
);
