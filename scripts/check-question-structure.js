#!/usr/bin/env node
import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";

const prId = process.argv[2] || "11880";
const baseURL = process.env.API_BASE_URL;

async function main() {
  const ctx = await request.newContext({ baseURL, timeout: 60000 });
  const api = new PerformanceReviewAPI(ctx);

  await api.signIn("qaadmin@example.org", getTestUserPassword());

  const { data: rev } = await api.getLastRevision(prId);
  const alias = rev?.alias || String(rev?.id);

  const { data: revUsers } = await api.get(
    `/private/performance-reviews/${prId}/${alias}/revision-users`,
  );
  const revUserId = revUsers?.items?.[0]?.id;

  const { data: startData } = await api.post(
    `/private/performance-reviews/${prId}/${alias}/${revUserId}/answer/page/start`,
    {},
  );

  const questions = startData.nextPage?.questions || [];
  const singleSelect = questions.find((q) => q.type === "singleSelect");

  if (singleSelect) {
    console.log("SingleSelect question structure:");
    console.log(JSON.stringify(singleSelect, null, 2));
  } else {
    console.log("No singleSelect question found");
    console.log(
      "All question types:",
      questions.map((q) => q.type),
    );
  }

  await ctx.dispose();
}

main().catch((e) => console.error("Error:", e.message));
