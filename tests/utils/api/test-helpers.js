// tests/utils/api/test-helpers.js
// Общие хелперы для API тестов
// Используются в boundary, security и других API тестах

/**
 * Получить ID типа благодарности "Thanks" или первый доступный
 * @param {Object} feedbackAPI - FeedbackAPI инстанс
 * @returns {Promise<number|string|null>}
 */
export async function getThanksTypeId(feedbackAPI) {
  const { data } = await feedbackAPI.getFeedbackTypes();
  const items = data?.items || data || [];
  const thanksType = items.find(
    (t) =>
      t.name?.toLowerCase() === "thanks" ||
      t.code?.toLowerCase() === "thanks" ||
      t.selectable === true,
  );
  return thanksType?.id || items[0]?.id || null;
}

/**
 * Получить ID целевого пользователя (не текущего)
 * @param {Object} api - API клиент с методом get
 * @returns {Promise<number|string|null>}
 */
export async function getTargetUserId(api) {
  const { response, data } = await api.get("/manager/users?limit=10");
  if (response.ok()) {
    const users = data?.items || data || [];
    if (users.length > 1) return users[1].id;
    if (users.length > 0) return users[0].id;
  }
  return null;
}

/**
 * Получить ID текущего пользователя
 * @param {Object} api - API клиент с методом get
 * @returns {Promise<number|string|null>}
 */
export async function getCurrentUserId(api) {
  // Сначала проверяем, есть ли метод getCurrentUserId у API клиента (ObjectivesAPI, DevelopmentPlansAPI)
  if (typeof api.getCurrentUserId === "function") {
    const storedId = api.getCurrentUserId();
    if (storedId) return storedId;
  }
  // Fallback: получаем из API (с trailing slash)
  const { response, data } = await api.get("/private/users/current/");
  if (response.ok()) {
    return data?.id || data?.userId;
  }
  return null;
}

/**
 * Получить текущий период (год и квартал)
 * @returns {{ periodYear: number, periodQ: number }}
 */
export function getCurrentPeriod() {
  const now = new Date();
  const periodYear = now.getFullYear();
  const periodQ = Math.ceil((now.getMonth() + 1) / 3);
  return { periodYear, periodQ };
}

/**
 * Генерация строки заданной длины
 * @param {number} length - Длина строки
 * @param {string} char - Символ для заполнения
 * @returns {string}
 */
export function generateString(length, char = "x") {
  return char.repeat(length);
}

/**
 * Создать тестовую благодарность
 * @param {Object} feedbackAPI - FeedbackAPI инстанс
 * @param {Object} options - Опции создания
 * @returns {Promise<{ id: number|string|null, response: Response, data: Object }>}
 */
export async function createTestFeedback(feedbackAPI, options = {}) {
  const feedbackTypeId =
    options.feedbackTypeId || (await getThanksTypeId(feedbackAPI));
  const targetUserId =
    options.targetUserId || (await getTargetUserId(feedbackAPI));

  if (!feedbackTypeId || !targetUserId) {
    return { id: null, response: null, data: null };
  }

  const { response, data } = await feedbackAPI.create({
    body: options.body || `Test Feedback ${Date.now()}`,
    targets: [{ targetType: "user", entityId: targetUserId }],
    feedbackTypeId,
    userAccessType: options.userAccessType || "selective",
    usersWithAccess: options.usersWithAccess || [],
    ...options.extra,
  });

  return {
    id: data?.id || null,
    response,
    data,
  };
}

/**
 * Создать тестовую цель
 * @param {Object} objectivesAPI - ObjectivesAPI инстанс
 * @param {Object} options - Опции создания
 * @returns {Promise<{ id: number|string|null, response: Response, data: Object }>}
 */
export async function createTestObjective(objectivesAPI, options = {}) {
  const userId = options.userId || (await getCurrentUserId(objectivesAPI));
  const { periodYear, periodQ } = getCurrentPeriod();

  if (!userId) {
    return { id: null, response: null, data: null };
  }

  const { response, data } = await objectivesAPI.saveObjective({
    title: options.title || `Test Objective ${Date.now()}`,
    description: options.description || "Test objective description",
    periodYear: options.periodYear || periodYear,
    periodQ: options.periodQ || periodQ,
    status: options.status || "draft",
    level: options.level || "self",
    responsibleUserId: userId,
    userAccessType: options.userAccessType || "everybody",
    milestones: options.milestones || [
      {
        temporaryId: `temp-${Date.now()}`,
        title: "Milestone 1",
        type: "percent",
        weight: 100,
        progress: 0,
        responsibleUserId: userId,
      },
    ],
    ...options.extra,
  });

  return {
    id: data?.id || null,
    response,
    data,
  };
}

/**
 * Безопасное удаление благодарности
 * @param {Object} feedbackAPI - FeedbackAPI инстанс
 * @param {number|string} id - ID благодарности
 */
export async function safeDeleteFeedback(feedbackAPI, id) {
  if (!id) return;
  try {
    await feedbackAPI.delete(`/private/feedbacks/${id}/`);
  } catch (e) {
    // ignore
  }
}

/**
 * Безопасное удаление цели
 * @param {Object} objectivesAPI - ObjectivesAPI инстанс
 * @param {number|string} id - ID цели
 */
export async function safeDeleteObjective(objectivesAPI, id) {
  if (!id) return;
  try {
    await objectivesAPI.deleteObjective(id);
  } catch (e) {
    // ignore
  }
}

/**
 * Массовая очистка благодарностей
 * @param {Object} feedbackAPI - FeedbackAPI инстанс
 * @param {Array<number|string>} ids - Массив ID
 */
export async function cleanupFeedbacks(feedbackAPI, ids) {
  for (const id of ids) {
    await safeDeleteFeedback(feedbackAPI, id);
  }
}

/**
 * Массовая очистка целей
 * @param {Object} objectivesAPI - ObjectivesAPI инстанс
 * @param {Array<number|string>} ids - Массив ID
 */
export async function cleanupObjectives(objectivesAPI, ids) {
  for (const id of ids) {
    await safeDeleteObjective(objectivesAPI, id);
  }
}

/**
 * Получить стабильный snapshot heatmap — дожидается двух одинаковых ответов подряд.
 * Решает проблему фонового пересчёта кеша competences_history при нагрузке.
 * @param {Object} prAPI - PerformanceReviewAPI инстанс
 * @param {number|string} prId - ID оценки
 * @param {Object} params - { targetUsersIds, revisionId }
 * @param {Object} [options] - { maxAttempts: 8, intervalMs: 3000 }
 * @returns {Promise<string>} - Стабильный JSON-снимок heatMapResults.targetUsers
 */
export async function getStableHeatmapSnapshot(
  prAPI,
  prId,
  params,
  options = {},
) {
  const { maxAttempts = 8, intervalMs = 3000 } = options;
  let prev = null;
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await prAPI.getStatisticsSummaryResults(prId, params);
    const current = JSON.stringify(data?.heatMapResults?.targetUsers || {});
    if (prev !== null && current === prev) return current;
    prev = current;
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return prev;
}

/**
 * Получить массив ID оцениваемых пользователей из PR
 * @param {Object} prAPI - PerformanceReviewAPI инстанс
 * @param {number|string} prId - ID оценки
 * @returns {Promise<Array<number|string>>}
 */
export async function getTargetUserIds(prAPI, prId) {
  const { data: tuData } = await prAPI.getTargetUsers(prId, { limit: 50 });
  const items = tuData?.items || tuData || [];
  return items.map((u) => u.userId || u.user?.id || u.id);
}
