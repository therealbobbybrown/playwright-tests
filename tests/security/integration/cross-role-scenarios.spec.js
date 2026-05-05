/**
 * Кросс-ролевые интеграционные тесты
 *
 * Проверяет взаимодействие между ролями:
 * - Anonymous: 401 на все endpoints
 * - Admin создает ресурс → User пытается редактировать (403)
 * - Manager создает план → User пытается активировать (403)
 * - User создает приватную цель → Manager не видит (404)
 * - Admin публикует фидбек → User видит в shared (200)
 */
import { test as base, expect } from "@playwright/test";
import {
  ObjectivesAPI,
  DevelopmentPlansAPI,
  FeedbackAPI,
  getCredentials,
} from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

// Хелпер для получения текущего периода
function getCurrentPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  return { periodYear: year, periodQ: quarter };
}

// Хелпер для получения ID текущего пользователя
async function getCurrentUserId(api) {
  const { response, data } = await api.get("/private/accounts/me/");
  if (response.ok() && data?.currentUserId) {
    return data.currentUserId;
  }
  if (response.ok() && data?.account?.users?.[0]?.id) {
    return data.account.users[0].id;
  }
  return null;
}

// Хелпер для создания тестовой цели с правильными параметрами
async function createTestObjective(api, overrides = {}) {
  const { periodYear, periodQ } = getCurrentPeriod();
  const responsibleUserId =
    overrides.responsibleUserId || (await getCurrentUserId(api));

  const objectiveData = {
    title: overrides.title || `Test Objective ${Date.now()}`,
    description: overrides.description || "Test objective for cross-role tests",
    periodYear,
    periodQ,
    status: "draft",
    level: overrides.level || "self",
    responsibleUserId,
    userAccessType: overrides.userAccessType || "everybody",
    milestones: [
      {
        temporaryId: `temp-${Date.now()}`,
        title: "Test Milestone",
        type: "percent",
        weight: 100,
        progress: 0,
        responsibleUserId,
      },
    ],
  };

  return api.saveObjective(objectiveData);
}

// Расширение fixtures для ролей
const test = base.extend({
  adminAPI: async ({ request }, use) => {
    const api = {
      objectives: new ObjectivesAPI(request),
      devPlans: new DevelopmentPlansAPI(request),
      feedback: new FeedbackAPI(request),
    };
    const { email, password } = getCredentials("admin");
    await api.objectives.signIn(email, password);
    await api.devPlans.signIn(email, password);
    await api.feedback.signIn(email, password);
    await use(api);
  },
  userAPI: async ({ request }, use) => {
    const api = {
      objectives: new ObjectivesAPI(request),
      devPlans: new DevelopmentPlansAPI(request),
      feedback: new FeedbackAPI(request),
    };
    const { email, password } = getCredentials("user");
    await api.objectives.signIn(email, password);
    await api.devPlans.signIn(email, password);
    await api.feedback.signIn(email, password);
    await use(api);
  },
  managerAPI: async ({ request }, use) => {
    const api = {
      objectives: new ObjectivesAPI(request),
      devPlans: new DevelopmentPlansAPI(request),
      feedback: new FeedbackAPI(request),
    };
    const { email, password } = getCredentials("manager");
    await api.objectives.signIn(email, password);
    await api.devPlans.signIn(email, password);
    await api.feedback.signIn(email, password);
    await use(api);
  },
  // Anonymous API - без авторизации
  anonAPI: async ({ request }, use) => {
    const api = {
      objectives: new ObjectivesAPI(request),
      devPlans: new DevelopmentPlansAPI(request),
      feedback: new FeedbackAPI(request),
    };
    // Не вызываем signIn - оставляем без токена
    await use(api);
  },
});

