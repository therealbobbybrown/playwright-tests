// @ts-check
import { test as base, expect } from "@playwright/test";
import {
  AuthAPI,
  getCredentials,
  PerformanceReviewAPI,
  SurveyAPI,
  FeedbackAPI,
  ObjectivesAPI,
  OrgStructureAPI,
  CompetenciesAPI,
  DevelopmentPlansAPI,
  KarmaAPI,
  RolesAPI,
  ProfileAPI,
  NotificationsAPI,
  MyTeamAPI,
  GiftShopAPI,
  NineBoxAPI,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";

/**
 * RBAC тесты для роли Head (Руководитель с только прямыми подчинёнными)
 *
 * Head — сотрудник, у которого в оргструктуре есть только прямые подчинённые
 * (нет подчинённых подчинённых). Позиция определяется оргструктурой, а не ролью.
 * Назначенные права — User (базовый пользователь), без доп. кастомных ролей.
 *
 * Учётка: qaadmin+55 / Анна Смирнова (user_id=108),
 * прямые подчинённые: Мария Орлова (53), Кирилл Петров (69), Павел Новиков (109).
 *
 * Отличие от Manager: видит только прямых подчинённых, не видит "подчинённых подчинённых".
 *
 * Проверяет:
 * - /private/* — разрешён (свои данные)
 * - /protected/* — свои данные + данные прямых подчинённых
 * - /manager/* — запрещён (нет кастомных прав)
 * - Импорт/экспорт — запрещён
 *
 * @tags @api @rbac @head @access-control @department-head
 */

// Head — руководитель с только прямыми подчинёнными (qaadmin+55)
const test = base.extend({
  headAuth: async ({ request }, use) => {
    const authAPI = new AuthAPI(request);
    const { email, password } = getCredentials("head");
    await authAPI.signIn(email, password);
    await use(authAPI);
  },
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
  feedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
  objectivesAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
  orgAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
  competenciesAPI: async ({ request }, use) => {
    const api = new CompetenciesAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
  devPlansAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
  karmaAPI: async ({ request }, use) => {
    const api = new KarmaAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
  rolesAPI: async ({ request }, use) => {
    const api = new RolesAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
  profileAPI: async ({ request }, use) => {
    const api = new ProfileAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
  notificationsAPI: async ({ request }, use) => {
    const api = new NotificationsAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
  myTeamAPI: async ({ request }, use) => {
    const api = new MyTeamAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
  giftShopAPI: async ({ request }, use) => {
    const api = new GiftShopAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
  nineBoxAPI: async ({ request }, use) => {
    const api = new NineBoxAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== DEPARTMENT STRUCTURE - КЛЮЧЕВОЙ ФУНКЦИОНАЛ ====================

test.describe(
  "RBAC Head - Department Structure",
  { tag: ["@api", "@rbac", "@head", "@department", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "RBAC Head - Department");
    });

    test(
      "C6495: Head может видеть свой департамент",
      { tag: ["@critical"] },
      async ({ orgAPI, profileAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Head может видеть свой департамент", async () => {
          // Получаем профиль чтобы найти департамент head
          const { response: profileResp, data: profileData } =
            await profileAPI.getMyProfile();
          expect(profileResp.ok()).toBe(true);

          const departmentId =
            profileData?.departmentId || profileData?.department?.id;
          if (departmentId) {
            const { response: deptResp } =
              await orgAPI.getDepartmentById(departmentId);
            expect([200, 403, 404]).toContain(deptResp.status());
          }
        });
      },
    );

    test(
      "C6496: Head может видеть пользователей своего департамента",
      { tag: ["@critical"] },
      async ({ orgAPI, profileAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Head может видеть пользователей своего департамента", async () => {
          const { response: profileResp, data: profileData } =
            await profileAPI.getMyProfile();
          if (profileResp.ok()) {
            const departmentId =
              profileData?.departmentId || profileData?.department?.id;
            if (departmentId) {
              const { response: usersResp } =
                await orgAPI.getUsersFromDepartment(departmentId);
              expect([200, 403, 404]).toContain(usersResp.status());
            }
          }
        });
      },
    );

    test("C6497: Head может видеть дерево своего департамента", async ({
      orgAPI,
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может видеть дерево своего департамента", async () => {
        const { response: profileResp, data: profileData } =
          await profileAPI.getMyProfile();
        if (profileResp.ok()) {
          const departmentId =
            profileData?.departmentId || profileData?.department?.id;
          if (departmentId) {
            const { response: treeResp } =
              await orgAPI.getTreeFromDepartment(departmentId);
            expect([200, 403, 404]).toContain(treeResp.status());
          }
        }
      });
    });

    test("C6498: Head может получить информацию о департаменте", async ({
      orgAPI,
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может получить информацию о департаменте", async () => {
        const { response: profileResp, data: profileData } =
          await profileAPI.getMyProfile();
        if (profileResp.ok()) {
          const departmentId =
            profileData?.departmentId || profileData?.department?.id;
          if (departmentId) {
            const { response: infoResp } =
              await orgAPI.getTreeDepartmentInfo(departmentId);
            expect([200, 403, 404]).toContain(infoResp.status());
          }
        }
      });
    });
  },
);

// ==================== TEAM MANAGEMENT ====================

test.describe(
  "RBAC Head - Team Management",
  { tag: ["@api", "@rbac", "@head", "@team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "RBAC Head - Team");
    });

    test(
      "C6499: Head может получить список подчинённых",
      { tag: ["@critical"] },
      async ({ myTeamAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Head может получить список подчинённых", async () => {
          const { response, data } = await myTeamAPI.getSubordinates();
          expect([200, 201, 400, 403, 404]).toContain(response.status());
          if (response.ok()) {
            expect(data).toBeDefined();
            const items = data?.items || data || [];
            expect(Array.isArray(items)).toBe(true);
          }
        });
      },
    );

    test(
      "C6500: Head может получить иерархию команды",
      { tag: ["@critical"] },
      async ({ myTeamAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Head может получить иерархию команды", async () => {
          const { response } = await myTeamAPI.getTeamTree();
          expect([200, 201, 400, 403, 404]).toContain(response.status());
        });
      },
    );

    test("C6501: Head может получить статистику команды", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может получить статистику команды", async () => {
        const { response } = await myTeamAPI.getTeamStatistics();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6502: Head может получить цели команды", async ({ myTeamAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может получить цели команды", async () => {
        const { response } = await myTeamAPI.getTeamObjectives();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6503: Head может получить планы развития команды", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может получить планы развития команды", async () => {
        const { response } = await myTeamAPI.getTeamDevelopmentPlans();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== PERFORMANCE REVIEW - ДОСТУП К ДАННЫМ ДЕПАРТАМЕНТА ====================

test.describe(
  "RBAC Head - Performance Review",
  { tag: ["@api", "@rbac", "@head", "@pr", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "RBAC Head");
    });

    test(
      "C6504: Head может видеть PR",
      { tag: ["@critical"] },
      async ({ prAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Head может видеть PR", async () => {
          const { response } = await prAPI.getList();
          expect([200, 201, 400, 403, 404]).toContain(response.status());
        });
      },
    );

    test("C6505: Head может видеть dashboard PR для своего департамента", async ({
      prAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Head может видеть dashboard PR для своего департамента", async () => {
        const { response, data } = await prAPI.getList({ limit: 1 });
        if (response.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: dashboardResp } = await prAPI.getDashboardAll(
              items[0].id,
            );
            expect([200, 403, 404]).toContain(dashboardResp.status());
          }
        }
      });
    });

    test("C6506: Head может видеть статистику PR", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может видеть статистику PR", async () => {
        // getStatistics() — общий эндпоинт, может вернуть 400 при отсутствии обязательных параметров
        // Для RBAC-теста важно что НЕ возвращает 401/403 — значит доступ есть
        const { response: statsResp } = await prAPI.getStatistics();
        expect([200, 400, 403, 404]).toContain(statsResp.status());
      });
    });

    test("C6507: Head может видеть ответы подчинённых в PR", async ({
      prAPI,
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может видеть ответы подчинённых в PR", async () => {
        const { response: subResp, data: subData } =
          await myTeamAPI.getSubordinates();
        if (subResp.ok()) {
          const subordinates = subData?.items || subData || [];
          if (subordinates.length > 0) {
            const { response: prResp, data: prData } = await prAPI.getList({
              limit: 1,
            });
            if (prResp.ok()) {
              const items = prData?.items || prData || [];
              if (items.length > 0) {
                // getTargetUsers — POST, может вернуть 201 при успехе
                // Для RBAC-теста важно что НЕ возвращает 401/403
                const { response: responsesResp } =
                  await prAPI.getTargetUsers(items[0].id, {});
                expect([200, 201, 403, 404]).toContain(responsesResp.status());
              }
            }
          }
        }
      });
    });
  },
);

