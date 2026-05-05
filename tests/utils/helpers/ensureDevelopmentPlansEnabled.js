import { DevelopmentPlansAPI } from "../api/DevelopmentPlansAPI.js";
import { getCredentials } from "../credentials.js";

/**
 * Проверяет, включён ли модуль ИПР, и включает через API если нет.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @returns {Promise<{wasEnabled: boolean, isEnabled: boolean}>}
 */
export async function ensureDevelopmentPlansEnabled(request) {
  const adminCreds = getCredentials("admin");
  const api = new DevelopmentPlansAPI(request);
  await api.signIn(adminCreds.email, adminCreds.password);

  const { data: settings } = await api.getDevelopmentPlansSettings();
  const wasEnabled = settings?.isEnabled === true;

  if (wasEnabled) {
    return { wasEnabled: true, isEnabled: true };
  }

  console.log("[ensureDevPlans] Модуль ИПР выключен — включаю через API...");
  const { response } = await api.saveManagerDevelopmentPlansSettings({
    isEnabled: true,
  });

  if (!response.ok()) {
    console.error(`[ensureDevPlans] Не удалось включить: ${response.status()}`);
    return { wasEnabled: false, isEnabled: false };
  }

  console.log("[ensureDevPlans] Модуль ИПР включён");
  return { wasEnabled: false, isEnabled: true };
}
