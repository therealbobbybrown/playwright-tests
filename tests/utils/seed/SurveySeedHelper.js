/**
 * Хелпер для создания тестовых данных для модуля Survey
 *
 * Создаёт:
 * - Черновики опросов с вопросами
 * - Активные опросы
 * - Остановленные опросы
 * - Напоминания
 */

import { SurveyAPI, getCredentials } from "../api/index.js";
import { randomUUID } from "crypto";
import { TestDataHelper } from "../TestDataHelper.js";

export class SurveySeedHelper {
  /**
   * @param {import('@playwright/test').APIRequestContext} request
   */
  constructor(request) {
    this.request = request;
    this.surveyAPI = null;
    this.createdIds = {
      surveys: [],
      reminds: [],
    };
  }

  /**
   * Инициализировать API с авторизацией
   * @param {'admin' | 'user' | 'manager'} role
   */
  async init(role = "admin") {
    this.surveyAPI = new SurveyAPI(this.request);
    const { email, password } = getCredentials(role);
    await this.surveyAPI.signIn(email, password);
  }

  /**
   * Создать черновик опроса с базовыми вопросами
   * @param {Object} options
   * @param {string} [options.title] - Название
   * @param {boolean} [options.withQuestions=true] - Добавить вопросы
   * @returns {Promise<{id: string, title: string, revisionId: string, revisionAlias: string}>}
   */
  async seedDraftSurvey(options = {}) {
    if (!this.surveyAPI) {
      throw new Error(
        "SurveySeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const title =
      options.title || TestDataHelper.generateUniqueName("Черновик опроса");

    // Создаём черновик
    const { response, data } = await this.surveyAPI.createDraft({});

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Не удалось создать черновик опроса: ${error}`);
    }

    const surveyId = data.id;
    this.createdIds.surveys.push(surveyId);

    // Обновляем название и добавляем вопросы
    const pages = options.withQuestions !== false ? this.getDefaultPages() : [];

    // receiversQuery - все сотрудники для internal опроса
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

    const { response: updateResp } = await this.surveyAPI.update(surveyId, {
      title,
      description: options.description || "Тестовый опрос для автотестов",
      publicityType: options.publicityType || "internal",
      allowPersonalLink: options.allowPersonalLink ?? true,
      isAnonim: options.isAnonim ?? false,
      receiversQuery,
      updatedPages: pages,
    });

    if (!updateResp.ok()) {
      const errorText = await updateResp.text();
      // Удаляем пустой черновик — нельзя оставлять опрос без title/вопросов
      try {
        await this.surveyAPI.remove(surveyId);
      } catch {}
      this.createdIds.surveys = this.createdIds.surveys.filter(
        (id) => id !== surveyId,
      );
      throw new Error(
        `Не удалось обновить опрос ${surveyId} (title/вопросы): ${errorText}`,
      );
    }

    // Проверяем что вопросы сохранились (если были запрошены)
    if (options.withQuestions !== false) {
      const { data: surveyDetails } = await this.surveyAPI.getById(surveyId);
      if (
        !surveyDetails?.pages?.length ||
        !surveyDetails.pages.some((p) => p.questions?.length > 0)
      ) {
        console.warn(
          "Опрос создан, но вопросы не сохранились. Структура:",
          JSON.stringify(surveyDetails?.pages, null, 2),
        );
      }
    }

    // Получаем ревизию
    const { data: revisions } = await this.surveyAPI.getRevisions(surveyId, {
      limit: 1,
    });
    const revision = revisions?.items?.[0];

    return {
      id: surveyId,
      title,
      revisionId: revision?.id,
      revisionAlias: revision?.alias,
    };
  }

  /**
   * Создать и запустить активный опрос
   * @param {Object} options
   * @returns {Promise<{id: string, title: string, revisionId: string, revisionAlias: string}>}
   */
  async seedActiveSurvey(options = {}) {
    const survey = await this.seedDraftSurvey({
      ...options,
      title:
        options.title || TestDataHelper.generateUniqueName("Активный опрос"),
    });

    // Запускаем опрос
    const { response } = await this.surveyAPI.start(survey.id);

    if (!response.ok()) {
      console.warn("Не удалось запустить опрос:", await response.text());
    } else {
      // После старта получаем ревизию
      const { data: revisions } = await this.surveyAPI.getRevisions(survey.id, {
        limit: 1,
      });
      const revision = revisions?.items?.[0];
      if (revision) {
        survey.revisionId = revision.id;
        survey.revisionAlias = revision.alias;
      }
    }

    return survey;
  }

  /**
   * Создать и запустить внешний (публичный) опрос
   * @param {Object} options
   * @returns {Promise<{id: string, title: string, revisionId: string, revisionAlias: string, publicityType: string}>}
   */
  async seedExternalSurvey(options = {}) {
    const survey = await this.seedDraftSurvey({
      ...options,
      title:
        options.title || TestDataHelper.generateUniqueName("Внешний опрос"),
      publicityType: "external",
      allowPersonalLink: options.allowPersonalLink ?? true,
    });

    // Запускаем опрос
    const { response } = await this.surveyAPI.start(survey.id);

    if (!response.ok()) {
      console.warn(
        "Не удалось запустить внешний опрос:",
        await response.text(),
      );
    } else {
      // После старта получаем ревизию
      const { data: revisions } = await this.surveyAPI.getRevisions(survey.id, {
        limit: 1,
      });
      const revision = revisions?.items?.[0];
      if (revision) {
        survey.revisionId = revision.id;
        survey.revisionAlias = revision.alias;
      }
    }

    survey.publicityType = "external";
    return survey;
  }

  /**
   * Создать остановленный опрос
   * @param {Object} options
   * @returns {Promise<{id: string, title: string, revisionId: string, revisionAlias: string}>}
   */
  async seedStoppedSurvey(options = {}) {
    const survey = await this.seedActiveSurvey({
      ...options,
      title:
        options.title || TestDataHelper.generateUniqueName("Остановленный опрос"),
    });

    // Останавливаем опрос
    const { response } = await this.surveyAPI.stop(survey.id);

    if (!response.ok()) {
      console.warn("Не удалось остановить опрос:", await response.text());
    }

    return survey;
  }

  /**
   * Создать напоминание для опроса
   * @param {string} surveyRevisionId - ID ревизии опроса
   * @param {Object} options
   * @returns {Promise<{id: string}>}
   */
  async seedRemind(surveyRevisionId, options = {}) {
    if (!this.surveyAPI) {
      throw new Error("SurveySeedHelper не инициализирован.");
    }

    // Дата отправки - через 7 дней
    const scheduledAt =
      options.scheduledAt ||
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { response, data } = await this.surveyAPI.createRemind({
      surveyRevisionId,
      title: options.title || "Тестовое напоминание",
      body: options.body || "Не забудьте пройти опрос!",
      scheduledAt,
    });

    if (!response.ok()) {
      console.warn("Не удалось создать напоминание:", await response.text());
      return null;
    }

    this.createdIds.reminds.push(data.id);
    return data;
  }

  /**
   * Создать опрос с персональными кодами (для тестов personal-availability, personal-token)
   * @param {Object} options
   * @returns {Promise<{id: string, title: string, revisionId: string, revisionAlias: string, allowPersonalLink: boolean}>}
   */
  async seedPersonalCodeSurvey(options = {}) {
    const survey = await this.seedDraftSurvey({
      ...options,
      title:
        options.title ||
        TestDataHelper.generateUniqueName("Опрос с персональным кодом"),
      publicityType: "internal", // Персональные коды работают для internal
      allowPersonalLink: true,
    });

    // Запускаем опрос
    const { response } = await this.surveyAPI.start(survey.id);

    if (!response.ok()) {
      console.warn(
        "Не удалось запустить опрос с персональными кодами:",
        await response.text(),
      );
    } else {
      // После старта получаем ревизию
      const { data: revisions } = await this.surveyAPI.getRevisions(survey.id, {
        limit: 1,
      });
      const revision = revisions?.items?.[0];
      if (revision) {
        survey.revisionId = revision.id;
        survey.revisionAlias = revision.alias;
      }
    }

    survey.allowPersonalLink = true;
    return survey;
  }

  /**
   * Создать опрос с групповыми кодами (для тестов department-code, group-code, group-token)
   * @param {Object} options
   * @returns {Promise<{id: string, title: string, revisionId: string, revisionAlias: string, publicityType: string}>}
   */
  async seedGroupCodeSurvey(options = {}) {
    const survey = await this.seedDraftSurvey({
      ...options,
      title:
        options.title || TestDataHelper.generateUniqueName("Group Code Survey"),
      publicityType: "external", // Групповые коды для external опросов
      allowPersonalLink: options.allowPersonalLink ?? false,
    });

    // Запускаем опрос
    const { response } = await this.surveyAPI.start(survey.id);

    if (!response.ok()) {
      console.warn(
        "Не удалось запустить опрос с групповыми кодами:",
        await response.text(),
      );
    } else {
      // После старта получаем ревизию
      const { data: revisions } = await this.surveyAPI.getRevisions(survey.id, {
        limit: 1,
      });
      const revision = revisions?.items?.[0];
      if (revision) {
        survey.revisionId = revision.id;
        survey.revisionAlias = revision.alias;
      }
    }

    survey.publicityType = "external";
    return survey;
  }

  /**
   * Создать опрос с ответами для тестов статистики
   * @param {Object} options
   * @param {number} [options.answersCount=5] - Количество ответов
   * @returns {Promise<{id: string, title: string, revisionId: string, revisionAlias: string, answersCount: number}>}
   */
  async seedSurveyWithAnswers(options = {}) {
    const answersCount = options.answersCount || 5;

    // Создаём и запускаем опрос
    const survey = await this.seedActiveSurvey({
      ...options,
      title:
        options.title ||
        TestDataHelper.generateUniqueName("Опрос с ответами"),
    });

    if (!survey.revisionAlias) {
      console.warn(
        "Опрос не имеет revisionAlias, ответы не могут быть добавлены",
      );
      survey.answersCount = 0;
      return survey;
    }

    // Получаем структуру опроса чтобы узнать questionId
    const { data: surveyDetails } = await this.surveyAPI.getById(survey.id);
    const pages = surveyDetails?.pages || [];
    const questions = pages.flatMap((p) => p.questions || []);

    if (questions.length === 0) {
      console.warn(
        "Опрос не содержит вопросов, ответы не могут быть добавлены",
      );
      survey.answersCount = 0;
      return survey;
    }

    // Добавляем ответы
    let successfulAnswers = 0;

    for (let i = 0; i < answersCount; i++) {
      try {
        // Начинаем прохождение опроса
        const { response: startResp, data: startData } =
          await this.surveyAPI.startInternalSurvey(
            survey.id,
            survey.revisionAlias,
          );

        if (!startResp.ok()) {
          console.warn(
            `Не удалось начать опрос (ответ ${i + 1}):`,
            await startResp.text(),
          );
          continue;
        }

        const pageToken = startData?.pageToken;
        if (!pageToken) {
          console.warn("Не получен pageToken от startInternalSurvey");
          continue;
        }

        // Формируем ответы на все вопросы
        const answers = this.generateAnswersForQuestions(questions, i);

        // Отправляем ответы
        const { response: answerResp } =
          await this.surveyAPI.answerPageInternalSurvey(
            survey.id,
            survey.revisionAlias,
            answers,
            pageToken,
          );

        if (answerResp.ok() || answerResp.status() === 201) {
          successfulAnswers++;
        } else {
          console.warn(
            `Не удалось отправить ответ ${i + 1}:`,
            await answerResp.text(),
          );
        }
      } catch (error) {
        console.warn(`Ошибка при создании ответа ${i + 1}:`, error.message);
      }
    }

    console.log(`  - Добавлено ответов: ${successfulAnswers}/${answersCount}`);
    survey.answersCount = successfulAnswers;
    return survey;
  }

  /**
   * Генерировать ответы для списка вопросов
   * @param {Array} questions - Вопросы из опроса
   * @param {number} seed - Seed для вариации ответов
   * @returns {Object} Ответы в формате API
   */
  generateAnswersForQuestions(questions, seed = 0) {
    const answers = {};

    for (const question of questions) {
      const questionId = question.id;
      const type = question.type;

      switch (type) {
        case "scale":
          // Для scale вопросов генерируем значение от 1 до max
          const min = question.rangeMin || 1;
          const max = question.rangeMax || 10;
          answers[questionId] = {
            value: min + (seed % (max - min + 1)),
          };
          break;

        case "singleSelect":
          // Для single select выбираем один из вариантов
          const options =
            question.answerOptions || question.updatedAnswerOptions || [];
          if (options.length > 0) {
            const optionIndex = seed % options.length;
            answers[questionId] = {
              selectedIds: [options[optionIndex].id],
            };
          }
          break;

        case "multiSelect":
          // Для multi select выбираем 1-2 варианта
          const multiOptions =
            question.answerOptions || question.updatedAnswerOptions || [];
          if (multiOptions.length > 0) {
            const selectedCount = Math.min(1 + (seed % 2), multiOptions.length);
            const selectedIds = multiOptions
              .slice(0, selectedCount)
              .map((o) => o.id);
            answers[questionId] = {
              selectedIds,
            };
          }
          break;

        case "longText":
        case "shortText":
          // Для текстовых вопросов генерируем текст
          const texts = [
            "Хорошая работа команды",
            "Нужно улучшить коммуникацию",
            "Отличные результаты",
            "Есть области для развития",
            "Всё отлично, продолжаем",
          ];
          answers[questionId] = {
            text: texts[seed % texts.length],
          };
          break;

        case "nps":
          // NPS от 0 до 10
          answers[questionId] = {
            value: seed % 11,
          };
          break;

        default:
          // Для неизвестных типов пропускаем
          console.warn(`Неизвестный тип вопроса: ${type}`);
      }
    }

    return answers;
  }

  /**
   * Создать полный набор тестовых данных для Survey модуля
   * @returns {Promise<{
   *   draftSurvey: Object,
   *   activeSurvey: Object,
   *   externalSurvey: Object,
   *   personalCodeSurvey: Object,
   *   groupCodeSurvey: Object,
   *   stoppedSurvey: Object,
   *   surveyWithAnswers: Object,
   *   remind: Object
   * }>}
   */
  async seedAll() {
    console.log("Создание тестовых данных для Survey модуля...");

    // Черновик
    console.log("  - Создание черновика опроса...");
    const draftSurvey = await this.seedDraftSurvey();

    // Активный внутренний опрос
    console.log("  - Создание активного внутреннего опроса...");
    const activeSurvey = await this.seedActiveSurvey();

    // Активный внешний (публичный) опрос
    console.log("  - Создание активного внешнего опроса...");
    const externalSurvey = await this.seedExternalSurvey();

    // Опрос с персональными кодами
    console.log("  - Создание опроса с персональными кодами...");
    const personalCodeSurvey = await this.seedPersonalCodeSurvey();

    // Опрос с групповыми кодами
    console.log("  - Создание опроса с групповыми кодами...");
    const groupCodeSurvey = await this.seedGroupCodeSurvey();

    // Остановленный опрос
    console.log("  - Создание остановленного опроса...");
    const stoppedSurvey = await this.seedStoppedSurvey();

    // Опрос с ответами для статистики
    console.log("  - Создание опроса с ответами для статистики...");
    const surveyWithAnswers = await this.seedSurveyWithAnswers({
      answersCount: 5,
    });

    // Напоминание для активного опроса
    let remind = null;
    if (activeSurvey.revisionId) {
      console.log("  - Создание напоминания...");
      remind = await this.seedRemind(activeSurvey.revisionId);
    }

    console.log("Тестовые данные созданы:");
    console.log(`  - Черновик: ${draftSurvey.id}`);
    console.log(`  - Активный (internal): ${activeSurvey.id}`);
    console.log(`  - Активный (external): ${externalSurvey.id}`);
    console.log(
      `  - С персональными кодами: ${personalCodeSurvey.id} (revision: ${personalCodeSurvey.revisionAlias || "н/д"})`,
    );
    console.log(
      `  - С групповыми кодами: ${groupCodeSurvey.id} (revision: ${groupCodeSurvey.revisionAlias || "н/д"})`,
    );
    console.log(`  - Остановленный: ${stoppedSurvey.id}`);
    console.log(
      `  - С ответами: ${surveyWithAnswers.id} (ответов: ${surveyWithAnswers.answersCount})`,
    );
    console.log(`  - Напоминание: ${remind?.id || "не создано"}`);

    return {
      draftSurvey,
      activeSurvey,
      externalSurvey,
      personalCodeSurvey,
      groupCodeSurvey,
      stoppedSurvey,
      surveyWithAnswers,
      remind,
    };
  }

  /**
   * Получить страницы с вопросами по умолчанию
   * API требует temporaryId как UUID, lastChangeTime для отслеживания изменений,
   * и updatedQuestions вместо questions
   */
  getDefaultPages() {
    const now = Date.now();
    const pageId = randomUUID();

    // Вопрос типа scale (шкала)
    const scaleQuestionId = randomUUID();
    const scaleQuestion = {
      id: scaleQuestionId,
      temporaryId: scaleQuestionId,
      type: "scale",
      title: "Оцените общую удовлетворённость работой",
      description: "",
      isRequired: true,
      allowComment: false,
      allowSkip: false,
      allowCustom: false,
      disallowStepNumbers: false,
      rangeMin: 1,
      rangeMax: 10,
      rangeMinLabel: "Очень плохо",
      rangeMaxLabel: "Отлично",
      position: 1,
      lastChangeTime: now,
      updatedAnswerOptions: [],
      updatedRedirects: [],
      updatedStepLabels: [],
    };

    // Вопрос типа longText (текст)
    const textQuestionId = randomUUID();
    const textQuestion = {
      id: textQuestionId,
      temporaryId: textQuestionId,
      type: "longText",
      title: "Что бы вы улучшили в работе компании?",
      description: "",
      isRequired: false,
      allowComment: false,
      allowSkip: false,
      allowCustom: false,
      disallowStepNumbers: false,
      position: 2,
      lastChangeTime: now,
      updatedAnswerOptions: [],
      updatedRedirects: [],
      updatedStepLabels: [],
    };

    // Вопрос типа singleSelect (выбор одного варианта)
    const selectQuestionId = randomUUID();
    const selectQuestion = {
      id: selectQuestionId,
      temporaryId: selectQuestionId,
      type: "singleSelect",
      title: "Как часто вы получаете обратную связь?",
      description: "",
      isRequired: true,
      allowComment: false,
      allowSkip: false,
      allowCustom: false,
      disallowStepNumbers: false,
      position: 3,
      lastChangeTime: now,
      updatedAnswerOptions: [
        {
          id: randomUUID(),
          temporaryId: randomUUID(),
          text: "Ежедневно",
          position: 1,
          lastChangeTime: now,
        },
        {
          id: randomUUID(),
          temporaryId: randomUUID(),
          text: "Еженедельно",
          position: 2,
          lastChangeTime: now,
        },
        {
          id: randomUUID(),
          temporaryId: randomUUID(),
          text: "Ежемесячно",
          position: 3,
          lastChangeTime: now,
        },
        {
          id: randomUUID(),
          temporaryId: randomUUID(),
          text: "Редко",
          position: 4,
          lastChangeTime: now,
        },
        {
          id: randomUUID(),
          temporaryId: randomUUID(),
          text: "Никогда",
          position: 5,
          lastChangeTime: now,
        },
      ],
      updatedRedirects: [],
      updatedStepLabels: [],
    };

    return [
      {
        id: pageId,
        temporaryId: pageId,
        title: "Страница 1",
        description: "",
        position: 1,
        lastChangeTime: now,
        updatedQuestions: [scaleQuestion, textQuestion, selectQuestion],
      },
    ];
  }

  /**
   * Очистить все созданные тестовые данные
   */
  async cleanup() {
    if (!this.surveyAPI) {
      console.warn("SurveySeedHelper: не инициализирован, очистка пропущена");
      return;
    }

    console.log("Очистка тестовых данных Survey...");

    // Удаляем напоминания
    for (const id of this.createdIds.reminds) {
      try {
        await this.surveyAPI.removeRemind(id);
        console.log(`  - Напоминание ${id} удалено`);
      } catch (error) {
        console.warn(`  - Не удалось удалить напоминание ${id}`);
      }
    }

    // Удаляем опросы
    for (const id of this.createdIds.surveys) {
      try {
        await this.surveyAPI.remove(id);
        console.log(`  - Опрос ${id} удалён`);
      } catch (error) {
        console.warn(`  - Не удалось удалить опрос ${id}`);
      }
    }

    // Очищаем массивы
    this.createdIds = {
      surveys: [],
      reminds: [],
    };

    console.log("Очистка завершена");
  }

  /**
   * Проверить существующие данные
   * @returns {Promise<{hasData: boolean, counts: Object}>}
   */
  async checkExistingData() {
    if (!this.surveyAPI) {
      throw new Error("SurveySeedHelper не инициализирован.");
    }

    const { data: active } = await this.surveyAPI.getList({
      status: "active",
      limit: 1,
    });
    const { data: draft } = await this.surveyAPI.getList({
      status: "draft",
      limit: 1,
    });
    const { data: stopped } = await this.surveyAPI.getList({
      status: "stopped",
      limit: 1,
    });

    const activeCount = active?.items?.length || active?.length || 0;
    const draftCount = draft?.items?.length || draft?.length || 0;
    const stoppedCount = stopped?.items?.length || stopped?.length || 0;

    return {
      hasData: activeCount > 0 && draftCount > 0,
      counts: {
        active: activeCount,
        draft: draftCount,
        stopped: stoppedCount,
      },
    };
  }
}
