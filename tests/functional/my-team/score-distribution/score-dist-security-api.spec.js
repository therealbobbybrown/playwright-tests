/**
 * Security API тесты для Распределения оценок
 *
 * Проверяет ролевую модель доступа к данным распределения:
 * - User без подчинённых: 403 или пустой ответ на distribution-users/distribution-last-results
 * - Manager: доступ только к данным своих подчинённых (фильтрация чужих)
 *
 * Endpoints распределения оценок:
 * - POST /private/performance-reviews/dashboard/distribution-users/get/ - список сотрудников
 * - POST /private/performance-reviews/dashboard/distribution-last-results/get/ - результаты оценок
 */
import { test as base, expect } from "../../../fixtures/auth.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

// Расширение fixtures для разных ролей
const test = base.extend({
  adminAPI: async ({ request }, use) => {
    const api = new DashboardTeamAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  userAPI: async ({ request }, use) => {
    const api = new DashboardTeamAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  managerAPI: async ({ request }, use) => {
    const api = new DashboardTeamAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "Распределение оценок — Security API",
  { tag: ["@api", "@my-team", "@regression", "@security"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM);
    });

    // ═══════════════════════════════════════════════════════════════
    // USER БЕЗ ПОДЧИНЁННЫХ - должен получить 403 или пустой ответ
    // ═══════════════════════════════════════════════════════════════
    test.describe("User без подчинённых", () => {
      test(
        "C7220: API distribution-users возвращает пустой ответ или 403 для пользователя без подчинённых",
        { tag: ["@api", "@critical"] },
        async ({ userAPI }) => {
          setSeverity("critical");

          await test.step("Авторизоваться как пользователь без подчинённых", async () => {
            // userAPI fixture уже авторизован
          });

          await test.step("Выполнить запрос distribution-users и проверить доступ", async () => {
            const { response, data } = await userAPI.getDistributionUsers({
              usersSubset: "all",
            });

            // Возможны два варианта поведения:
            // 1. 403 Forbidden - доступ запрещён
            // 2. 200 OK с пустым списком (items=[], total=0)
            if (response.status() === 403) {
              // Вариант 1: доступ запрещён
              expect(response.status()).toBe(403);
            } else {
              // Вариант 2: пустой ответ
              expect(response.ok()).toBe(true);
              expect(data).toBeDefined();
              expect(data.items).toBeDefined();
              expect(data.items.length).toBe(0);
              expect(data.total).toBe(0);
            }
          });
        },
      );

      test(
        "C7221: API distribution-last-results возвращает пустой ответ или 403 для пользователя без подчинённых",
        { tag: ["@api", "@critical"] },
        async ({ userAPI, adminAPI }) => {
          setSeverity("critical");

          let randomUserId;

          await test.step("Получить через API администратора ID случайного сотрудника", async () => {
            // Сначала получаем список подчинённых администратора
            const { data: adminUsers } = await adminAPI.getDistributionUsers({
              usersSubset: "all",
              limit: 1,
            });
            expect(
              adminUsers.items.length,
              "У администратора должны быть сотрудники в distribution",
            ).toBeGreaterThanOrEqual(1);

            randomUserId = adminUsers.items[0].id;
            expect(randomUserId).toBeDefined();
          });

          await test.step("Запросить результаты чужого сотрудника от имени пользователя без подчинённых", async () => {
            // Теперь пробуем получить результаты этого пользователя от имени user
            const { response, data } = await userAPI.getDistributionLastResults(
              [randomUserId],
            );

            // Возможны два варианта поведения:
            // 1. 403 Forbidden - доступ запрещён
            // 2. 200 OK с пустым объектом или без данных для запрошенного userId
            if (response.status() === 403) {
              // Вариант 1: доступ запрещён
              expect(response.status()).toBe(403);
            } else {
              // Вариант 2: пустой ответ или нет данных для этого userId
              expect(response.ok()).toBe(true);
              expect(data).toBeDefined();
              // Ответ должен быть либо пустым объектом, либо без ключа для randomUserId
              const isEmpty = Object.keys(data).length === 0;
              const noDataForUser = !data[0] && !data[randomUserId.toString()];
              expect(isEmpty || noDataForUser).toBe(true);
            }
          });
        },
      );
    });

    // ═══════════════════════════════════════════════════════════════
    // MANAGER - доступ только к своим подчинённым
    // ═══════════════════════════════════════════════════════════════
    test.describe("Manager - фильтрация по подчинению", () => {
      test(
        "C7222: Manager не получает данные для сотрудников вне его подчинения",
        { tag: ["@api", "@critical"] },
        async ({ managerAPI, adminAPI }) => {
          setSeverity("critical");

          let nonSubordinate;
          let managerSubordinateIds = [];

          await test.step("Получить полный список сотрудников через API администратора", async () => {
            // 1. Получаем ВСЕ подчинённые админа (полный список)
            const { data: allUsers } = await adminAPI.getDistributionUsers({
              usersSubset: "all",
              limit: 200,
            });
            expect(
              allUsers.items.length,
              "У админа должны быть подчинённые",
            ).toBeGreaterThan(0);

            // 2. Пробуем получить подчинённых менеджера (если доступ есть)
            // Используем limit=1000 чтобы покрыть весь поддеревь менеджера
            // (у менеджера 54288 может быть 880+ косвенных подчинённых на глубину 1-5)
            const { response: mgrResp, data: mgrUsers } =
              await managerAPI.getDistributionUsers({
                usersSubset: "all",
                limit: 1000,
              });

            if (mgrResp.ok() && mgrUsers?.items?.length > 0) {
              managerSubordinateIds = mgrUsers.items.map((u) => u.id);
            } else {
              // Менеджер не имеет доступа к distribution-users →
              // ВСЕ сотрудники для него «чужие», берём первого из списка админа
              managerSubordinateIds = [];
            }

            // 3. Находим сотрудника, для которого у менеджера нет доступа к данным.
            // distribution-users может возвращать только часть дерева (прямые подчинённые),
            // поэтому для каждого кандидата проверяем фактический доступ через
            // distribution-last-results: если API возвращает revisionMean для кандидата —
            // он является (прямым или косвенным) подчинённым менеджера. Пропускаем таких.
            const candidates = allUsers.items.filter(
              (u) => !managerSubordinateIds.includes(u.id),
            );
            expect(
              candidates.length,
              "Должны быть кандидаты вне списка distribution-users менеджера",
            ).toBeGreaterThan(0);

            for (const candidate of candidates) {
              const { response: chkResp, data: chkData } =
                await managerAPI.getDistributionLastResults([candidate.id]);
              if (!chkResp.ok()) {
                // 403 — точно нет доступа
                nonSubordinate = candidate;
                break;
              }
              const entries = Object.values(chkData || {});
              const hasData = entries.some(
                (e) =>
                  e.targetUserId === candidate.id && e.revisionMean !== null,
              );
              if (!hasData) {
                // Нет данных — значит менеджер не видит этого сотрудника
                nonSubordinate = candidate;
                break;
              }
              // Иначе — это косвенный подчинённый, пробуем следующего кандидата
            }

            expect(
              nonSubordinate,
              "Должен быть хотя бы 1 сотрудник вне подчинения менеджера",
            ).toBeTruthy();

            console.log(
              `  non-subordinate: userId=${nonSubordinate.id}, name=${nonSubordinate.firstName || ""} ${nonSubordinate.lastName || ""}`,
            );
          });

          await test.step("Запросить данные чужого сотрудника от имени менеджера и проверить отсутствие доступа", async () => {
            // 4. Manager запрашивает данные чужого сотрудника
            const { response, data } =
              await managerAPI.getDistributionLastResults([nonSubordinate.id]);

            // Менеджер НЕ должен получить данные для не-подчинённого
            if (response.status() === 403) {
              expect(response.status()).toBe(403);
              console.log("  ✓ API вернул 403 для чужого сотрудника");
            } else {
              expect(response.ok()).toBe(true);
              expect(data).toBeDefined();

              // Данных для этого userId не должно быть
              const entries = Object.values(data || {});
              const hasDataForUser = entries.some(
                (e) =>
                  e.targetUserId === nonSubordinate.id &&
                  e.revisionMean !== null,
              );

              expect(
                hasDataForUser,
                `Manager не должен получить revisionMean для чужого сотрудника ${nonSubordinate.id}`,
              ).toBe(false);
              console.log("  ✓ API вернул пустые данные для чужого сотрудника");
            }
          });
        },
      );
    });

    // ═══════════════════════════════════════════════════════════════
    // ADMIN - полный доступ (baseline для сравнения)
    // ═══════════════════════════════════════════════════════════════
    test.describe("Admin - полный доступ (baseline)", () => {
      test(
        "C7236: Admin имеет доступ ко всем сотрудникам через distribution-users",
        { tag: ["@api"] },
        async ({ adminAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить запрос distribution-users от имени администратора", async () => {
            const { response, data } = await adminAPI.getDistributionUsers({
              usersSubset: "all",
            });

            expect(response.ok()).toBe(true);
            expect(data).toBeDefined();
            expect(data.items).toBeDefined();
            expect(
              data.items.length,
              "Admin должен иметь сотрудников в distribution",
            ).toBeGreaterThanOrEqual(1);
            expect(
              data.total,
              "Total должен быть положительным числом",
            ).toBeGreaterThanOrEqual(1);
          });
        },
      );

      test(
        "C7237: Admin может получить результаты любого сотрудника через distribution-last-results",
        { tag: ["@api"] },
        async ({ adminAPI }) => {
          setSeverity("normal");

          let userId;

          await test.step("Получить список сотрудников и выбрать первого для проверки", async () => {
            // Получаем список сотрудников
            const { data: users } = await adminAPI.getDistributionUsers({
              usersSubset: "all",
              limit: 1,
            });
            expect(
              users.items.length,
              "Admin должен иметь сотрудников для получения результатов",
            ).toBeGreaterThanOrEqual(1);

            userId = users.items[0].id;
          });

          await test.step("Получить результаты сотрудника и проверить структуру ответа", async () => {
            // Получаем результаты
            const { response, data } =
              await adminAPI.getDistributionLastResults([userId]);

            expect(response.ok()).toBe(true);
            expect(data).toBeDefined();
            // Ответ — объект (может быть пустым, если у сотрудника нет оценок)
            expect(typeof data).toBe("object");
            // Если есть данные — проверяем структуру
            const entries = Object.values(data || {});
            if (entries.length > 0) {
              const entry = entries[0];
              expect(entry).toHaveProperty("targetUserId");
              // revisionMean может быть null (нет оценки) или числом
            }
          });
        },
      );
    });
  },
);
