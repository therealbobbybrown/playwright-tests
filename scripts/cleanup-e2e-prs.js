import "dotenv/config";
import { request } from "@playwright/test";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../tests/utils/api/index.js";

(async () => {
  const ctx = await request.newContext({
    baseURL: process.env.API_BASE_URL,
  });
  const prAPI = new PerformanceReviewAPI(ctx);
  const creds = getCredentials("admin");
  await prAPI.signIn(creds.email, creds.password);

  const { data: allData } = await prAPI.get(
    "/manager/performance-reviews/?limit=100&withArchived=true",
  );
  const allItems = allData?.items || [];

  const testPRs = allItems.filter(
    (pr) =>
      pr.title?.includes("E2E_") ||
      pr.title?.includes("Self✓_Manager") ||
      pr.title?.includes("All_Awaiting") ||
      pr.title?.includes("All_Complete") ||
      pr.title?.includes("Colleagues_NotApproved") ||
      pr.title?.includes("v2_") ||
      pr.title?.includes("v3_") ||
      pr.title?.includes("v4_") ||
      pr.title?.includes("v5_") ||
      pr.title?.includes("v6_") ||
      pr.title?.includes("v7_"),
  );

  console.log("Найдено E2E PRs:", testPRs.length);
  for (const pr of testPRs) {
    const archived = pr.archivedAt ? "(АРХИВ)" : "";
    console.log("  ", pr.id, pr.title?.substring(0, 60), archived);
  }

  if (testPRs.length === 0) {
    console.log("✓ Нет E2E PRs для удаления");
    await ctx.dispose();
    return;
  }

  console.log("\nУдаляю...");
  for (const pr of testPRs) {
    try {
      if (!pr.archivedAt) {
        await prAPI.archive(pr.id);
      }
      await prAPI.remove(pr.id);
      console.log("  ✓ Удалён PR", pr.id);
    } catch (e) {
      console.log(
        "  ✗ Не удалось удалить",
        pr.id,
        "-",
        e.message?.substring(0, 50),
      );
    }
  }

  console.log("\n✓ Очистка завершена");
  await ctx.dispose();
})();
