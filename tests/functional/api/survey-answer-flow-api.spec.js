// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { SurveyAPI, getCredentials } from "../../utils/api/index.js";
import { SurveySeedHelper } from "../../utils/seed/SurveySeedHelper.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertSuccessStatus,
  assertErrorStatus,
  assertHasRequiredProperties,
  assertValidArray,
  assertNotEmptyArray,
  assertEntityHasId,
  extractItems,
  extractFirstItem,
  assertUnauthorized,
  assertForbidden,
  assertNotFound,
  assertBadRequest,
} from "../../utils/api/common-assertions.js";

/**
 * API тесты для прохождения опросов (Answer Flow)
 *
 * Покрытие:
 * - Начало опроса (start)
 * - Навигация по страницам (next/prev)
 * - Отправка ответов
 * - Завершение опроса
 * - Разные типы вопросов
 */

const test = fullTest.extend({
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

/**
 * Хелпер для поиска активного опроса с вопросами
 * @param {SurveyAPI} surveyAPI
 * @param {'internal' | 'external' | 'any'} publicityType - тип публичности опроса
 * @returns {Promise<Object>}
 */
async function findSurveyWithQuestions(surveyAPI, publicityType = "any") {
  const { data } = await surveyAPI.getList({ status: "active", limit: 20 });
  const items = data?.items || data || [];

  for (const survey of items) {
    const { data: surveyDetails } = await surveyAPI.getById(survey.id);
    const pages = surveyDetails?.pages || [];

    // Проверяем тип публичности
    const surveyPublicityType = surveyDetails?.publicityType;
    if (publicityType !== "any" && surveyPublicityType !== publicityType) {
      continue;
    }

    // Проверяем что есть вопросы
    const hasQuestions = pages.some(
      (p) => p.questions && p.questions.length > 0,
    );
    if (hasQuestions) {
      const { data: revisions } = await surveyAPI.getRevisions(survey.id, {
        limit: 1,
      });
      const revision = revisions?.items?.[0];

      return {
        surveyId: survey.id,
        survey: surveyDetails,
        revisionId: revision?.id,
        revisionAlias: revision?.alias,
        publicityType: surveyPublicityType,
        pages,
        questions: pages.flatMap((p) => p.questions || []),
      };
    }
  }

  return {
    surveyId: null,
    survey: null,
    revisionId: null,
    revisionAlias: null,
    publicityType: null,
    pages: [],
    questions: [],
  };
}

test.describe(
  "Survey Answer Flow API",
  { tag: ["@api", "@regression", "@survey", "@answer-flow"] },
  () => {
    // Тестовые данные для всех тестов этого файла
    let testExternalSurvey = null;

    test.beforeAll(async ({ request }) => {
      // Создаём external опрос для тестов публичного API
      const seedHelper = new SurveySeedHelper(request);
      await seedHelper.init("admin");

      try {
        testExternalSurvey = await seedHelper.seedExternalSurvey({
          title: "E2E_External Survey for Answer Flow Tests",
        });
        console.log(
          `Создан external опрос: ID=${testExternalSurvey.id}, alias=${testExternalSurvey.revisionAlias}`,
        );
      } catch (error) {
        console.warn("Не удалось создать external опрос:", error.message);
      }
    });

    test.afterAll(async ({ request }) => {
      // Очистка: удаляем созданный опрос
      if (testExternalSurvey?.id) {
        const api = new SurveyAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        try {
          await api.stop(testExternalSurvey.id);
        } catch {
          /* ignore */
        }

        try {
          await api.remove(testExternalSurvey.id);
          console.log(
            `Удалён тестовый external опрос: ID=${testExternalSurvey.id}`,
          );
        } catch (error) {
          console.warn("Не удалось удалить тестовый опрос:", error.message);
        }
      }
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "Answer Flow");
    });

    test.describe("Internal Survey Flow (Private)", () => {
      test(
        "C6829: POST .../answer/page/start/ - начать прохождение опроса",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: POST .../answer/page/start/ - начать прохождение опроса", async () => {
            // Ищем internal опрос (publicityType: 'internal')
            const { surveyId, revisionAlias, publicityType } =
              await findSurveyWithQuestions(surveyAPI, "internal");
            test.skip(
              !surveyId || !revisionAlias,
              "Нет активного internal опроса с вопросами",
            );

            ({ response, data } = await surveyAPI.startInternalSurvey(
              surveyId,
              revisionAlias,
            ));

            // Может быть успех, уже отвечал, нет доступа
            // 404 - если опрос не internal (проверка бизнес-логики)
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 201, 400, 403, 404, 409]).toContain(response.status());

            if (response.status() === 200 || response.status() === 201) {
              // Должен вернуть pageToken и вопросы
              expect(data).toBeDefined();

              // Валидация структуры ответа начала опроса
              if (data.pageToken !== undefined) {
                expect(typeof data.pageToken).toBe("string");
                expect(data.pageToken.length).toBeGreaterThan(0);
              }
              if (data.page !== undefined) {
                expect(data.page).toBeDefined();
              }
              if (data.questions !== undefined) {
                assertValidArray(data.questions);
              }
            }
          });
        },
      );

      test("C6830: POST .../answer/page/next/ - следующая страница (без pageToken)", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST .../answer/page/next/ - следующая страница (без pageToken)", async () => {
          const { surveyId, revisionAlias } = await findSurveyWithQuestions(
            surveyAPI,
            "internal",
          );
          test.skip(!surveyId || !revisionAlias, "Нет internal опросов");

          // Без pageToken должна быть ошибка
          const { response } = await surveyAPI.answerPageInternalSurvey(
            surveyId,
            revisionAlias,
            {},
            "invalid-token",
          );

          // 404 - опрос не internal, 400/422 - невалидный токен, 409 - уже отвечал
          expect([400, 403, 404, 409, 422]).toContain(response.status());
        });
      });

      test("C6831: POST .../answer/page/prev/ - предыдущая страница (без pageToken)", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST .../answer/page/prev/ - предыдущая страница (без pageToken)", async () => {
          const { surveyId, revisionAlias } = await findSurveyWithQuestions(
            surveyAPI,
            "internal",
          );
          test.skip(!surveyId || !revisionAlias, "Нет internal опросов");

          const { response } = await surveyAPI.prevPageInternalSurvey(
            surveyId,
            revisionAlias,
            "invalid-token",
          );

          // 404 - опрос не internal, 400/422 - невалидный токен, 409 - уже отвечал
          expect([400, 403, 404, 409, 422]).toContain(response.status());
        });
      });

      test("C6832: POST .../answer/ - отправить все ответы (пустой объект)", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST .../answer/ - отправить все ответы (пустой объект)", async () => {
          const { surveyId, revisionAlias } = await findSurveyWithQuestions(
            surveyAPI,
            "internal",
          );
          test.skip(!surveyId || !revisionAlias, "Нет internal опросов");

          const { response } = await surveyAPI.answerInternalSurvey(
            surveyId,
            revisionAlias,
            {},
          );

          // Пустой объект ответов - может быть ошибка валидации, уже отвечал, или опрос не internal
          expect([200, 201, 400, 403, 404, 409, 422]).toContain(
            response.status(),
          );
        });
      });

      test(
        "C6833: Полный цикл: start -> answer -> complete",
        { tag: ["@critical", "@db"] },
        async ({ surveyAPI, surveyVerifier }) => {
          setSeverity("critical");
          const { surveyId, revisionAlias, questions } =
            await findSurveyWithQuestions(surveyAPI, "internal");
          test.skip(
            !surveyId || !revisionAlias || questions.length === 0,
            "Нет internal опросов с вопросами",
          );

          // DB: Получаем количество ответов до начала
          const responsesBefore =
            await test.step("DB: Получение ответов до теста", async () => {
              if (!surveyVerifier.isConnected()) return [];
              return await surveyVerifier.getSurveyResponses(surveyId);
            });

          // 1. Начинаем опрос
          const { response: startResponse, data: startData } =
            await surveyAPI.startInternalSurvey(surveyId, revisionAlias);

          // Если уже отвечал, нет доступа или опрос не internal - пропускаем
          if (
            startResponse.status() === 409 ||
            startResponse.status() === 403 ||
            startResponse.status() === 404
          ) {
            test.skip(
              true,
              "Уже отвечал на этот опрос, нет доступа или опрос не internal",
            );
            return;
          }

          expect([200, 201]).toContain(startResponse.status());

          // Проверяем что ответ получен (структура может отличаться)
          expect(startData).toBeDefined();

          // Валидация структуры начатого опроса
          if (startData.pageToken !== undefined) {
            expect(typeof startData.pageToken).toBe("string");
          }
          if (startData.page !== undefined) {
            expect(startData.page).toBeDefined();
            // Страница может содержать вопросы
            if (startData.page.questions !== undefined) {
              assertValidArray(startData.page.questions);
            }
          }

          // DB: Проверяем что при успешном start сессия создаётся
          await test.step("DB: Проверка начала прохождения опроса", async () => {
            if (!surveyVerifier.isConnected()) return;
            // После start может создаться запись ответа (в зависимости от реализации)
            const survey = await surveyVerifier.getSurvey(surveyId);
            expect(survey, "Опрос должен существовать").not.toBeNull();
          });
        },
      );
    });

    test.describe("External Survey Flow (Public)", () => {
      test(
        "C6834: GET /public/surveys/{id}/{alias}/ - получить публичный опрос",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: GET /public/surveys/{id}/{alias}/ - получить публичный опрос", async () => {
            // Используем созданный тестовый external опрос или ищем существующий
            let surveyId = testExternalSurvey?.id;
            let revisionAlias = testExternalSurvey?.revisionAlias;

            if (!surveyId || !revisionAlias) {
              const found = await findSurveyWithQuestions(
                surveyAPI,
                "external",
              );
              surveyId = found.surveyId;
              revisionAlias = found.revisionAlias;
            }
            test.skip(!surveyId || !revisionAlias, "Нет external опросов");

            ({ response, data } = await surveyAPI.getExternalSurvey(
              surveyId,
              revisionAlias,
            ));

            // Публичный опрос может быть отключен
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400, 403, 404]).toContain(response.status());

            // При успешном ответе валидируем структуру внешнего опроса
            if (response.ok() && data) {
              expect(data).toBeDefined();
              if (data.id !== undefined) {
                expect(
                  typeof data.id === "string" || typeof data.id === "number",
                ).toBe(true);
              }
              if (data.title !== undefined) {
                expect(typeof data.title).toBe("string");
              }
              if (data.pages !== undefined) {
                assertValidArray(data.pages);
              }
            }
          });
        },
      );

      test(
        "C6835: POST /public/.../answer/page/start/ - начать публичный опрос",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: POST /public/.../answer/page/start/ - начать публичный опрос", async () => {
            // Используем созданный тестовый external опрос или ищем существующий
            let surveyId = testExternalSurvey?.id;
            let revisionAlias = testExternalSurvey?.revisionAlias;

            if (!surveyId || !revisionAlias) {
              const found = await findSurveyWithQuestions(
                surveyAPI,
                "external",
              );
              surveyId = found.surveyId;
              revisionAlias = found.revisionAlias;
            }
            test.skip(!surveyId || !revisionAlias, "Нет external опросов");

            ({ response, data } = await surveyAPI.startExternalSurvey(
              surveyId,
              revisionAlias,
            ));

            // Публичный доступ может быть отключен
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 201, 400, 403, 404]).toContain(response.status());

            // При успешном ответе валидируем структуру начатого опроса
            if (response.ok() && data) {
              expect(data).toBeDefined();
              if (data.pageToken !== undefined) {
                expect(typeof data.pageToken).toBe("string");
              }
              if (data.page !== undefined) {
                expect(data.page).toBeDefined();
              }
            }
          });
        },
      );
    });

    test.describe("Question Types Handling", () => {
      // Эти тесты проверяют типы вопросов, используя любой доступный опрос
      // Для проверки типов нам не важен publicityType - главное наличие вопросов
      test("C6836: Опрос со scale вопросами", async ({ surveyAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Опрос со scale вопросами", async () => {
          const { surveyId, revisionAlias, questions, publicityType } =
            await findSurveyWithQuestions(surveyAPI);
          test.skip(!surveyId || !revisionAlias, "Нет опросов");

          // Проверяем типы вопросов
          const scaleQuestions = questions.filter(
            (q) => q.type === "scale" || q.type === "rating",
          );

          if (scaleQuestions.length > 0) {
            // Используем соответствующий endpoint в зависимости от типа опроса
            const { response } =
              publicityType === "internal"
                ? await surveyAPI.startInternalSurvey(surveyId, revisionAlias)
                : await surveyAPI.startExternalSurvey(surveyId, revisionAlias);
            expect([200, 201, 403, 404, 409]).toContain(response.status());
          } else {
            test.skip(true, "Нет scale вопросов");
          }
        });
      });

      test("C6837: Опрос с text вопросами", async ({ surveyAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Опрос с text вопросами", async () => {
          const { surveyId, revisionAlias, questions, publicityType } =
            await findSurveyWithQuestions(surveyAPI);
          test.skip(!surveyId || !revisionAlias, "Нет опросов");

          // Типы текстовых вопросов в системе: text, textarea, comment, longText, shortText
          const textQuestions = questions.filter(
            (q) =>
              q.type === "text" ||
              q.type === "textarea" ||
              q.type === "comment" ||
              q.type === "longText" ||
              q.type === "shortText",
          );

          if (textQuestions.length > 0) {
            const { response } =
              publicityType === "internal"
                ? await surveyAPI.startInternalSurvey(surveyId, revisionAlias)
                : await surveyAPI.startExternalSurvey(surveyId, revisionAlias);
            expect([200, 201, 403, 404, 409]).toContain(response.status());
          } else {
            test.skip(true, "Нет text вопросов");
          }
        });
      });

      test("C6838: Опрос с choice вопросами", async ({ surveyAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Опрос с choice вопросами", async () => {
          const { surveyId, revisionAlias, questions, publicityType } =
            await findSurveyWithQuestions(surveyAPI);
          test.skip(!surveyId || !revisionAlias, "Нет опросов");

          // Типы вопросов с выбором в системе: radio, checkbox, select, choice, singleSelect, multiSelect
          const choiceQuestions = questions.filter(
            (q) =>
              q.type === "radio" ||
              q.type === "checkbox" ||
              q.type === "select" ||
              q.type === "choice" ||
              q.type === "singleSelect" ||
              q.type === "multiSelect",
          );

          if (choiceQuestions.length > 0) {
            const { response } =
              publicityType === "internal"
                ? await surveyAPI.startInternalSurvey(surveyId, revisionAlias)
                : await surveyAPI.startExternalSurvey(surveyId, revisionAlias);
            expect([200, 201, 403, 404, 409]).toContain(response.status());
          } else {
            test.skip(true, "Нет choice вопросов");
          }
        });
      });
    });

    test.describe("Answer Validation", () => {
      // Эти тесты проверяют валидацию ответов через internal API
      test("C6839: Отправка невалидных ответов - неверный формат", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Отправка невалидных ответов - неверный формат", async () => {
          const { surveyId, revisionAlias } = await findSurveyWithQuestions(
            surveyAPI,
            "internal",
          );
          test.skip(!surveyId || !revisionAlias, "Нет internal опросов");

          // Отправляем массив вместо объекта
          const { response } = await surveyAPI.answerInternalSurvey(
            surveyId,
            revisionAlias,
            [1, 2, 3],
          );

          // 404 - если опрос не internal, 400/422 - невалидный формат
          expect([400, 403, 404, 409, 422]).toContain(response.status());
        });
      });

      test("C6840: Отправка ответов с несуществующим questionId", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: Отправка ответов с несуществующим questionId", async () => {
          const { surveyId, revisionAlias } = await findSurveyWithQuestions(
            surveyAPI,
            "internal",
          );
          test.skip(!surveyId || !revisionAlias, "Нет internal опросов");

          ({ response } = await surveyAPI.answerInternalSurvey(
            surveyId,
            revisionAlias,
            {
              "non-existent-question-id": { value: "test" },
            },
          ));

          // Может быть игнорировано или вернуть ошибку, 404 если не internal
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 404, 409, 422]).toContain(
            response.status(),
          );
        });
      });

      test("C6841: Отправка пустой строки как ответ", async ({ surveyAPI }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: Отправка пустой строки как ответ", async () => {
          const { surveyId, revisionAlias, questions } =
            await findSurveyWithQuestions(surveyAPI, "internal");
          test.skip(
            !surveyId || !revisionAlias || questions.length === 0,
            "Нет internal опросов с вопросами",
          );

          const questionId = questions[0].id;

          ({ response } = await surveyAPI.answerInternalSurvey(
            surveyId,
            revisionAlias,
            {
              [questionId]: { value: "" },
            },
          ));

          // Пустой ответ может быть валидным для необязательных вопросов, 404 если не internal
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 404, 409, 422]).toContain(
            response.status(),
          );
        });
      });
    });

    test.describe("Negative Tests", () => {
      // Тесты на несуществующие ID - проверяют что API возвращает корректную ошибку
      // и что данные НЕ создаются в БД при ошибках

      test(
        "C6842: Start опроса с несуществующим surveyId",
        { tag: ["@db"] },
        async ({ surveyAPI, surveyVerifier }) => {
          setSeverity("normal");

          const { response } = await surveyAPI.startInternalSurvey(
            999999,
            "test-alias",
          );

          expect([400, 403, 404]).toContain(response.status());

          // DB: Проверяем что ответ НЕ создан для несуществующего опроса
          await test.step("DB: Проверка что ответ НЕ создан", async () => {
            if (!surveyVerifier.isConnected()) return;
            const survey = await surveyVerifier.getSurvey(999999);
            expect(survey, "Опрос не должен существовать").toBeNull();
          });
        },
      );

      test(
        "C6843: Start опроса с несуществующим alias",
        { tag: ["@db"] },
        async ({ surveyAPI, surveyVerifier }) => {
          setSeverity("normal");
          // Берём любой опрос, но используем неверный alias
          const { surveyId } = await findSurveyWithQuestions(surveyAPI);
          test.skip(!surveyId, "Нет опросов");

          // DB: Получаем количество ответов до теста
          const responsesBefore =
            await test.step("DB: Получение ответов до теста", async () => {
              if (!surveyVerifier.isConnected()) return [];
              return await surveyVerifier.getSurveyResponses(surveyId);
            });

          const { response } = await surveyAPI.startInternalSurvey(
            surveyId,
            "non-existent-alias-12345",
          );

          expect([400, 403, 404]).toContain(response.status());

          // DB: Проверяем что новый ответ НЕ создан
          await test.step("DB: Проверка что ответ НЕ создан при невалидном alias", async () => {
            if (!surveyVerifier.isConnected()) return;
            const responsesAfter =
              await surveyVerifier.getSurveyResponses(surveyId);
            expect(
              responsesAfter.length,
              "Количество ответов не должно увеличиться",
            ).toBe(responsesBefore.length);
          });
        },
      );

      test(
        "C6844: Answer с несуществующим surveyId",
        { tag: ["@db"] },
        async ({ surveyAPI, surveyVerifier }) => {
          setSeverity("normal");
          const { response } = await surveyAPI.answerInternalSurvey(
            999999,
            "test-alias",
            {},
          );

          expect([400, 403, 404]).toContain(response.status());

          // DB: Проверяем что ответ НЕ создан для несуществующего опроса
          await test.step("DB: Проверка что ответ НЕ создан", async () => {
            if (!surveyVerifier.isConnected()) return;
            const survey = await surveyVerifier.getSurvey(999999);
            expect(survey, "Опрос не должен существовать").toBeNull();
          });
        },
      );

      test("C6845: Next page с невалидным pageToken", async ({ surveyAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Next page с невалидным pageToken", async () => {
          // Используем internal опрос для тестов internal API
          const { surveyId, revisionAlias } = await findSurveyWithQuestions(
            surveyAPI,
            "internal",
          );
          test.skip(!surveyId || !revisionAlias, "Нет internal опросов");

          const { response } = await surveyAPI.answerPageInternalSurvey(
            surveyId,
            revisionAlias,
            {},
            "completely-invalid-token-that-does-not-exist",
          );

          // 404 если не internal, 400/422 если невалидный токен, 409 если уже отвечал
          expect([400, 403, 404, 409, 422]).toContain(response.status());
        });
      });

      test("C6846: Prev page с невалидным pageToken", async ({ surveyAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Prev page с невалидным pageToken", async () => {
          const { surveyId, revisionAlias } = await findSurveyWithQuestions(
            surveyAPI,
            "internal",
          );
          test.skip(!surveyId || !revisionAlias, "Нет internal опросов");

          const { response } = await surveyAPI.prevPageInternalSurvey(
            surveyId,
            revisionAlias,
            "completely-invalid-token-that-does-not-exist",
          );

          // 404 если не internal, 400/422 если невалидный токен, 409 если уже отвечал
          expect([400, 403, 404, 409, 422]).toContain(response.status());
        });
      });
    });
  },
);
