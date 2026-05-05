// tests/utils/StatisticsSettingsHelper.js
// Shared helper для управления настройками статистики PR
// (enableCustomCharacteristics, characteristicSettings, калибровка)

/**
 * Дефолтные характеристики: 3 диапазона (Низко / Средне / Высоко)
 */
export const DEFAULT_CHARACTERISTICS = [
  { threshold: 33, title: "Низко", color: "#FF6B6B", category: "negative" },
  { threshold: 66, title: "Средне", color: "#FFE66D", category: "neutral" },
  { threshold: 100, title: "Высоко", color: "#4ECDC4", category: "positive" },
];

/**
 * Патч настроек статистики PR. GET → merge fieldsToUpdate в settings → POST.
 * @param {Object} prAPI - PerformanceReviewAPI instance
 * @param {number} prId - ID Performance Review
 * @param {Object} fieldsToUpdate - поля для Object.assign в settings
 * @returns {Promise<Object>} обновлённые настройки
 */
export async function patchStatisticsSettings(prAPI, prId, fieldsToUpdate) {
  const { data: current } = await prAPI.getStatisticsSettings(prId);
  const settings = current?.settings || {};
  Object.assign(settings, fieldsToUpdate);
  current.settings = settings;
  const { response } = await prAPI.updateStatisticsSettings(prId, current);
  if (!response.ok()) {
    throw new Error(
      `updateStatisticsSettings(${prId}) failed: ${response.status()} ${response.statusText()}`,
    );
  }
  return current;
}

/**
 * Включить текстовые характеристики на PR.
 * GET → merge flags + characteristicSettings → POST.
 * @param {Object} prAPI - PerformanceReviewAPI instance
 * @param {number} prId - ID Performance Review
 * @param {Array} [characteristics=DEFAULT_CHARACTERISTICS] - массив характеристик
 * @returns {Promise<Object>} обновлённые настройки
 */
export async function setupCharacteristics(
  prAPI,
  prId,
  characteristics = DEFAULT_CHARACTERISTICS,
) {
  const { data: currentSettings } = await prAPI.getStatisticsSettings(prId);
  const newSettings = {
    ...currentSettings,
    settings: {
      ...currentSettings.settings,
      enableCustomCharacteristics: true,
      enableOnlyCustomCharacteristics: false,
    },
    characteristicSettings: characteristics,
  };
  const { response, data } = await prAPI.updateStatisticsSettings(
    prId,
    newSettings,
  );
  if (!response.ok()) {
    throw new Error(
      `setupCharacteristics(${prId}) failed: ${response.status()} ${response.statusText()}`,
    );
  }
  return data;
}

/**
 * Включить калибровку + текстовые характеристики на PR.
 * @param {Object} prAPI - PerformanceReviewAPI instance
 * @param {number} prId - ID Performance Review
 * @param {Array} [characteristics=DEFAULT_CHARACTERISTICS] - массив характеристик
 * @returns {Promise<Object>} обновлённые настройки
 */
export async function setupCharacteristicsWithCalibration(
  prAPI,
  prId,
  characteristics = DEFAULT_CHARACTERISTICS,
) {
  const { data: currentSettings } = await prAPI.getStatisticsSettings(prId);
  const newSettings = {
    ...currentSettings,
    settings: {
      ...currentSettings.settings,
      enableCalibration: true,
      enableResponsesOverwriting: true,
      enableCustomCharacteristics: true,
      enableOnlyCustomCharacteristics: false,
    },
    characteristicSettings: characteristics,
  };
  const { response, data } = await prAPI.updateStatisticsSettings(
    prId,
    newSettings,
  );
  if (!response.ok()) {
    throw new Error(
      `setupCharacteristicsWithCalibration(${prId}) failed: ${response.status()} ${response.statusText()}`,
    );
  }
  return data;
}

/**
 * Отключить текстовые характеристики на PR.
 * @param {Object} prAPI - PerformanceReviewAPI instance
 * @param {number} prId - ID Performance Review
 * @returns {Promise<Object>} обновлённые настройки
 */
export async function disableCharacteristics(prAPI, prId) {
  return patchStatisticsSettings(prAPI, prId, {
    enableCustomCharacteristics: false,
  });
}

/**
 * Сохранить текущие настройки для восстановления в afterAll.
 * @param {Object} prAPI - PerformanceReviewAPI instance
 * @param {number} prId - ID Performance Review
 * @returns {Promise<Object>} копия настроек
 */
export async function saveSettings(prAPI, prId) {
  const { data } = await prAPI.getStatisticsSettings(prId);
  return JSON.parse(JSON.stringify(data));
}

/**
 * Восстановить настройки из сохранённой копии.
 * @param {Object} prAPI - PerformanceReviewAPI instance
 * @param {number} prId - ID Performance Review
 * @param {Object} savedSettings - ранее сохранённые настройки
 */
export async function restoreSettings(prAPI, prId, savedSettings) {
  if (!savedSettings) return;
  await prAPI.updateStatisticsSettings(prId, savedSettings);
}
