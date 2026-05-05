#!/usr/bin/env node
// tests/load/seed/seed-large-survey.js
// Скрипт для создания опроса с максимальным количеством участников
// Для полноценного теста статистики нужны ответы - их можно эмулировать через UI или API

import { chromium } from "@playwright/test";
import { SurveyAPI } from "../../utils/api/SurveyAPI.js";
import { OrgStructureAPI } from "../../utils/api/OrgStructureAPI.js";
import { getCredentials } from "../../utils/api/AuthAPI.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Конфигурация
const CONFIG = {
  surveyTitle: `[LOAD TEST] Survey ${new Date().toISOString().slice(0, 10)}`,
  surveyDescription: "Опрос для нагрузочного тестирования. НЕ УДАЛЯТЬ!",
  batchSize: 500,
  maxUsers: 10000,
};

// Простой шаблон опроса с разными типами вопросов
const SURVEY_TEMPLATE = {
  title: CONFIG.surveyTitle,
  description: CONFIG.surveyDescription,
  isAnonymous: true,
  pages: [
    {
      title: "Страница 1",
      questions: [
        {
          type: "single_choice",
          title: "Как вы оцениваете общую атмосферу в компании?",
          isRequired: true,
          options: [
            { title: "Отлично", value: 5 },
            { title: "Хорошо", value: 4 },
            { title: "Удовлетворительно", value: 3 },
            { title: "Плохо", value: 2 },
            { title: "Очень плохо", value: 1 },
          ],
        },
        {
          type: "multiple_choice",
          title: "Какие аспекты работы вам нравятся? (можно выбрать несколько)",
          isRequired: false,
          options: [
            { title: "Коллектив" },
            { title: "Задачи" },
            { title: "Условия труда" },
            { title: "Руководство" },
            { title: "Возможности роста" },
          ],
        },
        {
          type: "scale",
          title: "Оцените уровень вовлечённости от 1 до 10",
          isRequired: true,
          scaleMin: 1,
          scaleMax: 10,
        },
      ],
    },
    {
      title: "Страница 2",
      questions: [
        {
          type: "text",
          title: "Что бы вы хотели улучшить в компании?",
          isRequired: false,
          maxLength: 1000,
        },
        {
          type: "nps",
          title:
            "Насколько вероятно, что вы порекомендуете компанию как работодателя?",
          isRequired: true,
        },
      ],
    },
  ],
};

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const isCleanup = args.includes("--cleanup");

  console.log("=".repeat(60));
  console.log("SEED: Создание большого опроса (Survey)");
  console.log("=".repeat(60));

  if (isDryRun) {
    console.log("🔍 Режим DRY RUN - изменения не будут применены\n");
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const request = context.request;

  try {
    const { email, password } = getCredentials("admin");

    // Инициализация API
    const surveyAPI = new SurveyAPI(request);
    await surveyAPI.signIn(email, password);

    const orgAPI = new OrgStructureAPI(request);
    await orgAPI.signIn(email, password);

    // Cleanup режим
    if (isCleanup) {
      await cleanupLoadTestSurvey(surveyAPI);
      await browser.close();
      return;
    }

    // 1. Проверяем существующий load test Survey
    console.log("\n📋 Проверка существующего load test Survey...");
    const existingSurvey = await findLoadTestSurvey(surveyAPI);

    if (existingSurvey) {
      console.log(
        `   ✅ Найден существующий опрос: "${existingSurvey.title}" (ID: ${existingSurvey.id})`,
      );
      console.log(`   Статус: ${existingSurvey.status}`);

      // Проверяем статистику
      try {
        const stats = await surveyAPI.getStatisticsSummary(
          existingSurvey.id,
          {},
        );
        const responsesCount =
          stats.data?.responsesCount || stats.data?.completedCount || 0;
        console.log(`   Ответов: ${responsesCount}`);

        if (responsesCount >= 100) {
          console.log(`   ✅ Опрос готов для нагрузочных тестов`);
          updateConfigFile(existingSurvey.id);
          await browser.close();
          return;
        }
      } catch {
        console.log(`   ⚠️ Не удалось получить статистику`);
      }

      // Если опрос в черновике - можно добавить участников
      if (existingSurvey.status === "draft") {
        console.log(`   Опрос в черновике, продолжаем настройку...`);
      } else {
        console.log(`   Опрос уже запущен (${existingSurvey.status})`);
        updateConfigFile(existingSurvey.id);
        await browser.close();
        return;
      }
    }

    // 2. Получаем всех пользователей
    console.log("\n👥 Получение списка пользователей...");
    const allUsers = await getAllUsers(orgAPI);
    console.log(`   Найдено пользователей: ${allUsers.length}`);

    if (allUsers.length === 0) {
      console.log("   ❌ Нет пользователей в системе!");
      await browser.close();
      return;
    }

    // 3. Создаём или используем существующий опрос
    let surveyId = existingSurvey?.id;

    if (!surveyId) {
      console.log("\n🔨 Создание нового опроса...");

      if (isDryRun) {
        console.log(
          `   [DRY RUN] Был бы создан опрос: "${CONFIG.surveyTitle}"`,
        );
        surveyId = "dry-run-id";
      } else {
        // Создаём черновик
        const { response: createResp, data: createData } =
          await surveyAPI.createDraft({});

        if (!createResp.ok()) {
          console.log(`   ❌ Ошибка создания опроса: ${createResp.status()}`);
          await browser.close();
          return;
        }

        surveyId = createData.id;
        console.log(`   ✅ Черновик создан (ID: ${surveyId})`);

        // Обновляем опрос с нашим шаблоном
        console.log("   Настройка структуры опроса...");
        const { response: updateResp } = await surveyAPI.update(
          surveyId,
          SURVEY_TEMPLATE,
        );

        if (!updateResp.ok()) {
          console.log(
            `   ⚠️ Не удалось применить шаблон: ${updateResp.status()}`,
          );
          // Продолжаем с дефолтным опросом
        } else {
          console.log(`   ✅ Структура опроса настроена`);
        }
      }
    }

    // 4. Настраиваем участников и запускаем
    if (!isDryRun && surveyId !== "dry-run-id") {
      // Получаем опрос для проверки статуса
      const { data: surveyData } = await surveyAPI.getById(surveyId);

      if (surveyData?.status === "draft") {
        console.log("\n🚀 Запуск опроса...");

        // Настраиваем фильтры участников (все пользователи)
        const participantsPayload = {
          ...surveyData,
          participantsFilter: {
            type: "all", // Все пользователи компании
          },
        };

        const { response: filterResp } = await surveyAPI.update(
          surveyId,
          participantsPayload,
        );
        if (filterResp.ok()) {
          console.log(`   ✅ Участники: все пользователи компании`);
        }

        // Запускаем опрос
        const { response: startResp } = await surveyAPI.start(surveyId);

        if (startResp.ok()) {
          console.log(`   ✅ Опрос запущен!`);
        } else {
          const status = startResp.status();
          if (status === 400) {
            console.log(
              `   ⚠️ Не удалось запустить (возможно, нужна валидация)`,
            );
          } else {
            console.log(`   ⚠️ Ошибка запуска: ${status}`);
          }
        }
      }

      // Обновляем конфигурацию
      updateConfigFile(surveyId);
      console.log(`   📝 ID сохранён в seed-config.js`);
    }

    // 5. Инструкции по генерации ответов
    console.log("\n" + "=".repeat(60));
    console.log("📋 СЛЕДУЮЩИЕ ШАГИ ДЛЯ ГЕНЕРАЦИИ ОТВЕТОВ:");
    console.log("=".repeat(60));
    console.log(`
Для полноценного нагрузочного теста статистики нужны ответы.
Варианты генерации ответов:

1. ЧЕРЕЗ UI (ручной/полуавтоматический):
   - Открыть опрос под разными пользователями
   - Заполнить ответы
   - Можно автоматизировать через UI тест

2. ЧЕРЕЗ API (если доступно):
   - Использовать /private/surveys/{id}/{alias}/answer/
   - Требуется авторизация под каждым пользователем

3. ИСПОЛЬЗОВАТЬ СУЩЕСТВУЮЩИЙ ОПРОС:
   - Найти в системе опрос с большим количеством ответов
   - Обновить largeSurveyId в seed-config.js

Текущий опрос ID: ${surveyId}
`);

    console.log("=".repeat(60));
    console.log("✅ SEED завершён!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Ошибка:", error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

/**
 * Поиск существующего load test Survey
 */
async function findLoadTestSurvey(surveyAPI) {
  const { response, data } = await surveyAPI.getList({ limit: 50 });

  if (!response.ok()) return null;

  const items = data?.items || data || [];
  return items.find(
    (s) =>
      s.title?.includes("[LOAD TEST]") ||
      s.description?.includes("нагрузочного тестирования"),
  );
}

/**
 * Получение всех пользователей
 */
async function getAllUsers(orgAPI, maxUsers = 10000) {
  const allUsers = [];
  let offset = 0;
  const limit = 500;

  while (allUsers.length < maxUsers) {
    const { response, data } = await orgAPI.findUsers({ limit, offset });

    if (!response.ok()) break;

    const items = data?.items || data || [];
    if (items.length === 0) break;

    allUsers.push(...items);
    offset += limit;

    if (items.length < limit) break;
  }

  return allUsers.slice(0, maxUsers);
}

/**
 * Обновление конфигурационного файла
 */
function updateConfigFile(surveyId) {
  const configPath = path.join(__dirname, "seed-config.js");

  try {
    let content = fs.readFileSync(configPath, "utf-8");

    // Обновляем largeSurveyId
    content = content.replace(
      /largeSurveyId:\s*process\.env\.LOAD_TEST_LARGE_SURVEY_ID\s*\|\|\s*null/,
      `largeSurveyId: process.env.LOAD_TEST_LARGE_SURVEY_ID || ${surveyId}`,
    );

    fs.writeFileSync(configPath, content);
  } catch (error) {
    console.log(`   ⚠️ Не удалось обновить конфиг: ${error.message}`);
    console.log(`   Добавьте вручную: largeSurveyId: ${surveyId}`);
  }
}

/**
 * Удаление load test Survey
 */
async function cleanupLoadTestSurvey(surveyAPI) {
  console.log("\n🗑️ Cleanup: поиск load test Survey...");

  const existingSurvey = await findLoadTestSurvey(surveyAPI);

  if (!existingSurvey) {
    console.log("   Нет load test Survey для удаления");
    return;
  }

  console.log(
    `   Найден опрос: "${existingSurvey.title}" (ID: ${existingSurvey.id})`,
  );

  // Сначала останавливаем если активен
  if (existingSurvey.status === "active") {
    const { response: stopResp } = await surveyAPI.stop(existingSurvey.id);
    if (stopResp.ok()) {
      console.log("   ✅ Опрос остановлен");
    }
  }

  const { response } = await surveyAPI.remove(existingSurvey.id);

  if (response.ok()) {
    console.log("   ✅ Опрос удалён");
  } else {
    console.log(`   ❌ Ошибка удаления: ${response.status()}`);
  }
}

main().catch(console.error);
