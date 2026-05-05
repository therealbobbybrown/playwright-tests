// Скрипт для проверки структуры опросов
import "dotenv/config";
import { request } from "@playwright/test";
import { createHash } from "crypto";

function generateFingerPrint() {
  return createHash("md5").update(Date.now().toString()).digest("hex");
}

async function main() {
  const baseURL = process.env.API_BASE_URL;
  console.log("BaseURL:", baseURL);

  const context = await request.newContext({ baseURL });

  // Авторизация
  const authRes = await context.post("/auth/account/signin/", {
    data: {
      email: process.env.ADMIN_LOGIN,
      password: process.env.ADMIN_PASSWORD,
      fingerPrint: generateFingerPrint(),
      permissions: [],
    },
  });

  const authData = await authRes.json().catch(() => null);
  const token = authData?.accessToken;
  if (!token) {
    console.log("Auth failed:", authRes.status(), authData);
    return;
  }
  console.log("Auth OK");

  const headers = { Authorization: `Bearer ${token}` };

  // Получаем список АКТИВНЫХ опросов
  const listRes = await context.get(
    "/manager/surveys/?status=active&limit=20",
    { headers },
  );
  const listData = await listRes.json().catch(() => null);

  const items = listData?.items || listData || [];
  console.log(`\nНайдено АКТИВНЫХ опросов: ${items.length}`);

  for (const s of items.slice(0, 10)) {
    console.log(
      `\n  ID: ${s.id} | Status: ${s.status} | Title: ${(s.title || "").substring(0, 40)}`,
    );

    // Получаем детали
    const detailRes = await context.get(`/manager/surveys/${s.id}/`, {
      headers,
    });
    const detailData = await detailRes.json().catch(() => null);

    const pages = detailData?.pages || [];
    console.log(`    Pages: ${pages.length}`);

    for (const page of pages) {
      const questions = page.questions || [];
      console.log(
        `      Page "${page.title}" - Questions: ${questions.length}`,
      );
      for (const q of questions.slice(0, 3)) {
        console.log(
          `        Q: ${q.id} (${q.type}) - ${(q.title || "").substring(0, 30)}`,
        );
      }
    }

    // Получаем ревизии
    const revRes = await context.get(
      `/manager/surveys/${s.id}/revisions/?limit=1`,
      { headers },
    );
    const revData = await revRes.json().catch(() => null);

    const revisions = revData?.items || revData || [];
    if (revisions.length > 0) {
      console.log(
        `    Revision: ${revisions[0].id} (alias: ${revisions[0].alias})`,
      );
    } else {
      console.log(`    No revisions`);
    }
  }

  await context.dispose();
}

main().catch(console.error);
