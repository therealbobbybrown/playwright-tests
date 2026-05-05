import { request } from "playwright";
import { createHash } from "crypto";
import dotenv from "dotenv";
dotenv.config();

const ctx = await request.newContext({
  baseURL: process.env.API_BASE_URL,
});

const fp = createHash("md5").update(Date.now().toString()).digest("hex");
const loginResp = await ctx.post("/auth/account/signin", {
  data: {
    email: process.env.ADMIN_LOGIN,
    password: process.env.ADMIN_PASSWORD,
    fingerPrint: fp,
    permissions: [],
  },
});
const { accessToken: token } = await loginResp.json();

// Restore PR 8621: enableCustomCharacteristics=true
const getResp = await ctx.get(
  `/manager/performance-reviews/8621/statistics/settings/`,
  {
    headers: { Authorization: "Bearer " + token },
  },
);
const data = await getResp.json();
data.settings.enableCustomCharacteristics = true;
data.settings.enableOnlyCustomCharacteristics = false;
data.settings.enableResponsesOverwriting = true;
data.settings.notShowAverage = false;

const postResp = await ctx.post(
  `/manager/performance-reviews/8621/statistics/settings/`,
  {
    data,
    headers: { Authorization: "Bearer " + token },
  },
);
console.log("Restore PR 8621 status:", postResp.status());

await ctx.dispose();
