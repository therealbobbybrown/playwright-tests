// tests/utils/seed/CalibrationSeed.js
/**
 * Seed данные для тестирования калибровки Performance Review
 *
 * Создаёт полноценный PR с заполненными анкетами для тестирования калибровки.
 *
 * ## Использование через CLI:
 *
 * ```bash
 * # Базовый PR с 3 направлениями, 3 оцениваемыми, 2 циклами
 * node scripts/seed-calibration-data.js --directions=self,head,colleague --target-users=3 --receivers=2 --cycles=1
 *
 * # Только самооценка, 4 оцениваемых, 4 цикла
 * node scripts/seed-calibration-data.js --directions=self --target-users=4 --cycles=3
 *
 * # С кастомным направлением "Ментор"
 * node scripts/seed-calibration-data.js --directions=self,head,custom:Ментор --target-users=3 --receivers=2
 *
 * # Без автозаполнения анкет
 * node scripts/seed-calibration-data.js --directions=self,head --no-fill
 * ```
 *
 * ## Параметры CLI:
 *
 * | Параметр | Описание | По умолчанию |
 * |----------|----------|--------------|
 * | --directions | Направления: self, head, subordinate, colleague, custom:Name | все 4 |
 * | --target-users | Количество оцениваемых | 3 |
 * | --receivers | Респондентов на направление (для colleague/subordinate/custom) | 2 |
 * | --cycles | Дополнительные циклы оценки (итого будет cycles+1 ревизий) | 0 |
 * | --no-fill | Не заполнять анкеты автоматически | false |
 * | --check | Проверить существующие данные | - |
 * | --cleanup | Очистить созданные данные | - |
 *
 * ## Что создаётся:
 *
 * 1. **Группы компетенций** (2 группы с суффиксом _Test)
 * 2. **Компетенции** (6 шт, по 3 в каждой группе)
 * 3. **Анкета** с вопросами:
 *    - Шкальные вопросы (scale) привязанные к компетенциям
 *    - Вопрос с выбором варианта (singleSelect)
 * 4. **Performance Review** с настроенными направлениями
 * 5. **Target users** (оцениваемые) с иерархией
 * 6. **Receiver users** (респонденты) для каждого направления
 * 7. **Заполненные анкеты** через populateReview API
 * 8. **Дополнительные циклы** (ревизии) если указано
 *
 * ## Особенности заполнения анкет:
 *
 * - Используется API `populateReview` которое заполняет от имени всех респондентов
 * - Вызывается многократно пока не вернёт 500 (все анкеты заполнены)
 * - Таймаут увеличен до 2 минут для медленных запросов
 * - Для анонимных направлений (colleague, subordinate, custom) минимум 2 респондента
 *
 * ## Программное использование:
 *
 * ```javascript
 * import { CalibrationSeed } from './tests/utils/seed/CalibrationSeed.js';
 * import { request } from '@playwright/test';
 *
 * const ctx = await request.newContext({ baseURL: 'https://api.example.com' });
 * const seed = new CalibrationSeed(ctx);
 * await seed.init();
 *
 * const result = await seed.seedWithDirections({
 *   directions: { self: true, head: true, colleague: true },
 *   targetUsersCount: 3,
 *   receiversPerDirection: 2,
 *   fillQuestionnaires: true,
 * });
 *
 * // Добавить циклы оценки
 * await seed.runRevisionCycles(result.prId, 2); // +2 цикла
 * ```
 */

import { randomUUID } from "crypto";
import { request as playwrightRequest } from "@playwright/test";
import { CompetenciesAPI } from "../api/CompetenciesAPI.js";
import { AssessmentsAPI } from "../api/AssessmentsAPI.js";
import { PerformanceReviewAPI } from "../api/PerformanceReviewAPI.js";
import { getCredentials, getTestUserPassword } from "../api/index.js";

/**
 * Seed helper для подготовки данных калибровки Performance Review
 */
export class CalibrationSeed {
  constructor(request) {
    this.request = request;
    this.competenciesAPI = null;
    this.assessmentsAPI = null;
    this.prAPI = null;

    // Созданные сущности для cleanup
    this.createdData = {
      competenceGroups: [],
      competencies: [],
      assessmentId: null,
      prId: null,
    };
  }

