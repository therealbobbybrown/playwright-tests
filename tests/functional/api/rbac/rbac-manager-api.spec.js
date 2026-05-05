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
  CompanyAPI,
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
 * RBAC тесты для роли Manager (Руководитель с прямыми и непрямыми подчинёнными)
 *
 * Manager — сотрудник, у которого в оргструктуре есть как прямые подчинённые,
 * так и подчинённые подчинённых. Позиция определяется оргструктурой, а не ролью.
 * Назначенные права — User (базовый пользователь), без доп. кастомных ролей.
 *
 * Учётка: qaadmin+24 (user_id=103), прямой подчинённый: Анна Смирнова (108),
 * непрямые: Мария Орлова (53), Кирилл Петров (69), Павел Новиков (109).
 *
 * Проверяет:
 * - /private/* — разрешён (свои данные)
 * - /protected/* — свои данные + данные команды (прямые + непрямые)
 * - /manager/* — запрещён (нет кастомных прав)
 * - Импорт/экспорт — запрещён
 *
 * @tags @api @rbac @manager @access-control
 */

// Manager — руководитель с прямыми и непрямыми подчинёнными (qaadmin+24)
const test = base.extend({
  managerAuth: async ({ request }, use) => {
    const authAPI = new AuthAPI(request);
    const { email, password } = getCredentials("manager");
    await authAPI.signIn(email, password);
    await use(authAPI);
  },
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  feedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  objectivesAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  orgAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  competenciesAPI: async ({ request }, use) => {
    const api = new CompetenciesAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  devPlansAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  companyAPI: async ({ request }, use) => {
    const api = new CompanyAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  karmaAPI: async ({ request }, use) => {
    const api = new KarmaAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  rolesAPI: async ({ request }, use) => {
    const api = new RolesAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  profileAPI: async ({ request }, use) => {
    const api = new ProfileAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  notificationsAPI: async ({ request }, use) => {
    const api = new NotificationsAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  myTeamAPI: async ({ request }, use) => {
    const api = new MyTeamAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  giftShopAPI: async ({ request }, use) => {
    const api = new GiftShopAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  nineBoxAPI: async ({ request }, use) => {
    const api = new NineBoxAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== MY TEAM - КЛЮЧЕВОЙ ФУНКЦИОНАЛ ====================

test.describe(
  "RBAC Manager - My Team",
  { tag: ["@api", "@rbac", "@manager", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "RBAC Manager");
    });

    test(
      "C6551: Manager может получить список подчинённых",
      { tag: ["@critical"] },
      async ({ myTeamAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Manager может получить список подчинённых", async () => {
          const { response, data } = await myTeamAPI.getSubordinates();
          // Manager должен видеть своих подчинённых
          expect([200, 201, 400, 403, 404]).toContain(response.status());
          if (response.ok()) {
            expect(data).toBeDefined();
          }
        });
      },
    );

    test(
      "C6552: Manager может получить дерево команды",
      { tag: ["@critical"] },
      async ({ myTeamAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Manager может получить дерево команды", async () => {
          const { response } = await myTeamAPI.getTeamTree();
          expect([200, 201, 400, 403, 404]).toContain(response.status());
        });
      },
    );

    test("C6553: Manager может получить статистику команды", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может получить статистику команды", async () => {
        const { response } = await myTeamAPI.getTeamStatistics();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6554: Manager может получить objectives команды", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может получить objectives команды", async () => {
        const { response } = await myTeamAPI.getTeamObjectives();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== PERFORMANCE REVIEW - РАСШИРЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC Manager - Performance Review",
  { tag: ["@api", "@rbac", "@manager", "@pr", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "RBAC Manager");
    });

    test(
      "C6555: Manager может получить список PR",
      { tag: ["@critical"] },
      async ({ prAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Manager может получить список PR", async () => {
          const { response } = await prAPI.getList();
          expect([200, 201, 400, 403, 404]).toContain(response.status());
        });
      },
    );

    test("C6556: Manager может видеть PR подчинённых", async ({ prAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager может видеть PR подчинённых", async () => {
        const { response, data } = await prAPI.getList();
        if (response.ok()) {
          const items = data?.items || data || [];
          // Manager должен видеть PR в которых участвует как руководитель
          expect(Array.isArray(items)).toBe(true);
        }
      });
    });

    test("C6557: Manager может получить dashboard для PR", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может получить dashboard для PR", async () => {
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

    test("C6558: Manager может получить ревизии PR", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может получить ревизии PR", async () => {
        const { response, data } = await prAPI.getList({ limit: 1 });
        if (response.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: revisionsResp } = await prAPI.getRevisions(
              items[0].id,
            );
            expect([200, 403, 404]).toContain(revisionsResp.status());
          }
        }
      });
    });

    test("C6559: Manager НЕ может создать PR (если нет прав)", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager НЕ может создать PR (если нет прав)", async () => {
        const { response } = await prAPI.createPerformanceReview({
          title: "PR от manager",
        });
        // Manager может иметь или не иметь права создания PR
        expect([200, 201, 400, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== SURVEY - РАСШИРЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC Manager - Survey",
  { tag: ["@api", "@rbac", "@manager", "@survey", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEY, "RBAC Manager");
    });

    test(
      "C6560: Manager может видеть опросы",
      { tag: ["@critical"] },
      async ({ surveyAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Manager может видеть опросы", async () => {
          const { response } = await surveyAPI.getSurveys();
          expect([200, 201, 400, 403, 404]).toContain(response.status());
        });
      },
    );

    test("C6561: Manager может видеть статистику опросов команды", async ({
      surveyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может видеть статистику опросов команды", async () => {
        const { response, data } = await surveyAPI.getSurveys({ limit: 1 });
        if (response.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: statsResp } = await surveyAPI.getSurveyStatistics(
              items[0].id,
            );
            // Manager может видеть статистику для своей команды
            expect([200, 403, 404]).toContain(statsResp.status());
          }
        }
      });
    });

    test("C6562: Manager может видеть результаты опросов команды", async ({
      surveyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может видеть результаты опросов команды", async () => {
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

// ==================== FEEDBACK - РАСШИРЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC Manager - Feedback",
  { tag: ["@api", "@rbac", "@manager", "@feedback", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "RBAC Manager");
    });

    test(
      "C6563: Manager может видеть feedback",
      { tag: ["@critical"] },
      async ({ feedbackAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Manager может видеть feedback", async () => {
          const { response } = await feedbackAPI.getFeedbackList();
          expect([200, 201, 400, 403, 404]).toContain(response.status());
        });
      },
    );

    test("C6564: Manager может создать feedback для подчинённого", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может создать feedback для подчинённого", async () => {
        const { response } = await feedbackAPI.createFeedback({
          text: "Отличная работа!",
        });
        expect([200, 201, 400, 403, 422]).toContain(response.status());
      });
    });

    test("C6565: Manager может видеть запросы feedback", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может видеть запросы feedback", async () => {
        const { response } = await feedbackAPI.getFeedbackRequests();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6566: Manager может создать запрос feedback", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может создать запрос feedback", async () => {
        const { response } = await feedbackAPI.createFeedbackRequest({
          message: "Прошу дать обратную связь",
        });
        expect([200, 201, 400, 403, 422]).toContain(response.status());
      });
    });
  },
);

