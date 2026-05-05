#!/usr/bin/env node
/**
 * Скрипт для исправления неактивных подчиненных в PR
 * Удаляет неактивных "Автотест Сотрудник" и оставляет только активных
 */

import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

const prId = process.argv[2] || "11848";

console.log("============================================================");
console.log("Fix Inactive Subordinates in PR");
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

  // 1. Получаем данные PR и направления
  const { data: prData } = await api.getById(prId);
  const directions = prData.directions || [];

  const subordinateDirection = directions.find(
    (d) => d.receiverType === "subordinate",
  );
  if (!subordinateDirection) {
    console.log('Направление "подчиненные" не найдено');
    await ctx.dispose();
    return;
  }
  console.log("Subordinate direction ID:", subordinateDirection.id);

  // 2. Получаем активных пользователей
  console.log("\n=== АКТИВНЫЕ ПОЛЬЗОВАТЕЛИ ===");
  const { data: usersData } = await api.get(
    "/manager/users/?limit=50&category=active",
  );
  const activeUsers = usersData?.items || [];
  console.log("Всего активных:", activeUsers.length);

  const activeUserIds = new Set(activeUsers.map((u) => u.id));

  // Показываем активных
  for (const u of activeUsers.slice(0, 10)) {
    console.log(`  ${u.firstName} ${u.lastName} (ID: ${u.id})`);
  }
  if (activeUsers.length > 10) {
    console.log(`  ... и ещё ${activeUsers.length - 10}`);
  }

  // 3. Получаем target users
  console.log("\n=== TARGET USERS ===");
  const { data: targetUsersData } = await api.getTargetUsers(prId, {
    limit: 50,
  });
  const targetUsers = targetUsersData?.items || [];

  for (const tu of targetUsers) {
    const user = tu.user || {};
    const userName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    const userId = tu.userId || tu.id;
    console.log(`\n${userName} (ID: ${userId}):`);

    // 4. Получаем текущих подчиненных для этого target user
    // Используем receiver-users endpoint
    const { data: receiversData } = await api.getReceiverUsers(prId, {
      limit: 100,
    });
    const receivers = receiversData?.items || [];

    // Находим receivers для subordinate направления для этого target user
    const subordinateReceivers = [];
    for (const r of receivers) {
      for (const d of r.directions || []) {
        if (d.directionId === subordinateDirection.id) {
          // Проверяем, есть ли этот target user в targetUsers этого receiver
          const hasThisTarget = d.targetUsers?.some(
            (t) => t.targetUserId === userId,
          );
          if (hasThisTarget) {
            subordinateReceivers.push({
              receiverId: r.user?.id || r.userId,
              receiverName:
                `${r.user?.firstName || ""} ${r.user?.lastName || ""}`.trim(),
              isActive: activeUserIds.has(r.user?.id || r.userId),
            });
          }
        }
      }
    }

    console.log("  Текущие подчиненные:");
    const activeSubordinates = [];
    const inactiveSubordinates = [];

    for (const sub of subordinateReceivers) {
      const status = sub.isActive ? "✓ активен" : "✗ НЕАКТИВЕН";
      console.log(`    ${sub.receiverName} (ID: ${sub.receiverId}): ${status}`);
      if (sub.isActive) {
        activeSubordinates.push(sub.receiverId);
      } else {
        inactiveSubordinates.push(sub);
      }
    }

    // 5. Если есть неактивные - обновляем список подчиненных
    if (inactiveSubordinates.length > 0) {
      console.log(
        `\n  ⚠️ Найдено ${inactiveSubordinates.length} неактивных подчиненных`,
      );
      console.log(`  Обновляем список, оставляем только активных...`);

      // Обновляем receivers - оставляем только активных
      try {
        const { response } = await api.updateReceivers(prId, userId, {
          directionId: subordinateDirection.id,
          usersIds: activeSubordinates,
        });

        if (response.ok()) {
          console.log(
            `  ✓ Список подчиненных обновлён (осталось ${activeSubordinates.length})`,
          );
        } else {
          const errorText = await response.text();
          console.log(`  ⚠️ Ошибка: ${response.status()} - ${errorText}`);
        }
      } catch (e) {
        console.log(`  ⚠️ Ошибка: ${e.message}`);
      }
    } else {
      console.log("  ✓ Все подчиненные активны");
    }
  }

  // 6. Заполняем анкеты после исправления
  console.log("\n=== ЗАПОЛНЕНИЕ АНКЕТ ===");
  console.log("Запускаем populateReview...");

  const settings = {
    skipChance: 0,
    commentChance: 0,
    customChance: 0,
    lowerLimit: 60,
    upperLimit: 100,
  };

  const { response: popResp } = await api.populateReview(prId, settings);
  console.log("populateReview status:", popResp.status());

  // 7. Проверяем итоговый прогресс
  console.log("\n=== ИТОГОВЫЙ ПРОГРЕСС ===");
  await new Promise((r) => setTimeout(r, 2000));

  const { data: revision } = await api.getLastRevision(prId);
  const { data: progress } = await api.getTargetUsersProgress(prId, {
    revisionId: revision?.id,
    usersIds: targetUsers.map((u) => u.userId || u.id),
  });

  let totalCompleted = 0;
  let totalExpected = 0;

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
      totalCompleted += d.completedCount;
      totalExpected += d.totalCount;
    }
  }

  console.log(`\n📊 ИТОГО: ${totalCompleted}/${totalExpected} анкет заполнено`);

  const { data: counts } = await api.getUsersCounts(prId);
  console.log("\nTarget users:", counts?.targetUsersCount);
  console.log("Receivers:", counts?.receiversCount);

  await ctx.dispose();
  console.log("\n✅ Готово");
}

main().catch((err) => {
  console.error("Ошибка:", err.message);
  process.exit(1);
});
