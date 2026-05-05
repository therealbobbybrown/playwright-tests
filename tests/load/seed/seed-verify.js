// tests/load/seed/seed-verify.js
// Скрипт для проверки наличия данных для нагрузочных тестов

import "dotenv/config";
import { chromium } from "@playwright/test";
import { PerformanceReviewAPI } from "../../utils/api/PerformanceReviewAPI.js";
import { SurveyAPI } from "../../utils/api/SurveyAPI.js";
import { OrgStructureAPI } from "../../utils/api/OrgStructureAPI.js";
import { getCredentials } from "../../utils/api/AuthAPI.js";
import { LOAD_TEST_CONFIG } from "./seed-config.js";

const { requirements } = LOAD_TEST_CONFIG;

async function verifyData() {
  console.log("=".repeat(60));
  console.log("ПРОВЕРКА ДАННЫХ ДЛЯ НАГРУЗОЧНЫХ ТЕСТОВ");
  console.log("=".repeat(60));

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const request = context.request;

  try {
    // Авторизация
    const { email, password } = getCredentials("admin");

    // Проверка OrgStructure
    console.log("\n📊 Проверка организационной структуры...");
    const orgAPI = new OrgStructureAPI(request);
    await orgAPI.signIn(email, password);

    const usersResult = await orgAPI.findUsers({ limit: 1 });
    const usersTotal = usersResult.data?.total || 0;
    const usersOk = usersTotal >= requirements.minUsers;
    console.log(
      `   Пользователи: ${usersTotal} (требуется: ${requirements.minUsers}) ${usersOk ? "✅" : "❌"}`,
    );

    const deptsResult = await orgAPI.getDepartments({ limit: 1 });
    const deptsTotal =
      deptsResult.data?.total || deptsResult.data?.items?.length || 0;
    const deptsOk = deptsTotal >= requirements.minDepartments;
    console.log(
      `   Департаменты: ${deptsTotal} (требуется: ${requirements.minDepartments}) ${deptsOk ? "✅" : "❌"}`,
    );

    const groupsResult = await orgAPI.getUserGroups({ limit: 1 });
    const groupsTotal =
      groupsResult.data?.total || groupsResult.data?.items?.length || 0;
    const groupsOk = groupsTotal >= requirements.minUserGroups;
    console.log(
      `   Группы: ${groupsTotal} (требуется: ${requirements.minUserGroups}) ${groupsOk ? "✅" : "❌"}`,
    );

    // Проверка Performance Review
    console.log("\n📈 Проверка Performance Reviews...");
    const prAPI = new PerformanceReviewAPI(request);
    await prAPI.signIn(email, password);

    const prListResult = await prAPI.getList({ limit: 10 });
    const prItems = prListResult.data?.items || prListResult.data || [];
    console.log(`   Всего PR: ${prItems.length}+`);

    let largePrFound = false;
    let largePrId = null;
    let maxParticipants = 0;

    for (const pr of prItems) {
      const countsResult = await prAPI.getUsersCounts(pr.id);
      const targetUsersCount = countsResult.data?.targetUsersCount || 0;

      if (targetUsersCount > maxParticipants) {
        maxParticipants = targetUsersCount;
        largePrId = pr.id;
      }

      if (targetUsersCount >= requirements.minPrParticipants) {
        largePrFound = true;
        console.log(
          `   PR "${pr.title}" (ID: ${pr.id}): ${targetUsersCount} участников ✅`,
        );
        break;
      }
    }

    if (!largePrFound) {
      console.log(
        `   ❌ Не найден PR с ${requirements.minPrParticipants}+ участников`,
      );
      console.log(
        `   Максимум найдено: ${maxParticipants} (PR ID: ${largePrId})`,
      );
    }

    // Проверка Surveys
    console.log("\n📝 Проверка опросов...");
    const surveyAPI = new SurveyAPI(request);
    await surveyAPI.signIn(email, password);

    const surveyListResult = await surveyAPI.getList({ limit: 10 });
    const surveyItems =
      surveyListResult.data?.items || surveyListResult.data || [];
    console.log(`   Всего опросов: ${surveyItems.length}+`);

    let largeSurveyFound = false;
    let largeSurveyId = null;
    let maxResponses = 0;

    for (const survey of surveyItems) {
      try {
        const statsResult = await surveyAPI.getStatisticsSummary(survey.id, {});
        const responsesCount =
          statsResult.data?.responsesCount ||
          statsResult.data?.completedCount ||
          0;

        if (responsesCount > maxResponses) {
          maxResponses = responsesCount;
          largeSurveyId = survey.id;
        }

        if (responsesCount >= requirements.minSurveyResponses) {
          largeSurveyFound = true;
          console.log(
            `   Опрос "${survey.title}" (ID: ${survey.id}): ${responsesCount} ответов ✅`,
          );
          break;
        }
      } catch {
        // Игнорируем ошибки доступа к статистике
      }
    }

    if (!largeSurveyFound) {
      console.log(
        `   ❌ Не найден опрос с ${requirements.minSurveyResponses}+ ответов`,
      );
      console.log(
        `   Максимум найдено: ${maxResponses} (Survey ID: ${largeSurveyId})`,
      );
    }

    // Итоговый статус
    console.log("\n" + "=".repeat(60));
    console.log("ИТОГИ");
    console.log("=".repeat(60));

    const allOk =
      usersOk && deptsOk && groupsOk && largePrFound && largeSurveyFound;

    if (allOk) {
      console.log("✅ Все данные готовы для нагрузочных тестов!");
    } else {
      console.log("❌ Требуется подготовка данных:");

      if (!usersOk) {
        console.log(
          `   - Добавьте пользователей (сейчас: ${usersTotal}, нужно: ${requirements.minUsers})`,
        );
      }
      if (!deptsOk) {
        console.log(
          `   - Добавьте департаменты (сейчас: ${deptsTotal}, нужно: ${requirements.minDepartments})`,
        );
      }
      if (!groupsOk) {
        console.log(
          `   - Добавьте группы (сейчас: ${groupsTotal}, нужно: ${requirements.minUserGroups})`,
        );
      }
      if (!largePrFound) {
        console.log(
          `   - Создайте PR с ${requirements.minPrParticipants}+ участников (сейчас макс: ${maxParticipants})`,
        );
      }
      if (!largeSurveyFound) {
        console.log(
          `   - Создайте опрос с ${requirements.minSurveyResponses}+ ответов (сейчас макс: ${maxResponses})`,
        );
      }
    }

    // Рекомендуемые ID для конфигурации
    console.log("\n📋 Рекомендуемые ID для seed-config.js:");
    console.log(
      `   largePrId: ${largePrId || "null"} (${maxParticipants} участников)`,
    );
    console.log(
      `   largeSurveyId: ${largeSurveyId || "null"} (${maxResponses} ответов)`,
    );
    console.log(`   largeDeptId: (требуется определить вручную)`);

    console.log("\n" + "=".repeat(60));
  } catch (error) {
    console.error("Ошибка при проверке данных:", error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

verifyData().catch(console.error);
