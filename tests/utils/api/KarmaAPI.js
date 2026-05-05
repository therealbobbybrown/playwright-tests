// tests/utils/api/KarmaAPI.js
// API клиент для работы с Karma (виртуальная валюта)

import { createHash } from "crypto";
import { APIClient } from "./APIClient.js";

/**
 * Генерация fingerPrint как MD5 хеш
 * @returns {string}
 */
function generateFingerPrint() {
  const timestamp = Date.now().toString();
  return createHash("md5").update(timestamp).digest("hex");
}

/**
 * API клиент для работы с Karma
 * Endpoints: /manager/karma/*, /private/karma/*
 */
export class KarmaAPI extends APIClient {
  constructor(request, token = null) {
    super(request, token);
    this.fingerPrint = generateFingerPrint();
  }

  /**
   * Авторизация пользователя
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>}
   */
  async signIn(email, password) {
    const { data } = await this.post(
      "/auth/account/signin",
      {
        email,
        password,
        fingerPrint: this.fingerPrint,
        permissions: [],
      },
      { timeout: 60_000 },
    );
    if (data?.accessToken) {
      this.setToken(data.accessToken);
    }
    return data;
  }

  // ==================== CONVENIENCE ALIASES ====================

  /**
   * Получить баланс (алиас для getUserBalances)
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getBalance() {
    return this.getUserBalances();
  }

  /**
   * Получить историю транзакций (алиас для getTransactions)
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getHistory(params = {}) {
    return this.getTransactions(params);
  }

  /**
   * Получить настройки (алиас для getManagerSettings)
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSettings() {
    return this.getManagerSettings();
  }

  // ==================== SETTINGS (Manager) ====================

  /**
   * Получить настройки Karma (manager)
   * GET /manager/karma/wallet/settings/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getManagerSettings() {
    return this.get("/manager/karma/wallet/settings/");
  }

  /**
   * Создать настройки по умолчанию
   * POST /manager/karma/wallet/settings/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createDefaultSettings() {
    return this.post("/manager/karma/wallet/settings/");
  }

  /**
   * Обновить настройки Karma
   * POST /manager/karma/wallet/settings/
   * @param {Object} data - Настройки
   * @param {Object} [data.settings] - Основные настройки
   * @param {Object} [data.limits] - Лимиты
   * @param {Object} [data.schedules] - Расписания
   * @param {Object} [data.actionCharges] - Начисления за действия
   * @param {Object} [data.actionLimits] - Лимиты действий
   * @param {number[]} [data.giftResponsiblesUsersIds] - ID ответственных за подарки
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateSettings({
    settings,
    limits,
    schedules,
    actionCharges,
    actionLimits,
    giftResponsiblesUsersIds,
  } = {}) {
    return this.post("/manager/karma/wallet/settings/", {
      settings,
      limits,
      schedules,
      actionCharges,
      actionLimits,
      giftResponsiblesUsersIds,
    });
  }

  /**
   * Включить Karma
   * POST /manager/karma/wallet/enable/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async enable() {
    return this.post("/manager/karma/wallet/enable/");
  }

  /**
   * Отключить Karma
   * POST /manager/karma/wallet/disable/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async disable() {
    return this.post("/manager/karma/wallet/disable/");
  }

  /**
   * Получить предполагаемые расписания
   * POST /manager/karma/wallet/estimated-schedules/
   * @param {Object} data - Данные
   * @param {Object} data.schedules - Расписания
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getEstimatedSchedules(schedules) {
    return this.post("/manager/karma/wallet/estimated-schedules/", {
      schedules,
    });
  }

  /**
   * Пополнить баланс пользователя
   * POST /manager/karma/wallet/transfers/deposit/
   * @param {Object} data - Данные транзакции
   * @param {number} data.userId - ID пользователя
   * @param {string} data.currency - Валюта
   * @param {number} data.amount - Сумма
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deposit({ userId, currency, amount } = {}) {
    return this.post("/manager/karma/wallet/transfers/deposit/", {
      userId,
      currency,
      amount,
    });
  }

  /**
   * Получить все транзакции (manager)
   * GET /manager/karma/wallet/all-transactions/
   * @param {Object} [params] - Параметры
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getAllTransactions(params = {}) {
    return this.get("/manager/karma/wallet/all-transactions/", params);
  }

  // ==================== SETTINGS (Private) ====================

  /**
   * Получить настройки кошелька (private)
   * GET /private/karma/wallet/settings/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPrivateWalletSettings() {
    return this.get("/private/karma/wallet/settings/");
  }

  /**
   * Получить баланс пользователя
   * GET /private/karma/wallet/balances/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserBalances() {
    return this.get("/private/karma/wallet/balances/");
  }

  /**
   * Получить список транзакций (private)
   * GET /private/karma/wallet/transactions/
   * @param {Object} [params] - Параметры
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTransactions(params = {}) {
    return this.get("/private/karma/wallet/transactions/", params);
  }

  /**
   * Получить транзакции по сущности
   * GET /private/karma/wallet/transactions/by-entity/
   * @param {Object} params - Параметры
   * @param {number} params.relatedEntityId - ID связанной сущности
   * @param {string} params.relatedEntityType - Тип связанной сущности
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTransactionsByEntity({ relatedEntityId, relatedEntityType } = {}) {
    return this.get("/private/karma/wallet/transactions/by-entity/", {
      relatedEntityId,
      relatedEntityType,
    });
  }

  /**
   * Получить токен для экспорта балансов
   * GET /private/karma/wallet/balances/export/get-token/
   * @param {string} userDate - Дата
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getExportBalancesToken(userDate) {
    return this.get("/private/karma/wallet/balances/export/get-token/", {
      userDate,
    });
  }

  /**
   * Отправить карму пользователю (алиас для deposit)
   * @param {number|string} userId - ID получателя
   * @param {number} amount - Сумма
   * @param {string} [currency='karma'] - Валюта
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async sendKarma(userId, amount, currency = "karma") {
    return this.deposit({ userId, currency, amount });
  }
}
