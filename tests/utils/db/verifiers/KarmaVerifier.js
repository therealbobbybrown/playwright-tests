// tests/utils/db/verifiers/KarmaVerifier.js
// Верификатор для модуля кармы/бонусов (Karma/Bonus)

import { expect } from "@playwright/test";
import { BaseVerifier } from "./BaseVerifier.js";

/**
 * Верификатор для проверки данных кармы в БД
 *
 * Структура БД:
 * - karma_transactions: транзакции кармы
 * - karma_balances: балансы пользователей
 * - karma_settings: настройки кармы
 *
 * @example
 * const balance = await karmaVerifier.verifyUserBalance(userId, expectedBalance);
 * await karmaVerifier.verifyTransactionCreated(transactionId);
 */
export class KarmaVerifier extends BaseVerifier {
  /**
   * Проверить баланс кармы пользователя
   * @param {string|number} userId - ID пользователя
   * @param {number} expectedBalance - Ожидаемый баланс
   */
  async verifyUserBalance(userId, expectedBalance) {
    if (this.skipIfNotConnected()) return;
    const balance = await this.db.findOne("karma_balances", {
      user_id: userId,
    });
    expect(balance, `Баланс пользователя ${userId} не найден`).not.toBeNull();
    expect(
      Number(balance.balance),
      `Баланс должен быть ${expectedBalance}`,
    ).toBe(expectedBalance);
  }

  /**
   * Проверить что баланс >= минимального значения
   * @param {string|number} userId - ID пользователя
   * @param {number} minBalance - Минимальный баланс
   */
  async verifyMinBalance(userId, minBalance) {
    if (this.skipIfNotConnected()) return;
    const balance = await this.db.findOne("karma_balances", {
      user_id: userId,
    });
    expect(balance, `Баланс пользователя ${userId} не найден`).not.toBeNull();
    expect(Number(balance.balance)).toBeGreaterThanOrEqual(minBalance);
  }

  /**
   * Проверить создание транзакции
   * @param {string|number} transactionId - ID транзакции
   * @param {number} [timeout=5000] - Таймаут
   * @returns {Promise<Object|null>}
   */
  async verifyTransactionCreated(transactionId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const transaction = await this.waitForRecord(
      "karma_transactions",
      { id: transactionId },
      timeout,
    );
    expect(
      transaction,
      `Транзакция ${transactionId} не найдена в БД`,
    ).not.toBeNull();
    return transaction;
  }

  /**
   * Проверить сумму транзакции
   * @param {string|number} transactionId - ID транзакции
   * @param {number} expectedAmount - Ожидаемая сумма
   */
  async verifyTransactionAmount(transactionId, expectedAmount) {
    if (this.skipIfNotConnected()) return;
    const transaction = await this.db.findOne("karma_transactions", {
      id: transactionId,
    });
    expect(
      transaction,
      `Транзакция ${transactionId} не найдена`,
    ).not.toBeNull();
    expect(
      Number(transaction.amount),
      `Сумма должна быть ${expectedAmount}`,
    ).toBe(expectedAmount);
  }

  /**
   * Проверить тип транзакции
   * @param {string|number} transactionId - ID транзакции
   * @param {string} expectedType - Ожидаемый тип ('credit' | 'debit' | 'transfer')
   */
  async verifyTransactionType(transactionId, expectedType) {
    if (this.skipIfNotConnected()) return;
    const transaction = await this.db.findOne("karma_transactions", {
      id: transactionId,
    });
    expect(
      transaction,
      `Транзакция ${transactionId} не найдена`,
    ).not.toBeNull();
    expect(transaction.type, `Тип транзакции должен быть ${expectedType}`).toBe(
      expectedType,
    );
  }

  /**
   * Проверить получателя транзакции
   * @param {string|number} transactionId - ID транзакции
   * @param {string|number} recipientUserId - ID получателя
   */
  async verifyTransactionRecipient(transactionId, recipientUserId) {
    if (this.skipIfNotConnected()) return;
    const transaction = await this.db.findOne("karma_transactions", {
      id: transactionId,
    });
    expect(
      transaction,
      `Транзакция ${transactionId} не найдена`,
    ).not.toBeNull();
    expect(transaction.recipient_user_id).toBe(recipientUserId);
  }

  /**
   * Проверить отправителя транзакции
   * @param {string|number} transactionId - ID транзакции
   * @param {string|number} senderUserId - ID отправителя
   */
  async verifyTransactionSender(transactionId, senderUserId) {
    if (this.skipIfNotConnected()) return;
    const transaction = await this.db.findOne("karma_transactions", {
      id: transactionId,
    });
    expect(
      transaction,
      `Транзакция ${transactionId} не найдена`,
    ).not.toBeNull();
    expect(transaction.sender_user_id).toBe(senderUserId);
  }

  /**
   * Получить баланс пользователя
   * @param {string|number} userId - ID пользователя
   * @returns {Promise<number>}
   */
  async getUserBalance(userId) {
    if (this.skipIfNotConnected()) return 0;
    const balance = await this.db.findOne("karma_balances", {
      user_id: userId,
    });
    return balance ? Number(balance.balance) : 0;
  }

  /**
   * Получить транзакцию по ID
   * @param {string|number} transactionId - ID транзакции
   * @returns {Promise<Object|null>}
   */
  async getTransaction(transactionId) {
    if (this.skipIfNotConnected()) return null;
    try {
      return await this.db.findOne("karma_transactions", { id: transactionId });
    } catch (error) {
      // Таблица может не существовать
      console.warn(
        "[KarmaVerifier] Ошибка получения транзакции:",
        error.message,
      );
      return null;
    }
  }

  /**
   * Получить транзакции пользователя
   * @param {string|number} userId - ID пользователя
   * @param {Object} [options] - Опции (limit, orderBy)
   * @returns {Promise<Array>}
   */
  async getUserTransactions(userId, options = {}) {
    if (this.skipIfNotConnected()) return [];
    try {
      // Получаем транзакции где пользователь - отправитель или получатель
      const asSender = await this.db.findAll(
        "karma_transactions",
        { sender_user_id: userId },
        options,
      );
      const asRecipient = await this.db.findAll(
        "karma_transactions",
        { recipient_user_id: userId },
        options,
      );
      return [...asSender, ...asRecipient];
    } catch (error) {
      // Таблица может не существовать или иметь другую структуру
      console.warn(
        "[KarmaVerifier] Ошибка получения транзакций:",
        error.message,
      );
      return [];
    }
  }

  /**
   * Подсчитать количество транзакций пользователя
   * @param {string|number} userId - ID пользователя
   * @returns {Promise<number>}
   */
  async countUserTransactions(userId) {
    if (this.skipIfNotConnected()) return 0;
    const asSenderCount = await this.db.count("karma_transactions", {
      sender_user_id: userId,
    });
    const asRecipientCount = await this.db.count("karma_transactions", {
      recipient_user_id: userId,
    });
    return asSenderCount + asRecipientCount;
  }

  /**
   * Проверить что транзакция связана с фидбеком
   * @param {string|number} transactionId - ID транзакции
   * @param {string|number} feedbackId - ID фидбека
   */
  async verifyTransactionFeedback(transactionId, feedbackId) {
    if (this.skipIfNotConnected()) return;
    const transaction = await this.db.findOne("karma_transactions", {
      id: transactionId,
    });
    expect(
      transaction,
      `Транзакция ${transactionId} не найдена`,
    ).not.toBeNull();
    expect(transaction.feedback_id).toBe(feedbackId);
  }
}