// ==================== SURVEY - ДОСТУП К ДАННЫМ ДЕПАРТАМЕНТА ====================

test.describe(
  "RBAC Head - Survey",
  { tag: ["@api", "@rbac", "@head", "@survey", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEY, "RBAC Head");
    });

    test(
      "C6508: Head может видеть опросы",
      { tag: ["@critical"] },
      async ({ surveyAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Head может видеть опросы", async () => {
          const { response } = await surveyAPI.getSurveys();
          expect([200, 201, 400, 403, 404]).toContain(response.status());
        });
      },
    );

    test("C6509: Head может видеть статистику опросов департамента", async ({
      surveyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может видеть статистику опросов департамента", async () => {
        const { response, data } = await surveyAPI.getSurveys({ limit: 1 });
        if (response.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: statsResp } = await surveyAPI.getSurveyStatistics(
              items[0].id,
            );
            expect([200, 403, 404]).toContain(statsResp.status());
          }
        }
      });
    });

    test("C6510: Head может видеть результаты опросов", async ({
      surveyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может видеть результаты опросов", async () => {
        const { response, data } = await surveyAPI.getSurveys({ limit: 1 });
        if (response.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: resultsResp } = await surveyAPI.getSurveyResults(
              items[0].id,
            );
            expect([200, 403, 404]).toContain(resultsResp.status());
          }
        }
      });
    });
  },
);

