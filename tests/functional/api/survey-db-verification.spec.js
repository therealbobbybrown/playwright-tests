// tests/functional/api/survey-db-verification.spec.js
// Примеры тестов с верификацией данных в БД

import { test, expect } from "../../fixtures/full.js";
import { allure } from "allure-playwright";
import { randomUUID } from "crypto";

/**
 * Хелпер для создания страницы с вопросом для тестов
 */
function createTestPage() {
  const now = Date.now();
  const pageId = randomUUID();
  const questionId = randomUUID();

  return [
    {
      id: pageId,
      temporaryId: pageId,
      title: "Тестовая страница",
      description: "",
      position: 1,
      lastChangeTime: now,
      updatedQuestions: [
        {
          id: questionId,
          temporaryId: questionId,
          type: "scale",
          title: "Оцените качество работы",
          description: "",
          isRequired: true,
          allowComment: false,
          allowSkip: false,
          rangeMin: 1,
          rangeMax: 10,
          rangeMinLabel: "Плохо",
          rangeMaxLabel: "Отлично",
          position: 1,
          lastChangeTime: now,
          updatedAnswerOptions: [],
          updatedRedirects: [],
          updatedStepLabels: [],
        },
      ],
    },
  ];
}

/**
 * Примеры тестов с верификацией данных в MySQL
 *
 * Эти тесты демонстрируют как использовать DB верификаторы
 * для проверки данных после API операций.
 *
 * ВАЖНО: Для работы тестов необходимо:
 * 1. Настроить переменные DB_HOST, DB_USER, DB_PASSWORD, DB_NAME в .env
 * 2. Убедиться что БД доступна
 * 3. Структура таблиц должна соответствовать ожидаемой
 */
test.describe(
  "Survey API с верификацией в БД",
  { tag: ["@surveys", "@api", "@verification", "@db"] },
  () => {
    test.beforeEach(() => {
      allure.epic("Surveys");
      allure.feature("Database Verification");
    });

    test("C6882: Создание опроса - данные сохраняются в БД", async ({
      surveyAPI,
      surveyVerifier,
    }) => {
      allure.story("Create Survey");
      allure.severity("critical");

      // Шаг 1: Создаём опрос через API
      const surveyTitle = `E2E_DB_Verification_${Date.now()}`;

      await test.step("Создание опроса через API", async () => {
        // Примечание: используем surveyAPI который уже авторизован
      });

      const { response, data } = await surveyAPI.createDraft({
        title: surveyTitle,
      });

      expect(response.ok(), "API должен вернуть успешный ответ").toBeTruthy();
      const surveyId = data.id;

      // Шаг 2: Верифицируем в БД
      await test.step("Верификация: опрос создан в БД", async () => {
        const dbSurvey = await surveyVerifier.verifySurveyCreated(surveyId);

        // Проверяем что данные корректно сохранены
        expect(dbSurvey.id).toBe(surveyId);
      });

      await test.step("Верификация: статус опроса = draft", async () => {
        await surveyVerifier.verifySurveyStatus(surveyId, "draft");
      });

      // Cleanup
      await surveyAPI.remove(surveyId);
    });

    test(
      "C6883: Запуск опроса - статус меняется в БД",
      { tag: ["@regression"] },
      async ({ surveyAPI, surveyVerifier }) => {
        allure.story("Start Survey");
        allure.severity("normal");

        // Создаём опрос
        const { response: createResp, data: survey } =
          await surveyAPI.createDraft({
            title: `E2E_Status_Test_${Date.now()}`,
          });

        expect(createResp.ok(), "Опрос должен быть создан").toBeTruthy();
        const surveyId = survey.id;

        // Проверяем начальный статус в БД
        await test.step("Начальный статус = draft", async () => {
          await surveyVerifier.verifySurveyStatus(surveyId, "draft");
        });

        // Добавляем вопрос через update (необходимо для запуска)
        await test.step("Добавление вопроса через update()", async () => {
          const receiversQuery = {
            isAll: true,
            isAllDepartments: true,
            isAllGroups: false,
            includeUsersIds: [],
            includeDepartmentsIds: [],
            includeGroupsIds: [],
            excludeUsersIds: [],
            excludeDepartmentsIds: [],
            excludeGroupsIds: [],
          };

          const { response: updateResp } = await surveyAPI.update(surveyId, {
            title: survey.title || `E2E_Status_Test_${Date.now()}`,
            publicityType: "internal",
            receiversQuery,
            updatedPages: createTestPage(),
          });

          expect(
            updateResp.ok(),
            "Опрос должен быть обновлён с вопросом",
          ).toBeTruthy();
        });

        // Запускаем опрос
        const { response: startResp } = await surveyAPI.start(surveyId);
        expect(startResp.ok(), "Опрос должен быть запущен").toBeTruthy();

        // Верифицируем изменение статуса в БД
        await test.step("Статус изменён на active в БД", async () => {
          await surveyVerifier.verifySurveyStatus(surveyId, "active");
        });

        // Cleanup
        await surveyAPI.stop(surveyId);
        await surveyAPI.remove(surveyId);
      },
    );

    test(
      "C6884: Удаление опроса - soft delete в БД",
      { tag: ["@regression"] },
      async ({ surveyAPI, surveyVerifier }) => {
        allure.story("Delete Survey");
        allure.severity("normal");

        // Создаём опрос
        const { data: survey } = await surveyAPI.createDraft({
          title: `E2E_Delete_Test_${Date.now()}`,
        });

        // Убеждаемся что опрос существует
        await surveyVerifier.verifySurveyCreated(survey.id);

        // Удаляем опрос
        const { response } = await surveyAPI.remove(survey.id);
        expect(response.ok()).toBeTruthy();

        // Верифицируем soft delete в БД
        await test.step("Опрос помечен как удалённый (soft delete)", async () => {
          await surveyVerifier.verifySurveyDeleted(survey.id);
        });
      },
    );

    test.skip(
      "Пример: прямой SQL запрос",
      { tag: ["@example"] },
      async ({ db, surveyAPI }) => {
        // Этот тест показывает как использовать прямые SQL запросы
        // Skip по умолчанию - используется как пример

        // Создаём опрос
        const { data: survey } = await surveyAPI.createDraft({
          title: `E2E_SQL_Example_${Date.now()}`,
        });

        // Прямой SQL запрос
        const surveys = await db.query(
          "SELECT id, title, status FROM surveys WHERE id = ?",
          [survey.id],
        );

        expect(surveys.length).toBe(1);
        expect(surveys[0].status).toBe("draft");

        // Использование других методов DatabaseClient
        const exists = await db.exists("surveys", { id: survey.id });
        expect(exists).toBe(true);

        const count = await db.count("surveys", { id: survey.id });
        expect(count).toBe(1);

        const found = await db.findOne("surveys", { id: survey.id });
        expect(found.title).toContain("E2E_SQL_Example");

        // Cleanup
        await surveyAPI.remove(survey.id);
      },
    );
  },
);

