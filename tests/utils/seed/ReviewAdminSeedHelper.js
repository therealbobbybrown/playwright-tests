/**
 * Хелпер для создания тестовых данных для фичи "review_admin"
 *
 * review_admin = ДВА условия одновременно:
 * 1. Permission `manageOwnPerformanceReview` (id=12) в кастомной роли
 * 2. Назначение администратором конкретного PR через performance_review_managers
 *
 * Создаёт:
 * - Кастомную роль с permission id=12
 * - Назначает роль обычному сотруднику
 * - Назначает сотрудника администратором PR
 */

import {
  PerformanceReviewAPI,
  RolesAPI,
  getCredentials,
} from "../api/index.js";
import { PerformanceReviewSeedHelper } from "./PerformanceReviewSeedHelper.js";

/** ID permission `manageOwnPerformanceReview` */
const MANAGE_OWN_PR_PERMISSION_ID = 12;

/** Permissions для review_admin роли — ТОЛЬКО permission 12.
 *  Permission 21 (viewDashboard) = "Может просматривать аналитику по всем сотрудникам"
 *  и даёт ПОЛНЫЙ доступ ко ВСЕМ PR. review_admin получает доступ к дашборду
 *  через назначение администратором конкретного PR, а не через permission 21. */
const REVIEW_ADMIN_PERMISSIONS = [MANAGE_OWN_PR_PERMISSION_ID];

/** ID системной роли "Manager" (Администратор) */
const MANAGER_ROLE_ID = 1;

/** Префикс для ролей, созданных этим хелпером */
const ROLE_TITLE_PREFIX = "E2E_ReviewAdmin";

export class ReviewAdminSeedHelper {
  /**
   * @param {import('@playwright/test').APIRequestContext} request
   */
  constructor(request) {
    this.request = request;
    this.prAPI = null;
    this.rolesAPI = null;
    this._adminUserId = null;
  }

  /**
   * Инициализировать API с авторизацией
   * @param {'admin' | 'admin2'} role
   */
  async init(role = "admin") {
    const { email, password } = getCredentials(role);

    this.prAPI = new PerformanceReviewAPI(this.request);
    await this.prAPI.signIn(email, password);

    this.rolesAPI = new RolesAPI(this.request);
    await this.rolesAPI.signIn(email, password);

    // Сохраняем userId админа чтобы не выбрать его как baseUser
    try {
      const { data: me } = await this.rolesAPI.getCurrentUser();
      this._adminUserId =
        me?.currentUserId || me?.userId || me?.id || me?.user?.id || null;
      console.log(
        `[ReviewAdminSeed] Admin userId: ${this._adminUserId}, keys: ${JSON.stringify(Object.keys(me || {}))}`,
      );
    } catch (e) {
      console.warn(
        `[ReviewAdminSeed] Не удалось получить userId админа: ${e.message}`,
      );
    }
  }

