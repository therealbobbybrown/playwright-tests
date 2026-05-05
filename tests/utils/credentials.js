// tests/utils/credentials.js
// Единственный источник истины для получения учётных данных из .env

/**
 * Выбрать роль админа по индексу параллельного воркера.
 * Worker 0 → 'admin', Worker 1+ → 'admin2' (если задан в .env).
 * Безопасный fallback: если ADMIN2_LOGIN не задан, всегда 'admin'.
 * @param {number} parallelIndex - testInfo.parallelIndex
 * @returns {'admin' | 'admin2'}
 */
export function getWorkerAdminRole(parallelIndex = 0) {
  if (parallelIndex > 0 && process.env.ADMIN2_LOGIN) {
    return "admin2";
  }
  return "admin";
}

/**
 * Получить учётные данные для указанной роли
 * @param {'admin' | 'admin2' | 'user' | 'manager' | 'head' | 'employee' | 'support'} role - Роль пользователя
 * @returns {{email: string, password: string}} Учётные данные
 * @throws {Error} Если роль неизвестна или креды не найдены в .env
 */

export function getCredentials(role = "admin") {
  const map = {
    admin: {
      email: process.env.ADMIN_LOGIN,
      password: process.env.ADMIN_PASSWORD,
    },
    // Второй администратор для параллельного воркера
    admin2: {
      email: process.env.ADMIN2_LOGIN,
      password: process.env.ADMIN2_PASSWORD,
    },
    user: {
      email: process.env.USER_LOGIN,
      password: process.env.USER_PASSWORD,
    },
    manager: {
      email: process.env.MANAGER_LOGIN,
      password: process.env.MANAGER_PASSWORD,
    },
    // Руководитель отдела (Head of Department)
    head: {
      email: process.env.HEAD_LOGIN,
      password: process.env.HEAD_PASSWORD,
    },
    // Алиас для user (используется в тестах калибровки)
    employee: {
      email: process.env.USER_LOGIN,
      password: process.env.USER_PASSWORD,
    },
    // Техподдержка (частично заполненный профиль: нет должности, отдела, руководителя)
    support: {
      email: process.env.SUPPORT_LOGIN,
      password: process.env.SUPPORT_PASSWORD,
    },
    // SSO тестовый пользователь (Auth0)
    sso: {
      email: process.env.SSO_USER_LOGIN,
      password: process.env.SSO_USER_PASSWORD,
    },
  };

  const creds = map[role];
  if (!creds) {
    throw new Error(`Неизвестная роль "${role}" в getCredentials()`);
  }

  const { email, password } = creds;

  if (!email || !password) {
    throw new Error(
      `Не найдены креды для роли "${role}" в .env. Сейчас email=${String(
        email,
      )}, password=${String(password)}`,
    );
  }

  return { email, password };
}

/**
 * Получить пароль для тестовых пользователей (активных сотрудников)
 * Используется в seed-скриптах для заполнения анкет от имени респондентов
 * @returns {string} Пароль тестовых пользователей
 */
export function getTestUserPassword() {
  return process.env.TEST_USER_PASSWORD || "DemoPass_7421!";
}
