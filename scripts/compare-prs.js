#!/usr/bin/env node
import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

const baseURL = process.env.API_BASE_URL;

async function analyzePR(api, prId) {
  console.log(`\n=== PR ${prId} ===`);

  const { data: pr } = await api.getById(prId);
  console.log("Title:", pr?.title);
  console.log("Status:", pr?.status);
  console.log("WorkflowType:", pr?.workflowType);
  console.log("Created:", pr?.createdAt);

  // Directions
  const directions = pr?.directions || [];
  console.log(
    "Directions:",
    directions
      .map((d) => `${d.receiverType}(isSelected=${d.isSelected})`)
      .join(", "),
  );

  // Revisions
  const { data: revisions } = await api.getRevisions(prId);
  const revList = revisions?.items || [];
  console.log("Revisions count:", revList.length);

  if (revList.length > 0) {
    const lastRev = revList[0];
    console.log("Last revision:", lastRev.id, "stopped:", lastRev.isStopped);
  }

  // Receivers count
  const { data: counts } = await api.getUsersCounts(prId);
  console.log("Target users:", counts?.targetUsersCount);
  console.log("Receivers:", counts?.receiversCount);
}

const ctx = await request.newContext({ baseURL, timeout: 60000 });
const api = new PerformanceReviewAPI(ctx);
const { email, password } = getCredentials("admin");
await api.signIn(email, password);

await analyzePR(api, "11870");
await analyzePR(api, "11872");

await ctx.dispose();
