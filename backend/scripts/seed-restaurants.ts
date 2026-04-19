/**
 * モックレストランデータを一括登録するシードスクリプト
 *
 * 使い方:
 *   cd backend
 *   npx tsx scripts/seed-restaurants.ts
 *
 * 前提: バックエンドが起動中 (localhost:3001 or 本番URL)
 */

const API = process.env.API_URL ?? 'https://stoguru-api.onrender.com/api';

// ログインしてトークン取得
async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json() as any;
  return data.accessToken;
}

interface MockRestaurant {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  genres: string[];
  scene: string[];
  priceRange: string;
  photoUrls: string[];
  urls: string[];
  description: string;
  visibility: string;
}

const MOCK_RESTAURANTS: MockRestaurant[] = [
  {
    id: 'mock-ramen-01',
    name: '麺屋 極 梅田店',
    address: '大阪市北区曽根崎2-1-1',
    lat: 34.7040,
    lng: 135.5010,
    genres: ['ラーメン'],
    scene: ['ひとり', '友達'],
    priceRange: '¥900〜¥1,500',
    photoUrls: [
      'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1591814468924-caf88d1232e1?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1617093727343-374698b1b08d?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/ramen_kiwami/'],
    description: '濃厚豚骨魚介のつけ麺が人気。深夜まで営業。',
    visibility: 'public',
  },
  {
    id: 'mock-sushi-01',
    name: '鮨 なかむら',
    address: '大阪市北区曽根崎新地1-5-5',
    lat: 34.6975,
    lng: 135.4980,
    genres: ['寿司', '和食'],
    scene: ['デート', '記念日'],
    priceRange: '¥8,000〜¥15,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1553621042-f6e147245754?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/sushi_nakamura_osaka/'],
    description: '北新地の隠れ家寿司。おまかせコースが絶品。',
    visibility: 'public',
  },
  {
    id: 'mock-yakiniku-01',
    name: '焼肉ホルモン 龍',
    address: '大阪市北区角田町1-1',
    lat: 34.7035,
    lng: 135.5005,
    genres: ['焼肉'],
    scene: ['友達', '飲み会'],
    priceRange: '¥3,500〜¥6,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1558030006-450675393462?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@yakiniku_ryu'],
    description: 'A5ランク黒毛和牛をリーズナブルに。名物ホルモン盛り合わせ。',
    visibility: 'public',
  },
  {
    id: 'mock-cafe-01',
    name: 'Café MUGI',
    address: '大阪市北区茶屋町2-3',
    lat: 34.7060,
    lng: 135.4985,
    genres: ['カフェ'],
    scene: ['ひとり', 'デート'],
    priceRange: '¥800〜¥1,500',
    photoUrls: [
      'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/cafe_mugi_osaka/'],
    description: '自家焙煎コーヒーとこだわりスイーツ。茶屋町の路地裏カフェ。',
    visibility: 'public',
  },
  {
    id: 'mock-curry-01',
    name: 'スパイスカレー TADA',
    address: '大阪市北区中崎西2-1',
    lat: 34.7080,
    lng: 135.5030,
    genres: ['カレー'],
    scene: ['ひとり', '友達'],
    priceRange: '¥1,200〜¥1,800',
    photoUrls: [
      'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@spice_tada'],
    description: '中崎町の人気スパイスカレー。2種あいがけが定番。',
    visibility: 'public',
  },
  {
    id: 'mock-italian-01',
    name: 'トラットリア ベッラ',
    address: '大阪市中央区西心斎橋1-4-5',
    lat: 34.6725,
    lng: 135.4990,
    genres: ['イタリアン'],
    scene: ['デート', '友達'],
    priceRange: '¥2,500〜¥5,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1498579150354-977475b7ea0b?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/trattoria_bella_osaka/'],
    description: '心斎橋の本格イタリアン。手打ちパスタとワインが自慢。',
    visibility: 'public',
  },
  {
    id: 'mock-korean-01',
    name: '韓国料理 ソウル食堂',
    address: '大阪市生野区桃谷3-2-1',
    lat: 34.6590,
    lng: 135.5280,
    genres: ['韓国料理'],
    scene: ['友達', '飲み会'],
    priceRange: '¥2,000〜¥4,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1583224964978-2257b960c3f3?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1567533708067-5aa637ab4f4e?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@seoul_shokudo'],
    description: '鶴橋エリアの老舗韓国料理店。サムギョプサルが絶品。',
    visibility: 'public',
  },
  {
    id: 'mock-burger-01',
    name: 'BURGER STAND UMEDA',
    address: '大阪市北区梅田3-1-1',
    lat: 34.6995,
    lng: 135.4940,
    genres: ['ハンバーガー'],
    scene: ['ひとり', '友達'],
    priceRange: '¥1,300〜¥2,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.youtube.com/@burger_stand_umeda'],
    description: 'グランフロント近くのグルメバーガー。パティは100%黒毛和牛。',
    visibility: 'public',
  },
  {
    id: 'mock-tempura-01',
    name: '天ぷら 新宿',
    address: '大阪市中央区難波1-7-2',
    lat: 34.6655,
    lng: 135.5015,
    genres: ['天ぷら', '和食'],
    scene: ['デート', 'ひとり'],
    priceRange: '¥3,000〜¥8,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1615361200141-f45040f367be?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/tempura_shinjuku_namba/'],
    description: 'カウンターで揚げたて天ぷらを。季節の食材を使ったコースが人気。',
    visibility: 'public',
  },
  {
    id: 'mock-izakaya-01',
    name: '大衆酒場 まるよし',
    address: '大阪市浪速区恵美須東2-3-1',
    lat: 34.6520,
    lng: 135.5060,
    genres: ['居酒屋'],
    scene: ['飲み会', '友達'],
    priceRange: '¥2,000〜¥3,500',
    photoUrls: [
      'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1555244162-803834f70033?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@maruyoshi_shinsekai'],
    description: '新世界の大衆酒場。串カツと生ビールで乾杯。',
    visibility: 'public',
  },
  {
    id: 'mock-chinese-01',
    name: '中華そば 花月',
    address: '大阪市天王寺区上本町6-1-1',
    lat: 34.6680,
    lng: 135.5200,
    genres: ['中華'],
    scene: ['ひとり', '友達'],
    priceRange: '¥800〜¥1,200',
    photoUrls: [
      'https://images.unsplash.com/photo-1552611052-33e04de1b100?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/kagetsu_ramen/'],
    description: '昔ながらの中華そば。あっさり醤油味が地元民に愛される。',
    visibility: 'public',
  },
  {
    id: 'mock-okonomiyaki-01',
    name: 'お好み焼き 千房 道頓堀店',
    address: '大阪市中央区道頓堀1-5-5',
    lat: 34.6687,
    lng: 135.5020,
    genres: ['お好み焼き'],
    scene: ['友達', '家族'],
    priceRange: '¥1,000〜¥2,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1504544750208-dc0358e63f7f?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@chibo_dotonbori'],
    description: '道頓堀の定番お好み焼き。豚玉モダンが一番人気。',
    visibility: 'public',
  },
];

