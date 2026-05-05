// tests/utils/seed/DashboardTeamSeed.js
/**
 * Seed данные для тестирования дашборда руководителя "Моя команда"
 *
 * Создаёт подчинённых с разными статусами прохождения PR:
 * - "Коллеги не предложены" (красный)
 * - "Коллеги не утверждены" (оранжевый)
 * - "В процессе" (жёлтый)
 * - "Пройдена" (зелёный)
 * - "Не пройдена" (серый)
 *
 * ## Использование:
 * ```javascript
 * const seed = new DashboardTeamSeed(request);
 * await seed.init();
 * const result = await seed.seedTeamWithStatuses();
 * ```
 */

import { PerformanceReviewAPI } from "../api/PerformanceReviewAPI.js";
import { DashboardTeamAPI } from "../api/DashboardTeamAPI.js";
import { getCredentials } from "../credentials.js";

/**
 * Статусы прохождения для тестов
 */
export const TEST_STATUSES = {
  /** Коллеги не предложены - красный */
  COLLEAGUES_NOT_PROPOSED: "colleagues_not_proposed",
  /** Коллеги предложены, не утверждены - оранжевый */
  COLLEAGUES_NOT_APPROVED: "colleagues_not_approved",
  /** В процессе - жёлтый */
  IN_PROGRESS: "in_progress",
  /** Пройдена - зелёный */
  COMPLETED: "completed",
  /** Не пройдена / не начата - серый */
  NOT_COMPLETED: "not_completed",
};

/**
 * Seed helper для подготовки данных дашборда руководителя
 */
export class DashboardTeamSeed {
  constructor(request) {
    this.request = request;
    this.prAPI = null;
    this.dashboardAPI = null;
    this.managerId = null;
    this.prId = null;

    // Созданные данные
    this.createdData = {
      prId: null,
      managerId: null,
      subordinates: [],
    };
  }

  /**
   * Инициализация API клиентов
   * @param {string} [role='manager'] - Роль для авторизации
   */
  async init(role = "manager") {
    const { email, password } = getCredentials(role);

    this.prAPI = new PerformanceReviewAPI(this.request);
    await this.prAPI.signIn(email, password);

    this.dashboardAPI = new DashboardTeamAPI(this.request);
    await this.dashboardAPI.signIn(email, password);

    // Получаем ID текущего пользователя (руководителя)
    const { data: myInfo } = await this.dashboardAPI.getMyInfo();
    this.managerId = myInfo?.id || myInfo?.userId;

    console.log(`✓ Инициализация как ${role} (ID: ${this.managerId})`);

    return this;
  }

  /**
   * Найти активный PR с подчинёнными руководителя
   * @returns {Promise<Object|null>}
   */
  async findActivePRWithSubordinates() {
    // Получаем список PR для фильтров дашборда
    const { data: prs } = await this.dashboardAPI.getDashboardFiltersPRs();
    const rawPrs = prs?.items || prs;
    const prList = Array.isArray(rawPrs) ? rawPrs : [];

    console.log(`✓ Найдено PR: ${prList.length}`);

    for (const pr of prList) {
      // Проверяем наличие target users (подчинённых)
      const { data: targetUsers } =
        await this.dashboardAPI.getDashboardFiltersTargetUsers(pr.id);
      const rawUsers = targetUsers?.items || targetUsers;
      const users = Array.isArray(rawUsers) ? rawUsers : [];

      if (users.length > 0) {
        console.log(
          `✓ PR "${pr.title}" (ID: ${pr.id}) имеет ${users.length} оцениваемых`,
        );
        return { pr, targetUsers: users };
      }
    }

    console.log("⚠️ Не найден активный PR с подчинёнными");
    return null;
  }

  /**
   * Получить текущие статусы подчинённых
   * @param {string} prId - ID Performance Review
   * @returns {Promise<Array>}
   */
  async getSubordinatesStatuses(prId) {
    const { statuses } = await this.dashboardAPI.getSubordinatesStatuses(prId);
    return statuses;
  }

  /**
   * Получить данные для конкретного подчинённого
   * @param {string} prId - ID PR
   * @param {string} userId - ID пользователя
   * @returns {Promise<Object>}
   */
  async getSubordinateData(prId, userId) {
    const { data: dashboard } = await this.dashboardAPI.getDashboard(prId, {
      usersQuery: { userIds: [userId] },
    });

    return dashboard;
  }

