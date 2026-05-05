// scripts/explore-dashboard-prs.js
// Скрипт для исследования доступных PR и их статусов на дашборде

import dotenv from "dotenv";
dotenv.config();

import { request } from "@playwright/test";
import { DashboardTeamAPI } from "../tests/utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../tests/utils/credentials.js";

// Маппинг типов направлений
const DIRECTION_TYPES = {
  self: "Самооценка",
  manager: "Оценка руководителя",
  colleague: "Оценка коллег",
  subordinate: "Оценка подчинённых",
};

// Маппинг статусов
const STATUS_MAP = {
  complete: "✅ Пройдена",
  awaiting: "⏳ В ожидании",
  in_progress: "🔄 В процессе",
  not_started: "⬜ Не начата",
  nomination_awaiting: "📝 Ждёт утверждения коллег",
  nomination_not_started: "❌ Коллеги не предложены",
};

async function exploreDashboardPRs() {
  const context = await request.newContext({
    baseURL: process.env.BASE_URL,
  });

  const api = new DashboardTeamAPI(context);
  const { email, password } = getCredentials("manager");

  console.log("🔐 Авторизация как manager...");
  await api.signIn(email, password);

  console.log("\n📋 Получение списка PR для дашборда...\n");
  const { data: prs } = await api.getDashboardFiltersPRs();

  const prList = prs?.items || prs || [];
  console.log(`Найдено PR: ${prList.length}\n`);

  // Сводка для тестов
  const summary = [];

  // Собираем информацию о каждом PR
  for (const pr of prList) {
    const prId = pr.id;
    const prTitle = pr.title || pr.name || `PR ${prId}`;

    console.log(`\n${"═".repeat(70)}`);
    console.log(`📊 ${prTitle}`);
    console.log(`   ID: ${prId}`);
    console.log(`${"═".repeat(70)}`);

    const prSummary = {
      id: prId,
      title: prTitle,
      directions: [],
      statuses: {},
      users: [],
    };

    try {
      // Получаем target users (подчинённых)
      const { data: targetUsers } =
        await api.getDashboardFiltersTargetUsers(prId);
      const users = targetUsers?.items || targetUsers || [];
      console.log(`   Оцениваемых: ${users.length}`);

      if (users.length > 0) {
        // Выводим имена пользователей
        for (const u of users) {
          const name = u.name || u.fullName || `User ${u.id}`;
          console.log(`     - ${name}`);
          prSummary.users.push({ id: u.id, name });
        }

        // Получаем ревизии
        const { data: revisions } =
          await api.getDashboardFiltersRevisions(prId);
        const revList = revisions?.items || revisions || [];
        const latestRevision = revList[0];

        if (latestRevision) {
          // Получаем прогрессы
          const userIds = users.map((u) => u.id || u.userId);
          const { data: progressData } = await api.getDashboardProgresses(
            prId,
            {
              revisionId: latestRevision.id,
              targetUsersIds: userIds,
            },
          );

          const progresses = progressData?.progresses || [];
          const directions = progressData?.directions || [];

          // Маппинг направлений
          const directionMap = {};
          for (const dir of directions) {
            directionMap[dir.id] = dir;
            prSummary.directions.push({
              id: dir.id,
              type: dir.receiverType,
              title: DIRECTION_TYPES[dir.receiverType] || dir.receiverType,
            });
          }

          console.log(`\n   📈 Направления оценки:`);
          for (const dir of directions) {
            console.log(
              `     - ${DIRECTION_TYPES[dir.receiverType] || dir.receiverType} (ID: ${dir.id})`,
            );
          }

          console.log(`\n   📊 Статусы по подчинённым:`);
          for (const progress of progresses) {
            const user = users.find(
              (u) => u.id === progress.userId || u.userId === progress.userId,
            );
            const userName =
              user?.name || user?.fullName || `User ${progress.userId}`;

            console.log(`\n     👤 ${userName} (ID: ${progress.userId})`);

            const respondentsDirections = progress.respondentsDirections || {};

            for (const [dirId, dirData] of Object.entries(
              respondentsDirections,
            )) {
              const direction = directionMap[dirId];
              const dirType = direction?.receiverType || "unknown";
              const dirName = DIRECTION_TYPES[dirType] || dirType;
              const status = dirData.status || "unknown";
              const statusText = STATUS_MAP[status] || status;

              console.log(`        ${dirName}: ${statusText}`);

              // Сохраняем статусы для сводки
              if (!prSummary.statuses[dirType]) {
                prSummary.statuses[dirType] = [];
              }
              prSummary.statuses[dirType].push({
                userId: progress.userId,
                userName,
                status,
              });

              // Респонденты
              if (dirData.respondents && dirData.respondents.length > 0) {
                for (const resp of dirData.respondents) {
                  const respStatus = STATUS_MAP[resp.status] || resp.status;
                  console.log(
                    `          └─ Респондент ${resp.userId}: ${respStatus}`,
                  );
                }
              }
            }
          }
        }
      }

      summary.push(prSummary);

      // Небольшая пауза между запросами
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.log(`   ⚠️ Ошибка: ${err.message}`);
    }
  }

  // Выводим сводку для тестов
  console.log(`\n\n${"═".repeat(70)}`);
  console.log("📋 СВОДКА ДЛЯ ТЕСТОВ");
  console.log(`${"═".repeat(70)}`);

  console.log("\n🔍 PR с разными статусами:\n");

  // Группируем по статусам
  const byStatus = {
    complete: [],
    awaiting: [],
    in_progress: [],
  };

  for (const pr of summary) {
    for (const [dirType, statuses] of Object.entries(pr.statuses)) {
      for (const s of statuses) {
        if (!byStatus[s.status]) byStatus[s.status] = [];
        byStatus[s.status].push({
          prId: pr.id,
          prTitle: pr.title,
          dirType,
          userName: s.userName,
        });
      }
    }
  }

  for (const [status, items] of Object.entries(byStatus)) {
    if (items.length > 0) {
      console.log(`\n${STATUS_MAP[status] || status}:`);
      for (const item of items) {
        console.log(
          `  - PR "${item.prTitle}" (${item.prId}): ${DIRECTION_TYPES[item.dirType] || item.dirType} - ${item.userName}`,
        );
      }
    }
  }

  console.log(`\n\n${"═".repeat(70)}`);
  console.log("✅ Исследование завершено");

  // Выводим JSON для использования в тестах
  console.log("\n📁 JSON для тестов:");
  console.log(
    JSON.stringify(
      summary.map((s) => ({
        id: s.id,
        title: s.title,
        directions: s.directions.map((d) => d.type),
        statuses: Object.fromEntries(
          Object.entries(s.statuses).map(([k, v]) => [
            k,
            v.map((x) => x.status),
          ]),
        ),
      })),
      null,
      2,
    ),
  );

  await context.dispose();
}

exploreDashboardPRs().catch(console.error);