// 各テストユーザーに分散して登録
const USERS = [
  { email: 'test1@stoguru.dev', password: 'Test1234!' },
  { email: 'test2@stoguru.dev', password: 'Test1234!' },
  { email: 'test3@stoguru.dev', password: 'Test1234!' },
  { email: 'test4@stoguru.dev', password: 'Test1234!' },
  { email: 'test5@stoguru.dev', password: 'Test1234!' },
];

async function createRestaurant(token: string, r: MockRestaurant) {
  const res = await fetch(`${API}/influencer/restaurants/${r.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: r.name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      genres: r.genres,
      scene: r.scene,
      priceRange: r.priceRange,
      photoUrls: r.photoUrls,
      urls: r.urls,
      description: r.description,
      visibility: r.visibility,
    }),
  });

  if (res.ok) {
    console.log(`✅ ${r.name} (${r.id})`);
  } else {
    const err = await res.json().catch(() => ({}));
    console.error(`❌ ${r.name}: ${res.status}`, err);
  }
}

async function main() {
  console.log('🍽️  モックレストラン登録開始...\n');
  console.log(`API: ${API}\n`);

  // 各ユーザーでログインしてトークン取得
  const tokens: string[] = [];
  for (const u of USERS) {
    try {
      const token = await login(u.email, u.password);
      tokens.push(token);
      console.log(`🔑 ${u.email} ログイン成功`);
    } catch (e) {
      console.error(`❌ ${u.email} ログイン失敗:`, e);
    }
  }

  if (tokens.length === 0) {
    console.error('❌ ログインできるユーザーがいません。先に seed-users.ts を実行してください。');
    return;
  }

  console.log('');

  // レストランをユーザーに分散して登録
  for (let i = 0; i < MOCK_RESTAURANTS.length; i++) {
    const token = tokens[i % tokens.length];
    await createRestaurant(token, MOCK_RESTAURANTS[i]);
  }

  console.log('\n✨ 完了!');
  console.log(`\n登録レストラン: ${MOCK_RESTAURANTS.length}件`);
  console.log('─'.repeat(50));
  MOCK_RESTAURANTS.forEach((r) => {
    console.log(`  ${r.name.padEnd(20)} | ${r.genres.join(', ').padEnd(15)} | 写真${r.photoUrls.length}枚`);
  });
}

main();
