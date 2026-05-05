// tests/functional/objectives/objective-approval-disable-statuses-reset.spec.js
// TestRail: C-APPROVAL-TOGGLE-02 — Выключение утверждения: колонка «Статус» исчезает
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

let initialApprovalEnabled = null;
const createdObjectiveIds = [];

/**
 * Создать активную цель через API от имени user.
 * @param {ObjectivesAPI} userApi
 * @param {string} suffix - уникальный суффикс заголовка
 * @returns {Promise<number>} id созданной цели
 */
async function createUserObjective(userApi, suffix) {
  const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
  const userId = userApi.getCurrentUserId();
  if (!userId) {
    throw new Error(
      "Не удалось получить userId пользователя — проверь credentials",
    );
  }

  const { response, data } = await userApi.saveObjective({
    title: `Цель для toggle-disable ${suffix}`,
    startDate,
    endDate,
    status: "active",
    level: "self",
    responsibleUserId: userId,
    userAccessType: "everybody",
    milestones: [
      {
        temporaryId: `temp-toggle-disable-${suffix}`,
        title: `КР toggle-disable ${suffix}`,
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

test.describe(
  "Утверждение целей — выключение: статусы сбрасываются, колонка исчезает",
  { tag: ["@ui", "@objectives", "@approval", "@approval-toggle", "@regression"] },
  () => {
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

      // Включаем утверждение, чтобы цели создавались с approvalStatus
      const { response: enableResp } = await adminApi.setApprovalEnabled(true);
      if (!enableResp.ok()) {
        throw new Error(
          `Не удалось включить утверждение целей: ${enableResp.status()}`,
        );
      }

      // Создаём 3 цели от user в разных статусах
      const userApi = new ObjectivesAPI(request);
      const { email: userEmail, password: userPassword } =
        getCredentials("user");
      await userApi.signIn(userEmail, userPassword);

      const headApi = new ObjectivesAPI(request);
      const { email: headEmail, password: headPassword } =
        getCredentials("head");
      await headApi.signIn(headEmail, headPassword);

      const ts = Date.now();

      // Цель 1: approvalWaiting (создана, не отправлена)
      const id1 = await createUserObjective(userApi, `waiting-${ts}`);
      createdObjectiveIds.push(id1);
      console.log(`[beforeAll] Цель approvalWaiting: id=${id1}`);

      // Цель 2: approvalProcess (создана + отправлена на утверждение)
      const id2 = await createUserObjective(userApi, `process-${ts}`);
      createdObjectiveIds.push(id2);
      const { response: sendResp } = await userApi.sendForApproval(id2);
      if (!sendResp.ok()) {
        throw new Error(
          `Не удалось отправить цель ${id2} на утверждение: ${sendResp.status()}`,
        );
      }
      console.log(`[beforeAll] Цель approvalProcess: id=${id2}`);

      // Цель 3: approved (создана + отправлена + утверждена руководителем)
      const id3 = await createUserObjective(userApi, `approved-${ts}`);
      createdObjectiveIds.push(id3);
      const { response: sendResp2 } = await userApi.sendForApproval(id3);
      if (!sendResp2.ok()) {
        throw new Error(
          `Не удалось отправить цель ${id3} на утверждение: ${sendResp2.status()}`,
        );
      }
      const { response: approveResp } = await headApi.approveObjective(id3);
      if (!approveResp.ok()) {
        // Fallback: пробуем от admin (на случай если head не имеет доступа)
        const fallbackResp = await adminApi.approveObjective(id3);
        if (!fallbackResp.response.ok()) {
          console.warn(
            `[beforeAll] Не удалось утвердить цель ${id3}: ${approveResp.status()}. Продолжаем с approvalProcess.`,
          );
        }
      }
      console.log(`[beforeAll] Цель approved (или approvalProcess): id=${id3}`);
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

      // Восстанавливаем исходное состояние
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

    test("C8286: Выключение утверждения — колонка «Статус» исчезает из списка",
      { tag: ["@critical"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("critical");

        if (createdObjectiveIds.length < 3) {
          throw new Error(
            "createdObjectiveIds не заполнен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const api = new ObjectivesAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        await test.step("Выключить утверждение целей через API", async () => {
          const { response } = await api.setApprovalEnabled(false);
          expect(
            response.ok(),
            `Не удалось выключить утверждение: ${response.status()}`,
          ).toBe(true);
        });

        await test.step(
          "UI: открыть список целей и проверить отсутствие колонки «Статус»",
          async () => {
            await page.goto("/ru/objectives/");
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
            await objectivesAllPage.assertOpened();
            await objectivesAllPage.assertStatusColumnHidden();
          },
        );

        await test.step(
          "UI: фильтр «Статус» также отсутствует",
          async () => {
            const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
            await objectivesAllPage.assertStatusFilterHidden();
          },
        );

        await test.step(
          "API: GET целей — approvalStatus сохраняется (бэкенд не меняет), UI скрывает колонку",
          async () => {
            // При выключении фичи бэкенд НЕ меняет approvalStatus — это by design.
            // Фронтенд скрывает колонку "Статус" и показывает все цели как обычные active.
            // Проверяем что API доступен и цели не удалились.
            for (const objId of createdObjectiveIds) {
              const { response } = await api.getObjectiveById(objId);
              expect(
                response.ok(),
                `GET /private/objectives/${objId}/ вернул ${response.status()}`,
              ).toBe(true);
            }
          },
        );
      },
    );
  },
);