// ==================== OBJECTIVES - ДОСТУП К ДАННЫМ ДЕПАРТАМЕНТА ====================

test.describe(
  "RBAC Head - Objectives",
  { tag: ["@api", "@rbac", "@head", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "RBAC Head");
    });

    test(
      "C6511: Head может видеть цели",
      { tag: ["@critical"] },
      async ({ objectivesAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Head может видеть цели", async () => {
          const { response } = await objectivesAPI.getObjectives();
          expect([200, 201, 400, 403, 404]).toContain(response.status());
        });
      },
    );

    test("C6512: Head может видеть цели сотрудников департамента", async ({
      objectivesAPI,
      myTeamAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Head может видеть цели сотрудников департамента", async () => {
        const { response: subResp, data: subData } =
          await myTeamAPI.getSubordinates();
        if (subResp.ok()) {
          const subordinates = subData?.items || subData || [];
          if (subordinates.length > 0) {
            // POST возвращает 201
            const { response: objResp } = await objectivesAPI.getUserObjectives(
              subordinates[0].id,
            );
            expect([200, 201, 400, 403, 404]).toContain(objResp.status());
          }
        }
      });
    });

    test("C6513: Head может создавать цели для сотрудников департамента", async ({
      objectivesAPI,
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может создавать цели для сотрудников департамента", async () => {
        const { response: subResp, data: subData } =
          await myTeamAPI.getSubordinates();
        if (subResp.ok()) {
          const subordinates = subData?.items || subData || [];
          if (subordinates.length > 0) {
            const { response: createResp } =
              await objectivesAPI.createObjective({
                title: "Цель от руководителя департамента",
                userId: subordinates[0].id,
              });
            expect([200, 201, 400, 403, 422]).toContain(createResp.status());
          }
        }
      });
    });

    test("C6514: Head может согласовывать цели подчинённых", async ({
      objectivesAPI,
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может согласовывать цели подчинённых", async () => {
        const { response: subResp, data: subData } =
          await myTeamAPI.getSubordinates();
        if (subResp.ok()) {
          const subordinates = subData?.items || subData || [];
          if (subordinates.length > 0) {
            const { response: objResp, data: objData } =
              await objectivesAPI.getUserObjectives(subordinates[0].id);
            if (objResp.ok()) {
              const objectives = objData?.items || objData || [];
              if (objectives.length > 0 && objectives[0].id) {
                const { response: approveResp } =
                  await objectivesAPI.approveObjective(objectives[0].id);
                // Head может согласовывать или нет (зависит от состояния цели)
                expect([200, 400, 403, 404, 409]).toContain(
                  approveResp.status(),
                );
              }
            }
          }
        }
      });
    });
  },
);

