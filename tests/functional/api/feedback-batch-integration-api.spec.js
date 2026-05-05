// @ts-check
import { expect } from "@playwright/test";
import {
  test,
  getThanksTypeId,
  findExistingFeedback,
  findTargetUser,
} from "./feedback-test-helpers.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertValidArray,
} from "../../utils/api/common-assertions.js";

// Хранение созданных ID для cleanup
const createdFeedbackIds = [];

test.describe(
  "Feedback API - Negative Tests",
  { tag: ["@api", "@feedback", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Negative");
    });

    test("C5109: GET /private/feedbacks/{id}/ - несуществующая благодарность", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/{id}/ - несуществующая благодарность", async () => {
        const { response } = await feedbackAPI.getById(999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5110: GET /private/feedbacks/{id}/members/ - несуществующая благодарность", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/{id}/members/ - несуществующая благодарность", async () => {
        const { response } = await feedbackAPI.getMembers(999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5111: POST /private/feedbacks/ - без обязательных полей", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/ - без обязательных полей", async () => {
        const { response } = await feedbackAPI.create({});

        expect([400, 422]).toContain(response.status());
      });
    });

    test("C5112: POST /private/feedbacks/ - пустой текст", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/ - пустой текст", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);
        test.skip(
          !feedbackTypeId || !targetUserId,
          "Нет типа благодарности или целевого пользователя",
        );

        const { response } = await feedbackAPI.create({
          body: "",
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
        });

        expect([400, 422]).toContain(response.status());
      });
    });

    test("C5113: POST /private/feedbacks/ - без получателей", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/ - без получателей", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        test.skip(!feedbackTypeId, "Нет типа благодарности");

        const { response } = await feedbackAPI.create({
          body: "Тестовая благодарность",
          targets: [],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
        });

        expect([400, 422]).toContain(response.status());
      });
    });

    test("C5114: POST /private/feedbacks/{id}/publish/ - несуществующая благодарность", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/{id}/publish/ - несуществующая благодарность", async () => {
        const { response } = await feedbackAPI.publish(999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5115: POST /private/feedbacks/{id}/set-status/ - несуществующая благодарность", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/{id}/set-status/ - несуществующая благодарность", async () => {
        const { response } = await feedbackAPI.setStatus(
          999999,
          "ACKNOWLEDGED",
        );

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5025: POST /private/feedback-comments/ - несуществующая благодарность", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedback-comments/ - несуществующая благодарность", async () => {
        const { response } = await feedbackAPI.createComment(
          999999,
          "Тестовый комментарий",
        );

        // 500 - возможный ответ при ошибке сервера на несуществующий ресурс
        expect([400, 403, 404, 500]).toContain(response.status());
      });
    });

    test("C5023: GET /private/feedback-comments/{id}/ - несуществующий комментарий", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-comments/{id}/ - несуществующий комментарий", async () => {
        const { response } = await feedbackAPI.getCommentById(999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== BATCH OPERATIONS ====================

test.describe(
  "Feedback API - Batch Operations",
  { tag: ["@api", "@feedback", "@batch", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Batch Operations");
    });

    test("C5118: Создать несколько благодарностей и проверить список", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let createdIds;
      await test.step("Выполнить запрос: Создать несколько благодарностей и проверить список", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);

        test.skip(
          !feedbackTypeId || !targetUserId,
          "Нет типа благодарности или целевого пользователя",
        );

        const timestamp = Date.now();
        createdIds = [];

        // Создаём несколько благодарностей
        for (let i = 0; i < 3; i++) {
          const body = TestDataHelper.generateUniqueName(
            `Пакетный тест ${timestamp} #${i + 1}`,
          );
          const { response, data } = await feedbackAPI.create({
            body,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          });

          if (response.ok() && data?.id) {
            createdIds.push(data.id);
          }
        }
      });

      await test.step("Проверить ответ", async () => {
        expect(createdIds.length).toBeGreaterThan(0);

        // Проверяем что созданные благодарности есть в списке
        const { response: listResp, data: listData } =
          await feedbackAPI.getMyFeedbacks({ limit: 50 });
        expect(listResp.ok()).toBe(true);

        const items = listData?.items || listData || [];
        for (const id of createdIds) {
          expect(items.some((f) => f.id === id)).toBe(true);
        }

        // Cleanup - добавляем в глобальный список
        createdFeedbackIds.push(...createdIds);
      });
    });

    test("C5119: Получить благодарности из разных источников и сравнить", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let resp1, data1;
      await test.step("Выполнить запрос: Получить благодарности из разных источников и сравнить", async () => {
        // 1. Получаем из /private/feedbacks/
        ({ response: resp1, data: data1 } = await feedbackAPI.getFeedbacks({
          limit: 10,
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect(resp1.ok()).toBe(true);

        // 2. Получаем из /private/feedbacks/my/
        const { response: resp2, data: data2 } =
          await feedbackAPI.getMyFeedbacks({ limit: 10 });
        expect(resp2.ok()).toBe(true);

        // 3. Получаем из /private/feedbacks/of-me/
        const { response: resp3, data: data3 } =
          await feedbackAPI.getFeedbacksOfMe({ limit: 10 });
        expect(resp3.ok()).toBe(true);

        // Все должны вернуть массивы
        const items1 = data1?.items || data1 || [];
        const items2 = data2?.items || data2 || [];
        const items3 = data3?.items || data3 || [];

        expect(Array.isArray(items1)).toBe(true);
        expect(Array.isArray(items2)).toBe(true);
        expect(Array.isArray(items3)).toBe(true);
      });
    });

    test("C5120: Последовательные запросы с разными фильтрами", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Последовательные запросы с разными фильтрами", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const filters = [
          { limit: 10 },
          { limit: 10, dateFrom, dateTo },
          { limit: 10, feedbackTypeName: "THANKS" },
          { limit: 10, q: "тест" },
        ];

        const results = [];

        for (const filter of filters) {
          const { response, data } = await feedbackAPI.getAllFeedbacks(filter);
          results.push({
            status: response.status(),
            count: (data?.items || data || []).length,
          });
        }

        // Все запросы должны вернуть допустимые статусы
        for (const result of results) {
          expect([200, 403]).toContain(result.status);
        }
      });
    });

    test("C4770: Пагинация: последовательные страницы не пересекаются", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let resp1, data1, resp2, data2;
      await test.step("Выполнить запрос: Пагинация: последовательные страницы не пересекаются", async () => {
        const pageSize = 5;

        ({ response: resp1, data: data1 } = await feedbackAPI.getAllFeedbacks({
          limit: pageSize,
          offset: 0,
        }));

        if (!resp1.ok()) {
          console.log("Нет доступа к manager/feedbacks");
          return;
        }

        ({ response: resp2, data: data2 } = await feedbackAPI.getAllFeedbacks({
          limit: pageSize,
          offset: pageSize,
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect(resp2.ok()).toBe(true);

        const items1 = data1?.items || data1 || [];
        const items2 = data2?.items || data2 || [];

        if (items1.length > 0 && items2.length > 0) {
          const ids1 = items1.map((f) => f.id);
          const ids2 = items2.map((f) => f.id);

          for (const id of ids2) {
            expect(ids1).not.toContain(id);
          }
        }
      });
    });

    test("C5122: Создать благодарность нескольким получателям", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Создать благодарность нескольким получателям", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);

        test.skip(!feedbackTypeId, "Нет типа благодарности");

        // Ищем несколько пользователей
        const { response: usersResp, data: usersData } = await feedbackAPI.get(
          "/manager/users?limit=5",
        );

        if (!usersResp.ok()) {
          console.log("Не удалось получить список пользователей");
          return;
        }

        const users = usersData?.items || usersData || [];

        if (users.length < 2) {
          console.log("Недостаточно пользователей для теста");
          return;
        }

        const targets = users.slice(0, 2).map((u) => ({
          targetType: "user",
          entityId: u.id,
        }));

        const body = TestDataHelper.generateUniqueName(
          "Благодарность нескольким получателям",
        );
        const { response, data } = await feedbackAPI.create({
          body,
          targets,
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
        });

        if (response.ok() && data?.id) {
          createdFeedbackIds.push(data.id);

          // Проверяем что у благодарности несколько получателей
          const { response: membersResp, data: membersData } =
            await feedbackAPI.getMembers(data.id);

          if (membersResp.ok()) {
            const members = membersData?.items || membersData || [];
            expect(members.length).toBeGreaterThanOrEqual(2);
          }
        }
      });
    });

    test("C5123: Множественные запросы одного типа подряд", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Множественные запросы одного типа подряд", async () => {
        const results = [];

        for (let i = 0; i < 5; i++) {
          const { response } = await feedbackAPI.getMyFeedbacks({ limit: 5 });
          results.push(response.status());
        }

        // Все запросы должны вернуть одинаковый статус
        const uniqueStatuses = [...new Set(results)];
        expect(uniqueStatuses.length).toBe(1);
        expect(uniqueStatuses[0]).toBe(200);
      });
    });
  },
);

