import { request } from "playwright";
import { createHash } from "crypto";
import dotenv from "dotenv";
dotenv.config();

function generateFingerPrint() {
  return createHash("md5").update(Date.now().toString()).digest("hex");
}

const baseURL = process.env.API_BASE_URL;
console.log("API_BASE_URL:", baseURL);

const ctx = await request.newContext({ baseURL });

// Sign in
const loginResp = await ctx.post("/auth/account/signin", {
  data: {
    email: process.env.ADMIN_LOGIN,
    password: process.env.ADMIN_PASSWORD,
    fingerPrint: generateFingerPrint(),
    permissions: [],
  },
});
const loginData = await loginResp.json();
console.log("Login status:", loginResp.status());
console.log("Login response keys:", Object.keys(loginData || {}));
const token = loginData.accessToken;
if (!token) {
  console.error("No token! Response:", JSON.stringify(loginData).slice(0, 500));
  process.exit(1);
}
console.log("Token obtained, length:", token?.length);

// Get distribution users (all batches)
const allEntries = [];
for (let offset = 0; offset < 3000; offset += 100) {
  const usersResp = await ctx.post(
    "/private/performance-reviews/dashboard/distribution-users/get/",
    {
      data: { usersSubset: "all", limit: 100, offset },
      headers: { Authorization: "Bearer " + token },
    },
  );
  const usersData = await usersResp.json();
  if (!usersData?.items?.length) break;

  const userIds = usersData.items.map((u) => u.id);

  const resultsResp = await ctx.post(
    "/private/performance-reviews/dashboard/distribution-last-results/get/",
    {
      data: { targetUserIds: userIds },
      headers: { Authorization: "Bearer " + token },
    },
  );
  const resultsData = await resultsResp.json();

  for (const [key, entry] of Object.entries(resultsData)) {
    if (entry && entry.revisionMean) {
      allEntries.push(entry);
    }
  }

  console.log(
    `Batch offset=${offset}: ${usersData.items.length} users, total entries: ${allEntries.length}`,
  );
  if (usersData.items.length < 100) break;
}

// Group by PR and show revisionMean structure
const byPR = {};
for (const entry of allEntries) {
  const prId = entry.performanceReview?.id;
  if (!byPR[prId]) byPR[prId] = [];
  byPR[prId].push(entry);
}

console.log("\n=== Entries by PR ===");
for (const [prId, entries] of Object.entries(byPR)) {
  const sample = entries[0].revisionMean;
  console.log(`\nPR ${prId} (${entries.length} entries):`);
  console.log("  Sample revisionMean:", JSON.stringify(sample, null, 2));
  console.log("  Keys:", Object.keys(sample));
  console.log(
    "  characteristic:",
    sample.characteristic ? "PRESENT" : "null/undefined",
  );
  console.log("  isOverwritten:", sample.isOverwritten);
  console.log(
    "  notOverwritten:",
    sample.notOverwritten ? "PRESENT" : "null/undefined",
  );
}

console.log(
  "\nTotal:",
  allEntries.length,
  "entries from",
  Object.keys(byPR).length,
  "PRs",
);

// === Test patching: disable calib on one PR ===
if (allEntries.length > 0) {
  const testEntry = allEntries[0];
  const prId = testEntry.performanceReview.id;
  const userId = testEntry.targetUserId;
  console.log(`\n=== Patch test: PR ${prId}, user ${userId} ===`);

  // GET current settings
  const getResp = await ctx.get(
    `/manager/performance-reviews/${prId}/statistics/settings/`,
    { headers: { Authorization: "Bearer " + token } },
  );
  const settingsData = await getResp.json();
  console.log(
    "Current settings.enableResponsesOverwriting:",
    settingsData?.settings?.enableResponsesOverwriting,
  );
  console.log(
    "Current settings.enableCustomCharacteristics:",
    settingsData?.settings?.enableCustomCharacteristics,
  );

  const origSettings = JSON.parse(JSON.stringify(settingsData));

  // Patch: disable calib
  settingsData.settings.enableResponsesOverwriting = false;
  const patchResp = await ctx.post(
    `/manager/performance-reviews/${prId}/statistics/settings/`,
    {
      data: settingsData,
      headers: { Authorization: "Bearer " + token },
    },
  );
  console.log("Patch (calib=false) status:", patchResp.status());

  // Re-query
  const reQueryResp = await ctx.post(
    "/private/performance-reviews/dashboard/distribution-last-results/get/",
    {
      data: { targetUserIds: [userId] },
      headers: { Authorization: "Bearer " + token },
    },
  );
  const reQueryData = await reQueryResp.json();
  const reResult = Object.values(reQueryData)[0];
  console.log(
    "After calib=false, revisionMean:",
    JSON.stringify(reResult?.revisionMean),
  );

  // Restore
  const restoreResp = await ctx.post(
    `/manager/performance-reviews/${prId}/statistics/settings/`,
    {
      data: origSettings,
      headers: { Authorization: "Bearer " + token },
    },
  );
  console.log("Restore status:", restoreResp.status());

  // Also test: disable textChar
  settingsData.settings = origSettings.settings;
  settingsData.settings.enableCustomCharacteristics = false;
  settingsData.settings.enableResponsesOverwriting = true; // keep calib on
  const patchResp2 = await ctx.post(
    `/manager/performance-reviews/${prId}/statistics/settings/`,
    {
      data: settingsData,
      headers: { Authorization: "Bearer " + token },
    },
  );
  console.log(
    "\nPatch (textChar=false, calib=true) status:",
    patchResp2.status(),
  );

  const reQueryResp2 = await ctx.post(
    "/private/performance-reviews/dashboard/distribution-last-results/get/",
    {
      data: { targetUserIds: [userId] },
      headers: { Authorization: "Bearer " + token },
    },
  );
  const reQueryData2 = await reQueryResp2.json();
  const reResult2 = Object.values(reQueryData2)[0];
  console.log(
    "After textChar=false, calib=true, revisionMean:",
    JSON.stringify(reResult2?.revisionMean),
  );

  // Also test: enable onlyText
  const settingsData3 = JSON.parse(JSON.stringify(origSettings));
  settingsData3.settings.enableOnlyCustomCharacteristics = true;
  const patchResp3 = await ctx.post(
    `/manager/performance-reviews/${prId}/statistics/settings/`,
    {
      data: settingsData3,
      headers: { Authorization: "Bearer " + token },
    },
  );
  console.log("\nPatch (onlyText=true) status:", patchResp3.status());

  const reQueryResp3 = await ctx.post(
    "/private/performance-reviews/dashboard/distribution-last-results/get/",
    {
      data: { targetUserIds: [userId] },
      headers: { Authorization: "Bearer " + token },
    },
  );
  const reQueryData3 = await reQueryResp3.json();
  const reResult3 = Object.values(reQueryData3)[0];
  console.log(
    "After onlyText=true, revisionMean:",
    JSON.stringify(reResult3?.revisionMean),
  );

  // Restore again
  const restoreResp2 = await ctx.post(
    `/manager/performance-reviews/${prId}/statistics/settings/`,
    {
      data: origSettings,
      headers: { Authorization: "Bearer " + token },
    },
  );
  console.log("Restore status:", restoreResp2.status());
}

await ctx.dispose();
