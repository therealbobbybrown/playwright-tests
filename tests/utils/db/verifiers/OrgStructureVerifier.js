// tests/utils/db/verifiers/OrgStructureVerifier.js
// Верификатор для модуля организационной структуры (Departments, User Groups)

import { expect } from "@playwright/test";
import { BaseVerifier } from "./BaseVerifier.js";

/**
 * Верификатор для проверки данных организационной структуры в БД
 *
 * Структура БД:
 * - departments: таблица департаментов
 * - user_groups: таблица групп пользователей
 * - user_group_users: связь пользователей с группами (many-to-many)
 *
 * @example
 * const dept = await orgVerifier.verifyDepartmentExists(deptId);
 * await orgVerifier.verifyUserGroupCreated(groupId);
 */
export class OrgStructureVerifier extends BaseVerifier {
  // ==================== DEPARTMENTS ====================

  /**
   * Проверить что департамент существует в БД
   * @param {string|number} departmentId - ID департамента
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись департамента или null
   */
  async verifyDepartmentExists(departmentId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const dept = await this.waitForRecord(
      "departments",
      { id: departmentId },
      timeout,
    );
    expect(dept, `Департамент ${departmentId} не найден в БД`).not.toBeNull();
    return dept;
  }

  /**
   * Проверить название департамента
   * @param {string|number} departmentId - ID департамента
   * @param {string} expectedTitle - Ожидаемое название
   */
  async verifyDepartmentTitle(departmentId, expectedTitle) {
    if (this.skipIfNotConnected()) return;
    const dept = await this.db.findOne("departments", { id: departmentId });
    expect(dept, `Департамент ${departmentId} не найден`).not.toBeNull();
    // Название может быть в поле title или name
    const actualTitle = dept.title || dept.name;
    expect(
      actualTitle,
      `Название департамента должно быть "${expectedTitle}"`,
    ).toBe(expectedTitle);
  }

  /**
   * Получить департамент по ID
   * @param {string|number} departmentId - ID департамента
   * @returns {Promise<Object|null>}
   */
  async getDepartment(departmentId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("departments", { id: departmentId });
  }

  // ==================== USER GROUPS ====================

  /**
   * Проверить что группа пользователей создана в БД
   * @param {string|number} groupId - ID группы
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись группы или null
   */
  async verifyUserGroupCreated(groupId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const group = await this.waitForRecord(
      "user_groups",
      { id: groupId },
      timeout,
    );
    expect(
      group,
      `Группа пользователей ${groupId} не найдена в БД`,
    ).not.toBeNull();
    return group;
  }

  /**
   * Проверить название группы
   * @param {string|number} groupId - ID группы
   * @param {string} expectedTitle - Ожидаемое название
   */
  async verifyUserGroupTitle(groupId, expectedTitle) {
    if (this.skipIfNotConnected()) return;
    const group = await this.db.findOne("user_groups", { id: groupId });
    expect(group, `Группа ${groupId} не найдена`).not.toBeNull();
    expect(group.title, `Название группы должно быть "${expectedTitle}"`).toBe(
      expectedTitle,
    );
  }

  /**
   * Проверить что группа удалена (soft delete)
   * @param {string|number} groupId - ID группы
   */
  async verifyUserGroupDeleted(groupId) {
    if (this.skipIfNotConnected()) return;
    const group = await this.db.findOne("user_groups", { id: groupId });
    // Группа либо физически удалена, либо soft delete
    if (group) {
      expect(
        group.deleted_at,
        "Группа должна быть помечена как удалённая",
      ).not.toBeNull();
    }
    // Если group === null, значит физически удалена - тоже OK
  }

  /**
   * Проверить что группа НЕ существует в БД (не создана)
   * @param {string|number} groupId - ID группы
   */
  async verifyUserGroupNotExists(groupId) {
    if (this.skipIfNotConnected()) return;
    const group = await this.db.findOne("user_groups", { id: groupId });
    expect(group, `Группа ${groupId} не должна существовать в БД`).toBeNull();
  }

  /**
   * Получить группу по ID
   * @param {string|number} groupId - ID группы
   * @returns {Promise<Object|null>}
   */
  async getUserGroup(groupId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("user_groups", { id: groupId });
  }

  // ==================== GROUP MEMBERSHIP ====================

  /**
   * Проверить что пользователь состоит в группе
   * @param {string|number} groupId - ID группы
   * @param {string|number} userId - ID пользователя
   */
  async verifyUserInGroup(groupId, userId) {
    if (this.skipIfNotConnected()) return;
    const link = await this.db.findOne("user_group_users", {
      user_group_id: groupId,
      user_id: userId,
    });
    expect(
      link,
      `Пользователь ${userId} должен быть в группе ${groupId}`,
    ).not.toBeNull();
  }

  /**
   * Проверить что пользователь НЕ состоит в группе
   * @param {string|number} groupId - ID группы
   * @param {string|number} userId - ID пользователя
   */
  async verifyUserNotInGroup(groupId, userId) {
    if (this.skipIfNotConnected()) return;
    const link = await this.db.findOne("user_group_users", {
      user_group_id: groupId,
      user_id: userId,
    });
    expect(
      link,
      `Пользователь ${userId} не должен быть в группе ${groupId}`,
    ).toBeNull();
  }

  /**
   * Получить количество пользователей в группе
   * @param {string|number} groupId - ID группы
   * @returns {Promise<number>}
   */
  async getUserGroupMemberCount(groupId) {
    if (this.skipIfNotConnected()) return 0;
    return this.db.count("user_group_users", { user_group_id: groupId });
  }

  /**
   * Проверить количество пользователей в группе
   * @param {string|number} groupId - ID группы
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyUserGroupMemberCount(groupId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    const count = await this.db.count("user_group_users", {
      user_group_id: groupId,
    });
    expect(
      count,
      `Количество пользователей в группе должно быть ${expectedCount}`,
    ).toBe(expectedCount);
  }

  /**
   * Получить всех пользователей группы
   * @param {string|number} groupId - ID группы
   * @returns {Promise<Array>}
   */
  async getUserGroupMembers(groupId) {
    if (this.skipIfNotConnected()) return [];
    return this.db.findAll("user_group_users", { user_group_id: groupId });
  }

  // ==================== DEPARTMENT MEMBERSHIP ====================

  /**
   * Проверить что пользователь принадлежит департаменту
   * @param {string|number} departmentId - ID департамента
   * @param {string|number} userId - ID пользователя
   */
  async verifyUserInDepartment(departmentId, userId) {
    if (this.skipIfNotConnected()) return;
    // Обычно связь через users.department_id
    const user = await this.db.findOne("users", { id: userId });
    expect(user, `Пользователь ${userId} не найден`).not.toBeNull();
    expect(
      user.department_id,
      `Пользователь должен быть в департаменте ${departmentId}`,
    ).toBe(departmentId);
  }

  /**
   * Получить количество пользователей в департаменте
   * @param {string|number} departmentId - ID департамента
   * @returns {Promise<number>}
   */
  async getDepartmentMemberCount(departmentId) {
    if (this.skipIfNotConnected()) return 0;
    return this.db.count("users", { department_id: departmentId });
  }
}
