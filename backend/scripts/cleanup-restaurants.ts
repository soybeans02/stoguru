/**
 * モックデータ全削除（新規20件以外）
 *
 * 使い方:
 *   cd backend
 *   npx tsx scripts/cleanup-restaurants.ts
 */

const API = process.env.API_URL ?? 'https://stoguru-api.onrender.com/api';

const KEEP_IDS = new Set([
  'mock-pho-01', 'mock-tacos-01', 'mock-india-01', 'mock-spain-01', 'mock-okinawa-01',
  'mock-motsu-01', 'mock-teppan-01', 'mock-sukiyaki-01', 'mock-unagi-01', 'mock-tonkatsu-01',
  'mock-tachinomi-01', 'mock-gibier-01', 'mock-bakery-01', 'mock-hawaii-01', 'mock-pancake-01',
  'mock-craftbeer-01', 'mock-monja-01', 'mock-kakigori-01', 'mock-sosaku-01', 'mock-kchicken-01',
]);

const USERS = [
  { email: 'test1@stoguru.dev', password: 'Test1234!' },
  { email: 'test2@stoguru.dev', password: 'Test1234!' },
  { email: 'test3@stoguru.dev', password: 'Test1234!' },
  { email: 'test4@stoguru.dev', password: 'Test1234!' },
  { email: 'test5@stoguru.dev', password: 'Test1234!' },
];

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = (await res.json()) as any;
  return data.accessToken;
}

async function deleteRestaurant(token: string, id: string): Promise<{ ok: boolean; status: number; body?: any }> {
  const res = await fetch(`${API}/influencer/restaurants/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function fetchAllIds(token: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`${API}/restaurants/feed?lat=34.7025&lng=135.4959&radius=50000`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as any;
  return data.items.map((r: any) => ({ id: r.id, name: r.name }));
}

async function main() {
  console.log('🔑 ログイン中...');
  const tokens: string[] = [];
  for (const u of USERS) {
    try {
      tokens.push(await login(u.email, u.password));
    } catch {
      console.error(`❌ ${u.email}`);
    }
  }
  if (tokens.length === 0) return;

  const all = await fetchAllIds(tokens[0]);
  const targets = all.filter(r => !KEEP_IDS.has(r.id));
  console.log(`\n🗑️  削除対象: ${targets.length}件 (${all.length}件中、${KEEP_IDS.size}件保持)\n`);

  let deleted = 0;
  let failed = 0;
  for (const r of targets) {
    let success = false;
    for (const t of tokens) {
      const result = await deleteRestaurant(t, r.id);
      if (result.ok) {
        console.log(`  ✅ ${r.name} (${r.id})`);
        success = true;
        deleted++;
        break;
      }
    }
    if (!success) {
      console.log(`  ❌ ${r.name} (${r.id}) — 所有者不明`);
      failed++;
    }
  }

  console.log(`\n✨ 完了! 削除: ${deleted}件 / 失敗: ${failed}件`);
}

main();