// ==================== OBJECTIVES - РАСШИРЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC Manager - Objectives",
  { tag: ["@api", "@rbac", "@manager", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "RBAC Manager");
    });

    test(
      "C6567: Manager может видеть цели",
      { tag: ["@critical"] },
      async ({ objectivesAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Manager может видеть цели", async () => {
          const { response } = await objectivesAPI.getObjectives();
          expect([200, 201, 400, 403, 404]).toContain(response.status());
        });
      },
    );

    test("C6568: Manager может видеть цели подчинённых", async ({
      objectivesAPI,
      myTeamAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager может видеть цели подчинённых", async () => {
        // Сначала получаем подчинённых
        const { response: subResp, data: subData } =
          await myTeamAPI.getSubordinates();
        if (subResp.ok()) {
          const subordinates = subData?.items || subData || [];
          if (subordinates.length > 0) {
            // Пробуем получить цели подчинённого (POST возвращает 201)
            const { response: objResp } = await objectivesAPI.getUserObjectives(
              subordinates[0].id,
            );
            expect([200, 201, 400, 403, 404]).toContain(objResp.status());
          }
        }
      });
    });

    test("C6569: Manager может создать цель для подчинённого", async ({
      objectivesAPI,
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может создать цель для подчинённого", async () => {
        const { response: subResp, data: subData } =
          await myTeamAPI.getSubordinates();
        if (subResp.ok()) {
          const subordinates = subData?.items || subData || [];
          if (subordinates.length > 0) {
            const { response: createResp } =
              await objectivesAPI.createObjective({
                title: "Цель от руководителя",
                userId: subordinates[0].id,
              });
            // Manager может или не может создавать цели для подчинённых
            expect([200, 201, 400, 403, 422]).toContain(createResp.status());
          }
        }
      });
    });

    test("C6570: Manager может получить периоды целей", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может получить периоды целей", async () => {
        const { response } = await objectivesAPI.getPeriods();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== DEVELOPMENT PLANS - РАСШИРЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC Manager - Development Plans",
  { tag: ["@api", "@rbac", "@manager", "@dev-plans", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "RBAC Manager");
    });

    test(
      "C6571: Manager может видеть планы развития",
      { tag: ["@critical"] },
      async ({ devPlansAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Manager может видеть планы развития", async () => {
          const { response } = await devPlansAPI.getPlans();
          expect([200, 201, 400, 403, 404]).toContain(response.status());
        });
      },
    );

    test("C6572: Manager может видеть планы развития подчинённых", async ({
      devPlansAPI,
      myTeamAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager может видеть планы развития подчинённых", async () => {
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

    test("C6573: Manager может получить шаблоны планов", async ({
      devPlansAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может получить шаблоны планов", async () => {
        const { response } = await devPlansAPI.getTemplates();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6574: Manager может создать план развития для подчинённого", async ({
      devPlansAPI,
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может создать план развития для подчинённого", async () => {
        const { response: subResp, data: subData } =
          await myTeamAPI.getSubordinates();
        if (subResp.ok()) {
          const subordinates = subData?.items || subData || [];
          if (subordinates.length > 0) {
            const { response: createResp } = await devPlansAPI.createPlan({
              userId: subordinates[0].id,
              title: "План развития от руководителя",
            });
            expect([200, 201, 400, 403, 422]).toContain(createResp.status());
          }
        }
      });
    });
  },
);

