// tests/utils/seed/DashboardStatusSeed.js
/**
 * Seed helper для создания тестовых данных по статусам дашборда "Моя команда"
 *
 * ВАЖНО: Target users должны быть подчинёнными менеджера!
 * Дашборд "Моя команда" показывает только подчинённых залогиненного менеджера.
 *
 * Создаёт PR с различными статусами для тестирования:
 * - Самооценка: пройдена / в ожидании
 * - Оценка руководителя: пройдена / в ожидании
 * - Оценка коллег: пройдена / не утверждены / не предложены
 * - Оценка подчинённых: пройдена / в ожидании
 *
 * Использование:
 * ```javascript
 * const seed = new DashboardStatusSeed(request);
 * await seed.init();
 * const testData = await seed.seedAllStatusScenarios();
 * // testData.SELF_COMPLETE, testData.ALL_AWAITING, etc.
 * ```
 */

import { PerformanceReviewAPI } from "../api/PerformanceReviewAPI.js";
import { AssessmentsAPI } from "../api/AssessmentsAPI.js";
import { DashboardTeamAPI } from "../api/DashboardTeamAPI.js";
import { getCredentials, getTestUserPassword } from "../api/index.js";
import { TestDataHelper } from "../TestDataHelper.js";
import { DIRECTION_STATUS } from "./dashboard-test-data.js";

export class DashboardStatusSeed {
  constructor(request) {
    this.request = request;
    this.prAPI = null;
    this.assessmentsAPI = null;
    this.dashboardAPI = null;

    // Созданные данные для cleanup
    this.createdData = {
      prs: [],
    };

    // Кэш созданных PR
    this.prCache = {};

    // Кэш подчинённых менеджера (для target users)
    this.managerSubordinates = [];
  }

  /**
   * Инициализация
   * Авторизует API клиентов и загружает подчинённых менеджера
   */
  async init() {
    const adminCreds = getCredentials("admin");

    // Admin API для создания PR
    this.prAPI = new PerformanceReviewAPI(this.request);
    await this.prAPI.signIn(adminCreds.email, adminCreds.password);

    this.assessmentsAPI = new AssessmentsAPI(this.request);
    await this.assessmentsAPI.signIn(adminCreds.email, adminCreds.password);

    // Manager API для получения подчинённых
    // Дашборд "Моя команда" показывает только подчинённых менеджера
    try {
      const managerCreds = getCredentials("manager");
      this.dashboardAPI = new DashboardTeamAPI(this.request);
      await this.dashboardAPI.signIn(managerCreds.email, managerCreds.password);

      // Загружаем подчинённых менеджера
      await this.loadManagerSubordinates();
    } catch (e) {
      console.warn(
        "[DashboardStatusSeed] Не удалось загрузить подчинённых менеджера:",
        e.message,
      );
      console.warn(
        "[DashboardStatusSeed] Убедитесь, что MANAGER_LOGIN и MANAGER_PASSWORD заданы в .env",
      );
    }

    return this;
  }

