#!/usr/bin/env node
// tests/load/seed/seed-large-pr.js
// Скрипт для создания Performance Review с максимальным количеством участников
// Использует всех существующих пользователей в системе

import { chromium } from "@playwright/test";
import { PerformanceReviewAPI } from "../../utils/api/PerformanceReviewAPI.js";
import { OrgStructureAPI } from "../../utils/api/OrgStructureAPI.js";
import { AssessmentsAPI } from "../../utils/api/AssessmentsAPI.js";
import { getCredentials } from "../../utils/api/AuthAPI.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Конфигурация
const CONFIG = {
  prTitle: `[LOAD TEST] PR ${new Date().toISOString().slice(0, 10)}`,
  prDescription:
    "Performance Review для нагрузочного тестирования. НЕ УДАЛЯТЬ!",
  batchSize: 500, // Добавляем пользователей батчами
  maxUsers: 10000, // Максимальное количество участников
};

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const isCleanup = args.includes("--cleanup");

  console.log("=".repeat(60));
  console.log("SEED: Создание большого Performance Review");
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
    const prAPI = new PerformanceReviewAPI(request);
    await prAPI.signIn(email, password);

    const orgAPI = new OrgStructureAPI(request);
    await orgAPI.signIn(email, password);

    const assessmentsAPI = new AssessmentsAPI(request);
    await assessmentsAPI.signIn(email, password);

    // Cleanup режим
    if (isCleanup) {
      await cleanupLoadTestPR(prAPI);
      await browser.close();
      return;
    }

    // 1. Проверяем существующий load test PR
    console.log("\n📋 Проверка существующего load test PR...");
    const existingPR = await findLoadTestPR(prAPI);

    if (existingPR) {
      console.log(
        `   ✅ Найден существующий PR: "${existingPR.title}" (ID: ${existingPR.id})`,
      );

      // Получаем количество участников
      const countsResult = await prAPI.getUsersCounts(existingPR.id);
      const targetUsersCount = countsResult.data?.targetUsersCount || 0;
      console.log(`   Участников: ${targetUsersCount}`);

      if (targetUsersCount >= 1000) {
        console.log(`   ✅ PR готов для нагрузочных тестов`);
        updateConfigFile(existingPR.id);
        await browser.close();
        return;
      }

      console.log(`   ⚠️ Недостаточно участников, добавляем...`);
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

    // 3. Получаем доступные анкеты
    console.log("\n📝 Получение доступных анкет...");
    const assessments = await getAvailableAssessments(assessmentsAPI);
    console.log(`   Найдено анкет: ${assessments.length}`);

    if (assessments.length === 0) {
      console.log("   ⚠️ Нет анкет, PR будет без направлений оценки");
    }

    // 4. Создаём или обновляем PR
    let prId = existingPR?.id;

    if (!prId) {
      console.log("\n🔨 Создание нового Performance Review...");

      if (isDryRun) {
        console.log(`   [DRY RUN] Был бы создан PR: "${CONFIG.prTitle}"`);
        prId = "dry-run-id";
      } else {
        const prPayload = {
          title: CONFIG.prTitle,
          description: CONFIG.prDescription,
          // Базовые настройки
          isNominationEnabled: false,
          isApprovalEnabled: false,
          isSelfAssessmentEnabled: true,
          isAsync: false,
        };

        const { response: createResp, data: createData } =
          await prAPI.create(prPayload);

        if (!createResp.ok()) {
          console.log(`   ❌ Ошибка создания PR: ${createResp.status()}`);
          const errorText = await createResp.text();
          console.log(`   ${errorText}`);
          await browser.close();
          return;
        }

        prId = createData.id;
        console.log(`   ✅ PR создан (ID: ${prId})`);
      }
    }

    // 5. Добавляем анкеты (если есть)
    if (assessments.length > 0 && !isDryRun && prId !== "dry-run-id") {
      console.log("\n📋 Добавление анкет...");
      const assessmentPayload = {
        self: assessments.slice(0, 1).map((a) => a.id),
        manager: assessments.slice(0, 1).map((a) => a.id),
        colleagues: [],
      };

      const { response: assessResp } = await prAPI.setAssessments(
        prId,
        assessmentPayload,
      );
      if (assessResp.ok()) {
        console.log(`   ✅ Анкеты добавлены`);
      } else {
        console.log(`   ⚠️ Не удалось добавить анкеты: ${assessResp.status()}`);
      }
    }

    // 6. Добавляем пользователей батчами
    const usersToAdd = allUsers.slice(0, CONFIG.maxUsers);
    console.log(`\n👥 Добавление ${usersToAdd.length} участников...`);

    if (isDryRun) {
      console.log(
        `   [DRY RUN] Было бы добавлено ${usersToAdd.length} участников`,
      );
    } else {
      let addedCount = 0;
      const batches = Math.ceil(usersToAdd.length / CONFIG.batchSize);

      for (let i = 0; i < batches; i++) {
        const start = i * CONFIG.batchSize;
        const end = Math.min(start + CONFIG.batchSize, usersToAdd.length);
        const batch = usersToAdd.slice(start, end);
        const userIds = batch.map((u) => u.id);

        process.stdout.write(
          `   Batch ${i + 1}/${batches} (${batch.length} пользователей)... `,
        );

        const { response: addResp } = await prAPI.addTargetUsers(prId, {
          usersIds: userIds,
        });

        if (addResp.ok()) {
          addedCount += batch.length;
          console.log("✅");
        } else {
          const status = addResp.status();
          if (status === 409) {
            console.log("⚠️ (уже добавлены)");
            addedCount += batch.length;
          } else {
            console.log(`❌ (${status})`);
          }
        }

        // Небольшая задержка между батчами
        if (i < batches - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      console.log(`   Итого добавлено: ${addedCount}`);
    }

    // 7. Финальная проверка
    if (!isDryRun && prId !== "dry-run-id") {
      console.log("\n✅ Проверка результата...");
      const finalCounts = await prAPI.getUsersCounts(prId);
      const finalCount = finalCounts.data?.targetUsersCount || 0;
      console.log(`   Участников в PR: ${finalCount}`);

      // Обновляем конфигурацию
      updateConfigFile(prId);
      console.log(`   📝 ID сохранён в seed-config.js`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ SEED завершён успешно!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Ошибка:", error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

/**
 * Поиск существующего load test PR
 */
async function findLoadTestPR(prAPI) {
  const { response, data } = await prAPI.getList({ limit: 50 });

  if (!response.ok()) return null;

  const items = data?.items || data || [];
  return items.find(
    (pr) =>
      pr.title?.includes("[LOAD TEST]") ||
      pr.description?.includes("нагрузочного тестирования"),
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

    // Проверяем есть ли ещё
    if (items.length < limit) break;
  }

  return allUsers.slice(0, maxUsers);
}

/**
 * Получение доступных анкет
 */
async function getAvailableAssessments(assessmentsAPI) {
  try {
    const { response, data } = await assessmentsAPI.getList({ limit: 10 });
    if (!response.ok()) return [];
    return data?.items || data || [];
  } catch {
    return [];
  }
}

/**
 * Обновление конфигурационного файла
 */
function updateConfigFile(prId) {
  const configPath = path.join(__dirname, "seed-config.js");

  try {
    let content = fs.readFileSync(configPath, "utf-8");

    // Обновляем largePrId
    content = content.replace(
      /largePrId:\s*process\.env\.LOAD_TEST_LARGE_PR_ID\s*\|\|\s*null/,
      `largePrId: process.env.LOAD_TEST_LARGE_PR_ID || ${prId}`,
    );

    fs.writeFileSync(configPath, content);
  } catch (error) {
    console.log(`   ⚠️ Не удалось обновить конфиг: ${error.message}`);
    console.log(`   Добавьте вручную: largePrId: ${prId}`);
  }
}

/**
 * Удаление load test PR
 */
async function cleanupLoadTestPR(prAPI) {
  console.log("\n🗑️ Cleanup: поиск load test PR...");

  const existingPR = await findLoadTestPR(prAPI);

  if (!existingPR) {
    console.log("   Нет load test PR для удаления");
    return;
  }

  console.log(`   Найден PR: "${existingPR.title}" (ID: ${existingPR.id})`);

  const { response } = await prAPI.remove(existingPR.id);

  if (response.ok()) {
    console.log("   ✅ PR удалён");
  } else {
    console.log(`   ❌ Ошибка удаления: ${response.status()}`);
  }
}

main().catch(console.error);
