import "dotenv/config";
import { request } from "@playwright/test";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../tests/utils/api/index.js";

/**
 * ПРИНУДИТЕЛЬНАЯ очистка ВСЕХ тестовых PR
 * Удаляет все PR с префиксами E2E_, v1-v10, Status Test PR
 *
 * ВНИМАНИЕ: Этот скрипт делает soft delete (archive + remove).
 * PR исчезнут из списка только после перезагрузки страницы.
 */

(async () => {
  const ctx = await request.newContext({
    baseURL: process.env.API_BASE_URL,
  });
  const prAPI = new PerformanceReviewAPI(ctx);
  const creds = getCredentials("admin");

  console.log("🔐 Авторизация...");
  await prAPI.signIn(creds.email, creds.password);

  // Получаем ВСЕ PR включая архивированные
  console.log("📋 Загрузка всех PR (включая архивированные)...");
  const { data: allData } = await prAPI.get(
    "/manager/performance-reviews/?limit=1000&withArchived=true",
  );
  const allItems = allData?.items || [];
  console.log(`   Всего PR в системе: ${allItems.length}`);

  // Фильтруем тестовые PR
  const testPRs = allItems.filter((pr) => {
    const title = pr.title || "";
    return (
      title.includes("Regression - ") ||
      title.includes("E2E_") ||
      title.includes("Self✓_Manager") ||
      title.includes("All_Awaiting") ||
      title.includes("All_Complete") ||
      title.includes("Colleagues_NotApproved") ||
      title.includes("Status Test PR") ||
      title.includes("SET-005 Test TextChars") ||
      title.includes("SET-005 TextChars") ||
      title.includes("SET-006 OnlyTextChars") ||
      title.includes("SET-007 CalibNoText") ||
      title.includes("SET-008 CalibTextNum") ||
      title.includes("SET-009 CalibOnlyText") ||
      title.includes("SET-010 NumOnly") ||
      title.includes("SET-011 EmpResNum") ||
      title.includes("SET-012 EmpResTextNum") ||
      title.includes("SET-013 EmpResOnlyText") ||
      title.includes("SET-014 SharedNum") ||
      title.includes("SET-015 SharedTextNum") ||
      title.includes("SET-016 SharedOnlyText") ||
      title.includes("SET-017 DashNum") ||
      title.includes("SET-018 DashTextNum") ||
      title.includes("SET-019 DashOnlyText") ||
      title.includes("Settings Data Test") ||
      title.includes("Settings Test -") ||
      title.includes("Test PR - Fill") ||
      title.includes("PR_Directions_") ||
      title.includes("Calibration_Test_PR_") ||
      title.includes("Debug_PR_") ||
      title.includes("Trace_PR_") ||
      title === "Performance Review" ||
      title.includes("Пустое направление") ||
      title.includes("Data Persistence Test") ||
      title.includes("Full Cycle Test") ||
      title.includes("Start Archived Test") ||
      title.includes("Кейс ") ||
      title.includes("Кнопка предложения коллег") ||
      title.includes("откроется ли модалка") ||
      title.includes("PR-300 Все направления") ||
      title.includes("Добавление коллеги") ||
      title.includes("Добавление участника") ||
      title.includes("Отключение направления") ||
      title.includes("BUG-PR-") ||
      title.includes("Напоминания 1") ||
      title.includes("Администраторы 1") ||
      title.includes("Архивный PR 1") ||
      title.includes("Завершённый PR 1") ||
      title.includes("Черновик анкеты 1") ||
      title.includes("CalibrationIntegration") ||
      title.includes("WeightsIntegration") ||
      title.includes("CompletedPR") ||
      title.includes("Validation Threshold") ||
      title.includes("Validation Names") ||
      title.includes("PR manual colleagues") ||
      /\d{13}/.test(title) || // unix timestamp в имени
      /v\d+_/.test(title) || // любые v1_, v2_, ..., v99_
      /^[A-Z][a-z]+ [A-Z][a-z]+( [A-Z][a-z]+)? \d{3,5}$/.test(title) || // load test: "Company Name 1234" or "Next Level Tech 1234"
      // === Новые русские названия (после рефакторинга) ===
      /^E2E_/.test(title) || // все тестовые данные из generateUniqueName
      title.includes("Черновик ревью") ||
      title.includes("Активное ревью") ||
      title.includes("Остановленное ревью") ||
      title.includes("Калибровка ревью") ||
      title.includes("Направления ревью") ||
      title.includes("Распределение оценок") ||
      title.includes("Ручная проверка")
    );
  });

  console.log(`\n🎯 Найдено тестовых PR: ${testPRs.length}`);

  if (testPRs.length === 0) {
    console.log("✅ Нет тестовых PR для удаления");
    await ctx.dispose();
    return;
  }

  // Показываем примеры
  console.log("\n📝 Примеры найденных PR:");
  testPRs.slice(0, 5).forEach((pr) => {
    console.log(`   ${pr.id} - ${pr.title?.substring(0, 50)}`);
  });
  if (testPRs.length > 5) {
    console.log(`   ... и еще ${testPRs.length - 5}`);
  }

  console.log("\n🗑️  Начинаю удаление...");

  let deleted = 0;
  let errors = 0;

  /**
   * Останавливает все стадии PR перед архивированием
   * @param {number} prId - ID PR
   * @param {string} status - Текущий статус PR
   */
  async function stopAllStages(prId, status) {
    // Останавливаем стадии в зависимости от статуса
    if (status === "nomination") {
      await prAPI.stopNominationStage(prId);
      await new Promise((resolve) => setTimeout(resolve, 500));
      // После stopNominationStage статус становится headApprove
      status = "headApprove";
    }

    if (status === "headApprove") {
      await prAPI.stopApprovalStage(prId);
      await new Promise((resolve) => setTimeout(resolve, 500));
      // После stopApprovalStage статус становится adminCheck
      status = "adminCheck";
    }

    if (status === "adminCheck") {
      await prAPI.stopAdminCheckStage(prId);
      await new Promise((resolve) => setTimeout(resolve, 500));
      // После stopAdminCheckStage статус становится active
      status = "active";
    }

    if (status === "active") {
      await prAPI.stop(prId);
      await new Promise((resolve) => setTimeout(resolve, 500));
      // После stop статус становится complete
    }
  }

  for (const pr of testPRs) {
    try {
      // Останавливаем все стадии если PR не архивирован
      if (!pr.archivedAt) {
        await stopAllStages(pr.id, pr.status);

        // Архивируем
        await prAPI.archive(pr.id);
      }

      // Удаляем
      await prAPI.remove(pr.id);

      deleted++;
      if (deleted % 10 === 0) {
        console.log(`   Удалено: ${deleted}/${testPRs.length}`);
      }
    } catch (e) {
      errors++;
      if (errors <= 5) {
        console.log(
          `   ⚠️ Ошибка при удалении PR ${pr.id}: ${e.message?.substring(0, 50)}`,
        );
      }
    }
  }

  console.log(`\n✅ Удаление завершено!`);
  console.log(`   ✓ Удалено успешно: ${deleted}`);
  if (errors > 0) {
    console.log(`   ⚠️ Ошибок: ${errors}`);
  }

  console.log("\n💡 Обновите страницу в браузере чтобы увидеть изменения");

  await ctx.dispose();
})();
