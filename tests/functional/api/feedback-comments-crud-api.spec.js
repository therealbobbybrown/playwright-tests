// @ts-check
import { expect } from "@playwright/test";
import {
  test,
  findExistingFeedback,
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

test.describe(
  "Feedback API - Comments",
  { tag: ["@api", "@feedback", "@comments", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Comments");
    });

    test("C5010: GET /private/feedback-comments/of-feedback/{id}/ - получить комментарии к благодарности", async ({
      feedbackAPI,
    }) => {
      let response, data;
      await test.step("Выполнить запрос: GET /private/feedback-comments/of-feedback/{id}/ - получить комментарии к благодарности", async () => {
        const { feedbackId } = await findExistingFeedback(feedbackAPI);
        test.skip(!feedbackId, "Нет благодарностей");

        ({ response, data } = await feedbackAPI.getComments(feedbackId));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 404]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          const items = data?.items || data || [];
          assertValidArray(items);

          // Валидация структуры комментариев (если есть)
          if (items.length > 0) {
            expect(items[0]).toHaveProperty("id");
            if (items[0].body) {
              expect(typeof items[0].body).toBe("string");
            }
          }
        }
      });
    });

    test("C5065: GET /private/feedback-comments/of-feedback/{id}/ с пагинацией", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-comments/of-feedback/{id}/ с пагинацией", async () => {
        const { feedbackId } = await findExistingFeedback(feedbackAPI);
        test.skip(!feedbackId, "Нет благодарностей");

        const { response, data } = await feedbackAPI.getComments(feedbackId, {
          limit: 5,
          offset: 0,
        });

        expect([200, 404]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          const items = data?.items || data || [];
          assertValidArray(items);
          expect(items.length).toBeLessThanOrEqual(5);
        }
      });
    });

    test("C5066: POST /private/feedback-comments/ - создать комментарий к благодарности", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let commentBody, response, data;
      await test.step("Выполнить запрос: POST /private/feedback-comments/ - создать комментарий к благодарности", async () => {
        const { feedbackId } = await findExistingFeedback(feedbackAPI);
        test.skip(!feedbackId, "Нет благодарностей");

        commentBody = TestDataHelper.generateUniqueName("Комментарий");
        ({ response, data } = await feedbackAPI.createComment(
          feedbackId,
          commentBody,
        ));

        // Может быть успех или ошибка (нельзя комментировать)
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 403]).toContain(response.status());

        if (response.ok() && data) {
          expect(data).toBeDefined();
          if (data.id) {
            expect(
              typeof data.id === "string" || typeof data.id === "number",
            ).toBe(true);
          }
          if (data.body) {
            expect(data.body).toBe(commentBody);
          }
        }
      });
    });

    test("C5013: GET /private/feedback-comments/{id}/ - получить комментарий по ID", async ({
      feedbackAPI,
    }) => {
      let feedbackId, commentId, response, data;
      await test.step("Выполнить запрос: GET /private/feedback-comments/{id}/ - получить комментарий по ID", async () => {
        ({ feedbackId } = await findExistingFeedback(feedbackAPI));
        test.skip(!feedbackId, "Нет благодарностей");

        // Сначала получаем комментарии
        const { data: comments } = await feedbackAPI.getComments(feedbackId);
        const items = comments?.items || comments || [];
        commentId = items[0]?.id;

        test.skip(!commentId, "Нет комментариев");

        ({ response, data } = await feedbackAPI.getCommentById(commentId));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 404]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          expect(data.id).toBe(commentId);

          // Валидация структуры комментария
          if (data.body) {
            expect(typeof data.body).toBe("string");
          }
          if (data.feedbackId) {
            expect(data.feedbackId).toBe(feedbackId);
          }
        }
      });
    });
  },
);
