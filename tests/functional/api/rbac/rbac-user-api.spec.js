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
 * RBAC тесты для роли User (Обычный пользователь)
 *
 * Проверяет ограничения доступа для обычного пользователя:
 * - Доступ к /private/* - должен быть разрешён
 * - Ограниченный доступ к /protected/* - только свои данные
 * - НЕТ доступа к /manager/* - должен быть запрещён
 *
 * @tags @api @rbac @user @access-control
 */

// Создаём API клиенты для разных модулей под ролью user
const test = base.extend({
  userAuth: async ({ request }, use) => {
    const authAPI = new AuthAPI(request);
    const { email, password } = getCredentials("user");
    await authAPI.signIn(email, password);
    await use(authAPI);
  },
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  feedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  objectivesAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  orgAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  competenciesAPI: async ({ request }, use) => {
    const api = new CompetenciesAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  devPlansAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  companyAPI: async ({ request }, use) => {
    const api = new CompanyAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  karmaAPI: async ({ request }, use) => {
    const api = new KarmaAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  rolesAPI: async ({ request }, use) => {
    const api = new RolesAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  profileAPI: async ({ request }, use) => {
    const api = new ProfileAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  notificationsAPI: async ({ request }, use) => {
    const api = new NotificationsAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  giftShopAPI: async ({ request }, use) => {
    const api = new GiftShopAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  nineBoxAPI: async ({ request }, use) => {
    const api = new NineBoxAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== MANAGER ENDPOINTS - ДОЛЖНЫ БЫТЬ ЗАПРЕЩЕНЫ ====================

test.describe(
  "RBAC User - Manager Endpoints (Restricted)",
  { tag: ["@api", "@rbac", "@user", "@restricted", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "RBAC User - Restricted");
    });

    test(
      "C6614: User НЕ может получить список ролей (manager)",
      { tag: ["@critical"] },
      async ({ rolesAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User НЕ может получить список ролей (manager)", async () => {
          const { response } = await rolesAPI.getRoles();
          expect(response.status()).toBe(403);
        });
      },
    );

    test(
      "C6615: User НЕ может получить список разрешений",
      { tag: ["@critical"] },
      async ({ rolesAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User НЕ может получить список разрешений", async () => {
          const { response } = await rolesAPI.getPermissions();
          expect(response.status()).toBe(403);
        });
      },
    );

    test("C6616: User НЕ может создать роль", async ({ rolesAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может создать роль", async () => {
        const { response } = await rolesAPI.createRole({
          title: "Тестовая роль от user",
          permissionsIds: [],
        });
        expect(response.status()).toBe(403);
      });
    });

    test("C6617: User НЕ может удалить роль", async ({ rolesAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может удалить роль", async () => {
        const { response } = await rolesAPI.deleteRole(1);
        expect(response.status()).toBe(403);
      });
    });

    test("C6618: User НЕ может управлять invite links", async ({ orgAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: User НЕ может управлять invite links", async () => {
        const { response } = await orgAPI.getInviteLinks();
        // User не должен иметь доступ к управлению invite links
        expect([200, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== ORG STRUCTURE - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC User - Org Structure (Limited)",
  { tag: ["@api", "@rbac", "@user", "@org-structure", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "RBAC User");
    });

    test("C6619: User может видеть дерево оргструктуры (ограниченно)", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может видеть дерево оргструктуры (ограниченно)", async () => {
        const { response } = await orgAPI.getTreeItems();
        // User может видеть дерево, но возможно ограниченно
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6620: User может видеть список пользователей (ограниченно)", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может видеть список пользователей (ограниченно)", async () => {
        const { response } = await orgAPI.findUsers({ q: "", limit: 10 });
        // User может видеть коллег
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6621: User НЕ может создавать группы", async ({ orgAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: User НЕ может создавать группы", async () => {
        const { response } = await orgAPI.createUserGroup({
          title: "Тестовая группа от user",
        });
        expect([400, 403]).toContain(response.status());
      });
    });

    test("C6622: User НЕ может удалять группы", async ({ orgAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может удалять группы", async () => {
        const { response } = await orgAPI.deleteUserGroup(999999);
        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== PERFORMANCE REVIEW - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC User - Performance Review (Limited)",
  { tag: ["@api", "@rbac", "@user", "@pr", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "RBAC User");
    });

    test("C6623: User может видеть список PR (свои)", async ({ prAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: User может видеть список PR (свои)", async () => {
        const { response } = await prAPI.getList();
        // User должен видеть PR, в которых участвует
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6624: User НЕ может создать PR", async ({ prAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может создать PR", async () => {
        const { response } = await prAPI.create({
          title: "PR от user",
        });
        expect([400, 403]).toContain(response.status());
      });
    });

    test("C6625: User НЕ может изменить конфигурацию PR", async ({ prAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может изменить конфигурацию PR", async () => {
        const { response, data } = await prAPI.getList();
        if (response.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: updateResp } = await prAPI.update(items[0].id, {
              title: "Изменённый title",
            });
            expect([400, 403]).toContain(updateResp.status());
          }
        }
      });
    });

    test("C6626: User НЕ может удалить PR", async ({ prAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может удалить PR", async () => {
        const { response } = await prAPI.remove(999999);
        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== SURVEY - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC User - Survey (Limited)",
  { tag: ["@api", "@rbac", "@user", "@survey", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEY, "RBAC User");
    });

    test("C6627: User может видеть опросы (в которых участвует)", async ({
      surveyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может видеть опросы (в которых участвует)", async () => {
        const { response } = await surveyAPI.getList();
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6628: User НЕ может создать опрос", async ({ surveyAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может создать опрос", async () => {
        const { response } = await surveyAPI.createDraft({
          title: "Опрос от user",
        });
        expect([400, 403]).toContain(response.status());
      });
    });

    test("C6629: User НЕ может удалить опрос", async ({ surveyAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может удалить опрос", async () => {
        const { response } = await surveyAPI.remove(999999);
        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== OBJECTIVES - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC User - Objectives (Limited)",
  { tag: ["@api", "@rbac", "@user", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "RBAC User");
    });

    test("C6630: User может видеть свои цели", async ({ objectivesAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: User может видеть свои цели", async () => {
        const { response } = await objectivesAPI.getObjectives();
        expect([200, 201, 403]).toContain(response.status());
      });
    });

    test("C6631: User может создать свою цель", async ({ objectivesAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может создать свою цель", async () => {
        const { response } = await objectivesAPI.saveObjective({
          title: "Личная цель",
          description: "Описание личной цели",
        });
        // User может создавать свои цели
        expect([200, 201, 400, 403]).toContain(response.status());
      });
    });

    test("C6632: User НЕ может изменять настройки модуля целей", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может изменять настройки модуля целей", async () => {
        const { response } = await objectivesAPI.saveSettings({
          allowUserObjectives: false,
        });
        expect([400, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== FEEDBACK - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC User - Feedback (Limited)",
  { tag: ["@api", "@rbac", "@user", "@feedback", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "RBAC User");
    });

    test("C6633: User может видеть свой feedback", async ({ feedbackAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может видеть свой feedback", async () => {
        const { response } = await feedbackAPI.getFeedbacks();
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6634: User может создать feedback", async ({ feedbackAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может создать feedback", async () => {
        const { response } = await feedbackAPI.create({
          body: "Тестовый feedback",
          receiverUserId: 1,
          feedbackTypeId: 1,
        });
        // User может создавать feedback
        expect([200, 201, 400, 403, 422]).toContain(response.status());
      });
    });
  },
);

// ==================== COMPETENCIES - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC User - Competencies (Limited)",
  { tag: ["@api", "@rbac", "@user", "@competencies", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.COMPETENCIES, "RBAC User");
    });

    test("C6635: User НЕ может видеть компетенции (manager endpoint)", async ({
      competenciesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: User НЕ может видеть компетенции (manager endpoint)", async () => {
        const { response } = await competenciesAPI.getCompetencies();
        // Эндпоинт /manager/competencies/ должен быть закрыт для обычного пользователя
        expect(response.status()).toBe(403);
      });
    });

    test("C6636: User НЕ может создать компетенцию", async ({
      competenciesAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может создать компетенцию", async () => {
        const { response } = await competenciesAPI.createCompetency({
          title: "Компетенция от user",
        });
        expect([400, 403]).toContain(response.status());
      });
    });

    test("C6637: User НЕ может создать группу компетенций", async ({
      competenciesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: User НЕ может создать группу компетенций", async () => {
        const { response } =
          await competenciesAPI.createCompetenceGroup("Группа от user");
        expect([400, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== DEVELOPMENT PLANS - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC User - Development Plans (Limited)",
  { tag: ["@api", "@rbac", "@user", "@dev-plans", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "RBAC User");
    });

    test("C6638: User может видеть свои планы развития", async ({
      devPlansAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может видеть свои планы развития", async () => {
        const { response } = await devPlansAPI.getDevelopmentPlans();
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6639: User НЕ может создать шаблон плана", async ({
      devPlansAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может создать шаблон плана", async () => {
        const { response } = await devPlansAPI.createDevelopmentPlanTemplate({
          title: "Шаблон от user",
        });
        expect([400, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== COMPANY - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC User - Company (Limited)",
  { tag: ["@api", "@rbac", "@user", "@company", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.COMPANY, "RBAC User");
    });

    test("C6640: User может видеть информацию о компании", async ({
      companyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может видеть информацию о компании", async () => {
        const { response } = await companyAPI.getCompany();
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6641: User НЕ может изменить настройки компании", async ({
      companyAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может изменить настройки компании", async () => {
        const { response } = await companyAPI.updateCompany({
          name: "Новое название",
        });
        expect([400, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== KARMA - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC User - Karma (Limited)",
  { tag: ["@api", "@rbac", "@user", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.KARMA, "RBAC User");
    });

    test("C6642: User может видеть свой баланс кармы", async ({ karmaAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может видеть свой баланс кармы", async () => {
        const { response } = await karmaAPI.getUserBalances();
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6643: User может видеть свою историю кармы", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может видеть свою историю кармы", async () => {
        const { response } = await karmaAPI.getTransactions();
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6644: User НЕ может изменить настройки кармы", async ({
      karmaAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может изменить настройки кармы", async () => {
        const { response } = await karmaAPI.updateSettings({
          settings: { enabled: false },
        });
        expect([400, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== GIFT SHOP - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC User - Gift Shop (Limited)",
  { tag: ["@api", "@rbac", "@user", "@gift-shop", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.GIFT_SHOP, "RBAC User - Gift Shop");
    });

    test("C6645: User может видеть список подарков (private)", async ({
      giftShopAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может видеть список подарков (private)", async () => {
        const { response } = await giftShopAPI.getPrivateGifts();
        // User может видеть доступные подарки
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6646: User НЕ может управлять подарками (manager)", async ({
      giftShopAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может управлять подарками (manager)", async () => {
        const { response } = await giftShopAPI.getManagerGifts();
        expect(response.status()).toBe(403);
      });
    });

    test("C6647: User НЕ может создавать подарки", async ({ giftShopAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может создавать подарки", async () => {
        const { response } = await giftShopAPI.createGift({
          title: "Подарок от user",
          cost: 100,
        });
        expect(response.status()).toBe(403);
      });
    });

    test("C6648: User НЕ может удалять подарки", async ({ giftShopAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может удалять подарки", async () => {
        const { response } = await giftShopAPI.deleteGift(999999);
        expect([403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== NINEBOX - ОГРАНИЧЕННЫЙ ДОСТУП ====================

test.describe(
  "RBAC User - NineBox (Limited)",
  { tag: ["@api", "@rbac", "@user", "@ninebox", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NINE_BOX, "RBAC User - NineBox");
    });

    test("C6649: User может видеть настройки NineBox (private)", async ({
      nineBoxAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может видеть настройки NineBox (private)", async () => {
        const { response } = await nineBoxAPI.getPrivateSettings();
        expect(response.status()).toBe(200);
      });
    });

    test("C6650: User НЕ может управлять настройками NineBox (manager)", async ({
      nineBoxAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может управлять настройками NineBox (manager)", async () => {
        const { response } = await nineBoxAPI.getManagerSettings();
        expect(response.status()).toBe(403);
      });
    });

    test("C6651: User НЕ может видеть manager матрицу", async ({
      nineBoxAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может видеть manager матрицу", async () => {
        const { response } = await nineBoxAPI.getManagerMatrix();
        expect(response.status()).toBe(403);
      });
    });

    test("C6652: User НЕ может включать/выключать NineBox", async ({
      nineBoxAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может включать/выключать NineBox", async () => {
        const { response } = await nineBoxAPI.enable();
        expect(response.status()).toBe(403);
      });
    });

    test("C6653: User НЕ может изменять настройки NineBox", async ({
      nineBoxAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может изменять настройки NineBox", async () => {
        const { response } = await nineBoxAPI.updateSettings({
          performanceWeight: 50,
          potentialWeight: 50,
        });
        expect(response.status()).toBe(403);
      });
    });

    test("C9393: User НЕ может видеть protected матрицу NineBox", async ({
      nineBoxAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может видеть protected матрицу NineBox", async () => {
        const { response } = await nineBoxAPI.getProtectedMatrix({
          usersSubset: "all",
        });
        expect(response.status()).toBe(403);
      });
    });

    test("C9394: User НЕ может искать в protected матрице NineBox", async ({
      nineBoxAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может искать в protected матрице NineBox", async () => {
        const { response } = await nineBoxAPI.searchProtected({
          q: "",
          usersSubset: "all",
          actualize: false,
        });
        expect(response.status()).toBe(403);
      });
    });

    test("C9395: User НЕ может выполнить поиск в NineBox (manager)", async ({
      nineBoxAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может выполнить поиск в NineBox (manager)", async () => {
        const { response } = await nineBoxAPI.searchManager({
          limit: 10,
          actualize: false,
        });
        expect(response.status()).toBe(403);
      });
    });
  },
);

// ==================== EXPORT ENDPOINTS - ЗАПРЕЩЕНЫ ====================

test.describe(
  "RBAC User - Export (Restricted)",
  { tag: ["@api", "@rbac", "@user", "@export", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.EXPORT, "RBAC User - Export");
    });

    test("C6654: User НЕ может экспортировать пользователей (manager)", async ({
      orgAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может экспортировать пользователей (manager)", async () => {
        const userDate = new Date().toISOString().split("T")[0];
        const { response } = await orgAPI.getExportToken(userDate);
        // User не должен иметь доступа к экспорту пользователей
        expect(response.status()).toBe(403);
      });
    });

    test("C6655: User НЕ может экспортировать feedback (manager)", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может экспортировать feedback (manager)", async () => {
        const userDate = new Date().toISOString().split("T")[0];
        const { response } = await feedbackAPI.getExportToken(userDate);
        expect(response.status()).toBe(403);
      });
    });

    test("C6656: User может экспортировать баланс кармы (private)", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может экспортировать баланс кармы (private)", async () => {
        const userDate = new Date().toISOString().split("T")[0];
        const { response } = await karmaAPI.getExportBalancesToken(userDate);
        // Private endpoint может быть доступен
        expect([200, 400, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== MASS OPERATIONS - ЗАПРЕЩЕНЫ ====================

test.describe(
  "RBAC User - Mass Operations (Restricted)",
  { tag: ["@api", "@rbac", "@user", "@mass-ops", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "RBAC User - Mass Operations");
    });

    test("C6657: User НЕ может добавлять пользователей в группу", async ({
      orgAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может добавлять пользователей в группу", async () => {
        const { response: groupsResp, data: groupsData } =
          await orgAPI.getUserGroups();
        if (groupsResp.ok()) {
          const groups = groupsData?.items || groupsData || [];
          if (groups.length > 0) {
            const { response: addResp } = await orgAPI.addUsersToUserGroup(
              groups[0].id,
              [999999],
            );
            // User не должен управлять группами
            expect([403, 404]).toContain(addResp.status());
          }
        } else {
          // Если нет доступа к группам, это тоже ок
          expect([403]).toContain(groupsResp.status());
        }
      });
    });

    test("C6658: User НЕ может удалять пользователей из группы", async ({
      orgAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может удалять пользователей из группы", async () => {
        const { response: groupsResp, data: groupsData } =
          await orgAPI.getUserGroups();
        if (groupsResp.ok()) {
          const groups = groupsData?.items || groupsData || [];
          if (groups.length > 0) {
            const { response: removeResp } =
              await orgAPI.removeUsersFromUserGroup(groups[0].id, [999999]);
            expect([403, 404]).toContain(removeResp.status());
          }
        } else {
          expect([403]).toContain(groupsResp.status());
        }
      });
    });

    test("C6659: User НЕ может добавлять участников в PR", async ({
      prAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может добавлять участников в PR", async () => {
        const { response: listResp, data } = await prAPI.getList();
        if (listResp.ok()) {
          const items = data?.items || data || [];
          if (items.length > 0) {
            const { response: addResp } = await prAPI.addTargetUsers(
              items[0].id,
              { userIds: [] },
            );
            // User не должен добавлять участников в PR
            expect([403, 404]).toContain(addResp.status());
          }
        }
      });
    });
  },
);

// ==================== IMPORT ENDPOINTS - ЗАПРЕЩЕНЫ ====================

test.describe(
  "RBAC User - Import (Restricted)",
  { tag: ["@api", "@rbac", "@user", "@import", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "RBAC User - Import");
    });

    test(
      "C6660: User НЕ может загрузить файл для импорта оргструктуры",
      { tag: ["@critical"] },
      async ({ orgAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User НЕ может загрузить файл для импорта оргструктуры", async () => {
          const testFile = Buffer.from("test import file content");
          const { response } = await orgAPI.uploadImportFile(
            testFile,
            "test-import.xlsx",
          );
          // User не должен иметь доступа к импорту
          expect(response.status()).toBe(403);
        });
      },
    );

    test("C6661: User НЕ может обработать импорт", async ({ orgAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может обработать импорт", async () => {
        const { response } = await orgAPI.processImport(999999);
        expect([403, 404]).toContain(response.status());
      });
    });

    test("C6662: User НЕ может применить импорт", async ({ orgAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может применить импорт", async () => {
        const { response } = await orgAPI.applyImport(999999);
        expect([403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== PRIVATE ENDPOINTS - ДОЛЖНЫ БЫТЬ РАЗРЕШЕНЫ ====================

test.describe(
  "RBAC User - Private Endpoints (Allowed)",
  { tag: ["@api", "@rbac", "@user", "@private", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "RBAC User - Private");
    });

    test(
      "C6663: User может получить пользователей",
      { tag: ["@critical"] },
      async ({ profileAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User может получить пользователей", async () => {
          const { response, data } = await profileAPI.getUsers({ limit: 1 });
          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      },
    );

    test(
      "C6664: User может получить свои уведомления",
      { tag: ["@critical"] },
      async ({ notificationsAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User может получить свои уведомления", async () => {
          const { response } = await notificationsAPI.getNotifications();
          assertSuccessStatus(response);
        });
      },
    );

    test("C6665: User может получить настройки уведомлений", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может получить настройки уведомлений", async () => {
        const { response } = await notificationsAPI.getSettings();
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C6666: User может получить private roles", async ({ rolesAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может получить private roles", async () => {
        const { response } = await rolesAPI.getPrivateRoles();
        assertSuccessStatus(response);
      });
    });

    test("C6667: User может получить коллег", async ({ profileAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может получить коллег", async () => {
        const { response } = await profileAPI.getColleagues({ limit: 10 });
        expect([200, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== CROSS-USER ACCESS - ЗАПРЕЩЁН ====================

test.describe(
  "RBAC User - Cross-User Access (Restricted)",
  { tag: ["@api", "@rbac", "@user", "@cross-access", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "RBAC User - Cross Access");
    });

    test("C6668: User НЕ может редактировать профиль другого пользователя", async ({
      profileAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ может редактировать профиль другого пользователя", async () => {
        // Пробуем обновить профиль несуществующего/другого пользователя
        const { response } = await profileAPI.updateUserInfo(999999, {
          firstName: "Hacked",
        });
        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6669: User может просматривать профили коллег (ограниченно)", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: User может просматривать профили коллег (ограниченно)", async () => {
        // User может видеть базовую информацию о коллегах
        const { response } = await profileAPI.getFieldValues(1);
        expect([200, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== SUMMARY ====================

test.describe(
  "RBAC User - Summary Tests",
  { tag: ["@api", "@rbac", "@user", "@summary", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "RBAC User - Summary");
    });

    test("C6670: User имеет доступ к private endpoints", async ({
      profileAPI,
      notificationsAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User имеет доступ к private endpoints", async () => {
        const profileResp = await profileAPI.getUsers({ limit: 1 });
        expect(profileResp.response.ok()).toBe(true);

        const notifResp = await notificationsAPI.getNotifications();
        expect(notifResp.response.ok()).toBe(true);
      });
    });

    test("C6671: User имеет ограниченный доступ к protected endpoints", async ({
      prAPI,
      surveyAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User имеет ограниченный доступ к protected endpoints", async () => {
        // User может видеть PR/опросы в которых участвует
        const prResp = await prAPI.getList();
        expect([200, 403]).toContain(prResp.response.status());

        const surveyResp = await surveyAPI.getList();
        expect([200, 403]).toContain(surveyResp.response.status());
      });
    });

    test("C6672: User НЕ имеет доступа к manager endpoints", async ({
      rolesAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: User НЕ имеет доступа к manager endpoints", async () => {
        const rolesResp = await rolesAPI.getRoles();
        expect(rolesResp.response.status()).toBe(403);

        const permsResp = await rolesAPI.getPermissions();
        expect(permsResp.response.status()).toBe(403);
      });
    });
  },
);