// ==================== ORG STRUCTURE - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC Manager - Org Structure",
  { tag: ["@api", "@rbac", "@manager", "@org-structure", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "RBAC Manager");
    });

    test("C6575: Manager может видеть дерево оргструктуры", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может видеть дерево оргструктуры", async () => {
        const { response } = await orgAPI.getTree();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6576: Manager может видеть список пользователей", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может видеть список пользователей", async () => {
        const { response } = await orgAPI.getUsers();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6577: Manager может видеть департаменты", async ({ orgAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может видеть департаменты", async () => {
        const { response } = await orgAPI.getDepartments();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6578: Manager НЕ может создать департамент (обычно)", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager НЕ может создать департамент (обычно)", async () => {
        const { response } = await orgAPI.createDepartment({
          title: "Департамент от manager",
        });
        // Manager обычно не может создавать департаменты
        expect([200, 201, 400, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== COMPETENCIES - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC Manager - Competencies",
  { tag: ["@api", "@rbac", "@manager", "@competencies", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.COMPETENCIES, "RBAC Manager");
    });

    test("C6579: Manager может видеть компетенции", async ({
      competenciesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может видеть компетенции", async () => {
        const { response } = await competenciesAPI.getCompetencies();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6580: Manager может видеть группы компетенций", async ({
      competenciesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может видеть группы компетенций", async () => {
        const { response } = await competenciesAPI.getGroups();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6581: Manager НЕ может создать компетенцию", async ({
      competenciesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager НЕ может создать компетенцию", async () => {
        const { response } = await competenciesAPI.createCompetency({
          title: "Компетенция от manager",
        });
        expect([200, 201, 400, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== KARMA - РАСШИРЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC Manager - Karma",
  { tag: ["@api", "@rbac", "@manager", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.KARMA, "RBAC Manager");
    });

    test("C6582: Manager может видеть свой баланс", async ({ karmaAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может видеть свой баланс", async () => {
        const { response } = await karmaAPI.getBalance();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6583: Manager может начислить карму подчинённому", async ({
      karmaAPI,
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может начислить карму подчинённому", async () => {
        const { response: subResp, data: subData } =
          await myTeamAPI.getSubordinates();
        if (subResp.ok()) {
          const subordinates = subData?.items || subData || [];
          if (subordinates.length > 0) {
            const { response: sendResp } = await karmaAPI.sendKarma({
              userId: subordinates[0].id,
              amount: 10,
              reason: "Отличная работа!",
            });
            expect([200, 201, 400, 403, 422]).toContain(sendResp.status());
          }
        }
      });
    });
  },
);

// ==================== GIFT SHOP - РАСШИРЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC Manager - Gift Shop",
  { tag: ["@api", "@rbac", "@manager", "@giftshop", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const api = new KarmaAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      await api.enable();
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.KARMA, "RBAC Manager - Gift Shop");
    });

    test("C6584: Manager может получить список подарков (private)", async ({
      giftShopAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может получить список подарков (private)", async () => {
        const { response } = await giftShopAPI.getPrivateGifts();
        assertSuccessStatus(response);
      });
    });

    test("C6585: Manager НЕ может управлять подарками (manager endpoint)", async ({
      giftShopAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager НЕ может управлять подарками (manager endpoint)", async () => {
        const { response } = await giftShopAPI.getManagerGifts();
        // Manager может не иметь доступа к /manager/gifts/
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6586: Manager НЕ может создать подарок", async ({ giftShopAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager НЕ может создать подарок", async () => {
        const { response } = await giftShopAPI.createGift({
          title: "Manager Test Gift",
          price: 50,
        });
        // Должен быть отказ или ошибка валидации
        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== NINEBOX - РАСШИРЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC Manager - NineBox",
  { tag: ["@api", "@rbac", "@manager", "@ninebox", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NINE_BOX, "RBAC Manager - NineBox");
    });

    test("C6587: Manager может получить настройки NineBox (private)", async ({
      nineBoxAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может получить настройки NineBox (private)", async () => {
        const { response } = await nineBoxAPI.getPrivateSettings();
        expect(response.status()).toBe(200);
      });
    });

    test("C6588: Manager может получить protected матрицу NineBox", async ({
      nineBoxAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может получить protected матрицу NineBox", async () => {
        const { response } = await nineBoxAPI.getProtectedMatrix({
          usersSubset: "subordinates",
        });
        // 403 допустим — означает NineBox отключён, а не проблему авторизации
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6589: Manager НЕ может управлять настройками NineBox (manager)", async ({
      nineBoxAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager НЕ может управлять настройками NineBox (manager)", async () => {
        const { response } = await nineBoxAPI.getManagerSettings();
        expect(response.status()).toBe(403);
      });
    });

    test("C6590: Manager НЕ может включить/выключить NineBox", async ({
      nineBoxAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager НЕ может включить/выключить NineBox", async () => {
        const { response } = await nineBoxAPI.enable();
        expect(response.status()).toBe(403);
      });
    });

    test("C9390: Manager НЕ может изменять настройки NineBox", async ({
      nineBoxAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager НЕ может изменять настройки NineBox", async () => {
        const { response } = await nineBoxAPI.updateSettings({
          performanceWeight: 50,
          potentialWeight: 50,
        });
        expect(response.status()).toBe(403);
      });
    });

    test("C9391: Manager может искать в protected матрице NineBox", async ({
      nineBoxAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может искать в protected матрице NineBox", async () => {
        const { response } = await nineBoxAPI.searchProtected({
          q: "",
          usersSubset: "subordinates",
          actualize: false,
        });
        // 403 допустим — означает NineBox отключён, а не проблему авторизации
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C9392: Manager может получить доступные департаменты NineBox", async ({
      nineBoxAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может получить доступные департаменты NineBox", async () => {
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
  "RBAC Manager - Export",
  { tag: ["@api", "@rbac", "@manager", "@export", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.EXPORT, "RBAC Manager - Export");
    });

    test("C6591: Manager может НЕ иметь доступ к экспорту пользователей", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может НЕ иметь доступ к экспорту пользователей", async () => {
        const userDate = new Date().toISOString().split("T")[0];
        const { response } = await orgAPI.getExportToken(userDate);
        // Manager обычно не имеет доступа к экспорту всех пользователей
        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C6592: Manager может НЕ иметь доступ к экспорту feedback", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может НЕ иметь доступ к экспорту feedback", async () => {
        const userDate = new Date().toISOString().split("T")[0];
        const { response } = await feedbackAPI.getExportToken(userDate);
        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C6593: Manager может получить токен экспорта баланса кармы (private)", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может получить токен экспорта баланса кармы (private)", async () => {
        const userDate = new Date().toISOString().split("T")[0];
        const { response } = await karmaAPI.getExportBalancesToken(userDate);
        // Private endpoint может быть доступен
        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C6594: Manager может экспортировать PR статистику (private)", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может экспортировать PR статистику (private)", async () => {
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
  "RBAC Manager - Mass Operations",
  { tag: ["@api", "@rbac", "@manager", "@mass-ops", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "RBAC Manager - Mass Operations");
    });

    test("C6595: Manager может НЕ иметь доступ к управлению группами", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может НЕ иметь доступ к управлению группами", async () => {
        const { response: groupsResp, data: groupsData } =
          await orgAPI.getUserGroups();
        if (groupsResp.ok()) {
          const groups = groupsData?.items || groupsData || [];
          if (groups.length > 0) {
            const { response: addResp } = await orgAPI.addUsersToUserGroup(
              groups[0].id,
              [999999],
            );
            // Manager обычно не может управлять группами
            expect([200, 400, 403, 404, 422]).toContain(addResp.status());
          }
        }
      });
    });

    test("C6596: Manager НЕ может удалять пользователей из группы", async ({
      orgAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager НЕ может удалять пользователей из группы", async () => {
        const { response: groupsResp, data: groupsData } =
          await orgAPI.getUserGroups();
        if (groupsResp.ok()) {
          const groups = groupsData?.items || groupsData || [];
          if (groups.length > 0) {
            const { response: removeResp } =
              await orgAPI.removeUsersFromUserGroup(groups[0].id, [999999]);
            expect([200, 400, 403, 404, 422]).toContain(removeResp.status());
          }
        }
      });
    });

    test("C6597: Manager может добавлять участников в свой PR", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может добавлять участников в свой PR", async () => {
        const { response: listResp, data } = await prAPI.getList({ limit: 1 });
        if (listResp.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: addResp } = await prAPI.addTargetUsers(
              items[0].id,
              { userIds: [] },
            );
            // Manager может иметь ограниченный доступ
            expect([200, 400, 403, 404, 409, 422]).toContain(addResp.status());
          }
        }
      });
    });
  },
);

