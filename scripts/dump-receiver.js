#!/usr/bin/env node
import "dotenv/config";
import { request } from "@playwright/test";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../tests/utils/api/index.js";

const prId = process.argv[2] || "11870";
const baseURL = process.env.API_BASE_URL;

async function main() {
  const ctx = await request.newContext({ baseURL, timeout: 60000 });
  const api = new PerformanceReviewAPI(ctx);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  console.log(`PR ${prId}`);

  const { data: receiversData } = await api.getReceiverUsers(prId, {
    limit: 5,
  });
  const receivers = receiversData?.items || [];

  const first = receivers[0];
  if (first?.directions?.[0]?.targetUsers?.[0]) {
    console.log("\nFirst targetUser object:");
    console.log(JSON.stringify(first.directions[0].targetUsers[0], null, 2));
  }

  await ctx.dispose();
}

main().catch((e) => console.error(e.message));