  /**
   * Получить информацию о номинации для подчинённого
   * @param {string} prId - ID PR
   * @param {string} revisionId - ID ревизии
   * @returns {Promise<Object|null>}
   */
  async getNominationInfo(prId, revisionId) {
    try {
      const { data } = await this.dashboardAPI.getNominationByRevision(
        prId,
        revisionId,
      );
      return data;
    } catch (e) {
      console.log(`⚠️ Номинация не найдена: ${e.message}`);
      return null;
    }
  }

  /**
   * Утвердить предложенных коллег для подчинённого
   * @param {string} prId - ID PR
   * @param {Array<string>} userIds - IDs подчинённых
   * @returns {Promise<boolean>}
   */
  async approveColleaguesForUsers(prId, userIds) {
    try {
      const { response } = await this.dashboardAPI.approveSuggestions(prId, {
        usersIds: userIds,
      });
      if (response.ok()) {
        console.log(`✓ Коллеги утверждены для ${userIds.length} пользователей`);
        return true;
      } else {
        console.log(`⚠️ Ошибка утверждения: ${response.status()}`);
        return false;
      }
    } catch (e) {
      console.log(`⚠️ Ошибка утверждения коллег: ${e.message}`);
      return false;
    }
  }

  /**
   * Пропустить ожидание предложений для подчинённых
   * @param {string} prId - ID PR
   * @param {Array<string>} userIds - IDs подчинённых
   * @returns {Promise<boolean>}
   */
  async skipNominationForUsers(prId, userIds) {
    try {
      const { response } = await this.dashboardAPI.skipSuggestionAwaiting(
        prId,
        { usersIds: userIds },
      );
      if (response.ok()) {
        console.log(
          `✓ Номинация пропущена для ${userIds.length} пользователей`,
        );
        return true;
      }
      return false;
    } catch (e) {
      console.log(`⚠️ Ошибка пропуска номинации: ${e.message}`);
      return false;
    }
  }

  /**
   * Собрать полную информацию о команде для тестов
   * @param {string} prId - ID PR
   * @returns {Promise<Object>}
   */
  async collectTeamInfo(prId) {
    console.log(`\n📊 Сбор информации о команде для PR ${prId}...`);

    // Получаем ревизии
    const { data: revisions } =
      await this.dashboardAPI.getDashboardFiltersRevisions(prId);
    const rawRevisions = revisions?.items || revisions;
    const revisionList = Array.isArray(rawRevisions) ? rawRevisions : [];
    const latestRevision = revisionList[0];

    console.log(`  Ревизий: ${revisionList.length}`);

    // Получаем target users
    const { data: targetUsers } =
      await this.dashboardAPI.getDashboardFiltersTargetUsers(prId);
    const rawTU = targetUsers?.items || targetUsers;
    const users = Array.isArray(rawTU) ? rawTU : [];

    console.log(`  Оцениваемых: ${users.length}`);

    // Получаем прогресс для каждого
    const userIds = users.map((u) => u.id || u.userId);

    let progresses = [];
    if (userIds.length > 0 && latestRevision) {
      const { data: progressData } =
        await this.dashboardAPI.getDashboardProgresses(prId, {
          revisionId: latestRevision.id,
          targetUsersIds: userIds,
        });
      const raw = progressData?.items || progressData;
      progresses = Array.isArray(raw) ? raw : [];
    }

    // Собираем информацию по каждому подчинённому
    const subordinatesInfo = users.map((user) => {
      const userId = user.id || user.userId;
      const progress =
        progresses.find((p) => (p.userId || p.id) === userId) || {};

      return {
        id: userId,
        name:
          user.name || user.fullName || `${user.firstName} ${user.lastName}`,
        progress,
        // Статусы по направлениям будут здесь
        directions: progress.directions || {},
      };
    });

    console.log("\n  Подчинённые:");
    for (const sub of subordinatesInfo) {
      console.log(`    - ${sub.name} (ID: ${sub.id})`);
    }

    return {
      prId,
      revision: latestRevision,
      revisionId: latestRevision?.id,
      subordinates: subordinatesInfo,
      targetUsers: users,
    };
  }

