#!/usr/bin/env node
import "dotenv/config";
import { request } from "@playwright/test";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../tests/utils/api/index.js";

const prId = process.argv[2] || "11880";
const baseURL = process.env.API_BASE_URL;

async function main() {
  const ctx = await request.newContext({ baseURL, timeout: 60000 });
  const api = new PerformanceReviewAPI(ctx);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  const { data: rev } = await api.getLastRevision(prId);
  const alias = rev?.alias || String(rev?.id);
  console.log(`PR ${prId}, Revision ${alias}\n`);

  const { data: revUsers } = await api.get(
    `/private/performance-reviews/${prId}/${alias}/revision-users`,
  );
  const items = revUsers?.items || revUsers || [];

  for (const ru of items) {
    const revUserId = ru.id;
    const dir = ru.direction?.receiverType;
    console.log(`\n=== ${dir} (revUserId: ${revUserId}) ===`);
    console.log(`Before: responseId = ${ru.responseId}`);

    // Step 1: POST /answer/page/start to create session
    console.log("\n1. POST /answer/page/start...");
    const { response: startResp, data: startData } = await api.post(
      `/private/performance-reviews/${prId}/${alias}/${revUserId}/answer/page/start`,
      {},
    );
    console.log(`   Status: ${startResp.status()}`);

    if (!startResp.ok()) {
      console.log(`   Error: ${JSON.stringify(startData).substring(0, 100)}`);
      continue;
    }

    const token = startData.nextPageToken;
    const questions = startData.nextPage?.questions || [];
    console.log(`   Got token and ${questions.length} questions`);

    // Generate answers
    const answers = {};
    for (const q of questions) {
      if (q.type === "scale") {
        answers[q.id] = { value: 4 };
      } else if (q.type === "singleSelect") {
        const opts = q.answerOptions || [];
        if (opts.length > 0) answers[q.id] = { selectedIds: [opts[0].id] };
      }
    }

    // Step 2: POST /answer/page/next with token
    console.log("\n2. POST /answer/page/next...");
    const { response: nextResp, data: nextData } = await api.post(
      `/private/performance-reviews/${prId}/${alias}/${revUserId}/answer/page/next?pageToken=${token}`,
      { answers },
    );
    console.log(`   Status: ${nextResp.status()}`);

    if (!nextResp.ok()) {
      console.log(`   Error: ${JSON.stringify(nextData).substring(0, 200)}`);

      // Try POST /answer instead
      console.log("\n3. Trying POST /answer instead...");
      const { response: altResp, data: altData } = await api.post(
        `/private/performance-reviews/${prId}/${alias}/${revUserId}/answer`,
        { answers, isCompleted: true },
      );
      console.log(`   Status: ${altResp.status()}`);
      if (!altResp.ok()) {
        console.log(`   Error: ${JSON.stringify(altData).substring(0, 200)}`);
      }
    }

    // Check result
    const { data: check } = await api.get(
      `/private/performance-reviews/${prId}/${alias}/revision-users`,
    );
    const checkItems = check?.items || check || [];
    const updated = checkItems.find((i) => i.id === revUserId);
    console.log(
      `\nAfter: responseId = ${updated?.responseId}, status = ${updated?.response?.status}`,
    );
  }

  await ctx.dispose();
}

main().catch((e) => console.error(e.message));