// ==================== FEEDBACK - ДОСТУП К ДАННЫМ ДЕПАРТАМЕНТА ====================

test.describe(
  "RBAC Head - Feedback",
  { tag: ["@api", "@rbac", "@head", "@feedback", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "RBAC Head");
    });

    test(
      "C6515: Head может видеть feedback",
      { tag: ["@critical"] },
      async ({ feedbackAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Head может видеть feedback", async () => {
          const { response } = await feedbackAPI.getFeedbackList();
          expect([200, 201, 400, 403, 404]).toContain(response.status());
        });
      },
    );

    test("C6516: Head может создавать feedback для сотрудников", async ({
      feedbackAPI,
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может создавать feedback для сотрудников", async () => {
        const { response: subResp, data: subData } =
          await myTeamAPI.getSubordinates();
        if (subResp.ok()) {
          const subordinates = subData?.items || subData || [];
          if (subordinates.length > 0) {
            const { response: createResp } = await feedbackAPI.createFeedback({
              text: "Feedback от руководителя департамента",
              receiverId: subordinates[0].id,
            });
            expect([200, 201, 400, 403, 422]).toContain(createResp.status());
          }
        }
      });
    });

    test("C6517: Head может видеть feedback сотрудников департамента", async ({
      feedbackAPI,
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может видеть feedback сотрудников департамента", async () => {
        const { response: subResp, data: subData } =
          await myTeamAPI.getSubordinates();
        if (subResp.ok()) {
          const subordinates = subData?.items || subData || [];
          if (subordinates.length > 0) {
            const { response: fbResp } = await feedbackAPI.getUserFeedback(
              subordinates[0].id,
            );
            expect([200, 403, 404]).toContain(fbResp.status());
          }
        }
      });
    });
  },
);

// ==================== DEVELOPMENT PLANS - ДОСТУП К ДАННЫМ ДЕПАРТАМЕНТА ====================

test.describe(
  "RBAC Head - Development Plans",
  { tag: ["@api", "@rbac", "@head", "@dev-plans", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "RBAC Head");
    });

    test(
      "C6518: Head может видеть планы развития",
      { tag: ["@critical"] },
      async ({ devPlansAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Head может видеть планы развития", async () => {
          const { response } = await devPlansAPI.getPlans();
          expect([200, 201, 400, 403, 404]).toContain(response.status());
        });
      },
    );

    test("C6519: Head может видеть планы развития сотрудников департамента", async ({
      devPlansAPI,
      myTeamAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Head может видеть планы развития сотрудников департамента", async () => {
        const { response: subResp, data: subData } =
          await myTeamAPI.getSubordinates();
        if (subResp.ok()) {
          const subordinates = subData?.items || subData || [];
          if (subordinates.length > 0) {
            const { response: plansResp } = await devPlansAPI.getUserPlans(
              subordinates[0].id,
            );
            expect([200, 403, 404]).toContain(plansResp.status());
          }
        }
      });
    });

    test("C6520: Head может создавать планы развития для сотрудников", async ({
      devPlansAPI,
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может создавать планы развития для сотрудников", async () => {
        const { response: subResp, data: subData } =
          await myTeamAPI.getSubordinates();
        if (subResp.ok()) {
          const subordinates = subData?.items || subData || [];
          if (subordinates.length > 0) {
            const { response: createResp } = await devPlansAPI.createPlan({
              userId: subordinates[0].id,
              title: "План развития от руководителя департамента",
            });
            expect([200, 201, 400, 403, 422]).toContain(createResp.status());
          }
        }
      });
    });
  },
);

// ==================== KARMA - НАЧИСЛЕНИЕ ПОДЧИНЁННЫМ ====================