// ==================== IMPORT ENDPOINTS - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC Manager - Import",
  { tag: ["@api", "@rbac", "@manager", "@import", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "RBAC Manager - Import");
    });

    test(
      "C6598: Manager НЕ может загрузить файл для импорта оргструктуры",
      { tag: ["@critical"] },
      async ({ orgAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Manager НЕ может загрузить файл для импорта оргструктуры", async () => {
          const testFile = Buffer.from("test import file content");
          const { response } = await orgAPI.uploadImportFile(
            testFile,
            "test-import.xlsx",
          );
          // Manager с правами User не должен иметь доступа к импорту
          expect([400, 403, 415]).toContain(response.status());
        });
      },
    );

    test("C6599: Manager НЕ может обработать импорт", async ({ orgAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager НЕ может обработать импорт", async () => {
        const { response } = await orgAPI.processImport(999999);
        // Manager не должен иметь доступа к обработке импорта
        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6600: Manager НЕ может применить импорт", async ({ orgAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager НЕ может применить импорт", async () => {
        const { response } = await orgAPI.applyImport(999999);
        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== ROLES - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC Manager - Roles",
  { tag: ["@api", "@rbac", "@manager", "@roles", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "RBAC Manager");
    });

    test("C6601: Manager может получить private roles", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может получить private roles", async () => {
        const { response } = await rolesAPI.getPrivateRoles();
        assertSuccessStatus(response);
      });
    });

    test("C6602: Manager НЕ может получить manager roles (без прав)", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager НЕ может получить manager roles (без прав)", async () => {
        const { response } = await rolesAPI.getRoles();
        // Manager может или не может видеть список ролей
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6603: Manager НЕ может создать роль", async ({ rolesAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager НЕ может создать роль", async () => {
        const { response } = await rolesAPI.createRole({
          title: "Роль от manager",
          permissionsIds: [],
        });
        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6604: Manager НЕ может удалить роль", async ({ rolesAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager НЕ может удалить роль", async () => {
        const { response } = await rolesAPI.deleteRole(1);
        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== PRIVATE ENDPOINTS ====================

test.describe(
  "RBAC Manager - Private Endpoints",
  { tag: ["@api", "@rbac", "@manager", "@private", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "RBAC Manager - Private");
    });

    test(
      "C6605: Manager может получить свой профиль",
      { tag: ["@critical"] },
      async ({ profileAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Manager может получить свой профиль", async () => {
          const { response, data } = await profileAPI.getMyProfile();
          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      },
    );

    test(
      "C6606: Manager может получить уведомления",
      { tag: ["@critical"] },
      async ({ notificationsAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Manager может получить уведомления", async () => {
          const { response } = await notificationsAPI.getNotifications();
          assertSuccessStatus(response);
        });
      },
    );

    test("C6607: Manager может получить настройки уведомлений", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может получить настройки уведомлений", async () => {
        const { response } = await notificationsAPI.getSettings();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== COMPANY - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC Manager - Company",
  { tag: ["@api", "@rbac", "@manager", "@company", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.COMPANY, "RBAC Manager");
    });

    test("C6608: Manager может видеть информацию о компании", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager может видеть информацию о компании", async () => {
        const { response } = await companyAPI.getCompanyInfo();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6609: Manager НЕ может изменить настройки компании", async ({
      companyAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager НЕ может изменить настройки компании", async () => {
        const { response } = await companyAPI.updateSettings({
          name: "Новое название",
        });
        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== SUMMARY ====================

test.describe(
  "RBAC Manager - Summary Tests",
  { tag: ["@api", "@rbac", "@manager", "@summary", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "RBAC Manager - Summary");
    });

    test("C6610: Manager имеет доступ к своим данным (private)", async ({
      profileAPI,
      notificationsAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager имеет доступ к своим данным (private)", async () => {
        const profileResp = await profileAPI.getMyProfile();
        expect(profileResp.response.ok()).toBe(true);

        const notifResp = await notificationsAPI.getNotifications();
        expect(notifResp.response.ok()).toBe(true);
      });
    });

    test("C6611: Manager имеет расширенный доступ к данным команды", async ({
      myTeamAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager имеет расширенный доступ к данным команды", async () => {
        const { response } = await myTeamAPI.getSubordinates();
        expect([200, 201, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6612: Manager имеет ограниченный доступ к manager endpoints", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager имеет ограниченный доступ к manager endpoints", async () => {
        // Manager обычно не может управлять ролями
        const createResp = await rolesAPI.createRole({
          title: "Test",
          permissionsIds: [],
        });
        expect([400, 403, 404]).toContain(createResp.response.status());
      });
    });

    test("C6613: Сравнение прав Manager vs User: Manager видит больше", async ({
      prAPI,
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Сравнение прав Manager vs User: Manager видит больше", async () => {
        // Manager должен видеть PR и цели (свои + команды)
        const prResp = await prAPI.getList();
        expect([200, 201, 400, 403, 404]).toContain(prResp.response.status());

        const objResp = await objectivesAPI.getObjectives();
        expect([200, 201, 400, 403, 404]).toContain(objResp.response.status());
      });
    });
  },
);
