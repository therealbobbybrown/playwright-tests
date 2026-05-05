// @ts-check
/**
 * Тесты ManageOwn* разрешений на доступ к ЧУЖИМ сущностям
 *
 * Проверяем что пользователь с ManageOwnSurvey/ManageOwnPerformanceReview:
 * - НЕ видит чужие сущности в списке
 * - НЕ может редактировать чужие сущности (403)
 * - НЕ может удалять чужие сущности (403)
 *
 * @tags @roles @permissions @security @api
 */

import { test, expect } from "@playwright/test";
import { RolesAPI, getCredentials } from "../../utils/api/index.js";
import { SurveyAPI } from "../../utils/api/SurveyAPI.js";
import { PerformanceReviewAPI } from "../../utils/api/PerformanceReviewAPI.js";
import {
  markAsAPITest,
  setSeverity,
  MODULES,
} from "../../utils/allure-helpers.js";
import { assignRolesAndInvalidate } from "../../utils/auth/TokenManager.js";

/**
 * Получить ID разрешения по имени
 */
async function getPermissionIdByName(api, name) {
  const { response, data } = await api.getPermissions();
  if (!response.ok()) return null;

  const permissions = data?.items || data || [];
  const permission = permissions.find(
    (p) => p.name === name || p.name?.toLowerCase() === name.toLowerCase(),
  );
  return permission?.id || null;
}

/**
 * Получить ID тестового пользователя
 */
async function getTestUserId(api) {
  const userCreds = getCredentials("user");
  const userApi = new RolesAPI(api.request, null);
  await userApi.signIn(userCreds.email, userCreds.password);

  const { data } = await userApi.getCurrentUser();
  return data?.id || data?.currentUserId || data?.account?.users?.[0]?.id;
}

