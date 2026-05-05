#!/usr/bin/env node
import "dotenv/config";
import { request } from "@playwright/test";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../tests/utils/api/index.js";

const prId = "11880";
const baseURL = process.env.API_BASE_URL;

async function main() {
  // First as admin, find candidate user details
  const ctx = await request.newContext({ baseURL, timeout: 60000 });
  const api = new PerformanceReviewAPI(ctx);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  // Get target users
  const { data: targetUsersData } = await api.getTargetUsers(prId, {
    limit: 50,
  });
  const targets = targetUsersData?.items || targetUsersData || [];

  console.log("Target users:");
  for (const t of targets) {
    const user = t.user || t;
    console.log(
      `  ID: ${user.id}, Name: ${user.firstName} ${user.lastName}, Email: ${user.account?.email}`,
    );
  }

  // Check candidate specifically
  const candidate = targets.find(
    (t) => (t.user?.lastName || t.lastName) === "Кандидатов",
  );
  if (candidate) {
    const user = candidate.user || candidate;
    console.log("\nCandidate details:");
    console.log(JSON.stringify(user, null, 2));

    // Try to login as candidate
    const candidateEmail = user.account?.email;
    if (candidateEmail) {
      console.log(`\nTrying to login as: ${candidateEmail}`);
      const ctx2 = await request.newContext({ baseURL, timeout: 60000 });
      const api2 = new PerformanceReviewAPI(ctx2);
      const { response } = await api2.signIn(
        candidateEmail,
        getTestUserPassword(),
      );
      console.log(`Login status: ${response.status()}`);
      await ctx2.dispose();
    }
  }

  await ctx.dispose();
}

main().catch((e) => console.error(e.message));
