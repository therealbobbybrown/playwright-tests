#!/usr/bin/env node
/**
 * Seed тестовых данных для вкладки «Распределение оценок».
 *
 * Создаёт 3 PR с компетенциями/группами:
 *   PR 1: С калибровкой + 5 подчинённых менеджера (qaadmin+24)
 *   PR 2: Без калибровки + 3 подчинённых менеджера
 *   PR 3: С калибровкой + 5 подчинённых хеда (qaadmin+55 = Родина)
 *
 * Использование:
 *   node scripts/seed-score-distribution-data.js
 *   node scripts/seed-score-distribution-data.js --check
 */

import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/credentials.js";

// Подчинённые менеджера (91406), которые ещё НЕ участвуют ни в одном PR
const MANAGER_SUB_PR1 = [
  68733, // Пётр Андреев
  68492, // Максим Белов
  68976, // Виктор Беляев
  68627, // Марина Борисова
  68870, // Арсений Васильев
];

const MANAGER_SUB_PR2 = [
  68693, // Борис Герасимов
  68843, // Роман Козлов
  68835, // Илья Комаров
];

// Подчинённые хеда (Родина, 91407), которые НЕ участвуют ни в одном PR
const HEAD_SUB_PR3 = [
  68574, // Михаил Андреев
  68408, // Мария Орлова
  68980, // Артём Белов
  68568, // Андрей Борисов
  68889, // Тимофей Васильев
];

// Существующая анкета с компетенциями (создана seed-calibration-data.js)
const ASSESSMENT_ID = 3460;

const isCheck = process.argv.includes("--check");
const isFillExisting = process.argv.includes("--fill-existing");