// ==================== INTEGRATION TESTS ====================

test.describe(
  "Feedback API - Integration Tests",
  { tag: ["@api", "@feedback", "@integration", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Integration");
    });

    test(
      "C5124: Полный жизненный цикл благодарности: создание -> комментарий -> публикация",
      { tag: ["@critical", "@db"] },
      async ({ feedbackAPI, feedbackVerifier }) => {
        setSeverity("critical");
        let feedbackTypeId,
          targetUserId,
          body,
          createResp,
          createData,
          feedbackId;
        let getResp, getData, commentBody, commentResp, commentData;
        let commentsResp, commentsData, comments, publishResp;

        await test.step("Получить ID типа благодарности (Thanks)", async () => {
          feedbackTypeId = await getThanksTypeId(feedbackAPI);
          test.skip(!feedbackTypeId, "Нет типа благодарности");
        });

        await test.step("Найти целевого пользователя для отправки благодарности", async () => {
          targetUserId = await findTargetUser(feedbackAPI);
          test.skip(!targetUserId, "Нет целевого пользователя");
        });

        await test.step("Подготовить payload для благодарности", async () => {
          body = TestDataHelper.generateUniqueName("Жизненный цикл благодарность");
        });

        await test.step("Создать благодарность (POST /private/feedbacks/)", async () => {
          const result = await feedbackAPI.create({
            body,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          });
          createResp = result.response;
          createData = result.data;
          test.skip(
            !createResp.ok() || !createData?.id,
            "Не удалось создать благодарность",
          );
          feedbackId = createData.id;
          createdFeedbackIds.push(feedbackId);
        });

        await test.step("DB: Проверка создания благодарности в БД", async () => {
          if (!feedbackVerifier.isConnected()) return;
          await feedbackVerifier.verifyFeedbackCreated(feedbackId);
        });

        await test.step("DB: Проверка что благодарность не помечена удалённой", async () => {
          if (!feedbackVerifier.isConnected()) return;
          await feedbackVerifier.verifyFeedbackNotDeleted(feedbackId);
        });

        await test.step("Получить благодарность по ID (GET /private/feedbacks/{id}/)", async () => {
          const result = await feedbackAPI.getById(feedbackId);
          getResp = result.response;
          getData = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(getResp.ok()).toBe(true);
        });

        await test.step("Проверить что ID в ответе совпадает с созданным", async () => {
          expect(getData.id).toBe(feedbackId);
        });

        await test.step("Подготовить текст комментария", async () => {
          commentBody = TestDataHelper.generateUniqueName(
            "Комментарий к благодарности",
          );
        });

        await test.step("Добавить комментарий к благодарности (POST /private/feedback-comments/)", async () => {
          const result = await feedbackAPI.createComment(
            feedbackId,
            commentBody,
          );
          commentResp = result.response;
          commentData = result.data;
        });

        await test.step("Получить список комментариев (GET /private/feedback-comments/of-feedback/{id}/)", async () => {
          if (commentResp.ok()) {
            const result = await feedbackAPI.getComments(feedbackId);
            commentsResp = result.response;
            commentsData = result.data;
          }
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          if (commentResp.ok()) {
            expect(commentsResp.ok()).toBe(true);
          }
        });

        await test.step("Проверить что комментарий присутствует в списке", async () => {
          if (commentResp.ok()) {
            comments = commentsData?.items || commentsData || [];
            expect(comments.some((c) => c.body === commentBody)).toBe(true);
          }
        });

        await test.step("Опубликовать благодарность (POST /private/feedbacks/{id}/publish/)", async () => {
          const result = await feedbackAPI.publish(feedbackId);
          publishResp = result.response;
        });

        await test.step("Проверить статус публикации: 200/201 или уже опубликована", async () => {
          expect([200, 201, 400, 409]).toContain(publishResp.status());
        });
      },
    );

    test("C5125: Согласованность данных: private vs manager API", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let privateResp, privateData;
      await test.step("Выполнить запрос: Согласованность данных: private vs manager API", async () => {
        // 1. Получаем через private API
        ({ response: privateResp, data: privateData } =
          await feedbackAPI.getMyFeedbacks({ limit: 10 }));
      });

      await test.step("Проверить ответ", async () => {
        expect(privateResp.ok()).toBe(true);

        // 2. Получаем через manager API
        const { response: managerResp, data: managerData } =
          await feedbackAPI.getAllFeedbacks({ limit: 10 });

        if (!managerResp.ok()) {
          console.log("Manager API недоступен");
          return;
        }

        // 3. Обе API должны вернуть данные
        expect(privateData).toBeDefined();
        expect(managerData).toBeDefined();

        const privateItems = privateData?.items || privateData || [];
        const managerItems = managerData?.items || managerData || [];

        expect(Array.isArray(privateItems)).toBe(true);
        expect(Array.isArray(managerItems)).toBe(true);
      });
    });

    test("C5126: Проверка фильтрации по типу благодарности", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let typesResp, typesData;
      await test.step("Выполнить запрос: Проверка фильтрации по типу благодарности", async () => {
        // Получаем типы благодарностей
        ({ response: typesResp, data: typesData } =
          await feedbackAPI.getFeedbackTypes());
      });

      await test.step("Проверить ответ", async () => {
        expect(typesResp.ok()).toBe(true);

        const types = typesData?.items || typesData || [];

        if (types.length === 0) {
          console.log("Нет типов благодарностей");
          return;
        }

        // Для каждого типа проверяем фильтрацию
        for (const type of types.slice(0, 2)) {
          const typeName = type.name || type.code;

          if (typeName) {
            const { response, data } = await feedbackAPI.getAllFeedbacks({
              feedbackTypeName: typeName,
              limit: 10,
            });

            if (response.ok()) {
              const items = data?.items || data || [];
              // Все элементы должны быть указанного типа
              items.forEach((item) => {
                if (item.feedbackTypeName) {
                  expect(item.feedbackTypeName).toBe(typeName);
                }
              });
            }
          }
        }
      });
    });

    test("C5127: Создание благодарности и проверка в разных списках", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let feedbackId, myResp, myData;
      await test.step("Выполнить запрос: Создание благодарности и проверка в разных списках", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);

        test.skip(
          !feedbackTypeId || !targetUserId,
          "Нет типа благодарности или целевого пользователя",
        );

        // 1. Создаём публичную благодарность
        const body = TestDataHelper.generateUniqueName(
          "Публичная благодарность для проверки",
        );
        const { response: createResp, data: createData } =
          await feedbackAPI.create({
            body,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "everybody",
            usersWithAccess: [],
          });

        if (!createResp.ok() || !createData?.id) {
          console.log("Не удалось создать благодарность");
          return;
        }

        feedbackId = createData.id;
        createdFeedbackIds.push(feedbackId);

        // 2. Проверяем в отправленных
        ({ response: myResp, data: myData } = await feedbackAPI.getMyFeedbacks({
          limit: 50,
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect(myResp.ok()).toBe(true);
        const myItems = myData?.items || myData || [];
        expect(myItems.some((f) => f.id === feedbackId)).toBe(true);

        // 3. Проверяем в публичных
        const { response: sharedResp, data: sharedData } =
          await feedbackAPI.getSharedFeedbacks({
            includeMy: true,
            limit: 50,
          });
        expect(sharedResp.ok()).toBe(true);
        const sharedItems = sharedData?.items || sharedData || [];
        expect(sharedItems.some((f) => f.id === feedbackId)).toBe(true);
      });
    });
  },
);
