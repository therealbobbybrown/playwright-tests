#!/usr/bin/env node
/**
 * Проверка настроек направлений PR
 */
import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

const prId = process.argv[2] || "11888";
const baseURL = process.env.API_BASE_URL;

async function main() {
  const ctx = await request.newContext({ baseURL, timeout: 60000 });
  const api = new PerformanceReviewAPI(ctx);

  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);
  console.log("Авторизация как admin");
  console.log("PR:", prId);

  // Получаем данные PR
  const { data: pr } = await api.getById(prId);
  console.log("\n=== PR Info ===");
  console.log("Title:", pr?.title);
  console.log("Status:", pr?.status);
  console.log("Stage:", pr?.stage);

  // Получаем направления
  console.log("\n=== Directions ===");
  const directions = pr?.directions || [];
  console.log("Всего:", directions.length);
  for (const dir of directions) {
    console.log(
      `  - ID: ${dir.id}, Type: ${dir.receiverType || dir.type}, Title: ${dir.title}`,
    );
  }

  // Получаем target users
  console.log("\n=== Target Users ===");
  const { data: targetUsersData } = await api.getTargetUsers(prId, {
    limit: 100,
  });
  const targetUsers = targetUsersData?.items || [];
  console.log("Всего:", targetUsers.length);
  for (const tu of targetUsers.slice(0, 5)) {
    const name = tu.user?.lastName || tu.userId;
    console.log(`  - ${name} (ID: ${tu.id})`);

    // Получаем receivers для target user
    const receiversByDir = tu.receiverUsersByDirection || {};
    for (const [dirId, receivers] of Object.entries(receiversByDir)) {
      const dir = directions.find((d) => String(d.id) === String(dirId));
      const dirType = dir?.receiverType || dir?.type || dirId;
      const receiverNames = receivers
        .map((r) => r.user?.lastName || r.userId)
        .join(", ");
      console.log(
        `      ${dirType}: ${receivers.length} receivers (${receiverNames})`,
      );
    }
  }

  // Получаем receiver users
  console.log("\n=== Receiver Users ===");
  const { data: receiversData } = await api.getReceiverUsers(prId, {
    limit: 100,
  });
  const receivers = receiversData?.items || [];
  console.log("Всего:", receivers.length);
  for (const r of receivers.slice(0, 5)) {
    const name = r.user?.lastName || r.userId;
    const email = r.user?.account?.email;
    console.log(`  - ${name} (${email}), ID: ${r.id}`);
  }

  // Получаем revision alias
  const { data: revision } = await api.getLastRevision(prId);
  const revisionAlias = revision?.alias || String(revision?.id);
  console.log("\n=== Revision ===");
  console.log("Alias:", revisionAlias);

  // Получаем ВСЕ revision-users через разные endpoints
  console.log("\n=== Revision Users (admin view) ===");
  const { data: revUsersData } = await api.get(
    `/private/performance-reviews/${prId}/${revisionAlias}/revision-users?limit=100`,
  );
  const revUsers = revUsersData?.items || revUsersData || [];
  console.log("Всего:", revUsers.length);
  for (const ru of revUsers) {
    const target = ru.targetUser?.lastName || ru.targetUserId;
    const receiver =
      ru.receiverUser?.lastName || ru.receiverUser?.account?.email || "self";
    const dir =
      ru.direction?.receiverType || ru.direction?.title || ru.directionId;
    const status = ru.response?.status || "NO_RESPONSE";
    const respId = ru.response?.id || "null";
    console.log(
      `  - Target: ${target}, Receiver: ${receiver}, Dir: ${dir}, Status: ${status}, RespId: ${respId}`,
    );
  }

  await ctx.dispose();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
