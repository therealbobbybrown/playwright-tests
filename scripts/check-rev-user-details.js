#!/usr/bin/env node
import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

const prId = process.argv[2] || "11872";
const userEmail = process.argv[3] || "qaadmin+acc+2@example.org";
const baseURL = process.env.API_BASE_URL;

const ctx = await request.newContext({ baseURL, timeout: 60000 });
const api = new PerformanceReviewAPI(ctx);
await api.signIn(userEmail, getTestUserPassword());

const { data: revision } = await api.getLastRevision(prId);
const revisionAlias = revision?.alias || String(revision?.id);
console.log("Revision alias:", revisionAlias);

const { data: revUsers, response } = await api.get(
  `/private/performance-reviews/${prId}/${revisionAlias}/revision-users?limit=100`,
);
console.log("Response status:", response.status());
console.log("Data structure:", Object.keys(revUsers || {}));

const items = revUsers?.items || (Array.isArray(revUsers) ? revUsers : []);
console.log("Items count:", items.length);

for (const ru of items) {
  const targetName =
    `${ru.targetUser?.firstName || ""} ${ru.targetUser?.lastName || ""}`.trim();
  const direction = ru.direction?.receiverType || "unknown";
  console.log(
    `  ${ru.id}: -> ${targetName} [${direction}] responseId=${ru.responseId}`,
  );
}

await ctx.dispose();
