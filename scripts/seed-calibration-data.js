#!/usr/bin/env node
/**
 * Скрипт для создания тестовых данных калибровки Performance Review
 *
 * Создаёт полноценный PR с заполненными анкетами для тестирования калибровки.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ БЫСТРЫЙ СТАРТ                                                               │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ # Финальный тест: 3 направления, 3 оцениваемых, 2 цикла                     │
 * │ node scripts/seed-calibration-data.js \                                     │
 * │   --directions=self,head,colleague --target-users=3 --receivers=2 --cycles=1│
 * │                                                                             │
 * │ # Только самооценка, 4 человека, 4 цикла                                    │
 * │ node scripts/seed-calibration-data.js --directions=self --target-users=4 \  │
 * │   --cycles=3                                                                │
 * │                                                                             │
 * │ # С кастомным направлением "Ментор"                                         │
 * │ node scripts/seed-calibration-data.js \                                     │
 * │   --directions=self,head,custom:Ментор --target-users=3 --receivers=2       │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ПАРАМЕТРЫ:
 *
 * | Параметр       | Описание                                      | По умолчанию |
 * |----------------|-----------------------------------------------|--------------|
 * | --directions   | Направления оценки (см. ниже)                 | все 4        |
 * | --target-users | Количество оцениваемых сотрудников            | 3            |
 * | --receivers    | Респондентов на направление                   | 2            |
 * | --cycles       | Дополнительные циклы (итого cycles+1 ревизий) | 0            |
 * | --no-fill      | Не заполнять анкеты автоматически             | false        |
 * | --check        | Проверить существующие данные                 | -            |
 * | --cleanup      | Очистить созданные данные                     | -            |
 * | --full         | Полный seed (все 4 направления)               | -            |
 *
 * НАПРАВЛЕНИЯ (--directions):
 *
 * | Значение        | Описание                                     |
 * |-----------------|----------------------------------------------|
 * | self            | Самооценка (оцениваемый сам себя)            |
 * | head            | Руководитель (автоматически по иерархии)     |
 * | subordinate     | Подчинённые (автоматически по иерархии)      |
 * | colleague       | Коллеги (назначаются, мин. 2 для анонимности)|
 * | custom:Name     | Кастомное направление с названием "Name"     |
 *
 * ПРИМЕРЫ:
 *
 * # Минимальный PR - только самооценка
 * node scripts/seed-calibration-data.js --directions=self --target-users=2
 *
 * # Стандартный PR - самооценка + руководитель
 * node scripts/seed-calibration-data.js --directions=self,head --target-users=3
 *
 * # Полный PR с коллегами
 * node scripts/seed-calibration-data.js --directions=self,head,colleague \
 *   --target-users=3 --receivers=2
 *
 * # Несколько циклов оценки
 * node scripts/seed-calibration-data.js --directions=self,head --cycles=3
 *
 * # Кастомные направления
 * node scripts/seed-calibration-data.js --directions=self,custom:Ментор,custom:HR
 *
 * # Без автозаполнения (для ручного тестирования)
 * node scripts/seed-calibration-data.js --directions=self,head --no-fill
 *
 * ЧТО СОЗДАЁТСЯ:
 *
 * 1. Группы компетенций (2 шт с суффиксом _Test)
 * 2. Компетенции (6 шт, по 3 в группе)
 * 3. Анкета с вопросами (scale + singleSelect)
 * 4. Performance Review с выбранными направлениями
 * 5. Target users (оцениваемые) с иерархией руководителей
 * 6. Receiver users для каждого направления
 * 7. Заполненные анкеты через populateReview API
 * 8. Дополнительные циклы (ревизии) если указано --cycles
 *
 * ОСОБЕННОСТИ:
 *
 * - Анкеты заполняются через API populateReview (от имени всех респондентов)
 * - Для анонимных направлений минимум 2 респондента (--receivers=2)
 * - Таймаут API увеличен до 2 минут для медленных запросов
 * - Каждый цикл: stop → resume → заполнение анкет
 */

import "dotenv/config";
import { request } from "@playwright/test";
import { CalibrationSeed } from "../tests/utils/seed/CalibrationSeed.js";

const args = process.argv.slice(2);
const isCheck = args.includes("--check");
const isCleanup = args.includes("--cleanup");
const isFull = args.includes("--full");
const noFill = args.includes("--no-fill");

// Парсинг параметра --directions
function parseDirections(args) {
  const dirArg = args.find((a) => a.startsWith("--directions="));
  if (!dirArg) return null;

  const dirString = dirArg.split("=")[1];
  const parts = dirString.split(",");

  const config = {
    self: false,
    head: false,
    subordinate: false,
    colleague: false,
    custom: [],
  };

  for (const part of parts) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed === "self") config.self = true;
    else if (trimmed === "head") config.head = true;
    else if (trimmed === "subordinate") config.subordinate = true;
    else if (trimmed === "colleague") config.colleague = true;
    else if (trimmed.startsWith("custom:")) {
      const customName = part.trim().substring(7); // Сохраняем оригинальный регистр
      if (customName) config.custom.push(customName);
    }
  }

  return config;
}

// Парсинг числовых параметров
function parseNumber(args, paramName, defaultValue) {
  const arg = args.find((a) => a.startsWith(`--${paramName}=`));
  if (!arg) return defaultValue;
  const value = parseInt(arg.split("=")[1], 10);
  return isNaN(value) ? defaultValue : value;
}

