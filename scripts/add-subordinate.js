#!/usr/bin/env node
import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

const prId = process.argv[2] || "11848";

async function main() {
  const baseURL = process.env.API_BASE_URL;
  const ctx = await request.newContext({ baseURL, timeout: 60000 });
  const api = new PerformanceReviewAPI(ctx);

  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);
  console.log("PR ID:", prId);

  // Получаем направления
  const { data: prData } = await api.getById(prId);
  const subordinateDirection = prData.directions.find(
    (d) => d.receiverType === "subordinate",
  );
  console.log("Subordinate direction ID:", subordinateDirection?.id);

  // IDs пользователей
  const SHAPOVAL_ID = 1;
  const LEONOVA_ID = 39;
  const ROMANOV_ID = 2;
  const FEDOTOV_ID = 70; // Анатолий Федотов - добавим как второго подчиненного

  // Добавляем Shapoval: Леонова + Федотов (минимум 2)
  console.log("\nДобавляем 2 подчиненных для Shapoval...");
  const { response: r1 } = await api.updateReceivers(prId, SHAPOVAL_ID, {
    directionId: subordinateDirection.id,
    usersIds: [LEONOVA_ID, FEDOTOV_ID],
  });
  console.log("Shapoval subordinates:", r1.ok() ? "✓" : r1.status());

  // Добавим и Романову 2 подчиненных для полноты
  console.log("Добавляем 2 подчиненных для Романова...");
  const DORONIN_ID = 100; // Иван Доронин
  const ANDREEVA_ID = 44; // Наталья Андреева

  const { response: r2 } = await api.updateReceivers(prId, ROMANOV_ID, {
    directionId: subordinateDirection.id,
    usersIds: [DORONIN_ID, ANDREEVA_ID],
  });
  console.log("Романов subordinates:", r2.ok() ? "✓" : r2.status());

  // Заполняем новые анкеты
  console.log("\nЗаполняем новые анкеты...");
  const { response: popResp } = await api.populateReview(prId, {
    skipChance: 0,
    commentChance: 0,
    customChance: 0,
    lowerLimit: 60,
    upperLimit: 100,
  });
  console.log("populateReview:", popResp.status());

  // Проверяем
  await new Promise((r) => setTimeout(r, 2000));
  const { data: counts } = await api.getUsersCounts(prId);
  console.log("\nTarget users:", counts?.targetUsersCount);
  console.log("Receivers:", counts?.receiversCount);

  await ctx.dispose();
  console.log("\n✅ Готово! Проверьте UI.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
