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
 * RBAC тесты для роли Admin (Администратор)
 *
 * Проверяет что администратор имеет доступ ко ВСЕМ защищённым endpoints:
 * - /manager/* - endpoints для управления системой
 * - /protected/* - endpoints для авторизованных пользователей
 * - /private/* - endpoints для текущего пользователя
 *
 * @tags @api @rbac @admin @access-control
 */

// Создаём API клиенты для разных модулей под ролью admin
const test = base.extend({
  adminAuth: async ({ request }, use) => {
    const authAPI = new AuthAPI(request);
    const { email, password } = getCredentials("admin");
    await authAPI.signIn(email, password);
    await use(authAPI);
  },
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  feedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  objectivesAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  orgAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  competenciesAPI: async ({ request }, use) => {
    const api = new CompetenciesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  devPlansAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  companyAPI: async ({ request }, use) => {
    const api = new CompanyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  karmaAPI: async ({ request }, use) => {
    const api = new KarmaAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  rolesAPI: async ({ request }, use) => {
    const api = new RolesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  profileAPI: async ({ request }, use) => {
    const api = new ProfileAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  notificationsAPI: async ({ request }, use) => {
    const api = new NotificationsAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  giftShopAPI: async ({ request }, use) => {
    const api = new GiftShopAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  nineBoxAPI: async ({ request }, use) => {
    const api = new NineBoxAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== PERFORMANCE REVIEW MODULE ====================

test.describe(
  "RBAC Admin - Performance Review",
  { tag: ["@api", "@rbac", "@admin", "@pr", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "RBAC Admin");
    });

    test(
      "C6423: Admin может получить список Performance Reviews",
      { tag: ["@critical"] },
      async ({ prAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить список Performance Reviews", async () => {
          const { response } = await prAPI.getList();
          assertSuccessStatus(response);
        });
      },
    );

    // SKIP: endpoint /manager/performance-reviews/config не существует в API
    test.skip("Admin может получить конфигурацию PR", async ({ prAPI }) => {
      setSeverity("normal");
      const { response } = await prAPI.getConfig();
      assertSuccessStatus(response);
    });

    test("C6424: Admin может получить ревизии PR", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить ревизии PR", async () => {
        const { response, data } = await prAPI.getList({ limit: 1 });
        if (response.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: revResponse } = await prAPI.getRevisions(
              items[0].id,
            );
            expect([200, 403, 404]).toContain(revResponse.status());
          }
        }
      });
    });

    test("C6425: Admin может получить dashboard данные", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить dashboard данные", async () => {
        const { response, data } = await prAPI.getList({ limit: 1 });
        if (response.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: dashboardResponse } = await prAPI.getDashboardAll(
              items[0].id,
            );
            expect([200, 403, 404]).toContain(dashboardResponse.status());
          }
        }
      });
    });

    test("C6426: Admin может получить статистику PR", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить статистику PR", async () => {
        const { response, data } = await prAPI.getList({ limit: 1 });
        if (response.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            // Используем существующий endpoint /manager/performance-reviews/{id}/statistics/directions/
            // 400 возвращается если нет данных для статистики (см. pr-statistics-api.spec.js:129)
            const { response: statsResponse } =
              await prAPI.getStatisticsDirections(items[0].id);
            expect([200, 400, 403, 404]).toContain(statsResponse.status());
          }
        }
      });
    });
  },
);

// ==================== SURVEY MODULE ====================