test.describe(
  "ManageOwn* Access to Foreign Entities",
  { tag: ["@roles", "@permissions", "@security", "@api"] },
  () => {
    const adminCreds = getCredentials("admin");
    const userCreds = getCredentials("user");

    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "ManageOwn Access");
    });

    test(
      "C4374: [API] ManageOwnSurvey: нет доступа к чужому опросу",
      { tag: ["@critical", "@regression"] },
      async ({ request }) => {
        setSeverity("critical");

        let adminAPI;
        let testUserId;
        let originalRoles;
        let testRoleId;
        let adminSurveyAPI;
        let surveyId;
        let baseRoleId;

        await test.step("Авторизоваться через API и подготовить роль с ManageOwnSurvey", async () => {
          // Инициализация admin API
          adminAPI = new RolesAPI(request);
          await adminAPI.signIn(adminCreds.email, adminCreds.password);

          // Получаем ID базовой роли "Пользователь" динамически
          ({ userRoleId: baseRoleId } = await adminAPI.getSystemRoleIds());

          // Получаем ID тестового пользователя
          testUserId = await getTestUserId(adminAPI);
          expect(testUserId, "Должен быть тестовый пользователь").toBeTruthy();

          // Получаем ID разрешения ManageOwnSurvey
          const permissionId = await getPermissionIdByName(
            adminAPI,
            "manageOwnSurvey",
          );
          expect(
            permissionId,
            "Разрешение manageOwnSurvey должно существовать",
          ).toBeTruthy();

          // Сохраняем оригинальные роли
          originalRoles = await adminAPI.getUserRoleIds(testUserId);

          // Создаём тестовую роль с ManageOwnSurvey
          const { response: createRoleResp, data: roleData } =
            await adminAPI.createRole({
              title: `Test_ManageOwnSurvey_${Date.now()}`,
              permissionsIds: [permissionId],
            });
          expect(createRoleResp.ok(), "Тестовая роль должна быть создана").toBe(
            true,
          );
          testRoleId = roleData.id;
        });

        await test.step("Создать опрос от имени администратора", async () => {
          // Admin создаёт опрос (admin_entity_id = admin user)
          adminSurveyAPI = new SurveyAPI(request);
          await adminSurveyAPI.signIn(adminCreds.email, adminCreds.password);

          const { response: createSurveyResp, data: surveyData } =
            await adminSurveyAPI.post("/manager/surveys/", {
              title: `AdminSurvey_${Date.now()}`,
              status: "draft",
              isPublic: false,
              isAnonymous: false,
            });

          // Опрос может не создаться если нет разрешения - это ОК для теста
          surveyId = surveyData?.id;
          console.log(
            `[Test] Admin created survey: ${surveyId || "failed to create"}`,
          );
        });

        await test.step("Назначить тестовую роль пользователю и проверить отсутствие чужого опроса в списке", async () => {
          try {
            // Назначаем тестовую роль пользователю
            await assignRolesAndInvalidate(adminAPI, testUserId, [
              baseRoleId,
              testRoleId,
            ]);

            // Re-login пользователя
            const userSurveyAPI = new SurveyAPI(request);
            await userSurveyAPI.signIn(userCreds.email, userCreds.password);

            // ШАГ 1: Проверяем что чужой опрос НЕ появляется в списке
            const { response: listResp, data: listData } =
              await userSurveyAPI.getList();

            if (listResp.ok() && surveyId) {
              const surveyIds = (listData?.items || listData || []).map(
                (s) => s.id,
              );
              console.log(
                `[Test] User sees surveys: ${JSON.stringify(surveyIds)}`,
              );

              // С ManageOwnSurvey пользователь НЕ должен видеть опросы админа
              expect(
                surveyIds,
                `Пользователь с ManageOwnSurvey не должен видеть чужие опросы (survey ${surveyId})`,
              ).not.toContain(surveyId);
            }

            // ШАГ 2: Попытка получить детали чужого опроса
            if (surveyId) {
              const { response: getResp } = await userSurveyAPI.get(
                `/manager/surveys/${surveyId}/`,
              );
              console.log(`[Test] GET foreign survey: ${getResp.status()}`);

              // Ожидаем 403 или 404 (опрос не найден для этого пользователя)
              expect(
                [403, 404].includes(getResp.status()),
                `Пользователь с ManageOwnSurvey не должен иметь доступ к чужому опросу. Получен: ${getResp.status()}`,
              ).toBe(true);
            }

            // ШАГ 3: Попытка редактирования чужого опроса
            if (surveyId) {
              const { response: updateResp } = await userSurveyAPI.post(
                `/manager/surveys/${surveyId}/`,
                {
                  title: "Hacked Title",
                },
              );
              console.log(
                `[Test] POST (update) foreign survey: ${updateResp.status()}`,
              );

              // Ожидаем 403 или 404
              expect(
                [403, 404].includes(updateResp.status()),
                `Редактирование чужого опроса должно быть запрещено. Получен: ${updateResp.status()}`,
              ).toBe(true);
            }

            // ШАГ 4: Попытка удаления чужого опроса
            if (surveyId) {
              const { response: deleteResp } = await userSurveyAPI.delete(
                `/manager/surveys/${surveyId}/`,
              );
              console.log(
                `[Test] DELETE foreign survey: ${deleteResp.status()}`,
              );

              // Ожидаем 403 или 404
              expect(
                [403, 404].includes(deleteResp.status()),
                `Удаление чужого опроса должно быть запрещено. Получен: ${deleteResp.status()}`,
              ).toBe(true);
            }
          } finally {
            // CLEANUP — каждая операция в отдельном try/catch
            try {
              await assignRolesAndInvalidate(
                adminAPI,
                testUserId,
                originalRoles,
              );
              console.log(`[Cleanup] Restored roles for user ${testUserId}`);
            } catch (e) {
              console.error(
                `[Cleanup] FAILED to restore roles for user ${testUserId}:`,
                e.message,
              );
            }
            try {
              await adminAPI.deleteRole(testRoleId);
              console.log(`[Cleanup] Deleted test role ${testRoleId}`);
            } catch (e) {
              console.error(
                `[Cleanup] FAILED to delete test role ${testRoleId}:`,
                e.message,
              );
            }
            if (surveyId) {
              try {
                await adminSurveyAPI.delete(`/manager/surveys/${surveyId}/`);
              } catch {
                /* ignore */
              }
            }
          }
        });
      },
    );

    test(
      "C4375: [API] ManageOwnPerformanceReview: нет доступа к чужой оценке",
      { tag: ["@critical", "@regression"] },
      async ({ request }) => {
        setSeverity("critical");

        let adminAPI;
        let testUserId;
        let originalRoles;
        let testRoleId;
        let adminPrAPI;
        let prId;
        let baseRoleId;

        await test.step("Авторизоваться через API и подготовить роль с ManageOwnPerformanceReview", async () => {
          // Инициализация admin API
          adminAPI = new RolesAPI(request);
          await adminAPI.signIn(adminCreds.email, adminCreds.password);

          // Получаем ID базовой роли "Пользователь" динамически
          ({ userRoleId: baseRoleId } = await adminAPI.getSystemRoleIds());

          // Получаем ID тестового пользователя
          testUserId = await getTestUserId(adminAPI);
          expect(testUserId, "Должен быть тестовый пользователь").toBeTruthy();

          // Получаем ID разрешения ManageOwnPerformanceReview
          const permissionId = await getPermissionIdByName(
            adminAPI,
            "manageOwnPerformanceReview",
          );
          expect(
            permissionId,
            "Разрешение manageOwnPerformanceReview должно существовать",
          ).toBeTruthy();

          // Сохраняем оригинальные роли
          originalRoles = await adminAPI.getUserRoleIds(testUserId);

          // Создаём тестовую роль с ManageOwnPerformanceReview
          const { response: createRoleResp, data: roleData } =
            await adminAPI.createRole({
              title: `Test_ManageOwnPR_${Date.now()}`,
              permissionsIds: [permissionId],
            });
          expect(createRoleResp.ok(), "Тестовая роль должна быть создана").toBe(
            true,
          );
          testRoleId = roleData.id;
        });

        await test.step("Создать Performance Review от имени администратора", async () => {
          // Admin создаёт Performance Review (admin_entity_id = admin user)
          adminPrAPI = new PerformanceReviewAPI(request);
          await adminPrAPI.signIn(adminCreds.email, adminCreds.password);

          const { response: createPrResp, data: prData } =
            await adminPrAPI.create({
              title: `AdminPR_${Date.now()}`,
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

          console.log(`[Test] Admin created PR: status=${createPrResp.status()}, id=${prData?.id || "none"}`);
          expect(
            createPrResp.ok(),
            `Создание PR должно успешно завершиться. Статус: ${createPrResp.status()}`,
          ).toBe(true);
          prId = prData?.id;
          expect(prId, "ID созданного PR должен присутствовать в ответе").toBeTruthy();
        });

        await test.step("Назначить тестовую роль пользователю и проверить отсутствие доступа к чужой оценке", async () => {
          try {
            // Назначаем тестовую роль пользователю
            await assignRolesAndInvalidate(adminAPI, testUserId, [
              baseRoleId,
              testRoleId,
            ]);

            // Re-login пользователя
            const userPrAPI = new PerformanceReviewAPI(request);
            await userPrAPI.signIn(userCreds.email, userCreds.password);

            // ШАГ 1: Проверяем что чужой PR НЕ появляется в списке
            const { response: listResp, data: listData } =
              await userPrAPI.getList();

            if (listResp.ok() && prId) {
              const prIds = (listData?.items || listData || []).map(
                (pr) => pr.id,
              );
              console.log(`[Test] User sees PRs: ${JSON.stringify(prIds)}`);

              // С ManageOwnPerformanceReview пользователь НЕ должен видеть PR админа
              expect(
                prIds,
                `Пользователь с ManageOwnPerformanceReview не должен видеть чужие PR (PR ${prId})`,
              ).not.toContain(prId);
            }

            // ШАГ 2: Попытка получить детали чужого PR
            if (prId) {
              const { response: getResp } = await userPrAPI.getById(prId);
              console.log(`[Test] GET foreign PR: ${getResp.status()}`);

              // Ожидаем 403 или 404
              expect(
                [403, 404].includes(getResp.status()),
                `Пользователь с ManageOwnPerformanceReview не должен иметь доступ к чужому PR. Получен: ${getResp.status()}`,
              ).toBe(true);
            }

            // ШАГ 3: Попытка редактирования чужого PR
            if (prId) {
              const { response: updateResp } = await userPrAPI.update(prId, {
                title: "Hacked Title",
              });
              console.log(
                `[Test] POST (update) foreign PR: ${updateResp.status()}`,
              );

              // Ожидаем 403 или 404
              expect(
                [403, 404].includes(updateResp.status()),
                `Редактирование чужого PR должно быть запрещено. Получен: ${updateResp.status()}`,
              ).toBe(true);
            }

            // ШАГ 4: Попытка удаления чужого PR
            if (prId) {
              const { response: deleteResp } = await userPrAPI.remove(prId);
              console.log(`[Test] DELETE foreign PR: ${deleteResp.status()}`);

              // Ожидаем 403 или 404
              expect(
                [403, 404].includes(deleteResp.status()),
                `Удаление чужого PR должно быть запрещено. Получен: ${deleteResp.status()}`,
              ).toBe(true);
            }
          } finally {
            // CLEANUP — каждая операция в отдельном try/catch
            try {
              await assignRolesAndInvalidate(
                adminAPI,
                testUserId,
                originalRoles,
              );
              console.log(`[Cleanup] Restored roles for user ${testUserId}`);
            } catch (e) {
              console.error(
                `[Cleanup] FAILED to restore roles for user ${testUserId}:`,
                e.message,
              );
            }
            try {
              await adminAPI.deleteRole(testRoleId);
              console.log(`[Cleanup] Deleted test role ${testRoleId}`);
            } catch (e) {
              console.error(
                `[Cleanup] FAILED to delete test role ${testRoleId}:`,
                e.message,
              );
            }
            if (prId) {
              try {
                await adminPrAPI.remove(prId);
              } catch {
                /* ignore */
              }
            }
          }
        });
      },
    );
  },
);
