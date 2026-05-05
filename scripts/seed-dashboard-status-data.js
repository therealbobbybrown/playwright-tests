#!/usr/bin/env node
// scripts/seed-dashboard-status-data.js
/**
 * Скрипт для создания тестовых данных по статусам дашборда "Моя команда"
 *
 * Использование:
 *   node scripts/seed-dashboard-status-data.js           # Создать все сценарии
 *   node scripts/seed-dashboard-status-data.js --check   # Проверить существующие данные
 *   node scripts/seed-dashboard-status-data.js --cleanup # Очистить созданные данные
 */

import dotenv from "dotenv";
dotenv.config();

import { request } from "@playwright/test";
import { DashboardStatusSeed } from "../tests/utils/seed/DashboardStatusSeed.js";

const args = process.argv.slice(2);
const isCheck = args.includes("--check");
const isCleanup = args.includes("--cleanup");

async function main() {
  const baseURL = process.env.API_BASE_URL || process.env.BASE_URL;

  if (!baseURL) {
    console.error("❌ API_BASE_URL или BASE_URL не задан в .env");
    process.exit(1);
  }

  console.log(`🔗 Подключение к: ${baseURL}`);

  const requestContext = await request.newContext({ baseURL });
  const seed = new DashboardStatusSeed(requestContext);

  try {
    await seed.init();

    if (isCheck) {
      // Только проверка
      console.log("\n🔍 Проверка существующих данных...");
      const { hasData, prs } = await seed.checkExistingData();

      if (hasData) {
        console.log(`✓ Найдены тестовые PR: ${prs.length}`);
        for (const pr of prs) {
          console.log(`  - ${pr.title} (ID: ${pr.id}, status: ${pr.status})`);
        }
      } else {
        console.log("⚠️ Тестовые данные не найдены");
      }
    } else if (isCleanup) {
      // Очистка
      console.log("\n🧹 Очистка тестовых данных...");
      await seed.cleanup();
    } else {
      // Создание
      console.log("\n🚀 Создание тестовых данных...");
      const results = await seed.getOrSeedData();

      console.log("\n📋 Результаты:");
      for (const [key, pr] of Object.entries(results)) {
        if (pr) {
          console.log(`  ${key}:`);
          console.log(`    ID: ${pr.id}`);
          console.log(`    Title: ${pr.title}`);
        }
      }

      // Выводим конфигурацию для тестов
      console.log("\n📝 Конфигурация для dashboard-test-data.js:");
      console.log("```javascript");
      for (const [key, pr] of Object.entries(results)) {
        if (pr) {
          console.log(`  ${key}: {`);
          console.log(`    id: ${pr.id},`);
          console.log(`    title: '${pr.title}',`);
          console.log(`  },`);
        }
      }
      console.log("```");
    }
  } catch (error) {
    console.error("❌ Ошибка:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await requestContext.dispose();
  }

  console.log("\n✅ Готово!");
}

main();