async function main() {
  const baseURL = process.env.API_BASE_URL;
  if (!baseURL) {
    console.error("API_BASE_URL не задан в .env");
    process.exit(1);
  }

  const context = await request.newContext({ baseURL, timeout: 120000 });

  try {
    const prAPI = new PerformanceReviewAPI(context);
    const { email, password } = getCredentials("admin");
    await prAPI.signIn(email, password);
    console.log("✓ Авторизация успешна\n");

    if (isCheck) {
      await checkExistingData(prAPI);
      return;
    }

    if (isFillExisting) {
      await fillExistingPRs(prAPI);
      return;
    }

    // ═══════════════════════════════════════════════
    // PR 1: С калибровкой + 5 подчинённых менеджера
    // ═══════════════════════════════════════════════
    console.log("═══ PR 1: С калибровкой (подчинённые менеджера) ═══\n");
    const pr1 = await createPRWithTargetUsers(prAPI, {
      title: `E2E_Распределение оценок (калибр)_${Date.now()}`,
      targetUserIds: MANAGER_SUB_PR1,
      enableCalibration: true,
    });
    if (pr1) {
      console.log(`\n✅ PR 1: ID=${pr1.prId}, rev=${pr1.revisionId}\n`);
    }

    // ═══════════════════════════════════════════════
    // PR 2: Без калибровки + 3 подчинённых менеджера
    // ═══════════════════════════════════════════════
    console.log("═══ PR 2: Без калибровки (подчинённые менеджера) ═══\n");
    const pr2 = await createPRWithTargetUsers(prAPI, {
      title: `E2E_Распределение оценок (без калибр)_${Date.now()}`,
      targetUserIds: MANAGER_SUB_PR2,
      enableCalibration: false,
    });
    if (pr2) {
      console.log(`\n✅ PR 2: ID=${pr2.prId}, rev=${pr2.revisionId}\n`);
    }

    // ═══════════════════════════════════════════════
    // PR 3: С калибровкой + 5 подчинённых хеда (Родина)
    // ═══════════════════════════════════════════════
    console.log("═══ PR 3: С калибровкой (подчинённые хеда) ═══\n");
    const pr3 = await createPRWithTargetUsers(prAPI, {
      title: `E2E_Распределение оценок (рук-ль)_${Date.now()}`,
      targetUserIds: HEAD_SUB_PR3,
      enableCalibration: true,
    });
    if (pr3) {
      console.log(`\n✅ PR 3: ID=${pr3.prId}, rev=${pr3.revisionId}\n`);
    }

    // Итог
    console.log("═══════════════════════════════════════════════════");
    console.log("ИТОГО:");
    if (pr1)
      console.log(
        `  PR 1 (manager, calibr.): ${pr1.prId} / rev ${pr1.revisionId}`,
      );
    if (pr2)
      console.log(
        `  PR 2 (manager, no cal.): ${pr2.prId} / rev ${pr2.revisionId}`,
      );
    if (pr3)
      console.log(
        `  PR 3 (head, calibr.):    ${pr3.prId} / rev ${pr3.revisionId}`,
      );
    console.log("═══════════════════════════════════════════════════");
  } catch (error) {
    console.error("Ошибка:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await context.dispose();
  }
}

async function createPRWithTargetUsers(prAPI, options) {
  const { title, targetUserIds, enableCalibration } = options;

  // 1. Создать PR с правильным payload (directions, anonymityType, workflowType)
  console.log(`  1. Создание PR "${title}"...`);
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
      isSelected: false,
      title: null,
      description: null,
    },
    {
      id: null,
      receiverType: "colleague",
      isSelected: false,
      title: null,
      description: null,
    },
  ];

  const prPayload = {
    title,
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
  };

  const { response: createResp, data: createData } =
    await prAPI.create(prPayload);

  if (!createResp.ok()) {
    const body = await createResp.text().catch(() => "");
    console.error(
      `  ✗ Создание PR: ${createResp.status()} ${body.substring(0, 300)}`,
    );
    return null;
  }

  const prId = createData?.id || createData?.data?.id;
  console.log(`  ✓ PR создан: ID=${prId}`);

  // 2. Привязать анкету к направлениям self и head
  console.log(`  2. Привязка анкеты ${ASSESSMENT_ID}...`);
  const { data: prDetails } = await prAPI.getById(prId);
  const prDirections = prDetails?.directions || [];

  for (const dir of prDirections) {
    const dirType = dir.receiverType;
    if (["self", "head"].includes(dirType)) {
      try {
        const { response } = await prAPI.setAssessments(prId, {
          directionId: dir.id,
          assessmentsIds: [ASSESSMENT_ID],
        });
        if (response.ok()) {
          console.log(`  ✓ Анкета → "${dirType}"`);
        } else {
          console.log(`  ⚠️ Анкета → "${dirType}": ${response.status()}`);
        }
      } catch (e) {
        console.log(`  ⚠️ Анкета → "${dirType}": ${e.message}`);
      }
    }
  }

  // 4. Добавить target users
  console.log(`  3. Добавление ${targetUserIds.length} target users...`);
  const targets = targetUserIds.map((userId) => ({
    targetType: "user",
    entityId: userId,
  }));

  const { response: addResp } = await prAPI.addTargetUsers(prId, { targets });
  if (addResp.ok()) {
    console.log(`  ✓ ${targetUserIds.length} target users добавлено`);
  } else {
    const body = await addResp.text().catch(() => "");
    console.log(
      `  ✗ Добавление target users: ${addResp.status()} ${body.substring(0, 200)}`,
    );
  }

  // 5. Запуск PR
  console.log(`  4. Запуск PR...`);
  const { response: startResp } = await prAPI.start(prId);
  if (!startResp.ok()) {
    const body = await startResp.text().catch(() => "");
    console.log(
      `  ✗ Запуск PR: ${startResp.status()} ${body.substring(0, 300)}`,
    );
    return null;
  }
  console.log(`  ✓ PR запущен`);

  // 6. Получить revision ID
  const { data: revData } = await prAPI.getRevisions(prId, {
    limit: 1,
    offset: 0,
  });
  const revisions = revData?.items || revData || [];
  const activeRevision = Array.isArray(revisions) ? revisions[0] : null;
  const revisionId = activeRevision?.id;
  console.log(`  ✓ Revision ID: ${revisionId}`);

  // 7. Заполнить анкеты (с правильными параметрами)
  console.log(`  5. Заполнение анкет (populateReview)...`);
  const fillSettings = {
    skipChance: 0,
    commentChance: 0,
    customChance: 0,
    lowerLimit: 60,
    upperLimit: 100,
  };
  const maxFillAttempts = 20;
  let filledCount = 0;

  for (let attempt = 1; attempt <= maxFillAttempts; attempt++) {
    try {
      const { response: fillResp } = await prAPI.populateReview(
        prId,
        fillSettings,
        { timeout: 120000 },
      );
      if (fillResp.ok()) {
        filledCount++;
        // Минимальная пауза между вызовами
        await new Promise((r) => setTimeout(r, 100));
      } else if (fillResp.status() === 500) {
        // 500 = все анкеты заполнены
        console.log(`  ✓ ${filledCount} анкет заполнено (все завершены)`);
        break;
      } else {
        const body = await fillResp.text().catch(() => "");
        console.log(
          `  ⚠️ Заполнение #${attempt}: ${fillResp.status()} ${body.substring(0, 200)}`,
        );
        break;
      }
    } catch (e) {
      console.log(`  ⚠️ Заполнение #${attempt}: ${e.message}`);
      break;
    }
  }
  if (filledCount > 0) {
    console.log(`  ✓ Заполнено ${filledCount} анкет`);
  }

  // 8. Настроить статистику (калибровка) — через feature-flag endpoint
  if (enableCalibration) {
    console.log(`  6. Включение калибровки...`);
    try {
      const featureUrl = `/manager/performance-reviews/${prId}/statistics/settings/?feature=statisticsSettings`;
      // Сначала получить текущие настройки
      const { data: currentSettings } = await prAPI.get(featureUrl);
      // Обновить с нужными флагами
      const { response: statsResp } = await prAPI.post(featureUrl, {
        ...currentSettings,
        settings: {
          ...(currentSettings?.settings || {}),
          useOnlyHeadReceiver: true,
          enableCompetenceWeights: true,
          enableResponsesOverwriting: true,
          enableCustomCharacteristics: true,
        },
      });
      if (statsResp.ok()) {
        console.log(`  ✓ Калибровка включена`);
      } else {
        const body = await statsResp.text().catch(() => "");
        console.log(
          `  ⚠️ Настройка статистики: ${statsResp.status()} ${body.substring(0, 200)}`,
        );
      }
    } catch (e) {
      console.log(`  ⚠️ Настройка статистики: ${e.message}`);
    }
  }

  return { prId, revisionId };
}

