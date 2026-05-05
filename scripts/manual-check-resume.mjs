import dotenv from "dotenv";
dotenv.config();
import { createHash } from "crypto";

const apiHost = process.env.API_BASE_URL;
const email = process.env.ADMIN_LOGIN;
const password = process.env.ADMIN_PASSWORD;
const fingerPrint = createHash("md5").update(Date.now().toString()).digest("hex");

// Auth
const loginResp = await fetch(apiHost + "/auth/account/signin", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, fingerPrint, permissions: [] }),
});
const loginData = await loginResp.json();
const token = loginData.accessToken;
if (!token) {
  console.log("Auth FAIL:", JSON.stringify(loginData));
  process.exit(1);
}
console.log("Auth: OK");
const h = {
  "Content-Type": "application/json",
  Authorization: "Bearer " + token,
};

// === ПРОВЕРКА 1: Sync PR ===
console.log("\n=== ПРОВЕРКА 1: Sync PR — напоминания после resume ===");

const cr = await fetch(apiHost + "/manager/performance-reviews/", {
  method: "POST",
  headers: h,
  body: JSON.stringify({
    title: "E2E_Ручная проверка (синхр) " + Date.now(),
    directions: [
      { id: null, receiverType: "self", isSelected: true, title: null, description: null },
      { id: null, receiverType: "head", isSelected: true, title: null, description: null },
      { id: null, receiverType: "subordinate", isSelected: false, title: null, description: null },
      { id: null, receiverType: "colleague", isSelected: false, title: null, description: null },
    ],
    anonymityType: "anonymous",
    workflowType: "basic",
    notificationsSchedule: {
      enableReminds: true,
      baseDate: new Date().toISOString(),
      repeatType: "everyWorkDay",
      timezoneOffset: new Date().getTimezoneOffset(),
    },
    isApprovalStep: false,
    isAsyncSteps: false,
    isAsyncStepsSelfResponseStep: false,
    minReceiversCount: 1,
    maxReceiversCount: 10,
  }),
});
const prData = await cr.json();
const prId = prData.id;
console.log("PR created:", prId);

// Users + targets
const ur = await fetch(apiHost + "/manager/users/?limit=100&category=active", {
  headers: h,
});
const ud = await ur.json();
const uids = (ud.items || []).slice(0, 2).map((u) => u.id);
await fetch(
  apiHost + "/manager/performance-reviews/" + prId + "/target-users/",
  {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      targets: uids.map((id) => ({ targetType: "user", entityId: id })),
    }),
  },
);

// Assessments
const ar = await fetch(apiHost + "/manager/assessments/?limit=50", {
  headers: h,
});
const ad = await ar.json();
const aid = (ad.items || ad)[0].id;
const pg = await fetch(
  apiHost + "/manager/performance-reviews/" + prId + "/",
  { headers: h },
);
const pi = await pg.json();
for (const d of pi.directions || []) {
  if (d.isSelected) {
    await fetch(
      apiHost +
        "/manager/performance-reviews/" +
        prId +
        "/directions/" +
        d.id +
        "/assessments/",
      {
        method: "POST",
        headers: h,
        body: JSON.stringify({ assessmentId: aid }),
      },
    );
  }
}

// Start
const sr = await fetch(
  apiHost + "/manager/performance-reviews/" + prId + "/start/",
  { method: "POST", headers: h },
);
console.log("Start:", sr.status);

// Revision
const rr = await fetch(
  apiHost + "/manager/performance-reviews/" + prId + "/revisions/last/",
  { headers: h },
);
const rd = await rr.json();
const revId = rd.id;
console.log("RevisionId:", revId);

// Create reminder
const rmr = await fetch(apiHost + "/manager/performance-review-reminds", {
  method: "POST",
  headers: h,
  body: JSON.stringify({
    revisionId: revId,
    title: "Scheduled reminder",
    body: "Fill please",
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    type: "revision",
  }),
});
const rmd = await rmr.json();
console.log("Reminder created:", rmd.id);

// List before
const lb = await fetch(
  apiHost +
    "/manager/performance-review-reminds?revisionId=" +
    revId +
    "&limit=50",
  { headers: h },
);
const lbd = await lb.json();
const lbi = lbd.items || lbd || [];
console.log("Reminders BEFORE:", lbi.length);

const pb = await fetch(
  apiHost + "/manager/performance-reviews/" + prId + "/",
  { headers: h },
);
const pbd = await pb.json();
console.log("enableReminds BEFORE:", pbd.notificationsSchedule?.enableReminds);

// Stop
await fetch(
  apiHost + "/manager/performance-reviews/" + prId + "/stop/",
  { method: "POST", headers: h },
);
console.log("Stopped");

// Resume
const res = await fetch(
  apiHost + "/manager/performance-reviews/" + prId + "/resume/",
  { method: "POST", headers: h },
);
console.log("Resume:", res.status);

// List after
const la = await fetch(
  apiHost +
    "/manager/performance-review-reminds?revisionId=" +
    revId +
    "&limit=50",
  { headers: h },
);
const lad = await la.json();
const lai = lad.items || lad || [];