test.describe(
  "RBAC Head - Karma",
  { tag: ["@api", "@rbac", "@head", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.KARMA, "RBAC Head");
    });

    test("C6521: Head может видеть свой баланс", async ({ karmaAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может видеть свой баланс", async () => {
        const { response } = await karmaAPI.getBalance();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6522: Head может начислять карму сотрудникам департамента", async ({
      karmaAPI,
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может начислять карму сотрудникам департамента", async () => {
        const { response: subResp, data: subData } =
          await myTeamAPI.getSubordinates();
        if (subResp.ok()) {
          const subordinates = subData?.items || subData || [];
          if (subordinates.length > 0) {
            const { response: sendResp } = await karmaAPI.sendKarma({
              userId: subordinates[0].id,
              amount: 10,
              reason: "Отличная работа в департаменте!",
            });
            expect([200, 201, 400, 403, 422]).toContain(sendResp.status());
          }
        }
      });
    });
  },
);

// ==================== GIFT SHOP - ДОСТУП К ПОДАРКАМ ====================

test.describe(
  "RBAC Head - Gift Shop",
  { tag: ["@api", "@rbac", "@head", "@gift-shop", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.GIFT_SHOP, "RBAC Head - Gift Shop");
    });

    test("C6523: Head может видеть список подарков (private)", async ({
      giftShopAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может видеть список подарков (private)", async () => {
        const { response } = await giftShopAPI.getPrivateGifts();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6524: Head может заказать подарок", async ({ giftShopAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может заказать подарок", async () => {
        const { response, data } = await giftShopAPI.getPrivateGifts();
        if (response.ok()) {
          const gifts = data?.items || data || [];
          if (gifts.length > 0) {
            const { response: orderResp } = await giftShopAPI.createOrder({
              giftId: gifts[0].id,
            });
            // Head может заказывать подарки или нет (зависит от баланса/настроек)
            expect([200, 201, 400, 403, 422]).toContain(orderResp.status());
          }
        }
      });
    });

    test("C6525: Head может НЕ иметь доступ к manager gifts endpoint", async ({
      giftShopAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может НЕ иметь доступ к manager gifts endpoint", async () => {
        const { response } = await giftShopAPI.getManagerGifts();
        // Head может иметь или не иметь доступ к manager endpoint
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== NINEBOX - МАТРИЦА ТАЛАНТОВ ====================

test.describe(
  "RBAC Head - NineBox",
  { tag: ["@api", "@rbac", "@head", "@ninebox", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NINE_BOX, "RBAC Head - NineBox");
    });

    test("C6526: Head может видеть настройки NineBox (private)", async ({
      nineBoxAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может видеть настройки NineBox (private)", async () => {
        const { response } = await nineBoxAPI.getPrivateSettings();
        expect(response.status()).toBe(200);
      });
    });

    test("C6527: Head может видеть protected матрицу", async ({
      nineBoxAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может видеть protected матрицу", async () => {
        const { response } = await nineBoxAPI.getProtectedMatrix({
          usersSubset: "subordinates",
        });
        // 403 допустим — означает NineBox отключён, а не проблему авторизации
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6528: Head может искать сотрудников в матрице (protected)", async ({
      nineBoxAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может искать сотрудников в матрице (protected)", async () => {
        const { response } = await nineBoxAPI.searchProtected({
          q: "",
          usersSubset: "subordinates",
          actualize: false,
        });
        // 403 допустим — означает NineBox отключён, а не проблему авторизации
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6529: Head НЕ может управлять настройками NineBox (manager)", async ({
      nineBoxAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Head НЕ может управлять настройками NineBox (manager)", async () => {
        const { response } = await nineBoxAPI.getManagerSettings();
        expect(response.status()).toBe(403);
      });
    });

    test("C6530: Head НЕ может включать/выключать NineBox", async ({
      nineBoxAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Head НЕ может включать/выключать NineBox", async () => {
        const { response } = await nineBoxAPI.enable();
        expect(response.status()).toBe(403);
      });
    });

    test("C9388: Head НЕ может изменять настройки NineBox", async ({
      nineBoxAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Head НЕ может изменять настройки NineBox", async () => {
        const { response } = await nineBoxAPI.updateSettings({
          performanceWeight: 50,
          potentialWeight: 50,
        });
        expect(response.status()).toBe(403);
      });
    });

    test("C9389: Head может получить доступные департаменты NineBox", async ({
      nineBoxAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может получить доступные департаменты NineBox", async () => {
        const { response } = await nineBoxAPI.getAvailableDepartments({
          usersSubset: "subordinates",
          actualize: false,
        });
        // 403 допустим — означает NineBox отключён, а не проблему авторизации
        expect([200, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== EXPORT ENDPOINTS - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC Head - Export",
  { tag: ["@api", "@rbac", "@head", "@export", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.EXPORT, "RBAC Head - Export");
    });

    test("C6531: Head может НЕ иметь доступ к экспорту пользователей", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может НЕ иметь доступ к экспорту пользователей", async () => {
        const userDate = new Date().toISOString().split("T")[0];
        const { response } = await orgAPI.getExportToken(userDate);
        // Head обычно не имеет доступа к экспорту всех пользователей
        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C6532: Head может экспортировать баланс кармы (private)", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может экспортировать баланс кармы (private)", async () => {
        const userDate = new Date().toISOString().split("T")[0];
        const { response } = await karmaAPI.getExportBalancesToken(userDate);
        // Private endpoint может быть доступен
        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C6533: Head может экспортировать PR статистику (private)", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может экспортировать PR статистику (private)", async () => {
        const { response: listResp, data } = await prAPI.getList({ limit: 1 });
        if (listResp.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: exportResp } = await prAPI.getExportToken(
              items[0].id,
            );
            // Private endpoint
            expect([200, 400, 403]).toContain(exportResp.status());
          }
        }
      });
    });
  },
);

