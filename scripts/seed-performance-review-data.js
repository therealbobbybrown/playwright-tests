#!/usr/bin/env node
/**
 * Скрипт для создания тестовых данных Performance Review
 *
 * Использование:
 *   npm run seed:pr           - создать тестовые данные
 *   npm run seed:pr:check     - проверить существующие данные
 *   npm run seed:pr:cleanup   - очистить созданные данные
 */

import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewSeedHelper } from "../tests/utils/seed/index.js";

const args = process.argv.slice(2);
const isCheck = args.includes("--check");
const isCleanup = args.includes("--cleanup");

console.log("============================================================");
console.log("Performance Review Test Data Seeding Script");
console.log("============================================================");
console.log("BASE_URL:", process.env.BASE_URL || "не задан");
console.log("");

async function main() {
  const baseURL = process.env.API_BASE_URL;

  const context = await request.newContext({ baseURL });

  const seedHelper = new PerformanceReviewSeedHelper(context);

  try {
    console.log("Авторизация...");
    await seedHelper.init("admin");
    console.log("Авторизация успешна");
    console.log("");

    // Проверка существующих данных
    console.log("Проверка существующих данных...");
    const { hasData, counts } = await seedHelper.checkExistingData();
    console.log(`  Всего PR: ${counts.total}`);
    console.log(`  Черновики: ${counts.draft}`);
    console.log(`  Активные: ${counts.active}`);
    console.log(`  Завершённые: ${counts.stopped}`);
    console.log("");

    if (isCheck) {
      console.log("Режим проверки. Создание данных пропущено.");
      if (hasData) {
        console.log("Данные присутствуют.");
      } else {
        console.log("Данных недостаточно. Запустите без --check для создания.");
      }
      return;
    }

    if (isCleanup) {
      console.log("Режим очистки...");
      // Очистка только тех данных, которые были созданы этим скриптом
      // В реальности нужно хранить ID или использовать паттерн именования
      console.log("Очистка требует ручного указания ID созданных данных.");
      console.log('Используйте паттерн "Test_" для поиска тестовых данных.');
      return;
    }

    if (hasData) {
      console.log("Тестовые данные уже существуют.");
      console.log("Для пересоздания сначала выполните очистку: --cleanup");
      console.log("");
    }

    // Создание новых данных
    console.log("Создание новых тестовых данных...");
    console.log("");

    const result = await seedHelper.seedAll();

    console.log("");
    console.log("============================================================");
    console.log("Результат:");
    console.log("============================================================");
    console.log(`Черновик PR: ${result.draftPR.id}`);
    console.log(`  - Название: ${result.draftPR.title}`);
    console.log("");
    console.log(`Активный PR: ${result.activePR.id}`);
    console.log(`  - Название: ${result.activePR.title}`);
    console.log(`  - Ревизия: ${result.activePR.revisionId || "не создана"}`);
    console.log(
      `  - Target User: ${result.activePR.targetUserId || "не добавлен"}`,
    );
    console.log("");
    console.log(`Напоминание: ${result.remind?.id || "не создано"}`);
    console.log("");
    console.log("============================================================");
    console.log("Готово! Теперь можно запустить тесты:");
    console.log(
      "  npx playwright test tests/functional/api/performance-review*.spec.js",
    );
    console.log("============================================================");
  } catch (error) {
    console.error("Ошибка:", error.message);
    process.exit(1);
  } finally {
    await context.dispose();
  }
}

main();
