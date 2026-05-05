#!/usr/bin/env node
/**
 * Скрипт для создания тестовых данных для Survey модуля
 *
 * Использование:
 *   node scripts/seed-survey-data.js
 *   node scripts/seed-survey-data.js --check   # только проверка данных
 *   node scripts/seed-survey-data.js --cleanup # очистка созданных данных
 *
 * Создаёт:
 *   - Черновик опроса с вопросами
 *   - Активный опрос с вопросами
 *   - Остановленный опрос
 *   - Напоминание для активного опроса
 */

import { request } from "@playwright/test";
import { SurveySeedHelper } from "../tests/utils/seed/SurveySeedHelper.js";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = process.env.BASE_URL || process.env.API_BASE_URL;

if (!BASE_URL) {
  console.error("ERROR: BASE_URL или API_BASE_URL не заданы в .env");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const cleanupOnly = args.includes("--cleanup");

  console.log("=".repeat(60));
  console.log("Survey Test Data Seeding Script");
  console.log("=".repeat(60));
  console.log(`BASE_URL: ${BASE_URL}`);
  console.log("");

  // Создаём Playwright request context
  const requestContext = await request.newContext({
    baseURL: BASE_URL,
  });

  const seedHelper = new SurveySeedHelper(requestContext);

  try {
    // Инициализация (авторизация)
    console.log("Авторизация...");
    await seedHelper.init("admin");
    console.log("Авторизация успешна\n");

    // Проверка существующих данных
    console.log("Проверка существующих данных...");
    const { hasData, counts } = await seedHelper.checkExistingData();
    console.log(`  Черновики: ${counts.draft}`);
    console.log(`  Активные: ${counts.active}`);
    console.log(`  Остановленные: ${counts.stopped}`);
    console.log("");

    if (checkOnly) {
      console.log("Режим проверки. Создание данных пропущено.");
      console.log(
        hasData ? "Данные присутствуют." : "Данные отсутствуют или неполные.",
      );
      await requestContext.dispose();
      return;
    }

    if (cleanupOnly) {
      console.log("Режим очистки...");
      await seedHelper.cleanup();
      console.log("Очистка завершена.");
      await requestContext.dispose();
      return;
    }

    // Создание тестовых данных
    if (hasData) {
      console.log("Тестовые данные уже существуют.");
      console.log("Для пересоздания сначала выполните очистку: --cleanup\n");
    }

    console.log("Создание новых тестовых данных...\n");
    const result = await seedHelper.seedAll();

    console.log("\n" + "=".repeat(60));
    console.log("Результат:");
    console.log("=".repeat(60));
    console.log(`Черновик опроса: ${result.draftSurvey?.id || "не создан"}`);
    console.log(`  - Название: ${result.draftSurvey?.title}`);
    console.log(`  - Ревизия: ${result.draftSurvey?.revisionAlias || "н/д"}`);
    console.log("");
    console.log(
      `Активный опрос (internal): ${result.activeSurvey?.id || "не создан"}`,
    );
    console.log(`  - Название: ${result.activeSurvey?.title}`);
    console.log(`  - Ревизия: ${result.activeSurvey?.revisionAlias || "н/д"}`);
    console.log("");
    console.log(
      `Активный опрос (external): ${result.externalSurvey?.id || "не создан"}`,
    );
    console.log(`  - Название: ${result.externalSurvey?.title}`);
    console.log(
      `  - Ревизия: ${result.externalSurvey?.revisionAlias || "н/д"}`,
    );
    console.log("");
    console.log(
      `Опрос с персональными кодами: ${result.personalCodeSurvey?.id || "не создан"}`,
    );
    console.log(`  - Название: ${result.personalCodeSurvey?.title}`);
    console.log(
      `  - Ревизия: ${result.personalCodeSurvey?.revisionAlias || "н/д"}`,
    );
    console.log(
      `  - allowPersonalLink: ${result.personalCodeSurvey?.allowPersonalLink}`,
    );
    console.log("");
    console.log(
      `Опрос с групповыми кодами: ${result.groupCodeSurvey?.id || "не создан"}`,
    );
    console.log(`  - Название: ${result.groupCodeSurvey?.title}`);
    console.log(
      `  - Ревизия: ${result.groupCodeSurvey?.revisionAlias || "н/д"}`,
    );
    console.log(`  - publicityType: ${result.groupCodeSurvey?.publicityType}`);
    console.log("");
    console.log(
      `Остановленный опрос: ${result.stoppedSurvey?.id || "не создан"}`,
    );
    console.log(`  - Название: ${result.stoppedSurvey?.title}`);
    console.log("");
    console.log(
      `Опрос с ответами (для статистики): ${result.surveyWithAnswers?.id || "не создан"}`,
    );
    console.log(`  - Название: ${result.surveyWithAnswers?.title}`);
    console.log(
      `  - Ревизия: ${result.surveyWithAnswers?.revisionAlias || "н/д"}`,
    );
    console.log(`  - Ответов: ${result.surveyWithAnswers?.answersCount || 0}`);
    console.log("");
    console.log(`Напоминание: ${result.remind?.id || "не создано"}`);
    console.log("");
    console.log("=".repeat(60));
    console.log("Готово! Теперь можно запустить тесты:");
    console.log("  npx playwright test tests/functional/api/survey*.spec.js");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\nОШИБКА:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await requestContext.dispose();
  }
}

main();