const pa = await fetch(
  apiHost + "/manager/performance-reviews/" + prId + "/",
  { headers: h },
);
const pad = await pa.json();

console.log("\nReminds AFTER resume:", lai.length);
console.log("enableReminds AFTER:", pad.notificationsSchedule?.enableReminds);
console.log("Status:", pad.status);
const pass1 =
  lai.length === 0 && pad.notificationsSchedule?.enableReminds === false;
console.log("RESULT #1:", pass1 ? "PASS" : "FAIL");

// === ПРОВЕРКА 2: Async PR ===
console.log("\n=== ПРОВЕРКА 2: Async PR — напоминания после resume ===");

const cr2 = await fetch(apiHost + "/manager/performance-reviews/", {
  method: "POST",
  headers: h,
  body: JSON.stringify({
    title: "E2E_Ручная проверка (асинхр) " + Date.now(),
    directions: [
      { id: null, receiverType: "self", isSelected: true, title: null, description: null },
      { id: null, receiverType: "head", isSelected: true, title: null, description: null },
      { id: null, receiverType: "subordinate", isSelected: false, title: null, description: null },
      { id: null, receiverType: "colleague", isSelected: false, title: null, description: null },
    ],
    anonymityType: "anonymous",
    workflowType: "basic",
    notificationsSchedule: {
      enableReminds: true,
      baseDate: new Date().toISOString(),
      repeatType: "everyWorkDay",
      timezoneOffset: new Date().getTimezoneOffset(),
    },
    isApprovalStep: false,
    isAsyncSteps: true,
    isAsyncStepsSelfResponseStep: true,
    minReceiversCount: 1,
    maxReceiversCount: 10,
  }),
});
const prData2 = await cr2.json();
const prId2 = prData2.id;
console.log("Async PR created:", prId2);

// Same setup
await fetch(
  apiHost + "/manager/performance-reviews/" + prId2 + "/target-users/",
  {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      targets: uids.map((id) => ({ targetType: "user", entityId: id })),
    }),
  },
);

const pg2 = await fetch(
  apiHost + "/manager/performance-reviews/" + prId2 + "/",
  { headers: h },
);
const pi2 = await pg2.json();
for (const d of pi2.directions || []) {
  if (d.isSelected) {
    await fetch(
      apiHost +
        "/manager/performance-reviews/" +
        prId2 +
        "/directions/" +
        d.id +
        "/assessments/",
      {
        method: "POST",
        headers: h,
        body: JSON.stringify({ assessmentId: aid }),
      },
    );
  }
}

const sr2 = await fetch(
  apiHost + "/manager/performance-reviews/" + prId2 + "/start/",
  { method: "POST", headers: h },
);
console.log("Start:", sr2.status);

const rr2 = await fetch(
  apiHost + "/manager/performance-reviews/" + prId2 + "/revisions/last/",
  { headers: h },
);
const rd2 = await rr2.json();
const revId2 = rd2.id;

// Create reminder
const rmr2 = await fetch(apiHost + "/manager/performance-review-reminds", {
  method: "POST",
  headers: h,
  body: JSON.stringify({
    revisionId: revId2,
    title: "Async reminder",
    body: "Fill please",
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    type: "revision",
  }),
});
const rmd2 = await rmr2.json();
console.log("Reminder:", rmd2.id);

// Verify before
const lb2 = await fetch(
  apiHost +
    "/manager/performance-review-reminds?revisionId=" +
    revId2 +
    "&limit=50",
  { headers: h },
);
const lbd2 = await lb2.json();
console.log("Reminders BEFORE:", (lbd2.items || lbd2 || []).length);

// Stop + Resume
await fetch(
  apiHost + "/manager/performance-reviews/" + prId2 + "/stop/",
  { method: "POST", headers: h },
);
const res2 = await fetch(
  apiHost + "/manager/performance-reviews/" + prId2 + "/resume/",
  { method: "POST", headers: h },
);
console.log("Resume:", res2.status);

// After
const la2 = await fetch(
  apiHost +
    "/manager/performance-review-reminds?revisionId=" +
    revId2 +
    "&limit=50",
  { headers: h },
);
const lad2 = await la2.json();
const lai2 = lad2.items || lad2 || [];

const pa2 = await fetch(
  apiHost + "/manager/performance-reviews/" + prId2 + "/",
  { headers: h },
);
const pad2 = await pa2.json();

console.log("Reminds AFTER:", lai2.length);
console.log("enableReminds AFTER:", pad2.notificationsSchedule?.enableReminds);
const pass2 =
  lai2.length === 0 && pad2.notificationsSchedule?.enableReminds === false;
console.log("RESULT #2:", pass2 ? "PASS" : "FAIL");

// === ПРОВЕРКА 4: Кнопка "Отправить напоминание" — проверим через UI ===
// === ПРОВЕРКА 8: Новый цикл без изменений ===
console.log("\n=== ПРОВЕРКА 8: Новый цикл — напоминания не трогаются ===");

