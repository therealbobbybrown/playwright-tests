#!/usr/bin/env node
/**
 * Скрипт для очистки тестовых данных Performance Review, Surveys и Assessments
 *
 * Использование:
 *   node scripts/cleanup-test-data.js              - очистить все тестовые данные
 *   node scripts/cleanup-test-data.js --pr         - только Performance Reviews
 *   node scripts/cleanup-test-data.js --survey     - только Surveys
 *   node scripts/cleanup-test-data.js --assessment - только Assessments (анкеты)
 */

import "dotenv/config";
import { request } from "@playwright/test";
import { createHash } from "crypto";

const args = process.argv.slice(2);

function generateFingerPrint() {
  const timestamp = Date.now().toString();
  return createHash("md5").update(timestamp).digest("hex");
}
const cleanPR = args.length === 0 || args.includes("--pr");
const cleanSurvey = args.length === 0 || args.includes("--survey");
const cleanAssessment = args.length === 0 || args.includes("--assessment");

// Паттерны для поиска тестовых данных (PR и Surveys)
const TEST_PATTERNS = [
  /тест/i,
  /test/i,
  /новый опрос/i,
  /smoke/i,
  /e2e/i,
  /^Performance Review$/, // дефолтное название PR
  /^Опрос 360°$/, // дефолтное название 360
  /^Онбординг$/, // дефолтное название онбординга
  /PR_\d+_\w+/, // API тесты: Active PR_1768572316685_x4yvys (в любом месте)
  /E2E_/, // TestDataHelper: E2E_API Test PR_... (в любом месте)
  /^Draft PR/, // Seed: Draft PR_...
  /^Active PR/, // Seed: Active PR_...
  /^Stopped PR/, // Seed: Stopped PR_...
  /^Пустой опрос \d+$/, // API тесты: Пустой опрос 3215
  /^По шаблону \d+$/, // API тесты: По шаблону 5674
  /опрос без участников/i, // Неанонимный/Анонимный опрос без участников
  /^Опрос для валидации/, // API тесты: Опрос для валидации 490
  /^Опрос на удаление/, // API тесты: Опрос на удаление 2627
  /Survey_\d+_\w+/, // Seed: Stopped Survey_1768573412902_b..., External Survey_...
  /^Admin_/, // E2E: Admin_ApproveColleagues_, Admin_RequestColleagues_
  /^ManualCheck\s/, // E2E: ManualCheck Normal, ManualCheck Async, ManualCheck Sync
  /^Кейс \d/, // E2E: Кейс 1 алерт пакетной..., Кейс 3 баннер..., Кейс 5/6/8
  /^PR-\d+\s/, // E2E: PR-300 Все направления экспорт
  /^StatSettings/, // E2E: StatSettings ...
  /^Readonly Test/, // E2E: Readonly Test 1772549648375
  /^Calibration_Test_PR_/, // E2E: Calibration_Test_PR_...
  /^Баг с редактированием$/, // E2E: ручной тест
  /^синхронная \d+ направлени/, // E2E: синхронная 4 направления
  /^Regression\s*-?\s/i, // E2E: Regression - ...
  /^Settings Test/, // E2E: Settings Test - Show Only Custom
  /^EDGE-Test/, // E2E: EDGE-Test 1772534591447
  /^Dashboard_Status_Test/, // E2E: Dashboard_Status_Test_...
  /^Custom_All_Directions/, // E2E: Custom_All_Directions_...
];

// Строгие паттерны ТОЛЬКО для Assessments (анкет) - не используют общие паттерны!
const ASSESSMENT_PATTERNS = [
  /<script>/i, // XSS payload: <script>alert("XSS")</script>
  /<img[^>]+onerror/i, // XSS payload: <img src=x onerror=alert(1)>
  /javascript:/i, // XSS payload: javascript:...
  /^Updated Title \d{13}$/, // API тесты: Updated Title 1737375234567 (строго с таймстампом)
];

// Для опросов: удалять также пустые/null названия
const SURVEY_EMPTY_TITLE = true;

function inferApiBase(baseUrl) {
  if (!baseUrl)
    throw new Error("BASE_URL or API_BASE_URL env variable is required");
  try {
    const url = new URL(baseUrl);
    if (url.host.startsWith("client.")) {
      return `${url.protocol}//api.${url.host.slice("client.".length)}`;
    }
    return url.origin;
  } catch {
    throw new Error("Invalid BASE_URL — cannot infer API base");
  }
}

const baseURL = process.env.API_BASE_URL || inferApiBase(process.env.BASE_URL);
const adminEmail = process.env.ADMIN_LOGIN;
const adminPassword = process.env.ADMIN_PASSWORD;

console.log("============================================================");
console.log("Cleanup Test Data Script");
console.log("============================================================");
console.log("API URL:", baseURL);
console.log("Clean PR:", cleanPR);
console.log("Clean Surveys:", cleanSurvey);
console.log("Clean Assessments:", cleanAssessment);
console.log("");

