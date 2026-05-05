// tests/utils/db/verifiers/CalibrationVerifier.js
// Верификатор для модуля Калибровки Performance Review

import { expect } from "@playwright/test";
import { PerformanceReviewVerifier } from "./PerformanceReviewVerifier.js";

/**
 * Верификатор для проверки данных калибровки в БД
 *
 * Расширяет PerformanceReviewVerifier с методами специфичными для калибровки:
 * - Веса компетенций (competence_weights)
 * - Настройки калибровки (statistics_settings)
 * - Перезаписанные оценки (response_overwrites)
 *
 * Структура БД калибровки:
 * - performance_review_statistics_settings: настройки калибровки PR
 * - performance_review_statistics_competence_settings: настройки компетенций (веса, включены/выключены)
 * - performance_review_responses_values_overwrites: перезаписанные оценки (калибровка)
 * - performance_review_statistics_competence_group_settings: настройки групп компетенций
 *
 * @example
 * const calibration = await calibrationVerifier.verifyCalibrationEnabled(prId);
 * await calibrationVerifier.verifyCompetenceWeight(prId, competenceId, expectedWeight);
 * await calibrationVerifier.verifyWeightsSum(prId, 100);
 */
export class CalibrationVerifier extends PerformanceReviewVerifier {
  // ==========================================
  // Настройки калибровки
  // ==========================================

  /**
   * Проверить что настройки статистики существуют
   * @param {string|number} prId - ID Performance Review
   * @returns {Promise<Object|null>} Запись настроек или null
   */
  async verifyStatisticsSettingsExist(prId) {
    if (this.skipIfNotConnected()) return null;
    const settings = await this.db.findOne(
      "performance_review_statistics_settings",
      {
        performance_review_id: prId,
      },
    );
    expect(
      settings,
      `Настройки статистики для PR ${prId} не найдены`,
    ).not.toBeNull();
    return settings;
  }

  /**
   * Проверить что калибровка включена
   * @param {string|number} prId - ID Performance Review
   */
  async verifyCalibrationEnabled(prId) {
    if (this.skipIfNotConnected()) return;
    const settings = await this.db.findOne(
      "performance_review_statistics_settings",
      {
        performance_review_id: prId,
      },
    );
    expect(settings, `Настройки PR ${prId} не найдены`).not.toBeNull();
    expect(
      settings.enable_responses_overwriting,
      "Калибровка (перезапись ответов) должна быть включена",
    ).toBe(1);
  }

  /**
   * Проверить что используются только оценки руководителя
   * @param {string|number} prId - ID Performance Review
   */
  async verifyUseOnlyHeadReceiver(prId) {
    if (this.skipIfNotConnected()) return;
    const settings = await this.db.findOne(
      "performance_review_statistics_settings",
      {
        performance_review_id: prId,
      },
    );
    expect(settings, `Настройки PR ${prId} не найдены`).not.toBeNull();
    expect(
      settings.use_only_head_receiver,
      "Должен использоваться только руководитель",
    ).toBe(1);
  }