const directionsConfig = parseDirections(args);
const targetUsersCount = parseNumber(args, "target-users", 3);
const receiversCount = parseNumber(args, "receivers", 2);
const cyclesCount = parseNumber(args, "cycles", 0);

console.log("============================================================");
console.log("Calibration Test Data Seeding Script");
console.log("============================================================");
console.log("API_BASE_URL:", process.env.API_BASE_URL || "не задан");
console.log("");

async function main() {
  const baseURL = process.env.API_BASE_URL;

  // Увеличиваем таймаут для медленных запросов
  const context = await request.newContext({
    baseURL,
    timeout: 60000, // 60 секунд вместо 30
  });

  const seed = new CalibrationSeed(context);

  try {
    console.log("Авторизация...");
    await seed.init();
    console.log("Авторизация успешна");
    console.log("");

    if (isCheck) {
      console.log("Режим проверки...");

      // Проверяем группы компетенций
      const { data: groups } = await seed.competenciesAPI.getCompetenceGroups();
      console.log(
        `  Группы компетенций (raw): ${JSON.stringify(groups).substring(0, 200)}`,
      );
      const groupsCount =
        groups?.items?.length || (Array.isArray(groups) ? groups.length : 0);
      console.log(`  Группы компетенций: ${groupsCount}`);

      // Проверяем компетенции
      const { data: competencies } =
        await seed.competenciesAPI.getCompetencies();
      console.log(
        `  Компетенции (raw): ${JSON.stringify(competencies).substring(0, 200)}`,
      );
      const compsCount =
        competencies?.items?.length ||
        (Array.isArray(competencies) ? competencies.length : 0);
      console.log(`  Компетенции: ${compsCount}`);

      // Показываем группы с компетенциями
      if (groups?.items?.length > 0) {
        console.log("\n  Найденные группы:");
        for (const group of groups.items.slice(0, 5)) {
          console.log(`    - ${group.title} (ID: ${group.id})`);
        }
      }

      console.log("\nРежим проверки завершён.");
      return;
    }

    if (isCleanup) {
      console.log("Режим очистки...");
      await seed.cleanup();
      console.log("Очистка завершена.");
      return;
    }

    let result;

    // Если указаны направления через --directions, используем seedWithDirections
    if (directionsConfig) {
      console.log("Режим: настраиваемые направления");
      result = await seed.seedWithDirections({
        directions: directionsConfig,
        targetUsersCount,
        receiversPerDirection: receiversCount,
        fillQuestionnaires: !noFill,
      });
    } else if (isFull) {
      // Полный seed со всеми 4 направлениями
      console.log("Режим: полный seed (все направления)");
      result = await seed.seedFullCalibration();
    } else {
      // Базовый seed (только черновик)
      console.log("Режим: базовый seed (черновик)");
      result = await seed.seedAll();
    }

    // Запускаем дополнительные циклы оценки (ревизии), если указано
    let revisions = null;
    if (cyclesCount > 0 && result.prId && !result.error) {
      revisions = await seed.runRevisionCycles(
        result.prId,
        cyclesCount,
        result.competencies || [],
      );
    }

    console.log("");
    console.log("============================================================");
    console.log("Результат:");
    console.log("============================================================");
    console.log(`PR ID: ${result.prId}`);
    console.log(`Assessment ID: ${result.assessmentId}`);
    if (result.revisionId) {
      console.log(`Revision ID: ${result.revisionId}`);
    }
    if (revisions && revisions.length > 0) {
      console.log(`Всего ревизий: ${revisions.length}`);
    }
    console.log(`Группы компетенций: ${result.groups?.length || 0}`);
    console.log(`Компетенции: ${result.competencies?.length || 0}`);
    if (result.directionsConfig) {
      const activeCount = seed.getActiveDirectionsCount(
        result.directionsConfig,
      );
      console.log(`Направлений: ${activeCount}`);
    }
    console.log("");

    if (isFull || directionsConfig) {
      console.log(
        "============================================================",
      );
      console.log("✅ PR создан и готов к использованию!");
      console.log(
        "============================================================",
      );
      console.log(`  URL: /ru/manager/performance-reviews/${result.prId}/`);
      if (revisions && revisions.length > 1) {
        console.log(`  Создано ${revisions.length} ревизий (циклов оценки)`);
      }
    } else {
      console.log(
        "============================================================",
      );
      console.log("Для полноценного PR с заполненными анкетами:");
      console.log(
        "============================================================",
      );
      console.log("  npm run seed:calibration:full");
      console.log("");
      console.log("Или с настройкой направлений:");
      console.log(
        "  node scripts/seed-calibration-data.js --directions=self,head,subordinate",
      );
      console.log(
        "  node scripts/seed-calibration-data.js --directions=self,custom:Ментор",
      );
      console.log("");
      console.log("С несколькими циклами оценки (ревизиями):");
      console.log(
        "  node scripts/seed-calibration-data.js --directions=self,head --cycles=2",
      );
    }
    console.log("");
    console.log("Для запуска тестов калибровки:");
    console.log(
      "  npx playwright test tests/functional/performance-review/calibration/",
    );
    console.log("============================================================");
  } catch (error) {
    console.error("Ошибка:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await context.dispose();
  }
}

main();
