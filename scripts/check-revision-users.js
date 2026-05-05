#!/usr/bin/env node
import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

const prId = process.argv[2] || "11872";
const baseURL = process.env.API_BASE_URL;

const ctx = await request.newContext({ baseURL, timeout: 60000 });
const api = new PerformanceReviewAPI(ctx);
const { email, password } = getCredentials("admin");
await api.signIn(email, password);

const { data: revision } = await api.getLastRevision(prId);
const revisionAlias = revision?.alias || String(revision?.id);

const { data: revUsers } = await api.get(
  `/private/performance-reviews/${prId}/${revisionAlias}/revision-users?limit=100`,
);
const items = revUsers?.items || revUsers || [];

console.log("Revision users for PR", prId);
console.log("Total:", items.length);

for (const ru of items) {
  const userName =
    `${ru.user?.lastName || ""} ${ru.user?.firstName || ""}`.trim();
  const targetName =
    `${ru.targetUser?.lastName || ""} ${ru.targetUser?.firstName || ""}`.trim();
  const direction = ru.direction?.receiverType || "unknown";
  const hasResponse = ru.responseId !== null;
  console.log(
    `  ${ru.id}: ${userName} -> ${targetName} [${direction}] responseId=${ru.responseId}`,
  );
}

await ctx.dispose();
