#!/usr/bin/env node
/**
 * Скрипт для добавления подчинённых менеджера в активный PR
 *
 * Использование:
 *   node scripts/seed-manager-subordinates.js
 *
 * Что делает:
 * 1. Получает ID менеджера (MANAGER_LOGIN)
 * 2. Получает его подчинённых из орг-структуры
 * 3. Добавляет их в активный PR как target users
 */

import "dotenv/config";
import { request } from "@playwright/test";
import { OrgStructureAPI } from "../tests/utils/api/OrgStructureAPI.js";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";

async function main() {
  const baseURL = process.env.API_BASE_URL || process.env.BASE_URL;
  if (!baseURL) {
    console.error("Не задан BASE_URL в .env");
    process.exit(1);
  }

  const requestContext = await request.newContext({ baseURL });

  try {
    // Авторизуемся как админ
    const adminCreds = getCredentials("admin");
    const managerCreds = getCredentials("manager");

    console.log(`\n🔐 Авторизация админа: ${adminCreds.email}`);
    console.log(`👤 Менеджер: ${managerCreds.email}`);

    // API клиенты
    const orgAPI = new OrgStructureAPI(requestContext);
    await orgAPI.signIn(adminCreds.email, adminCreds.password);

    const prAPI = new PerformanceReviewAPI(requestContext);
    await prAPI.signIn(adminCreds.email, adminCreds.password);

    // 1. Найти ID менеджера по email
    console.log("\n📍 Поиск менеджера в орг-структуре...");
    const { data: usersData, response: usersResp } = await orgAPI.findUsers({
      q: managerCreds.email,
      limit: 10,
    });
    console.log("Raw users response:", JSON.stringify(usersData, null, 2));

    // Попробуем также через getUsers
    const { data: allUsers } = await orgAPI.getUsers({
      q: managerCreds.email,
      limit: 10,
    });
    console.log("getUsers response:", JSON.stringify(allUsers, null, 2));

    const users =
      usersData?.items || allUsers?.items || usersData || allUsers || [];

    // Email может быть в account.email или напрямую
    const manager = users.find(
      (u) =>
        u.email === managerCreds.email ||
        u.account?.email === managerCreds.email,
    );
    if (!manager) {
      console.error(`❌ Менеджер ${managerCreds.email} не найден в системе`);
      console.log(
        "Найденные пользователи:",
        users.map((u) => u.account?.email || u.email),
      );
      process.exit(1);
    }

    const managerName =
      manager.fullName ||
      `${manager.firstName || ""} ${manager.lastName || ""}`.trim() ||
      manager.name;
    console.log(`✓ Найден менеджер: ${managerName} (ID: ${manager.id})`);

    // 2. Получить информацию о менеджере из дерева (включая подчинённых)
    console.log("\n📍 Получение подчинённых...");
    const { data: treeInfo } = await orgAPI.getTreeUserInfo(manager.id);
    console.log(
      "Tree info children:",
      JSON.stringify(treeInfo?.children, null, 2),
    );

    // Подчинённые в поле children, каждый имеет entityId
    const childrenIds = (treeInfo?.children || [])
      .map((c) => c.entityId)
      .filter(Boolean);
    console.log(`✓ Найдено подчинённых в дереве: ${childrenIds.length}`);
    console.log(`✓ ID подчинённых: ${childrenIds.join(", ")}`);

    if (childrenIds.length === 0) {
      console.error("❌ У менеджера нет подчинённых в орг-структуре");
      process.exit(1);
    }

    // Получаем имена подчинённых
    const { data: subordinatesData } = await orgAPI.getUsersByIds(childrenIds);
    const subordinates = subordinatesData?.items || subordinatesData || [];
    console.log("Подчинённые:");
    subordinates.forEach((s) => {
      const name = `${s.firstName || ""} ${s.lastName || ""}`.trim();
      console.log(`  - ${name} (ID: ${s.id})`);
    });

    // 3. Создать новый PR с подчинёнными
    console.log("\n📍 Создание нового PR...");

    const prTitle = `Manager Dashboard Test ${Date.now()}`;
    const directions = [
      {
        id: null,
        receiverType: "self",
        isSelected: true,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "head",
        isSelected: true,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "subordinate",
        isSelected: false,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "colleague",
        isSelected: false,
        title: null,
        description: null,
      },
    ];

    const { response: createResp, data: createData } = await prAPI.create({
      title: prTitle,
      directions,
      anonymityType: "anonymous",
      workflowType: "basic",
      notificationsSchedule: {
        enableReminds: false,
        baseDate: new Date().toISOString(),
        repeatType: "everyWorkDay",
        timezoneOffset: new Date().getTimezoneOffset(),
      },
      isApprovalStep: false,
      isAsyncSteps: false,
      isAsyncStepsSelfResponseStep: false,
      minReceiversCount: 1,
      maxReceiversCount: 10,
    });

    if (!createResp.ok()) {
      console.error("❌ Ошибка создания PR:", await createResp.text());
      process.exit(1);
    }

    const newPRId = createData.id;
    console.log(`✓ Создан PR: "${prTitle}" (ID: ${newPRId})`);

    // 4. Добавить подчинённых как target users
    console.log("\n📍 Добавление подчинённых в PR...");

    const targets = childrenIds.map((userId) => ({
      targetType: "user",
      entityId: userId,
    }));

    const { response: addResp, data: addResult } = await prAPI.addTargetUsers(
      newPRId,
      { targets },
    );

    if (!addResp.ok()) {
      console.error("❌ Ошибка добавления:", await addResp.text());
      process.exit(1);
    }
    console.log(`✓ Добавлено ${childrenIds.length} подчинённых`);

    // 5. Привязать анкету к directions
    console.log("\n📍 Привязка анкеты...");
    const { data: assessments } = await prAPI.get(
      "/manager/assessments/?limit=10&status=published",
    );
    const assessmentItems = assessments?.items || assessments || [];

    if (assessmentItems.length === 0) {
      console.error("❌ Нет опубликованных анкет");
      process.exit(1);
    }

    const assessment = assessmentItems[0];
    console.log(
      `✓ Используем анкету: "${assessment.title}" (ID: ${assessment.id})`,
    );

    // Получаем directions созданного PR
    const { data: prData } = await prAPI.getById(newPRId);
    for (const dir of prData.directions || []) {
      if (dir.isSelected) {
        await prAPI.setAssessments(newPRId, {
          directionId: dir.id,
          assessmentsIds: [assessment.id],
        });
        console.log(`✓ Анкета привязана к direction ${dir.receiverType}`);
      }
    }

    // 6. Активировать PR
    console.log("\n📍 Активация PR...");
    const { response: activateResp } = await prAPI.start(newPRId);

    if (!activateResp.ok()) {
      console.error("❌ Ошибка активации:", await activateResp.text());
      process.exit(1);
    }
    console.log(`✅ PR "${prTitle}" активирован!`);

    // 7. Заполнить анкеты (опционально)
    console.log("\n📍 Заполнение анкет...");
    let filled = 0;
    for (let i = 0; i < 10; i++) {
      const { response: fillResp } = await prAPI.populateReview(
        newPRId,
        {
          skipChance: 0,
          commentChance: 0,
          customChance: 0,
          lowerLimit: 60,
          upperLimit: 100,
        },
        { timeout: 60000 },
      );

      if (fillResp.ok()) {
        filled++;
      } else if (fillResp.status() === 500) {
        // Все анкеты заполнены
        break;
      }
    }
    console.log(`✓ Заполнено анкет: ${filled}`);

    console.log(
      "\n✅ Готово! Теперь менеджер видит всех подчинённых на дашборде.",
    );
  } catch (error) {
    console.error("❌ Ошибка:", error.message);
    console.error(error.stack);
  } finally {
    await requestContext.dispose();
  }
}

main();
