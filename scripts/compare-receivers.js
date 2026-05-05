#!/usr/bin/env node
import "dotenv/config";
import { request } from "@playwright/test";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../tests/utils/api/index.js";

const baseURL = process.env.API_BASE_URL;

async function main() {
  const ctx = await request.newContext({ baseURL, timeout: 60000 });
  const api = new PerformanceReviewAPI(ctx);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  for (const prId of ["11870", "11880"]) {
    console.log(`\n${"=".repeat(50)}\nPR ${prId}\n${"=".repeat(50)}`);

    const { data: receiversData } = await api.getReceiverUsers(prId, {
      limit: 10,
    });
    const receivers = receiversData?.items || [];

    // Show first receiver with details
    const first = receivers[0];
    if (!first) {
      console.log("No receivers");
      continue;
    }

    console.log(
      `First receiver: ${first.user?.firstName} ${first.user?.lastName}`,
    );

    for (const d of (first.directions || []).slice(0, 2)) {
      console.log(`  Direction: ${d.directionId}`);
      for (const t of (d.targetUsers || []).slice(0, 2)) {
        console.log(`    targetUserId: ${t.targetUserId || t.id}`);
        console.log(`    revisionUserId: ${t.revisionUserId}`);
        console.log(`    isCompleted: ${t.isCompleted}`);
      }
    }
  }

  await ctx.dispose();
}

main().catch((e) => console.error(e.message));
