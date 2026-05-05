#!/usr/bin/env node
/**
 * Ручное заполнение незаполненных анкет через private API
 */
import "dotenv/config";
import { request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

const prId = process.argv[2] || "11848";

async function main() {
  const baseURL = process.env.API_BASE_URL;
  const ctx = await request.newContext({ baseURL, timeout: 60000 });
  const api = new PerformanceReviewAPI(ctx);

  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);
  console.log("PR ID:", prId);

  // Получаем ревизию
  const { data: revision } = await api.getLastRevision(prId);
  const revisionAlias = revision?.alias || String(revision?.id);
  console.log("Revision:", revisionAlias);

  // Получаем receiver users
  const { data: receiversData } = await api.getReceiverUsers(prId, {
    limit: 100,
  });
  const receivers = receiversData?.items || [];
  console.log("Receivers:", receivers.length);

  // Проверяем незаполненные анкеты
  let unfilled = [];
  for (const r of receivers) {
    for (const d of r.directions || []) {
      for (const t of d.targetUsers || []) {
        if (!t.isCompleted) {
          unfilled.push({
            receiverId: r.user?.id,
            receiverName: `${r.user?.firstName} ${r.user?.lastName}`,
            targetUserId: t.targetUserId,
            revisionUserId: t.revisionUserId,
          });
        }
      }
    }
  }

  console.log(`\nНезаполненных анкет: ${unfilled.length}`);

  // Заполняем каждую незаполненную анкету
  for (const item of unfilled) {
    console.log(
      `\nЗаполняем: ${item.receiverName} → target ${item.targetUserId}`,
    );
    console.log(`  revisionUserId: ${item.revisionUserId}`);

    if (!item.revisionUserId) {
      console.log("  ⚠️ Нет revisionUserId, пропускаем");
      continue;
    }

    try {
      // Получаем вопросы для этой анкеты
      const { data: pageData, response: pageResp } = await api.get(
        `/private/performance-reviews/${prId}/${revisionAlias}/${item.revisionUserId}/answer/page/start`,
      );

      if (!pageResp.ok()) {
        console.log(`  ⚠️ Ошибка получения вопросов: ${pageResp.status()}`);
        continue;
      }

      const questions =
        pageData?.questions ||
        pageData?.assessment?.pages?.[0]?.questions ||
        [];
      console.log(`  Вопросов: ${questions.length}`);

      if (questions.length === 0) {
        console.log("  ⚠️ Нет вопросов");
        continue;
      }

      // Генерируем ответы
      const answers = {};
      for (const q of questions) {
        const qId = q.id || q.questionId;
        // Случайная оценка 3-5
        const score = Math.floor(Math.random() * 3) + 3;
        answers[qId] = { value: score };
      }

      // Отправляем ответы
      const { response: answerResp } = await api.post(
        `/private/performance-reviews/${prId}/${revisionAlias}/${item.revisionUserId}/answer`,
        { answers, isCompleted: true },
      );

      if (answerResp.ok()) {
        console.log("  ✓ Заполнено");
      } else {
        const errorText = await answerResp.text();
        console.log(`  ⚠️ Ошибка: ${answerResp.status()} - ${errorText}`);
      }
    } catch (e) {
      console.log(`  ⚠️ Ошибка: ${e.message}`);
    }
  }

  // Итоговая проверка
  console.log("\n=== ИТОГ ===");
  const { data: receiversData2 } = await api.getReceiverUsers(prId, {
    limit: 100,
  });
  const receivers2 = receiversData2?.items || [];

  let completed = 0;
  let total = 0;
  for (const r of receivers2) {
    for (const d of r.directions || []) {
      for (const t of d.targetUsers || []) {
        total++;
        if (t.isCompleted) completed++;
      }
    }
  }
  console.log(`Анкет: ${completed}/${total} заполнено`);

  await ctx.dispose();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
