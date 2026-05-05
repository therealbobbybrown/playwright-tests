#!/usr/bin/env node
import { chromium, request } from "@playwright/test";
import { PerformanceReviewAPI } from "../tests/utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../tests/utils/api/index.js";
import "dotenv/config";

const baseURL = process.env.BASE_URL;
const apiURL = process.env.API_BASE_URL;

// Создаём PR через API
const ctx = await request.newContext({ baseURL: apiURL, timeout: 60000 });
const api = new PerformanceReviewAPI(ctx);
const { email, password } = getCredentials("admin");
await api.signIn(email, password);

// Создаём PR
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

const { response: createResp, data: pr } = await api.create({
  title: `E2E_Трассировка ревью_${Date.now()}`,
  directions,
  anonymityType: "notAnonymous",
  workflowType: "basic",
  notificationsSchedule: {
    enableReminds: false,
    baseDate: new Date().toISOString(),
    repeatType: "everyWorkDay",
    timezoneOffset: 0,
  },
  isApprovalStep: false,
  isAsyncSteps: false,
  isAsyncStepsSelfResponseStep: false,
  minReceiversCount: 1,
  maxReceiversCount: 10,
});
console.log("Create status:", createResp.status());
const prId = pr?.id;
console.log("Created PR:", prId);

if (!prId) {
  console.log("Error:", JSON.stringify(pr));
  process.exit(1);
}

// Добавляем target user
const { data: users } = await api.get("/manager/users?limit=5");
const targetUserId = users?.items?.[0]?.id;
await api.addTargetUsers(prId, {
  targets: [{ targetType: "user", entityId: targetUserId }],
});

// Добавляем анкету
const { data: prData } = await api.getById(prId);
const { data: assessments } = await api.get("/manager/assessments?limit=5");
const assessmentId = assessments?.items?.[0]?.id;

for (const dir of prData.directions) {
  if (dir.isSelected && dir.id) {
    await api.setAssessments(prId, {
      directionId: dir.id,
      assessmentsIds: [assessmentId],
    });
  }
}
console.log("Setup complete");

await ctx.dispose();

// Запускаем браузер и отслеживаем запросы
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Отслеживаем API запросы
page.on("request", (req) => {
  const url = req.url();
  if (
    url.includes("/api/") &&
    (req.method() === "POST" || req.method() === "PATCH")
  ) {
    console.log(`>> ${req.method()} ${new URL(url).pathname}`);
  }
});

page.on("response", (res) => {
  const url = res.url();
  if (
    url.includes("/api/") &&
    (res.request().method() === "POST" || res.request().method() === "PATCH")
  ) {
    console.log(`<< ${res.status()} ${new URL(url).pathname}`);
  }
});

// Логинимся
await page.goto(`${baseURL}/ru/auth/sign-in`);
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL("**/ru/**", { timeout: 30000 });
console.log("Logged in");

// Переходим на PR
await page.goto(`${baseURL}/ru/manager/performance-reviews/${prId}/`);
await page.waitForLoadState("networkidle");
console.log("Opened PR page");

// Ищем и кликаем "Запустить"
const launchButton = page
  .locator("button")
  .filter({ hasText: /^запустить$/i })
  .first();
if (await launchButton.isVisible({ timeout: 5000 })) {
  console.log('\n=== Clicking "Запустить" ===');
  await launchButton.click();
  await page.waitForTimeout(3000);
}

// Ищем модальное окно и кликаем "Да, отправить"
const confirmButton = page
  .locator("button")
  .filter({ hasText: /^да, отправить$/i })
  .first();
if (await confirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
  console.log('\n=== Clicking "Да, отправить" ===');
  await confirmButton.click();
  await page.waitForTimeout(5000);
}

await browser.close();
console.log("\nDone. PR ID:", prId);
