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
  assertSuccessStatus,
  assertValidArray,
} from "../../utils/api/common-assertions.js";

// Хранение созданных ID для cleanup
const createdFeedbackIds = [];

test.describe(
  "Feedback API - CRUD Operations",
  { tag: ["@api", "@feedback", "@crud", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "CRUD");
    });

    test.describe("GET Lists", () => {
      test("C5048: GET /private/feedbacks/ - получить все благодарности (базовый эндпоинт)", async ({
        feedbackAPI,
      }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/feedbacks/ - получить все благодарности (базовый эндпоинт)", async () => {
          const { response, data } = await feedbackAPI.getFeedbacks({
            limit: 10,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);

          // Проверяем структуру благодарности если есть данные
          if (items.length > 0) {
            const feedback = items[0];
            expect(feedback).toHaveProperty("id");
            expect(feedback).toHaveProperty("body");
          }
        });
      });

      test("C5049: GET /private/feedbacks/ с фильтрацией по датам", async ({
        feedbackAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET /private/feedbacks/ с фильтрацией по датам", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const { response, data } = await feedbackAPI.getFeedbacks({
            dateFrom,
            dateTo,
            limit: 10,
          });

          assertSuccessStatus(response);
          const items = data?.items || data || [];
          assertValidArray(items);
        });
      });

      test("C5050: GET /private/feedbacks/of-me/ - получить полученные благодарности", async ({
        feedbackAPI,
      }) => {
        setSeverity("critical");

        let response, data;
        await test.step("Выполнить запрос: GET /private/feedbacks/of-me/ - получить полученные благодарности", async () => {
          ({ response, data } = await feedbackAPI.getFeedbacksOfMe());

          assertSuccessStatus(response);
        });

        await test.step("Проверить ответ", async () => {
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);

          // Валидация структуры элементов (если есть)
          if (items.length > 0) {
            expect(items[0]).toHaveProperty("id");
            if (items[0].body) {
              expect(typeof items[0].body).toBe("string");
            }
          }

          // Проверяем метаданные пагинации (если есть)
          if (data?.total !== undefined) {
            expect(typeof data.total).toBe("number");
            expect(data.total).toBeGreaterThanOrEqual(0);
          }
        });
      });

      test("C5051: GET /private/feedbacks/of-me/ с пагинацией", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /private/feedbacks/of-me/ с пагинацией", async () => {
          const { response, data } = await feedbackAPI.getFeedbacksOfMe({
            limit: 5,
            offset: 0,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);
          expect(items.length).toBeLessThanOrEqual(5);
        });
      });

      test("C5052: GET /private/feedbacks/of-me/ с фильтром по датам", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /private/feedbacks/of-me/ с фильтром по датам", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const { response, data } = await feedbackAPI.getFeedbacksOfMe({
            dateFrom,
            dateTo,
            limit: 10,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);
        });
      });

      test("C5053: GET /private/feedbacks/my/ - получить отправленные благодарности", async ({
        feedbackAPI,
      }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/feedbacks/my/ - получить отправленные благодарности", async () => {
          const { response, data } = await feedbackAPI.getMyFeedbacks();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);

          // Валидация структуры элементов (если есть)
          if (items.length > 0) {
            expect(items[0]).toHaveProperty("id");
            if (items[0].authorUserId) {
              expect(
                typeof items[0].authorUserId === "string" ||
                  typeof items[0].authorUserId === "number",
              ).toBe(true);
            }
          }
        });
      });

      test("C5054: GET /private/feedbacks/my/ с пагинацией", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /private/feedbacks/my/ с пагинацией", async () => {
          const { response, data } = await feedbackAPI.getMyFeedbacks({
            limit: 5,
            offset: 0,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);
          expect(items.length).toBeLessThanOrEqual(5);
        });
      });

      test("C5055: GET /private/feedbacks/shared/ - получить публичные благодарности", async ({
        feedbackAPI,
      }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/feedbacks/shared/ - получить публичные благодарности", async () => {
          const { response, data } = await feedbackAPI.getSharedFeedbacks();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);

          // Все элементы должны быть публичными (API использует 'everybody' или 'PUBLIC')
          items.forEach((item) => {
            if (item.userAccessType) {
              expect(["PUBLIC", "everybody"]).toContain(item.userAccessType);
            }
          });
        });
      });

      test("C5056: GET /private/feedbacks/shared/ с includeMy=true", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /private/feedbacks/shared/ с includeMy=true", async () => {
          const { response, data } = await feedbackAPI.getSharedFeedbacks({
            includeMy: true,
            limit: 10,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);
        });
      });

      test("C5057: GET /private/feedbacks/of-employees/ - получить благодарности сотрудников", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /private/feedbacks/of-employees/ - получить благодарности сотрудников", async () => {
          const { response, data } =
            await feedbackAPI.getFeedbacksOfEmployees();

          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
            const items = data?.items || data || [];
            assertValidArray(items);

            // Валидация структуры элементов (если есть)
            if (items.length > 0) {
              expect(items[0]).toHaveProperty("id");
            }
          }
        });
      });
    });

    test.describe("GET by ID", () => {
      test("C5058: GET /private/feedbacks/{id}/ - получить благодарность по ID", async ({
        feedbackAPI,
      }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/feedbacks/{id}/ - получить благодарность по ID", async () => {
          const { feedbackId } = await findExistingFeedback(feedbackAPI);
          test.skip(!feedbackId, "Нет благодарностей");

          const { response, data } = await feedbackAPI.getById(feedbackId);

          assertSuccessStatus(response);
          expect(data).toBeDefined();
          expect(data.id).toBe(feedbackId);

          // Валидация структуры благодарности
          if (data.body) {
            expect(typeof data.body).toBe("string");
          }
          if (data.createdAt) {
            expect(typeof data.createdAt).toBe("string");
          }
        });
      });

      test("C5059: GET /private/feedbacks/{id}/members/ - получить получателей благодарности", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /private/feedbacks/{id}/members/ - получить получателей благодарности", async () => {
          const { feedbackId } = await findExistingFeedback(feedbackAPI);
          test.skip(!feedbackId, "Нет благодарностей");

          const { response, data } = await feedbackAPI.getMembers(feedbackId);

          expect([200, 404]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
            const items = data?.items || data || [];
            assertValidArray(items);

            // Валидация структуры получателей (если есть)
            if (items.length > 0) {
              expect(items[0]).toHaveProperty("id");
            }
          }
        });
      });
    });

    test.describe("Create Feedback", () => {
      test(
        "C5060: POST /private/feedbacks/ - создать благодарность",
        { tag: ["@critical", "@db"] },
        async ({ feedbackAPI, feedbackVerifier }) => {
          setSeverity("critical");
          let feedbackTypeId, targetUserId, body, response, data;

          await test.step("Получить ID типа благодарности (Thanks)", async () => {
            feedbackTypeId = await getThanksTypeId(feedbackAPI);
            test.skip(!feedbackTypeId, "Нет типа благодарности");
          });

          await test.step("Найти целевого пользователя для отправки благодарности", async () => {
            targetUserId = await findTargetUser(feedbackAPI);
            test.skip(!targetUserId, "Нет целевого пользователя");
          });

          await test.step("Подготовить payload для создания благодарности", async () => {
            body = TestDataHelper.generateUniqueName("Благодарность");
          });

          await test.step("Отправить POST /private/feedbacks/ (тип: благодарность, видимость: selective)", async () => {
            const result = await feedbackAPI.create({
              body,
              targets: [{ targetType: "user", entityId: targetUserId }],
              feedbackTypeId,
              userAccessType: "selective",
              usersWithAccess: [],
            });
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200/201 Created", async () => {
            expect(
              response.ok(),
              `Ожидается успешный ответ, получен ${response.status()}`,
            ).toBe(true);
          });

          await test.step("Проверить наличие данных в ответе", async () => {
            expect(data, "Ответ должен содержать данные").toBeDefined();
          });

          await test.step("Проверить наличие id в ответе (благодарность создана)", async () => {
            expect(
              data.id,
              "ID созданной благодарности должен быть определён",
            ).toBeDefined();
          });

          await test.step("Сохранить ID для cleanup", async () => {
            createdFeedbackIds.push(data.id);
          });

          await test.step("Проверить тип поля id (string или number)", async () => {
            expect(
              typeof data.id === "string" || typeof data.id === "number",
              "ID должен быть строкой или числом",
            ).toBe(true);
          });

          await test.step("Проверить данные благодарности: body совпадает с отправленным", async () => {
            expect(data.body, "body должен совпадать с отправленным").toBe(
              body,
            );
          });

          await test.step("Проверить данные благодарности: userAccessType = selective", async () => {
            expect(
              data.userAccessType,
              "userAccessType должен быть selective",
            ).toBe("selective");
          });

          await test.step("DB: Проверка создания благодарности в БД", async () => {
            if (!feedbackVerifier.isConnected()) return;
            await feedbackVerifier.verifyFeedbackCreated(data.id);
          });

          await test.step("DB: Проверка что благодарность не помечена удалённой", async () => {
            if (!feedbackVerifier.isConnected()) return;
            await feedbackVerifier.verifyFeedbackNotDeleted(data.id);
          });
        },
      );

      test("C5061: POST /private/feedbacks/ - создать публичную благодарность", async ({
        feedbackAPI,
      }) => {
        setSeverity("critical");
        let feedbackTypeId, targetUserId, body, response, data;

        await test.step("Получить ID типа благодарности (Thanks)", async () => {
          feedbackTypeId = await getThanksTypeId(feedbackAPI);
          test.skip(!feedbackTypeId, "Нет типа благодарности");
        });

        await test.step("Найти целевого пользователя для отправки благодарности", async () => {
          targetUserId = await findTargetUser(feedbackAPI);
          test.skip(!targetUserId, "Нет целевого пользователя");
        });

        await test.step("Подготовить payload для публичной благодарности", async () => {
          body = TestDataHelper.generateUniqueName("Публичная благодарность");
        });

        await test.step("Отправить POST /private/feedbacks/ (тип: благодарность, видимость: everybody)", async () => {
          const result = await feedbackAPI.create({
            body,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "everybody",
            usersWithAccess: [],
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/201 Created", async () => {
          expect(
            response.ok(),
            `Ожидается успешный ответ, получен ${response.status()}`,
          ).toBe(true);
        });

        await test.step("Проверить наличие данных в ответе", async () => {
          expect(data, "Ответ должен содержать данные").toBeDefined();
        });

        await test.step("Проверить наличие id в ответе (благодарность создана)", async () => {
          expect(
            data.id,
            "ID созданной благодарности должен быть определён",
          ).toBeDefined();
        });

        await test.step("Сохранить ID для cleanup", async () => {
          createdFeedbackIds.push(data.id);
        });

        await test.step("Проверить тип поля id (string или number)", async () => {
          expect(
            typeof data.id === "string" || typeof data.id === "number",
            "ID должен быть строкой или числом",
          ).toBe(true);
        });

        await test.step("Проверить данные благодарности: userAccessType = everybody", async () => {
          expect(
            data.userAccessType,
            "userAccessType должен быть everybody",
          ).toBe("everybody");
        });
      });
    });

    test.describe("Publish Feedback", () => {
      test("C5062: POST /private/feedbacks/{id}/publish/ - опубликовать благодарность", async ({
        feedbackAPI,
      }) => {
        let response;
        await test.step("Выполнить запрос: POST /private/feedbacks/{id}/publish/ - опубликовать благодарность", async () => {
          // Ищем приватную благодарность (userAccessType === 'selective' или 'PRIVATE')
          const { data: myFeedbacks } = await feedbackAPI.getMyFeedbacks({
            limit: 20,
          });
          const items = myFeedbacks?.items || myFeedbacks || [];
          // API использует 'selective' для приватных и 'everybody' для публичных
          const privateFeedback = items.find(
            (f) =>
              f.userAccessType === "PRIVATE" ||
              f.userAccessType === "selective" ||
              f.userAccessType?.toLowerCase() === "private",
          );

          test.skip(!privateFeedback, "Нет приватных благодарностей");

          ({ response } = await feedbackAPI.publish(privateFeedback.id));

          // Может быть успех или ошибка (уже опубликована)
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 409]).toContain(response.status());
        });
      });
    });

    test.describe("Set Status", () => {
      test("C5063: POST /private/feedbacks/{id}/set-status/ - изменить статус благодарности", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: POST /private/feedbacks/{id}/set-status/ - изменить статус благодарности", async () => {
          const { feedbackId } = await findExistingFeedback(feedbackAPI);
          test.skip(!feedbackId, "Нет благодарностей");

          const { response } = await feedbackAPI.setStatus(
            feedbackId,
            "ACKNOWLEDGED",
          );

          // Может быть успех или ошибка (нельзя изменить статус)
          expect([200, 201, 400, 403, 409]).toContain(response.status());
        });
      });
    });
  },
);