async function authenticate(context) {
  console.log("Авторизация...");

  const fingerPrint = generateFingerPrint();

  const authRes = await context.post("/auth/account/signin", {
    data: {
      email: adminEmail,
      password: adminPassword,
      fingerPrint,
      permissions: [],
    },
  });

  if (!authRes.ok()) {
    const text = await authRes.text().catch(() => "");
    throw new Error(`Auth failed: ${authRes.status()} ${text}`);
  }

  const authData = await authRes.json();
  const token = authData.accessToken || authData.access_token || authData.token;

  if (!token) {
    throw new Error("No token in auth response");
  }

  console.log("Авторизация успешна");
  return token;
}

function matchesTestPattern(title, allowEmpty = false) {
  if (!title || title.trim() === "") return allowEmpty;
  return TEST_PATTERNS.some((pattern) => pattern.test(title));
}

// Строгая проверка для анкет - только XSS и специфичные тестовые паттерны
function matchesAssessmentPattern(title) {
  if (!title || title.trim() === "") return false;
  return ASSESSMENT_PATTERNS.some((pattern) => pattern.test(title));
}

async function cleanupPerformanceReviews(context, token) {
  console.log("\n--- Очистка Performance Reviews ---");

  let totalRemoved = 0;
  let page = 0;
  const limit = 50;
  // Отслеживаем ID которые не удалось удалить, чтобы не зацикливаться
  const failedIds = new Set();

  while (true) {
    const res = await context.get("/manager/performance-reviews", {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit, offset: page * limit },
    });

    if (!res.ok()) {
      console.error("Ошибка получения списка PR:", res.status());
      break;
    }

    const data = await res.json();
    const items = data.items || data.results || data || [];

    if (!items.length) break;

    const testItems = items.filter((item) => matchesTestPattern(item.title));

    // Фильтруем только те что не были уже провалены
    const deletableItems = testItems.filter((item) => {
      const id = item.id || item.performanceReviewId;
      return !failedIds.has(id);
    });

    if (!deletableItems.length) {
      page++;
      if (items.length < limit) break;
      continue;
    }

    let deletedThisRound = 0;
    for (const item of deletableItems) {
      const id = item.id || item.performanceReviewId;
      if (!id) continue;

      console.log(
        `  Удаляем PR: "${item.title}" (${id}) status=${item.status}`,
      );

      // 1. Для nomination/adminCheck/headApprove: отменяем подбор
      if (["nomination", "adminCheck", "headApprove"].includes(item.status)) {
        const cancelRes = await context
          .post(`/manager/performance-reviews/${id}/cancel-nomination`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          .catch(() => null);
        if (cancelRes?.ok()) {
          console.log(`    → Номинация отменена`);
        } else {
          // Попробуем stop напрямую
          const stopRes = await context
            .post(`/manager/performance-reviews/${id}/stop`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            .catch(() => null);
          if (stopRes?.ok()) {
            console.log(`    → Остановлен`);
          }
        }
      }

      // 2. Для не-draft/finished PR: останавливаем
      if (item.status !== "draft" && item.status !== "finished" &&
          !["nomination", "adminCheck", "headApprove"].includes(item.status)) {
        const stopRes = await context
          .post(`/manager/performance-reviews/${id}/stop`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          .catch(() => null);
        if (stopRes?.ok()) {
          console.log(`    → Остановлен`);
        }
      }

      // 2. Архивируем (ВСЕГДА, включая draft)
      const archiveRes = await context.post(
        `/manager/performance-reviews/${id}/archive`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (archiveRes?.ok()) {
        console.log(`    → Архивирован`);
      } else {
        const archErr = await archiveRes?.text().catch(() => "");
        console.log(
          `    ! Архивация: ${archiveRes?.status()} ${archErr?.slice(0, 80)}`,
        );
      }

      // 3. Удаляем
      let deleteRes = await context.delete(
        `/manager/performance-reviews/${id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (deleteRes.ok()) {
        totalRemoved++;
        deletedThisRound++;
        console.log(`    ✓ Удалён`);
      } else {
        const errText = await deleteRes.text().catch(() => "");
        console.log(
          `    ✗ Ошибка: ${deleteRes.status()} ${errText.slice(0, 150)}`,
        );
        // Запоминаем неудачные ID чтобы не повторять
        failedIds.add(id);
      }
    }

    // Если ничего не удалили в этом раунде, идём к следующей странице
    if (deletedThisRound === 0) {
      page++;
      if (items.length < limit) break;
      continue;
    }

    // Иначе перезапрашиваем с начала после удаления
    page = 0;
  }

  if (failedIds.size > 0) {
    console.log(
      `\n  [!] Не удалось удалить ${failedIds.size} PR (возможно требуется ручное удаление)`,
    );
  }

  console.log(`\nУдалено Performance Reviews: ${totalRemoved}`);
  return totalRemoved;
}

async function cleanupSurveys(context, token) {
  console.log("\n--- Очистка Surveys ---");

  let totalRemoved = 0;
  let page = 0;
  const limit = 50;

  while (true) {
    const res = await context.get("/manager/surveys/", {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit, offset: page * limit },
    });

    if (!res.ok()) {
      console.error("Ошибка получения списка опросов:", res.status());
      break;
    }

    const data = await res.json();
    const items = data.items || data.results || data || [];

    if (!items.length) break;

    const testItems = items.filter((item) =>
      matchesTestPattern(item.title, SURVEY_EMPTY_TITLE),
    );

    if (!testItems.length) {
      page++;
      if (items.length < limit) break;
      continue;
    }

    for (const item of testItems) {
      const id = item.id || item.surveyId;
      if (!id) continue;

      console.log(`  Удаляем опрос: "${item.title}" (${id})`);

      // Сначала останавливаем если активен
      await context
        .post(`/manager/surveys/${id}/stop/`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .catch(() => {});

      // Удаляем
      const deleteRes = await context.delete(`/manager/surveys/${id}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (deleteRes.ok()) {
        totalRemoved++;
        console.log(`    ✓ Удалён`);
      } else {
        console.log(`    ✗ Ошибка: ${deleteRes.status()}`);
      }
    }

    // Перезапрашиваем с начала после удаления
    page = 0;
  }

  console.log(`\nУдалено Surveys: ${totalRemoved}`);
  return totalRemoved;
}

async function cleanupAssessments(context, token) {
  console.log("\n--- Очистка Assessments (Анкет) ---");

  let totalRemoved = 0;
  let page = 0;
  const limit = 50;
  const failedIds = new Set();

  while (true) {
    const res = await context.get("/manager/assessments/", {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit, offset: page * limit },
    });

    if (!res.ok()) {
      console.error("Ошибка получения списка анкет:", res.status());
      break;
    }

    const data = await res.json();
    const items = data.items || data.results || data || [];

    if (!items.length) break;

    // Фильтруем анкеты ТОЛЬКО по строгим паттернам (XSS, таймстампы)
    // НЕ используем общие паттерны /test/i, /тест/i чтобы не удалить реальные данные
    const testItems = items.filter((item) =>
      matchesAssessmentPattern(item.title),
    );

    // Фильтруем уже провалившиеся
    const deletableItems = testItems.filter((item) => {
      const id = item.id || item.assessmentId;
      return !failedIds.has(id);
    });

    if (!deletableItems.length) {
      page++;
      if (items.length < limit) break;
      continue;
    }

    let deletedThisRound = 0;
    for (const item of deletableItems) {
      const id = item.id || item.assessmentId;
      if (!id) continue;

      const titleDisplay = item.title || "(без названия)";
      console.log(`  Удаляем анкету: "${titleDisplay}" (${id})`);

      const deleteRes = await context.delete(`/manager/assessments/${id}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (deleteRes.ok()) {
        totalRemoved++;
        deletedThisRound++;
        console.log(`    ✓ Удалена`);
      } else {
        const errText = await deleteRes.text().catch(() => "");
        console.log(
          `    ✗ Ошибка: ${deleteRes.status()} ${errText.slice(0, 150)}`,
        );
        failedIds.add(id);
      }
    }

    // Если ничего не удалили, переходим к следующей странице
    if (deletedThisRound === 0) {
      page++;
      if (items.length < limit) break;
      continue;
    }

    // Перезапрашиваем с начала после удаления
    page = 0;
  }

  if (failedIds.size > 0) {
    console.log(
      `\n  [!] Не удалось удалить ${failedIds.size} анкет (возможно требуется ручное удаление)`,
    );
  }

  console.log(`\nУдалено Assessments: ${totalRemoved}`);
  return totalRemoved;
}

async function main() {
  if (!adminEmail || !adminPassword) {
    console.error(
      "Ошибка: ADMIN_LOGIN и ADMIN_PASSWORD должны быть заданы в .env",
    );
    process.exit(1);
  }

  const context = await request.newContext({ baseURL });

  try {
    const token = await authenticate(context);

    let prRemoved = 0;
    let surveyRemoved = 0;
    let assessmentRemoved = 0;

    if (cleanPR) {
      prRemoved = await cleanupPerformanceReviews(context, token);
    }

    if (cleanSurvey) {
      surveyRemoved = await cleanupSurveys(context, token);
    }

    if (cleanAssessment) {
      assessmentRemoved = await cleanupAssessments(context, token);
    }

    console.log(
      "\n============================================================",
    );
    console.log("Итого:");
    console.log("============================================================");
    if (cleanPR) console.log(`  Performance Reviews: ${prRemoved}`);
    if (cleanSurvey) console.log(`  Surveys: ${surveyRemoved}`);
    if (cleanAssessment) console.log(`  Assessments: ${assessmentRemoved}`);
    console.log("============================================================");
  } catch (error) {
    console.error("Ошибка:", error.message);
    process.exit(1);
  } finally {
    await context.dispose();
  }
}

main();