test.describe("Cross-Role Security Scenarios @api @security @integration", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SECURITY, "Cross-Role Integration");
  });

  // Кеш для созданных ресурсов
  const createdResources = {
    objectiveIds: [],
    planIds: [],
    feedbackIds: [],
  };

  test.afterAll(async ({ request }) => {
    // Cleanup созданных ресурсов через admin
    const adminObjectives = new ObjectivesAPI(request);
    const adminDevPlans = new DevelopmentPlansAPI(request);
    const adminFeedback = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await adminObjectives.signIn(email, password);
    await adminDevPlans.signIn(email, password);
    await adminFeedback.signIn(email, password);

    for (const id of createdResources.objectiveIds) {
      try {
        await adminObjectives.deleteObjective(id);
      } catch {
        /* ignore */
      }
    }
    for (const id of createdResources.planIds) {
      try {
        await adminDevPlans.deleteDevelopmentPlan(id);
      } catch {
        /* ignore */
      }
    }
    for (const id of createdResources.feedbackIds) {
      try {
        await adminFeedback.deleteFeedback(id);
      } catch {
        /* ignore */
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ANONYMOUS - должен получить 401
  // ═══════════════════════════════════════════════════════════════
  test.describe("Неавторизованный пользователь (Anonymous)", () => {
    test("Anonymous не может получить список целей", async ({ anonAPI }) => {
      setSeverity("critical");

      const { response } = await anonAPI.objectives.getObjectives();

      expect(response.status()).toBe(401);
    });

    test("Anonymous не может создать цель", async ({ anonAPI }) => {
      setSeverity("critical");

      const { periodYear, periodQ } = getCurrentPeriod();
      const { response } = await anonAPI.objectives.saveObjective({
        title: `Anonymous Objective ${Date.now()}`,
        description: "Anonymous test objective",
        periodYear,
        periodQ,
        status: "draft",
        level: "self",
      });

      expect(response.status()).toBe(401);
    });

    test("Anonymous не может получить список планов развития", async ({
      anonAPI,
    }) => {
      setSeverity("critical");

      const { response } = await anonAPI.devPlans.getDevelopmentPlans();

      expect(response.status()).toBe(401);
    });

    test("Anonymous не может получить фидбеки", async ({ anonAPI }) => {
      setSeverity("critical");

      const { response } = await anonAPI.feedback.getSharedFeedbacks();

      expect(response.status()).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ADMIN - позитивные проверки
  // ═══════════════════════════════════════════════════════════════
  test.describe("Admin - полные права", () => {
    test("Admin может получить список целей", async ({ adminAPI }) => {
      setSeverity("critical");

      const { response, data } = await adminAPI.objectives.getObjectives({
        limit: 10,
      });

      // Admin должен иметь доступ к списку целей
      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();

      // Проверяем структуру ответа
      const objectives = data?.items || data || [];
      expect(
        Array.isArray(objectives),
        "Ответ должен содержать массив целей",
      ).toBe(true);
    });

    test("Admin может получить список фидбеков", async ({ adminAPI }) => {
      setSeverity("critical");

      const { response, data } = await adminAPI.feedback.getSharedFeedbacks({
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();

      // Проверяем структуру ответа
      const feedbacks = data?.items || data || [];
      expect(
        Array.isArray(feedbacks),
        "Ответ должен содержать массив фидбеков",
      ).toBe(true);
    });

    test("Admin может получить свой профиль", async ({ adminAPI }) => {
      setSeverity("critical");

      const { response, data } = await adminAPI.devPlans.get(
        "/private/accounts/me",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();

      // Проверяем что в ответе есть идентификатор пользователя
      const userId =
        data?.id || data?.currentUserId || data?.account?.users?.[0]?.id;
      expect(userId, "Профиль должен содержать ID пользователя").toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // OBJECTIVES - кросс-ролевые сценарии
  // ═══════════════════════════════════════════════════════════════
  test.describe("Objectives - кросс-ролевые сценарии", () => {
    test("User не может редактировать цель созданную Admin", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");

      // Admin создаёт цель с правильными параметрами
      const { response: createResponse, data: created } =
        await createTestObjective(adminAPI.objectives, {
          title: `Admin Objective ${Date.now()}`,
          description: "Created by admin for cross-role test",
          level: "company",
        });

      // Пропускаем если создание не удалось
      test.skip(
        !createResponse.ok() || !created?.id,
        "Не удалось создать цель",
      );

      createdResources.objectiveIds.push(created.id);

      const originalTitle = created.title;

      // User пытается редактировать цель Admin через saveObjective
      // Отправляем валидный запрос только с нужными полями (без вложенных объектов)
      const { response: updateResponse } =
        await userAPI.objectives.saveObjective({
          id: created.id,
          title: "Hacked by User",
          description: created.description,
          periodYear: created.periodYear,
          periodQ: created.periodQ,
          status: created.status,
          level: created.level,
          responsibleUserId: created.responsibleUserId,
          userAccessType: created.userAccessType,
          milestones: created.milestones.map((m) => ({
            id: m.id,
            temporaryId: m.temporaryId,
            title: m.title,
            type: m.type,
            weight: m.weight || 100,
            progress: m.progress || 0,
            responsibleUserId: m.responsibleUserId,
          })),
        });

      // Ожидаем 403 Forbidden или 404 (не найдено для этого пользователя)
      expect([403, 404]).toContain(updateResponse.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await updateResponse.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
      }

      // КРИТИЧНО: Верифицируем что цель НЕ была изменена
      const { response: verifyResponse, data: verifyData } =
        await adminAPI.objectives.getObjectiveById(created.id);
      expect(verifyResponse.ok(), "Цель должна существовать").toBe(true);
      // Проверяем title в разных возможных местах ответа
      const verifyTitle =
        verifyData?.title ||
        verifyData?.objective?.title ||
        verifyData?.data?.title;
      if (verifyTitle) {
        expect(verifyTitle, "Название цели НЕ должно было измениться").toBe(
          originalTitle,
        );
        expect(verifyTitle).not.toBe("Hacked by User");
      }
    });

    test("User не может удалить цель созданную Admin", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");

      // Admin создаёт цель с правильными параметрами
      const { response: createResponse, data: created } =
        await createTestObjective(adminAPI.objectives, {
          title: `Admin Objective to Delete ${Date.now()}`,
          description: "Created by admin for deletion test",
          level: "company",
        });

      test.skip(
        !createResponse.ok() || !created?.id,
        "Не удалось создать цель",
      );

      // Не добавляем в cleanup - будем пытаться удалить через user
      const objectiveId = created.id;

      // User пытается удалить цель Admin
      const { response: deleteResponse } =
        await userAPI.objectives.deleteObjective(objectiveId);

      // Ожидаем 403 или 404
      expect([403, 404]).toContain(deleteResponse.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await deleteResponse.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
      }

      // КРИТИЧНО: Верифицируем что цель НЕ была удалена
      const { response: verifyResponse } =
        await adminAPI.objectives.getObjectiveById(objectiveId);
      expect(verifyResponse.ok(), "Цель НЕ должна была быть удалена").toBe(
        true,
      );

      // Cleanup через admin
      await adminAPI.objectives.deleteObjective(objectiveId);
    });

    test("Manager не видит self-цель User (уровень self)", async ({
      userAPI,
      managerAPI,
    }) => {
      setSeverity("normal");

      // User создаёт приватную цель (self) с правильными параметрами
      const { response: createResponse, data: created } =
        await createTestObjective(userAPI.objectives, {
          title: `User Self Objective ${Date.now()}`,
          description: "Private self objective",
          level: "self",
          userAccessType: "selective", // Приватная цель (selective = выборочный доступ)
        });

      test.skip(
        !createResponse.ok() || !created?.id,
        "Не удалось создать self цель",
      );

      createdResources.objectiveIds.push(created.id);

      // Manager пытается прочитать self цель User
      const { response: getResponse } =
        await managerAPI.objectives.getObjectiveById(created.id);

      // Manager не должен видеть self цель другого пользователя
      expect([403, 404]).toContain(getResponse.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DEVELOPMENT PLANS - кросс-ролевые сценарии
  // ═══════════════════════════════════════════════════════════════
  test.describe("Development Plans - кросс-ролевые сценарии", () => {
    test("User не может активировать план созданный Manager", async ({
      managerAPI,
      userAPI,
      request,
    }) => {
      setSeverity("critical");

      // Получаем ID manager для создания плана
      const managerAccount = new DevelopmentPlansAPI(request);
      const { email, password } = getCredentials("manager");
      await managerAccount.signIn(email, password);
      const { data: meData } = await managerAccount.get("/private/accounts/me");
      // Поддерживаем разные форматы ответа
      const managerId =
        meData?.id || meData?.currentUserId || meData?.account?.users?.[0]?.id;

      test.skip(!managerId, "Не удалось получить ID manager");

      // Manager создаёт план развития
      const startDate = new Date().toISOString();
      const endDate = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { response: createResponse, data: created } =
        await managerAPI.devPlans.createDevelopmentPlan({
          title: `Manager Dev Plan ${Date.now()}`,
          responsibleUserId: managerId,
          startDate,
          endDate,
        });

      test.skip(
        !createResponse.ok() || !created?.id,
        "Не удалось создать план",
      );

      createdResources.planIds.push(created.id);

      // User пытается активировать план Manager
      const { response: activateResponse } =
        await userAPI.devPlans.activateDevelopmentPlan(created.id);

      // User не должен иметь права активировать чужой план
      expect([403, 404]).toContain(activateResponse.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await activateResponse.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
      }

      // КРИТИЧНО: Верифицируем что план НЕ был активирован
      const { data: verifyData } = await managerAPI.devPlans.getDevelopmentPlan(
        created.id,
      );
      expect(
        verifyData?.status,
        "План НЕ должен был быть активирован",
      ).not.toBe("active");
    });

    test("User не может редактировать план созданный Admin", async ({
      adminAPI,
      userAPI,
      request,
    }) => {
      setSeverity("critical");

      // Получаем ID admin
      const adminAccount = new DevelopmentPlansAPI(request);
      const { email, password } = getCredentials("admin");
      await adminAccount.signIn(email, password);
      const { data: meData } = await adminAccount.get("/private/accounts/me");
      // Поддерживаем разные форматы ответа
      const adminId =
        meData?.id || meData?.currentUserId || meData?.account?.users?.[0]?.id;

      test.skip(!adminId, "Не удалось получить ID admin");

      // Admin создаёт план развития
      const startDate = new Date().toISOString();
      const endDate = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { response: createResponse, data: created } =
        await adminAPI.devPlans.createDevelopmentPlan({
          title: `Admin Dev Plan ${Date.now()}`,
          responsibleUserId: adminId,
          startDate,
          endDate,
        });

      test.skip(
        !createResponse.ok() || !created?.id,
        "Не удалось создать план",
      );

      createdResources.planIds.push(created.id);

      const originalTitle = created.title;

      // User пытается редактировать план Admin
      const { response: updateResponse } =
        await userAPI.devPlans.updateDevelopmentPlan(created.id, {
          title: "Hacked Plan Title",
        });

      // User не должен иметь права редактировать чужой план
      expect([403, 404]).toContain(updateResponse.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await updateResponse.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
      }

      // КРИТИЧНО: Верифицируем что план НЕ был изменён
      const { data: verifyData } = await adminAPI.devPlans.getDevelopmentPlan(
        created.id,
      );
      expect(
        verifyData?.title,
        "Название плана НЕ должно было измениться",
      ).toBe(originalTitle);
      expect(verifyData?.title).not.toBe("Hacked Plan Title");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // FEEDBACK - кросс-ролевые сценарии
  // ═══════════════════════════════════════════════════════════════
  test.describe("Feedback - кросс-ролевые сценарии", () => {
    test("User не может удалить фидбек созданный Admin", async ({
      adminAPI,
      userAPI,
      request,
    }) => {
      setSeverity("critical");

      // Получаем ID пользователя (user) для фидбека - нельзя создать фидбек для себя
      const userAccount = new FeedbackAPI(request);
      const { email: userEmail, password: userPassword } =
        getCredentials("user");
      await userAccount.signIn(userEmail, userPassword);
      const { data: userMeData } = await userAccount.get(
        "/private/accounts/me",
      );
      const userId =
        userMeData?.id ||
        userMeData?.currentUserId ||
        userMeData?.account?.users?.[0]?.id;

      // Получаем типы фидбеков
      const { data: typesData } = await adminAPI.feedback.getFeedbackTypes();
      // Поддержка разных форматов ответа
      const feedbackTypes = typesData?.items || typesData || [];
      const feedbackTypeId = feedbackTypes[0]?.id;

      test.skip(
        !userId || !feedbackTypeId,
        "Не удалось получить данные для создания фидбека",
      );

      // Admin создаёт публичный фидбек для user
      const { response: createResponse, data: created } =
        await adminAPI.feedback.create({
          body: `Admin Feedback ${Date.now()}`,
          targets: [{ targetType: "user", entityId: userId }],
          feedbackTypeId,
          userAccessType: "everybody",
          usersWithAccess: [],
        });

      test.skip(
        !createResponse.ok() || !created?.id,
        "Не удалось создать фидбек",
      );

      const feedbackId = created.id;

      // User пытается удалить фидбек Admin
      const { response: deleteResponse } =
        await userAPI.feedback.deleteFeedback(feedbackId);

      // User не должен иметь права удалять чужой фидбек
      expect([403, 404]).toContain(deleteResponse.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await deleteResponse.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
      }

      // КРИТИЧНО: Верифицируем что фидбек НЕ был удалён
      const { response: verifyResponse } =
        await adminAPI.feedback.getById(feedbackId);
      expect(verifyResponse.ok(), "Фидбек НЕ должен был быть удалён").toBe(
        true,
      );

      // Cleanup через admin
      await adminAPI.feedback.deleteFeedback(feedbackId);
    });

    test("User видит публичный фидбек Admin в shared", async ({
      adminAPI,
      userAPI,
      request,
    }) => {
      setSeverity("normal");

      // Получаем ID пользователя (user) для фидбека - нельзя создать фидбек для себя
      const userAccount = new FeedbackAPI(request);
      const { email: userEmail, password: userPassword } =
        getCredentials("user");
      await userAccount.signIn(userEmail, userPassword);
      const { data: userMeData } = await userAccount.get(
        "/private/accounts/me",
      );
      const userId =
        userMeData?.id ||
        userMeData?.currentUserId ||
        userMeData?.account?.users?.[0]?.id;

      // Получаем типы фидбеков
      const { data: typesData } = await adminAPI.feedback.getFeedbackTypes();
      const feedbackTypes = typesData?.items || typesData || [];
      const feedbackTypeId = feedbackTypes[0]?.id;

      test.skip(
        !userId || !feedbackTypeId,
        "Не удалось получить данные для создания фидбека",
      );

      // Admin создаёт публичный фидбек для user
      const { response: createResponse, data: created } =
        await adminAPI.feedback.create({
          body: `Public Feedback for Shared ${Date.now()}`,
          targets: [{ targetType: "user", entityId: userId }],
          feedbackTypeId,
          userAccessType: "everybody",
          usersWithAccess: [],
        });

      test.skip(
        !createResponse.ok() || !created?.id,
        "Не удалось создать фидбек",
      );

      createdResources.feedbackIds.push(created.id);

      // User запрашивает публичные фидбеки
      const { response: sharedResponse, data: sharedData } =
        await userAPI.feedback.getSharedFeedbacks({ limit: 50 });

      // User должен видеть публичные фидбеки
      expect(sharedResponse.ok()).toBe(true);
      // Данные должны быть доступны
      expect(sharedData).toBeDefined();
    });

    test("User не видит приватный фидбек Admin", async ({
      adminAPI,
      userAPI,
      request,
    }) => {
      setSeverity("critical");

      // Получаем ID user для фидбека
      const userAccount = new FeedbackAPI(request);
      const { email: userEmail, password: userPassword } =
        getCredentials("user");
      await userAccount.signIn(userEmail, userPassword);
      const { data: userMeData } = await userAccount.get(
        "/private/accounts/me",
      );
      const userId =
        userMeData?.id ||
        userMeData?.currentUserId ||
        userMeData?.account?.users?.[0]?.id;

      // Получаем ID manager для usersWithAccess - нельзя добавлять себя в доступ
      const managerAccount = new FeedbackAPI(request);
      const { email: managerEmail, password: managerPassword } =
        getCredentials("manager");
      await managerAccount.signIn(managerEmail, managerPassword);
      const { data: managerMeData } = await managerAccount.get(
        "/private/accounts/me",
      );
      const managerId =
        managerMeData?.id ||
        managerMeData?.currentUserId ||
        managerMeData?.account?.users?.[0]?.id;

      // Получаем типы фидбеков
      const { data: typesData } = await adminAPI.feedback.getFeedbackTypes();
      const feedbackTypes = typesData?.items || typesData || [];
      const feedbackTypeId = feedbackTypes[0]?.id;

      test.skip(
        !userId || !managerId || !feedbackTypeId,
        "Не удалось получить данные для создания фидбека",
      );

      // Admin создаёт приватный фидбек для user (доступ только manager, не user)
      const { response: createResponse, data: created } =
        await adminAPI.feedback.create({
          body: `Private Admin Feedback ${Date.now()}`,
          targets: [{ targetType: "user", entityId: userId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [managerId], // Доступ только manager, user не видит
        });

      test.skip(
        !createResponse.ok() || !created?.id,
        "Не удалось создать приватный фидбек",
      );

      createdResources.feedbackIds.push(created.id);

      // User пытается прочитать приватный фидбек
      const { response: getResponse } = await userAPI.feedback.getById(
        created.id,
      );

      // User не должен видеть приватный фидбек Admin
      expect([403, 404]).toContain(getResponse.status());

      // Проверяем что error response не раскрывает внутренние детали и содержимое фидбека
      const errorData = await getResponse.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
        // Убеждаемся что в ошибке нет содержимого фидбека
        expect(errorText).not.toContain("private admin feedback");
      }
      // Убеждаемся что в ответе нет данных фидбека
      expect(errorData?.body).toBeUndefined();
    });
  });
});
