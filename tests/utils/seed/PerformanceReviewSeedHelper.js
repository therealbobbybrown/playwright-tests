/**
 * Хелпер для создания тестовых данных для модуля Performance Review
 *
 * Создаёт:
 * - Черновики PR
 * - Активные PR с участниками
 * - Остановленные PR
 */

import { PerformanceReviewAPI, getCredentials } from "../api/index.js";
import { TestDataHelper } from "../TestDataHelper.js";

export class PerformanceReviewSeedHelper {
  /**
   * @param {import('@playwright/test').APIRequestContext} request
   */
  constructor(request) {
    this.request = request;
    this.prAPI = null;
    this.createdIds = {
      performanceReviews: [],
      reminds: [],
    };
  }

  /**
   * Инициализировать API с авторизацией
   * @param {'admin' | 'user' | 'manager'} role
   */
  async init(role = "admin") {
    this.prAPI = new PerformanceReviewAPI(this.request);
    const { email, password } = getCredentials(role);
    await this.prAPI.signIn(email, password);
  }

  /**
   * Получить список доступных пользователей для target users
   * @returns {Promise<Array>}
   */
  async getAvailableUsers() {
    // Получаем пользователей через /manager/users/
    try {
      const { data } = await this.prAPI.get(
        "/manager/users/?limit=10&category=active",
      );
      return data?.items || data || [];
    } catch (e) {
      console.warn("Не удалось получить пользователей:", e.message);
      return [];
    }
  }

  /**
   * Получить список существующих анкет (assessments)
   * @returns {Promise<Array>}
   */
  async getAvailableAssessments() {
    try {
      const { data } = await this.prAPI.get(
        "/manager/assessments/?limit=30&status=published",
      );
      const items = data?.items || data || [];
      // API может игнорировать фильтр status=published — фильтруем на клиенте.
      // Допускаем только inUse (привязана к PR) и published.
      // Draft-анкеты не валидны для start() и ломают весь seed-пайплайн.
      const valid = items.filter(
        (a) => a.status === "inUse" || a.status === "published",
      );
      if (valid.length === 0 && items.length > 0) {
        console.warn(
          `getAvailableAssessments: ${items.length} анкет найдено, но ни одна не в статусе inUse/published`,
        );
      }
      return valid;
    } catch (e) {
      console.warn("Не удалось получить анкеты:", e.message);
      return [];
    }
  }

  /**
   * Привязать assessments к directions PR
   * @param {string} prId - ID Performance Review
   * @param {Array} [assessmentIds] - ID анкет (если не указано, получим из системы)
   * @returns {Promise<boolean>}
   */
  async attachAssessments(prId, assessmentIds = null) {
    if (!assessmentIds) {
      const assessments = await this.getAvailableAssessments();
      const assessmentList = Array.isArray(assessments) ? assessments : [];
      assessmentIds = assessmentList.slice(0, 1).map((a) => a.id);
    }

    if (!assessmentIds || assessmentIds.length === 0) {
      console.warn("Нет доступных анкет для привязки");
      return false;
    }

    // Получаем directions для PR
    const { data: prData } = await this.prAPI.getById(prId);
    const directions = prData?.directions || [];

    // Привязываем анкету к каждому активному direction
    for (const direction of directions) {
      if (direction.isSelected) {
        const { response } = await this.prAPI.setAssessments(prId, {
          directionId: direction.id,
          assessmentsIds: assessmentIds,
        });
        if (!response.ok()) {
          console.warn(
            `Не удалось привязать анкету к direction ${direction.id}:`,
            await response.text(),
          );
        }
      }
    }

    return true;
  }

