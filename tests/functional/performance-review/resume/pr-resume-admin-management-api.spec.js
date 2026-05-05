// tests/functional/performance-review/resume/pr-resume-admin-management-api.spec.js
// API тест: Добавить/удалить администратора оценки после resume (RESUME-053)
//
// Проверяет, что на возобновлённом PR можно:
//   — добавить нового администратора
//   — верифицировать добавление (API + DB)
//   — удалить добавленного администратора
//   — верифицировать удаление (API + DB)
//
// Механизм: POST /manager/performance-reviews/{id} с телом { managers: [{ userId }] }
// Заменяет весь список администраторов. Чтобы добавить — передать текущих + нового.
// Чтобы удалить — передать только оставшихся.

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

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "PR Resume — Управление администраторами",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Admin Management");
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
      "C7392: Добавить/удалить администратора после resume",
      { tag: ["@medium"] },
      async ({ prAPI, prSeed, db }) => {
        setSeverity("normal");
        test.setTimeout(180000);

        const { seedHelper } = prSeed;
        let prId;
        let ownerManagerUserId;
        let newAdminUserId;

        // ----------------------------------------------------------------
        await test.step("Создать PR (без заполнения) и остановить", async () => {
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: false,
            title: TestDataHelper.generateUniqueName("Управление админом"),
          });
          prId = pr.id;
          createdReviewId = prId;

          expect(typeof prId, "prId должен быть числом").toBe("number");
          expect(prId, "prId должен быть положительным числом").toBeGreaterThan(
            0,
          );

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);

          // Текущий список администраторов
          const managers = prData.managers || [];
          expect(
            managers.length,
            "PR должен иметь хотя бы одного администратора после создания",
          ).toBeGreaterThan(0);

          ownerManagerUserId = managers[0].userId;
          expect(
            typeof ownerManagerUserId,
            "ownerManagerUserId должен быть числом",
          ).toBe("number");
          expect(
            ownerManagerUserId,
            "ownerManagerUserId должен быть положительным числом",
          ).toBeGreaterThan(0);

          console.log(
            `✓ PR ${prId} создан и остановлен. Текущий администратор userId=${ownerManagerUserId}`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Найти пользователя для добавления как администратора", async () => {
          const users = await seedHelper.getAvailableUsers();
          expect(
            users.length,
            "Должны быть доступны пользователи для добавления администратором",
          ).toBeGreaterThan(0);

          // Выбираем пользователя, который ещё не является администратором этого PR
          const candidate = users.find((u) => u.id !== ownerManagerUserId);
          expect(
            candidate,
            "Должен быть найден пользователь, отличный от текущего администратора",
          ).toBeTruthy();

          newAdminUserId = candidate.id;
          console.log(
            `✓ Будет добавлен администратор userId=${newAdminUserId} ("${candidate.firstName} ${candidate.lastName}")`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Resume PR", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log(`✓ PR ${prId} возобновлён — статус: active`);
        });

        // ----------------------------------------------------------------
        await test.step("Получить текущий список администраторов до изменений", async () => {
          const { data: prData } = await prAPI.getById(prId);
          const managers = prData.managers || [];
          expect(managers.length).toBeGreaterThan(0);

          const managerUserIds = managers.map((m) => m.userId);
          expect(managerUserIds).toContain(ownerManagerUserId);
          console.log(
            `✓ Текущие администраторы: [${managerUserIds.join(", ")}]`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Добавить нового администратора на resumed PR", async () => {
          // managers — полный список: текущий + новый
          const { response, data: updatedPR } = await prAPI.update(prId, {
            managers: [
              { userId: ownerManagerUserId },
              { userId: newAdminUserId },
            ],
          });
          assertSuccessStatus(response);

          const updatedManagers = updatedPR.managers || [];
          const updatedUserIds = updatedManagers.map((m) => m.userId || m);

          expect(
            updatedUserIds,
            `Список администраторов должен содержать нового пользователя ${newAdminUserId}`,
          ).toContain(newAdminUserId);

          expect(
            updatedUserIds,
            `Список администраторов должен по-прежнему содержать исходного ${ownerManagerUserId}`,
          ).toContain(ownerManagerUserId);

          expect(
            updatedUserIds.length,
            "Должно быть 2 администратора после добавления",
          ).toBe(2);

          console.log(
            `✓ Добавлен администратор ${newAdminUserId}. Итого: [${updatedUserIds.join(", ")}]`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Верифицировать добавление через API (getById)", async () => {
          const { data: prData } = await prAPI.getById(prId);
          const managerUserIds = (prData.managers || []).map((m) => m.userId);

          expect(
            managerUserIds,
            "getById должен показывать нового администратора",
          ).toContain(newAdminUserId);
          expect(
            managerUserIds,
            "getById должен показывать исходного администратора",
          ).toContain(ownerManagerUserId);
          expect(managerUserIds.length).toBe(2);

          console.log(`✓ getById подтверждает 2 администраторов`);
        });

        // ----------------------------------------------------------------
        await test.step("Верифицировать добавление через DB (performance_review_managers)", async () => {
          if (!db.isConnected?.()) {
            console.log("[DB] Соединение недоступно — пропускаем DB-шаг");
            return;
          }

          const rows = await db.query(
            "SELECT user_id FROM performance_review_managers WHERE performance_review_id = ? ORDER BY user_id",
            [prId],
          );
          const dbUserIds = rows.map((r) => r.user_id);

          expect(
            dbUserIds,
            `DB должна содержать userId=${newAdminUserId}`,
          ).toContain(newAdminUserId);
          expect(
            dbUserIds,
            `DB должна содержать userId=${ownerManagerUserId}`,
          ).toContain(ownerManagerUserId);
          expect(dbUserIds.length).toBe(2);

          console.log(
            `✓ DB подтверждает 2 записи в performance_review_managers: [${dbUserIds.join(", ")}]`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Удалить добавленного администратора (оставить только исходного)", async () => {
          const { response, data: updatedPR } = await prAPI.update(prId, {
            managers: [{ userId: ownerManagerUserId }],
          });
          assertSuccessStatus(response);

          const updatedManagers = updatedPR.managers || [];
          const updatedUserIds = updatedManagers.map((m) => m.userId || m);

          expect(
            updatedUserIds,
            `Новый администратор ${newAdminUserId} должен быть удалён`,
          ).not.toContain(newAdminUserId);

          expect(
            updatedUserIds,
            `Исходный администратор ${ownerManagerUserId} должен остаться`,
          ).toContain(ownerManagerUserId);

          expect(
            updatedUserIds.length,
            "После удаления должен остаться 1 администратор",
          ).toBe(1);

          console.log(
            `✓ Администратор ${newAdminUserId} удалён. Остался: [${updatedUserIds.join(", ")}]`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Верифицировать удаление через API (getById)", async () => {
          const { data: prData } = await prAPI.getById(prId);
          const managerUserIds = (prData.managers || []).map((m) => m.userId);

          expect(
            managerUserIds,
            "Удалённый администратор не должен присутствовать в getById",
          ).not.toContain(newAdminUserId);
          expect(
            managerUserIds,
            "Исходный администратор должен остаться в getById",
          ).toContain(ownerManagerUserId);
          expect(managerUserIds.length).toBe(1);

          console.log(
            `✓ getById подтверждает: 1 администратор [${managerUserIds.join(", ")}]`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Верифицировать удаление через DB (performance_review_managers)", async () => {
          if (!db.isConnected?.()) {
            console.log("[DB] Соединение недоступно — пропускаем DB-шаг");
            return;
          }

          const rows = await db.query(
            "SELECT user_id FROM performance_review_managers WHERE performance_review_id = ? ORDER BY user_id",
            [prId],
          );
          const dbUserIds = rows.map((r) => r.user_id);

          expect(
            dbUserIds,
            `DB не должна содержать удалённого userId=${newAdminUserId}`,
          ).not.toContain(newAdminUserId);
          expect(
            dbUserIds,
            `DB должна содержать исходного userId=${ownerManagerUserId}`,
          ).toContain(ownerManagerUserId);
          expect(dbUserIds.length).toBe(1);

          console.log(
            `✓ DB подтверждает: 1 запись в performance_review_managers: [${dbUserIds.join(", ")}]`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Остановить PR и проверить финальный статус", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);

          // Финальный список администраторов сохранился после stop
          const finalManagerIds = (prData.managers || []).map((m) => m.userId);
          expect(finalManagerIds).toContain(ownerManagerUserId);
          expect(finalManagerIds.length).toBe(1);

          console.log(
            `✓ PR ${prId} остановлен, статус: ${prData.status}. Администраторы: [${finalManagerIds.join(", ")}]`,
          );
        });
      },
    );
  },
);
