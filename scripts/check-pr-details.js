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

  // 1. PR данные
  const { data: prData } = await api.getById(prId);
  const directions = prData.directions || [];

  console.log("PR:", prData.title);
  console.log("Status:", prData.status);
  console.log("\nDirections:");
  for (const d of directions) {
    console.log(`  ${d.receiverType} (ID: ${d.id})`);
  }

  // 2. Target users
  const { data: targetUsersData } = await api.getTargetUsers(prId, {
    limit: 50,
  });
  const targetUsers = targetUsersData?.items || [];

  console.log("\n=== TARGET USERS ===");
  for (const tu of targetUsers) {
    const user = tu.user || {};
    console.log(
      `${user.firstName} ${user.lastName} (ID: ${tu.userId || tu.id})`,
    );
    console.log(
      `  headUser: ${tu.headUser ? `${tu.headUser.firstName} ${tu.headUser.lastName}` : "нет"}`,
    );
  }

  // 3. Receiver users с детализацией
  console.log("\n=== RECEIVER USERS ===");
  const { data: receiversData } = await api.getReceiverUsers(prId, {
    limit: 100,
  });
  const receivers = receiversData?.items || [];

  for (const r of receivers) {
    const name = `${r.user?.firstName || ""} ${r.user?.lastName || ""}`.trim();
    console.log(`\n${name} (ID: ${r.user?.id || r.userId}):`);

    for (const d of r.directions || []) {
      const dirType =
        directions.find((dir) => dir.id === d.directionId)?.receiverType ||
        d.directionId;
      console.log(`  ${dirType}:`);
      for (const t of d.targetUsers || []) {
        const targetName =
          targetUsers.find((tu) => (tu.userId || tu.id) === t.targetUserId)
            ?.user?.lastName || t.targetUserId;
        const status = t.isCompleted ? "✓" : "○";
        console.log(`    ${status} → ${targetName}`);
      }
    }
  }

  // 4. Counts
  const { data: counts } = await api.getUsersCounts(prId);
  console.log("\n=== COUNTS ===");
  console.log("Target users:", counts?.targetUsersCount);
  console.log("Receivers:", counts?.receiversCount);

  // Подсчёт анкет
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
  console.log(`\nАнкет: ${completed}/${total} заполнено`);

  await ctx.dispose();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
