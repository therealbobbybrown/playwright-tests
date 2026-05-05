// tests/utils/db/verifiers/NineBoxVerifier.js
// Верификатор для модуля NineBox (Матрица потенциала 9-box)

import { expect } from "@playwright/test";
import { BaseVerifier } from "./BaseVerifier.js";

/**
 * Верификатор для проверки данных NineBox в БД
 *
 * Структура БД NineBox:
 * - ninebox_settings: настройки матрицы (company_id, matrix_size, is_enabled, cells_titles JSON)
 * - ninebox_competence_settings: привязка компетенций к осям (axis='x'|'y', competence_id)
 * - ninebox_cache: кэшированные позиции сотрудников (x_value, y_value, x_coord, y_coord)
 * - ninebox_cache_meta: метаданные кэша (last_update_time, invalidate)
 *
 * @example
 * await nineboxVerifier.verifyEnabled(companyId);
 * await nineboxVerifier.verifyCellsTitles(companyId, expectedTitles);
 * await nineboxVerifier.verifyCacheCount(companyId, 84);
 */
export class NineBoxVerifier extends BaseVerifier {
  // ==========================================
  // Настройки (ninebox_settings)
  // ==========================================

  /**
   * Получить настройки NineBox для компании (без assertion)
   * @param {number} companyId
   * @returns {Promise<Object|null>}
   */
  async getSettings(companyId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("ninebox_settings", { company_id: companyId });
  }

  /**
   * Проверить что настройки NineBox существуют
   * @param {number} companyId
   * @returns {Promise<Object|null>}
   */
  async verifySettingsExist(companyId) {
    if (this.skipIfNotConnected()) return null;
    const settings = await this.db.findOne("ninebox_settings", {
      company_id: companyId,
    });
    expect(
      settings,
      `Настройки NineBox для компании ${companyId} не найдены`,
    ).not.toBeNull();
    return settings;
  }

  /**
   * Проверить что NineBox включён
   * @param {number} companyId
   */
  async verifyEnabled(companyId) {
    if (this.skipIfNotConnected()) return;
    const settings = await this.verifySettingsExist(companyId);
    expect(
      settings.is_enabled,
      `NineBox для компании ${companyId} должен быть включён`,
    ).toBe(1);
  }

  /**
   * Проверить что NineBox отключён
   * @param {number} companyId
   */
  async verifyDisabled(companyId) {
    if (this.skipIfNotConnected()) return;
    const settings = await this.verifySettingsExist(companyId);
    expect(
      settings.is_enabled,
      `NineBox для компании ${companyId} должен быть отключён`,
    ).toBe(0);
  }

  /**
   * Проверить размер матрицы
   * @param {number} companyId
   * @param {number} expectedSize
   */
  async verifyMatrixSize(companyId, expectedSize) {
    if (this.skipIfNotConnected()) return;
    const settings = await this.verifySettingsExist(companyId);
    expect(
      settings.matrix_size,
      `Размер матрицы должен быть ${expectedSize}`,
    ).toBe(expectedSize);
  }

  /**
   * Проверить названия ячеек матрицы
   * @param {number} companyId
   * @param {Array<Array<string>>} expectedTitles - 2D массив названий
   */
  async verifyCellsTitles(companyId, expectedTitles) {
    if (this.skipIfNotConnected()) return;
    const settings = await this.verifySettingsExist(companyId);
    const actualTitles = JSON.parse(settings.cells_titles);
    expect(
      actualTitles,
      "Названия ячеек матрицы должны совпадать с ожидаемыми",
    ).toEqual(expectedTitles);
  }

  // ==========================================
  // Настройки компетенций (ninebox_competence_settings)
  // ==========================================

  /**
   * Получить все настройки компетенций для NineBox (без assertion)
   * @param {number} companyId
   * @returns {Promise<Array|null>}
   */
  async getCompetenceSettings(companyId) {
    if (this.skipIfNotConnected()) return null;
    const settings = await this.getSettings(companyId);
    if (!settings) return null;
    return this.db.findAll("ninebox_competence_settings", {
      ninebox_settings_id: settings.id,
    });
  }

