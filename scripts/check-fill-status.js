#!/usr/bin/env node
import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

const prId = "11872";
const baseURL = process.env.API_BASE_URL;

const ctx = await request.newContext({ baseURL, timeout: 60000 });
const api = new PerformanceReviewAPI(ctx);
const { email, password } = getCredentials("admin");
await api.signIn(email, password);

// Счётчики
const { data: counts } = await api.getUsersCounts(prId);
console.log("Counts:", JSON.stringify(counts, null, 2));

// Статус PR
const { data: pr } = await api.getById(prId);
console.log("\nPR Status:", pr?.status);

// Target users статус
const { data: targets } = await api.getTargetUsers(prId);
const targetItems = targets?.items || [];
console.log("\nTarget users:", targetItems.length);
for (const t of targetItems) {
  const name =
    `${t.targetUser?.firstName || ""} ${t.targetUser?.lastName || ""}`.trim();
  console.log(`  ${name}: progress=?`);
}

await ctx.dispose();
