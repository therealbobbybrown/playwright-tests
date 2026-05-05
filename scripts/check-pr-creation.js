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

    const { data: pr } = await api.getById(prId);
    console.log("Title:", pr?.title);
    console.log("Created:", pr?.createdAt);
    console.log("Status:", pr?.status);
    console.log("workflowType:", pr?.workflowType);
    console.log("anonymityType:", pr?.anonymityType);
    console.log("isAsyncSteps:", pr?.isAsyncSteps);
    console.log(
      "isAsyncStepsSelfResponseStep:",
      pr?.isAsyncStepsSelfResponseStep,
    );
    console.log("isApprovalStep:", pr?.isApprovalStep);

    // Check revision details
    const { data: revs } = await api.getRevisions(prId);
    const revList = revs?.items || [];
    console.log("\nRevisions:", revList.length);
    for (const r of revList) {
      console.log(
        `  - ID: ${r.id}, started: ${r.startedAt}, stopped: ${r.isStopped}`,
      );
    }
  }

  await ctx.dispose();
}

main().catch((e) => console.error(e.message));
