import { DashboardTeamAPI } from "../api/DashboardTeamAPI.js";
import { getCredentials } from "../credentials.js";

/**
 * Находит PR на дашборде «Моя команда», у которого >= minEmployees оцениваемых.
 *
 * Используется в тестах фильтра «Результаты для», где нужно минимум 2 сотрудника.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {number} [minEmployees=2]
 * @param {'admin' | 'manager' | 'head' | 'user'} [role='admin'] - Роль для авторизации
 * @returns {Promise<{prTitle: string, prId: number, employeeCount: number}>}
 */
export async function findPRWithMultipleEmployees(
  request,
  minEmployees = 2,
  role = "admin",
) {
  const api = new DashboardTeamAPI(request);
  const { email, password } = getCredentials(role);
  await api.signIn(email, password);

  const { data: prs } = await api.getDashboardFiltersPRs();
  const prList = prs?.items || prs || [];

  console.log(`[findPR] Всего PR на дашборде: ${prList.length}`);

  for (const pr of prList) {
    const { data: targetUsers } = await api.getDashboardFiltersTargetUsers(
      pr.id,
    );
    const users = targetUsers?.items || targetUsers || [];

    if (users.length >= minEmployees) {
      console.log(
        `[findPR] PR "${pr.title}" (ID: ${pr.id}) — ${users.length} сотрудников ✓`,
      );
      return { prTitle: pr.title, prId: pr.id, employeeCount: users.length };
    }
  }

  throw new Error(
    `Не найден PR с ${minEmployees}+ оцениваемыми на дашборде «Моя команда». ` +
      `Всего PR: ${prList.length}. Создайте seed-данные.`,
  );
}
