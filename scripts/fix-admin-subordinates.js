#!/usr/bin/env node
/**
 * Исправляем подчиненных для demo-admin (ID: 1)
 * Удаляем неактивных "Автотест Сотрудник" и оставляем только Марина Леонова
 */

import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

const prId = process.argv[2] || "11848";

console.log("============================================================");
console.log("Fix Admin Subordinates");
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
  console.log("PR:", prData.title);
  console.log("Status:", prData.status);

  const subordinateDirection = directions.find(
    (d) => d.receiverType === "subordinate",
  );
  const colleagueDirection = directions.find(
    (d) => d.receiverType === "colleague",
  );
  const headDirection = directions.find((d) => d.receiverType === "head");

  console.log("\nНаправления:");
  console.log("  subordinate ID:", subordinateDirection?.id);
  console.log("  colleague ID:", colleagueDirection?.id);
  console.log("  head ID:", headDirection?.id);

  // 2. Получаем активных пользователей
  const { data: usersData } = await api.get(
    "/manager/users/?limit=50&category=active",
  );
  const activeUsers = usersData?.items || [];
  console.log("\nАктивные пользователи:", activeUsers.length);

  // Ключевые активные пользователи:
  // ID 1 - demo-admin
  // ID 2 - Константин Кандидатов
  // ID 39 - Марина Леонова
  // ID 44 - Наталья Андреева
  // ID 53 - Мария Орлова
  // ID 56 - Анна Филиппова
  // ID 62 - Алина Миронова
  // ID 69 - Кирилл Петров
  // ID 70 - Анатолий Федотов
  // ID 100 - Иван Доронин

  const ADMIN_USER_ID = 1;
  const CANDIDATE_USER_ID = 2;
  const LEONOVA_ID = 39;
  const ANDREEVA_ID = 44;
  const APINA_ID = 53;
  const FILIPPOVA_ID = 56;
  const MIRONOVA_ID = 62;
  const GUSEV_ID = 69;
  const FEDOTOV_ID = 70;
  const DORONIN_ID = 100;

  // 3. Исправляем подчиненных для admin
  // На скриншоте: Марина Леонова + 5 неактивных Автотест
  // Оставляем только Марину Леонову
  console.log("\n=== ИСПРАВЛЕНИЕ ПОДЧИНЕННЫХ ДЛЯ ADMIN ===");
  console.log("Текущие: Марина Леонова + 5 неактивных");
  console.log("Новые: только Марина Леонова");

  try {
    const { response } = await api.updateReceivers(prId, ADMIN_USER_ID, {
      directionId: subordinateDirection.id,
      usersIds: [LEONOVA_ID], // Только Марина Леонова
    });

    if (response.ok()) {
      console.log("✓ Подчиненные обновлены");
    } else {
      const errorText = await response.text();
      console.log("⚠️ Ошибка:", response.status(), errorText);
    }
  } catch (e) {
    console.log("⚠️ Ошибка:", e.message);
  }

  // 4. Добавим больше подчиненных для Леоновой и Романова (если нужно)
  // Из скриншота видно, что у них подчиненных нет ("+ Добавить")

  // Для Леоновой добавим пару подчиненных (если она руководитель)
  console.log("\n=== ДОБАВЛЕНИЕ ПОДЧИНЕННЫХ ДЛЯ ЛЕОНОВОЙ ===");
  try {
    // Используем активных пользователей, которые не являются target users
    const subordinatesForLeonova = [MIRONOVA_ID, GUSEV_ID]; // Алина Миронова, Кирилл Петров

    const { response } = await api.updateReceivers(prId, LEONOVA_ID, {
      directionId: subordinateDirection.id,
      usersIds: subordinatesForLeonova,
    });

    if (response.ok()) {
      console.log("✓ Добавлены подчиненные:", subordinatesForLeonova);
    } else {
      const errorText = await response.text();
      console.log("⚠️:", response.status(), errorText);
    }
  } catch (e) {
    console.log("⚠️:", e.message);
  }

  // 5. Заполняем анкеты
  console.log("\n=== ЗАПОЛНЕНИЕ АНКЕТ ===");
  const settings = {
    skipChance: 0,
    commentChance: 0,
    customChance: 0,
    lowerLimit: 50,
    upperLimit: 100,
  };

  const { response: popResp } = await api.populateReview(prId, settings);
  console.log("populateReview:", popResp.status());

  // 6. Проверяем прогресс
  console.log("\n=== ПРОВЕРКА ПРОГРЕССА ===");
  await new Promise((r) => setTimeout(r, 2000));

  const { data: targetUsersData } = await api.getTargetUsers(prId, {
    limit: 50,
  });
  const targetUsers = targetUsersData?.items || [];

  const { data: revision } = await api.getLastRevision(prId);
  const { data: progress } = await api.getTargetUsersProgress(prId, {
    revisionId: revision?.id,
    usersIds: targetUsers.map((u) => u.userId || u.id),
  });

  let totalCompleted = 0;
  let totalExpected = 0;

  for (const p of progress?.items || progress || []) {
    const user = targetUsers.find((u) => (u.userId || u.id) === p.userId);
    const userName = user?.user
      ? `${user.user.firstName} ${user.user.lastName}`
      : p.userId;
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
  console.log("\n✅ Готово!");
  console.log(
    `\nПроверьте: ${process.env.BASE_URL}/ru/manager/performance-reviews/${prId}/progress`,
  );
}

main().catch((err) => {
  console.error("Ошибка:", err.message);
  process.exit(1);
});
