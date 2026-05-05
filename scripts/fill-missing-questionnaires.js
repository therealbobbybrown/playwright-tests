#!/usr/bin/env node
/**
 * Скрипт для заполнения недостающих анкет в PR
 * Особенно важно: оценки от руководителей (head direction)
 */

import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

const prId = process.argv[2] || "11848";

console.log("============================================================");
console.log("Fill Missing Questionnaires Script");
console.log("============================================================");
console.log("PR ID:", prId);
console.log("");

async function main() {
  const baseURL = process.env.API_BASE_URL;
  const ctx = await request.newContext({ baseURL });
  const api = new PerformanceReviewAPI(ctx);

  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);
  console.log("✓ Авторизация успешна\n");

  // Получаем данные PR
  const { data: prData } = await api.getById(prId);
  console.log("PR:", prData.title);
  console.log("Status:", prData.status);

  // Получаем directions
  const directions = prData.directions || [];
  console.log("\nНаправления:");
  for (const d of directions) {
    console.log(`  ${d.receiverType}: ID ${d.id}`);
  }

  // Получаем receiver users
  const { data: receivers } = await api.getReceiverUsers(prId, { limit: 100 });
  console.log("\nReceiver users:", receivers?.items?.length || 0);

  // Группируем по направлениям
  const byDirection = {};
  for (const r of receivers?.items || []) {
    for (const d of r.directions || []) {
      const dirType =
        directions.find((dir) => dir.id === d.directionId)?.receiverType ||
        "unknown";
      if (!byDirection[dirType]) byDirection[dirType] = [];
      byDirection[dirType].push({
        receiverUserId: r.user.id,
        receiverName: `${r.user.firstName} ${r.user.lastName}`,
        targetUsers: d.targetUsers,
        directionId: d.directionId,
      });
    }
  }

  console.log("\nПо направлениям:");
  for (const [dir, items] of Object.entries(byDirection)) {
    console.log(`  ${dir}: ${items.length} receivers`);
  }

  // Получаем последнюю ревизию
  const { data: revision } = await api.getLastRevision(prId);
  const revisionId = revision?.id;
  console.log("\nRevision ID:", revisionId);

  // Получаем target users
  const { data: targetUsersData } = await api.getTargetUsers(prId, {});
  const targetUsers = targetUsersData?.items || [];
  console.log("Target users:", targetUsers.length);

  // Пробуем populateReview ещё раз с другими настройками
  console.log("\n📝 Запускаем populateReview для заполнения всех анкет...");

  const settings = {
    skipChance: 0,
    commentChance: 0,
    customChance: 0,
    lowerLimit: 40, // Расширяем диапазон для разнообразия
    upperLimit: 100,
  };

  const { response } = await api.populateReview(prId, settings);
  if (response.ok()) {
    console.log("✓ populateReview выполнен");
  } else {
    console.log("⚠️ populateReview:", response.status());
  }

  // Проверяем прогресс после заполнения
  console.log("\n📊 Проверяем прогресс...");

  const { data: progress } = await api.getTargetUsersProgress(prId, {
    revisionId: revisionId,
    usersIds: targetUsers.map((u) => u.userId || u.id),
  });

  console.log("\nПрогресс по оцениваемым:");
  for (const p of progress?.items || progress || []) {
    const userName =
      targetUsers.find((u) => (u.userId || u.id) === p.userId)?.user
        ?.lastName || p.userId;
    console.log(`  ${userName}:`);
    for (const d of p.directions || []) {
      const dirName =
        directions.find((dir) => dir.id === d.directionId)?.receiverType ||
        d.directionId;
      console.log(
        `    ${dirName}: ${d.completedCount}/${d.totalCount} completed`,
      );
    }
  }

  // Получаем статистику
  const { data: counts } = await api.getUsersCounts(prId);
  console.log("\n📈 Итоговая статистика:");
  console.log("  Target users:", counts?.targetUsersCount);
  console.log("  Receivers:", counts?.receiversCount);

  await ctx.dispose();
  console.log("\n✅ Готово");
}

main().catch((err) => {
  console.error("Ошибка:", err.message);
  process.exit(1);
});
