// tests/load/utils/measure-time.js
// Утилиты для измерения времени отклика API

/**
 * Измеряет время выполнения асинхронной функции
 * @param {Function} asyncFn - Асинхронная функция для выполнения
 * @returns {Promise<Object>} Результат с временем выполнения
 */
export async function measureTime(asyncFn) {
  const startTime = Date.now();
  const result = await asyncFn();
  const endTime = Date.now();
  const duration = endTime - startTime;

  return {
    ...result,
    duration,
    startTime,
    endTime,
  };
}

/**
 * Выполняет несколько замеров и возвращает статистику
 * @param {Function} asyncFn - Асинхронная функция для выполнения
 * @param {number} samples - Количество замеров
 * @returns {Promise<Object>} Статистика времени выполнения
 */
export async function measureTimeStats(asyncFn, samples = 5) {
  const times = [];
  const results = [];

  for (let i = 0; i < samples; i++) {
    const result = await measureTime(asyncFn);

    if (result.response?.ok() || result.response?.status() === 403) {
      times.push(result.duration);
      results.push(result);
    }
  }

  if (times.length === 0) {
    return {
      success: false,
      samples: 0,
      results,
    };
  }

  const sorted = [...times].sort((a, b) => a - b);

  return {
    success: true,
    samples: times.length,
    avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
    min: Math.min(...times),
    max: Math.max(...times),
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
    p99: sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1],
    times,
    results,
  };
}

/**
 * Выполняет параллельные запросы и возвращает статистику
 * @param {Function[]} asyncFns - Массив асинхронных функций
 * @returns {Promise<Object>} Результаты и статистика
 */
export async function measureParallel(asyncFns) {
  const startTime = Date.now();
  const results = await Promise.all(
    asyncFns.map(async (fn) => {
      const reqStart = Date.now();
      try {
        const result = await fn();
        return {
          ...result,
          duration: Date.now() - reqStart,
          success: true,
        };
      } catch (error) {
        return {
          error: error.message,
          duration: Date.now() - reqStart,
          success: false,
        };
      }
    }),
  );

  const totalTime = Date.now() - startTime;
  const successful = results.filter((r) => r.success && r.response?.ok());
  const serverErrors = results.filter((r) => r.response?.status() >= 500);
  const clientErrors = results.filter(
    (r) => r.response?.status() >= 400 && r.response?.status() < 500,
  );

  const times = results.filter((r) => r.success).map((r) => r.duration);

  return {
    totalTime,
    requestCount: asyncFns.length,
    successCount: successful.length,
    serverErrorCount: serverErrors.length,
    clientErrorCount: clientErrors.length,
    avgTime: times.length
      ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      : 0,
    minTime: times.length ? Math.min(...times) : 0,
    maxTime: times.length ? Math.max(...times) : 0,
    rps: Math.round((asyncFns.length / totalTime) * 1000),
    results,
  };
}

/**
 * Выполняет sustained load тест
 * @param {Function} asyncFn - Асинхронная функция
 * @param {Object} options - Параметры теста
 * @param {number} options.durationMs - Продолжительность теста (ms)
 * @param {number} options.delayMs - Задержка между запросами (ms)
 * @returns {Promise<Object>} Результаты теста
 */
export async function sustainedLoad(
  asyncFn,
  { durationMs = 60000, delayMs = 500 } = {},
) {
  const results = [];
  const startTime = Date.now();

  while (Date.now() - startTime < durationMs) {
    const reqStart = Date.now();
    try {
      const result = await asyncFn();
      results.push({
        timestamp: Date.now() - startTime,
        duration: Date.now() - reqStart,
        status: result.response?.status(),
        success: result.response?.ok(),
      });
    } catch (error) {
      results.push({
        timestamp: Date.now() - startTime,
        duration: Date.now() - reqStart,
        error: error.message,
        success: false,
      });
    }

    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const totalTime = Date.now() - startTime;
  const successful = results.filter((r) => r.success);
  const serverErrors = results.filter((r) => r.status >= 500);
  const times = results.map((r) => r.duration);

  return {
    totalTime,
    totalRequests: results.length,
    requestCount: results.length,
    successCount: successful.length,
    // Возвращаем rate как ratio (0-1), а не проценты
    successRate: results.length > 0 ? successful.length / results.length : 0,
    serverErrorCount: serverErrors.length,
    serverErrorRate:
      results.length > 0 ? serverErrors.length / results.length : 0,
    avgTime:
      times.length > 0
        ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
        : 0,
    minTime: times.length > 0 ? Math.min(...times) : 0,
    maxTime: times.length > 0 ? Math.max(...times) : 0,
    rps: totalTime > 0 ? Math.round((results.length / totalTime) * 1000) : 0,
    // Проверяем деградацию (последние 10 запросов vs первые 10)
    degradation: checkDegradation(results),
    results,
  };
}

/**
 * Проверяет деградацию производительности
 * @param {Array} results - Результаты запросов
 * @returns {Object} Информация о деградации
 */
function checkDegradation(results) {
  if (results.length < 20) {
    return { detected: false, reason: "insufficient data" };
  }

  const first10 = results.slice(0, 10);
  const last10 = results.slice(-10);

  const avgFirst = first10.reduce((a, b) => a + b.duration, 0) / 10;
  const avgLast = last10.reduce((a, b) => a + b.duration, 0) / 10;

  const ratio = avgLast / avgFirst;

  return {
    detected: ratio > 2,
    avgFirst: Math.round(avgFirst),
    avgLast: Math.round(avgLast),
    ratio: ratio.toFixed(2),
  };
}

/**
 * Форматирует результаты для логирования
 * @param {Object} stats - Статистика
 * @returns {string} Отформатированная строка
 */
export function formatStats(stats) {
  if (!stats.success && stats.samples === 0) {
    return "No successful requests";
  }

  return [
    `Samples: ${stats.samples}`,
    `Avg: ${stats.avg}ms`,
    `Min: ${stats.min}ms`,
    `Max: ${stats.max}ms`,
    `P50: ${stats.p50}ms`,
    `P95: ${stats.p95}ms`,
    `P99: ${stats.p99}ms`,
  ].join(", ");
}

export default {
  measureTime,
  measureTimeStats,
  measureParallel,
  sustainedLoad,
  formatStats,
};
