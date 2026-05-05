#!/usr/bin/env node
import { request } from '@playwright/test';
import { PerformanceReviewAPI } from '../tests/utils/api/PerformanceReviewAPI.js';
import { getCredentials } from '../tests/utils/api/index.js';

const apiBase = process.env.API_BASE_URL || 'https://api.st7.apprs.ru';
const ids = process.argv.slice(2).map(Number).filter(Boolean);
const prIds = ids.length ? ids : [10, 11, 14, 15];

const ctx = await request.newContext({ baseURL: apiBase, timeout: 120000 });
const api = new PerformanceReviewAPI(ctx);
const { email, password } = getCredentials('admin');
await api.signIn(email, password);

async function probe(prId) {
  const noDate = await api.get(`/private/performance-reviews/${prId}/progress/export/get-token/`);
  console.log(`\nPR ${prId} token without userDate => ${noDate.response.status()} ${JSON.stringify(noDate.data)}`);

  const userDate = new Date().toISOString();
  const withDate = await api.get(`/private/performance-reviews/${prId}/progress/export/get-token/?userDate=${encodeURIComponent(userDate)}`);
  console.log(`PR ${prId} token with userDate => ${withDate.response.status()} ${JSON.stringify(withDate.data)}`);

  if (!withDate.response.ok() || !withDate.data?.token) return;

  const token = withDate.data.token;
  const paths = [
    `/public/performance-reviews/${prId}/progress/export/xlsx/?token=${encodeURIComponent(token)}`,
    `/public/performance-reviews/${prId}/progress/export/xlsx/?lang=ru&token=${encodeURIComponent(token)}`,
    `/public/performance-reviews/${prId}/progress/export/xlsx/?lang=en&token=${encodeURIComponent(token)}`,
    `/public/performance-reviews/${prId}/progress/export/csv/?token=${encodeURIComponent(token)}`,
    `/public/performance-reviews/${prId}/progress/export/pdf/?token=${encodeURIComponent(token)}`,
  ];

  for (const p of paths) {
    const res = await ctx.get(apiBase + p);
    console.log(`  ${p} => ${res.status()} ${res.headers()['content-type'] || ''}`);
  }
}

for (const prId of prIds) {
  await probe(prId);
}

await ctx.dispose();