// Stop prId, then start new cycle
await fetch(
  apiHost + "/manager/performance-reviews/" + prId + "/stop/",
  { method: "POST", headers: h },
);

// Start new cycle (start on stopped PR)
const ncResp = await fetch(
  apiHost + "/manager/performance-reviews/" + prId + "/start/",
  { method: "POST", headers: h },
);
console.log("New cycle start:", ncResp.status);

if (ncResp.ok) {
  const pa8 = await fetch(
    apiHost + "/manager/performance-reviews/" + prId + "/",
    { headers: h },
  );
  const pad8 = await pa8.json();
  // New cycle should NOT auto-delete reminders (it's a fresh cycle)
  console.log(
    "enableReminds after new cycle:",
    pad8.notificationsSchedule?.enableReminds,
  );
  console.log("Status:", pad8.status);
  // The original PR was created with enableReminds: true, resume set it to false
  // New cycle: should restore original settings or keep false?
  // Per brief: new cycle = no changes to reminder behavior
  console.log("RESULT #8: MANUAL CHECK NEEDED (see enableReminds value above)");
} else {
  console.log("New cycle failed:", ncResp.status, await ncResp.text());
}

// === ПРОВЕРКА 9: Обычный PR без resume — напоминания работают ===
console.log("\n=== ПРОВЕРКА 9: Обычный PR — напоминания сохраняются ===");
const cr9 = await fetch(apiHost + "/manager/performance-reviews/", {
  method: "POST",
  headers: h,
  body: JSON.stringify({
    title: "E2E_Ручная проверка (обычная) " + Date.now(),
    directions: [
      { id: null, receiverType: "self", isSelected: true, title: null, description: null },
      { id: null, receiverType: "head", isSelected: true, title: null, description: null },
      { id: null, receiverType: "subordinate", isSelected: false, title: null, description: null },
      { id: null, receiverType: "colleague", isSelected: false, title: null, description: null },
    ],
    anonymityType: "anonymous",
    workflowType: "basic",
    notificationsSchedule: {
      enableReminds: true,
      baseDate: new Date().toISOString(),
      repeatType: "everyWorkDay",
      timezoneOffset: new Date().getTimezoneOffset(),
    },
    isApprovalStep: false,
    isAsyncSteps: false,
    isAsyncStepsSelfResponseStep: false,
    minReceiversCount: 1,
    maxReceiversCount: 10,
  }),
});
const prData9 = await cr9.json();
const prId9 = prData9.id;

await fetch(
  apiHost + "/manager/performance-reviews/" + prId9 + "/target-users/",
  {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      targets: uids.map((id) => ({ targetType: "user", entityId: id })),
    }),
  },
);

const pg9 = await fetch(
  apiHost + "/manager/performance-reviews/" + prId9 + "/",
  { headers: h },
);
const pi9 = await pg9.json();
for (const d of pi9.directions || []) {
  if (d.isSelected) {
    await fetch(
      apiHost +
        "/manager/performance-reviews/" +
        prId9 +
        "/directions/" +
        d.id +
        "/assessments/",
      {
        method: "POST",
        headers: h,
        body: JSON.stringify({ assessmentId: aid }),
      },
    );
  }
}

await fetch(
  apiHost + "/manager/performance-reviews/" + prId9 + "/start/",
  { method: "POST", headers: h },
);

const rr9 = await fetch(
  apiHost + "/manager/performance-reviews/" + prId9 + "/revisions/last/",
  { headers: h },
);
const rd9 = await rr9.json();
const revId9 = rd9.id;

// Create reminder on normal PR (no stop/resume)
await fetch(apiHost + "/manager/performance-review-reminds", {
  method: "POST",
  headers: h,
  body: JSON.stringify({
    revisionId: revId9,
    title: "Normal reminder",
    body: "Normal",
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    type: "revision",
  }),
});

const la9 = await fetch(
  apiHost +
    "/manager/performance-review-reminds?revisionId=" +
    revId9 +
    "&limit=50",
  { headers: h },
);
const lad9 = await la9.json();
const lai9 = lad9.items || lad9 || [];
const pa9 = await fetch(
  apiHost + "/manager/performance-reviews/" + prId9 + "/",
  { headers: h },
);
const pad9 = await pa9.json();

console.log("Reminds on normal PR:", lai9.length);
console.log(
  "enableReminds on normal PR:",
  pad9.notificationsSchedule?.enableReminds,
);
const pass9 =
  lai9.length >= 1 && pad9.notificationsSchedule?.enableReminds === true;
console.log("RESULT #9:", pass9 ? "PASS" : "FAIL");

// Print IDs for UI checks
console.log("\n=== IDs для UI проверок ===");
console.log("Sync PR (resumed):", prId, "- для проверок 3, 4, 5");
console.log("Async PR (resumed):", prId2);
console.log("Normal PR:", prId9, "- для проверки 9");

// Cleanup: stop all
for (const id of [prId2, prId9]) {
  await fetch(apiHost + "/manager/performance-reviews/" + id + "/stop/", {
    method: "POST",
    headers: h,
  }).catch(() => {});
}