test.describe(
  "User Verifier примеры",
  { tag: ["@users", "@verification", "@db"] },
  () => {
    test.skip(
      "Пример: верификация пользователя",
      { tag: ["@example"] },
      async ({ userVerifier }) => {
        // Этот тест показывает как использовать UserVerifier
        // Skip по умолчанию - используется как пример

        // Найти пользователя по email
        const email = process.env.ADMIN_LOGIN;
        const user = await userVerifier.findUserByEmail(email);

        if (user) {
          // Верифицировать что пользователь существует
          await userVerifier.verifyUserExists(user.id);

          // Проверить email
          await userVerifier.verifyUserEmail(user.id, email);

          // Проверить что активен
          await userVerifier.verifyUserActive(user.id);
        }
      },
    );
  },
);

test.describe(
  "Feedback Verifier примеры",
  { tag: ["@feedback", "@verification", "@db"] },
  () => {
    test.skip(
      "Пример: верификация фидбека",
      { tag: ["@example"] },
      async ({ feedbackAPI, feedbackVerifier, userVerifier }) => {
        // Этот тест показывает как использовать FeedbackVerifier
        // Skip по умолчанию - используется как пример

        // Находим получателя
        const recipientEmail = process.env.USER_LOGIN;
        const recipient = await userVerifier.findUserByEmail(recipientEmail);

        if (!recipient) {
          test.skip("Получатель не найден в БД");
          return;
        }

        // Отправляем фидбек через API
        const { response, data } = await feedbackAPI.send({
          recipientId: recipient.id,
          body: "E2E_DB_Test: Отличная работа!",
          type: "praise",
        });

        if (response.ok()) {
          // Верифицируем в БД
          await feedbackVerifier.verifyFeedbackCreated(data.id);
          await feedbackVerifier.verifyFeedbackRecipient(data.id, recipient.id);
          await feedbackVerifier.verifyFeedbackBodyContains(
            data.id,
            "Отличная работа",
          );
        }
      },
    );
  },
);
