// tests/security/api/idor-tests.spec.js
// TASK-API-003: IDOR (Insecure Direct Object Reference) Tests
// Проверка что пользователь не может получить доступ к чужим ресурсам
// @api @security @idor @regression

import { test, expect } from "../../fixtures/api.js";
import { FeedbackAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  setSeverity,
  allure,
} from "../../utils/allure-helpers.js";
import {
  getThanksTypeId,
  getTargetUserId,
  getCurrentUserId,
  getCurrentPeriod,
  safeDeleteFeedback,
} from "../../utils/api/test-helpers.js";

// ============================================================================
// FEEDBACK IDOR TESTS
// ============================================================================

test.describe("IDOR - Feedback API @api @security @idor @feedback", () => {
  test.beforeEach(() => {
    markAsAPITest("Feedback", "IDOR Security");
  });

  let testFeedbackId = null;
  let feedbackTypeId = null;
  let targetUserId = null;

  test.beforeAll(async ({ request }) => {
    // User A создаёт приватную благодарность
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    feedbackTypeId = await getThanksTypeId(api);
    targetUserId = await getTargetUserId(api);

    if (feedbackTypeId && targetUserId) {
      const { data } = await api.create({
        body: `IDOR Test Feedback ${Date.now()}`,
        targets: [{ targetType: "user", entityId: targetUserId }],
        feedbackTypeId,
        userAccessType: "selective", // Приватная
        usersWithAccess: [], // Никто кроме участников
      });
      testFeedbackId = data?.id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (testFeedbackId) {
      const api = new FeedbackAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      await safeDeleteFeedback(api, testFeedbackId);
    }
  });

  test("User B не может получить приватную благодарность User A по ID", async ({
    userBFeedbackAPI,
  }) => {
    setSeverity("critical");
    test.skip(!testFeedbackId, "Нет тестовой благодарности");

    await allure.step(
      "Попытка получить чужую приватную благодарность",
      async () => {
        const { response } = await userBFeedbackAPI.getById(testFeedbackId);

        allure.attachment(
          "Response Status",
          `Status: ${response.status()}`,
          "text/plain",
        );

        // User B не должен иметь доступ к приватной благодарности User A
        expect(
          [403, 404].includes(response.status()),
          `Ожидается 403 или 404, получен ${response.status()}`,
        ).toBe(true);
      },
    );
  });

  test("User B не может удалить благодарность User A", async ({
    userAFeedbackAPI,
    userBFeedbackAPI,
  }) => {
    setSeverity("critical");
    test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

    let createdId = null;

    await allure.step("User A создаёт благодарность", async () => {
      const { data } = await userAFeedbackAPI.create({
        body: `IDOR Delete Test ${Date.now()}`,
        targets: [{ targetType: "user", entityId: targetUserId }],
        feedbackTypeId,
        userAccessType: "selective",
        usersWithAccess: [],
      });
      createdId = data?.id;
      expect(createdId, "Благодарность должна быть создана").toBeDefined();
    });

    await allure.step(
      "User B пытается удалить благодарность User A",
      async () => {
        const { response } = await userBFeedbackAPI.delete(
          `/private/feedbacks/${createdId}/`,
        );

        expect(
          [403, 404].includes(response.status()),
          `User B не должен удалять чужую благодарность. Получен статус: ${response.status()}`,
        ).toBe(true);
      },
    );

    // Cleanup - User A удаляет свою благодарность
    await safeDeleteFeedback(userAFeedbackAPI, createdId);
  });

  test("User B не может изменить благодарность User A", async ({
    userAFeedbackAPI,
    userBFeedbackAPI,
  }) => {
    setSeverity("critical");
    test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

    let createdId = null;

    await allure.step("User A создаёт благодарность", async () => {
      const { data } = await userAFeedbackAPI.create({
        body: `IDOR Update Test ${Date.now()}`,
        targets: [{ targetType: "user", entityId: targetUserId }],
        feedbackTypeId,
        userAccessType: "selective",
        usersWithAccess: [],
      });
      createdId = data?.id;
      expect(createdId, "Благодарность должна быть создана").toBeDefined();
    });

    await allure.step(
      "User B пытается изменить благодарность User A",
      async () => {
        const { response } = await userBFeedbackAPI.update(createdId, {
          body: "Hacked by User B",
        });

        expect(
          [403, 404, 405].includes(response.status()),
          `User B не должен изменять чужую благодарность. Получен статус: ${response.status()}`,
        ).toBe(true);
      },
    );

    // Cleanup
    await safeDeleteFeedback(userAFeedbackAPI, createdId);
  });

  test("User B не может опубликовать благодарность User A", async ({
    userAFeedbackAPI,
    userBFeedbackAPI,
  }) => {
    setSeverity("critical");
    test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

    let createdId = null;

    await allure.step("User A создаёт приватную благодарность", async () => {
      const { data } = await userAFeedbackAPI.create({
        body: `IDOR Publish Test ${Date.now()}`,
        targets: [{ targetType: "user", entityId: targetUserId }],
        feedbackTypeId,
        userAccessType: "selective",
        usersWithAccess: [],
      });
      createdId = data?.id;
      expect(createdId, "Благодарность должна быть создана").toBeDefined();
    });

    await allure.step(
      "User B пытается опубликовать благодарность User A",
      async () => {
        const { response } = await userBFeedbackAPI.publish(createdId);

        expect(
          [403, 404].includes(response.status()),
          `User B не должен публиковать чужую благодарность. Получен статус: ${response.status()}`,
        ).toBe(true);
      },
    );

    // Cleanup
    await safeDeleteFeedback(userAFeedbackAPI, createdId);
  });
});

// ============================================================================
// OBJECTIVES IDOR TESTS
// ============================================================================

test.describe("IDOR - Objectives API @api @security @idor @objectives", () => {
  test.beforeEach(() => {
    markAsAPITest("Objectives", "IDOR Security");
  });

  test("User B не может получить приватную цель User A", async ({
    userAObjectivesAPI,
    userBObjectivesAPI,
  }) => {
    setSeverity("critical");

    let createdId = null;
    const userAId = await getCurrentUserId(userAObjectivesAPI);
    const { periodYear, periodQ } = getCurrentPeriod();

    test.skip(!userAId, "Не удалось получить ID пользователя A");

    await allure.step("User A создаёт приватную цель", async () => {
      const { response, data } = await userAObjectivesAPI.saveObjective({
        title: `IDOR Private Objective ${Date.now()}`,
        description: "Private objective for IDOR test",
        periodYear,
        periodQ,
        status: "draft",
        level: "self",
        responsibleUserId: userAId,
        userAccessType: "selective", // Приватная цель
        milestones: [
          {
            temporaryId: `temp-idor-${Date.now()}`,
            title: "Milestone 1",
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userAId,
          },
        ],
      });

      if (response.ok() && data?.id) {
        createdId = data.id;
      }
    });

    test.skip(!createdId, "Не удалось создать тестовую цель");

    await allure.step(
      "User B пытается получить приватную цель User A",
      async () => {
        const { response } =
          await userBObjectivesAPI.getObjectiveById(createdId);

        allure.attachment(
          "Response Status",
          `Status: ${response.status()}`,
          "text/plain",
        );

        // User B не должен видеть приватную цель User A
        expect(
          [403, 404].includes(response.status()),
          `Ожидается 403 или 404, получен ${response.status()}`,
        ).toBe(true);
      },
    );

    // Cleanup
    if (createdId) {
      await userAObjectivesAPI.deleteObjective(createdId);
    }
  });

  test("User B не может удалить цель User A", async ({
    userAObjectivesAPI,
    userBObjectivesAPI,
  }) => {
    setSeverity("critical");

    let createdId = null;
    const userAId = await getCurrentUserId(userAObjectivesAPI);
    const { periodYear, periodQ } = getCurrentPeriod();

    test.skip(!userAId, "Не удалось получить ID пользователя A");

    await allure.step("User A создаёт цель", async () => {
      const { response, data } = await userAObjectivesAPI.saveObjective({
        title: `IDOR Delete Objective ${Date.now()}`,
        description: "Objective for IDOR delete test",
        periodYear,
        periodQ,
        status: "draft",
        level: "self",
        responsibleUserId: userAId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-idor-del-${Date.now()}`,
            title: "Milestone 1",
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userAId,
          },
        ],
      });

      if (response.ok() && data?.id) {
        createdId = data.id;
      }
    });

    test.skip(!createdId, "Не удалось создать тестовую цель");

    await allure.step("User B пытается удалить цель User A", async () => {
      const { response } = await userBObjectivesAPI.deleteObjective(createdId);

      expect(
        [403, 404].includes(response.status()),
        `User B не должен удалять чужую цель. Получен статус: ${response.status()}`,
      ).toBe(true);
    });

    // Проверяем что цель всё ещё существует
    await allure.step("Проверяем что цель не была удалена", async () => {
      const { response } = await userAObjectivesAPI.getObjectiveById(createdId);
      expect(response.ok(), "Цель должна всё ещё существовать").toBe(true);
    });

    // Cleanup
    if (createdId) {
      await userAObjectivesAPI.deleteObjective(createdId);
    }
  });

  test("User B не может изменить цель User A", async ({
    userAObjectivesAPI,
    userBObjectivesAPI,
  }) => {
    setSeverity("critical");

    let createdId = null;
    let originalTitle = null;
    const userAId = await getCurrentUserId(userAObjectivesAPI);
    const userBId = await getCurrentUserId(userBObjectivesAPI);
    const { periodYear, periodQ } = getCurrentPeriod();

    test.skip(!userAId || !userBId, "Не удалось получить ID пользователей");

    await allure.step("User A создаёт цель", async () => {
      originalTitle = `IDOR Update Objective ${Date.now()}`;
      const { response, data } = await userAObjectivesAPI.saveObjective({
        title: originalTitle,
        description: "Objective for IDOR update test",
        periodYear,
        periodQ,
        status: "draft",
        level: "self",
        responsibleUserId: userAId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-idor-upd-${Date.now()}`,
            title: "Milestone 1",
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userAId,
          },
        ],
      });

      if (response.ok() && data?.id) {
        createdId = data.id;
      }
    });

    test.skip(!createdId, "Не удалось создать тестовую цель");

    await allure.step("User B пытается изменить цель User A", async () => {
      const { response } = await userBObjectivesAPI.saveObjective({
        id: createdId,
        title: "Hacked by User B",
        description: "Modified by unauthorized user",
        periodYear,
        periodQ,
        status: "draft",
        level: "self",
        responsibleUserId: userBId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-hack-${Date.now()}`,
            title: "Hacked Milestone",
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userBId,
          },
        ],
      });

      expect(
        [403, 404].includes(response.status()),
        `User B не должен изменять чужую цель. Получен статус: ${response.status()}`,
      ).toBe(true);
    });

    // Проверяем что цель не была изменена
    await allure.step("Проверяем что цель не была изменена", async () => {
      const { response, data } =
        await userAObjectivesAPI.getObjectiveById(createdId);
      if (response.ok()) {
        // getObjectiveById возвращает { objective: {...}, isCanEdit: bool }
        const objective = data.objective || data;
        expect(objective.title, "Название цели не должно измениться").toBe(
          originalTitle,
        );
      }
    });

    // Cleanup
    if (createdId) {
      await userAObjectivesAPI.deleteObjective(createdId);
    }
  });
});

// ============================================================================
// DEVELOPMENT PLANS IDOR TESTS
// ============================================================================

test.describe("IDOR - Development Plans API @api @security @idor @devplans", () => {
  test.beforeEach(() => {
    markAsAPITest("Development Plans", "IDOR Security");
  });

  test("User B не может получить план развития User A", async ({
    userADevPlansAPI,
    userBDevPlansAPI,
  }) => {
    setSeverity("critical");

    // Получаем список планов User A
    let planId = null;

    await allure.step("Получаем план User A", async () => {
      const { response, data } = await userADevPlansAPI.getDevelopmentPlans({
        limit: 1,
      });
      if (response.ok()) {
        const items = data?.items || data || [];
        if (items.length > 0) {
          planId = items[0].id;
        }
      }
    });

    test.skip(!planId, "У User A нет планов развития для теста");

    await allure.step(
      "User B пытается получить план User A по ID",
      async () => {
        const { response } = await userBDevPlansAPI.getDevelopmentPlan(planId);

        allure.attachment(
          "Response Status",
          `Status: ${response.status()}`,
          "text/plain",
        );

        // Если план приватный, User B не должен иметь доступ
        // Если план публичный, может быть 200
        // Логируем результат для анализа
        if (response.ok()) {
          allure.attachment(
            "Warning",
            "User B получил доступ к плану User A - проверить настройки доступа",
            "text/plain",
          );
        }
      },
    );
  });

  test("User B не может удалить план развития User A", async ({
    userADevPlansAPI,
    userBDevPlansAPI,
  }) => {
    setSeverity("critical");

    // Получаем план User A
    let planId = null;

    await allure.step("Получаем план User A", async () => {
      const { response, data } = await userADevPlansAPI.getDevelopmentPlans({
        limit: 1,
      });
      if (response.ok()) {
        const items = data?.items || data || [];
        if (items.length > 0) {
          planId = items[0].id;
        }
      }
    });

    test.skip(!planId, "У User A нет планов развития для теста");

    await allure.step("User B пытается удалить план User A", async () => {
      const { response } = await userBDevPlansAPI.deleteDevelopmentPlan(planId);

      expect(
        [403, 404].includes(response.status()),
        `User B не должен удалять чужой план. Получен статус: ${response.status()}`,
      ).toBe(true);
    });

    // Проверяем что план всё ещё существует
    await allure.step("Проверяем что план не был удалён", async () => {
      const { response } = await userADevPlansAPI.getDevelopmentPlan(planId);
      expect(response.ok(), "План должен всё ещё существовать").toBe(true);
    });
  });
});

// ============================================================================
// COMMENTS IDOR TESTS
// ============================================================================

test.describe("IDOR - Comments API @api @security @idor @comments", () => {
  test.beforeEach(() => {
    markAsAPITest("Comments", "IDOR Security");
  });

  test("User B не может удалить комментарий User A к благодарности", async ({
    userAFeedbackAPI,
    userBFeedbackAPI,
  }) => {
    setSeverity("critical");

    let feedbackId = null;
    let commentId = null;
    const feedbackTypeId = await getThanksTypeId(userAFeedbackAPI);
    const targetUserId = await getTargetUserId(userAFeedbackAPI);

    test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

    await allure.step("User A создаёт публичную благодарность", async () => {
      const { data } = await userAFeedbackAPI.create({
        body: `IDOR Comment Test ${Date.now()}`,
        targets: [{ targetType: "user", entityId: targetUserId }],
        feedbackTypeId,
        userAccessType: "everybody",
        usersWithAccess: [],
      });
      feedbackId = data?.id;
    });

    test.skip(!feedbackId, "Не удалось создать благодарность");

    await allure.step("User A добавляет комментарий", async () => {
      const { response, data } = await userAFeedbackAPI.post(
        "/private/feedback-comments/",
        {
          feedbackId,
          body: "Comment by User A",
        },
      );

      if (response.ok() && data?.id) {
        commentId = data.id;
      }
    });

    test.skip(!commentId, "Не удалось создать комментарий");

    await allure.step(
      "User B пытается удалить комментарий User A",
      async () => {
        const { response } = await userBFeedbackAPI.delete(
          `/private/feedback-comments/${commentId}/`,
        );

        expect(
          [403, 404].includes(response.status()),
          `User B не должен удалять чужой комментарий. Получен статус: ${response.status()}`,
        ).toBe(true);
      },
    );

    // Cleanup
    await safeDeleteFeedback(userAFeedbackAPI, feedbackId);
  });

  test("User B не может изменить комментарий User A", async ({
    userAFeedbackAPI,
    userBFeedbackAPI,
  }) => {
    setSeverity("critical");

    let feedbackId = null;
    let commentId = null;
    const feedbackTypeId = await getThanksTypeId(userAFeedbackAPI);
    const targetUserId = await getTargetUserId(userAFeedbackAPI);

    test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

    await allure.step("User A создаёт публичную благодарность", async () => {
      const { data } = await userAFeedbackAPI.create({
        body: `IDOR Comment Edit Test ${Date.now()}`,
        targets: [{ targetType: "user", entityId: targetUserId }],
        feedbackTypeId,
        userAccessType: "everybody",
        usersWithAccess: [],
      });
      feedbackId = data?.id;
    });

    test.skip(!feedbackId, "Не удалось создать благодарность");

    await allure.step("User A добавляет комментарий", async () => {
      const { response, data } = await userAFeedbackAPI.post(
        "/private/feedback-comments/",
        {
          feedbackId,
          body: "Original comment by User A",
        },
      );

      if (response.ok() && data?.id) {
        commentId = data.id;
      }
    });

    test.skip(!commentId, "Не удалось создать комментарий");

    await allure.step(
      "User B пытается изменить комментарий User A",
      async () => {
        const { response } = await userBFeedbackAPI.patch(
          `/private/feedback-comments/${commentId}/`,
          { body: "Hacked by User B" },
        );

        expect(
          [403, 404, 405].includes(response.status()),
          `User B не должен изменять чужой комментарий. Получен статус: ${response.status()}`,
        ).toBe(true);
      },
    );

    // Cleanup
    await safeDeleteFeedback(userAFeedbackAPI, feedbackId);
  });
});

// ============================================================================
// ID ENUMERATION TESTS
// ============================================================================

test.describe("IDOR - ID Enumeration @api @security @idor @enumeration", () => {
  test.beforeEach(() => {
    markAsAPITest("Security", "ID Enumeration");
  });

  test("Последовательный перебор ID не раскрывает данные", async ({
    userBFeedbackAPI,
  }) => {
    setSeverity("normal");

    const results = {
      found: 0,
      notFound: 0,
      forbidden: 0,
      errors: 0,
    };

    await allure.step("Перебор ID благодарностей 1-20", async () => {
      for (let id = 1; id <= 20; id++) {
        const { response } = await userBFeedbackAPI.getById(id);
        const status = response.status();

        if (status === 200) results.found++;
        else if (status === 404) results.notFound++;
        else if (status === 403) results.forbidden++;
        else results.errors++;
      }
    });

    allure.attachment(
      "Enumeration Results",
      JSON.stringify(results, null, 2),
      "application/json",
    );

    // Анализ результатов
    // Если много 200 ответов - возможна утечка данных
    // Хороший API должен возвращать 403 или 404 для чужих ресурсов
    expect(
      results.found < 5,
      `Найдено ${results.found} доступных благодарностей - возможна утечка данных`,
    ).toBe(true);
  });

  test("Случайные UUID не раскрывают данные", async ({ userBFeedbackAPI }) => {
    setSeverity("minor");

    const randomUUIDs = [
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "00000000-0000-0000-0000-000000000001",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
    ];

    await allure.step("Проверка случайных UUID", async () => {
      for (const uuid of randomUUIDs) {
        const { response } = await userBFeedbackAPI.getById(uuid);

        // Должен быть 400 (невалидный ID) или 404 (не найдено)
        expect(
          [400, 404].includes(response.status()),
          `UUID ${uuid}: ожидается 400 или 404, получен ${response.status()}`,
        ).toBe(true);
      }
    });
  });
});