  /**
   * Определить статус подчинённого на основе прогресса
   * @param {Object} progress - Данные прогресса
   * @returns {string}
   */
  determineStatus(progress) {
    if (!progress || Object.keys(progress).length === 0) {
      return TEST_STATUSES.NOT_COMPLETED;
    }

    // Проверяем статус номинации
    if (progress.nominationStatus === "not_proposed") {
      return TEST_STATUSES.COLLEAGUES_NOT_PROPOSED;
    }

    if (
      progress.nominationStatus === "proposed" ||
      progress.nominationStatus === "awaiting_approval"
    ) {
      return TEST_STATUSES.COLLEAGUES_NOT_APPROVED;
    }

    // Проверяем прогресс заполнения
    const directions = progress.directions || {};
    const directionStatuses = Object.values(directions);

    if (directionStatuses.length === 0) {
      return TEST_STATUSES.NOT_COMPLETED;
    }

    const allCompleted = directionStatuses.every(
      (d) => d.status === "completed" || d.progress === 100,
    );
    const anyInProgress = directionStatuses.some(
      (d) => d.status === "in_progress" || (d.progress > 0 && d.progress < 100),
    );

    if (allCompleted) {
      return TEST_STATUSES.COMPLETED;
    }

    if (anyInProgress) {
      return TEST_STATUSES.IN_PROGRESS;
    }

    return TEST_STATUSES.NOT_COMPLETED;
  }

  /**
   * Получить подчинённых сгруппированных по статусам
   * @param {string} prId - ID PR
   * @returns {Promise<Object>}
   */
  async getSubordinatesByStatus(prId) {
    const teamInfo = await this.collectTeamInfo(prId);

    const byStatus = {
      [TEST_STATUSES.COLLEAGUES_NOT_PROPOSED]: [],
      [TEST_STATUSES.COLLEAGUES_NOT_APPROVED]: [],
      [TEST_STATUSES.IN_PROGRESS]: [],
      [TEST_STATUSES.COMPLETED]: [],
      [TEST_STATUSES.NOT_COMPLETED]: [],
    };

    for (const sub of teamInfo.subordinates) {
      const status = this.determineStatus(sub.progress);
      sub.determinedStatus = status;
      byStatus[status].push(sub);
    }

    console.log("\n📊 Статусы подчинённых:");
    for (const [status, subs] of Object.entries(byStatus)) {
      if (subs.length > 0) {
        console.log(`  ${status}: ${subs.length}`);
        for (const s of subs) {
          console.log(`    - ${s.name}`);
        }
      }
    }

    return {
      ...teamInfo,
      byStatus,
    };
  }

  /**
   * Проверить что есть подчинённые с нужными статусами для тестов
   * @param {string} prId - ID PR
   * @returns {Promise<Object>}
   */
  async verifyTestData(prId) {
    const { byStatus, ...rest } = await this.getSubordinatesByStatus(prId);

    const hasData = {
      hasColleaguesNotProposed:
        byStatus[TEST_STATUSES.COLLEAGUES_NOT_PROPOSED].length > 0,
      hasColleaguesNotApproved:
        byStatus[TEST_STATUSES.COLLEAGUES_NOT_APPROVED].length > 0,
      hasInProgress: byStatus[TEST_STATUSES.IN_PROGRESS].length > 0,
      hasCompleted: byStatus[TEST_STATUSES.COMPLETED].length > 0,
      hasNotCompleted: byStatus[TEST_STATUSES.NOT_COMPLETED].length > 0,
    };

    console.log("\n✅ Проверка тестовых данных:");
    console.log(
      `  Коллеги не предложены: ${hasData.hasColleaguesNotProposed ? "✓" : "✗"}`,
    );
    console.log(
      `  Коллеги не утверждены: ${hasData.hasColleaguesNotApproved ? "✓" : "✗"}`,
    );
    console.log(`  В процессе: ${hasData.hasInProgress ? "✓" : "✗"}`);
    console.log(`  Пройдена: ${hasData.hasCompleted ? "✓" : "✗"}`);
    console.log(`  Не пройдена: ${hasData.hasNotCompleted ? "✓" : "✗"}`);

    return {
      ...rest,
      byStatus,
      hasData,
      isReady: Object.values(hasData).some((v) => v), // Хотя бы один статус есть
    };
  }
}