  /**
   * Инициализация API клиентов
   */
  async init() {
    const { email, password } = getCredentials("admin");

    // Один signIn через PerformanceReviewAPI, затем share токена.
    // CompetenciesAPI.signIn использует тот же /auth/account/signin,
    // но может таймаутить — избегаем повторных вызовов.
    // Retry: до 3 попыток с увеличенным timeout (стенд может быть нагружен).
    this.prAPI = new PerformanceReviewAPI(this.request);
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { response, data } = await this.prAPI.signIn(email, password, {
          timeout: 90_000,
        });
        if (!response.ok()) {
          throw new Error(
            `CalibrationSeed.init: auth failed (status ${response.status()})`,
          );
        }
        const token = data?.accessToken;
        this.competenciesAPI = new CompetenciesAPI(this.request, token);
        this.assessmentsAPI = new AssessmentsAPI(this.request, token);
        return this;
      } catch (e) {
        lastError = e;
        console.warn(
          `[CalibrationSeed.init] attempt ${attempt}/3 failed: ${e.message}`,
        );
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 3000 * attempt));
        }
      }
    }
    throw lastError;
  }

  /**
   * Создать группы компетенций
   * Сначала ищет ранее созданные (по паттерну _Test), если нет - создаёт новые
   */
  async createCompetenceGroups() {
    const groupNames = [
      {
        title: "Профессиональные навыки_Test",
        searchPattern: "Профессиональные навыки_Test",
      },
      { title: "Soft Skills_Test", searchPattern: "Soft Skills_Test" },
    ];

    // Получаем существующие группы (limit=500 — в БД может быть много групп)
    const { data: existingGroupsData } =
      await this.competenciesAPI.getCompetenceGroups({ limit: 500 });
    const existingGroups =
      existingGroupsData?.items ||
      (Array.isArray(existingGroupsData) ? existingGroupsData : []);

    const createdGroups = [];

    for (const group of groupNames) {
      // Ищем ранее созданную группу по паттерну
      const existing = existingGroups.find(
        (g) => g.title === group.searchPattern,
      );

      if (existing) {
        createdGroups.push(existing);
        console.log(
          `✓ Группа "${existing.title}" найдена (ID: ${existing.id})`,
        );
        continue;
      }

      // Создаём новую
      try {
        const { response, data } =
          await this.competenciesAPI.createCompetenceGroup(group.title);

        if (response.ok()) {
          createdGroups.push(data);
          this.createdData.competenceGroups.push(data.id);
          console.log(`✓ Группа "${group.title}" создана (ID: ${data.id})`);
        } else if (response.status() === 404) {
          console.log(`⚠️ API групп компетенций недоступен (404), пропускаем`);
          break;
        } else {
          const errorText = await response.text();
          console.log(
            `⚠️ Не удалось создать группу "${group.title}": ${response.status()} - ${errorText}`,
          );
        }
      } catch (e) {
        console.log(`⚠️ Ошибка создания группы "${group.title}": ${e.message}`);
      }
    }

    return createdGroups;
  }

  /**
   * Создать компетенции в группах
   * Сначала ищет ранее созданные (по паттерну _Test), если нет - создаёт новые
   */
  async createCompetencies(groups) {
    const hasGroups = groups && groups.length >= 2;

    // Получаем существующие компетенции
    const { data: existingCompsData } =
      await this.competenciesAPI.getCompetencies();
    const existingComps =
      existingCompsData?.items ||
      (Array.isArray(existingCompsData) ? existingCompsData : []);

    // Компетенции с паттерном _Test
    const competenciesData = [
      // Профессиональные навыки (группа 0)
      {
        title: "Планирование_Test",
        description: "Умение планировать задачи",
        emoji: "📋",
        groupId: hasGroups ? groups[0]?.id : null,
      },
      {
        title: "Качество работы_Test",
        description: "Внимание к деталям",
        emoji: "✨",
        groupId: hasGroups ? groups[0]?.id : null,
      },
      {
        title: "Результативность_Test",
        description: "Достижение целей",
        emoji: "🎯",
        groupId: hasGroups ? groups[0]?.id : null,
      },
      // Soft Skills (группа 1)
      {
        title: "Коммуникация_Test",
        description: "Взаимодействие с коллегами",
        emoji: "💬",
        groupId: hasGroups ? groups[1]?.id : null,
      },
      {
        title: "Командная работа_Test",
        description: "Работа в команде",
        emoji: "🤝",
        groupId: hasGroups ? groups[1]?.id : null,
      },
      {
        title: "Лидерство_Test",
        description: "Лидерские качества",
        emoji: "👑",
        groupId: hasGroups ? groups[1]?.id : null,
      },
    ];

    const createdCompetencies = [];

    for (const comp of competenciesData) {
      // Ищем ранее созданную компетенцию по названию
      const existing = existingComps.find((c) => c.title === comp.title);

      if (existing) {
        createdCompetencies.push(existing);
        console.log(
          `✓ Компетенция "${existing.title}" найдена (ID: ${existing.id})`,
        );
        continue;
      }

      // Создаём новую
      try {
        const { response, data } =
          await this.competenciesAPI.createCompetency(comp);

        if (response.ok()) {
          createdCompetencies.push(data);
          this.createdData.competencies.push(data.id);
          const groupInfo = comp.groupId ? ` → группа ${comp.groupId}` : "";
          console.log(
            `✓ Компетенция "${comp.title}" создана (ID: ${data.id})${groupInfo}`,
          );
        } else {
          const errorText = await response.text();
          console.log(
            `⚠️ Не удалось создать компетенцию "${comp.title}": ${response.status()} - ${errorText}`,
          );
        }
      } catch (e) {
        console.log(
          `⚠️ Ошибка создания компетенции "${comp.title}": ${e.message}`,
        );
      }
    }

    return createdCompetencies;
  }

  /**
   * Найти или создать анкету с компетенциями
   * Сначала ищет анкету с паттерном "Calibration_Assessment_Test", если нет - создаёт новую
   *
   * Анкета содержит:
   * - Шкальные вопросы (scale) со шкалой 1-5, привязанные к компетенциям
   * - Вопрос с выбором одного варианта (singleSelect) с 3 вариантами ответа
   */
  async createAssessmentWithCompetencies(competencies) {
    const ASSESSMENT_PATTERN = "Calibration_Assessment_Test";

    // Ищем существующую анкету по паттерну
    try {
      const { data: assessmentsData } =
        await this.assessmentsAPI.getAssessments({
          q: ASSESSMENT_PATTERN,
          limit: 50,
        });
      const assessments = assessmentsData?.items || [];

      // Ищем анкету с точным названием (название в questionnaire.title)
      const existingAssessment = assessments.find(
        (a) => a.questionnaire?.title === ASSESSMENT_PATTERN,
      );

      if (existingAssessment) {
        console.log(
          `✓ Анкета "${ASSESSMENT_PATTERN}" найдена (ID: ${existingAssessment.id})`,
        );
        this.createdData.assessmentId = existingAssessment.id;
        return existingAssessment.id;
      }
    } catch (e) {
      console.log(`⚠️ Ошибка поиска анкеты: ${e.message}`);
    }

    // Создаём новую анкету
    console.log(`  Создание новой анкеты "${ASSESSMENT_PATTERN}"...`);

    const { response: createResp, data: assessment } =
      await this.assessmentsAPI.createAssessment();

    if (!createResp.ok()) {
      const errorText = await createResp.text();
      throw new Error(`Не удалось создать анкету: ${errorText}`);
    }

    const assessmentId = assessment.id;
    this.createdData.assessmentId = assessmentId;

    const now = Date.now();
    const pageId = randomUUID();

    // Формируем вопросы с привязкой к компетенциям
    // Для новых записей: id не передаём (или null), temporaryId - UUID
    // Формат из рабочего UI запроса
    const scaleQuestions = competencies.map((comp, index) => {
      const questionTempId = randomUUID();

      // Создаём step labels для шкалы 1-5
      // Для новых: не передаём id, только temporaryId
      const stepLabels = [
        {
          temporaryId: randomUUID(),
          text: "Значительно ниже ожиданий",
          position: 1,
        },
        { temporaryId: randomUUID(), text: "Ниже ожиданий", position: 2 },
        {
          temporaryId: randomUUID(),
          text: "Соответствует ожиданиям",
          position: 3,
        },
        { temporaryId: randomUUID(), text: "Выше ожиданий", position: 4 },
        {
          temporaryId: randomUUID(),
          text: "Значительно выше ожиданий",
          position: 5,
        },
      ];

      return {
        temporaryId: questionTempId,
        type: "scale",
        title: `Оцените ${comp.title.toLowerCase()} сотрудника`,
        description: null,
        isRequired: true,
        allowComment: false,
        allowSkip: false,
        allowCustom: false,
        disallowStepNumbers: false,
        competenceId: comp.id,
        competenceIndicatorQuestionId: null,
        widget: "slider",
        rangeMin: 1,
        rangeMax: 5,
        rangeMinLabel: "Низко",
        rangeMaxLabel: "Высоко",
        position: index + 1,
        commentHeader: null,
        isCommentRequired: false,
        commentRequiredFrom: null,
        commentRequiredTo: null,
        universalTitle: null,
        selectionLimit: null,
        updatedAnswerOptions: [],
        updatedRedirects: [],
        updatedStepLabels: stepLabels,
      };
    });

    // Добавляем вопрос типа singleSelect (выбор одного из списка)
    const singleSelectQuestionId = randomUUID();
    const singleSelectQuestion = {
      temporaryId: singleSelectQuestionId,
      type: "singleSelect",
      title: "Как бы вы оценили потенциал роста сотрудника?",
      description: "",
      isRequired: true,
      allowComment: false,
      allowSkip: false,
      allowCustom: false,
      disallowStepNumbers: false,
      position: scaleQuestions.length + 1,
      lastChangeTime: now,
      updatedAnswerOptions: [
        {
          temporaryId: randomUUID(),
          text: "Высокий потенциал",
          position: 1,
          lastChangeTime: now,
        },
        {
          temporaryId: randomUUID(),
          text: "Средний потенциал",
          position: 2,
          lastChangeTime: now,
        },
        {
          temporaryId: randomUUID(),
          text: "Низкий потенциал",
          position: 3,
          lastChangeTime: now,
        },
      ],
      updatedRedirects: [],
      updatedStepLabels: [],
    };

    const updatedQuestions = [...scaleQuestions, singleSelectQuestion];

    // Обновляем анкету с вопросами
    // Формат из рабочего UI запроса
    const assessmentData = {
      title: ASSESSMENT_PATTERN,
      description: "Анкета с компетенциями для тестов калибровки",
      theme: {
        id: 1,
        type: "color",
        mediaId: 1,
        media: { id: 1, color: "#8dd8bf" },
      },
      themeSettings: {},
      updatedPages: [
        {
          temporaryId: pageId,
          title: "Оценка компетенций",
          description: "",
          position: 1,
          updatedQuestions: updatedQuestions,
        },
      ],
      updatedArchivedQuestions: [],
    };

    const { response: updateResp } = await this.assessmentsAPI.updateAssessment(
      assessmentId,
      assessmentData,
    );

    if (updateResp.ok()) {
      console.log(
        `✓ Анкета "${ASSESSMENT_PATTERN}" создана (ID: ${assessmentId}, вопросов: ${updatedQuestions.length})`,
      );
    } else {
      const errorText = await updateResp.text();
      console.log(
        `⚠️ Ошибка обновления анкеты: ${updateResp.status()} - ${errorText}`,
      );
    }

    return assessmentId;
  }

  /**
   * Создать Performance Review с анкетой
   */
  async createPerformanceReview(assessmentId) {
    // Формат directions как в UI - все 4 направления (иначе баг 500)
    const directions = [
      {
        id: null,
        receiverType: "self",
        isSelected: true,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "head",
        isSelected: true,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "subordinate",
        isSelected: true,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "colleague",
        isSelected: true,
        title: null,
        description: null,
      },
    ];

    const prPayload = {
      title: `E2E_Калибровка ревью_${Date.now()}`,
      directions,
      anonymityType: "notAnonymous",
      workflowType: "basic",
      notificationsSchedule: {
        enableReminds: false,
        baseDate: new Date().toISOString(),
        repeatType: "everyWorkDay",
        timezoneOffset: new Date().getTimezoneOffset(),
      },
      isApprovalStep: false,
      isAsyncSteps: false,
      isAsyncStepsSelfResponseStep: false,
      minReceiversCount: 1,
      maxReceiversCount: 10,
    };

    const { response, data } = await this.prAPI.create(prPayload);

    if (response.ok()) {
      this.createdData.prId = data.id;
      console.log(`✓ Performance Review создан (ID: ${data.id})`);

      // Добавить анкету к PR для всех направлений
      if (assessmentId) {
        await this.addAssessmentToPR(data.id, assessmentId);
      }

      return data.id;
    } else {
      const errorText = await response.text();
      throw new Error(
        `Не удалось создать PR: ${response.status()} - ${errorText}`,
      );
    }
  }

  /**
   * Добавить анкету к PR для всех направлений
   */
  async addAssessmentToPR(prId, assessmentId) {
    // Получаем направления PR чтобы узнать их ID
    const { data: prData } = await this.prAPI.getById(prId);
    const directions = prData?.directions || [];

    for (const direction of directions) {
      if (direction.isSelected && direction.id) {
        try {
          const { response } = await this.prAPI.setAssessments(prId, {
            directionId: direction.id,
            assessmentsIds: [assessmentId],
          });
          if (response.ok()) {
            console.log(
              `✓ Анкета добавлена для направления "${direction.receiverType}"`,
            );
          } else {
            console.log(
              `⚠️ Ошибка добавления анкеты для "${direction.receiverType}": ${response.status()}`,
            );
          }
        } catch (e) {
          console.log(
            `⚠️ Ошибка добавления анкеты для "${direction.receiverType}": ${e.message}`,
          );
        }
      }
    }
  }

  /**
   * Получить список доступных активных пользователей
   * @param {number} limit - Максимальное количество
   */
  async getAvailableUsers(limit = 50) {
    try {
      const { data } = await this.prAPI.get(
        `/manager/users/?limit=${limit}&category=active`,
      );
      return data?.items || data || [];
    } catch (e) {
      console.log(`⚠️ Не удалось получить пользователей: ${e.message}`);
      return [];
    }
  }

  /**
   * Проверить, есть ли у пользователя реальный руководитель
   * (не сам себе и не null)
   */
  hasRealManager(user) {
    const headId = user.headUser?.id || user.headUserId;
    return headId && headId !== user.id;
  }

  /**
   * Добавить target users в PR
   * Динамически выбирает пользователей:
   * - Пытается найти одного без руководителя (контрольная группа)
   * - Остальных с разными руководителями
   *
   * @param {string} prId - ID Performance Review
   * @param {number} count - Количество target users
   * @returns {Promise<{targetUsers: Array, allUsers: Array, targetUserIds: Array, controlGroupUserId: number|null}>}
   */
  async addTargetUsers(prId, count = 3) {
    const users = await this.getAvailableUsers();
    if (users.length === 0) {
      console.log("⚠️ Нет доступных пользователей");
      return {
        targetUsers: [],
        allUsers: [],
        targetUserIds: [],
        controlGroupUserId: null,
      };
    }

    // Разделяем пользователей на имеющих реального руководителя и без
    const usersWithHead = users.filter((u) => this.hasRealManager(u));
    const usersWithoutHead = users.filter((u) => !this.hasRealManager(u));

    console.log(`  Активных пользователей: ${users.length}`);
    console.log(`  С руководителем: ${usersWithHead.length}`);
    console.log(`  Без руководителя: ${usersWithoutHead.length}`);

    // Выбираем target users
    const selectedUsers = [];
    let controlGroupUserId = null;

    // 1. Берём одного без руководителя (контрольная группа)
    if (usersWithoutHead.length > 0) {
      const controlUser = usersWithoutHead[0];
      selectedUsers.push(controlUser);
      controlGroupUserId = controlUser.id;
      console.log(
        `  ✓ Контрольная группа: ${controlUser.firstName} ${controlUser.lastName} (ID: ${controlUser.id})`,
      );
    }

    // 2. Добираем остальных с руководителями
    for (const user of usersWithHead) {
      if (selectedUsers.length >= count) break;
      // Не добавляем дубликаты
      if (!selectedUsers.find((u) => u.id === user.id)) {
        selectedUsers.push(user);
      }
    }

    // 3. Если не хватает - берём любых оставшихся
    for (const user of users) {
      if (selectedUsers.length >= count) break;
      if (!selectedUsers.find((u) => u.id === user.id)) {
        selectedUsers.push(user);
      }
    }

    if (selectedUsers.length < count) {
      console.log(
        `⚠️ Найдено только ${selectedUsers.length} из ${count} пользователей`,
      );
    }

    const targetUserIds = selectedUsers.map((u) => u.id);
    const targets = targetUserIds.map((userId) => ({
      targetType: "user",
      entityId: userId,
    }));

    const { response, data } = await this.prAPI.addTargetUsers(prId, {
      targets,
    });

    if (response.ok()) {
      console.log(`✓ Добавлено ${targetUserIds.length} target users:`);

      for (const user of selectedUsers) {
        const isControl = user.id === controlGroupUserId;
        const hasHead = this.hasRealManager(user);
        const icon = isControl ? "❌" : hasHead ? "👤" : "⚠️";
        const status = isControl
          ? "КОНТРОЛЬНАЯ ГРУППА"
          : hasHead
            ? `руководитель: ${user.headUser?.lastName || user.headUserId}`
            : "без руководителя";
        console.log(
          `    ${icon} ${user.firstName} ${user.lastName} (ID: ${user.id}) - ${status}`,
        );
      }

      const returnedItems = data?.items || data || [];
      const targetUsers =
        returnedItems.length > 0
          ? returnedItems
          : selectedUsers.map((u) => ({ userId: u.id, id: u.id, user: u }));

      return {
        targetUsers,
        allUsers: users,
        targetUserIds,
        selectedUsers,
        controlGroupUserId,
      };
    } else {
      console.log(`⚠️ Ошибка добавления target users: ${response.status()}`);
      return {
        targetUsers: [],
        allUsers: users,
        targetUserIds: [],
        controlGroupUserId: null,
      };
    }
  }

  /**
   * Назначить подчинённых и коллег для target users
   * ВАЖНО: пулы подчинённых и коллег НЕ должны пересекаться!
   *
   * @param {string} prId - ID PR
   * @param {Array} targetUsers - Target users
   * @param {Array} allUsers - Все доступные пользователи
   */
  async assignSubordinatesAndColleagues(prId, targetUsers, allUsers) {
    const { data: prData } = await this.prAPI.getById(prId);
    const directions = prData?.directions || [];

    const subordinateDirection = directions.find(
      (d) => d.receiverType === "subordinate",
    );
    const colleagueDirection = directions.find(
      (d) => d.receiverType === "colleague",
    );

    if (!subordinateDirection?.id || !colleagueDirection?.id) {
      console.log("⚠️ Не найдены направления subordinate/colleague");
      return;
    }

    const targetUserIds = targetUsers.map((tu) => tu.userId || tu.id);

    // Пул доступных пользователей (исключаем target users)
    const availablePool = allUsers.filter((u) => !targetUserIds.includes(u.id));

    // ВАЖНО: Разделяем пул на две непересекающиеся части
    // Первые 3 - коллеги (одинаковые для всех)
    // Остальные - подчинённые (по 2 на каждого target user)
    const colleagueCount = 3;
    const colleaguePool = availablePool.slice(0, colleagueCount);
    const subordinatePool = availablePool.slice(colleagueCount);

    console.log(`  Пул коллег: ${colleaguePool.length} человек`);
    console.log(`  Пул подчинённых: ${subordinatePool.length} человек`);

    // 1. Назначаем коллег (первые 3 из пула)
    const colleagueIds = colleaguePool.map((u) => u.id);

    for (const targetUser of targetUsers) {
      const targetUserId = targetUser.userId || targetUser.id;
      const userName = targetUser.user
        ? `${targetUser.user.firstName} ${targetUser.user.lastName}`
        : `User ${targetUserId}`;

      if (colleagueIds.length > 0) {
        try {
          const { response } = await this.prAPI.updateReceivers(
            prId,
            targetUserId,
            {
              directionId: colleagueDirection.id,
              usersIds: colleagueIds,
            },
          );
          if (response.ok()) {
            console.log(`  ✓ ${userName}: ${colleagueIds.length} коллег`);
          } else {
            console.log(`  ⚠️ Коллеги для ${userName}: ${response.status()}`);
          }
        } catch (e) {
          console.log(`  ⚠️ Коллеги для ${userName}: ${e.message}`);
        }
      }
    }

    // 2. Назначаем подчинённых (из оставшейся части пула)
    let poolIndex = 0;

    for (const targetUser of targetUsers) {
      const targetUserId = targetUser.userId || targetUser.id;
      const userName = targetUser.user
        ? `${targetUser.user.firstName} ${targetUser.user.lastName}`
        : `User ${targetUserId}`;

      // Берём 2 подчинённых
      const subordinateIds = [];
      for (let i = 0; i < 2; i++) {
        if (poolIndex < subordinatePool.length) {
          subordinateIds.push(subordinatePool[poolIndex].id);
          poolIndex++;
        }
      }

      // Если пул закончился - берём с начала (но не повторяем уже взятых)
      if (subordinateIds.length < 2 && subordinatePool.length >= 2) {
        poolIndex = 0;
        while (
          subordinateIds.length < 2 &&
          poolIndex < subordinatePool.length
        ) {
          const id = subordinatePool[poolIndex].id;
          if (!subordinateIds.includes(id)) {
            subordinateIds.push(id);
          }
          poolIndex++;
        }
      }

      if (subordinateIds.length < 2) {
        console.log(`  ⚠️ Недостаточно подчинённых для ${userName}`);
        continue;
      }

      try {
        const { response } = await this.prAPI.updateReceivers(
          prId,
          targetUserId,
          {
            directionId: subordinateDirection.id,
            usersIds: subordinateIds,
          },
        );
        if (response.ok()) {
          console.log(`  ✓ ${userName}: ${subordinateIds.length} подчинённых`);
        } else {
          console.log(`  ⚠️ Подчинённые для ${userName}: ${response.status()}`);
        }
      } catch (e) {
        console.log(`  ⚠️ Подчинённые для ${userName}: ${e.message}`);
      }
    }
  }

  /**
   * @deprecated Use assignSubordinatesAndColleagues instead
   */
  async assignSubordinates(prId, targetUsers, allUsers) {
    // Оставлено для обратной совместимости
    console.log(
      "⚠️ assignSubordinates deprecated, используйте assignSubordinatesAndColleagues",
    );
  }

  /**
   * @deprecated Use assignSubordinatesAndColleagues instead
   */
  async assignColleagues(prId, targetUsers, allUsers) {
    // Оставлено для обратной совместимости
    console.log(
      "⚠️ assignColleagues deprecated, используйте assignSubordinatesAndColleagues",
    );
  }

  /**
   * Запустить Performance Review
   */
  async startPR(prId) {
    // Валидируем перед запуском
    const { data: validation } = await this.prAPI.validate(prId);
    if (validation?.errors && validation.errors.length > 0) {
      console.log(
        `⚠️ Ошибки валидации PR: ${JSON.stringify(validation.errors)}`,
      );
    }

    // Retry при 500 — параллельный запуск PR с общими target users вызывает server error
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const { response } = await this.prAPI.start(prId);
      if (response.ok()) {
        console.log(`✓ Performance Review запущен`);
        const { data: revision } = await this.prAPI.getLastRevision(prId);
        return revision;
      }
      const errorText = await response.text();
      if (attempt < maxRetries && response.status() >= 500) {
        const delay = attempt * 2000;
        console.log(
          `⚠️ Ошибка запуска PR (попытка ${attempt}/${maxRetries}): ${response.status()} - ${errorText}. Ретрай через ${delay}мс...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.log(
          `⚠️ Ошибка запуска PR: ${response.status()} - ${errorText}`,
        );
        return null;
      }
    }
    return null;
  }

  /**
   * Остановить Performance Review (завершить текущую ревизию)
   * @param {string} prId - ID Performance Review
   * @returns {Promise<boolean>} - успешность операции
   */
  async stopPR(prId) {
    const { response } = await this.prAPI.stop(prId);
    if (response.ok()) {
      console.log(`✓ Performance Review остановлен`);
      return true;
    } else {
      const errorText = await response.text();
      console.log(
        `⚠️ Ошибка остановки PR: ${response.status()} - ${errorText}`,
      );
      return false;
    }
  }

  /**
   * Перезапустить Performance Review (создаёт новую ревизию)
   * @param {string} prId - ID Performance Review
   * @returns {Promise<Object|null>} - новая ревизия или null
   */
  async restartPR(prId) {
    // start создаёт новую ревизию
    const { response } = await this.prAPI.start(prId);
    if (response.ok()) {
      console.log(`✓ Performance Review перезапущен (новая ревизия)`);

      const { data: revision } = await this.prAPI.getLastRevision(prId);
      return revision;
    } else {
      const errorText = await response.text();
      console.log(
        `⚠️ Ошибка перезапуска PR: ${response.status()} - ${errorText}`,
      );
      return null;
    }
  }

  /**
   * Запустить цикл оценки: заполнить → остановить → перезапустить
   * @param {string} prId - ID Performance Review
   * @param {number} cyclesCount - количество дополнительных циклов
   * @param {Array} [competencies] - компетенции (для заполнения)
   */
  async runRevisionCycles(prId, cyclesCount = 1, competencies = []) {
    console.log(`\n🔄 Запуск ${cyclesCount} дополнительных циклов оценки...\n`);

    for (let cycle = 1; cycle <= cyclesCount; cycle++) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  📊 Цикл ${cycle} из ${cyclesCount}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // 1. Остановить текущую ревизию
      console.log("\n  1️⃣ Остановка текущей ревизии...");
      const stopped = await this.stopPR(prId);
      if (!stopped) {
        console.log(`  ⚠️ Не удалось остановить PR, прерываем цикл`);
        break;
      }

      // Небольшая пауза между операциями
      await this.sleep(500);

      // 2. Перезапустить PR (создаёт новую ревизию)
      console.log("\n  2️⃣ Перезапуск (создание новой ревизии)...");
      const newRevision = await this.restartPR(prId);
      if (!newRevision) {
        console.log(`  ⚠️ Не удалось перезапустить PR, прерываем цикл`);
        break;
      }
      console.log(`     Новая ревизия ID: ${newRevision.id}`);

      // 3. Заполнить анкеты для новой ревизии через populateReview
      console.log("\n  3️⃣ Заполнение анкет...");
      await this.fillAllDirectionsQuestionnaires(
        prId,
        newRevision,
        competencies,
      );

      // 4. Проверяем результат
      const { data: counts } = await this.prAPI.getUsersCounts(prId);
      const { data: revisions } = await this.prAPI.getRevisions(prId);
      const revisionsCount = revisions?.items?.length || revisions?.length || 0;

      console.log(`\n  ✅ Цикл ${cycle} завершён:`);
      console.log(`     Всего ревизий: ${revisionsCount}`);
      console.log(`     Target users: ${counts?.targetUsersCount || "N/A"}`);
      console.log(`     Receivers: ${counts?.receiversCount || "N/A"}`);
    }

    // Итоговая информация о ревизиях
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  📋 Итого по ревизиям:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const { data: allRevisions } = await this.prAPI.getRevisions(prId);
    const revisionsList = allRevisions?.items || [];

    for (const rev of revisionsList) {
      const status = rev.isStopped ? "⏹️ Остановлена" : "▶️ Активна";
      const stoppedDate = rev.stoppedAt
        ? new Date(rev.stoppedAt).toLocaleDateString("ru-RU")
        : "";
      console.log(`     ${status} ID: ${rev.id} ${stoppedDate}`);
    }

    return revisionsList;
  }

  /**
   * Утилита для задержки
   * @private
   */
  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Отправить ответ на PR анкету
   * @param {string} prId - ID PR
   * @param {string} revisionAlias - Алиас ревизии
   * @param {string} revisionUserId - ID пользователя ревизии (receiver)
   * @param {Object} answers - Ответы на вопросы
   */
  async submitPRAnswer(prId, revisionAlias, revisionUserId, answers) {
    try {
      const { response } = await this.prAPI.post(
        `/private/performance-reviews/${prId}/${revisionAlias}/${revisionUserId}/answer`,
        { answers, isCompleted: true },
      );
      return response.ok();
    } catch (e) {
      console.log(`⚠️ Ошибка отправки ответа: ${e.message}`);
      return false;
    }
  }

  /**
   * Сгенерировать случайные оценки для компетенций
   * @param {Array} questions - Вопросы анкеты
   */
  generateRandomScores(questions) {
    const answers = {};
    for (const q of questions) {
      // Генерируем случайную оценку 1-5
      const score = Math.floor(Math.random() * 5) + 1;
      answers[q.id] = { value: score };
    }
    return answers;
  }

  /**
   * Получить revision users для PR
   * @param {string} prId - ID PR
   * @param {string} revisionAlias - Алиас ревизии
   */
  async getRevisionUsers(prId, revisionAlias) {
    try {
      const { data } = await this.prAPI.get(
        `/private/performance-reviews/${prId}/${revisionAlias}/revision-users`,
      );
      return data?.items || data || [];
    } catch (e) {
      console.log(`⚠️ Ошибка получения revision users: ${e.message}`);
      return [];
    }
  }

  /**
   * Получить вопросы анкеты для заполнения
   * @param {string} prId - ID PR
   * @param {string} revisionAlias - Алиас ревизии
   * @param {string} revisionUserId - ID пользователя ревизии
   */
  async getQuestionsToAnswer(prId, revisionAlias, revisionUserId) {
    try {
      // Получаем стартовую страницу, которая содержит вопросы
      const { data } = await this.prAPI.get(
        `/private/performance-reviews/${prId}/${revisionAlias}/${revisionUserId}/answer/page/start`,
      );
      return data?.questions || data?.assessment?.pages?.[0]?.questions || [];
    } catch (e) {
      console.log(`⚠️ Ошибка получения вопросов: ${e.message}`);
      return [];
    }
  }

  /**
   * Заполнить анкеты для всех направлений через populateReview API
   * ВАЖНО: populateReview создаёт response records И заполняет их.
   * Вызываем несколько раз чтобы гарантировать заполнение всех анкет.
   *
   * @param {string} prId - ID PR
   * @param {Object} revision - Ревизия PR
   * @param {Array} competencies - Компетенции (не используется, но оставлен для совместимости)
   */
  async fillAllDirectionsQuestionnaires(prId, revision, competencies) {
    if (!revision) {
      console.log("⚠️ Нет ревизии для заполнения анкет");
      return;
    }

    console.log(`\n📝 Заполнение анкет через populateReview API...`);

    const settings = {
      skipChance: 0, // Не пропускать вопросы
      commentChance: 0, // Не добавлять комментарии
      customChance: 0, // Не использовать кастомные ответы
      lowerLimit: 60, // Минимум 60% (оценка 3 из 5)
      upperLimit: 100, // Максимум 100% (оценка 5 из 5)
    };

    // Увеличенный таймаут для populateReview (API может быть медленным)
    const populateOptions = { timeout: 120000 }; // 2 минуты

    // Вызываем populateReview до тех пор, пока не вернёт 500 (все анкеты заполнены)
    const maxAttempts = 25;
    let filledCount = 0;
    let consecutiveErrors = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { response } = await this.prAPI.populateReview(
          prId,
          settings,
          populateOptions,
        );

        if (response.ok()) {
          filledCount++;
          consecutiveErrors = 0;
          console.log(`  ✓ populateReview #${filledCount}`);
          // Минимальная пауза между вызовами
          await this.sleep(100);
        } else if (response.status() === 500) {
          // 500 может означать "все заполнены" или реальную ошибку
          const body500 = await response.text().catch(() => "");
          if (filledCount === 0) {
            console.log(
              `  ⚠️ 500 на первом же вызове (0 заполнено): ${body500.substring(0, 200)}`,
            );
            // Не ломаемся — пробуем ещё (может быть transient error)
            consecutiveErrors++;
            if (consecutiveErrors >= 3) {
              console.log(`  ⚠️ 500 × 3 подряд, останавливаемся`);
              break;
            }
            await this.sleep(1000);
            continue;
          }
          console.log(`  ✓ Все анкеты заполнены (${filledCount} вызовов)`);
          break;
        } else {
          consecutiveErrors++;
          console.log(`  ⚠️ Ошибка ${response.status()}`);
          if (consecutiveErrors >= 3) {
            console.log(`  ⚠️ Слишком много ошибок подряд, останавливаемся`);
            break;
          }
        }
      } catch (e) {
        // Таймаут - не критично, API медленный, продолжаем
        if (e.message.includes("Timeout")) {
          console.log(`  ⏳ Таймаут, продолжаем...`);
        } else {
          consecutiveErrors++;
          console.log(`  ⚠️ ${e.message.substring(0, 50)}`);
          if (consecutiveErrors >= 3) break;
        }
      }
    }

    console.log(`  ✓ Заполнение завершено`);
  }

  /**
   * Ручное заполнение анкет (fallback если populateReview не работает)
   */
  async fillQuestionnairesManually(prId, revision, competencies) {
    const revisionAlias = revision.alias || String(revision.id);
    const revisionUsers = await this.getRevisionUsers(prId, revisionAlias);

    if (revisionUsers.length === 0) {
      console.log("⚠️ Нет revision users для ручного заполнения");
      return;
    }

    console.log(
      `  Ручное заполнение для ${revisionUsers.length} revision users...`,
    );
    let successCount = 0;

    for (const revUser of revisionUsers) {
      const revisionUserId = revUser.id || revUser.revisionUserId;
      const directionType =
        revUser.direction?.receiverType || revUser.directionType || "unknown";

      try {
        const questions = await this.getQuestionsToAnswer(
          prId,
          revisionAlias,
          revisionUserId,
        );
        const answers = this.generateAnswersForQuestions(questions);

        const success = await this.submitPRAnswer(
          prId,
          revisionAlias,
          revisionUserId,
          answers,
        );
        if (success) {
          console.log(`    ✓ ${directionType}: ответ отправлен`);
          successCount++;
        }
      } catch (e) {
        console.log(`    ⚠️ ${directionType}: ${e.message}`);
      }
    }

    console.log(`  Итого: ${successCount}/${revisionUsers.length}`);
  }

  /**
   * Заполнить анкеты от имени каждого респондента
   * Авторизуется по очереди от каждого пользователя и заполняет его анкеты
   * ВАЖНО: Создаёт НОВЫЙ request context для каждого пользователя!
   *
   * @param {string} prId - ID Performance Review
   * @param {string} [testPassword] - Пароль для тестовых аккаунтов (из TEST_USER_PASSWORD в .env)
   */
  async fillQuestionnairesAsReceivers(
    prId,
    testPassword = getTestUserPassword(),
  ) {
    console.log("\n📝 Заполнение анкет от имени каждого респондента...");

    // Получаем revision
    const { data: revision } = await this.prAPI.getLastRevision(prId);
    if (!revision) {
      console.log("⚠️ Не найдена ревизия PR");
      return;
    }
    const revisionAlias = revision.alias || String(revision.id);

    // Получаем список receiver users с email
    const { data: receiversData } = await this.prAPI.getReceiverUsers(prId, {
      limit: 100,
    });
    const receivers = receiversData?.items || [];

    if (receivers.length === 0) {
      console.log("⚠️ Нет респондентов для заполнения");
      return;
    }

    console.log(`  Найдено ${receivers.length} респондентов`);

    // Собираем уникальные email пользователей
    const userEmails = new Map();
    for (const receiver of receivers) {
      const email = receiver.user?.account?.email;
      const userName =
        `${receiver.user?.firstName || ""} ${receiver.user?.lastName || ""}`.trim();
      if (email && !userEmails.has(email)) {
        userEmails.set(email, userName);
      }
    }

    console.log(`  Уникальных пользователей: ${userEmails.size}`);

    // Получаем baseURL из текущего контекста или используем default
    const baseURL = process.env.API_BASE_URL;

    let totalFilled = 0;
    let totalErrors = 0;

    // Заполняем анкеты для каждого пользователя
    for (const [email, userName] of userEmails) {
      process.stdout.write(`  ${userName}: `);

      // ВАЖНО: Создаём НОВЫЙ request context для каждого пользователя!
      let userCtx;
      try {
        userCtx = await playwrightRequest.newContext({
          baseURL,
          timeout: 60000,
        });
      } catch (e) {
        console.log(`⚠️ Не удалось создать контекст: ${e.message}`);
        totalErrors++;
        continue;
      }

      try {
        const userAPI = new PerformanceReviewAPI(userCtx);

        // Авторизуемся под этим пользователем
        const { response: authResp } = await userAPI.signIn(
          email,
          testPassword,
        );
        if (!authResp.ok()) {
          console.log(`⚠️ Auth failed: ${authResp.status()}`);
          totalErrors++;
          await userCtx.dispose();
          continue;
        }

        // Получаем revision users для этого пользователя
        const { data, response } = await userAPI.get(
          `/private/performance-reviews/${prId}/${revisionAlias}/revision-users`,
        );

        if (!response.ok()) {
          console.log(`⚠️ Get revision-users: ${response.status()}`);
          totalErrors++;
          await userCtx.dispose();
          continue;
        }

        const items = data?.items || data || [];
        if (!Array.isArray(items) || items.length === 0) {
          console.log("нет анкет");
          await userCtx.dispose();
          continue;
        }

        let filled = 0;
        let skipped = 0;

        for (const item of items) {
          const revisionUserId = item.id;
          const status = item.response?.status;

          // Пропускаем уже заполненные
          if (status === "complete") {
            skipped++;
            continue;
          }

          try {
            // Получаем вопросы (GET /answer/page/start)
            const { data: pageData, response: pageResp } = await userAPI.get(
              `/private/performance-reviews/${prId}/${revisionAlias}/${revisionUserId}/answer/page/start`,
            );

            if (!pageResp.ok()) {
              continue;
            }

            const questions =
              pageData?.questions ||
              pageData?.assessment?.pages?.[0]?.questions ||
              [];
            if (questions.length === 0) {
              continue;
            }

            // Генерируем ответы
            const answers = this.generateAnswersForQuestions(questions);

            // Отправляем ответы (POST /answer)
            const { response: answerResp } = await userAPI.post(
              `/private/performance-reviews/${prId}/${revisionAlias}/${revisionUserId}/answer`,
              { answers, isCompleted: true },
            );

            if (answerResp.ok()) {
              filled++;
            }
          } catch (e) {
            // Пропускаем ошибки отдельных анкет
          }
        }

        if (filled > 0) {
          console.log(`✓ заполнено ${filled}/${items.length}`);
          totalFilled += filled;
        } else if (skipped > 0) {
          console.log(`- все ${skipped} уже заполнены`);
        } else {
          console.log("- нет анкет для заполнения");
        }

        await userCtx.dispose();
      } catch (e) {
        console.log(`⚠️ Ошибка: ${e.message}`);
        totalErrors++;
        if (userCtx) await userCtx.dispose();
      }
    }

    console.log(`\n  Итого заполнено: ${totalFilled}, ошибок: ${totalErrors}`);
  }

  /**
   * Получить revision users для авторизованного пользователя
   * @private
   */
  async getRevisionUsersForUser(userAPI, prId, revisionAlias) {
    try {
      const { data } = await userAPI.get(
        `/private/performance-reviews/${prId}/${revisionAlias}/revision-users`,
      );
      return data?.items || data || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Получить вопросы для ответа на анкету
   * GET /answer/page/start возвращает структуру анкеты с вопросами
   * @private
   * @returns {{ questions: Array }}
   */
  async getQuestionsForAnswering(userAPI, prId, revisionAlias, revisionUserId) {
    try {
      // ВАЖНО: Для Performance Review используем GET, не POST!
      // POST создаёт сессию с токеном, но для PR API нужен просто GET для получения вопросов
      const { response, data } = await userAPI.get(
        `/private/performance-reviews/${prId}/${revisionAlias}/${revisionUserId}/answer/page/start`,
      );

      if (!response.ok()) {
        return { questions: [] };
      }

      // Вопросы могут быть в разных местах структуры
      const questions =
        data?.questions || data?.assessment?.pages?.[0]?.questions || [];

      return { questions };
    } catch (e) {
      return { questions: [] };
    }
  }

  /**
   * Отправить ответы на анкету Performance Review
   * POST /answer с телом { answers, isCompleted: true }
   * ВАЖНО: Для PR API используется /answer, НЕ /answer/page/next!
   * @private
   */
  async submitAnswersForUser(
    userAPI,
    prId,
    revisionAlias,
    revisionUserId,
    answers,
  ) {
    try {
      const { response } = await userAPI.post(
        `/private/performance-reviews/${prId}/${revisionAlias}/${revisionUserId}/answer`,
        { answers, isCompleted: true },
      );
      return response.ok();
    } catch (e) {
      return false;
    }
  }

  /**
   * @deprecated Use getQuestionsForAnswering instead
   * @private
   */
  async getQuestionsForUser(userAPI, prId, revisionAlias, revisionUserId) {
    const { questions } = await this.getQuestionsForAnswering(
      userAPI,
      prId,
      revisionAlias,
      revisionUserId,
    );
    return questions;
  }

  /**
   * @deprecated Use submitAnswersForUser instead
   * @private
   */
  async submitAnswerAsUser(
    userAPI,
    prId,
    revisionAlias,
    revisionUserId,
    answers,
  ) {
    return this.submitAnswersForUser(
      userAPI,
      prId,
      revisionAlias,
      revisionUserId,
      answers,
    );
  }

  /**
   * @deprecated Use getQuestionsForAnswering instead
   * @private
   */
  async startAnswerSession(userAPI, prId, revisionAlias, revisionUserId) {
    const { questions } = await this.getQuestionsForAnswering(
      userAPI,
      prId,
      revisionAlias,
      revisionUserId,
    );
    return { questions, pageToken: null, isLast: true };
  }

  /**
   * Генерировать ответы для разных типов вопросов
   * @param {Array} questions - Массив вопросов
   * @returns {Object} Объект с ответами
   */
  generateAnswersForQuestions(questions) {
    const answers = {};

    for (const q of questions) {
      const questionId = q.id || q.temporaryId;
      const questionType = q.type;

      switch (questionType) {
        case "scale":
          // Шкальный вопрос - случайная оценка 3-5
          const score = Math.floor(Math.random() * 3) + 3;
          answers[questionId] = { value: score };
          break;

        case "singleSelect":
          // Выбор одного варианта - выбираем случайный из доступных
          const options = q.answerOptions || q.updatedAnswerOptions || [];
          if (options.length > 0) {
            const randomIndex = Math.floor(Math.random() * options.length);
            const selectedOption = options[randomIndex];
            answers[questionId] = { selectedIds: [selectedOption.id] };
          }
          break;

        case "multiSelect":
          // Множественный выбор - выбираем 1-2 варианта
          const multiOptions = q.answerOptions || q.updatedAnswerOptions || [];
          if (multiOptions.length > 0) {
            const count = Math.min(
              1 + Math.floor(Math.random() * 2),
              multiOptions.length,
            );
            const selectedIds = multiOptions.slice(0, count).map((o) => o.id);
            answers[questionId] = { selectedIds };
          }
          break;

        case "longText":
        case "shortText":
          // Текстовый вопрос
          answers[questionId] = {
            value: "Тестовый ответ для автоматического заполнения",
          };
          break;

        default:
          // По умолчанию пробуем числовое значение
          answers[questionId] = { value: 3 };
      }
    }

    return answers;
  }

  /**
   * Откалибровать итоговую оценку числом
   * Использует тот же endpoint что и калибровка компетенций, с полем meanOverwrite
   *
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} revisionId - ID ревизии
   * @param {string|number} targetUserId - ID оцениваемого
   * @param {number} value - Значение итоговой оценки (raw score, напр. 4.2)
   * @param {boolean} [isLocked=false] - Заблокировать изменение руководителем
   * @returns {Promise<{response: Object, data: Object}>}
   */
  async calibrateTotalScore(
    prId,
    revisionId,
    targetUserId,
    value,
    isLocked = false,
  ) {
    // 1. Получить текущие данные калибровки (нужны текущие overwrites компетенций)
    const { data: currentData } = await this.prAPI.getResponseOverwritesData(
      prId,
      revisionId,
      targetUserId,
    );

    // 2. Собрать текущие значения компетенций (передаём без изменений)
    const overwrites = (currentData?.responsesData || []).map((rd) => ({
      responseId: rd.responseId,
      questionId: rd.questionId,
      answer: rd.numericAnswer,
    }));

    // 3. POST с meanOverwrite
    const payload = {
      overwrites,
      meanOverwrite: { value, characteristicId: null },
      isLocked,
    };

    const result = await this.prAPI.overwriteResponsesValues(
      prId,
      revisionId,
      targetUserId,
      payload,
    );

    if (result.response.ok()) {
      console.log(
        `✓ Итоговая оценка откалибрована: user ${targetUserId} = ${value}`,
      );
    } else {
      console.log(`⚠️ Ошибка калибровки итоговой: ${result.response.status()}`);
    }

    return result;
  }

  /**
   * Откалибровать итоговую оценку через дропдаун характеристик
   *
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} revisionId - ID ревизии
   * @param {string|number} targetUserId - ID оцениваемого
   * @param {number} characteristicId - ID характеристики (из API settings)
   * @param {boolean} [isLocked=false] - Заблокировать изменение руководителем
   * @returns {Promise<{response: Object, data: Object}>}
   */
  async calibrateTotalCharacteristic(
    prId,
    revisionId,
    targetUserId,
    characteristicId,
    isLocked = false,
  ) {
    // 1. Получить текущие данные
    const { data: currentData } = await this.prAPI.getResponseOverwritesData(
      prId,
      revisionId,
      targetUserId,
    );

    // 2. Собрать текущие значения компетенций
    const overwrites = (currentData?.responsesData || []).map((rd) => ({
      responseId: rd.responseId,
      questionId: rd.questionId,
      answer: rd.numericAnswer,
    }));

    // 3. POST с meanOverwrite (dropdown mode)
    const payload = {
      overwrites,
      meanOverwrite: { value: null, characteristicId },
      isLocked,
    };

    const result = await this.prAPI.overwriteResponsesValues(
      prId,
      revisionId,
      targetUserId,
      payload,
    );

    if (result.response.ok()) {
      console.log(
        `✓ Характеристика итоговой откалибрована: user ${targetUserId} = characteristicId ${characteristicId}`,
      );
    } else {
      console.log(
        `⚠️ Ошибка калибровки характеристики: ${result.response.status()}`,
      );
    }

    return result;
  }

  /**
   * Полный seed: создать все данные для калибровки
   */
  async seedAll() {
    console.log("\n📦 Создание seed данных для калибровки...\n");

    await this.init();

    // 1. Группы компетенций
    const groups = await this.createCompetenceGroups();

    // 2. Компетенции
    const competencies = await this.createCompetencies(groups);

    // 3. Анкета с компетенциями
    const assessmentId =
      await this.createAssessmentWithCompetencies(competencies);

    // 4. Performance Review
    const prId = await this.createPerformanceReview(assessmentId);

    console.log("\n✅ Seed данные созданы:");
    console.log(`   PR ID: ${prId}`);
    console.log(`   Assessment ID: ${assessmentId}`);
    console.log(`   Компетенций: ${competencies.length}`);
    console.log(`   Групп: ${groups.length}`);

    return {
      prId,
      assessmentId,
      competencies,
      groups,
    };
  }

  /**
   * Полный seed с активным PR и заполненными анкетами
   * Создаёт всё необходимое для тестирования калибровки
   *
   * Структура данных:
   * - 3 target users (один без руководителя - контрольная группа)
   * - Минимум 2 подчинённых у каждого target user
   * - 3 коллеги у каждого target user
   * - Все анкеты заполнены по всем 4 направлениям (self, head, subordinate, colleague)
   */
  async seedFullCalibration() {
    console.log("\n📦 Создание полного набора данных для калибровки...\n");

    await this.init();

    // 1. Группы компетенций
    console.log("1️⃣ Создание групп компетенций...");
    const groups = await this.createCompetenceGroups();

    // 2. Компетенции
    console.log("\n2️⃣ Создание компетенций...");
    const competencies = await this.createCompetencies(groups);

    // 3. Анкета с компетенциями
    console.log("\n3️⃣ Создание анкеты с компетенциями...");
    const assessmentId =
      await this.createAssessmentWithCompetencies(competencies);

    // 4. Performance Review
    console.log("\n4️⃣ Создание Performance Review...");
    const prId = await this.createPerformanceReview(assessmentId);

    // 5. Добавляем target users (один без руководителя для контрольной группы)
    console.log("\n5️⃣ Добавление target users...");
    const { targetUsers, allUsers } = await this.addTargetUsers(prId, 3);

    if (targetUsers.length === 0 || allUsers.length === 0) {
      console.log("⚠️ Не удалось добавить target users");
      return { prId, assessmentId, error: "No target users" };
    }

    // 6-7. Назначаем подчинённых и коллег (без пересечения пулов)
    console.log("\n6️⃣-7️⃣ Назначение подчинённых и коллег...");
    await this.assignSubordinatesAndColleagues(prId, targetUsers, allUsers);

    // 8. Запускаем PR
    console.log("\n8️⃣ Запуск Performance Review...");
    const revision = await this.startPR(prId);

    // 9. Заполняем все анкеты через populateReview
    if (revision) {
      console.log("\n9️⃣ Заполнение всех анкет...");
      await this.fillAllDirectionsQuestionnaires(prId, revision, competencies);
    }

    // 10. Финальная проверка
    console.log("\n🔟 Финальная проверка...");
    const { data: counts } = await this.prAPI.getUsersCounts(prId);

    console.log("\n" + "=".repeat(60));
    console.log("✅ ПОЛНЫЙ НАБОР ДАННЫХ ДЛЯ КАЛИБРОВКИ СОЗДАН");
    console.log("=".repeat(60));
    console.log(`   PR ID: ${prId}`);
    console.log(`   Assessment ID: ${assessmentId}`);
    console.log(`   Revision: ${revision?.id || "не создана"}`);
    console.log(
      `   Target users: ${counts?.targetUsersCount || targetUsers.length}`,
    );
    console.log(`   Receivers: ${counts?.receiversCount || "N/A"}`);
    console.log(`   Компетенций: ${competencies.length}`);
    console.log("");
    console.log("   📊 Для доступа к калибровке:");
    console.log(
      `   URL: /ru/manager/performance-reviews/${prId}/?feature=statisticsSettings`,
    );
    console.log("=".repeat(60));

    return {
      prId,
      assessmentId,
      revisionId: revision?.id,
      competencies,
      groups,
      targetUsers,
    };
  }

  /**
   * Создать PR с настраиваемыми направлениями
   *
   * @param {Object} options - Настройки
   * @param {Object} options.directions - Конфигурация направлений
   * @param {boolean} [options.directions.self=true] - Самооценка
   * @param {boolean} [options.directions.head=true] - Руководитель
   * @param {boolean} [options.directions.subordinate=false] - Подчинённые
   * @param {boolean} [options.directions.colleague=false] - Коллеги
   * @param {Array<string>} [options.directions.custom=[]] - Кастомные направления (до 4 шт), массив названий
   * @param {number} [options.targetUsersCount=3] - Количество target users
   * @param {number} [options.receiversPerDirection=2] - Количество сотрудников на направление (кроме self/head)
   * @param {boolean} [options.fillQuestionnaires=true] - Заполнять ли анкеты
   *
   * @example
   * // Только самооценка и руководитель
   * await seed.seedWithDirections({ directions: { self: true, head: true } });
   *
   * @example
   * // Все стандартные направления
   * await seed.seedWithDirections({
   *   directions: { self: true, head: true, subordinate: true, colleague: true }
   * });
   *
   * @example
   * // С кастомными направлениями
   * await seed.seedWithDirections({
   *   directions: {
   *     self: true,
   *     head: false,
   *     custom: ['Ментор', 'Заказчик', 'HR BP']
   *   }
   * });
   */
  async seedWithDirections(options = {}) {
    const {
      directions: dirConfig = {},
      targetUsersCount = 3,
      receiversPerDirection = 2,
      fillQuestionnaires = true,
    } = options;

    // Настройки направлений по умолчанию
    const directionsConfig = {
      self: dirConfig.self ?? true,
      head: dirConfig.head ?? true,
      subordinate: dirConfig.subordinate ?? false,
      colleague: dirConfig.colleague ?? false,
      custom: dirConfig.custom || [], // Массив названий кастомных направлений
    };

    // Валидация кастомных направлений (макс 4)
    if (directionsConfig.custom.length > 4) {
      console.log("⚠️ Максимум 4 кастомных направления, лишние будут обрезаны");
      directionsConfig.custom = directionsConfig.custom.slice(0, 4);
    }

    console.log("\n📦 Создание PR с настраиваемыми направлениями...\n");
    console.log("Конфигурация направлений:");
    console.log(`  - Самооценка (self): ${directionsConfig.self ? "✓" : "✗"}`);
    console.log(
      `  - Руководитель (head): ${directionsConfig.head ? "✓" : "✗"}`,
    );
    console.log(
      `  - Подчинённые (subordinate): ${directionsConfig.subordinate ? "✓" : "✗"}`,
    );
    console.log(
      `  - Коллеги (colleague): ${directionsConfig.colleague ? "✓" : "✗"}`,
    );
    if (directionsConfig.custom.length > 0) {
      console.log(`  - Кастомные: ${directionsConfig.custom.join(", ")}`);
    }
    console.log("");

    await this.init();

    // 1. Создаём компетенции
    console.log("1️⃣ Создание компетенций...");
    const groups = await this.createCompetenceGroups();
    const competencies = await this.createCompetencies(groups);

    // 2. Создаём анкету
    console.log("\n2️⃣ Создание анкеты...");
    const assessmentId =
      await this.createAssessmentWithCompetencies(competencies);

    // 3. Создаём PR с нужными направлениями
    console.log("\n3️⃣ Создание Performance Review...");
    const prId = await this.createPRWithDirections(
      assessmentId,
      directionsConfig,
    );

    // 4. Добавляем target users
    console.log("\n4️⃣ Добавление target users...");
    const { targetUsers, allUsers, controlGroupUserId } =
      await this.addTargetUsers(prId, targetUsersCount);

    if (targetUsers.length === 0) {
      console.log("⚠️ Не удалось добавить target users");
      return { prId, assessmentId, error: "No target users" };
    }

    // 5. Назначаем сотрудников для направлений (кроме self и head)
    console.log("\n5️⃣ Назначение сотрудников для направлений...");
    await this.assignReceiversForDirections(
      prId,
      targetUsers,
      allUsers,
      directionsConfig,
      receiversPerDirection,
    );

    // 6. Запускаем PR
    console.log("\n6️⃣ Запуск Performance Review...");
    const revision = await this.startPR(prId);

    // 7. Заполняем анкеты через populateReview (если нужно)
    if (fillQuestionnaires && revision) {
      console.log("\n7️⃣ Заполнение анкет...");
      await this.fillAllDirectionsQuestionnaires(prId, revision, competencies);
    }

    // Итоговая информация
    const { data: counts } = await this.prAPI.getUsersCounts(prId);
    const activeDirections = this.getActiveDirectionsCount(directionsConfig);

    console.log("\n" + "=".repeat(60));
    console.log("✅ PR С НАСТРАИВАЕМЫМИ НАПРАВЛЕНИЯМИ СОЗДАН");
    console.log("=".repeat(60));
    console.log(`   PR ID: ${prId}`);
    console.log(`   Assessment ID: ${assessmentId}`);
    console.log(`   Направлений: ${activeDirections}`);
    console.log(
      `   Target users: ${counts?.targetUsersCount || targetUsers.length}`,
    );
    console.log(`   Receivers: ${counts?.receiversCount || "N/A"}`);
    console.log("");
    console.log(`   URL: /ru/manager/performance-reviews/${prId}/`);
    console.log("=".repeat(60));

    return {
      prId,
      assessmentId,
      revisionId: revision?.id,
      competencies,
      groups,
      targetUsers,
      controlGroupUserId,
      directionsConfig,
    };
  }

  /**
   * Создать PR с указанными направлениями
   * @private
   */
  async createPRWithDirections(assessmentId, directionsConfig) {
    const directions = [];

    // Стандартные направления
    const standardTypes = ["self", "head", "subordinate", "colleague"];
    for (const type of standardTypes) {
      directions.push({
        id: null,
        receiverType: type,
        isSelected: directionsConfig[type] === true,
        title: null,
        description: null,
      });
    }

    // Кастомные направления
    for (const customTitle of directionsConfig.custom) {
      directions.push({
        id: null,
        receiverType: "custom",
        isSelected: true,
        title: customTitle,
        description: `Кастомное направление: ${customTitle}`,
      });
    }

    const prPayload = {
      title: `E2E_Направления ревью_${Date.now()}`,
      directions,
      anonymityType: "notAnonymous",
      workflowType: "basic",
      notificationsSchedule: {
        enableReminds: false,
        baseDate: new Date().toISOString(),
        repeatType: "everyWorkDay",
        timezoneOffset: new Date().getTimezoneOffset(),
      },
      isApprovalStep: false,
      isAsyncSteps: false,
      isAsyncStepsSelfResponseStep: false,
      minReceiversCount: 1,
      maxReceiversCount: 10,
    };

    const { response, data } = await this.prAPI.create(prPayload);

    if (response.ok()) {
      this.createdData.prId = data.id;
      console.log(`✓ Performance Review создан (ID: ${data.id})`);

      // Добавляем анкету для всех выбранных направлений
      if (assessmentId) {
        await this.addAssessmentToPR(data.id, assessmentId);
      }

      return data.id;
    } else {
      const errorText = await response.text();
      throw new Error(
        `Не удалось создать PR: ${response.status()} - ${errorText}`,
      );
    }
  }

  /**
   * Назначить сотрудников для всех направлений (кроме self и head)
   * @private
   */
  async assignReceiversForDirections(
    prId,
    targetUsers,
    allUsers,
    directionsConfig,
    receiversCount,
  ) {
    const { data: prData } = await this.prAPI.getById(prId);
    const directions = prData?.directions || [];

    const targetUserIds = targetUsers.map((tu) => tu.userId || tu.id);

    // Пул доступных сотрудников (исключаем target users)
    const availablePool = allUsers.filter((u) => !targetUserIds.includes(u.id));

    if (availablePool.length < receiversCount) {
      console.log(
        `⚠️ Недостаточно сотрудников в пуле (${availablePool.length}), нужно минимум ${receiversCount}`,
      );
    }

    // Направления, которым нужны сотрудники
    const directionsNeedingReceivers = directions.filter((d) => {
      if (!d.isSelected) return false;
      // self и head не требуют назначения сотрудников
      if (d.receiverType === "self" || d.receiverType === "head") return false;
      return true;
    });

    console.log(
      `  Направлений для назначения: ${directionsNeedingReceivers.length}`,
    );

    // Распределяем сотрудников по направлениям
    // Важно: пулы не должны пересекаться между направлениями
    let poolIndex = 0;
    const usersPerDirection = receiversCount;
    const totalNeeded = directionsNeedingReceivers.length * usersPerDirection;

    if (availablePool.length < totalNeeded) {
      console.log(
        `⚠️ Пул сотрудников (${availablePool.length}) меньше необходимого (${totalNeeded}), будет переиспользование`,
      );
    }

    for (const direction of directionsNeedingReceivers) {
      const directionName = direction.title || direction.receiverType;

      // Выбираем сотрудников для этого направления
      const receiverIds = [];
      for (let i = 0; i < usersPerDirection; i++) {
        if (poolIndex >= availablePool.length) {
          poolIndex = 0; // Начинаем сначала если пул закончился
        }
        receiverIds.push(availablePool[poolIndex].id);
        poolIndex++;
      }

      // Назначаем для каждого target user
      for (const targetUser of targetUsers) {
        const targetUserId = targetUser.userId || targetUser.id;
        const userName = targetUser.user
          ? `${targetUser.user.firstName} ${targetUser.user.lastName}`
          : `User ${targetUserId}`;

        try {
          const { response } = await this.prAPI.updateReceivers(
            prId,
            targetUserId,
            {
              directionId: direction.id,
              usersIds: receiverIds,
            },
          );

          if (response.ok()) {
            console.log(
              `  ✓ ${directionName} → ${userName}: ${receiverIds.length} человек`,
            );
          } else {
            console.log(
              `  ⚠️ ${directionName} → ${userName}: ${response.status()}`,
            );
          }
        } catch (e) {
          console.log(`  ⚠️ ${directionName} → ${userName}: ${e.message}`);
        }
      }
    }
  }

  /**
   * Подсчитать количество активных направлений
   * @private
   */
  getActiveDirectionsCount(directionsConfig) {
    let count = 0;
    if (directionsConfig.self) count++;
    if (directionsConfig.head) count++;
    if (directionsConfig.subordinate) count++;
    if (directionsConfig.colleague) count++;
    count += directionsConfig.custom.length;
    return count;
  }

  /**
   * Проверить и дозаполнить оставшиеся анкеты
   */
  async verifyAndFillRemaining(prId) {
    // Получаем текущее состояние
    const { data: receiversData } = await this.prAPI.getReceiverUsers(prId, {
      limit: 100,
    });
    const receivers = receiversData?.items || [];

    let unfilled = 0;
    let total = 0;

    for (const r of receivers) {
      for (const d of r.directions || []) {
        for (const t of d.targetUsers || []) {
          total++;
          if (!t.isCompleted) unfilled++;
        }
      }
    }

    console.log(`  Статус: ${total - unfilled}/${total} анкет заполнено`);

    if (unfilled > 0) {
      console.log(`  ⚠️ Осталось незаполненных: ${unfilled}`);
      console.log("  Повторная попытка через populateReview...");

      // Повторная попытка
      const { response } = await this.prAPI.populateReview(prId, {
        skipChance: 0,
        commentChance: 0,
        customChance: 0,
        lowerLimit: 50,
        upperLimit: 100,
      });

      if (response.ok()) {
        console.log("  ✓ populateReview выполнен");
      } else {
        console.log(`  ⚠️ populateReview вернул ${response.status()}`);
      }
    }
  }

  /**
   * Очистка созданных данных
   */
  async cleanup() {
    console.log("\n🧹 Очистка seed данных...");

    // Удаляем PR
    if (this.createdData.prId) {
      try {
        await this.prAPI.archive(this.createdData.prId);
        await this.prAPI.remove(this.createdData.prId);
        console.log(`✓ PR ${this.createdData.prId} удалён`);
      } catch (e) {
        console.log(`⚠️ Ошибка удаления PR: ${e.message}`);
      }
    }

    // Удаляем анкету
    if (this.createdData.assessmentId) {
      try {
        await this.assessmentsAPI.deleteAssessment(
          this.createdData.assessmentId,
        );
        console.log(`✓ Анкета ${this.createdData.assessmentId} удалена`);
      } catch (e) {
        console.log(`⚠️ Ошибка удаления анкеты: ${e.message}`);
      }
    }

    // Компетенции и группы обычно не удаляем (могут использоваться в других местах)
  }
}

/**
 * Хелпер для быстрого создания seed
 */
export async function createCalibrationSeed(request) {
  const seed = new CalibrationSeed(request);
  return await seed.seedAll();
}

/**
 * Конфигурация характеристик оценки (цифры и цвета)
 */
export const CALIBRATION_CHARACTERISTICS = {
  // Диапазоны для текстовых характеристик (в процентах)
  ranges: [
    { max: 33.33, label: "низко", color: "#ffcccc" }, // красный
    { max: 66.66, label: "средне", color: "#ffffcc" }, // желтый
    { max: 100, label: "высоко", color: "#ccffcc" }, // зеленый
  ],

  // Преобразование оценки 1-5 в проценты
  scoreToPercent: (score, min = 1, max = 5) => {
    return ((score - min) / (max - min)) * 100;
  },

  // Получить характеристику по оценке
  getCharacteristic: (score, min = 1, max = 5) => {
    const percent = ((score - min) / (max - min)) * 100;
    for (const range of CALIBRATION_CHARACTERISTICS.ranges) {
      if (percent <= range.max) {
        return range;
      }
    }
    return CALIBRATION_CHARACTERISTICS.ranges[
      CALIBRATION_CHARACTERISTICS.ranges.length - 1
    ];
  },
};