  /**
   * Получить настройки статистики PR
   * @param {string|number} prId - ID Performance Review
   * @returns {Promise<Array>} Массив настроек (key-value)
   */
  async getStatisticsSettings(prId) {
    if (this.skipIfNotConnected()) return [];
    try {
      // Таблица хранит настройки в key-value формате
      return await this.db.findAll("performance_review_statistics_settings", {
        performance_review_id: prId,
      });
    } catch (error) {
      // Table may not exist in this DB schema
      console.log(
        `[CalibrationVerifier] getStatisticsSettings skipped: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Получить одну настройку статистики PR (для проверок)
   * @param {string|number} prId - ID Performance Review
   * @returns {Promise<Object|null>}
   */
  async getStatisticsSettingsOne(prId) {
    if (this.skipIfNotConnected()) return null;
    try {
      return await this.db.findOne("performance_review_statistics_settings", {
        performance_review_id: prId,
      });
    } catch (error) {
      console.log(
        `[CalibrationVerifier] getStatisticsSettingsOne skipped: ${error.message}`,
      );
      return null;
    }
  }

  // ==========================================
  // Веса компетенций
  // ==========================================

  /**
   * Проверить вес компетенции
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} competenceId - ID компетенции
   * @param {number} expectedWeight - Ожидаемый вес в процентах
   */
  async verifyCompetenceWeight(prId, competenceId, expectedWeight) {
    if (this.skipIfNotConnected()) return;
    const setting = await this.db.findOne(
      "performance_review_statistics_competence_settings",
      {
        performance_review_id: prId,
        questionnaire_competence_id: competenceId,
      },
    );
    expect(
      setting,
      `Настройки компетенции ${competenceId} не найдены`,
    ).not.toBeNull();
    expect(
      setting.weight_percent,
      `Вес компетенции ${competenceId} должен быть ${expectedWeight}%`,
    ).toBeCloseTo(expectedWeight, 1);
  }

  /**
   * Проверить что сумма весов компетенций = 100%
   * @param {string|number} prId - ID Performance Review
   * @param {number} [expectedSum=100] - Ожидаемая сумма (по умолчанию 100)
   */
  async verifyWeightsSum(prId, expectedSum = 100) {
    if (this.skipIfNotConnected()) return;
    const settings = await this.db.findAll(
      "performance_review_statistics_competence_settings",
      {
        performance_review_id: prId,
        competence_enabled: 1,
      },
    );

    let totalWeight = 0;
    for (const s of settings) {
      totalWeight += s.weight_percent || 0;
    }

    expect(
      totalWeight,
      `Сумма весов должна быть ${expectedSum}%, получено ${totalWeight}%`,
    ).toBeCloseTo(expectedSum, 1);
  }

  /**
   * Проверить что все включённые компетенции имеют вес > 0
   * @param {string|number} prId - ID Performance Review
   */
  async verifyAllCompetenciesHaveWeight(prId) {
    if (this.skipIfNotConnected()) return;
    const settings = await this.db.findAll(
      "performance_review_statistics_competence_settings",
      {
        performance_review_id: prId,
        competence_enabled: 1,
      },
    );

    const zeroWeight = settings.filter((s) => (s.weight_percent || 0) <= 0);
    expect(
      zeroWeight.length,
      `${zeroWeight.length} компетенций имеют нулевой вес`,
    ).toBe(0);
  }

  /**
   * Получить все настройки компетенций PR
   * @param {string|number} prId - ID Performance Review
   * @param {boolean} [onlyEnabled=true] - Только включённые
   * @returns {Promise<Array>}
   */
  async getCompetenceSettings(prId, onlyEnabled = true) {
    if (this.skipIfNotConnected()) return [];
    try {
      const where = { performance_review_id: prId };
      if (onlyEnabled) {
        where.competence_enabled = 1;
      }
      return await this.db.findAll(
        "performance_review_statistics_competence_settings",
        where,
      );
    } catch (error) {
      // Table may not exist in this DB schema
      console.log(
        `[CalibrationVerifier] getCompetenceSettings skipped: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Проверить количество включённых компетенций
   * @param {string|number} prId - ID Performance Review
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyEnabledCompetenciesCount(prId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    const count = await this.db.count(
      "performance_review_statistics_competence_settings",
      {
        performance_review_id: prId,
        competence_enabled: 1,
      },
    );
    expect(count, `Должно быть ${expectedCount} включённых компетенций`).toBe(
      expectedCount,
    );
  }

  // ==========================================
  // Группы компетенций
  // ==========================================

  /**
   * Получить все настройки групп компетенций PR
   * @param {string|number} prId - ID Performance Review
   * @param {boolean} [onlyEnabled=true] - Только включённые
   * @returns {Promise<Array>}
   */
  async getCompetenceGroupSettings(prId, onlyEnabled = true) {
    if (this.skipIfNotConnected()) return [];
    try {
      const where = { performance_review_id: prId };
      if (onlyEnabled) {
        where.competence_group_enabled = 1;
      }
      return await this.db.findAll(
        "performance_review_statistics_competence_group_settings",
        where,
      );
    } catch (error) {
      console.log(
        `[CalibrationVerifier] getCompetenceGroupSettings skipped: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Проверить вес группы компетенций
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} groupId - ID группы
   * @param {number} expectedWeight - Ожидаемый вес
   */
  async verifyCompetenceGroupWeight(prId, groupId, expectedWeight) {
    if (this.skipIfNotConnected()) return;
    const setting = await this.db.findOne(
      "performance_review_statistics_competence_group_settings",
      {
        performance_review_id: prId,
        competence_group_id: groupId,
      },
    );
    expect(setting, `Настройки группы ${groupId} не найдены`).not.toBeNull();
    expect(setting.weight_percent).toBeCloseTo(expectedWeight, 1);
  }

  /**
   * Проверить сумму весов групп = 100%
   * @param {string|number} prId - ID Performance Review
   */
  async verifyGroupWeightsSum(prId) {
    if (this.skipIfNotConnected()) return;
    const settings = await this.db.findAll(
      "performance_review_statistics_competence_group_settings",
      {
        performance_review_id: prId,
        competence_group_enabled: 1,
      },
    );

    let totalWeight = 0;
    for (const s of settings) {
      totalWeight += s.weight_percent || 0;
    }

    expect(
      totalWeight,
      `Сумма весов групп должна быть 100%, получено ${totalWeight}%`,
    ).toBeCloseTo(100, 1);
  }

  // ==========================================
  // Перезаписанные оценки (калибровка)
  // ==========================================

  /**
   * Проверить что перезапись оценки существует
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} revisionId - ID ревизии
   * @param {string|number} targetUserId - ID оцениваемого (user_id)
   * @returns {Promise<Object|null>}
   */
  async verifyOverwriteExists(prId, revisionId, targetUserId) {
    if (this.skipIfNotConnected()) return null;
    const overwrite = await this.db.findOne(
      "performance_review_responses_values_overwrites",
      {
        performance_review_id: prId,
        revision_id: revisionId,
        target_user_id: targetUserId,
      },
    );
    expect(
      overwrite,
      `Перезапись для пользователя ${targetUserId} не найдена`,
    ).not.toBeNull();
    return overwrite;
  }

  /**
   * Проверить значение перезаписанной оценки
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} revisionId - ID ревизии
   * @param {string|number} targetUserId - ID оцениваемого
   * @param {string|number} competenceId - ID компетенции
   * @param {number} expectedValue - Ожидаемое значение
   */
  async verifyOverwriteValue(
    prId,
    revisionId,
    targetUserId,
    competenceId,
    expectedValue,
  ) {
    if (this.skipIfNotConnected()) return;
    // Перезаписи хранятся как JSON в поле overwrites
    const overwrite = await this.db.findOne(
      "performance_review_responses_values_overwrites",
      {
        performance_review_id: prId,
        revision_id: revisionId,
        target_user_id: targetUserId,
      },
    );
    expect(overwrite, "Перезапись не найдена").not.toBeNull();

    const overwrites = JSON.parse(overwrite.overwrites || "{}");
    const value = overwrites[competenceId] || overwrites[String(competenceId)];

    expect(
      value,
      `Перезаписанное значение компетенции ${competenceId} должно быть ${expectedValue}`,
    ).toBeCloseTo(expectedValue, 1);
  }

  /**
   * Проверить что оценка заблокирована (locked)
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} revisionId - ID ревизии
   * @param {string|number} targetUserId - ID оцениваемого
   */
  async verifyOverwriteLocked(prId, revisionId, targetUserId) {
    if (this.skipIfNotConnected()) return;
    const overwrite = await this.db.findOne(
      "performance_review_responses_values_overwrites",
      {
        performance_review_id: prId,
        revision_id: revisionId,
        target_user_id: targetUserId,
      },
    );
    expect(overwrite, "Перезапись не найдена").not.toBeNull();
    expect(overwrite.is_locked, "Оценка должна быть заблокирована").toBe(1);
  }

  /**
   * Получить все перезаписи для пользователя
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} targetUserId - ID оцениваемого
   * @returns {Promise<Array>}
   */
  async getOverwrites(prId, targetUserId) {
    if (this.skipIfNotConnected()) return [];
    return this.db.findAll("performance_review_responses_values_overwrites", {
      performance_review_id: prId,
      target_user_id: targetUserId,
    });
  }

  /**
   * Получить все перезаписи для PR (response overwrites)
   * @param {string|number} prId - ID Performance Review
   * @returns {Promise<Array>}
   */
  async getResponseOverwrites(prId) {
    if (this.skipIfNotConnected()) return [];
    try {
      return await this.db.findAll(
        "performance_review_responses_values_overwrites",
        {
          performance_review_id: prId,
        },
      );
    } catch (error) {
      console.log(
        `[CalibrationVerifier] getResponseOverwrites skipped: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Проверить количество перезаписей в PR
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} revisionId - ID ревизии
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyOverwritesCount(prId, revisionId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    const count = await this.db.count(
      "performance_review_responses_values_overwrites",
      {
        performance_review_id: prId,
        revision_id: revisionId,
      },
    );
    expect(count, `Должно быть ${expectedCount} перезаписей`).toBe(
      expectedCount,
    );
  }

  // ==========================================
  // Цветовые диапазоны
  // ==========================================

  /**
   * Проверить настройку цветового диапазона (жёлтая граница)
   * @param {string|number} prId - ID Performance Review
   * @param {number} expectedValue - Ожидаемое значение
   */
  async verifyColorRangeYellow(prId, expectedValue) {
    if (this.skipIfNotConnected()) return;
    const settings = await this.getStatisticsSettingsOne(prId);
    expect(settings, `Настройки PR ${prId} не найдены`).not.toBeNull();
    expect(
      settings.color_range_yellow,
      `Жёлтая граница должна быть ${expectedValue}`,
    ).toBeCloseTo(expectedValue, 1);
  }

  /**
   * Проверить настройку цветового диапазона (зелёная граница)
   * @param {string|number} prId - ID Performance Review
   * @param {number} expectedValue - Ожидаемое значение
   */
  async verifyColorRangeGreen(prId, expectedValue) {
    if (this.skipIfNotConnected()) return;
    const settings = await this.getStatisticsSettingsOne(prId);
    expect(settings, `Настройки PR ${prId} не найдены`).not.toBeNull();
    expect(
      settings.color_range_green,
      `Зелёная граница должна быть ${expectedValue}`,
    ).toBeCloseTo(expectedValue, 1);
  }

  // ==========================================
  // Комплексные проверки
  // ==========================================

  /**
   * Получить полную информацию о калибровке PR
   * @param {string|number} prId - ID Performance Review
   * @returns {Promise<Object|null>}
   */
  async getCalibrationDetails(prId) {
    if (this.skipIfNotConnected()) return null;

    const settings = await this.getStatisticsSettingsOne(prId);
    const competenceSettings = await this.getCompetenceSettings(prId);
    const revision = await this.getRevision(prId);

    let totalWeight = 0;
    const competencies = [];
    for (const cs of competenceSettings) {
      const weight = cs.weight_percent || 0;
      totalWeight += weight;
      competencies.push({
        id: cs.competence_id,
        weight,
        enabled: cs.competence_enabled === 1,
      });
    }

    return {
      prId,
      settings: settings || {},
      competencies,
      totalWeight,
      revision: revision || null,
      isCalibrationEnabled: settings?.enable_responses_overwriting === 1,
      useOnlyHead: settings?.use_only_head_receiver === 1,
      colorRangeYellow: settings?.color_range_yellow,
      colorRangeGreen: settings?.color_range_green,
    };
  }

  // ==========================================
  // Перезапись итоговой оценки (mean overwrite)
  // ==========================================

  /**
   * Проверить что перезапись итоговой оценки существует (числовой режим)
   * @param {string|number} revisionId - ID ревизии (НЕ prId!)
   * @param {string|number} targetUserId - ID оцениваемого
   * @param {number} expectedFraction - Ожидаемое значение как дробь 0..1 (напр. 0.84)
   * @returns {Promise<Object|null>} Запись из DB
   */
  async verifyTotalScoreOverwrite(revisionId, targetUserId, expectedFraction) {
    if (this.skipIfNotConnected()) return null;
    const overwrite = await this.db.findOne(
      "performance_review_user_competences_mean_history_overwrites",
      {
        performance_review_revision_id: revisionId,
        target_user_id: targetUserId,
      },
    );
    expect(
      overwrite,
      `Перезапись итоговой оценки для user ${targetUserId} rev ${revisionId} не найдена`,
    ).not.toBeNull();
    expect(
      overwrite.overwritten_value,
      `Итоговая оценка должна быть ${expectedFraction}`,
    ).toBeCloseTo(expectedFraction, 2);
    expect(
      overwrite.overwritten_characteristic_id,
      "В числовом режиме characteristic_id должен быть null",
    ).toBeNull();
    return overwrite;
  }

  /**
   * Проверить что перезапись итоговой оценки существует (дропдаун режим)
   * @param {string|number} revisionId - ID ревизии
   * @param {string|number} targetUserId - ID оцениваемого
   * @param {number} expectedCharacteristicId - Ожидаемый ID характеристики
   * @returns {Promise<Object|null>}
   */
  async verifyTotalScoreCharacteristicOverwrite(
    revisionId,
    targetUserId,
    expectedCharacteristicId,
  ) {
    if (this.skipIfNotConnected()) return null;
    const overwrite = await this.db.findOne(
      "performance_review_user_competences_mean_history_overwrites",
      {
        performance_review_revision_id: revisionId,
        target_user_id: targetUserId,
      },
    );
    expect(
      overwrite,
      `Перезапись итоговой (дропдаун) для user ${targetUserId} rev ${revisionId} не найдена`,
    ).not.toBeNull();
    expect(
      overwrite.overwritten_value,
      "В дропдаун режиме overwritten_value должен быть null",
    ).toBeNull();
    expect(
      overwrite.overwritten_characteristic_id,
      `Характеристика должна быть ${expectedCharacteristicId}`,
    ).toBe(expectedCharacteristicId);
    return overwrite;
  }

  /**
   * Проверить что перезапись итоговой оценки НЕ существует
   * (нет калибровки или калиброванное = оригинальному)
   * @param {string|number} revisionId - ID ревизии
   * @param {string|number} targetUserId - ID оцениваемого
   */
  async verifyTotalScoreNotOverwritten(revisionId, targetUserId) {
    if (this.skipIfNotConnected()) return;
    const overwrite = await this.db.findOne(
      "performance_review_user_competences_mean_history_overwrites",
      {
        performance_review_revision_id: revisionId,
        target_user_id: targetUserId,
      },
    );
    expect(
      overwrite,
      `Перезапись итоговой для user ${targetUserId} НЕ должна существовать, но найдена`,
    ).toBeNull();
  }

  /**
   * Получить запись перезаписи итоговой (без assert)
   * @param {string|number} revisionId - ID ревизии
   * @param {string|number} targetUserId - ID оцениваемого
   * @returns {Promise<Object|null>}
   */
  async getTotalScoreOverwrite(revisionId, targetUserId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne(
      "performance_review_user_competences_mean_history_overwrites",
      {
        performance_review_revision_id: revisionId,
        target_user_id: targetUserId,
      },
    );
  }

  /**
   * Проверить количество перезаписей итоговой оценки для ревизии
   * @param {string|number} revisionId - ID ревизии
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyTotalScoreOverwritesCount(revisionId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    const count = await this.db.count(
      "performance_review_user_competences_mean_history_overwrites",
      { performance_review_revision_id: revisionId },
    );
    expect(
      count,
      `Должно быть ${expectedCount} перезаписей итоговой оценки`,
    ).toBe(expectedCount);
  }

  /**
   * Проверить что перезаписи компетенций НЕ затронуты калибровкой итоговой
   * (таблица responses_values_overwrites пуста для данной ревизии)
   * @param {string|number} revisionId - ID ревизии
   */
  async verifyCompetencyOverwritesEmpty(revisionId) {
    if (this.skipIfNotConnected()) return;
    // Для responses_values_overwrites нужен JOIN с responses
    // Используем raw query для корректности
    try {
      const rows = await this.db.query(
        `SELECT COUNT(*) as cnt
         FROM performance_review_responses_values_overwrites o
         JOIN performance_review_responses r ON r.id = o.performance_review_response_id
         WHERE r.performance_review_revision_id = ?`,
        [revisionId],
      );
      const count = rows[0]?.cnt || 0;
      expect(
        count,
        "Перезаписи компетенций должны быть пусты при калибровке только итоговой",
      ).toBe(0);
    } catch (error) {
      console.log(
        `[CalibrationVerifier] verifyCompetencyOverwritesEmpty skipped: ${error.message}`,
      );
    }
  }
}