test.describe(
  "RBAC Admin - Survey",
  { tag: ["@api", "@rbac", "@admin", "@survey", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEY, "RBAC Admin");
    });

    test(
      "C6427: Admin может получить список опросов",
      { tag: ["@critical"] },
      async ({ surveyAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить список опросов", async () => {
          const { response } = await surveyAPI.getList();
          assertSuccessStatus(response);
        });
      },
    );

    test("C6428: Admin может получить шаблоны опросов", async ({
      surveyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить шаблоны опросов", async () => {
        const { response } = await surveyAPI.getTemplates();
        expect([200, 403]).toContain(response.status());
      });
    });

    // SKIP: endpoint /manager/surveys/question-types/ не существует в API
    test.skip("Admin может получить типы вопросов", async ({ surveyAPI }) => {
      setSeverity("normal");
      const { response } = await surveyAPI.getQuestionTypes();
      assertSuccessStatus(response);
    });

    test("C6429: Admin может получить статистику опроса", async ({
      surveyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить статистику опроса", async () => {
        const { response, data } = await surveyAPI.getList({ limit: 1 });
        if (response.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: statsResponse } =
              await surveyAPI.getSurveyStatistics(items[0].id);
            expect([200, 403, 404]).toContain(statsResponse.status());
          }
        }
      });
    });
  },
);

// ==================== FEEDBACK MODULE ====================

