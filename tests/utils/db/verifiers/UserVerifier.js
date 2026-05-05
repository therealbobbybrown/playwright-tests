// tests/utils/db/verifiers/UserVerifier.js
// Верификатор для пользователей
// Адаптирован под структуру БД appraise

import { expect } from "@playwright/test";
import { BaseVerifier } from "./BaseVerifier.js";

/**
 * Верификатор для проверки данных пользователей в БД
 *
 * Структура БД:
 * - users: основная таблица пользователей
 * - accounts: аккаунты (email, пароль)
 * - user_roles: роли пользователей
 *
 * @example
 * const user = await userVerifier.verifyUserExists(userId);
 * const user = await userVerifier.findUserByEmail('user@example.com');
 */
export class UserVerifier extends BaseVerifier {
  /**
   * Проверить что пользователь существует
   * @param {string|number} userId - ID пользователя
   * @returns {Promise<Object|null>} Запись пользователя или null если нет подключения
   */
  async verifyUserExists(userId) {
    if (this.skipIfNotConnected()) return null;
    const user = await this.db.findOne("users", { id: userId });
    expect(user, `Пользователь ${userId} не найден`).not.toBeNull();
    return user;
  }

  /**
   * Найти пользователя по email (через таблицу accounts)
   * @param {string} email - Email пользователя
   * @returns {Promise<Object|null>} Пользователь с данными аккаунта или null если нет подключения
   */
  async findUserByEmail(email) {
    if (this.skipIfNotConnected()) return null;
    const results = await this.db.query(
      `SELECT u.*, a.email, a.id as account_id
       FROM users u
       JOIN accounts a ON u.account_id = a.id
       WHERE a.email = ?`,
      [email],
    );
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Проверить что пользователь с email существует
   * @param {string} email - Email пользователя
   * @returns {Promise<Object|null>} Запись пользователя или null если нет подключения
   */
  async verifyUserExistsByEmail(email) {
    if (this.skipIfNotConnected()) return null;
    const user = await this.findUserByEmail(email);
    expect(user, `Пользователь с email ${email} не найден`).not.toBeNull();
    return user;
  }

  /**
   * Проверить email пользователя
   * @param {string|number} userId - ID пользователя
   * @param {string} expectedEmail - Ожидаемый email
   */
  async verifyUserEmail(userId, expectedEmail) {
    if (this.skipIfNotConnected()) return;
    const user = await this.db.findOne("users", { id: userId });
    expect(user, `Пользователь ${userId} не найден`).not.toBeNull();

    const account = await this.db.findOne("accounts", { id: user.account_id });
    expect(account, "Аккаунт пользователя не найден").not.toBeNull();
    expect(account.email).toBe(expectedEmail);
  }

  /**
   * Проверить что пользователь принадлежит компании
   * @param {string|number} userId - ID пользователя
   * @param {string|number} companyId - ID компании
   */
  async verifyUserCompany(userId, companyId) {
    if (this.skipIfNotConnected()) return;
    const user = await this.db.findOne("users", { id: userId });
    expect(user, `Пользователь ${userId} не найден`).not.toBeNull();
    expect(user.company_id, "Компания пользователя не совпадает").toBe(
      companyId,
    );
  }

  /**
   * Проверить что пользователь активен
   * @param {string|number} userId - ID пользователя
   */
  async verifyUserActive(userId) {
    if (this.skipIfNotConnected()) return;
    const user = await this.db.findOne("users", { id: userId });
    expect(user, `Пользователь ${userId} не найден`).not.toBeNull();
    expect(user.is_active, "Пользователь должен быть активен").toBe(1);
  }

  /**
   * Проверить что пользователь неактивен
   * @param {string|number} userId - ID пользователя
   */
  async verifyUserInactive(userId) {
    if (this.skipIfNotConnected()) return;
    const user = await this.db.findOne("users", { id: userId });
    expect(user, `Пользователь ${userId} не найден`).not.toBeNull();
    expect(user.is_active, "Пользователь должен быть неактивен").toBe(0);
  }

  /**
   * Проверить что пользователь удалён (soft delete)
   * @param {string|number} userId - ID пользователя
   */
  async verifyUserDeleted(userId) {
    if (this.skipIfNotConnected()) return;
    const user = await this.db.findOne("users", { id: userId });
    expect(user, `Пользователь ${userId} не найден`).not.toBeNull();
    expect(user.deleted_at, "Пользователь должен быть удалён").not.toBeNull();
  }

  /**
   * Проверить имя пользователя
   * @param {string|number} userId - ID пользователя
   * @param {string} expectedFirstName - Ожидаемое имя
   * @param {string} [expectedLastName] - Ожидаемая фамилия
   */
  async verifyUserName(userId, expectedFirstName, expectedLastName) {
    if (this.skipIfNotConnected()) return;
    const user = await this.db.findOne("users", { id: userId });
    expect(user, `Пользователь ${userId} не найден`).not.toBeNull();
    expect(user.first_name).toBe(expectedFirstName);
    if (expectedLastName) {
      expect(user.last_name).toBe(expectedLastName);
    }
  }

  /**
   * Проверить должность пользователя
   * @param {string|number} userId - ID пользователя
   * @param {string} expectedJobTitle - Ожидаемая должность
   */
  async verifyUserJobTitle(userId, expectedJobTitle) {
    if (this.skipIfNotConnected()) return;
    const user = await this.db.findOne("users", { id: userId });
    expect(user, `Пользователь ${userId} не найден`).not.toBeNull();
    expect(user.job_title).toBe(expectedJobTitle);
  }

  /**
   * Проверить статус приглашения
   * @param {string|number} userId - ID пользователя
   * @param {string} expectedStatus - 'none' | 'awaiting' | 'invited' | 'accepted' | 'declined'
   */
  async verifyInviteStatus(userId, expectedStatus) {
    if (this.skipIfNotConnected()) return;
    const user = await this.db.findOne("users", { id: userId });
    expect(user, `Пользователь ${userId} не найден`).not.toBeNull();
    expect(user.invite_accept_status).toBe(expectedStatus);
  }

  /**
   * Получить пользователя по ID
   * @param {string|number} userId - ID пользователя
   * @returns {Promise<Object|null>}
   */
  async getUser(userId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("users", { id: userId });
  }

  /**
   * Получить всех пользователей компании
   * @param {string|number} companyId - ID компании
   * @param {Object} [options] - Опции (limit, orderBy)
   * @returns {Promise<Array>}
   */
  async getCompanyUsers(companyId, options = {}) {
    if (this.skipIfNotConnected()) return [];
    return this.db.findAll(
      "users",
      { company_id: companyId, deleted_at: null },
      options,
    );
  }

  /**
   * Подсчитать количество активных пользователей в компании
   * @param {string|number} companyId - ID компании
   * @returns {Promise<number>}
   */
  async countActiveCompanyUsers(companyId) {
    if (this.skipIfNotConnected()) return 0;
    const results = await this.db.query(
      `SELECT COUNT(*) as count FROM users
       WHERE company_id = ? AND is_active = 1 AND deleted_at IS NULL`,
      [companyId],
    );
    return results[0]?.count || 0;
  }
}