  /**
   * Найти обычного сотрудника для назначения review_admin
   * @returns {Promise<{userId: number, email: string, firstName: string, lastName: string}>}
   */
  async findBaseUser() {
    if (!this.prAPI) {
      throw new Error(
        "ReviewAdminSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const { data } = await this.prAPI.get(
      "/manager/users/?limit=3000&category=active",
    );
    const items = data?.items || data || [];

    if (!items.length) {
      throw new Error(
        "[ReviewAdminSeed] Нет активных пользователей для назначения review_admin",
      );
    }

    // Собираем ID всех руководителей (у кого есть подчинённые).
    // Используем headUser.id из API-ответа + дополнительно проверяем
    // поле subordinatesCount (если доступно).
    const headUserIds = new Set(
      items
        .map((u) => u.headUser?.id)
        .filter(Boolean),
    );
    // Дополнительно: пользователи, у которых есть subordinatesCount > 0
    for (const u of items) {
      if ((u.subordinatesCount || 0) > 0) {
        headUserIds.add(u.id || u.userId);
      }
    }

    // Выбираем пользователя, который:
    // 1. НЕ является текущим админом
    // 2. НЕ имеет роль Manager (id=1) — только "Пользователь"
    // 3. НЕ имеет stale E2E_ReviewAdmin роль от прошлых запусков
    // 4. НЕ является руководителем (headUser кого-либо) — у руководителей
    //    есть подчинённые, что даёт доступ к "Планы развития" и пр.
    // 5. НЕ имеет кастомных ролей (кроме User id=2) — только чистый пользователь
    const candidate = items.find((u) => {
      const uid = u.id || u.userId;
      if (uid === this._adminUserId) return false;

      // Исключить руководителей (у кого есть подчинённые в выборке)
      if (headUserIds.has(uid)) return false;

      const userRoles = u.roles || [];
      const hasManagerRole = userRoles.some(
        (r) => r.id === MANAGER_ROLE_ID || r.title === "Manager",
      );
      if (hasManagerRole) return false;

      // Skip users who already have an E2E_ReviewAdmin role (stale from previous runs)
      const hasE2EReviewAdminRole = userRoles.some(
        (r) => r.title && r.title.startsWith(ROLE_TITLE_PREFIX),
      );
      if (hasE2EReviewAdminRole) return false;

      // Исключить пользователей с кастомными ролями (кроме User id=2).
      // Пользователь с кастомной ролью может иметь доп. permissions,
      // что влияет на видимость вкладок и ломает тесты tab visibility.
      const hasCustomRoles = userRoles.some(
        (r) => r.id !== 2 && !r.title?.startsWith(ROLE_TITLE_PREFIX),
      );
      if (hasCustomRoles) return false;

      return true;
    });

    if (!candidate) {
      throw new Error(
        `[ReviewAdminSeed] Не найден подходящий пользователь. adminUserId=${this._adminUserId}, items=${items.length}, ids=[${items.slice(0, 5).map((u) => u.id || u.userId).join(",")}]`,
      );
    }

    // email в структуре /manager/users/ хранится в account.email
    const email =
      candidate.email ||
      candidate.account?.email ||
      candidate.user?.email;
    if (!email) {
      // Если email недоступен, получаем детали через getManagerUserById
      const { data: fullUser } = await this.rolesAPI.getManagerUserById(
        candidate.id || candidate.userId,
      );
      const resolvedEmail =
        fullUser?.email ||
        fullUser?.account?.email ||
        fullUser?.user?.email;
      if (!resolvedEmail) {
        throw new Error(
          `[ReviewAdminSeed] Не удалось получить email пользователя ${candidate.id}. Keys: ${JSON.stringify(Object.keys(fullUser || {}))}`,
        );
      }
      candidate.email = resolvedEmail;
    } else {
      candidate.email = email;
    }

    // Post-validation: проверяем, что у кандидата нет подчинённых.
    // API /manager/users/ может не показать всех подчинённых (awaiting, неактивные),
    // поэтому логинимся за кандидата и проверяем через /private/org-struct/me/is-head.
    const testUserPassword = process.env.TEST_USER_PASSWORD || "DemoPass_7421!";
    try {
      const checkAPI = new PerformanceReviewAPI(this.request);
      await checkAPI.signIn(candidate.email, testUserPassword);
      const { data: isHeadData } = await checkAPI.get(
        "/private/org-struct/me/is-head",
      );
      // isHead может вернуть { isHead: true } или true или { data: true }
      const isHead =
        isHeadData === true ||
        isHeadData?.isHead === true ||
        isHeadData?.data === true;
      if (isHead) {
        console.log(
          `[ReviewAdminSeed] Кандидат ${candidate.firstName} ${candidate.lastName} (id=${candidate.id}) является руководителем — пропускаем`,
        );
        // Ищем следующего кандидата без подчинённых
        const remainingItems = items.slice(items.indexOf(candidate) + 1);
        const nextCandidate = remainingItems.find((u) => {
          const uid = u.id || u.userId;
          if (uid === this._adminUserId) return false;
          if (headUserIds.has(uid)) return false;
          const userRoles = u.roles || [];
          if (userRoles.some((r) => r.id === MANAGER_ROLE_ID || r.title === "Manager")) return false;
          if (userRoles.some((r) => r.title && r.title.startsWith(ROLE_TITLE_PREFIX))) return false;
          if (userRoles.some((r) => r.id !== 2 && !r.title?.startsWith(ROLE_TITLE_PREFIX))) return false;
          return true;
        });
        if (nextCandidate) {
          // Рекурсивно заменяем кандидата (resolve email + is-head check сделаем при следующем вызове)
          const nextEmail =
            nextCandidate.email || nextCandidate.account?.email || nextCandidate.user?.email;
          if (nextEmail) {
            nextCandidate.email = nextEmail;
          } else {
            const { data: fullUser } = await this.rolesAPI.getManagerUserById(
              nextCandidate.id || nextCandidate.userId,
            );
            nextCandidate.email = fullUser?.email || fullUser?.account?.email || fullUser?.user?.email;
          }
          console.log(
            `[ReviewAdminSeed] Найден baseUser: ${nextCandidate.firstName} ${nextCandidate.lastName} (id=${nextCandidate.id}, email=${nextCandidate.email})`,
          );
          const nextUserId = nextCandidate.id || nextCandidate.userId;
          return {
            userId: nextUserId,
            email: nextCandidate.email,
            firstName: nextCandidate.firstName || "User",
            lastName: nextCandidate.lastName || String(nextUserId),
          };
        }
        throw new Error(
          "[ReviewAdminSeed] Все кандидаты являются руководителями — нет подходящего пользователя без подчинённых",
        );
      }
    } catch (e) {
      // Если не удалось проверить is-head — продолжаем с текущим кандидатом
      if (!e.message.includes("руководителями")) {
        console.warn(
          `[ReviewAdminSeed] Не удалось проверить is-head для ${candidate.email}: ${e.message}`,
        );
      } else {
        throw e;
      }
    }

    console.log(
      `[ReviewAdminSeed] Найден baseUser: ${candidate.firstName} ${candidate.lastName} (id=${candidate.id}, email=${candidate.email})`,
    );

    const userId = candidate.id || candidate.userId;
    return {
      userId,
      email: candidate.email,
      firstName: candidate.firstName || "User",
      lastName: candidate.lastName || String(userId),
    };
  }

  /**
   * Найти существующую роль E2E_ReviewAdmin или создать новую
   * @returns {Promise<{roleId: number, title: string, created: boolean}>}
   */
  async findOrCreateReviewAdminRole() {
    if (!this.rolesAPI) {
      throw new Error(
        "ReviewAdminSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    // Ищем существующую роль с префиксом E2E_ReviewAdmin
    const { data: rolesData } = await this.rolesAPI.getRoles({
      limit: 100,
      offset: 0,
    });
    const roles = rolesData?.items || rolesData || [];

    const existing = roles.find(
      (r) => r.title && r.title.startsWith(ROLE_TITLE_PREFIX),
    );

    if (existing) {
      // Проверяем что роль содержит все нужные permissions
      const existingPermIds =
        existing.permissions?.map((p) => p.id) ||
        existing.permissionsIds ||
        [];
      const hasAllPerms = REVIEW_ADMIN_PERMISSIONS.every((id) =>
        existingPermIds.includes(id),
      );

      if (hasAllPerms) {
        console.log(
          `[ReviewAdminSeed] Найдена существующая роль: "${existing.title}" (id=${existing.id})`,
        );
        return { roleId: existing.id, title: existing.title, created: false };
      }

      // Роль существует, но permissions неполные — обновляем
      console.log(
        `[ReviewAdminSeed] Роль "${existing.title}" (id=${existing.id}) имеет неполные permissions [${existingPermIds}], обновляем до [${REVIEW_ADMIN_PERMISSIONS}]`,
      );
      await this.rolesAPI.updateRole(existing.id, {
        title: existing.title,
        permissionsIds: REVIEW_ADMIN_PERMISSIONS,
      });
      return { roleId: existing.id, title: existing.title, created: false };
    }

    // Создаём новую роль
    const title = `${ROLE_TITLE_PREFIX}_${Date.now()}`;
    const { response, data: newRole } = await this.rolesAPI.createRole({
      title,
      permissionsIds: REVIEW_ADMIN_PERMISSIONS,
    });

    if (!response.ok()) {
      const errorText = await response.text();
      throw new Error(
        `[ReviewAdminSeed] Не удалось создать роль: ${errorText}`,
      );
    }

    console.log(
      `[ReviewAdminSeed] Создана роль: "${title}" (id=${newRole.id})`,
    );
    return { roleId: newRole.id, title, created: true };
  }

  /**
   * Назначить роль пользователю, сохранив существующие роли
   * @param {number} userId
   * @param {number} roleId
   * @returns {Promise<number[]>} Предыдущие roleIds для cleanup
   */
  async assignRoleToUser(userId, roleId) {
    if (!this.rolesAPI) {
      throw new Error(
        "ReviewAdminSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    // Получаем текущие роли пользователя
    const previousRoleIds = await this.rolesAPI.getUserRoleIds(userId);
    console.log(
      `[ReviewAdminSeed] Текущие роли пользователя ${userId}: [${previousRoleIds.join(", ")}]`,
    );

    // Если роль уже назначена — не дублируем
    if (previousRoleIds.includes(roleId)) {
      console.log(
        `[ReviewAdminSeed] Роль ${roleId} уже назначена пользователю ${userId}`,
      );
      return previousRoleIds;
    }

    // Добавляем новую роль к существующим
    const newRoleIds = [...previousRoleIds, roleId];
    const { response } = await this.rolesAPI.assignRolesToUser(
      userId,
      newRoleIds,
    );

    if (!response.ok()) {
      const errorText = await response.text();
      throw new Error(
        `[ReviewAdminSeed] Не удалось назначить роль ${roleId} пользователю ${userId}: ${errorText}`,
      );
    }

    console.log(
      `[ReviewAdminSeed] Роль ${roleId} назначена пользователю ${userId}. Роли: [${newRoleIds.join(", ")}]`,
    );
    return previousRoleIds;
  }

  /**
   * Добавить userId в администраторы PR
   * @param {number|string} prId
   * @param {number} userId
   * @returns {Promise<void>}
   */
  async assignAsAdminToPR(prId, userId) {
    if (!this.prAPI) {
      throw new Error(
        "ReviewAdminSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    // Получаем текущих администраторов PR
    const { data: prData } = await this.prAPI.getById(prId);
    const currentManagers = prData?.managers || [];

    // Проверяем, не назначен ли уже
    const alreadyAssigned = currentManagers.some(
      (m) => m.userId === userId || m.id === userId,
    );
    if (alreadyAssigned) {
      console.log(
        `[ReviewAdminSeed] Пользователь ${userId} уже является администратором PR ${prId}`,
      );
      return;
    }

    // Добавляем нового администратора
    const updatedManagers = [...currentManagers, { userId }];
    const { response } = await this.prAPI.update(prId, {
      managers: updatedManagers,
    });

    if (!response.ok()) {
      const errorText = await response.text();
      throw new Error(
        `[ReviewAdminSeed] Не удалось добавить пользователя ${userId} в администраторы PR ${prId}: ${errorText}`,
      );
    }

    console.log(
      `[ReviewAdminSeed] Пользователь ${userId} добавлен в администраторы PR ${prId}`,
    );
  }

  /**
   * Убрать userId из администраторов PR
   * @param {number|string} prId
   * @param {number} userId
   * @returns {Promise<void>}
   */
  async removeAsAdminFromPR(prId, userId) {
    if (!this.prAPI) {
      throw new Error(
        "ReviewAdminSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    try {
      const { data: prData } = await this.prAPI.getById(prId);
      const currentManagers = prData?.managers || [];

      const updatedManagers = currentManagers.filter(
        (m) => m.userId !== userId && m.id !== userId,
      );

      const { response } = await this.prAPI.update(prId, {
        managers: updatedManagers,
      });

      if (!response.ok()) {
        console.warn(
          `[ReviewAdminSeed] Не удалось убрать пользователя ${userId} из администраторов PR ${prId}`,
        );
      } else {
        console.log(
          `[ReviewAdminSeed] Пользователь ${userId} убран из администраторов PR ${prId}`,
        );
      }
    } catch (e) {
      console.warn(
        `[ReviewAdminSeed] Ошибка при удалении администратора PR: ${e.message}`,
      );
    }
  }

  /**
   * Seed только роли (БЕЗ назначения администратором PR).
   * Для тестов: "permission есть, но PR не назначен → дашборд доступен, но данных PR нет"
   * @returns {Promise<{userId: number, roleId: number, email: string, firstName: string, lastName: string, previousRoleIds: number[], roleCreated: boolean}>}
   */
  async seedRoleOnly() {
    console.log("[ReviewAdminSeed] === Начало seedRoleOnly (без PR) ===");

    const baseUser = await this.findBaseUser();

    const { roleId, title: roleTitle, created: roleCreated } =
      await this.findOrCreateReviewAdminRole();

    const previousRoleIds = await this.assignRoleToUser(
      baseUser.userId,
      roleId,
    );

    // Убедимся что пользователь НЕ назначен администратором ни одного PR
    await this.removeAllPRAdminAssignments(baseUser.userId);

    console.log("[ReviewAdminSeed] === seedRoleOnly завершён ===");
    console.log(`  - User: ${baseUser.firstName} ${baseUser.lastName} (id=${baseUser.userId}, email=${baseUser.email})`);
    console.log(`  - Role: ${roleTitle} (id=${roleId})`);
    console.log(`  - PR assignments: NONE (removed)`);

    return {
      userId: baseUser.userId,
      roleId,
      email: baseUser.email,
      firstName: baseUser.firstName,
      lastName: baseUser.lastName,
      previousRoleIds,
      roleCreated,
    };
  }

  /**
   * Убрать пользователя из администраторов ВСЕХ PR
   * @param {number} userId
   * @returns {Promise<number[]>} Список prId, из которых пользователь был убран
   */
  async removeAllPRAdminAssignments(userId) {
    if (!this.prAPI) {
      throw new Error(
        "ReviewAdminSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const removedFrom = [];
    try {
      const { data } = await this.prAPI.getList();
      const prs = data?.items || data || [];

      for (const pr of prs) {
        const prId = pr.id || pr.prId;
        // Списочный API может не возвращать managers — проверяем через getById
        let managers = pr.managers;
        if (!managers || managers.length === 0) {
          try {
            const { data: fullPR } = await this.prAPI.getById(prId);
            managers = fullPR?.managers || [];
          } catch {
            continue;
          }
        }
        const isAssigned = managers.some(
          (m) => m.userId === userId || m.id === userId,
        );
        if (isAssigned) {
          await this.removeAsAdminFromPR(prId, userId);
          removedFrom.push(prId);
        }
      }

      if (removedFrom.length > 0) {
        console.log(
          `[ReviewAdminSeed] Пользователь ${userId} убран из администраторов PR: [${removedFrom.join(", ")}]`,
        );
      } else {
        console.log(
          `[ReviewAdminSeed] Пользователь ${userId} не назначен администратором ни одного PR`,
        );
      }
    } catch (e) {
      console.warn(
        `[ReviewAdminSeed] Ошибка при удалении всех PR-назначений: ${e.message}`,
      );
    }

    return removedFrom;
  }

  /**
   * Убрать роль E2E_ReviewAdmin у пользователя (оставить только предыдущие роли)
   * @param {number} userId
   * @param {number[]} previousRoleIds — роли до назначения review_admin
   * @returns {Promise<void>}
   */
  async removeReviewAdminRole(userId, previousRoleIds) {
    if (!this.rolesAPI) {
      throw new Error(
        "ReviewAdminSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const { response } = await this.rolesAPI.assignRolesToUser(
      userId,
      previousRoleIds,
    );

    if (!response.ok()) {
      const errorText = await response.text();
      throw new Error(
        `[ReviewAdminSeed] Не удалось восстановить роли пользователю ${userId}: ${errorText}`,
      );
    }

    console.log(
      `[ReviewAdminSeed] Роль review_admin убрана у пользователя ${userId}. Роли: [${previousRoleIds.join(", ")}]`,
    );
  }

  /**
   * Очистить stale PR admin назначения через dashboard-filters.
   * Логинится за пользователя (у которого уже есть permission [12]),
   * получает список доступных PR и удаляет назначения на все PR кроме текущего.
   * @param {number} userId
   * @param {string} email
   * @param {number|string} keepPrId - PR, который нужно оставить
   */
  async _cleanupStalePRAssignmentsViaDashboard(userId, email, keepPrId) {
    try {
      const testUserPassword = process.env.TEST_USER_PASSWORD || "DemoPass_7421!";
      const checkAPI = new PerformanceReviewAPI(this.request);
      await checkAPI.signIn(email, testUserPassword);

      const { response, data } =
        await checkAPI.getDashboardFiltersPerformanceReviews();

      if (!response.ok()) return;

      const prList = Array.isArray(data) ? data : data?.items || [];
      const stalePRs = prList.filter(
        (pr) => String(pr.id) !== String(keepPrId),
      );

      if (stalePRs.length === 0) {
        console.log(
          `[ReviewAdminSeed] Нет stale PR назначений для userId=${userId}`,
        );
        return;
      }

      console.log(
        `[ReviewAdminSeed] Найдено ${stalePRs.length} stale PR назначений для userId=${userId}: [${stalePRs.map((p) => p.id).join(", ")}]`,
      );

      for (const pr of stalePRs) {
        await this.removeAsAdminFromPR(pr.id, userId);
      }

      console.log(
        `[ReviewAdminSeed] Все stale PR назначения удалены для userId=${userId}`,
      );
    } catch (e) {
      console.warn(
        `[ReviewAdminSeed] Ошибка при очистке stale PR: ${e.message}`,
      );
    }
  }

  /**
   * Полный цикл seed:
   * 1. Найти baseUser
   * 2. Найти/создать роль E2E_ReviewAdmin
   * 3. Назначить роль пользователю
   * 4. Найти или создать PR
   * 5. Назначить пользователя администратором PR
   * @returns {Promise<{userId: number, roleId: number, prId: string|number, email: string, previousRoleIds: number[], roleCreated: boolean}>}
   */
  async seedFullSetup() {
    console.log("[ReviewAdminSeed] === Начало полного seed ===");

    // 1. Найти обычного сотрудника
    const baseUser = await this.findBaseUser();

    // 2. Найти или создать роль
    const { roleId, title: roleTitle, created: roleCreated } =
      await this.findOrCreateReviewAdminRole();

    // 3. Назначить роль пользователю
    const previousRoleIds = await this.assignRoleToUser(
      baseUser.userId,
      roleId,
    );

    // 3.5. Убрать stale PR admin assignments (от прошлых запусков тестов)
    await this.removeAllPRAdminAssignments(baseUser.userId);

    // 4. Найти или создать PR
    const prSeedHelper = new PerformanceReviewSeedHelper(this.request);
    await prSeedHelper.init("admin");

    let prId;
    const existingPR = await prSeedHelper.findValidPRForMyTeam(1);
    if (existingPR) {
      prId = existingPR.prId;
      console.log(`[ReviewAdminSeed] Найден существующий PR: ${prId}`);
    } else {
      const newPR = await prSeedHelper.seedActivePR();
      prId = newPR.id;
      console.log(`[ReviewAdminSeed] Создан новый PR: ${prId}`);
    }

    // 5. Назначить администратором PR
    await this.assignAsAdminToPR(prId, baseUser.userId);

    // 6. Проверить и удалить stale PR admin назначения через dashboard-filters.
    // После назначения роли permission [12] и admin одного PR, dashboard-filters
    // вернёт ВСЕ PR, где пользователь назначен admin (включая stale от прошлых запусков).
    // Удаляем лишние назначения, оставляя только текущий prId.
    await this._cleanupStalePRAssignmentsViaDashboard(
      baseUser.userId,
      baseUser.email,
      prId,
    );

    console.log("[ReviewAdminSeed] === Seed завершён ===");
    console.log(`  - User: ${baseUser.firstName} ${baseUser.lastName} (id=${baseUser.userId}, email=${baseUser.email})`);
    console.log(`  - Role: ${roleTitle} (id=${roleId})`);
    console.log(`  - PR: ${prId}`);

    return {
      userId: baseUser.userId,
      roleId,
      prId,
      email: baseUser.email,
      firstName: baseUser.firstName,
      lastName: baseUser.lastName,
      previousRoleIds,
      roleCreated,
    };
  }

  /**
   * Откат всех изменений seed
   * @param {Object} setupData
   * @param {number} setupData.userId
   * @param {number} setupData.roleId
   * @param {number|string} setupData.prId
   * @param {number[]} setupData.previousRoleIds
   * @param {boolean} setupData.roleCreated
   */
  async cleanup(setupData) {
    console.log("[ReviewAdminSeed] === Начало cleanup ===");

    const { userId, roleId, prId, previousRoleIds, roleCreated } = setupData;

    // 1. Восстановить предыдущие роли пользователю
    try {
      if (this.rolesAPI && userId && previousRoleIds) {
        await this.rolesAPI.assignRolesToUser(userId, previousRoleIds);
        console.log(
          `[ReviewAdminSeed] Роли пользователя ${userId} восстановлены: [${previousRoleIds.join(", ")}]`,
        );
      }
    } catch (e) {
      console.warn(
        `[ReviewAdminSeed] Не удалось восстановить роли пользователя ${userId}: ${e.message}`,
      );
    }

    // 2. Удалить роль если была создана нами
    try {
      if (this.rolesAPI && roleId && roleCreated) {
        const { response } = await this.rolesAPI.deleteRole(roleId);
        if (response.ok()) {
          console.log(`[ReviewAdminSeed] Роль ${roleId} удалена`);
        } else {
          console.warn(
            `[ReviewAdminSeed] Не удалось удалить роль ${roleId}: ${response.status()}`,
          );
        }
      }
    } catch (e) {
      console.warn(
        `[ReviewAdminSeed] Не удалось удалить роль ${roleId}: ${e.message}`,
      );
    }

    // 3. Убрать из администраторов PR
    try {
      if (prId && userId) {
        await this.removeAsAdminFromPR(prId, userId);
      }
    } catch (e) {
      console.warn(
        `[ReviewAdminSeed] Не удалось убрать из администраторов PR: ${e.message}`,
      );
    }

    console.log("[ReviewAdminSeed] === Cleanup завершён ===");
  }
}