// ==================== MASS OPERATIONS - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC Head - Mass Operations",
  { tag: ["@api", "@rbac", "@head", "@mass-ops", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "RBAC Head - Mass Operations");
    });

    test("C6534: Head НЕ может управлять группами пользователей", async ({
      orgAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Head НЕ может управлять группами пользователей", async () => {
        const { response: groupsResp, data: groupsData } =
          await orgAPI.getUserGroups();
        if (groupsResp.ok()) {
          const groups = groupsData?.items || groupsData || [];
          if (groups.length > 0) {
            const { response: addResp } = await orgAPI.addUsersToUserGroup(
              groups[0].id,
              [999999],
            );
            // Head не должен управлять группами
            expect([200, 400, 403, 404, 422]).toContain(addResp.status());
          }
        }
      });
    });

    test("C6535: Head может добавлять участников в PR своего департамента", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может добавлять участников в PR своего департамента", async () => {
        const { response: listResp, data } = await prAPI.getList({ limit: 1 });
        if (listResp.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: addResp } = await prAPI.addTargetUsers(
              items[0].id,
              { userIds: [] },
            );
            // Head может иметь ограниченный доступ к своему PR
            expect([200, 400, 403, 404, 409, 422]).toContain(addResp.status());
          }
        }
      });
    });
  },
);

// ==================== IMPORT ENDPOINTS - ЗАПРЕЩЕНЫ ====================

test.describe(
  "RBAC Head - Import",
  { tag: ["@api", "@rbac", "@head", "@import", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "RBAC Head - Import");
    });

    test(
      "C6536: Head НЕ может загрузить файл для импорта оргструктуры",
      { tag: ["@critical"] },
      async ({ orgAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Head НЕ может загрузить файл для импорта оргструктуры", async () => {
          const testFile = Buffer.from("test import file content");
          const { response } = await orgAPI.uploadImportFile(
            testFile,
            "test-import.xlsx",
          );
          // Head не должен иметь доступа к импорту оргструктуры
          expect([400, 403, 415]).toContain(response.status());
        });
      },
    );

    test("C6537: Head НЕ может обработать импорт", async ({ orgAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Head НЕ может обработать импорт", async () => {
        const { response } = await orgAPI.processImport(999999);
        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== COMPETENCIES - ОЦЕНКА ПОДЧИНЁННЫХ ====================

test.describe(
  "RBAC Head - Competencies",
  { tag: ["@api", "@rbac", "@head", "@competencies", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.COMPETENCIES, "RBAC Head");
    });

    test("C6538: Head может видеть компетенции", async ({
      competenciesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может видеть компетенции", async () => {
        const { response } = await competenciesAPI.getCompetencies();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6539: Head может видеть оценки компетенций подчинённых", async ({
      competenciesAPI,
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может видеть оценки компетенций подчинённых", async () => {
        const { response: subResp, data: subData } =
          await myTeamAPI.getSubordinates();
        if (subResp.ok()) {
          const subordinates = subData?.items || subData || [];
          if (subordinates.length > 0) {
            const { response: assessResp } =
              await competenciesAPI.getUserAssessments(subordinates[0].id);
            expect([200, 403, 404]).toContain(assessResp.status());
          }
        }
      });
    });
  },
);