  /**
   * Загрузить список РЕАЛЬНЫХ подчинённых менеджера (где он - head)
   *
   * Использует admin API /manager/users/ для получения всех пользователей компании,
   * затем фильтрует по headUser.id === managerId.
   *
   * Предыдущий подход (через dashboard-filters) имел циркулярную зависимость:
   * getDashboardFiltersPRs() возвращал items:[] если не было PR с подчинёнными,
   * но чтобы создать такой PR, нужно знать подчинённых.
   */
  async loadManagerSubordinates() {
    if (!this.dashboardAPI) {
      console.warn("[DashboardStatusSeed] dashboardAPI не инициализирован");
      return;
    }

    try {
      // Декодируем managerId из JWT токена менеджера
      const managerToken = this.dashboardAPI.token;
      if (!managerToken) {
        console.warn("[DashboardStatusSeed] У dashboardAPI нет токена");
        return;
      }

      let managerId;
      try {
        const payload = JSON.parse(
          Buffer.from(managerToken.split(".")[1], "base64").toString(),
        );
        managerId = payload?.userId;
      } catch {
        console.warn("[DashboardStatusSeed] Не удалось декодировать JWT менеджера");
        return;
      }

      if (!managerId) {
        console.warn("[DashboardStatusSeed] userId не найден в JWT менеджера");
        return;
      }

      console.log(`[DashboardStatusSeed] Manager userId: ${managerId}`);

      // Используем admin API для получения всех пользователей компании
      // и фильтрации по headUser.id === managerId
      const { data } = await this.prAPI.get(
        "/manager/users/?limit=3000&category=active",
      );
      const allUsers = data?.items || data || [];

      if (!Array.isArray(allUsers) || allUsers.length === 0) {
        console.warn("[DashboardStatusSeed] Не удалось получить пользователей через admin API");
        return;
      }

      // Фильтруем подчинённых: headUser.id === managerId
      const subordinates = allUsers.filter(
        (u) => u.headUser && u.headUser.id === Number(managerId),
      );

      this.managerSubordinates = subordinates.map((u) => ({
        id: u.id,
        fullName: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
        email: u.account?.email,
      }));

      console.log(
        `[DashboardStatusSeed] ✓ Найдено реальных подчинённых: ${this.managerSubordinates.length} (из ${allUsers.length} пользователей)`,
      );

      if (this.managerSubordinates.length > 0) {
        // Показываем первых 5 для диагностики
        const preview = this.managerSubordinates.slice(0, 5);
        console.log("[DashboardStatusSeed] Подчинённые (первые 5):");
        preview.forEach((u) => {
          console.log(`  - ID: ${u.id} | ${u.fullName || u.email || "N/A"}`);
        });
      } else {
        console.warn(
          "[DashboardStatusSeed] ⚠️ Не найдено реальных подчинённых!",
        );
        console.warn(
          `[DashboardStatusSeed] Проверьте, что у менеджера (userId=${managerId}) есть подчинённые в оргструктуре`,
        );
      }
    } catch (e) {
      console.warn(
        "[DashboardStatusSeed] Ошибка loadManagerSubordinates:",
        e.message,
      );
    }
  }

  /**
   * Получить ID РЕАЛЬНЫХ подчинённых менеджера для target users
   * @param {number} count - Сколько подчинённых нужно
   * @returns {Array<string>} IDs подчинённых
   */
  getSubordinateIds(count = 1) {
    if (this.managerSubordinates.length === 0) {
      throw new Error(
        "Нет реальных подчинённых менеджера!\n" +
          "Для работы seed необходимо:\n" +
          "1. MANAGER_LOGIN и MANAGER_PASSWORD заданы в .env\n" +
          "2. ADMIN_LOGIN имеет доступ к /manager/users/ API\n" +
          "3. У менеджера есть подчинённые в оргструктуре (headUser.id)",
      );
    }

    if (this.managerSubordinates.length < count) {
      console.warn(
        `[DashboardStatusSeed] Запрошено ${count} подчинённых, доступно только ${this.managerSubordinates.length}`,
      );
    }

    return this.managerSubordinates.slice(0, count).map((u) => u.id);
  }

  /**
   * Получить доступную опубликованную анкету
   */
  async getAvailableAssessment() {
    const { data } = await this.assessmentsAPI.get(
      "/manager/assessments/?limit=10&status=published",
    );
    const raw = data?.items || data;
    const items = Array.isArray(raw) ? raw : [];
    return items[0] || null;
  }

  /**
   * @deprecated Используйте getSubordinateIds() вместо этого
   * Получить доступных пользователей (НЕ подчинённых менеджера!)
   * Этот метод оставлен для обратной совместимости, но не должен использоваться
   */
  async getAvailableUsers() {
    console.warn(
      "[DashboardStatusSeed] DEPRECATED: getAvailableUsers() - используйте getSubordinateIds()",
    );
    const { data } = await this.prAPI.get(
      "/manager/users/?limit=10&category=active",
    );
    const rawUsers = data?.items || data;
    return Array.isArray(rawUsers) ? rawUsers : [];
  }