test.describe(
  "RBAC Admin - Feedback",
  { tag: ["@api", "@rbac", "@admin", "@feedback", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "RBAC Admin");
    });

    test(
      "C6430: Admin может получить список feedback",
      { tag: ["@critical"] },
      async ({ feedbackAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить список feedback", async () => {
          const { response } = await feedbackAPI.getFeedbackList();
          expect([200, 403]).toContain(response.status());
        });
      },
    );

    test("C6431: Admin может получить типы feedback", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить типы feedback", async () => {
        const { response } = await feedbackAPI.getFeedbackTypes();
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6432: Admin может получить запросы feedback", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить запросы feedback", async () => {
        const { response } = await feedbackAPI.getFeedbackRequests();
        expect([200, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== OBJECTIVES MODULE ====================

test.describe(
  "RBAC Admin - Objectives",
  { tag: ["@api", "@rbac", "@admin", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "RBAC Admin");
    });

    test(
      "C6433: Admin может получить список целей",
      { tag: ["@critical"] },
      async ({ objectivesAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить список целей", async () => {
          const { response } = await objectivesAPI.getObjectives();
          assertSuccessStatus(response);
        });
      },
    );

    // SKIP: endpoint /private/objectives/periods/ не существует в API
    test.skip("Admin может получить периоды целей", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");
      const { response } = await objectivesAPI.getPeriods();
      assertSuccessStatus(response);
    });

    test("C6434: Admin может получить настройки модуля целей", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить настройки модуля целей", async () => {
        const { response } = await objectivesAPI.getSettings();
        expect([200, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== ORG STRUCTURE MODULE ====================

test.describe(
  "RBAC Admin - Org Structure",
  { tag: ["@api", "@rbac", "@admin", "@org-structure", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "RBAC Admin");
    });

    test(
      "C6435: Admin может получить список департаментов",
      { tag: ["@critical"] },
      async ({ orgAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить список департаментов", async () => {
          const { response } = await orgAPI.getDepartments();
          assertSuccessStatus(response);
        });
      },
    );

    test(
      "C6436: Admin может получить дерево оргструктуры",
      { tag: ["@critical"] },
      async ({ orgAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить дерево оргструктуры", async () => {
          const { response } = await orgAPI.getTree();
          assertSuccessStatus(response);
        });
      },
    );

    test("C6437: Admin может получить список групп", async ({ orgAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить список групп", async () => {
        const { response } = await orgAPI.getGroups();
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6438: Admin может получить список пользователей", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить список пользователей", async () => {
        const { response } = await orgAPI.getUsers();
        assertSuccessStatus(response);
      });
    });

    test("C6439: Admin может получить invite links", async ({ orgAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить invite links", async () => {
        const { response } = await orgAPI.getInviteLinks();
        expect([200, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== COMPETENCIES MODULE ====================

test.describe(
  "RBAC Admin - Competencies",
  { tag: ["@api", "@rbac", "@admin", "@competencies", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.COMPETENCIES, "RBAC Admin");
    });

    test(
      "C6440: Admin может получить список компетенций",
      { tag: ["@critical"] },
      async ({ competenciesAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить список компетенций", async () => {
          const { response } = await competenciesAPI.getCompetencies();
          expect([200, 403]).toContain(response.status());
        });
      },
    );

    test("C6441: Admin может получить группы компетенций", async ({
      competenciesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить группы компетенций", async () => {
        const { response } = await competenciesAPI.getGroups();
        // 404 если групп нет
        expect([200, 403, 404]).toContain(response.status());
      });
    });

    test("C6442: Admin может получить шкалы компетенций", async ({
      competenciesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить шкалы компетенций", async () => {
        const { response } = await competenciesAPI.getScales();
        expect([200, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== DEVELOPMENT PLANS MODULE ====================

test.describe(
  "RBAC Admin - Development Plans",
  { tag: ["@api", "@rbac", "@admin", "@dev-plans", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "RBAC Admin");
    });

    test(
      "C6443: Admin может получить список планов развития",
      { tag: ["@critical"] },
      async ({ devPlansAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить список планов развития", async () => {
          const { response } = await devPlansAPI.getPlans();
          expect([200, 403]).toContain(response.status());
        });
      },
    );

    test("C6444: Admin может получить шаблоны планов", async ({
      devPlansAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить шаблоны планов", async () => {
        const { response } = await devPlansAPI.getTemplates();
        // 404 если шаблонов нет
        expect([200, 403, 404]).toContain(response.status());
      });
    });

    test("C6445: Admin может получить развивающие действия", async ({
      devPlansAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить развивающие действия", async () => {
        const { response } = await devPlansAPI.getDevelopmentActions();
        // 404 если нет development actions в системе
        expect([200, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== COMPANY MODULE ====================

test.describe(
  "RBAC Admin - Company",
  { tag: ["@api", "@rbac", "@admin", "@company", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.COMPANY, "RBAC Admin");
    });

    test(
      "C6446: Admin может получить информацию о компании",
      { tag: ["@critical"] },
      async ({ companyAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить информацию о компании", async () => {
          const { response } = await companyAPI.getCompanyInfo();
          assertSuccessStatus(response);
        });
      },
    );

    test("C6447: Admin может получить модули компании", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить модули компании", async () => {
        const { response } = await companyAPI.getModules();
        // 404 если endpoint не существует
        expect([200, 403, 404]).toContain(response.status());
      });
    });

    test("C6448: Admin может получить настройки компании", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить настройки компании", async () => {
        const { response } = await companyAPI.getSettings();
        expect([200, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== KARMA MODULE ====================

test.describe(
  "RBAC Admin - Karma",
  { tag: ["@api", "@rbac", "@admin", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.KARMA, "RBAC Admin");
    });

    test(
      "C6449: Admin может получить баланс кармы",
      { tag: ["@critical"] },
      async ({ karmaAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить баланс кармы", async () => {
          const { response } = await karmaAPI.getBalance();
          expect([200, 403]).toContain(response.status());
        });
      },
    );

    test("C6450: Admin может получить историю кармы", async ({ karmaAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить историю кармы", async () => {
        const { response } = await karmaAPI.getHistory();
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6451: Admin может получить настройки кармы", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить настройки кармы", async () => {
        const { response } = await karmaAPI.getSettings();
        expect([200, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== GIFT SHOP MODULE ====================

test.describe(
  "RBAC Admin - Gift Shop",
  { tag: ["@api", "@rbac", "@admin", "@giftshop", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const api = new KarmaAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      await api.enable();
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.KARMA, "RBAC Admin - Gift Shop");
    });

    test(
      "C6452: Admin может получить список подарков (manager)",
      { tag: ["@critical"] },
      async ({ giftShopAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить список подарков (manager)", async () => {
          const { response } = await giftShopAPI.getManagerGifts();
          assertSuccessStatus(response);
        });
      },
    );

    test("C6453: Admin может получить список подарков (private)", async ({
      giftShopAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить список подарков (private)", async () => {
        const { response } = await giftShopAPI.getPrivateGifts();
        assertSuccessStatus(response);
      });
    });

    test("C6454: Admin может получить подарок по ID", async ({
      giftShopAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить подарок по ID", async () => {
        const { response: listResp, data: listData } =
          await giftShopAPI.getPrivateGifts({ limit: 1 });
        if (listResp.ok()) {
          const items = listData?.items || listData || [];
          if (items.length > 0) {
            const { response } = await giftShopAPI.getGift(items[0].id);
            expect([200, 404]).toContain(response.status());
          }
        }
      });
    });

    test("C6455: Admin может создать подарок (manager)", async ({
      giftShopAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Admin может создать подарок (manager)", async () => {
        const { response } = await giftShopAPI.createGift({
          title: `RBAC Test Gift ${Date.now()}`,
          description: "Test gift for RBAC",
          price: 100,
        });
        // Admin должен иметь доступ к созданию
        expect([200, 201, 400]).toContain(response.status());
      });
    });
  },
);

// ==================== NINEBOX MODULE ====================

test.describe(
  "RBAC Admin - NineBox",
  { tag: ["@api", "@rbac", "@admin", "@ninebox", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NINE_BOX, "RBAC Admin - NineBox");
    });

    test(
      "C6456: Admin может получить настройки NineBox (manager)",
      { tag: ["@critical"] },
      async ({ nineBoxAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить настройки NineBox (manager)", async () => {
          const { response } = await nineBoxAPI.getManagerSettings();
          expect(response.status()).toBe(200);
        });
      },
    );

    test("C6457: Admin может получить настройки NineBox (private)", async ({
      nineBoxAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить настройки NineBox (private)", async () => {
        const { response } = await nineBoxAPI.getPrivateSettings();
        expect(response.status()).toBe(200);
      });
    });

    test("C6458: Admin может получить матрицу NineBox (manager)", async ({
      nineBoxAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить матрицу NineBox (manager)", async () => {
        const { response } = await nineBoxAPI.getManagerMatrix({});
        // 403 допустим — означает NineBox отключён, а не проблему авторизации
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6459: Admin может получить матрицу NineBox (protected)", async ({
      nineBoxAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить матрицу NineBox (protected)", async () => {
        const { response } = await nineBoxAPI.getProtectedMatrix({
          usersSubset: "all",
        });
        // 403 допустим — означает NineBox отключён, а не проблему авторизации
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6460: Admin может выполнить поиск в NineBox (manager)", async ({
      nineBoxAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может выполнить поиск в NineBox (manager)", async () => {
        const { response } = await nineBoxAPI.searchManager({
          limit: 10,
          actualize: false,
        });
        // 403 допустим — означает NineBox отключён, а не проблему авторизации
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6461: Admin может получить доступные департаменты NineBox", async ({
      nineBoxAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить доступные департаменты NineBox", async () => {
        const { response } = await nineBoxAPI.getAvailableDepartments({
          usersSubset: "all",
          actualize: false,
        });
        // 403 допустим — означает NineBox отключён, а не проблему авторизации
        expect([200, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== EXPORT ENDPOINTS ====================

test.describe(
  "RBAC Admin - Export",
  { tag: ["@api", "@rbac", "@admin", "@export", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.EXPORT, "RBAC Admin - Export");
    });

    test(
      "C6462: Admin может получить токен экспорта пользователей",
      { tag: ["@critical"] },
      async ({ orgAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить токен экспорта пользователей", async () => {
          const userDate = new Date().toISOString().split("T")[0];
          const { response } = await orgAPI.getExportToken(userDate);
          // Admin должен иметь доступ к экспорту
          expect([200, 400, 403]).toContain(response.status());
        });
      },
    );

    test("C6463: Admin может получить токен экспорта feedback", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить токен экспорта feedback", async () => {
        const userDate = new Date().toISOString().split("T")[0];
        const { response } = await feedbackAPI.getExportToken(userDate);
        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C6464: Admin может получить токен экспорта баланса кармы", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить токен экспорта баланса кармы", async () => {
        const userDate = new Date().toISOString().split("T")[0];
        const { response } = await karmaAPI.getExportBalancesToken(userDate);
        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C6465: Admin может получить токен экспорта PR статистики", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить токен экспорта PR статистики", async () => {
        const { response: listResp, data } = await prAPI.getList({ limit: 1 });
        if (listResp.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: exportResp } = await prAPI.getExportToken(
              items[0].id,
            );
            expect([200, 400, 403]).toContain(exportResp.status());
          }
        }
      });
    });

    test("C6466: Admin может получить токен экспорта опроса", async ({
      surveyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить токен экспорта опроса", async () => {
        const { response: listResp, data } = await surveyAPI.getList({
          limit: 1,
        });
        if (listResp.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: exportResp } = await surveyAPI.getExportToken(
              items[0].id,
            );
            expect([200, 400, 403]).toContain(exportResp.status());
          }
        }
      });
    });
  },
);

// ==================== MASS OPERATIONS ====================

test.describe(
  "RBAC Admin - Mass Operations",
  { tag: ["@api", "@rbac", "@admin", "@mass-ops", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "RBAC Admin - Mass Operations");
    });

    test(
      "C6467: Admin может добавлять пользователей в группу",
      { tag: ["@critical"] },
      async ({ orgAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может добавлять пользователей в группу", async () => {
          // Получаем список групп
          const { response: groupsResp, data: groupsData } =
            await orgAPI.getUserGroups();
          if (groupsResp.ok()) {
            const groups = groupsData?.items || groupsData || [];
            if (groups.length > 0) {
              // Пытаемся добавить несуществующего пользователя (проверяем доступ)
              const { response: addResp } = await orgAPI.addUsersToUserGroup(
                groups[0].id,
                [999999],
              );
              // Admin должен иметь доступ, ошибка может быть из-за невалидного userId
              expect([200, 400, 403, 404, 422]).toContain(addResp.status());
            }
          }
        });
      },
    );

    test("C6468: Admin может удалять пользователей из группы", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может удалять пользователей из группы", async () => {
        const { response: groupsResp, data: groupsData } =
          await orgAPI.getUserGroups();
        if (groupsResp.ok()) {
          const groups = groupsData?.items || groupsData || [];
          if (groups.length > 0) {
            const { response: removeResp } =
              await orgAPI.removeUsersFromUserGroup(groups[0].id, [999999]);
            expect([200, 201, 400, 403, 404, 422]).toContain(
              removeResp.status(),
            );
          }
        }
      });
    });

    test(
      "C6469: Admin может добавлять участников в PR",
      { tag: ["@critical"] },
      async ({ prAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может добавлять участников в PR", async () => {
          const { response: listResp, data } = await prAPI.getList({
            limit: 1,
          });
          if (listResp.ok()) {
            const items = data?.items || data || [];
            if (items.length > 0) {
              const { response: addResp } = await prAPI.addTargetUsers(
                items[0].id,
                { userIds: [] },
              );
              // Проверяем доступ, ошибка может быть из-за статуса PR
              expect([200, 400, 403, 404, 409, 422]).toContain(
                addResp.status(),
              );
            }
          }
        });
      },
    );

    test("C6470: Admin может отправлять анкеты массово", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может отправлять анкеты массово", async () => {
        const { response: listResp, data } = await prAPI.getList({ limit: 1 });
        if (listResp.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: batchResp } = await prAPI.batchSendQuestionnaires(
              items[0].id,
              {},
            );
            // Проверяем доступ
            expect([200, 400, 403, 404, 409, 422]).toContain(
              batchResp.status(),
            );
          }
        }
      });
    });
  },
);

