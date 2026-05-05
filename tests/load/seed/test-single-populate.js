#!/usr/bin/env node
// Тестовый скрипт — один вызов populateReview для измерения времени
import "dotenv/config";
import { createHash } from "crypto";
import { getCredentials } from "../../utils/api/AuthAPI.js";

const baseUrl = process.env.API_BASE_URL;
const { email, password } = getCredentials("admin");
const fingerPrint = createHash("md5")
  .update(Date.now().toString())
  .digest("hex");

const signResp = await fetch(baseUrl + "/auth/account/signin", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, fingerPrint, permissions: [] }),
});

const data = await signResp.json();
console.log("SignIn status:", signResp.status);
if (!data.accessToken) {
  console.log("Error:", JSON.stringify(data));
  process.exit(1);
}
console.log("Token OK");

const prId = 10402;
console.log(`\nОдин вызов populateReview для PR ${prId}...`);
const start = Date.now();
const resp = await fetch(
  `${baseUrl}/manager/performance-reviews/${prId}/populate-review`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.accessToken}`,
    },
    body: JSON.stringify({
      skipChance: 0,
      commentChance: 0,
      customChance: 0,
      lowerLimit: 60,
      upperLimit: 100,
    }),
  },
);
const elapsed = Date.now() - start;
console.log(`Status: ${resp.status} | Время: ${(elapsed / 1000).toFixed(1)}s`);
const body = await resp.text();
console.log("Body:", body.substring(0, 300));