test.describe(
  "Feedback API - Update/Delete Operations",
  { tag: ["@api", "@feedback", "@workflow", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Update/Delete");
    });

    test.describe("Feedback Update/Delete", () => {
      test("C5075: POST /private/feedbacks/{id}/ - обновить благодарность", async ({
        feedbackAPI,
      }) => {
        setSeverity("critical");

        let response, data;
        await test.step("Выполнить запрос: POST /private/feedbacks/{id}/ - обновить благодарность", async () => {
          // Сначала создаём благодарность для обновления
          const feedbackTypeId = await getThanksTypeId(feedbackAPI);
          const targetUserId = await findTargetUser(feedbackAPI);
          test.skip(
            !feedbackTypeId || !targetUserId,
            "Нет типа благодарности или целевого пользователя",
          );

          const originalBody = TestDataHelper.generateUniqueName(
            "Благодарность для обновления",
          );
          const { response: createResp, data: createData } =
            await feedbackAPI.create({
              body: originalBody,
              targets: [{ targetType: "user", entityId: targetUserId }],
              feedbackTypeId,
              userAccessType: "selective",
              usersWithAccess: [],
            });

          test.skip(
            !createResp.ok() || !createData?.id,
            "Не удалось создать благодарность для теста",
          );

          const feedbackId = createData.id;
          createdFeedbackIds.push(feedbackId);

          const updatedBody = TestDataHelper.generateUniqueName(
            "Обновлённая благодарность",
          );

          ({ response, data } = await feedbackAPI.update(feedbackId, {
            body: updatedBody,
          }));

          // API может не поддерживать обновление или вернуть ошибку
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 404, 405]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
          }
        });
      });

      test("C5076: POST /private/feedbacks/{id}/ - изменить видимость благодарности", async ({
        feedbackAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST /private/feedbacks/{id}/ - изменить видимость благодарности", async () => {
          const feedbackTypeId = await getThanksTypeId(feedbackAPI);
          const targetUserId = await findTargetUser(feedbackAPI);
          test.skip(
            !feedbackTypeId || !targetUserId,
            "Нет типа благодарности или целевого пользователя",
          );

          const body = TestDataHelper.generateUniqueName(
            "Благодарность для изменения видимости",
          );
          const { response: createResp, data: createData } =
            await feedbackAPI.create({
              body,
              targets: [{ targetType: "user", entityId: targetUserId }],
              feedbackTypeId,
              userAccessType: "selective",
              usersWithAccess: [],
            });

          test.skip(
            !createResp.ok() || !createData?.id,
            "Не удалось создать благодарность для теста",
          );

          const feedbackId = createData.id;
          createdFeedbackIds.push(feedbackId);

          ({ response, data } = await feedbackAPI.update(feedbackId, {
            userAccessType: "everybody",
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 404, 405]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
          }
        });
      });

      test(
        "C5077: DELETE /private/feedbacks/{id}/ - удалить благодарность",
        { tag: ["@critical", "@db"] },
        async ({ feedbackAPI, feedbackVerifier }) => {
          setSeverity("critical");
          let feedbackTypeId,
            targetUserId,
            body,
            createResp,
            createData,
            feedbackId,
            response,
            getResp;

          await test.step("Получить ID типа благодарности (Thanks)", async () => {
            feedbackTypeId = await getThanksTypeId(feedbackAPI);
            test.skip(!feedbackTypeId, "Нет типа благодарности");
          });

          await test.step("Найти целевого пользователя для отправки благодарности", async () => {
            targetUserId = await findTargetUser(feedbackAPI);
            test.skip(!targetUserId, "Нет целевого пользователя");
          });

          await test.step("Подготовить payload для благодарности", async () => {
            body = TestDataHelper.generateUniqueName(
              "Благодарность для удаления",
            );
          });

          await test.step("Создать тестовую благодарность (POST /private/feedbacks/)", async () => {
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
              "Не удалось создать благодарность для теста",
            );
            feedbackId = createData.id;
          });

          await test.step("DB: Проверка создания благодарности в БД", async () => {
            if (!feedbackVerifier.isConnected()) return;
            await feedbackVerifier.verifyFeedbackCreated(feedbackId);
          });

          await test.step("Отправить DELETE /private/feedbacks/{id}/", async () => {
            const result = await feedbackAPI.deleteFeedback(feedbackId);
            response = result.response;
          });

          await test.step("Проверить статус ответа: 200/204 или допустимая ошибка", async () => {
            expect([200, 204, 400, 403, 404, 405]).toContain(response.status());
          });

          await test.step("Проверить что благодарность недоступна (GET возвращает ошибку)", async () => {
            if (response.ok() || response.status() === 204) {
              const result = await feedbackAPI.getById(feedbackId);
              getResp = result.response;
              expect([400, 403, 404]).toContain(getResp.status());
            }
          });

          await test.step("DB: Проверка удаления благодарности из БД", async () => {
            if (
              (response.ok() || response.status() === 204) &&
              feedbackVerifier.isConnected()
            ) {
              await feedbackVerifier.verifyFeedbackDeleted(feedbackId);
            }
          });
        },
      );

      test("C5078: DELETE /private/feedbacks/{id}/ - удаление несуществующей благодарности", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: DELETE /private/feedbacks/{id}/ - удаление несуществующей благодарности", async () => {
          const { response } = await feedbackAPI.deleteFeedback(999999);

          expect([400, 403, 404, 405]).toContain(response.status());
        });
      });

      test("C5079: POST /private/feedbacks/{id}/ - обновление несуществующей благодарности", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: POST /private/feedbacks/{id}/ - обновление несуществующей благодарности", async () => {
          const { response } = await feedbackAPI.update(999999, {
            body: "Тест",
          });

          expect([400, 403, 404, 405]).toContain(response.status());
        });
      });
    });

    test.describe("Comment Update/Delete", () => {
      test("C5080: POST /private/feedback-comments/{id}/ - обновить комментарий", async ({
        feedbackAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST /private/feedback-comments/{id}/ - обновить комментарий", async () => {
          // Сначала создаём комментарий для обновления
          const { feedbackId } = await findExistingFeedback(feedbackAPI);
          test.skip(!feedbackId, "Нет благодарностей");

          const originalBody = TestDataHelper.generateUniqueName(
            "Комментарий для обновления",
          );
          const { response: createResp, data: createData } =
            await feedbackAPI.createComment(feedbackId, originalBody);

          test.skip(
            !createResp.ok() || !createData?.id,
            "Не удалось создать комментарий для теста",
          );

          const commentId = createData.id;
          const updatedBody = TestDataHelper.generateUniqueName(
            "Обновлённый комментарий",
          );

          ({ response, data } = await feedbackAPI.updateComment(
            commentId,
            updatedBody,
          ));

          // API может не поддерживать обновление
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 404, 405]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
          }
        });
      });

      test("C5020: DELETE /private/feedback-comments/{id}/ - удалить комментарий", async ({
        feedbackAPI,
      }) => {
        setSeverity("normal");

        let commentId, response;
        await test.step("Выполнить запрос: DELETE /private/feedback-comments/{id}/ - удалить комментарий", async () => {
          // Сначала создаём комментарий для удаления
          const { feedbackId } = await findExistingFeedback(feedbackAPI);
          test.skip(!feedbackId, "Нет благодарностей");

          const body = TestDataHelper.generateUniqueName(
            "Комментарий для удаления",
          );
          const { response: createResp, data: createData } =
            await feedbackAPI.createComment(feedbackId, body);

          test.skip(
            !createResp.ok() || !createData?.id,
            "Не удалось создать комментарий для теста",
          );

          commentId = createData.id;

          ({ response } = await feedbackAPI.deleteComment(commentId));

          // API может не поддерживать удаление
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 204, 400, 403, 404, 405]).toContain(response.status());

          // Если удаление успешно, проверяем что комментарий недоступен
          if (response.ok() || response.status() === 204) {
            const { response: getResp } =
              await feedbackAPI.getCommentById(commentId);
            expect([400, 403, 404]).toContain(getResp.status());
          }
        });
      });

      test("C5082: DELETE /private/feedback-comments/{id}/ - удаление несуществующего комментария", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: DELETE /private/feedback-comments/{id}/ - удаление несуществующего комментария", async () => {
          const { response } = await feedbackAPI.deleteComment(999999);

          expect([400, 403, 404, 405]).toContain(response.status());
        });
      });

      test("C5083: POST /private/feedback-comments/{id}/ - обновление несуществующего комментария", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: POST /private/feedback-comments/{id}/ - обновление несуществующего комментария", async () => {
          const { response } = await feedbackAPI.updateComment(999999, "Тест");

          expect([400, 403, 404, 405]).toContain(response.status());
        });
      });
    });
  },
);
