/**
 * Скрипт для уменьшения числа активных сотрудников до 900 в company_id=999.
 *
 * Логика:
 * 1. Авторизация как админ
 * 2. Получение всех активных пользователей через API
 * 3. Сортировка по last_login_at DESC (NULL последними)
 * 4. Защита ключевых пользователей из .env + SSO (другой пароль)
 * 5. Оставляем 900 (7 защищённых + 893 с самым свежим логином)
 * 6. Остальных деактивируем через POST /manager/users/deactivate/ { usersIds: [...] }
 *
 * Запуск:
 *   node scripts/deactivate-excess-users.mjs [--dry-run]
 */

const API = 'https://api.st1.apprs.ru';
const ADMIN_EMAIL = 'qaadmin@example.org';
const ADMIN_PASSWORD = 'DemoPass_7421!';
const COMPANY_ID = 999;
const TARGET_COUNT = 900;

// Защищённые пользователи (из .env) — НИКОГДА не деактивировать
const PROTECTED_IDS = new Set([
  91355,  // qaadmin@example.org — Admin
  91406,  // qaadmin+24@example.org — Manager
  91407,  // qaadmin+55@example.org — Head
  91459,  // qaadmin+30@example.org — Admin2
  91461,  // qaadmin+56@example.org — User
  92344,  // qaadmin+acc+977@example.org — SSO (другой пароль)
  92354,  // qaadmin+q@example.org — Support
]);

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 50; // запросов параллельно
const DELAY_MS = 100;  // пауза между батчами

async function auth() {
  const crypto = await import('node:crypto');
  const fingerPrint = crypto.createHash('md5').update(Date.now().toString()).digest('hex');
  const res = await fetch(`${API}/auth/account/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, fingerPrint, permissions: [] }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const token = data.token || data.accessToken;
  if (!token) throw new Error(`No token: ${JSON.stringify(data)}`);
  return token;
}

async function fetchAllActiveUsers(token) {
  const allUsers = [];
  let offset = 0;
  const limit = 500;

  while (true) {
    const res = await fetch(
      `${API}/manager/users/?limit=${limit}&offset=${offset}&category=active`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Fetch users failed at offset=${offset}: ${res.status}`);
    const data = await res.json();
    const items = data.items || data.results || [];
    if (!items.length) break;
    allUsers.push(...items);
    console.log(`  Fetched ${allUsers.length} users (offset=${offset})...`);
    if (items.length < limit) break;
    offset += limit;
  }

  return allUsers;
}

async function deactivateBatch(token, userIds) {
  const res = await fetch(`${API}/manager/users/deactivate/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ usersIds: userIds }),
  });
  return { status: res.status, ok: res.ok, count: userIds.length };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log(`=== Деактивация лишних сотрудников (company_id=${COMPANY_ID}) ===`);
  console.log(`Цель: оставить ${TARGET_COUNT} активных`);
  console.log(`Защищённые ID: ${[...PROTECTED_IDS].join(', ')}`);
  if (DRY_RUN) console.log('*** DRY RUN — реальных изменений не будет ***\n');

  // 1. Auth
  console.log('1. Авторизация...');
  const token = await auth();
  console.log('   OK\n');

  // 2. Fetch all active users
  console.log('2. Загрузка всех активных пользователей...');
  const allUsers = await fetchAllActiveUsers(token);
  console.log(`   Всего активных: ${allUsers.length}\n`);

  if (allUsers.length <= TARGET_COUNT) {
    console.log(`Уже <= ${TARGET_COUNT}. Ничего делать не нужно.`);
    return;
  }

  // 3. Sort by last_login_at DESC (NULL last)
  allUsers.sort((a, b) => {
    const aLogin = a.lastLoginAt || a.last_login_at || null;
    const bLogin = b.lastLoginAt || b.last_login_at || null;
    if (!aLogin && !bLogin) return 0;
    if (!aLogin) return 1;  // a goes after b
    if (!bLogin) return -1; // a goes before b
    return new Date(bLogin) - new Date(aLogin); // DESC
  });

  // 4. Split into keep & disable
  const keepCount = TARGET_COUNT - PROTECTED_IDS.size; // 893
  const toKeep = new Set([...PROTECTED_IDS]);
  let added = 0;

  for (const user of allUsers) {
    if (added >= keepCount) break;
    if (PROTECTED_IDS.has(user.id)) continue; // уже защищён
    toKeep.add(user.id);
    added++;
  }

  const toDisable = allUsers.filter(u => !toKeep.has(u.id));

  console.log(`3. Результат сортировки:`);
  console.log(`   Оставляем: ${toKeep.size} (${PROTECTED_IDS.size} защищённых + ${added} по логину)`);
  console.log(`   Деактивируем: ${toDisable.length}\n`);

  // Show cutoff
  const lastKept = allUsers.filter(u => toKeep.has(u.id) && !PROTECTED_IDS.has(u.id));
  const cutoff = lastKept[lastKept.length - 1];
  if (cutoff) {
    const cutoffLogin = cutoff.lastLoginAt || cutoff.last_login_at || 'never';
    console.log(`   Граница: user_id=${cutoff.id} "${cutoff.firstName || cutoff.first_name} ${cutoff.lastName || cutoff.last_name}", last_login=${cutoffLogin}\n`);
  }

  if (DRY_RUN) {
    console.log('DRY RUN: первые 20 на деактивацию:');
    for (const u of toDisable.slice(0, 20)) {
      const login = u.lastLoginAt || u.last_login_at || 'never';
      console.log(`  id=${u.id} "${u.firstName || u.first_name} ${u.lastName || u.last_name}" last_login=${login}`);
    }
    console.log(`  ... и ещё ${Math.max(0, toDisable.length - 20)}`);
    return;
  }

  // 5. Deactivate in batches (bulk API: POST /manager/users/deactivate/ { usersIds })
  console.log(`4. Деактивация ${toDisable.length} пользователей (batch=${BATCH_SIZE})...\n`);
  let success = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < toDisable.length; i += BATCH_SIZE) {
    const batch = toDisable.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map(u => u.id);
    const result = await deactivateBatch(token, batchIds);

    if (result.ok) {
      success += result.count;
    } else {
      failed += result.count;
      errors.push({ batchStart: i, status: result.status, ids: batchIds.slice(0, 5) });
    }

    const pct = Math.round(((i + batch.length) / toDisable.length) * 100);
    process.stdout.write(`\r   Progress: ${i + batch.length}/${toDisable.length} (${pct}%) — OK: ${success}, FAIL: ${failed}`);

    if (i + BATCH_SIZE < toDisable.length) await sleep(DELAY_MS);
  }

  console.log('\n');
  console.log(`=== Готово ===`);
  console.log(`Деактивировано: ${success}`);
  console.log(`Ошибок: ${failed}`);

  if (errors.length > 0) {
    console.log('\nОшибки:');
    for (const e of errors) {
      console.log(`  batch at ${e.batchStart}, status=${e.status}, sample ids: ${e.ids.join(',')}`);
    }
  }

  // 6. Verify
  console.log('\n5. Проверка...');
  const afterUsers = await fetchAllActiveUsers(token);
  console.log(`   Активных после: ${afterUsers.length}`);
}

run().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