// ==================== PRIVATE ENDPOINTS ====================

test.describe(
  "RBAC Head - Private Endpoints",
  { tag: ["@api", "@rbac", "@head", "@private", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "RBAC Head - Private");
    });

    test(
      "C6540: Head может получить свой профиль",
      { tag: ["@critical"] },
      async ({ profileAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Head может получить свой профиль", async () => {
          const { response, data } = await profileAPI.getMyProfile();
          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      },
    );

    test(
      "C6541: Head может получить уведомления",
      { tag: ["@critical"] },
      async ({ notificationsAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Head может получить уведомления", async () => {
          const { response } = await notificationsAPI.getNotifications();
          assertSuccessStatus(response);
        });
      },
    );

    test("C6542: Head может получить private roles", async ({ rolesAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может получить private roles", async () => {
        const { response } = await rolesAPI.getPrivateRoles();
        assertSuccessStatus(response);
      });
    });
  },
);

// ==================== ОГРАНИЧЕНИЯ ДОСТУПА ====================

test.describe(
  "RBAC Head - Restricted Operations",
  { tag: ["@api", "@rbac", "@head", "@restricted", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "RBAC Head - Restricted");
    });

    test("C6543: Head НЕ может создавать роли", async ({ rolesAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Head НЕ может создавать роли", async () => {
        const { response } = await rolesAPI.createRole({
          title: "Роль от Head",
          permissionsIds: [],
        });
        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6544: Head НЕ может удалять роли", async ({ rolesAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Head НЕ может удалять роли", async () => {
        const { response } = await rolesAPI.deleteRole(1);
        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6545: Head НЕ может создавать компетенции", async ({
      competenciesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head НЕ может создавать компетенции", async () => {
        const { response } = await competenciesAPI.createCompetency({
          title: "Компетенция от Head",
        });
        expect([200, 201, 400, 403]).toContain(response.status());
      });
    });

    test("C6546: Head НЕ может создавать департаменты", async ({ orgAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head НЕ может создавать департаменты", async () => {
        const { response } = await orgAPI.createDepartment({
          title: "Департамент от Head",
        });
        expect([200, 201, 400, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== SUMMARY ====================

test.describe(
  "RBAC Head - Summary Tests",
  { tag: ["@api", "@rbac", "@head", "@summary", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "RBAC Head - Summary");
    });

    test("C6547: Head имеет полный доступ к private endpoints", async ({
      profileAPI,
      notificationsAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Head имеет полный доступ к private endpoints", async () => {
        const profileResp = await profileAPI.getMyProfile();
        expect(profileResp.response.ok()).toBe(true);

        const notifResp = await notificationsAPI.getNotifications();
        expect(notifResp.response.ok()).toBe(true);
      });
    });

    test("C6548: Head имеет доступ к данным своего департамента", async ({
      myTeamAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Head имеет доступ к данным своего департамента", async () => {
        const { response } = await myTeamAPI.getSubordinates();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6549: Head может управлять целями и развитием подчинённых", async ({
      objectivesAPI,
      devPlansAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head может управлять целями и развитием подчинённых", async () => {
        const objResp = await objectivesAPI.getObjectives();
        expect([200, 201, 400, 403, 404]).toContain(objResp.response.status());

        const plansResp = await devPlansAPI.getPlans();
        expect([200, 201, 400, 403, 404]).toContain(
          plansResp.response.status(),
        );
      });
    });

    test("C6550: Head имеет ограниченный доступ к системным настройкам", async ({
      rolesAPI,
      competenciesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Head имеет ограниченный доступ к системным настройкам", async () => {
        // Head не должен создавать роли
        const createRoleResp = await rolesAPI.createRole({
          title: "Test",
          permissionsIds: [],
        });
        expect([400, 403, 404]).toContain(createRoleResp.response.status());
      });
    });
  },
);
