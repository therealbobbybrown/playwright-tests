// tests/utils/db/verifiers/RoleVerifier.js
// Верификатор для модуля ролей и разрешений (Roles & Permissions)

import { expect } from "@playwright/test";
import { BaseVerifier } from "./BaseVerifier.js";

/**
 * Верификатор для проверки данных ролей и разрешений в БД
 *
 * Структура БД:
 * - roles: таблица ролей
 * - permissions: таблица разрешений
 * - role_permissions: связь ролей и разрешений (many-to-many)
 *
 * @example
 * const role = await roleVerifier.verifyRoleCreated(roleId);
 * await roleVerifier.verifyRoleTitle(roleId, 'Admin');
 */
export class RoleVerifier extends BaseVerifier {
  /**
   * Проверить что роль создана в БД
   * @param {string|number} roleId - ID роли
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись роли или null если нет подключения
   */
  async verifyRoleCreated(roleId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const role = await this.waitForRecord("roles", { id: roleId }, timeout);
    expect(role, `Роль ${roleId} не найдена в БД`).not.toBeNull();
    return role;
  }

  /**
   * Проверить название роли
   * @param {string|number} roleId - ID роли
   * @param {string} expectedTitle - Ожидаемое название
   */
  async verifyRoleTitle(roleId, expectedTitle) {
    if (this.skipIfNotConnected()) return;
    const role = await this.db.findOne("roles", { id: roleId });
    expect(role, `Роль ${roleId} не найдена`).not.toBeNull();
    expect(role.title, `Название роли должно быть "${expectedTitle}"`).toBe(
      expectedTitle,
    );
  }

  /**
   * Проверить что роль удалена (soft delete)
   * @param {string|number} roleId - ID роли
   */
  async verifyRoleDeleted(roleId) {
    if (this.skipIfNotConnected()) return;
    const role = await this.db.findOne("roles", { id: roleId });
    // Роль либо физически удалена, либо soft delete
    if (role) {
      expect(
        role.deleted_at,
        "Роль должна быть помечена как удалённая",
      ).not.toBeNull();
    }
    // Если role === null, значит физически удалена - тоже OK
  }

  /**
   * Проверить что роль НЕ существует в БД (не создана)
   * @param {string|number} roleId - ID роли
   */
  async verifyRoleNotExists(roleId) {
    if (this.skipIfNotConnected()) return;
    const role = await this.db.findOne("roles", { id: roleId });
    expect(role, `Роль ${roleId} не должна существовать в БД`).toBeNull();
  }

  /**
   * Получить роль по ID
   * @param {string|number} roleId - ID роли
   * @returns {Promise<Object|null>}
   */
  async getRole(roleId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("roles", { id: roleId });
  }

  /**
   * Проверить количество разрешений у роли
   * @param {string|number} roleId - ID роли
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyRolePermissionsCount(roleId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    const count = await this.db.count("role_permissions", { role_id: roleId });
    expect(
      count,
      `Количество разрешений роли должно быть ${expectedCount}`,
    ).toBe(expectedCount);
  }

  /**
   * Проверить что роль имеет определённое разрешение
   * @param {string|number} roleId - ID роли
   * @param {string|number} permissionId - ID разрешения
   */
  async verifyRoleHasPermission(roleId, permissionId) {
    if (this.skipIfNotConnected()) return;
    const link = await this.db.findOne("role_permissions", {
      role_id: roleId,
      permission_id: permissionId,
    });
    expect(
      link,
      `Роль ${roleId} должна иметь разрешение ${permissionId}`,
    ).not.toBeNull();
  }

  /**
   * Получить все разрешения роли
   * @param {string|number} roleId - ID роли
   * @returns {Promise<Array>}
   */
  async getRolePermissions(roleId) {
    if (this.skipIfNotConnected()) return [];
    // Получаем ID разрешений из связующей таблицы
    const links = await this.db.findAll("role_permissions", {
      role_id: roleId,
    });
    return links;
  }

  /**
   * Проверить существование разрешения
   * @param {string|number} permissionId - ID разрешения
   * @returns {Promise<Object|null>}
   */
  async verifyPermissionExists(permissionId) {
    if (this.skipIfNotConnected()) return null;
    const permission = await this.db.findOne("permissions", {
      id: permissionId,
    });
    expect(permission, `Разрешение ${permissionId} не найдено`).not.toBeNull();
    return permission;
  }

  /**
   * Получить количество пользователей с ролью
   * @param {string|number} roleId - ID роли
   * @returns {Promise<number>}
   */
  async getUsersCountWithRole(roleId) {
    if (this.skipIfNotConnected()) return 0;
    // Обычно связь через user_roles или users.role_id
    // Сначала пробуем user_roles
    try {
      const count = await this.db.count("user_roles", { role_id: roleId });
      return count;
    } catch {
      // Если нет user_roles, пробуем users.role_id
      try {
        const count = await this.db.count("users", { role_id: roleId });
        return count;
      } catch {
        return 0;
      }
    }
  }
}
