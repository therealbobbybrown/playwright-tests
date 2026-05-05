import "dotenv/config";
import { request } from "@playwright/test";
import { AssessmentsAPI } from "../tests/utils/api/AssessmentsAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

const baseURL = process.env.API_BASE_URL;

async function main() {
  const ctx = await request.newContext({ baseURL });
  const api = new AssessmentsAPI(ctx);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  // Get list of all assessments
  const { data: list } = await api.getAssessments({ limit: 50 });

  // Collect all question types
  const types = new Set();
  const sampleQuestions = {};

  for (const a of list?.items || []) {
    const { data: full } = await api.getAssessment(a.id);
    const questions = full?.pages?.flatMap((p) => p.questions || []) || [];
    for (const q of questions) {
      if (!types.has(q.type)) {
        types.add(q.type);
        sampleQuestions[q.type] = q;
      }
    }
  }

  console.log("Question types found:", [...types]);
  for (const [type, q] of Object.entries(sampleQuestions)) {
    console.log("\n=== Type:", type, "===");
    console.log(JSON.stringify(q, null, 2).substring(0, 1500));
  }

  await ctx.dispose();
}

main().catch(console.error);
