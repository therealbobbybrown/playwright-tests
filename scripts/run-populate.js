#!/usr/bin/env node
import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

const prId = process.argv[2] || "11848";
const baseURL = process.env.API_BASE_URL;

async function main() {
  const ctx = await request.newContext({ baseURL, timeout: 60000 });
  const api = new PerformanceReviewAPI(ctx);

  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  console.log("PR ID:", prId);
  console.log("Запуск populateReview...");

  const { response, data } = await api.populateReview(prId, {
    skipChance: 0,
    commentChance: 0,
    customChance: 0,
    lowerLimit: 60,
    upperLimit: 100,
  });

  console.log("Status:", response.status());
  if (!response.ok()) {
    const text = await response.text();
    console.log("Error:", text);
  } else {
    console.log("Data:", JSON.stringify(data, null, 2));
  }

  // Ждём обработки
  await new Promise((r) => setTimeout(r, 3000));

  // Проверяем статистику
  const { data: counts } = await api.getUsersCounts(prId);
  console.log("\nTarget users:", counts?.targetUsersCount);
  console.log("Receivers:", counts?.receiversCount);

  // Проверяем receiver users и их прогресс
  const { data: receiversData } = await api.getReceiverUsers(prId, {
    limit: 50,
  });
  const receivers = receiversData?.items || [];
  console.log("\nReceiver users:", receivers.length);

  let completed = 0;
  let total = 0;
  for (const r of receivers) {
    const name = `${r.user?.firstName || ""} ${r.user?.lastName || ""}`.trim();
    for (const d of r.directions || []) {
      for (const t of d.targetUsers || []) {
        total++;
        if (t.isCompleted) completed++;
      }
    }
  }
  console.log(`Прогресс анкет: ${completed}/${total}`);

  await ctx.dispose();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
