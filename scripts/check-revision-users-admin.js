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

    const { data: rev } = await api.getLastRevision(prId);
    const alias = rev?.alias || String(rev?.id);
    console.log(`Revision: ${alias}`);

    const { data } = await api.get(
      `/private/performance-reviews/${prId}/${alias}/revision-users?limit=100`,
    );
    const items = data?.items || data || [];
    console.log(`Total revision-users: ${items.length}`);

    // Count by direction
    const byDirection = {};
    for (const item of items) {
      const dir = item.direction?.receiverType || "unknown";
      byDirection[dir] = (byDirection[dir] || 0) + 1;
    }
    console.log("By direction:", byDirection);

    // Check responseId
    const withResponse = items.filter(
      (i) => i.responseId !== null && i.responseId !== undefined,
    );
    console.log(`With responseId: ${withResponse.length}/${items.length}`);
  }

  await ctx.dispose();
}

main().catch((e) => console.error(e.message));