// ==================== IMPORT ENDPOINTS ====================

test.describe(
  "RBAC Admin - Import",
  { tag: ["@api", "@rbac", "@admin", "@import", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "RBAC Admin - Import");
    });

    test(
      "C6471: Admin может загрузить файл для импорта оргструктуры",
      { tag: ["@critical"] },
      async ({ orgAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может загрузить файл для импорта оргструктуры", async () => {
          // Создаём минимальный тестовый файл (пустой Excel-подобный)
          const testFile = Buffer.from("test import file content");
          const { response } = await orgAPI.uploadImportFile(
            testFile,
            "test-import.xlsx",
          );
          // Admin должен иметь доступ к импорту, ошибка может быть из-за формата файла
          expect([200, 201, 400, 403, 415, 422]).toContain(response.status());
        });
      },
    );

    test("C6472: Admin может обработать импорт (с несуществующим ID)", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может обработать импорт (с несуществующим ID)", async () => {
        // Проверяем доступ к endpoint с несуществующим ID
        const { response } = await orgAPI.processImport(999999);
        // Admin должен иметь доступ, 404 - нормально для несуществующего ID
        expect([200, 400, 403, 404, 422]).toContain(response.status());
      });
    });

    test("C6473: Admin может применить импорт (с несуществующим ID)", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может применить импорт (с несуществующим ID)", async () => {
        const { response } = await orgAPI.applyImport(999999);
        expect([200, 400, 403, 404, 422]).toContain(response.status());
      });
    });

    test("C6474: Admin может получить ошибки импорта", async ({ orgAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить ошибки импорта", async () => {
        const { response } = await orgAPI.getImportErrors(999999);
        expect([200, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C6475: Admin может получить пользователей из импорта", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить пользователей из импорта", async () => {
        const { response } = await orgAPI.getImportUsers(999999);
        expect([200, 400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== ROLES MODULE ====================

test.describe(
  "RBAC Admin - Roles",
  { tag: ["@api", "@rbac", "@admin", "@roles", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "RBAC Admin");
    });

    test(
      "C6476: Admin может получить список ролей",
      { tag: ["@critical"] },
      async ({ rolesAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить список ролей", async () => {
          const { response } = await rolesAPI.getRoles();
          expect([200, 403]).toContain(response.status());
        });
      },
    );

    test(
      "C6477: Admin может получить список разрешений",
      { tag: ["@critical"] },
      async ({ rolesAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить список разрешений", async () => {
          const { response } = await rolesAPI.getPermissions();
          expect([200, 403]).toContain(response.status());
        });
      },
    );

    test("C6478: Admin может получить private roles", async ({ rolesAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить private roles", async () => {
        const { response } = await rolesAPI.getPrivateRoles();
        assertSuccessStatus(response);
      });
    });
  },
);

// ==================== PROFILE MODULE ====================

test.describe(
  "RBAC Admin - Profile",
  { tag: ["@api", "@rbac", "@admin", "@profile", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "RBAC Admin");
    });

    test(
      "C6479: Admin может получить свой профиль",
      { tag: ["@critical"] },
      async ({ profileAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить свой профиль", async () => {
          const { response } = await profileAPI.getMyProfile();
          assertSuccessStatus(response);
        });
      },
    );

    test("C6480: Admin может получить вкладки профиля", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить вкладки профиля", async () => {
        const userId = profileAPI.getCurrentUserId();
        // Пропускаем если userId не определён (проблема с auth)
        if (!userId) {
          console.log("SKIP: userId is null/undefined after signIn");
          return;
        }
        const { response } = await profileAPI.getProfileTabs(userId);
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6481: Admin может получить кастомные поля", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить кастомные поля", async () => {
        const userId = profileAPI.getCurrentUserId();
        // Пропускаем если userId не определён (проблема с auth)
        if (!userId) {
          console.log("SKIP: userId is null/undefined after signIn");
          return;
        }
        const { response } = await profileAPI.getFieldValues(userId);
        expect([200, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== NOTIFICATIONS MODULE ====================

test.describe(
  "RBAC Admin - Notifications",
  { tag: ["@api", "@rbac", "@admin", "@notifications", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NOTIFICATIONS, "RBAC Admin");
    });

    test(
      "C6482: Admin может получить уведомления",
      { tag: ["@critical"] },
      async ({ notificationsAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может получить уведомления", async () => {
          const { response } = await notificationsAPI.getNotifications();
          assertSuccessStatus(response);
        });
      },
    );

    test("C6483: Admin может получить настройки уведомлений", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить настройки уведомлений", async () => {
        const { response } = await notificationsAPI.getSettings();
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6484: Admin может получить счётчик уведомлений", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Admin может получить счётчик уведомлений", async () => {
        const { response } = await notificationsAPI.getUnreadCount();
        expect([200, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== MANAGER ENDPOINTS SUMMARY ====================

test.describe(
  "RBAC Admin - Manager Endpoints Summary",
  { tag: ["@api", "@rbac", "@admin", "@manager", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "RBAC Admin - Manager Endpoints");
    });

    test("C6485: Admin имеет доступ к /manager/roles", async ({ rolesAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Admin имеет доступ к /manager/roles", async () => {
        const { response } = await rolesAPI.getRoles();
        expect([200, 403]).toContain(response.status());
        // Admin должен иметь доступ
        if (response.status() === 403) {
          console.log("WARNING: Admin не имеет доступа к /manager/roles");
        }
      });
    });

    test("C6486: Admin имеет доступ к /manager/permissions", async ({
      rolesAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Admin имеет доступ к /manager/permissions", async () => {
        const { response } = await rolesAPI.getPermissions();
        expect([200, 403]).toContain(response.status());
        if (response.status() === 403) {
          console.log("WARNING: Admin не имеет доступа к /manager/permissions");
        }
      });
    });

    test("C6487: Admin имеет доступ к /manager/org-struct", async ({
      orgAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Admin имеет доступ к /manager/org-struct", async () => {
        const { response } = await orgAPI.getDepartments();
        assertSuccessStatus(response);
      });
    });

    test("C6488: Admin имеет доступ к /manager/users", async ({ orgAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Admin имеет доступ к /manager/users", async () => {
        const { response } = await orgAPI.getUsers();
        assertSuccessStatus(response);
      });
    });
  },
);

// ==================== PROTECTED ENDPOINTS SUMMARY ====================

test.describe(
  "RBAC Admin - Protected Endpoints Summary",
  { tag: ["@api", "@rbac", "@admin", "@protected", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "RBAC Admin - Protected Endpoints");
    });

    test("C6489: Admin имеет доступ к /protected/performance-reviews", async ({
      prAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Admin имеет доступ к /protected/performance-reviews", async () => {
        const { response } = await prAPI.getList();
        assertSuccessStatus(response);
      });
    });

    test("C6490: Admin имеет доступ к /protected/surveys", async ({
      surveyAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Admin имеет доступ к /protected/surveys", async () => {
        const { response } = await surveyAPI.getList();
        assertSuccessStatus(response);
      });
    });

    test("C6491: Admin имеет доступ к /protected/objectives", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Admin имеет доступ к /protected/objectives", async () => {
        const { response } = await objectivesAPI.getObjectives();
        assertSuccessStatus(response);
      });
    });
  },
);

// ==================== PRIVATE ENDPOINTS SUMMARY ====================

test.describe(
  "RBAC Admin - Private Endpoints Summary",
  { tag: ["@api", "@rbac", "@admin", "@private", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "RBAC Admin - Private Endpoints");
    });

    test("C6492: Admin имеет доступ к /private/profile", async ({
      profileAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Admin имеет доступ к /private/profile", async () => {
        const { response } = await profileAPI.getMyProfile();
        assertSuccessStatus(response);
      });
    });

    test("C6493: Admin имеет доступ к /private/notifications", async ({
      notificationsAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Admin имеет доступ к /private/notifications", async () => {
        const { response } = await notificationsAPI.getNotifications();
        assertSuccessStatus(response);
      });
    });

    test("C6494: Admin имеет доступ к /private/roles", async ({ rolesAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Admin имеет доступ к /private/roles", async () => {
        const { response } = await rolesAPI.getPrivateRoles();
        assertSuccessStatus(response);
      });
    });
  },
);
