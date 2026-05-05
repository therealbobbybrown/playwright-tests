#!/usr/bin/env node
/**
 * Скрипт для диагностики и исправления PR для калибровки
 * Анализирует текущее состояние и заполняет недостающие анкеты
 */

import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

const prId = process.argv[2] || "11848";

console.log("============================================================");
console.log("Diagnose and Fix PR for Calibration");
console.log("============================================================");
console.log("PR ID:", prId);
console.log("");

async function main() {
  const baseURL = process.env.API_BASE_URL;
  const ctx = await request.newContext({ baseURL, timeout: 60000 });
  const api = new PerformanceReviewAPI(ctx);

  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);
  console.log("✓ Авторизация успешна\n");

  // 1. Получаем данные PR
  console.log("=== 1. ДАННЫЕ PR ===");
  const { data: prData } = await api.getById(prId);
  console.log("Title:", prData.title);
  console.log("Status:", prData.status);

  const directions = prData.directions || [];
  console.log("\nНаправления:");
  for (const d of directions) {
    console.log(`  ${d.receiverType}: ID ${d.id}, isSelected: ${d.isSelected}`);
  }

  // 2. Получаем target users
  console.log("\n=== 2. TARGET USERS ===");
  const { data: targetUsersData } = await api.getTargetUsers(prId, {
    limit: 50,
  });
  const targetUsers = targetUsersData?.items || [];
  console.log("Количество:", targetUsers.length);

  for (const tu of targetUsers) {
    const user = tu.user || {};
    const userName =
      `${user.firstName || ""} ${user.lastName || ""}`.trim() || tu.userId;
    const headUser = tu.headUser || user.headUser || null;
    console.log(`  ${userName} (ID: ${tu.userId || tu.id})`);
    console.log(
      `    headUser: ${headUser ? `${headUser.firstName} ${headUser.lastName}` : "НЕТ РУКОВОДИТЕЛЯ"}`,
    );
  }

  // 3. Получаем receiver users детально
  console.log("\n=== 3. RECEIVER USERS ПО НАПРАВЛЕНИЯМ ===");
  const { data: receiversData } = await api.getReceiverUsers(prId, {
    limit: 100,
  });
  const receivers = receiversData?.items || [];

  // Группируем по direction
  const receiversByDirection = {};
  for (const r of receivers) {
    for (const d of r.directions || []) {
      const dirType =
        directions.find((dir) => dir.id === d.directionId)?.receiverType ||
        "unknown";
      if (!receiversByDirection[dirType]) receiversByDirection[dirType] = [];
      receiversByDirection[dirType].push({
        receiverUserId: r.user?.id || r.userId,
        receiverName:
          `${r.user?.firstName || ""} ${r.user?.lastName || ""}`.trim(),
        targetUsers: d.targetUsers,
        directionId: d.directionId,
        isCompleted: d.isCompleted || false,
      });
    }
  }

  for (const [dirType, items] of Object.entries(receiversByDirection)) {
    console.log(`\n${dirType.toUpperCase()} (${items.length} receivers):`);
    for (const item of items) {
      const completedCount =
        item.targetUsers?.filter((t) => t.isCompleted).length || 0;
      const totalCount = item.targetUsers?.length || 0;
      console.log(`  ${item.receiverName} (ID: ${item.receiverUserId})`);
      console.log(
        `    Оценивает: ${totalCount} чел, завершено: ${completedCount}`,
      );

      // Детали по target users
      for (const tu of item.targetUsers || []) {
        const targetName =
          targetUsers.find((t) => (t.userId || t.id) === tu.targetUserId)?.user
            ?.lastName || tu.targetUserId;
        console.log(
          `      → ${targetName}: ${tu.isCompleted ? "✓ заполнено" : "○ не заполнено"}`,
        );
      }
    }
  }

  // 4. Получаем последнюю ревизию
  console.log("\n=== 4. РЕВИЗИЯ ===");
  const { data: revision } = await api.getLastRevision(prId);
  const revisionId = revision?.id;
  console.log("Revision ID:", revisionId);
  console.log("Revision alias:", revision?.alias);

  // 5. Прогресс по target users
  console.log("\n=== 5. ПРОГРЕСС ПО TARGET USERS ===");
  const targetUserIds = targetUsers.map((u) => u.userId || u.id);

  if (targetUserIds.length > 0 && revisionId) {
    const { data: progress } = await api.getTargetUsersProgress(prId, {
      revisionId: revisionId,
      usersIds: targetUserIds,
    });

    for (const p of progress?.items || progress || []) {
      const user = targetUsers.find((u) => (u.userId || u.id) === p.userId);
      const userName = user?.user?.lastName || p.userId;
      console.log(`\n${userName}:`);
      for (const d of p.directions || []) {
        const dirName =
          directions.find((dir) => dir.id === d.directionId)?.receiverType ||
          d.directionId;
        const status =
          d.completedCount === d.totalCount && d.totalCount > 0 ? "✓" : "○";
        console.log(
          `  ${status} ${dirName}: ${d.completedCount}/${d.totalCount}`,
        );
      }
    }
  }

  // 6. ИСПРАВЛЕНИЕ: Заполняем незаполненные анкеты
  console.log("\n=== 6. ЗАПОЛНЕНИЕ АНКЕТ ===");

  // Попробуем populateReview с разными настройками
  console.log("\nПробуем populateReview (skipChance=0, все оценки)...");
  const settings = {
    skipChance: 0,
    commentChance: 0,
    customChance: 0,
    lowerLimit: 60,
    upperLimit: 100,
  };

  const { response: popResp } = await api.populateReview(prId, settings);
  console.log("populateReview status:", popResp.status());

  if (!popResp.ok()) {
    const errorText = await popResp.text();
    console.log("Ошибка:", errorText);
  }

  // 7. Проверяем результат после заполнения
  console.log("\n=== 7. РЕЗУЛЬТАТ ПОСЛЕ ЗАПОЛНЕНИЯ ===");

  // Повторно получаем progress
  await new Promise((r) => setTimeout(r, 2000)); // Ждём обновления

  const { data: progress2 } = await api.getTargetUsersProgress(prId, {
    revisionId: revisionId,
    usersIds: targetUserIds,
  });

  let totalCompleted = 0;
  let totalExpected = 0;

  for (const p of progress2?.items || progress2 || []) {
    const user = targetUsers.find((u) => (u.userId || u.id) === p.userId);
    const userName = user?.user?.lastName || p.userId;
    console.log(`\n${userName}:`);
    for (const d of p.directions || []) {
      const dirName =
        directions.find((dir) => dir.id === d.directionId)?.receiverType ||
        d.directionId;
      const status =
        d.completedCount === d.totalCount && d.totalCount > 0 ? "✓" : "○";
      console.log(
        `  ${status} ${dirName}: ${d.completedCount}/${d.totalCount}`,
      );
      totalCompleted += d.completedCount;
      totalExpected += d.totalCount;
    }
  }

  console.log(`\n📊 ИТОГО: ${totalCompleted}/${totalExpected} анкет заполнено`);

  // 8. Финальная статистика
  const { data: counts } = await api.getUsersCounts(prId);
  console.log("\n=== ФИНАЛЬНАЯ СТАТИСТИКА ===");
  console.log("Target users:", counts?.targetUsersCount);
  console.log("Receivers:", counts?.receiversCount);

  await ctx.dispose();
  console.log("\n✅ Диагностика завершена");
}

main().catch((err) => {
  console.error("Ошибка:", err.message);
  process.exit(1);
});
