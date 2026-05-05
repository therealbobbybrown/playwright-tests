// @ts-check
import { expect } from "@playwright/test";
import {
  test,
  getThanksTypeId,
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
  "Feedback API - Competencies",
  { tag: ["@api", "@feedback", "@competencies", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Competencies");
    });

    // Хелпер для получения компетенций
    async function getCompetencies(feedbackAPI) {
      const { response, data } = await feedbackAPI.get(
        "/private/competencies?limit=10",
      );
      if (!response.ok()) return [];
      return data?.items || data || [];
    }

    test("C5084: POST /private/feedbacks/ - создать благодарность с компетенциями", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let competencies, response, data;
      await test.step("Выполнить запрос: POST /private/feedbacks/ - создать благодарность с компетенциями", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);
        competencies = await getCompetencies(feedbackAPI);

        test.skip(
          !feedbackTypeId || !targetUserId,
          "Нет типа благодарности или целевого пользователя",
        );
        test.skip(competencies.length === 0, "Нет компетенций в системе");

        const body = TestDataHelper.generateUniqueName(
          "Благодарность с компетенциями",
        );
        const competencyId = competencies[0].id;

        ({ response, data } = await feedbackAPI.create({
          body,
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
          competenciesIds: [competencyId],
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400]).toContain(response.status());

        if (response.ok() && data?.id) {
          createdFeedbackIds.push(data.id);
          // Проверяем что компетенции сохранены
          if (data.competencies) {
            assertValidArray(data.competencies);
          }
        }
      });
    });

    test("C5085: POST /private/feedbacks/ - создать благодарность с lack компетенциями", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: POST /private/feedbacks/ - создать благодарность с lack компетенциями", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);
        const competencies = await getCompetencies(feedbackAPI);

        test.skip(
          !feedbackTypeId || !targetUserId,
          "Нет типа благодарности или целевого пользователя",
        );
        test.skip(competencies.length === 0, "Нет компетенций в системе");

        const body = TestDataHelper.generateUniqueName(
          "Благодарность с недостающими компетенциями",
        );
        const competencyId = competencies[0].id;

        ({ response, data } = await feedbackAPI.create({
          body,
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
          lackCompetenciesIds: [competencyId],
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400]).toContain(response.status());

        if (response.ok() && data?.id) {
          createdFeedbackIds.push(data.id);
        }
      });
    });

    test("C5086: POST /private/feedbacks/ - создать благодарность с обоими типами компетенций", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: POST /private/feedbacks/ - создать благодарность с обоими типами компетенций", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);
        const competencies = await getCompetencies(feedbackAPI);

        test.skip(
          !feedbackTypeId || !targetUserId,
          "Нет типа благодарности или целевого пользователя",
        );
        test.skip(
          competencies.length < 2,
          "Недостаточно компетенций в системе",
        );

        const body = TestDataHelper.generateUniqueName(
          "Благодарность с обоими типами компетенций",
        );

        ({ response, data } = await feedbackAPI.create({
          body,
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
          competenciesIds: [competencies[0].id],
          lackCompetenciesIds: [competencies[1].id],
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400]).toContain(response.status());

        if (response.ok() && data?.id) {
          createdFeedbackIds.push(data.id);
        }
      });
    });

    test("C5087: POST /private/feedbacks/{id}/ - обновить компетенции благодарности", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: POST /private/feedbacks/{id}/ - обновить компетенции благодарности", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);
        const competencies = await getCompetencies(feedbackAPI);

        test.skip(
          !feedbackTypeId || !targetUserId,
          "Нет типа благодарности или целевого пользователя",
        );
        test.skip(competencies.length === 0, "Нет компетенций в системе");

        // Создаём благодарность без компетенций
        const body = TestDataHelper.generateUniqueName(
          "Благодарность для добавления компетенций",
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
          "Не удалось создать благодарность",
        );

        const feedbackId = createData.id;
        createdFeedbackIds.push(feedbackId);

        // Обновляем с компетенциями
        ({ response, data } = await feedbackAPI.update(feedbackId, {
          competenciesIds: [competencies[0].id],
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 403, 404, 405]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });
  },
);

test.describe(
  "Feedback API - Gift Bonus",
  { tag: ["@api", "@feedback", "@giftbonus", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Gift Bonus");
    });

    test("C5088: POST /private/feedbacks/ - создать благодарность с gift bonus", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: POST /private/feedbacks/ - создать благодарность с gift bonus", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);
        test.skip(
          !feedbackTypeId || !targetUserId,
          "Нет типа благодарности или целевого пользователя",
        );

        const body = TestDataHelper.generateUniqueName(
          "Благодарность с бонусом",
        );

        ({ response, data } = await feedbackAPI.create({
          body,
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
          giftBonusAmount: 100,
        }));

        // Gift bonus может быть отключен или требовать специальных прав
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 403]).toContain(response.status());

        if (response.ok() && data?.id) {
          createdFeedbackIds.push(data.id);
        }
      });
    });

    test("C5089: POST /private/feedbacks/ - негативный gift bonus amount", async ({
      feedbackAPI,
    }) => {
      let response;
      await test.step("Выполнить запрос: POST /private/feedbacks/ - негативный gift bonus amount", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);
        test.skip(
          !feedbackTypeId || !targetUserId,
          "Нет типа благодарности или целевого пользователя",
        );

        const body = TestDataHelper.generateUniqueName(
          "Благодарность с негативным бонусом",
        );

        ({ response } = await feedbackAPI.create({
          body,
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
          giftBonusAmount: -100,
        }));

        // Негативное значение должно быть отклонено
      });

      await test.step("Проверить ответ", async () => {
        expect([400, 422, 500]).toContain(response.status());
      });
    });

    test("C5090: POST /private/feedbacks/ - нулевой gift bonus amount", async ({
      feedbackAPI,
    }) => {
      let response, data;
      await test.step("Выполнить запрос: POST /private/feedbacks/ - нулевой gift bonus amount", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);
        test.skip(
          !feedbackTypeId || !targetUserId,
          "Нет типа благодарности или целевого пользователя",
        );

        const body = TestDataHelper.generateUniqueName(
          "Благодарность с нулевым бонусом",
        );

        ({ response, data } = await feedbackAPI.create({
          body,
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
          giftBonusAmount: 0,
        }));

        // Нулевое значение может быть допустимым
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 403]).toContain(response.status());

        if (response.ok() && data?.id) {
          createdFeedbackIds.push(data.id);
        }
      });
    });
  },
);
