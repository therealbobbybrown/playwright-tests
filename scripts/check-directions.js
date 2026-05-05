#!/usr/bin/env node
import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

const baseURL = process.env.API_BASE_URL;
const prId = process.argv[2] || "11877";

const ctx = await request.newContext({ baseURL, timeout: 60000 });
const api = new PerformanceReviewAPI(ctx);
const { email, password } = getCredentials("admin");
await api.signIn(email, password);

const { data: pr } = await api.getById(prId);
console.log("PR:", prId);
console.log("Directions:");
for (const d of pr?.directions || []) {
  console.log(`  ${d.id}: ${d.receiverType} isSelected=${d.isSelected}`);
}

await ctx.dispose();