  /**
   * Проверить компетенции на указанной оси
   * @param {number} companyId
   * @param {'x'|'y'} axis
   * @param {number[]} expectedCompetenceIds
   */
  async verifyAxisCompetencies(companyId, axis, expectedCompetenceIds) {
    if (this.skipIfNotConnected()) return;
    const settings = await this.verifySettingsExist(companyId);
    const records = await this.db.findAll("ninebox_competence_settings", {
      ninebox_settings_id: settings.id,
      axis,
    });
    const actualIds = records.map((r) => r.competence_id).sort();
    const expectedSorted = [...expectedCompetenceIds].sort();
    expect(
      actualIds,
      `Компетенции на оси ${axis} должны совпадать`,
    ).toEqual(expectedSorted);
  }

  /**
   * Проверить количество компетенций на оси X
   * @param {number} companyId
   * @param {number} expectedCount
   */
  async verifyXAxisCount(companyId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    const settings = await this.verifySettingsExist(companyId);
    const count = await this.db.count("ninebox_competence_settings", {
      ninebox_settings_id: settings.id,
      axis: "x",
    });
    expect(
      count,
      `Ожидалось ${expectedCount} компетенций на оси X`,
    ).toBe(expectedCount);
  }

  /**
   * Проверить количество компетенций на оси Y
   * @param {number} companyId
   * @param {number} expectedCount
   */
  async verifyYAxisCount(companyId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    const settings = await this.verifySettingsExist(companyId);
    const count = await this.db.count("ninebox_competence_settings", {
      ninebox_settings_id: settings.id,
      axis: "y",
    });
    expect(
      count,
      `Ожидалось ${expectedCount} компетенций на оси Y`,
    ).toBe(expectedCount);
  }

  // ==========================================
  // Кэш позиций (ninebox_cache)
  // ==========================================

  /**
   * Проверить что пользователь присутствует в кэше
   * @param {number} companyId
   * @param {number} targetUserId
   * @param {Object} [options]
   * @param {string} [options.key] - Ключ кэша (формат "companyId/prId/revisionId")
   * @returns {Promise<Object|null>}
   */
  async verifyCacheExists(companyId, targetUserId, options = {}) {
    if (this.skipIfNotConnected()) return null;
    const where = {
      company_id: companyId,
      target_user_id: targetUserId,
      is_removed: 0,
    };
    if (options.key) where.key = options.key;
    const record = await this.db.findOne("ninebox_cache", where);
    expect(
      record,
      `Пользователь ${targetUserId} не найден в кэше NineBox для компании ${companyId}`,
    ).not.toBeNull();
    return record;
  }

  /**
   * Проверить что пользователь отсутствует в активном кэше (is_removed=0)
   * @param {number} companyId
   * @param {number} targetUserId
   */
  async verifyCacheNotExists(companyId, targetUserId) {
    if (this.skipIfNotConnected()) return;
    const record = await this.db.findOne("ninebox_cache", {
      company_id: companyId,
      target_user_id: targetUserId,
      is_removed: 0,
    });
    expect(
      record,
      `Пользователь ${targetUserId} не должен быть в активном кэше NineBox`,
    ).toBeNull();
  }

  /**
   * Проверить координаты пользователя в матрице
   * @param {number} companyId
   * @param {number} targetUserId
   * @param {number} expectedXCoord
   * @param {number} expectedYCoord
   * @param {Object} [options]
   * @param {string} [options.key] - Ключ кэша
   */
  async verifyCacheCoordinates(
    companyId,
    targetUserId,
    expectedXCoord,
    expectedYCoord,
    options = {},
  ) {
    if (this.skipIfNotConnected()) return;
    const record = await this.verifyCacheExists(
      companyId,
      targetUserId,
      options,
    );
    expect(
      record.x_coord,
      `x_coord пользователя ${targetUserId} должен быть ${expectedXCoord}`,
    ).toBe(expectedXCoord);
    expect(
      record.y_coord,
      `y_coord пользователя ${targetUserId} должен быть ${expectedYCoord}`,
    ).toBe(expectedYCoord);
  }

