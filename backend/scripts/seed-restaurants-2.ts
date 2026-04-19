/**
 * 追加モックレストラン10件 + インフルエンサープロフィール設定
 *
 * 使い方:
 *   cd backend
 *   npx tsx scripts/seed-restaurants-2.ts
 */

const API = process.env.API_URL ?? 'https://stoguru-api.onrender.com/api';

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

// プロフィール設定（@ハンドル）
async function setProfile(token: string, profile: any) {
  const res = await fetch(`${API}/influencer/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(profile),
  });
  if (res.ok) {
    console.log(`  📝 プロフィール設定OK: @${profile.instagramHandle || profile.tiktokHandle || profile.youtubeHandle}`);
  } else {
    const err = await res.json().catch(() => ({}));
    console.error(`  ❌ プロフィール設定失敗:`, err);
  }
}

async function createRestaurant(token: string, id: string, data: any) {
  const res = await fetch(`${API}/influencer/restaurants/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (res.ok) {
    console.log(`  ✅ ${data.name}`);
  } else {
    const err = await res.json().catch(() => ({}));
    console.error(`  ❌ ${data.name}: ${res.status}`, err);
  }
}

const USERS = [
  {
    email: 'test1@stoguru.dev',
    password: 'Test1234!',
    profile: {
      displayName: 'テスト太郎',
      instagramHandle: 'taro_gourmet',
      instagramUrl: 'https://www.instagram.com/taro_gourmet/',
      platform: 'instagram',
    },
  },
  {
    email: 'test2@stoguru.dev',
    password: 'Test1234!',
    profile: {
      displayName: 'グルメ花子',
      tiktokHandle: 'hanako_eats',
      tiktokUrl: 'https://www.tiktok.com/@hanako_eats',
      platform: 'tiktok',
    },
  },
  {
    email: 'test3@stoguru.dev',
    password: 'Test1234!',
    profile: {
      displayName: 'ラーメン次郎',
      instagramHandle: 'jiro_ramen',
      instagramUrl: 'https://www.instagram.com/jiro_ramen/',
      platform: 'instagram',
    },
  },
  {
    email: 'test4@stoguru.dev',
    password: 'Test1234!',
    profile: {
      displayName: 'カフェ好き',
      youtubeHandle: 'cafe_suki',
      youtubeUrl: 'https://www.youtube.com/@cafe_suki',
      platform: 'youtube',
    },
  },
  {
    email: 'test5@stoguru.dev',
    password: 'Test1234!',
    profile: {
      displayName: '食べ歩きマン',
      tiktokHandle: 'tabearuki_man',
      tiktokUrl: 'https://www.tiktok.com/@tabearuki_man',
      platform: 'tiktok',
    },
  },
];

const RESTAURANTS = [
  {
    id: 'mock-udon-01',
    name: 'うどん 釜たけ',
    address: '大阪市中央区難波千日前8-1',
    lat: 34.6625, lng: 135.5045,
    genres: ['うどん', '和食'],
    scene: ['ひとり', '友達'],
    priceRange: '¥600〜¥1,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1618841557871-b4664fbf0cb3?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1582271955515-c39b5410e4d6?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/kamatake_udon/'],
    description: 'ちく玉天ぶっかけが名物。難波の行列うどん店。',
    visibility: 'public',
  },
  {
    id: 'mock-soba-01',
    name: '蕎麦 よしむら',
    address: '大阪市北区天神橋3-5-2',
    lat: 34.7020, lng: 135.5120,
    genres: ['蕎麦', '和食'],
    scene: ['ひとり', 'デート'],
    priceRange: '¥1,200〜¥2,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1519984388953-d2406bc725e1?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1553621042-f6e147245754?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@yoshimura_soba'],
    description: '自家製粉の十割蕎麦。天満エリアの隠れ家。',
    visibility: 'public',
  },
  {
    id: 'mock-thai-01',
    name: 'タイ屋台 クルン',
    address: '大阪市北区中崎町1-7-8',
    lat: 34.7075, lng: 135.5050,
    genres: ['タイ料理', 'アジアン'],
    scene: ['友達', '飲み会'],
    priceRange: '¥1,000〜¥2,500',
    photoUrls: [
      'https://images.unsplash.com/photo-1562565652-a0d8f0c59eb4?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/krung_thai_osaka/'],
    description: '本場バンコクの味。ガパオライスとパッタイが人気。',
    visibility: 'public',
  },
  {
    id: 'mock-pizza-01',
    name: 'ピッツェリア チーロ',
    address: '大阪市西区新町1-3-12',
    lat: 34.6780, lng: 135.4920,
    genres: ['ピザ', 'イタリアン'],
    scene: ['デート', '友達'],
    priceRange: '¥1,500〜¥3,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@pizzeria_ciro'],
    description: '薪窯で焼くナポリピッツァ。マルゲリータは必食。',
    visibility: 'public',
  },
  {
    id: 'mock-steak-01',
    name: 'ステーキハウス 88',
    address: '大阪市中央区心斎橋筋2-4-1',
    lat: 34.6710, lng: 135.5010,
    genres: ['ステーキ', '洋食'],
    scene: ['デート', '記念日'],
    priceRange: '¥5,000〜¥12,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1558030006-450675393462?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1546833998-877b37c2e5c6?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.youtube.com/@steakhouse88'],
    description: '目の前で焼く鉄板ステーキ。神戸牛が自慢。',
    visibility: 'public',
  },
  {
    id: 'mock-seafood-01',
    name: '海鮮居酒屋 魚心',
    address: '大阪市北区梅田1-11-4',
    lat: 34.7005, lng: 135.4970,
    genres: ['海鮮', '居酒屋'],
    scene: ['友達', '飲み会'],
    priceRange: '¥3,000〜¥5,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1535399831218-d5bd36d1a6b3?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/uoshin_umeda/'],
    description: '産直鮮魚の刺身盛りが絶品。日本酒の品揃えも◎。',
    visibility: 'public',
  },
  {
    id: 'mock-gyoza-01',
    name: '餃子のたっちゃん',
    address: '大阪市天王寺区上本町5-2-11',
    lat: 34.6695, lng: 135.5185,
    genres: ['餃子', '中華'],
    scene: ['ひとり', '友達'],
    priceRange: '¥700〜¥1,500',
    photoUrls: [
      'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@gyoza_tacchan'],
    description: 'パリパリ羽根つき餃子。ニンニク増し増しが人気。',
    visibility: 'public',
  },
  {
    id: 'mock-dessert-01',
    name: 'パティスリー ルメール',
    address: '大阪市中央区南船場4-5-8',
    lat: 34.6755, lng: 135.4985,
    genres: ['スイーツ', 'カフェ'],
    scene: ['デート', 'ひとり'],
    priceRange: '¥600〜¥1,500',
    photoUrls: [
      'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/patisserie_lemaire/'],
    description: '南船場の人気パティスリー。季節のタルトが絶品。',
    visibility: 'public',
  },
  {
    id: 'mock-yakitori-01',
    name: '焼鳥 とりまる',
    address: '大阪市福島区福島5-6-16',
    lat: 34.6935, lng: 135.4850,
    genres: ['焼鳥'],
    scene: ['飲み会', '友達', 'デート'],
    priceRange: '¥2,500〜¥4,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1504544750208-dc0358e63f7f?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@torimaru_fukushima'],
    description: '福島の名店。朝引き鶏の焼鳥はジューシーで絶品。',
    visibility: 'public',
  },
  {
    id: 'mock-french-01',
    name: 'ビストロ ラ・メゾン',
    address: '大阪市北区堂島1-2-20',
    lat: 34.6960, lng: 135.4955,
    genres: ['フレンチ', 'ビストロ'],
    scene: ['デート', '記念日'],
    priceRange: '¥4,000〜¥8,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1550966871-3ed3cdb51f3a?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/bistro_lamaison/'],
    description: '堂島のカジュアルフレンチ。ランチコースがコスパ最強。',
    visibility: 'public',
  },
];

async function main() {
  console.log('🍽️  追加モック登録開始...\n');

  const tokens: { token: string; profile: any }[] = [];
  for (const u of USERS) {
    try {
      const token = await login(u.email, u.password);
      tokens.push({ token, profile: u.profile });
      console.log(`🔑 ${u.email} ログイン成功`);
    } catch (e) {
      console.error(`❌ ${u.email} ログイン失敗`);
    }
  }

  if (tokens.length === 0) return;

  // プロフィール設定（@ハンドル）
  console.log('\n📝 プロフィール設定...');
  for (const t of tokens) {
    await setProfile(t.token, t.profile);
  }

  // レストラン登録
  console.log('\n🏪 レストラン登録...');
  for (let i = 0; i < RESTAURANTS.length; i++) {
    const { token } = tokens[i % tokens.length];
    const r = RESTAURANTS[i];
    await createRestaurant(token, r.id, r);
  }

  console.log(`\n✨ 完了! ${RESTAURANTS.length}件追加`);
}

main();
