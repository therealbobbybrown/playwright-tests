#!/usr/bin/env node
/**
 * Заполнение анкет от имени каждого receiver через private API
 */
import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getTestUserPassword } from "../tests/utils/api/index.js";

const prId = process.argv[2] || "11853";
const PASSWORD = getTestUserPassword();
const baseURL = process.env.API_BASE_URL;

async function fillUserQuestionnaires(userEmail, prId, revisionAlias) {
  const ctx = await request.newContext({ baseURL, timeout: 60000 });
  const api = new PerformanceReviewAPI(ctx);

  try {
    // Авторизуемся под пользователем
    const { response: authResp } = await api.signIn(userEmail, PASSWORD);
    if (!authResp.ok()) {
      await ctx.dispose();
      return { filled: 0, error: `Auth failed: ${authResp.status()}` };
    }

    // Получаем revision-users (анкеты для заполнения этим пользователем)
    const { data, response } = await api.get(
      `/private/performance-reviews/${prId}/${revisionAlias}/revision-users`,
    );

    if (!response.ok()) {
      await ctx.dispose();
      return { filled: 0, error: `Get revision-users: ${response.status()}` };
    }

    const items = data?.items || data || [];
    if (!Array.isArray(items) || items.length === 0) {
      await ctx.dispose();
      return { filled: 0, total: 0 };
    }

    let filled = 0;
    let skipped = 0;

    for (const item of items) {
      const revisionUserId = item.id;
      const status = item.response?.status;

      // Пропускаем уже заполненные
      if (status === "complete") {
        skipped++;
        continue;
      }

      try {
        // Получаем вопросы
        const { data: pageData, response: pageResp } = await api.get(
          `/private/performance-reviews/${prId}/${revisionAlias}/${revisionUserId}/answer/page/start`,
        );

        if (!pageResp.ok()) {
          continue;
        }

        const questions =
          pageData?.questions ||
          pageData?.assessment?.pages?.[0]?.questions ||
          [];
        if (questions.length === 0) {
          continue;
        }

        // Генерируем ответы (оценки 3-5)
        const answers = {};
        for (const q of questions) {
          const qId = q.id || q.questionId || q.temporaryId;
          const score = Math.floor(Math.random() * 3) + 3;
          answers[qId] = { value: score };
        }

        // Отправляем ответы
        const { response: answerResp } = await api.post(
          `/private/performance-reviews/${prId}/${revisionAlias}/${revisionUserId}/answer`,
          { answers, isCompleted: true },
        );

        if (answerResp.ok()) {
          filled++;
        }
      } catch (e) {
        // Пропускаем ошибки отдельных анкет
      }
    }

    await ctx.dispose();
    return { filled, skipped, total: items.length };
  } catch (e) {
    await ctx.dispose();
    return { filled: 0, error: e.message };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log(`Заполнение анкет для PR ${prId}`);
  console.log("=".repeat(60));

  // Получаем данные как admin
  const ctx = await request.newContext({ baseURL, timeout: 60000 });
  const api = new PerformanceReviewAPI(ctx);

  const adminEmail = process.env.ADMIN_EMAIL || "qaadmin@example.org";
  await api.signIn(adminEmail, PASSWORD);

  // Получаем revision alias
  const { data: revision } = await api.getLastRevision(prId);
  const revisionAlias = revision?.alias || String(revision?.id);
  console.log(`Revision: ${revisionAlias}\n`);

  // Получаем receivers
  const { data: receiversData } = await api.getReceiverUsers(prId, {
    limit: 100,
  });
  const receivers = receiversData?.items || [];
  console.log(`Receivers: ${receivers.length}`);

  // Собираем уникальные email
  const userEmails = new Map();
  for (const r of receivers) {
    const email = r.user?.account?.email;
    const name = `${r.user?.firstName || ""} ${r.user?.lastName || ""}`.trim();
    if (email && !userEmails.has(email)) {
      userEmails.set(email, name);
    }
  }

  await ctx.dispose();

  console.log(`Уникальных пользователей: ${userEmails.size}\n`);

  // Заполняем анкеты от имени каждого пользователя
  let totalFilled = 0;

  for (const [email, name] of userEmails) {
    process.stdout.write(`${name}: `);
    const result = await fillUserQuestionnaires(email, prId, revisionAlias);

    if (result.error) {
      console.log(`⚠️ ${result.error}`);
    } else if (result.filled > 0) {
      console.log(`✓ заполнено ${result.filled}/${result.total}`);
      totalFilled += result.filled;
    } else if (result.skipped > 0) {
      console.log(`- все ${result.skipped} уже заполнены`);
    } else {
      console.log("- нет анкет");
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Итого заполнено: ${totalFilled} анкет`);
  console.log("=".repeat(60));

  // Финальная проверка
  const ctx2 = await request.newContext({ baseURL, timeout: 60000 });
  const api2 = new PerformanceReviewAPI(ctx2);
  await api2.signIn(adminEmail, PASSWORD);

  const { data: counts } = await api2.getUsersCounts(prId);
  console.log(`\nTarget users: ${counts?.targetUsersCount}`);
  console.log(`Receivers: ${counts?.receiversCount}`);

  // Проверяем заполненность через revision-users
  const { data: revUsers } = await api2.get(
    `/private/performance-reviews/${prId}/${revisionAlias}/revision-users?limit=100`,
  );
  const allRevUsers = revUsers?.items || revUsers || [];
  const completed = allRevUsers.filter(
    (r) => r.response?.status === "complete",
  ).length;
  console.log(`Анкет заполнено: ${completed}/${allRevUsers.length}`);

  await ctx2.dispose();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
