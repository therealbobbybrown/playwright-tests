// @ts-check
/**
 * Pre-cleanup утилита для удаления stale тестовых ролей.
 *
 * Тесты ролей создают роли с предсказуемыми паттернами имён (Test Role, Perm Test Role,
 * Test_manage*, Batch Role и т.д.). Если тест падает по таймауту или crash — afterEach/afterAll
 * не выполняется и роли остаются на стенде.
 *
 * Вызывайте cleanupStaleTestRoles() в beforeAll каждого файла, который создаёт роли.
 */

import { RolesAPI, getCredentials } from "../api/index.js";

/** Паттерны имён тестовых ролей */
const STALE_PATTERNS = [
  /^E2E_/,
  /^Test[ _]/i,
  /^Batch Role /,
  /^Perm Test Role /,
  /^Lifecycle Role /,
  /^UITest_/,
  /^Research_/,
  /^Updated Test Role /,
  /^Updated Role/,
  /DROP TABLE/i,
  /<img/i,
  /<script/i,
  /onerror/i,
  /alert\(/i,
  /^'; /,
  /\d{13}/,
];

/** Системные роли — нельзя удалять */
const PROTECTED_IDS = new Set([1, 2]);

/**
 * Удаляет stale тестовые роли со стенда.
 * Безопасно вызывать многократно — удаляет только роли с тестовыми паттернами имён.
 *
 * @param {import('@playwright/test').APIRequestContext} request - Playwright request context
 * @param {object} [options]
 * @param {boolean} [options.verbose=false] - логировать удалённые роли
 * @returns {Promise<{deleted: number, errors: number}>}
 */
export async function cleanupStaleTestRoles(request, options = {}) {
  const { verbose = false } = options;
  const api = new RolesAPI(request);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  const { data } = await api.getRoles({ limit: 500 });
  const items = data?.items || data || [];

  const staleRoles = items.filter((role) => {
    if (PROTECTED_IDS.has(role.id)) return false;
    return STALE_PATTERNS.some((p) => p.test(role.title));
  });

  let deleted = 0;
  let errors = 0;

  for (const role of staleRoles) {
    try {
      await api.deleteRole(role.id);
      deleted++;
      if (verbose) console.log(`  [cleanup] deleted role id=${role.id} "${role.title}"`);
    } catch {
      errors++;
      if (verbose) console.log(`  [cleanup] failed to delete role id=${role.id} "${role.title}"`);
    }
  }

  if (deleted > 0 || errors > 0) {
    console.log(`[staleRolesCleanup] deleted ${deleted} stale roles, ${errors} errors`);
  }

  return { deleted, errors };
}