  /**
   * Проверить количество активных записей в кэше
   * @param {number} companyId
   * @param {number} expectedCount
   * @param {Object} [options]
   * @param {number} [options.isRemoved=0] - Фильтр по is_removed
   * @param {string} [options.key] - Ключ кэша
   */
  async verifyCacheCount(companyId, expectedCount, options = {}) {
    if (this.skipIfNotConnected()) return;
    const where = {
      company_id: companyId,
      is_removed: options.isRemoved ?? 0,
    };
    if (options.key) where.key = options.key;
    const count = await this.db.count("ninebox_cache", where);
    expect(
      count,
      `Ожидалось ${expectedCount} записей в кэше NineBox (is_removed=${where.is_removed})`,
    ).toBe(expectedCount);
  }

  /**
   * Проверить наличие записей привязанных к PR
   * @param {number} companyId
   * @param {number} prId
   * @returns {Promise<Array|null>}
   */
  async verifyCacheLinkedToPR(companyId, prId) {
    if (this.skipIfNotConnected()) return null;
    const records = await this.db.findAll("ninebox_cache", {
      company_id: companyId,
      performance_review_id: prId,
      is_removed: 0,
    });
    expect(
      records.length,
      `Ожидались записи в кэше NineBox для PR ${prId}`,
    ).toBeGreaterThan(0);
    return records;
  }

  /**
   * Проверить что ни один удалённый пользователь (is_removed=1) не попадает в выборку
   * Возвращает список удалённых user_id для использования в тестах
   * @param {number} companyId
   * @returns {Promise<number[]|null>} Массив removed user IDs
   */
  async getRemovedUserIds(companyId) {
    if (this.skipIfNotConnected()) return null;
    const records = await this.db.findAll("ninebox_cache", {
      company_id: companyId,
      is_removed: 1,
    });
    return records.map((r) => r.target_user_id);
  }

  // ==========================================
  // Метаданные кэша (ninebox_cache_meta)
  // ==========================================

  /**
   * Проверить что метаданные кэша существуют
   * @param {number} companyId
   * @param {string} [key] - Ключ кэша
   * @returns {Promise<Object|null>}
   */
  async verifyCacheMetaExists(companyId, key) {
    if (this.skipIfNotConnected()) return null;
    const where = { company_id: companyId };
    if (key) where.key = key;
    const meta = await this.db.findOne("ninebox_cache_meta", where);
    expect(
      meta,
      `Метаданные кэша NineBox не найдены для компании ${companyId}${key ? ` (key=${key})` : ""}`,
    ).not.toBeNull();
    return meta;
  }

  /**
   * Проверить значение флага invalidate
   * @param {number} companyId
   * @param {string} key - Ключ кэша
   * @param {number} expectedValue - Ожидаемое значение (0 или 1)
   */
  async verifyCacheMetaInvalidate(companyId, key, expectedValue) {
    if (this.skipIfNotConnected()) return;
    const meta = await this.verifyCacheMetaExists(companyId, key);
    expect(
      meta.invalidate,
      `Флаг invalidate для ключа ${key} должен быть ${expectedValue}`,
    ).toBe(expectedValue);
  }

  /**
   * Проверить что last_update_time обновлён (позже заданного времени)
   * @param {number} companyId
   * @param {string} key - Ключ кэша
   * @param {Date} afterTime - Время, после которого должно быть обновление
   */
  async verifyCacheMetaUpdated(companyId, key, afterTime) {
    if (this.skipIfNotConnected()) return;
    const meta = await this.verifyCacheMetaExists(companyId, key);
    const updateTime = new Date(meta.last_update_time);
    expect(
      updateTime.getTime(),
      `last_update_time должен быть позже ${afterTime.toISOString()}`,
    ).toBeGreaterThan(afterTime.getTime());
  }
}
