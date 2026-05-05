#!/usr/bin/env node
/**
 * Проверка статуса заполнения анкет в PR
 */
import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

const prId = process.argv[2] || "11888";
const baseURL = process.env.API_BASE_URL;

async function main() {
  const ctx = await request.newContext({ baseURL, timeout: 120000 });
  const api = new PerformanceReviewAPI(ctx);

  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  console.log("PR:", prId);

  // Получаем revision
  const { data: revision } = await api.getLastRevision(prId);
  const revAlias = revision?.alias || String(revision?.id);
  console.log("Revision:", revAlias);

  // Получаем receiver users
  const { data: receiversData } = await api.getReceiverUsers(prId, {
    limit: 100,
  });
  const receivers = receiversData?.items || [];
  console.log("Receivers:", receivers.length);

  // Собираем статистику
  let completed = 0;
  let total = 0;

  for (const r of receivers) {
    for (const d of r.directions || []) {
      for (const t of d.targetUsers || []) {
        total++;
        if (t.isCompleted) completed++;
      }
    }
  }

  console.log("Заполнено:", completed + "/" + total);

  // Проверяем revision-users для Shapoval (admin)
  console.log("\nRevision-users (admin):");
  const { data: adminRevUsers } = await api.get(
    "/private/performance-reviews/" +
      prId +
      "/" +
      revAlias +
      "/revision-users?limit=50",
  );
  const adminItems = adminRevUsers?.items || adminRevUsers || [];
  console.log("  Count:", adminItems.length);
  for (const item of adminItems) {
    const status = item.response?.status || "NO_RESPONSE";
    console.log("  -", status);
  }

  await ctx.dispose();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
