#!/usr/bin/env node
// tests/load/seed/seed-large-pr-with-answers.js
// Скрипт для создания Performance Review с заполненными анкетами
// Для нагрузочного тестирования экспорта и дашборда
//
// Использование:
//   node tests/load/seed/seed-large-pr-with-answers.js             # Создать и заполнить
//   node tests/load/seed/seed-large-pr-with-answers.js --dry-run   # Только показать план
//   node tests/load/seed/seed-large-pr-with-answers.js --cleanup   # Удалить load test PR
//   node tests/load/seed/seed-large-pr-with-answers.js --continue  # Продолжить заполнение

import "dotenv/config";
import { chromium } from "@playwright/test";
import { PerformanceReviewAPI } from "../../utils/api/PerformanceReviewAPI.js";
import { OrgStructureAPI } from "../../utils/api/OrgStructureAPI.js";
import { AssessmentsAPI } from "../../utils/api/AssessmentsAPI.js";
import { getCredentials } from "../../utils/api/AuthAPI.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PR_TITLE_PREFIX = "[LOAD TEST WITH ANSWERS]";

const CONFIG = {
  prTitle: `${PR_TITLE_PREFIX} PR ${new Date().toISOString().slice(0, 10)}`,
  prDescription:
    "Performance Review с заполненными анкетами для нагрузочного тестирования экспорта. НЕ УДАЛЯТЬ!",
  maxUsers: 1000,
  batchSize: 200,
  // populateReview: задержка между вызовами (ms) — как в CalibrationSeed
  populateDelay: 100,
  // populateReview: максимум итераций (1000 users × 4 directions = ~4000 анкет + запас)
  maxPopulateAttempts: 5000,
  // populateReview: таймаут одного вызова
  populateTimeout: 180000,
  // Логировать прогресс каждые N заполненных анкет
  progressLogInterval: 50,
  // Максимум таймаутов подряд до остановки
  maxConsecutiveTimeouts: 3,
};

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const isCleanup = args.includes("--cleanup");
  const isContinue = args.includes("--continue");

  console.log("=".repeat(60));
  console.log("SEED: Performance Review с заполненными анкетами");
  console.log("=".repeat(60));

  if (isDryRun) {
    console.log("  Режим DRY RUN — изменения не будут применены\n");
  }

  // --continue: полностью через native fetch (обходит Playwright timeout проблемы)
  if (isContinue) {
    await continueViaFetch();
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const request = context.request;

  try {
    const { email, password } = getCredentials("admin");

    const prAPI = new PerformanceReviewAPI(request);
    await prAPI.signIn(email, password);

    const orgAPI = new OrgStructureAPI(request);
    await orgAPI.signIn(email, password);

    const assessmentsAPI = new AssessmentsAPI(request);
    await assessmentsAPI.signIn(email, password);

    // === Cleanup ===
    if (isCleanup) {
      await cleanupLoadTestPR(prAPI);
      await browser.close();
      return;
    }

    // === Поиск существующего PR ===
    console.log("\n1. Поиск существующего load test PR...");
    const existingPR = await findLoadTestPR(prAPI);

    if (existingPR) {
      console.log(`   Найден: "${existingPR.title}" (ID: ${existingPR.id})`);

      const countsResult = await prAPI.getUsersCounts(existingPR.id);
      const targetUsersCount = countsResult.data?.targetUsersCount || 0;
      const receiversCount = countsResult.data?.receiversCount || 0;
      console.log(
        `   Оцениваемых: ${targetUsersCount}, Респондентов: ${receiversCount}`,
      );

      // Проверяем есть ли уже ревизия (PR остановлен)
      const { data: revisionsData } = await prAPI.getRevisions(existingPR.id, {
        limit: 1,
      });
      const revisions = revisionsData?.items || revisionsData || [];

      if (revisions.length > 0) {
        const revisionId = revisions[0].id;
        console.log(`   PR уже остановлен, ревизия: ${revisionId}`);
        updateConfigFile(existingPR.id, revisionId);
        console.log("   ID сохранены в seed-config.js");
        await browser.close();
        return;
      }

      // PR существует, но не остановлен и без --continue
      if (targetUsersCount >= 100) {
        console.log(
          "   PR с участниками уже существует. Запускаем заполнение...",
        );
        await fillAndStop(prAPI, existingPR.id, isDryRun);
        await browser.close();
        return;
      }
    }

    // === Получение пользователей ===
    console.log("\n2. Получение списка пользователей...");
    const allUsers = await getAllUsers(orgAPI);
    console.log(`   Найдено: ${allUsers.length}`);

    if (allUsers.length === 0) {
      console.log("   Нет пользователей в системе!");
      await browser.close();
      return;
    }

    // === Получение анкет ===
    console.log("\n3. Получение доступных анкет...");
    const assessments = await getAvailableAssessments(assessmentsAPI);
    console.log(`   Найдено анкет: ${assessments.length}`);

    if (assessments.length === 0) {
      console.log("   Нет опубликованных анкет! Невозможно создать PR.");
      await browser.close();
      return;
    }

    if (isDryRun) {
      console.log("\n[DRY RUN] План:");
      console.log(
        `   - Создать PR: "${CONFIG.prTitle}" (${Math.min(allUsers.length, CONFIG.maxUsers)} оцениваемых)`,
      );
      console.log(`   - Направления: self, head, subordinate, colleague`);
      console.log(`   - Анкета: ${assessments[0].title || assessments[0].id}`);
      const estimatedQuestionnaires =
        Math.min(allUsers.length, CONFIG.maxUsers) * 4;
      console.log(`   - ~${estimatedQuestionnaires} анкет для заполнения`);
      console.log(
        `   - Оценка времени: ${Math.round((estimatedQuestionnaires * 2) / 60)} мин`,
      );
      await browser.close();
      return;
    }

    // === Создание PR ===
    console.log("\n4. Создание Performance Review...");
    const prId = await createPR(prAPI, assessments[0].id);

    if (!prId) {
      await browser.close();
      return;
    }

    // === Добавление участников ===
    console.log("\n5. Добавление оцениваемых...");
    const usersToAdd = allUsers.slice(0, CONFIG.maxUsers);
    await addTargetUsersBatched(prAPI, prId, usersToAdd);

    // === Заполнение и остановка ===
    await fillAndStop(prAPI, prId, false);

    console.log("\n" + "=".repeat(60));
    console.log("SEED завершён успешно!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\nОшибка:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
}

/**
 * Заполнить анкеты и остановить PR
 */
async function fillAndStop(prAPI, prId, isDryRun) {
  if (isDryRun) return;

  // Проверяем текущий статус — нужно ли запускать
  const { data: prData } = await prAPI.getById(prId);
  const status = prData?.status || prData?.state;
  console.log(`   Статус PR: ${status}`);

  if (status === "draft" || status === "stopped") {
    if (status === "stopped") {
      console.log("   PR остановлен — перезапускаем для заполнения...");
    }

    // Валидация
    console.log("\n6. Валидация PR...");
    const { response: validateResp } = await prAPI.validate(prId);
    if (!validateResp.ok()) {
      const body = await validateResp.text().catch(() => "");
      console.log(
        `   Валидация: ${validateResp.status()} — ${body.substring(0, 300)}`,
      );
      // Продолжаем — validate может быть не обязательным
    } else {
      console.log("   Валидация пройдена");
    }

    // Запуск
    console.log("\n7. Запуск PR...");
    const { response: startResp } = await prAPI.start(prId);
    if (!startResp.ok()) {
      const body = await startResp.text().catch(() => "");
      console.log(
        `   Ошибка запуска: ${startResp.status()} — ${body.substring(0, 300)}`,
      );
      return;
    }
    console.log("   PR запущен");
  } else if (status === "active" || status === "started") {
    console.log("   PR уже активен, переходим к заполнению");
  } else {
    console.log(`   Неожиданный статус: ${status}`);
  }

  // Заполнение анкет
  console.log("\n8. Заполнение анкет через populateReview...");
  const filledCount = await fillQuestionnaires(prAPI, prId);
  console.log(`   Итого заполнено: ${filledCount} анкет`);

  // Остановка PR
  console.log("\n9. Остановка PR (создание ревизии)...");
  const { response: stopResp } = await prAPI.stop(prId);
  if (!stopResp.ok()) {
    const body = await stopResp.text().catch(() => "");
    console.log(
      `   Ошибка остановки: ${stopResp.status()} — ${body.substring(0, 300)}`,
    );
    // Возможно PR уже остановлен — проверяем ревизии
  } else {
    console.log("   PR остановлен");
  }

  // Получение ревизии
  console.log("\n10. Получение ID ревизии...");
  const { data: revisionsData } = await prAPI.getRevisions(prId, { limit: 1 });
  const revisions = revisionsData?.items || revisionsData || [];

  if (revisions.length === 0) {
    console.log("   Ревизия не найдена!");
    return;
  }

  const revisionId = revisions[0].id;
  console.log(`   Ревизия: ${revisionId}`);

  // Сохранение в конфиг
  updateConfigFile(prId, revisionId);
  console.log("   ID сохранены в seed-config.js");

  // Финальная проверка
  const countsResult = await prAPI.getUsersCounts(prId);
  console.log(
    `   Итог: оцениваемых=${countsResult.data?.targetUsersCount || 0}, респондентов=${countsResult.data?.receiversCount || 0}`,
  );
}

/**
 * Создать PR с 4 направлениями и анкетами
 */
async function createPR(prAPI, assessmentId) {
  // ВАЖНО: все 4 направления обязательны (иначе дашборд Моя команда падает с 500)
  const directions = [
    {
      id: null,
      receiverType: "self",
      isSelected: true,
      title: null,
      description: null,
    },
    {
      id: null,
      receiverType: "head",
      isSelected: true,
      title: null,
      description: null,
    },
    {
      id: null,
      receiverType: "subordinate",
      isSelected: true,
      title: null,
      description: null,
    },
    {
      id: null,
      receiverType: "colleague",
      isSelected: true,
      title: null,
      description: null,
    },
  ];

  const { response: createResp, data: createData } = await prAPI.create({
    title: CONFIG.prTitle,
    description: CONFIG.prDescription,
    directions,
    anonymityType: "notAnonymous",
    workflowType: "basic",
    notificationsSchedule: {
      enableReminds: false,
      baseDate: new Date().toISOString(),
      repeatType: "everyWorkDay",
      timezoneOffset: new Date().getTimezoneOffset(),
    },
    isApprovalStep: false,
    isAsyncSteps: false,
    isAsyncStepsSelfResponseStep: false,
    minReceiversCount: 1,
    maxReceiversCount: 10,
  });

  if (!createResp.ok()) {
    const error = await createResp.text().catch(() => "");
    console.log(
      `   Ошибка создания PR: ${createResp.status()} — ${error.substring(0, 300)}`,
    );
    return null;
  }

  const prId = createData.id;
  console.log(`   PR создан (ID: ${prId})`);

  // Получаем PR для ID направлений
  const { data: prDetails } = await prAPI.getById(prId);
  const prDirections = prDetails?.directions || [];
  console.log(`   Направлений: ${prDirections.length}`);

  // Привязываем анкету к каждому selected направлению
  for (const dir of prDirections) {
    if (dir.isSelected && dir.id) {
      const { response: assessResp } = await prAPI.setAssessments(prId, {
        directionId: dir.id,
        assessmentsIds: [assessmentId],
      });

      if (assessResp.ok()) {
        console.log(`   Анкета привязана к "${dir.receiverType}"`);
      } else {
        console.log(
          `   Ошибка привязки анкеты к "${dir.receiverType}": ${assessResp.status()}`,
        );
      }
    }
  }

  return prId;
}

/**
 * Добавить пользователей батчами
 */
async function addTargetUsersBatched(prAPI, prId, users) {
  let addedCount = 0;
  const batches = Math.ceil(users.length / CONFIG.batchSize);

  for (let i = 0; i < batches; i++) {
    const start = i * CONFIG.batchSize;
    const end = Math.min(start + CONFIG.batchSize, users.length);
    const batch = users.slice(start, end);

    const targets = batch.map((u) => ({
      targetType: "user",
      entityId: u.id,
    }));

    process.stdout.write(
      `   Batch ${i + 1}/${batches} (${batch.length} чел)... `,
    );

    const { response: addResp } = await prAPI.addTargetUsers(prId, {
      targets,
    });

    if (addResp.ok()) {
      addedCount += batch.length;
      console.log("ok");
    } else {
      const status = addResp.status();
      if (status === 409) {
        console.log("(уже добавлены)");
        addedCount += batch.length;
      } else {
        console.log(`ошибка (${status})`);
      }
    }

    if (i < batches - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`   Итого добавлено: ${addedCount}`);
}

/**
 * Заполнить анкеты через populateReview API (native fetch — без таймаутов Playwright)
 * Каждый вызов заполняет 1 анкету. HTTP 500 = все заполнены.
 */
async function fillQuestionnaires(prAPI, prId) {
  const settings = {
    skipChance: 0,
    commentChance: 0,
    customChance: 0,
    lowerLimit: 60,
    upperLimit: 100,
  };

  // Получаем token из prAPI для native fetch
  const baseUrl = process.env.API_BASE_URL || "https://api.st1.apprs.ru";
  const token = prAPI._token || prAPI.token;
  if (!token) {
    console.log(
      "   Не удалось получить token из prAPI, пробуем signIn через fetch...",
    );
  }

  const authToken = token || (await signInViaFetch(baseUrl));
  if (!authToken) {
    console.log("   Не удалось получить auth token!");
    return 0;
  }

  const url = `${baseUrl}/manager/performance-reviews/${prId}/populate-review`;

  let filledCount = 0;
  let consecutiveErrors = 0;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= CONFIG.maxPopulateAttempts; attempt++) {
    try {
      const callStart = Date.now();
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(settings),
      });
      const callTime = Math.round((Date.now() - callStart) / 1000);

      if (response.ok) {
        filledCount++;
        consecutiveErrors = 0;

        if (filledCount % CONFIG.progressLogInterval === 0) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          const ratePerMin =
            elapsed > 0 ? Math.round((filledCount / elapsed) * 60) : 0;
          console.log(
            `   Заполнено: ${filledCount} (${elapsed}с, ~${ratePerMin}/мин, последний вызов ${callTime}с)`,
          );
        }

        await new Promise((r) => setTimeout(r, CONFIG.populateDelay));
      } else if (response.status === 500) {
        if (filledCount === 0) {
          consecutiveErrors++;
          if (consecutiveErrors >= 3) {
            console.log(
              "   3 ошибки подряд без единого заполнения — возможно, анкеты не настроены",
            );
            break;
          }
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        // Все анкеты заполнены
        console.log(
          `   Все анкеты заполнены (HTTP 500 после ${filledCount} шт)`,
        );
        break;
      } else {
        consecutiveErrors++;
        console.log(
          `   Ошибка ${response.status} на попытке ${attempt} (${callTime}с)`,
        );
        if (consecutiveErrors >= CONFIG.maxConsecutiveTimeouts) {
          console.log(
            `   ${CONFIG.maxConsecutiveTimeouts} ошибок подряд — прерываем`,
          );
          break;
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    } catch (error) {
      consecutiveErrors++;
      console.log(
        `   Исключение на попытке ${attempt}: ${error.message.substring(0, 100)}`,
      );
      if (consecutiveErrors >= CONFIG.maxConsecutiveTimeouts) {
        console.log(
          `   ${CONFIG.maxConsecutiveTimeouts} ошибок подряд — прерываем`,
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  const totalMin = (totalTime / 60).toFixed(1);
  console.log(`   Время заполнения: ${totalTime}с (${totalMin} мин)`);
  return filledCount;
}

/**
 * SignIn через native fetch (fallback если token не доступен из prAPI)
 */
async function signInViaFetch(baseUrl) {
  const { email, password } = getCredentials("admin");
  const { createHash } = await import("crypto");
  const fingerPrint = createHash("md5")
    .update(Date.now().toString())
    .digest("hex");
  const resp = await fetch(`${baseUrl}/auth/account/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, fingerPrint, permissions: [] }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.accessToken;
}

/**
 * --continue через native fetch (без Playwright)
 * Находит PR, заполняет анкеты, останавливает, сохраняет конфиг
 */
async function continueViaFetch() {
  const baseUrl = process.env.API_BASE_URL || "https://api.st1.apprs.ru";
  console.log("\n[native fetch] SignIn...");
  const token = await signInViaFetch(baseUrl);
  if (!token) {
    console.log("   Не удалось авторизоваться!");
    return;
  }
  console.log("   OK");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // Поиск существующего PR
  console.log("\n1. Поиск load test PR...");
  const listResp = await fetch(
    `${baseUrl}/manager/performance-reviews?limit=50`,
    { headers },
  );
  const listData = await listResp.json();
  const items = listData?.items || listData || [];
  const existingPR = items.find(
    (pr) =>
      pr.title?.includes(PR_TITLE_PREFIX) ||
      pr.description?.includes(
        "заполненными анкетами для нагрузочного тестирования",
      ),
  );

  if (!existingPR) {
    console.log("   Не найден. Запустите без --continue.");
    return;
  }

  const prId = existingPR.id;
  console.log(`   Найден: "${existingPR.title}" (ID: ${prId})`);
  console.log(`   Статус: ${existingPR.status}`);

  // Если stopped — перезапускаем
  if (existingPR.status === "stopped" || existingPR.status === "draft") {
    console.log("\n   Запуск PR...");
    const startResp = await fetch(
      `${baseUrl}/manager/performance-reviews/${prId}/start`,
      { method: "POST", headers },
    );
    if (startResp.ok) {
      console.log("   PR запущен");
    } else {
      const err = await startResp.text().catch(() => "");
      console.log(
        `   Ошибка запуска: ${startResp.status} — ${err.substring(0, 200)}`,
      );
      return;
    }
  }

  // Заполнение
  console.log("\n2. Заполнение анкет через populateReview...");
  const settings = {
    skipChance: 0,
    commentChance: 0,
    customChance: 0,
    lowerLimit: 60,
    upperLimit: 100,
  };

  let filledCount = 0;
  let consecutiveErrors = 0;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= CONFIG.maxPopulateAttempts; attempt++) {
    try {
      const callStart = Date.now();
      const resp = await fetch(
        `${baseUrl}/manager/performance-reviews/${prId}/populate-review`,
        { method: "POST", headers, body: JSON.stringify(settings) },
      );
      const callTime = Math.round((Date.now() - callStart) / 1000);

      if (resp.ok) {
        filledCount++;
        consecutiveErrors = 0;

        if (filledCount % CONFIG.progressLogInterval === 0) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          const ratePerMin =
            elapsed > 0 ? Math.round((filledCount / elapsed) * 60) : 0;
          console.log(
            `   Заполнено: ${filledCount} (${elapsed}с, ~${ratePerMin}/мин, последний ${callTime}с)`,
          );
        }

        await new Promise((r) => setTimeout(r, CONFIG.populateDelay));
      } else if (resp.status === 500) {
        if (filledCount === 0) {
          consecutiveErrors++;
          if (consecutiveErrors >= 3) {
            console.log(
              "   3 ошибки 500 без заполнений — анкеты не настроены?",
            );
            break;
          }
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        console.log(
          `   Все анкеты заполнены (HTTP 500 после ${filledCount} шт)`,
        );
        break;
      } else {
        consecutiveErrors++;
        console.log(
          `   Ошибка ${resp.status} на попытке ${attempt} (${callTime}с)`,
        );
        if (consecutiveErrors >= CONFIG.maxConsecutiveTimeouts) {
          console.log(
            `   ${CONFIG.maxConsecutiveTimeouts} ошибок подряд — стоп`,
          );
          break;
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    } catch (error) {
      consecutiveErrors++;
      console.log(
        `   Исключение #${attempt}: ${error.message.substring(0, 100)}`,
      );
      if (consecutiveErrors >= CONFIG.maxConsecutiveTimeouts) {
        console.log(`   ${CONFIG.maxConsecutiveTimeouts} ошибок подряд — стоп`);
        break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(
    `   Итого: ${filledCount} анкет за ${totalTime}с (${(totalTime / 60).toFixed(1)} мин)`,
  );

  // Остановка PR
  console.log("\n3. Остановка PR...");
  const stopResp = await fetch(
    `${baseUrl}/manager/performance-reviews/${prId}/stop`,
    { method: "POST", headers },
  );
  if (stopResp.ok) {
    console.log("   PR остановлен");
  } else {
    console.log(`   Остановка: ${stopResp.status}`);
  }

  // Получение ревизии
  console.log("\n4. Получение ревизии...");
  const revResp = await fetch(
    `${baseUrl}/manager/performance-reviews/${prId}/revisions?limit=1`,
    { headers },
  );
  const revData = await revResp.json();
  const revisions = revData?.items || revData || [];
  if (revisions.length > 0) {
    const revisionId = revisions[0].id;
    console.log(`   Ревизия: ${revisionId}`);
    updateConfigFile(prId, revisionId);
    console.log("   ID сохранены в seed-config.js");
  } else {
    console.log("   Ревизия не найдена!");
  }

  console.log("\n" + "=".repeat(60));
  console.log(`SEED --continue завершён: ${filledCount} анкет`);
  console.log("=".repeat(60));
}

/**
 * Поиск существующего load test PR с заполненными анкетами
 */
async function findLoadTestPR(prAPI) {
  const { response, data } = await prAPI.getList({ limit: 50 });

  if (!response.ok()) return null;

  const items = data?.items || data || [];
  return items.find(
    (pr) =>
      pr.title?.includes(PR_TITLE_PREFIX) ||
      pr.description?.includes(
        "заполненными анкетами для нагрузочного тестирования",
      ),
  );
}

/**
 * Получение всех пользователей
 */
async function getAllUsers(orgAPI) {
  const allUsers = [];
  let offset = 0;
  const limit = 500;

  while (allUsers.length < CONFIG.maxUsers) {
    const { response, data } = await orgAPI.findUsers({ limit, offset });

    if (!response.ok()) break;

    const items = data?.items || data || [];
    if (items.length === 0) break;

    allUsers.push(...items);
    offset += limit;

    if (items.length < limit) break;
  }

  return allUsers.slice(0, CONFIG.maxUsers);
}

/**
 * Получение доступных анкет
 */
async function getAvailableAssessments(assessmentsAPI) {
  try {
    const { response, data } = await assessmentsAPI.getAssessments({
      limit: 10,
    });
    if (!response.ok()) return [];
    return data?.items || data || [];
  } catch {
    return [];
  }
}

/**
 * Обновление конфигурационного файла
 */
function updateConfigFile(prId, revisionId) {
  const configPath = path.join(__dirname, "seed-config.js");

  try {
    let content = fs.readFileSync(configPath, "utf-8");

    // Обновляем largePrWithAnswersId
    content = content.replace(
      /largePrWithAnswersId:\s*\n?\s*process\.env\.LOAD_TEST_LARGE_PR_ANSWERS_ID\s*\|\|\s*null/,
      `largePrWithAnswersId:\n    process.env.LOAD_TEST_LARGE_PR_ANSWERS_ID || ${prId}`,
    );

    // Обновляем largePrWithAnswersRevisionId
    content = content.replace(
      /largePrWithAnswersRevisionId:\s*\n?\s*process\.env\.LOAD_TEST_LARGE_PR_ANSWERS_REVISION_ID\s*\|\|\s*null/,
      `largePrWithAnswersRevisionId:\n    process.env.LOAD_TEST_LARGE_PR_ANSWERS_REVISION_ID || ${revisionId}`,
    );

    fs.writeFileSync(configPath, content);
  } catch (error) {
    console.log(`   Не удалось обновить конфиг: ${error.message}`);
    console.log(`   Добавьте вручную:`);
    console.log(`     largePrWithAnswersId: ${prId}`);
    console.log(`     largePrWithAnswersRevisionId: ${revisionId}`);
  }
}

/**
 * Удаление load test PR
 */
async function cleanupLoadTestPR(prAPI) {
  console.log("\nCleanup: поиск load test PR с ответами...");

  const existingPR = await findLoadTestPR(prAPI);

  if (!existingPR) {
    console.log("   Нет load test PR для удаления");
    return;
  }

  console.log(`   Найден: "${existingPR.title}" (ID: ${existingPR.id})`);

  // Сначала архивируем (для complete/active PR)
  const { response: archiveResp } = await prAPI.archive(existingPR.id);
  if (archiveResp.ok()) {
    console.log("   PR заархивирован");
  } else {
    console.log(
      `   Архивация: ${archiveResp.status()} (возможно уже в архиве)`,
    );
  }

  const { response } = await prAPI.remove(existingPR.id);

  if (response.ok()) {
    console.log("   PR удалён");
    // Обнуляем конфиг
    updateConfigFile("null", "null");
  } else {
    console.log(
      `   Ошибка удаления: ${response.status()} (PR заархивирован, не найдётся при поиске)`,
    );
    updateConfigFile("null", "null");
  }
}

main().catch(console.error);
