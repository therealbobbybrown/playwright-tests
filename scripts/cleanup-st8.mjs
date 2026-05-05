// Temporary script: cleanup PRs with "Тест" on st8
const API = 'https://api.st8.apprs.ru';
const login = 'qaadmin@example.org';
const password = 'DemoPass_7421!';

async function run() {
  // 1. Auth
  const crypto = await import('node:crypto');
  const fingerPrint = crypto.createHash('md5').update(Date.now().toString()).digest('hex');
  const authRes = await fetch(`${API}/auth/account/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: login, password, fingerPrint, permissions: [] }),
  });
  if (!authRes.ok) {
    console.error('Auth failed:', authRes.status, await authRes.text());
    return;
  }
  const authData = await authRes.json();
  const token = authData.token || authData.accessToken;
  if (!token) {
    console.error('No token in response:', JSON.stringify(authData));
    return;
  }
  console.log('Auth OK');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 2. Fetch ALL PRs (no search filter) and delete everything
  let totalRemoved = 0;
  let totalFailed = 0;
  while (true) {
    const res = await fetch(`${API}/manager/performance-reviews/?limit=50&offset=0`, { headers });
    if (!res.ok) {
      console.error('List failed:', res.status);
      break;
    }
    const data = await res.json();
    const items = data.items || data.results || (Array.isArray(data) ? data : []);
    if (!items.length) break;
    console.log(`Found ${items.length} PRs to delete`);

    let batchDeleted = 0;
    for (const pr of items) {
      const id = pr.id || pr.performanceReviewId || pr.uuid;
      if (!id) {
        console.warn('  skip (no id):', pr.title);
        continue;
      }
      // Full lifecycle: stop → archive → delete
      // 1. Stop (if running/active)
      await fetch(`${API}/manager/performance-reviews/${id}/stop`, { method: 'POST', headers }).catch(() => {});
      // 2. Archive
      await fetch(`${API}/manager/performance-reviews/${id}/archive`, { method: 'POST', headers }).catch(() => {});
      // 3. Delete
      let del = await fetch(`${API}/manager/performance-reviews/${id}/`, { method: 'DELETE', headers });
      if (!del.ok) {
        // Try alternative: complete → archive → delete
        await fetch(`${API}/manager/performance-reviews/${id}/complete`, { method: 'POST', headers }).catch(() => {});
        await fetch(`${API}/manager/performance-reviews/${id}/archive`, { method: 'POST', headers }).catch(() => {});
        del = await fetch(`${API}/manager/performance-reviews/${id}/`, { method: 'DELETE', headers });
      }
      const status = del.ok ? 'DEL' : `FAIL(${del.status})`;
      console.log(`  ${status} id=${id} "${pr.title}"`);
      if (del.ok) { totalRemoved++; batchDeleted++; }
      else totalFailed++;
    }
    // If nothing was deleted in this batch, we're stuck in a loop — break
    if (batchDeleted === 0) break;
  }
  console.log(`\nDone. Removed: ${totalRemoved}, Failed: ${totalFailed}`);
}

run().catch(e => console.error(e));