/**
 * Дозаполнить уже созданные PR (populateReview + настройки калибровки)
 */
async function fillExistingPRs(prAPI) {
  console.log("Дозаполнение существующих PR...\n");

  const existingPRs = [
    { prId: 8619, enableCalibration: true, label: "PR 1 (manager, calibr.)" },
    { prId: 8620, enableCalibration: false, label: "PR 2 (manager, no cal.)" },
    { prId: 8621, enableCalibration: true, label: "PR 3 (head, calibr.)" },
  ];

  const fillSettings = {
    skipChance: 0,
    commentChance: 0,
    customChance: 0,
    lowerLimit: 60,
    upperLimit: 100,
  };

  for (const { prId, enableCalibration, label } of existingPRs) {
    console.log(`═══ ${label}: ID=${prId} ═══`);

    // 1. Заполнить анкеты
    console.log(`  1. Заполнение анкет...`);
    let filledCount = 0;
    for (let attempt = 1; attempt <= 25; attempt++) {
      try {
        const { response } = await prAPI.populateReview(prId, fillSettings, {
          timeout: 120000,
        });
        if (response.ok()) {
          filledCount++;
          await new Promise((r) => setTimeout(r, 100));
        } else if (response.status() === 500) {
          console.log(`  ✓ ${filledCount} анкет заполнено (все завершены)`);
          break;
        } else {
          const body = await response.text().catch(() => "");
          console.log(
            `  ⚠️ #${attempt}: ${response.status()} ${body.substring(0, 200)}`,
          );
          break;
        }
      } catch (e) {
        console.log(`  ⚠️ #${attempt}: ${e.message}`);
        break;
      }
    }
    if (filledCount > 0 && filledCount < 25) {
      console.log(`  ✓ Заполнено ${filledCount} анкет`);
    }

    // 2. Настроить калибровку
    if (enableCalibration) {
      console.log(`  2. Включение калибровки...`);
      try {
        const featureUrl = `/manager/performance-reviews/${prId}/statistics/settings/?feature=statisticsSettings`;
        const { data: currentSettings } = await prAPI.get(featureUrl);
        const { response: statsResp } = await prAPI.post(featureUrl, {
          ...currentSettings,
          settings: {
            ...(currentSettings?.settings || {}),
            useOnlyHeadReceiver: true,
            enableCompetenceWeights: true,
            enableResponsesOverwriting: true,
            enableCustomCharacteristics: true,
          },
        });
        if (statsResp.ok()) {
          console.log(`  ✓ Калибровка включена`);
        } else {
          const body = await statsResp.text().catch(() => "");
          console.log(
            `  ⚠️ Настройка: ${statsResp.status()} ${body.substring(0, 200)}`,
          );
        }
      } catch (e) {
        console.log(`  ⚠️ Настройка: ${e.message}`);
      }
    }
    console.log();
  }
}

async function checkExistingData(prAPI) {
  console.log("Режим проверки...\n");

  const { data } = await prAPI.getList();
  const prs = data?.items || (Array.isArray(data) ? data : []);

  const scoreDists = prs.filter((pr) => pr.title?.includes("ScoreDist"));
  if (scoreDists.length > 0) {
    console.log(`Найдено ${scoreDists.length} ScoreDist PR:`);
    for (const pr of scoreDists) {
      console.log(`  - ${pr.title} (ID: ${pr.id}, status: ${pr.status})`);
    }
  } else {
    console.log("ScoreDist PR не найдено.");
  }
}

main();