  /**
   * Создать черновик Performance Review
   * @param {Object} options
   * @returns {Promise<{id: string, title: string}>}
   */
  async seedDraftPR(options = {}) {
    if (!this.prAPI) {
      throw new Error(
        "PerformanceReviewSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const title =
      options.title || TestDataHelper.generateUniqueName("Черновик ревью");

    // Базовые направления оценки (формат из frontend)
    // receiverType: 'self', 'head', 'subordinate', 'colleague', 'custom'
    // ВАЖНО: UI создаёт все 4 направления (2 selected + 2 unselected)
    // Если создать только 2, дашборд "Моя команда" падает с 500
    const directions = options.directions || [
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
        isSelected: false,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "colleague",
        isSelected: false,
        title: null,
        description: null,
      },
    ];

    // notificationsSchedule - формат из frontend
    const notificationsSchedule = options.notificationsSchedule || {
      enableReminds: false,
      baseDate: new Date().toISOString(),
      repeatType: "everyWorkDay",
      timezoneOffset: new Date().getTimezoneOffset(),
    };

    const { response, data } = await this.prAPI.create({
      title,
      directions,
      anonymityType: options.anonymityType || "anonymous", // anonymous, forAdminHead, notAnonymous
      workflowType: options.workflowType || "basic", // basic, withNominations
      notificationsSchedule,
      isApprovalStep: options.isApprovalStep ?? false,
      isAsyncSteps: options.isAsyncSteps ?? false,
      isAsyncStepsSelfResponseStep:
        options.isAsyncStepsSelfResponseStep ?? false,
      minReceiversCount: options.minReceiversCount || 1,
      maxReceiversCount: options.maxReceiversCount || 10,
    });

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Не удалось создать PR: ${error}`);
    }

    const prId = data.id;
    this.createdIds.performanceReviews.push(prId);

    return {
      id: prId,
      title,
    };
  }

  /**
   * Добавить target users в PR
   * @param {string} prId - ID Performance Review
   * @param {Array} userIds - ID пользователей (если не указано, получим из системы)
   * @returns {Promise<Array>}
   */
  async addTargetUsers(prId, userIds = null) {
    if (!userIds) {
      // Получаем доступных пользователей
      const users = await this.getAvailableUsers();
      // Проверяем что users - массив
      const userList = Array.isArray(users) ? users : [];
      userIds = userList.slice(0, 3).map((u) => u.id);
    }

    if (!userIds || userIds.length === 0) {
      console.warn("Нет доступных пользователей для добавления");
      return [];
    }

    // Формат: targetType = 'user' | 'userGroup' | 'department' | 'all', entityId = ID
    const targets = userIds.map((userId) => ({
      targetType: "user",
      entityId: userId,
    }));

    const { response, data } = await this.prAPI.addTargetUsers(prId, {
      targets,
    });

    if (!response.ok()) {
      console.warn("Не удалось добавить target users:", await response.text());
      return [];
    }

    return data?.items || [];
  }

  /**
   * Заполнить анкеты в PR с помощью populateReview
   * @param {string} prId - ID Performance Review
   * @param {Object} settings - Настройки заполнения
   * @param {number} maxAttempts - Максимальное количество попыток
   * @returns {Promise<number>} Количество заполненных анкет
   */
  async fillQuestionnaires(prId, settings = {}, maxAttempts = 25) {
    const defaultSettings = {
      skipChance: 0, // Не пропускать вопросы
      commentChance: 0, // Не добавлять комментарии
      customChance: 0, // Не использовать кастомные ответы
      lowerLimit: 60, // Минимум 60% (оценка 3 из 5)
      upperLimit: 100, // Максимум 100% (оценка 5 из 5)
      ...settings,
    };

    let filled = 0;
    let consecutiveErrors = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { response } = await this.prAPI.populateReview(
          prId,
          defaultSettings,
          { timeout: 120000 },
        );

        if (response.ok()) {
          filled++;
          consecutiveErrors = 0;
          await new Promise((r) => setTimeout(r, 500)); // Пауза между заполнениями (снижение нагрузки на API)
        } else if (response.status() === 500) {
          // 500 может означать "все заполнены" или реальную ошибку
          const body500 = await response.text().catch(() => "");
          if (filled === 0) {
            console.log(
              `  ⚠️ populateReview 500 (0 заполнено): ${body500.substring(0, 200)}`,
            );
            consecutiveErrors++;
            if (consecutiveErrors >= 3) break;
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
          console.log(
            `  ✓ Все анкеты заполнены (${filled}), 500: ${body500.substring(0, 100)}`,
          );
          break;
        } else {
          consecutiveErrors++;
          if (consecutiveErrors >= 3) {
            console.warn(
              `  ⚠️ Слишком много ошибок при заполнении анкет PR ${prId}`,
            );
            break;
          }
        }
      } catch (e) {
        if (!e.message?.includes("Timeout")) {
          consecutiveErrors++;
          if (consecutiveErrors >= 3) break;
        }
      }
    }

    return filled;
  }

  /**
   * Создать и запустить активный Performance Review
   * @param {Object} options
   * @param {boolean} options.fillAssessments - Заполнить анкеты после запуска (default: false)
   * @param {Object} options.fillSettings - Настройки заполнения анкет
   * @returns {Promise<{id: string, title: string, revisionId: string, targetUserId: string, filledCount: number}>}
   */
  async seedActivePR(options = {}) {
    const pr = await this.seedDraftPR({
      ...options,
      title: options.title || TestDataHelper.generateUniqueName("Активное ревью"),
    });

    // Добавляем target users
    const targetUsers = await this.addTargetUsers(pr.id, options.targetUserIds);
    const targetUserId = targetUsers[0]?.userId || targetUsers[0]?.id || null;

    // Привязываем assessments к directions
    await this.attachAssessments(pr.id, options.assessmentIds);

    // Пробуем запустить PR
    const { response: startResp } = await this.prAPI.start(pr.id);

    let revisionId = null;

    if (!startResp.ok()) {
      const errorText = await startResp.text();
      console.warn("Не удалось запустить PR:", errorText);

      // Валидируем чтобы понять что не так
      const { data: validation } = await this.prAPI.validate(pr.id);
      if (validation?.errors) {
        console.warn(
          "Ошибки валидации:",
          JSON.stringify(validation.errors, null, 2),
        );
      }
    } else {
      // Получаем ревизию после запуска
      const { data: revision } = await this.prAPI.getLastRevision(pr.id);
      revisionId = revision?.id || null;
    }

    // Получаем target user после запуска PR (если не было получено ранее)
    let finalTargetUserId = targetUserId;
    if (!finalTargetUserId) {
      const { data: targetUsersData } = await this.prAPI.getTargetUsers(
        pr.id,
        {},
      );
      const items = targetUsersData?.items || targetUsersData || [];
      finalTargetUserId = items[0]?.userId || items[0]?.id || null;
    }

    // Опционально заполняем анкеты
    let filledCount = 0;
    if (options.fillAssessments) {
      filledCount = await this.fillQuestionnaires(pr.id, options.fillSettings);
      console.log(`✓ Заполнено анкет в PR ${pr.id}: ${filledCount}`);
    }

    return {
      ...pr,
      revisionId,
      targetUserId: finalTargetUserId,
      filledCount,
    };
  }

  /**
   * Создать остановленный Performance Review
   * @param {Object} options
   * @returns {Promise<{id: string, title: string, revisionId: string, targetUserId: string}>}
   */
  async seedStoppedPR(options = {}) {
    const pr = await this.seedActivePR({
      ...options,
      title: options.title || TestDataHelper.generateUniqueName("Остановленное ревью"),
    });

    // Останавливаем PR
    const { response } = await this.prAPI.stop(pr.id);

    if (!response.ok()) {
      console.warn("Не удалось остановить PR:", await response.text());
    }

    return pr;
  }

  /**
   * Создать напоминание для PR
   * @param {string} revisionId - ID ревизии
   * @param {Object} options
   * @returns {Promise<{id: string}>}
   */
  async seedRemind(revisionId, options = {}) {
    if (!this.prAPI) {
      throw new Error("PerformanceReviewSeedHelper не инициализирован.");
    }

    const scheduledAt =
      options.scheduledAt ||
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { response, data } = await this.prAPI.createRemind({
      revisionId,
      title: options.title || "Тестовое напоминание PR",
      body: options.body || "Пожалуйста, завершите оценку!",
      scheduledAt,
      type: options.type || "revision", // nomination, headApprove, revision, actionsRequest, actionsRequestAutomatic
    });

    if (!response.ok()) {
      console.warn("Не удалось создать напоминание:", await response.text());
      return null;
    }

    this.createdIds.reminds.push(data.id);
    return data;
  }

  /**
   * Создать полный набор тестовых данных
   * @returns {Promise<Object>}
   */
  async seedAll() {
    console.log("Создание тестовых данных для Performance Review модуля...");

    // Черновик
    console.log("  - Создание черновика PR...");
    const draftPR = await this.seedDraftPR();

    // Активный PR
    console.log("  - Создание активного PR...");
    const activePR = await this.seedActivePR();

    // Напоминание
    let remind = null;
    if (activePR.revisionId) {
      console.log("  - Создание напоминания...");
      remind = await this.seedRemind(activePR.revisionId);
    }

    console.log("Тестовые данные созданы:");
    console.log(`  - Черновик: ${draftPR.id}`);
    console.log(
      `  - Активный: ${activePR.id} (revision: ${activePR.revisionId || "н/д"})`,
    );
    console.log(`  - Target user: ${activePR.targetUserId || "н/д"}`);
    console.log(`  - Напоминание: ${remind?.id || "не создано"}`);

    return {
      draftPR,
      activePR,
      remind,
    };
  }

  /**
   * Найти валидный PR для тестов "Моя команда"
   * Критерии:
   * - Направления не пустые (есть привязанные анкеты)
   * - Для направления "руководитель" (head): 1+ оцениваемых
   * - Для остальных направлений при анонимной оценке: 2+ оцениваемых
   *
   * @param {number} minTargetUsers - Минимальное количество target users
   * @returns {Promise<{prId: string, targetUsersCount: number, found: boolean}|null>}
   */
  async findValidPRForMyTeam(minTargetUsers = 2) {
    if (!this.prAPI) {
      throw new Error(
        "PerformanceReviewSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const { data } = await this.prAPI.getList();
    const items = data?.items || data || [];
    const activePRs = items.filter((pr) => pr.status === "active");

    for (const pr of activePRs) {
      try {
        // Получаем детали PR
        const { data: prDetails } = await this.prAPI.getById(pr.id);
        const directions = prDetails?.directions || [];
        const isAnonymous = prDetails?.anonymityType === "anonymous";

        // Проверяем, что есть непустые направления (с привязанными анкетами)
        const activeDirections = directions.filter((d) => d.isSelected);
        if (activeDirections.length === 0) {
          console.log(
            `[prSeed] PR ${pr.id}: нет активных направлений, пропускаем`,
          );
          continue;
        }

        // Проверяем target users
        const { data: targetUsersData } = await this.prAPI.getTargetUsers(
          pr.id,
          {},
        );
        const targetUsers = targetUsersData?.items || targetUsersData || [];
        const count = Array.isArray(targetUsers) ? targetUsers.length : 0;

        // Определяем минимум на основе направлений
        const hasHeadDirection = activeDirections.some(
          (d) => d.receiverType === "head",
        );
        const hasOtherDirections = activeDirections.some(
          (d) => d.receiverType !== "head" && d.receiverType !== "self",
        );

        let requiredMin = 1;
        if (hasOtherDirections && isAnonymous) {
          requiredMin = 2; // Для анонимных оценок от коллег нужно 2+
        }

        const effectiveMin = Math.max(minTargetUsers, requiredMin);

        if (count >= effectiveMin) {
          console.log(
            `[prSeed] Найден валидный PR ${pr.id} "${pr.title}": ${count} target users, ` +
              `направления: ${activeDirections.map((d) => d.receiverType).join(", ")}, ` +
              `анонимность: ${isAnonymous}`,
          );
          return {
            prId: pr.id,
            prTitle: pr.title,
            targetUsersCount: count,
            found: true,
          };
        } else {
          console.log(
            `[prSeed] PR ${pr.id}: ${count} target users < ${effectiveMin} (требуется), пропускаем`,
          );
        }
      } catch (e) {
        console.warn(`[prSeed] Ошибка при проверке PR ${pr.id}:`, e.message);
      }
    }

    return null;
  }

  /**
   * Найти или создать PR с несколькими target users
   * ВНИМАНИЕ: Может создать PR, который сломает дашборд (если у пользователей нет руководителя)
   * Для позитивных тестов используйте findValidPRForMyTeam()
   *
   * @param {number} minTargetUsers - Минимальное количество target users (по умолчанию 2)
   * @param {Object} options - Опции
   * @param {boolean} options.forceCreate - Принудительно создать новый PR (не искать существующий)
   * @returns {Promise<{prId: string, targetUsersCount: number, created: boolean}>}
   */
  async findOrCreatePRWithMultipleTargetUsers(
    minTargetUsers = 2,
    options = {},
  ) {
    if (!this.prAPI) {
      throw new Error(
        "PerformanceReviewSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const { forceCreate = false } = options;

    // 1. Ищем существующие активные PR (если не forceCreate)
    if (!forceCreate) {
      const { data } = await this.prAPI.getList();
      const items = data?.items || data || [];
      const activePRs = items.filter((pr) => pr.status === "active");

      // 2. Проверяем каждый активный PR на количество target users
      for (const pr of activePRs) {
        try {
          const { data: targetUsersData } = await this.prAPI.getTargetUsers(
            pr.id,
            {},
          );
          const targetUsers = targetUsersData?.items || targetUsersData || [];
          const count = Array.isArray(targetUsers) ? targetUsers.length : 0;

          if (count >= minTargetUsers) {
            console.log(`[prSeed] Найден PR ${pr.id} с ${count} target users`);
            return {
              prId: pr.id,
              targetUsersCount: count,
              created: false,
            };
          }
        } catch (e) {
          console.warn(`[prSeed] Ошибка при проверке PR ${pr.id}:`, e.message);
        }
      }
    }

    // 3. Не нашли или forceCreate - создаём новый PR
    console.log(
      `[prSeed] ${forceCreate ? "Принудительное создание" : "Не найден PR с " + minTargetUsers + "+ target users"}, создаём новый...`,
    );

    // Получаем доступных пользователей
    const users = await this.getAvailableUsers();
    const userList = Array.isArray(users) ? users : [];

    if (userList.length < minTargetUsers) {
      throw new Error(
        `Недостаточно пользователей (${userList.length}) для создания PR с ${minTargetUsers} target users`,
      );
    }

    // Берём нужное количество пользователей
    const targetUserIds = userList.slice(0, minTargetUsers).map((u) => u.id);

    // Создаём активный PR с этими пользователями
    const pr = await this.seedActivePR({
      targetUserIds,
    });

    console.log(`[prSeed] Создан PR ${pr.id} с ${minTargetUsers} target users`);

    return {
      prId: pr.id,
      targetUsersCount: minTargetUsers,
      created: true,
    };
  }

  /**
   * Создать PR с ограниченным числом направлений (для воспроизведения бага)
   *
   * БАГ: Если создать PR с менее чем 4 направлениями через API,
   * дашборд "Моя команда" падает с 500 ошибкой.
   * UI всегда создаёт все 4 направления (2 selected + 2 unselected).
   *
   * @param {number} minTargetUsers - Минимальное количество target users
   * @param {Object} options
   * @param {number} options.directionsCount - Количество направлений (по умолчанию 2 - вызывает баг)
   * @returns {Promise<{prId: string, targetUsersCount: number, created: boolean, directions: Array}>}
   */
  async createPRWithLimitedDirections(minTargetUsers = 2, options = {}) {
    if (!this.prAPI) {
      throw new Error(
        "PerformanceReviewSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const { directionsCount = 2 } = options;

    // Всегда 4 направления (как в UI), но только первые N с isSelected=true
    const allTypes = ["self", "head", "subordinate", "colleague"];
    const directions = allTypes.map((receiverType, i) => ({
      id: null,
      receiverType,
      isSelected: i < directionsCount,
      title: null,
      description: null,
    }));

    const activeNames = directions
      .filter((d) => d.isSelected)
      .map((d) => d.receiverType);
    console.log(
      `[prSeed] Создание PR с ${directionsCount} активными направлениями из 4`,
    );
    console.log(`[prSeed] Активные: ${activeNames.join(", ")}`);

    // Получаем доступных пользователей
    const users = await this.getAvailableUsers();
    const userList = Array.isArray(users) ? users : [];

    if (userList.length < minTargetUsers) {
      throw new Error(
        `Недостаточно пользователей (${userList.length}) для создания PR с ${minTargetUsers} target users`,
      );
    }

    const targetUserIds = userList.slice(0, minTargetUsers).map((u) => u.id);

    // Создаём PR с ограниченными направлениями
    const pr = await this.seedDraftPR({
      ...options,
      title:
        options.title ||
        TestDataHelper.generateUniqueName(`PR-${directionsCount}dir`),
      directions,
    });

    // Добавляем target users
    await this.addTargetUsers(pr.id, targetUserIds);

    // Привязываем assessments к directions
    await this.attachAssessments(pr.id, options.assessmentIds);

    // Запускаем PR
    const { response: startResp } = await this.prAPI.start(pr.id);

    if (!startResp.ok()) {
      const errorText = await startResp.text();
      console.warn("[prSeed] Не удалось запустить PR:", errorText);
    }

    console.log(
      `[prSeed] Создан PR ${pr.id} с ${directionsCount} направлениями и ${minTargetUsers} target users`,
    );

    return {
      prId: pr.id,
      targetUsersCount: minTargetUsers,
      created: true,
      directions,
    };
  }

  /**
   * Проверить существующие данные
   * @returns {Promise<{hasData: boolean, counts: Object}>}
   */
  async checkExistingData() {
    if (!this.prAPI) {
      throw new Error("PerformanceReviewSeedHelper не инициализирован.");
    }

    const { data } = await this.prAPI.getList();
    const items = data?.items || data || [];

    const activeCount = items.filter((pr) => pr.status === "active").length;
    const draftCount = items.filter((pr) => pr.status === "draft").length;
    const stoppedCount = items.filter(
      (pr) => pr.status === "stopped" || pr.status === "finished",
    ).length;

    return {
      hasData: activeCount > 0,
      counts: {
        active: activeCount,
        draft: draftCount,
        stopped: stoppedCount,
        total: items.length,
      },
    };
  }

  /**
   * Очистить созданные тестовые данные
   */
  async cleanup() {
    if (!this.prAPI) {
      console.warn(
        "PerformanceReviewSeedHelper: не инициализирован, очистка пропущена",
      );
      return;
    }

    console.log("Очистка тестовых данных Performance Review...");

    // Удаляем напоминания
    for (const id of this.createdIds.reminds) {
      try {
        await this.prAPI.removeRemind(id);
        console.log(`  - Напоминание ${id} удалено`);
      } catch (error) {
        console.warn(`  - Не удалось удалить напоминание ${id}`);
      }
    }

    // Удаляем PR
    for (const id of this.createdIds.performanceReviews) {
      try {
        await this.prAPI.remove(id);
        console.log(`  - PR ${id} удалён`);
      } catch (error) {
        console.warn(`  - Не удалось удалить PR ${id}`);
      }
    }

    this.createdIds = {
      performanceReviews: [],
      reminds: [],
    };

    console.log("Очистка завершена");
  }
}
