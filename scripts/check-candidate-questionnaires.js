#!/usr/bin/env node
import "dotenv/config";
import { request } from "@playwright/test";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../tests/utils/api/index.js";

const prId = "11880";
const baseURL = process.env.API_BASE_URL;

async function main() {
  const ctx = await request.newContext({ baseURL, timeout: 60000 });
  const api = new PerformanceReviewAPI(ctx);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  // Get receivers and find candidate
  const { data: receiversData } = await api.getReceiverUsers(prId, {
    limit: 100,
  });
  const receivers = receiversData?.items || [];

  console.log("Looking for candidate in receivers...");

  for (const r of receivers) {
    const name = `${r.user?.firstName} ${r.user?.lastName}`;
    if (name.includes("Кандидатов")) {
      console.log(`\nFound candidate (userId: ${r.user?.id})`);
      console.log("Directions:");
      for (const d of r.directions || []) {
        console.log(`  Direction ${d.directionId}:`);
        for (const t of d.targetUsers || []) {
          const targetName = `${t.firstName} ${t.lastName}`;
          console.log(`    Target: ${targetName}, completed: ${t.isCompleted}`);
        }
      }
    }
  }

  // Also check revision-users as admin to see candidate entries
  const { data: rev } = await api.getLastRevision(prId);
  const alias = rev?.alias;

  console.log("\n\nAll revision-users (as admin):");
  const { data: allRevUsers } = await api.get(
    `/manager/performance-reviews/${prId}/revisions/${alias}/revision-users?limit=100`,
  );
  const revUsers = allRevUsers?.items || [];
  console.log(`Total: ${revUsers.length}`);

  for (const ru of revUsers) {
    const userName = ru.user
      ? `${ru.user.firstName} ${ru.user.lastName}`
      : "unknown";
    const targetName = ru.targetUser
      ? `${ru.targetUser.firstName} ${ru.targetUser.lastName}`
      : "unknown";
    const dir = ru.direction?.receiverType;
    console.log(
      `  ${userName} -> ${targetName} [${dir}] | responseId: ${ru.responseId || "null"}`,
    );
  }

  await ctx.dispose();
}

main().catch((e) => console.error(e.message));
