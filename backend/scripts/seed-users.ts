/**
 * テストユーザー5名を一括作成するシードスクリプト
 *
 * 使い方:
 *   cd backend
 *   npx tsx scripts/seed-users.ts
 *
 * 前提: バックエンドが起動中 (localhost:3001)
 */

const API = process.env.API_URL ?? 'http://localhost:3001/api';

const TEST_USERS = [
  { email: 'test1@stoguru.dev', password: 'Test1234!', nickname: 'テスト太郎' },
  { email: 'test2@stoguru.dev', password: 'Test1234!', nickname: 'グルメ花子' },
  { email: 'test3@stoguru.dev', password: 'Test1234!', nickname: 'ラーメン次郎' },
  { email: 'test4@stoguru.dev', password: 'Test1234!', nickname: 'カフェ好き' },
  { email: 'test5@stoguru.dev', password: 'Test1234!', nickname: '食べ歩きマン' },
];

async function createUser(user: typeof TEST_USERS[0]) {
  try {
    // 1. サインアップ
    const signupRes = await fetch(`${API}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });

    if (!signupRes.ok) {
      const err = await signupRes.json().catch(() => ({}));
      // 既に存在する場合はスキップ
      if (signupRes.status === 409 || (err as any).message?.includes('exists')) {
        console.log(`⏭  ${user.nickname} (${user.email}) - 既に存在`);
        return;
      }
      console.error(`❌ ${user.nickname} signup失敗:`, err);
      return;
    }

    // 2. ログインテスト
    const loginRes = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });

    if (loginRes.ok) {
      console.log(`✅ ${user.nickname} (${user.email}) - 作成＆ログイン成功`);
    } else {
      console.log(`⚠️  ${user.nickname} (${user.email}) - 作成済みだがログイン失敗`);
    }
  } catch (e) {
    console.error(`❌ ${user.nickname} エラー:`, e);
  }
}

async function main() {
  console.log('🌱 テストユーザー作成開始...\n');
  console.log(`API: ${API}\n`);

  for (const user of TEST_USERS) {
    await createUser(user);
  }

  console.log('\n✨ 完了!');
  console.log('\nログイン情報:');
  console.log('─'.repeat(50));
  TEST_USERS.forEach(u => {
    console.log(`  ${u.nickname.padEnd(12)} | ${u.email.padEnd(24)} | ${u.password}`);
  });
}

main();
