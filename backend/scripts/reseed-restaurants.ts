/**
 * モックデータ全削除 + 新規20件投入
 *
 * 使い方:
 *   cd backend
 *   npx tsx scripts/reseed-restaurants.ts
 */

const API = process.env.API_URL ?? 'https://stoguru-api.onrender.com/api';

// 既存モックID（全22件）
const OLD_IDS = [
  // seed-restaurants.ts
  'mock-ramen-01', 'mock-sushi-01', 'mock-yakiniku-01', 'mock-cafe-01',
  'mock-curry-01', 'mock-italian-01', 'mock-korean-01', 'mock-burger-01',
  'mock-tempura-01', 'mock-kushikatsu-01', 'mock-chinese-01', 'mock-okonomiyaki-01',
  // seed-restaurants-2.ts
  'mock-udon-01', 'mock-soba-01', 'mock-thai-01', 'mock-pizza-01',
  'mock-steak-01', 'mock-seafood-01', 'mock-gyoza-01', 'mock-dessert-01',
  'mock-yakitori-01', 'mock-french-01',
];

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

async function deleteRestaurant(token: string, id: string): Promise<boolean> {
  const res = await fetch(`${API}/influencer/restaurants/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
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

// 大阪・新規20件
const RESTAURANTS = [
  {
    id: 'mock-pho-01',
    name: 'フォー・サイゴン',
    address: '大阪市中央区心斎橋筋1-9-2',
    lat: 34.6735, lng: 135.5005,
    genres: ['ベトナム料理', 'アジアン'],
    scene: ['ひとり', '友達'],
    priceRange: '¥800〜¥1,500',
    photoUrls: [
      'https://images.unsplash.com/photo-1583224944844-5b268c057b8c?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1576577445504-6af96477db52?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1587116288118-56068e06763d?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/pho_saigon_osaka/'],
    description: '本場ベトナムのフォー専門店。サクッと一杯。',
    visibility: 'public',
  },
  {
    id: 'mock-tacos-01',
    name: 'タコス・エルパソ',
    address: '大阪市西区北堀江1-12-3',
    lat: 34.6755, lng: 135.4905,
    genres: ['メキシカン', '洋食'],
    scene: ['友達', 'デート', '飲み会'],
    priceRange: '¥1,500〜¥3,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@tacos_elpaso'],
    description: '堀江のメキシカンバル。タコスとマルガリータが◎',
    visibility: 'public',
  },
  {
    id: 'mock-india-01',
    name: 'スパイス・ヒマラヤ',
    address: '大阪市生野区鶴橋2-15-7',
    lat: 34.6650, lng: 135.5315,
    genres: ['インド料理', 'カレー'],
    scene: ['ひとり', '友達', '家族'],
    priceRange: '¥900〜¥1,800',
    photoUrls: [
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/spice_himalaya/'],
    description: 'ナン食べ放題ランチが人気の本格インド・ネパール料理。',
    visibility: 'public',
  },
  {
    id: 'mock-spain-01',
    name: 'バル・エスパーニャ',
    address: '大阪市北区曽根崎新地1-5-19',
    lat: 34.6985, lng: 135.4985,
    genres: ['スペイン料理', 'バル'],
    scene: ['デート', '飲み会', '記念日'],
    priceRange: '¥3,000〜¥5,500',
    photoUrls: [
      'https://images.unsplash.com/photo-1515443961218-a51367888e4b?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1534080564583-6be75777b70a?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1559847844-5315695dadae?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/bar_espana_kitashinchi/'],
    description: '北新地の本格スペインバル。パエリアとイベリコ豚が看板。',
    visibility: 'public',
  },
  {
    id: 'mock-okinawa-01',
    name: '島宴 ちゅらさん',
    address: '大阪市浪速区恵美須東1-18-3',
    lat: 34.6520, lng: 135.5060,
    genres: ['沖縄料理', '居酒屋'],
    scene: ['友達', '飲み会'],
    priceRange: '¥2,500〜¥4,500',
    photoUrls: [
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1572715376701-98568319fd0b?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@churasan_okinawa'],
    description: '泡盛100種類。ゴーヤチャンプルーとラフテーが本場の味。',
    visibility: 'public',
  },
  {
    id: 'mock-motsu-01',
    name: 'もつ鍋 田なべ',
    address: '大阪市福島区福島5-9-2',
    lat: 34.6940, lng: 135.4865,
    genres: ['もつ鍋', '居酒屋'],
    scene: ['友達', '飲み会', 'デート'],
    priceRange: '¥3,500〜¥5,500',
    photoUrls: [
      'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/motsunabe_tanabe/'],
    description: '福岡直送モツの絶品鍋。〆のちゃんぽん必食。',
    visibility: 'public',
  },
  {
    id: 'mock-teppan-01',
    name: '鉄板焼き 結',
    address: '大阪市中央区北浜2-1-21',
    lat: 34.6905, lng: 135.5050,
    genres: ['鉄板焼き', '洋食'],
    scene: ['デート', '記念日'],
    priceRange: '¥8,000〜¥15,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1558030006-450675393462?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/teppanyaki_yui/'],
    description: '目の前で焼き上げる神戸牛フィレ。デートに最適。',
    visibility: 'public',
  },
  {
    id: 'mock-sukiyaki-01',
    name: 'すき焼き 三嶋亭',
    address: '大阪市中央区難波千日前11-6',
    lat: 34.6660, lng: 135.5025,
    genres: ['すき焼き', '和食'],
    scene: ['デート', '記念日', '家族'],
    priceRange: '¥6,000〜¥12,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1582450871972-ab5ca641643d?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1604908554049-1d62a019e6db?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.youtube.com/@sukiyaki_mishimatei'],
    description: '法善寺横丁の老舗すき焼き。昔ながらの関西風割下。',
    visibility: 'public',
  },
  {
    id: 'mock-unagi-01',
    name: 'うなぎ 大和田',
    address: '大阪市中央区道頓堀1-7-21',
    lat: 34.6680, lng: 135.5020,
    genres: ['うなぎ', '和食'],
    scene: ['デート', '記念日', 'ひとり'],
    priceRange: '¥4,000〜¥7,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1584947897558-4e06f1cd1306?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/unagi_owada/'],
    description: '創業100年。注文後にさばく天然うなぎの蒲焼き。',
    visibility: 'public',
  },
  {
    id: 'mock-tonkatsu-01',
    name: 'とんかつ KYK',
    address: '大阪市天王寺区悲田院町10-39',
    lat: 34.6470, lng: 135.5135,
    genres: ['とんかつ', '洋食'],
    scene: ['ひとり', '友達', '家族'],
    priceRange: '¥1,500〜¥2,800',
    photoUrls: [
      'https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@tonkatsu_kyk'],
    description: '天王寺のサクサク厚切りとんかつ。ご飯おかわり自由。',
    visibility: 'public',
  },
  {
    id: 'mock-tachinomi-01',
    name: '立ち呑み 銀座屋',
    address: '大阪市都島区東野田町2-9-7',
    lat: 34.7025, lng: 135.5340,
    genres: ['立ち飲み', '居酒屋'],
    scene: ['ひとり', '友達', '飲み会'],
    priceRange: '¥1,000〜¥2,500',
    photoUrls: [
      'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1574096079513-d8259312b785?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1587574293340-e0011c4e8ecf?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/ginzaya_tachinomi/'],
    description: '京橋の名物立ち飲み。串カツとおでんがお手頃。',
    visibility: 'public',
  },
  {
    id: 'mock-gibier-01',
    name: 'ジビエダイニング 山幸',
    address: '大阪市中央区谷町6-4-29',
    lat: 34.6790, lng: 135.5170,
    genres: ['ジビエ', 'フレンチ'],
    scene: ['デート', '記念日'],
    priceRange: '¥7,000〜¥13,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/gibier_sankou/'],
    description: '猪・鹿・鴨を季節で味わうフレンチジビエ。',
    visibility: 'public',
  },
  {
    id: 'mock-bakery-01',
    name: 'ブーランジェリー グラン',
    address: '大阪市北区中之島3-2-4',
    lat: 34.6925, lng: 135.4945,
    genres: ['ベーカリー', 'パン'],
    scene: ['ひとり', 'モーニング'],
    priceRange: '¥400〜¥1,200',
    photoUrls: [
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1568254183919-78a4f43a2877?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/boulangerie_grand/'],
    description: '中之島の人気ベーカリー。クロワッサンが朝から行列。',
    visibility: 'public',
  },
  {
    id: 'mock-hawaii-01',
    name: 'アロハカフェ ピリカラ',
    address: '大阪市西区南堀江1-15-23',
    lat: 34.6735, lng: 135.4920,
    genres: ['ハワイアン', 'カフェ'],
    scene: ['デート', '友達', 'モーニング'],
    priceRange: '¥1,200〜¥2,200',
    photoUrls: [
      'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@aloha_pilikala'],
    description: '南堀江のロコモコ&ポケ専門。海外気分のブランチ。',
    visibility: 'public',
  },
  {
    id: 'mock-pancake-01',
    name: 'パンケーキ&コーヒー リコ',
    address: '大阪市中央区心斎橋筋2-7-25',
    lat: 34.6720, lng: 135.5015,
    genres: ['パンケーキ', 'カフェ'],
    scene: ['デート', '友達'],
    priceRange: '¥1,000〜¥1,800',
    photoUrls: [
      'https://images.unsplash.com/photo-1528207776546-365bb710ee93?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1554520735-0a6b8b6ce8b7?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/pancake_rico_osaka/'],
    description: 'ふわふわスフレパンケーキ。並んでも食べたい絶品。',
    visibility: 'public',
  },
  {
    id: 'mock-craftbeer-01',
    name: 'クラフトビア タップ7',
    address: '大阪市福島区福島6-15-12',
    lat: 34.6960, lng: 135.4830,
    genres: ['クラフトビール', 'バー'],
    scene: ['友達', '飲み会', 'デート'],
    priceRange: '¥2,500〜¥4,500',
    photoUrls: [
      'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1518176258769-f227c798150e?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1571767454098-246b94fbcf70?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@craftbeer_tap7'],
    description: '常時24種類のクラフトビール。フードも本格派。',
    visibility: 'public',
  },
  {
    id: 'mock-monja-01',
    name: 'もんじゃ 月島亭',
    address: '大阪市中央区難波4-1-15',
    lat: 34.6660, lng: 135.5005,
    genres: ['もんじゃ', '鉄板'],
    scene: ['友達', '飲み会'],
    priceRange: '¥1,800〜¥3,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/monja_tsukishimatei/'],
    description: '関西で本場の月島もんじゃが食べられる希少店。',
    visibility: 'public',
  },
  {
    id: 'mock-kakigori-01',
    name: 'かき氷専門 雪と氷',
    address: '大阪市中央区谷町6-13-3',
    lat: 34.6770, lng: 135.5170,
    genres: ['かき氷', 'スイーツ'],
    scene: ['ひとり', 'デート', '友達'],
    priceRange: '¥800〜¥1,500',
    photoUrls: [
      'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@yuki_to_koori'],
    description: '通年営業のふわふわ天然氷かき氷。季節フルーツ豊富。',
    visibility: 'public',
  },
  {
    id: 'mock-sosaku-01',
    name: '創作和食 燈火',
    address: '大阪市北区曾根崎新地2-3-12',
    lat: 34.6995, lng: 135.4970,
    genres: ['創作和食', '和食'],
    scene: ['デート', '記念日', '飲み会'],
    priceRange: '¥6,000〜¥10,000',
    photoUrls: [
      'https://images.unsplash.com/photo-1553621042-f6e147245754?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1535399831218-d5bd36d1a6b3?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.instagram.com/wasyoku_tomoshibi/'],
    description: '北新地の隠れ家。季節の食材を活かしたモダン懐石。',
    visibility: 'public',
  },
  {
    id: 'mock-kchicken-01',
    name: '韓国チキン ホットソウル',
    address: '大阪市生野区鶴橋3-7-22',
    lat: 34.6635, lng: 135.5305,
    genres: ['韓国料理', 'チキン'],
    scene: ['友達', '飲み会'],
    priceRange: '¥2,000〜¥3,500',
    photoUrls: [
      'https://images.unsplash.com/photo-1626082929543-5bab6f17e8b1?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1626645738196-c2a7c87a8f9e?w=800&h=1200&fit=crop',
      'https://images.unsplash.com/photo-1623653387945-2fd25214f8fc?w=800&h=1200&fit=crop',
    ],
    urls: ['https://www.tiktok.com/@hot_seoul_chicken'],
    description: '鶴橋の韓国チキン専門。ヤンニョム&チメク最高。',
    visibility: 'public',
  },
];

async function main() {
  console.log('🍽️  全ユーザーログイン...\n');
  const tokens: string[] = [];
  for (const u of USERS) {
    try {
      const t = await login(u.email, u.password);
      tokens.push(t);
      console.log(`🔑 ${u.email}`);
    } catch {
      console.error(`❌ ${u.email} ログイン失敗`);
    }
  }
  if (tokens.length === 0) return;

  // 既存削除（誰が所有してるか不明なので全員で試す）
  console.log(`\n🗑️  既存${OLD_IDS.length}件を削除中...`);
  for (const id of OLD_IDS) {
    let deleted = false;
    for (const t of tokens) {
      if (await deleteRestaurant(t, id)) {
        console.log(`  ✅ ${id}`);
        deleted = true;
        break;
      }
    }
    if (!deleted) console.log(`  ⏭️  ${id} (見つからない or 既に削除済み)`);
  }

  // 新規20件作成
  console.log(`\n🏪 新規${RESTAURANTS.length}件を登録中...`);
  for (let i = 0; i < RESTAURANTS.length; i++) {
    const t = tokens[i % tokens.length];
    const r = RESTAURANTS[i];
    await createRestaurant(t, r.id, r);
  }

  console.log(`\n✨ 完了!`);
}

main();