  /**
   * Создать базовый PR с указанными направлениями
   * @param {Object} options
   * @param {string} options.title - Название PR
   * @param {Object} options.directions - Какие направления включить {self, head, colleague, subordinate}
   * @param {boolean} options.withNominations - Включить workflow с номинациями (для colleague)
   * @param {boolean} options.isApprovalStep - Требуется ли утверждение коллег руководителем
   */
  async createPR(options = {}) {
    const {
      title = TestDataHelper.generateUniqueName("Status Test PR"),
      directions: dirConfig = { self: true, head: true },
      withNominations = false,
      isApprovalStep = false,
      allowEarlyAccess = false,
    } = options;

    // Создаём все 4 направления (иначе дашборд падает с 500)
    const directions = [
      {
        id: null,
        receiverType: "self",
        isSelected: !!dirConfig.self,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "head",
        isSelected: !!dirConfig.head,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "subordinate",
        isSelected: !!dirConfig.subordinate,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "colleague",
        isSelected: !!dirConfig.colleague,
        title: null,
        description: null,
      },
    ];

    const { response, data } = await this.prAPI.create({
      title,
      directions,
      anonymityType: "anonymous",
      workflowType: withNominations ? "withNominations" : "basic",
      notificationsSchedule: {
        enableReminds: false,
        baseDate: new Date().toISOString(),
        repeatType: "everyWorkDay",
        timezoneOffset: new Date().getTimezoneOffset(),
      },
      isApprovalStep,
      isAsyncSteps: allowEarlyAccess, // Ранний доступ к анкетам
      isAsyncStepsSelfResponseStep: false,
      minReceiversCount: 1,
      maxReceiversCount: 10,
    });

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Не удалось создать PR: ${error}`);
    }

    const prId = data.id;
    this.createdData.prs.push(prId);

    console.log(`✓ Создан PR "${title}" (ID: ${prId})`);
    return { id: prId, title };
  }

  /**
   * Добавить target users в PR
   */
  async addTargetUsers(prId, userIds) {
    if (!userIds || userIds.length === 0) {
      console.warn("  ⚠️ Нет userIds для добавления target users");
      return [];
    }

    const targets = userIds.map((userId) => ({
      targetType: "user",
      entityId: userId,
    }));

    const attempts = [
      { label: "targets", payload: { targets } },
      { label: "usersIds", payload: { usersIds: userIds } },
      { label: "userIds", payload: { userIds } },
    ];

    let lastStatus = null;

    for (const attempt of attempts) {
      const { response } = await this.prAPI.addTargetUsers(
        prId,
        attempt.payload,
      );
      lastStatus = response.status();

      if (!response.ok() && response.status() !== 409) {
        console.warn(
          `  ⚠️ addTargetUsers (${attempt.label}) failed: ${response.status()}`,
        );
        continue;
      }

      const targetUsers = await this.waitForTargetUsers(prId, 3, 1000);
      if (targetUsers.length > 0) {
        console.log(`  ✓ Target users: ${targetUsers.length} чел.`);
        return targetUsers;
      }
    }

    throw new Error(
      `addTargetUsers failed: не удалось создать target users (last status: ${lastStatus})`,
    );
  }

  /**
   * Получить target users для PR (GET + POST fallback)
   */
  async getTargetUsersForPR(prId) {
    let items = [];

    try {
      const { data: targetUsersData } = await this.prAPI.get(
        `/manager/performance-reviews/${prId}/target-users/?limit=100`,
      );
      items = this.normalizeItems(targetUsersData);
    } catch (e) {
      console.warn(`  ⚠️ GET target-users failed: ${e.message}`);
    }

    if (items.length === 0) {
      const { data: targetUsersData } = await this.prAPI.getTargetUsers(prId, {
        limit: 100,
        offset: 0,
      });
      items = this.normalizeItems(targetUsersData);
    }

    return items;
  }

  /**
   * Подождать появления target users (на случай async создания)
   */
  async waitForTargetUsers(prId, attempts = 3, delayMs = 700) {
    for (let i = 0; i < attempts; i++) {
      const targetUsers = await this.getTargetUsersForPR(prId);
      if (targetUsers.length > 0) return targetUsers;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return [];
  }

  /**
   * Нормализовать items из ответа API
   */
  normalizeItems(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.users)) return data.users;
    return [];
  }

  /**
   * Привязать анкету к направлениям PR
   */
  async attachAssessment(prId, assessmentId) {
    const { data: prData } = await this.prAPI.getById(prId);
    const directions = prData?.directions || [];

    for (const direction of directions) {
      if (direction.isSelected) {
        await this.prAPI.setAssessments(prId, {
          directionId: direction.id,
          assessmentsIds: [assessmentId],
        });
      }
    }
  }

  /**
   * Запустить PR
   */
  async startPR(prId) {
    const { response } = await this.prAPI.start(prId);

    if (!response.ok()) {
      const errorText = await response.text();
      console.warn(`Не удалось запустить PR ${prId}:`, errorText);

      // Проверяем валидацию
      const { data: validation } = await this.prAPI.validate(prId);
      if (validation?.errors) {
        console.warn(
          "Ошибки валидации:",
          JSON.stringify(validation.errors, null, 2),
        );
      }
      return false;
    }

    return true;
  }

  /**
   * Заполнить анкеты через populateReview API
   * Заполняет все анкеты для всех респондентов
   * @param {string|number} prId - ID Performance Review
   * @param {number} [maxAttempts=25] - Максимальное количество попыток
   */
  async fillQuestionnaires(prId, maxAttempts = 25) {
    const settings = {
      skipChance: 0, // Не пропускать вопросы
      commentChance: 0, // Не добавлять комментарии
      customChance: 0, // Не использовать кастомные ответы
      lowerLimit: 60, // Минимум 60% (оценка 3 из 5)
      upperLimit: 100, // Максимум 100% (оценка 5 из 5)
    };

    let filled = 0;
    let consecutiveErrors = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { response } = await this.prAPI.populateReview(prId, settings, {
          timeout: 120000,
        });

        if (response.ok()) {
          filled++;
          consecutiveErrors = 0;
          console.log(`  ✓ populateReview #${filled}`);
          await new Promise((r) => setTimeout(r, 100)); // Небольшая пауза
        } else if (response.status() === 500) {
          // 500 означает что все анкеты заполнены
          console.log(`  ✓ Все анкеты заполнены (${filled} вызовов)`);
          break;
        } else {
          consecutiveErrors++;
          console.warn(`  ⚠️ Ошибка ${response.status()}`);
          if (consecutiveErrors >= 3) {
            console.warn("  ⚠️ Слишком много ошибок, останавливаемся");
            break;
          }
        }
      } catch (e) {
        if (e.message?.includes("Timeout")) {
          console.log("  ⏳ Таймаут, продолжаем...");
        } else {
          consecutiveErrors++;
          console.warn(`  ⚠️ ${e.message?.substring(0, 50)}`);
          if (consecutiveErrors >= 3) break;
        }
      }
    }

    console.log(`✓ Заполнено анкет: ${filled}`);
    return filled;
  }

  /**
   * Заполнить только самооценку, оставив остальные направления незаполненными
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} assessmentId - ID Assessment (анкеты)
   */
  async fillSelfAssessmentOnly(prId, assessmentId) {
    console.log(
      "[fillSelfAssessmentOnly] Заполняем самооценку, оставляя оценку руководителя пустой",
    );

    // Сначала заполняем ВСЕ анкеты
    await this.fillQuestionnaires(prId, 1);

    // Получаем receiver users чтобы найти head/manager receiver
    const { data: receiversData } = await this.prAPI.getReceiverUsers(prId, {
      limit: 100,
    });
    const receivers = receiversData?.items || [];

    console.log(`  Найдено receivers: ${receivers.length}`);
    console.log(`  assessmentId: ${assessmentId}`);

    // Для самооценки: user.id совпадает с targetUsers[0].id
    // Для оценки руководителя: user.id НЕ совпадает с targetUsers[0].id
    let resetCount = 0;

    for (const receiver of receivers) {
      const receiverUserId = receiver.user?.id;

      // Получаем targetUserId из directions
      const direction = receiver.directions?.[0];
      const targetUserId = direction?.targetUsers?.[0]?.id;

      if (!receiverUserId || !targetUserId) {
        console.log(`  ⚠️ Пропускаем receiver без receiverId или targetUserId`);
        continue;
      }

      // Это head assessment если receiverId !== targetUserId
      if (receiverUserId !== targetUserId) {
        const payload = {
          receiverUserId,
          targetUserId,
          assessmentId,
        };
        console.log(
          `  Сбрасываем head receiver (${receiverUserId} → ${targetUserId})`,
        );

        try {
          const { response } = await this.prAPI.resetUserResponse(
            prId,
            payload,
          );

          if (response.ok()) {
            console.log("    ✓ Ответ сброшен");
            resetCount++;
          } else {
            console.warn(`    ⚠️ Не удалось сбросить: ${response.status()}`);
          }
        } catch (e) {
          console.warn(`    ⚠️ Ошибка сброса: ${e.message}`);
        }
      }
    }

    if (resetCount > 0) {
      console.log(
        `  ✓ Оценка руководителя сброшена (${resetCount}) - осталась только самооценка`,
      );
    } else {
      console.log("  ⚠️ Не удалось сбросить ни одного head receiver");
    }
  }

  /**
   * Создать PR со статусом "Самооценка пройдена, Оценка руководителя в ожидании"
   */
  async seedSelfCompleteManagerAwaiting() {
    console.log("\n📊 Создание PR: Самооценка ✓, Руководитель ⏳");

    // Используем подчинённых менеджера, чтобы они отображались на дашборде "Моя команда"
    const subordinateIds = this.getSubordinateIds(1);

    const assessment = await this.getAvailableAssessment();
    if (!assessment) throw new Error("Нет опубликованных анкет");

    // Создаём PR только с self и head
    const pr = await this.createPR({
      title: TestDataHelper.generateUniqueName("v8_Self✓_Manager⏳"),
      directions: { self: true, head: true },
    });

    // Добавляем подчинённого менеджера как target user
    await this.addTargetUsers(pr.id, subordinateIds);

    // Привязываем анкету
    await this.attachAssessment(pr.id, assessment.id);

    // Запускаем
    await this.startPR(pr.id);

    // Заполняем только самооценку, оставляя оценку руководителя незаполненной
    await this.fillSelfAssessmentOnly(pr.id, assessment.id);

    this.prCache.SELF_COMPLETE_MANAGER_AWAITING = pr;
    return pr;
  }

  /**
   * Создать PR где все статусы "В ожидании"
   */
  async seedAllAwaiting() {
    console.log("\n📊 Создание PR: Все статусы ⏳");

    // Используем 3 подчинённых менеджера (чтобы тесты с findPRWithMultipleEmployees работали)
    const subordinateIds = this.getSubordinateIds(3);

    const assessment = await this.getAvailableAssessment();
    if (!assessment) throw new Error("Нет опубликованных анкет");

    // Создаём PR со всеми направлениями
    const pr = await this.createPR({
      title: TestDataHelper.generateUniqueName("v8_All_Awaiting"),
      directions: {
        self: true,
        head: true,
        colleague: true,
        subordinate: true,
      },
    });

    await this.addTargetUsers(pr.id, subordinateIds);
    await this.attachAssessment(pr.id, assessment.id);
    await this.startPR(pr.id);

    // НЕ заполняем анкеты - все в ожидании

    this.prCache.ALL_AWAITING = pr;
    return pr;
  }

  /**
   * Создать PR для статуса "Коллеги не утверждены"
   */
  async seedColleaguesNotApproved() {
    console.log("\n📊 Создание PR: Коллеги не утверждены");

    // Используем подчинённых менеджера
    const subordinateIds = this.getSubordinateIds(1);
    const targetUserId = subordinateIds[0];

    const assessment = await this.getAvailableAssessment();
    if (!assessment) throw new Error("Нет опубликованных анкет");

    // Создаём PR с номинациями и утверждением (ранний доступ включён)
    const pr = await this.createPR({
      title: TestDataHelper.generateUniqueName("v8_Colleagues_NotApproved"),
      directions: { self: true, head: true, colleague: true },
      withNominations: true,
      isApprovalStep: true, // Требуется утверждение коллег менеджером
      allowEarlyAccess: true, // Ранний доступ - не нужно переводить этапы вручную
    });

    await this.addTargetUsers(pr.id, subordinateIds);
    await this.attachAssessment(pr.id, assessment.id);
    await this.startPR(pr.id);

    // Предлагаем коллег от имени сотрудника (но НЕ утверждаем от имени менеджера)
    try {
      await this.suggestColleaguesAsEmployee(pr.id, targetUserId);
      console.log("  ✓ Коллеги предложены (ожидают утверждения)");
    } catch (e) {
      console.warn(`  ⚠️ Не удалось предложить коллег: ${e.message}`);
    }

    this.prCache.COLLEAGUES_NOT_APPROVED = pr;
    return pr;
  }

  /**
   * Предложить коллег от имени сотрудника
   * @param {number} prId - ID Performance Review
   * @param {number} employeeUserId - ID сотрудника (target user)
   */
  async suggestColleaguesAsEmployee(prId, employeeUserId) {
    console.log(
      `\n  [suggestColleagues] PR ${prId}, employee ${employeeUserId}`,
    );

    // 1. Получаем revision
    const { data: revision } = await this.prAPI.getLastRevision(prId);
    if (!revision?.id) {
      throw new Error("Не удалось получить ревизию PR");
    }
    console.log(`  → Revision ID: ${revision.id}`);

    // 2. Получаем email сотрудника через receivers
    const { data: receiversData } = await this.prAPI.getReceiverUsers(prId, {
      limit: 100,
    });
    const receivers = receiversData?.items || [];
    const targetReceiver = receivers.find(
      (r) => (r.user?.id || r.userId) === employeeUserId,
    );

    if (!targetReceiver) {
      throw new Error(`Receiver для user ${employeeUserId} не найден`);
    }

    const employeeEmail = targetReceiver.user?.account?.email;
    if (!employeeEmail) {
      throw new Error(`Email для user ${employeeUserId} не найден`);
    }
    console.log(`  → Employee: ${employeeEmail}`);

    // 3. Получаем nomination
    const { data: nominationData } = await this.prAPI.get(
      `/manager/performance-reviews/${prId}/nominations/of-revision/${revision.id}/`,
    );

    if (!nominationData?.id) {
      throw new Error("Nomination не найдена");
    }
    const nominationId = nominationData.id;
    console.log(`  → Nomination ID: ${nominationId}`);

    // 4. КЛЮЧЕВОЙ ШАГ: Получаем PerformanceReviewTargetUser ID
    const targetUsers = await this.getTargetUsersForPR(prId);
    const targetUserRecord = targetUsers.find((tu) => {
      const uid = tu.userId ?? tu.user?.id;
      return uid ? uid === employeeUserId : tu.id === employeeUserId;
    });

    if (!targetUserRecord) {
      throw new Error(
        `PerformanceReviewTargetUser для user ${employeeUserId} не найден`,
      );
    }
    const targetUserId = targetUserRecord.id;
    console.log(`  → PerformanceReviewTargetUser ID: ${targetUserId}`);

    // 5. Получаем PerformanceReviewNominationTargetUser ID
    const employeeAPI = new DashboardTeamAPI(this.request);
    await employeeAPI.signIn(employeeEmail, getTestUserPassword());

    let nominationTargetUsers = [];

    try {
      const { data: nominationTargetUsersData } = await this.prAPI.post(
        `/manager/performance-reviews/${prId}/nominations/${nominationId}/target-users/get`,
        { targetUsersIds: [targetUserId] },
      );
      nominationTargetUsers = this.normalizeItems(nominationTargetUsersData);
    } catch (e) {
      console.warn(
        `  ⚠️ manager nomination target-users/get failed: ${e.message}`,
      );
    }

    if (nominationTargetUsers.length === 0) {
      const { data: nominationTargetUsersData } =
        await employeeAPI.getNominationTargetUsers(prId, nominationId, {
          targetUsersIds: [targetUserId],
        });
      nominationTargetUsers = this.normalizeItems(nominationTargetUsersData);
    }

    if (nominationTargetUsers.length === 0) {
      throw new Error("PerformanceReviewNominationTargetUser не создан");
    }

    const nominationTargetUserId = nominationTargetUsers[0].id;
    console.log(
      `  → PerformanceReviewNominationTargetUser ID: ${nominationTargetUserId}`,
    );

    // 6. Получаем список коллег
    const { data: usersData } = await this.prAPI.get(
      "/manager/users/?limit=10&category=active",
    );
    const availableUsers = usersData?.items || [];
    const colleagueIds = availableUsers
      .filter((u) => u.id !== employeeUserId)
      .slice(0, 2)
      .map((u) => u.id);

    if (colleagueIds.length === 0) {
      throw new Error("Нет доступных коллег");
    }
    console.log(`  → Коллеги: ${colleagueIds.join(", ")}`);

    // 7. Предлагаем коллег с правильным targetUserId
    const { response, data: suggestData } = await employeeAPI.suggestReceivers(
      prId,
      nominationId,
      {
        targetUserId: nominationTargetUserId, // ID PerformanceReviewNominationTargetUser!
        receiversIds: colleagueIds,
      },
    );

    if (!response.ok()) {
      const errorText = await response
        .text()
        .catch(() => JSON.stringify(suggestData));
      throw new Error(
        `suggestReceivers failed (${response.status()}): ${errorText}`,
      );
    }

    console.log(`  ✓ Коллеги выбраны (${colleagueIds.length} чел.)`);

    // 8. Подтверждаем/отправляем предложение коллег
    const { response: submitResp, data: submitData } =
      await employeeAPI.submitNomination(prId, nominationId, {
        targetUserId: nominationTargetUserId,
      });

    if (!submitResp.ok()) {
      const errorText = await submitResp
        .text()
        .catch(() => JSON.stringify(submitData));
      throw new Error(
        `submitNomination failed (${submitResp.status()}): ${errorText}`,
      );
    }

    console.log(`  ✓ Коллеги предложены и отправлены на утверждение`);
  }

  /**
   * Создать PR с полностью пройденными статусами
   */
  async seedAllComplete() {
    console.log("\n📊 Создание PR: Все статусы ✓");

    // Используем подчинённых менеджера (нужен хотя бы 1)
    const subordinateIds = this.getSubordinateIds(1);

    const assessment = await this.getAvailableAssessment();
    if (!assessment) throw new Error("Нет опубликованных анкет");

    // Создаём PR со всеми направлениями
    const pr = await this.createPR({
      title: TestDataHelper.generateUniqueName("v8_All_Complete"),
      directions: { self: true, head: true, colleague: true },
    });

    await this.addTargetUsers(pr.id, subordinateIds);
    await this.attachAssessment(pr.id, assessment.id);
    await this.startPR(pr.id);

    // Заполняем все анкеты
    await this.fillQuestionnaires(pr.id);

    this.prCache.ALL_COMPLETE = pr;
    return pr;
  }

  /**
   * Создать все тестовые сценарии
   * @returns {Promise<Object>} Объект с созданными PR
   */
  async seedAllStatusScenarios() {
    console.log("═".repeat(60));
    console.log("🚀 Создание тестовых данных для статусов дашборда");
    console.log("═".repeat(60));

    const results = {};

    try {
      // 1. Самооценка пройдена, руководитель в ожидании
      results.SELF_COMPLETE_MANAGER_AWAITING =
        await this.seedSelfCompleteManagerAwaiting();
    } catch (e) {
      console.error("❌ Ошибка seedSelfCompleteManagerAwaiting:", e.message);
    }

    try {
      // 2. Все в ожидании
      results.ALL_AWAITING = await this.seedAllAwaiting();
    } catch (e) {
      console.error("❌ Ошибка seedAllAwaiting:", e.message);
    }

    try {
      // 3. Коллеги не утверждены
      results.COLLEAGUES_NOT_APPROVED = await this.seedColleaguesNotApproved();
    } catch (e) {
      console.error("❌ Ошибка seedColleaguesNotApproved:", e.message);
    }

    try {
      // 4. Все пройдены
      results.ALL_COMPLETE = await this.seedAllComplete();
    } catch (e) {
      console.error("❌ Ошибка seedAllComplete:", e.message);
    }

    console.log("\n═".repeat(60));
    console.log("✅ Создание тестовых данных завершено");
    console.log("═".repeat(60));

    // Выводим сводку
    console.log("\n📋 Созданные PR:");
    for (const [key, pr] of Object.entries(results)) {
      if (pr) {
        console.log(`  ${key}: ${pr.title} (ID: ${pr.id})`);
      }
    }

    return results;
  }

  /**
   * Проверить наличие тестовых данных
   * Ищет PR по паттерну названия
   * ВАЖНО: Исключает архивированные PR (они готовятся к удалению)
   */
  async checkExistingData() {
    const { data } = await this.prAPI.getList();
    const rawItems = data?.items || data;
    const items = Array.isArray(rawItems) ? rawItems : [];

    // Фильтруем тестовые PR, но исключаем архивированные
    const testPRs = items.filter((pr) => {
      // Пропускаем архивированные PR
      if (pr.archivedAt) {
        return false;
      }

      // Проверяем паттерн названия
      return (
        pr.title?.includes("v8_Self✓_Manager") ||
        pr.title?.includes("v8_All_Awaiting") ||
        pr.title?.includes("v8_Colleagues_NotApproved") ||
        pr.title?.includes("v8_All_Complete") ||
        pr.title?.includes("Status Test PR")
      );
    });

    return {
      hasData: testPRs.length > 0,
      prs: testPRs,
    };
  }

  /**
   * Получить или создать тестовые данные
   * Если данные уже есть - возвращает их, иначе создаёт новые
   */
  async getOrSeedData() {
    const existing = await this.checkExistingData();

    if (existing.hasData) {
      console.log(`✓ Найдены существующие тестовые PR: ${existing.prs.length}`);

      // Возвращаем существующие данные
      const results = {};
      for (const pr of existing.prs) {
        if (pr.title?.includes("v8_Self✓_Manager")) {
          results.SELF_COMPLETE_MANAGER_AWAITING = pr;
        } else if (pr.title?.includes("v8_All_Awaiting")) {
          results.ALL_AWAITING = pr;
        } else if (pr.title?.includes("v8_Colleagues_NotApproved")) {
          results.COLLEAGUES_NOT_APPROVED = pr;
        } else if (pr.title?.includes("v8_All_Complete")) {
          results.ALL_COMPLETE = pr;
        }
      }

      return results;
    }

    // Создаём новые данные
    return this.seedAllStatusScenarios();
  }

  /**
   * Очистить созданные тестовые данные
   */
  async cleanup() {
    console.log("🧹 Очистка тестовых данных...");

    for (const prId of this.createdData.prs) {
      try {
        await this.prAPI.remove(prId);
        console.log(`  ✓ PR ${prId} удалён`);
      } catch (e) {
        console.warn(`  ⚠️ Не удалось удалить PR ${prId}:`, e.message);
      }
    }

    this.createdData.prs = [];
    console.log("✓ Очистка завершена");
  }
}
