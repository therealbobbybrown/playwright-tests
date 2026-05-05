/**
 * Очистка stale тестовых ролей со стенда.
 * Удаляет роли, созданные тестами (E2E_ReviewAdmin, Batch Role, Test_manageRole,
 * SQL injection пейлоады, XSS пейлоады и т.д.)
 */
import dotenv from "dotenv";
import { createHash } from "crypto";
dotenv.config();

const API_BASE = process.env.API_BASE_URL;
if (!API_BASE) {
  console.error("API_BASE_URL не задан в .env");
  process.exit(1);
}

async function signIn(email, password) {
  const res = await fetch(`${API_BASE}/auth/account/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      fingerPrint: createHash("md5").update(Date.now().toString()).digest("hex"),
      permissions: [],
    }),
  });
  const data = await res.json();
  return data.accessToken;
}

async function apiGet(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function apiDelete(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, ok: res.ok };
}

/** Паттерны тестовых ролей, подлежащих удалению */
const STALE_PATTERNS = [
  /^E2E_/,
  /^Test[ _]/i, // Test Role, Test_manage*, Test_ManageOwnPR, Test Delete Role, Test Update Role
  /^Batch Role /,
  /^Perm Test Role /,
  /^Lifecycle Role /,
  /^UITest_/,
  /^Research_/,
  /^Updated Test Role /,
  /^Updated Role/,
  /DROP TABLE/i,
  /SELECT.*FROM/i,
  /<img/i,
  /<script/i,
  /onerror/i,
  /alert\(/i,
  /^'; /,
  /\d{13}/, // Any role with a 13-digit Unix timestamp
];

/** Системные роли, которые НЕЛЬЗЯ удалять */
const PROTECTED_IDS = new Set([1, 2]); // Manager, User

function isStaleRole(role) {
  if (PROTECTED_IDS.has(role.id)) return false;
  return STALE_PATTERNS.some((p) => p.test(role.title));
}

async function main() {
  const email = process.env.ADMIN_LOGIN;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error("ADMIN_LOGIN / ADMIN_PASSWORD не заданы в .env");
    process.exit(1);
  }

  console.log("Авторизация...");
  const token = await signIn(email, password);
  if (!token) {
    console.error("Не удалось получить токен");
    process.exit(1);
  }

  console.log("Получаю список ролей...");
  const data = await apiGet("/manager/roles/?limit=500", token);
  const items = Array.isArray(data)
    ? data
    : data?.items || data?.results || [];

  if (!items.length) {
    console.log("Список ролей пуст или не получен.");
    console.log("Ответ:", JSON.stringify(data).slice(0, 300));
    return;
  }

  console.log(`Всего ролей на стенде: ${items.length}`);

  const staleRoles = items.filter(isStaleRole);

  if (staleRoles.length === 0) {
    console.log("Нет stale тестовых ролей — всё чисто.");
    return;
  }

  console.log(`\nНайдено ${staleRoles.length} stale ролей:`);
  for (const role of staleRoles) {
    console.log(`  - id=${role.id}, title="${role.title}"`);
  }

  console.log("\nУдаляю...");
  let deleted = 0;
  let errors = 0;
  for (const role of staleRoles) {
    try {
      const { status, ok } = await apiDelete(
        `/manager/roles/${role.id}/`,
        token,
      );
      if (ok) {
        console.log(`  ✓ id=${role.id} "${role.title}"`);
        deleted++;
      } else {
        console.error(`  ✗ id=${role.id} "${role.title}" — HTTP ${status}`);
        errors++;
      }
    } catch (e) {
      console.error(`  ✗ id=${role.id} "${role.title}" — ${e.message}`);
      errors++;
    }
  }

  console.log(`\nИтого: удалено ${deleted}, ошибок ${errors}`);
}

main().catch(console.error);
