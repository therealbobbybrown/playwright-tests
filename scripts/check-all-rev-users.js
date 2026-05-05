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
console.log("Revision alias:", revisionAlias);

// Получаем ВСЕ revision users через manager API
const { data: revUsers, response } = await api.get(
  `/manager/performance-reviews/${prId}/${revisionAlias}/revision-users?limit=200`,
);
console.log("Response status:", response.status());

const items = revUsers?.items || (Array.isArray(revUsers) ? revUsers : []);
console.log("Total revision users:", items.length);

for (const ru of items) {
  const userName =
    `${ru.user?.firstName || ""} ${ru.user?.lastName || ""}`.trim();
  const userEmail = ru.user?.account?.email || "no-email";
  const targetName =
    `${ru.targetUser?.firstName || ""} ${ru.targetUser?.lastName || ""}`.trim();
  const direction = ru.direction?.receiverType || "unknown";
  console.log(
    `  ${ru.id}: ${userName} (${userEmail}) -> ${targetName} [${direction}] responseId=${ru.responseId}`,
  );
}

await ctx.dispose();
