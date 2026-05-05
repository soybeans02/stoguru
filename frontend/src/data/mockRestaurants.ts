// スワイプ用モックデータ（梅田エリア）
export interface SwipeRestaurant {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  genre: string;
  scene: string[];
  priceRange: string;
  distance: string;
  influencer: {
    name: string;
    handle: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    url?: string;
  };
  videoUrl: string;
  photoEmoji: string;
  photoUrls?: string[];
  genres?: string[];
  description?: string;
}

export const MOCK_RESTAURANTS: SwipeRestaurant[] = [
  {
    id: '1',
    name: 'トラットリア梅田',
    address: '大阪市北区梅田1-2-3',
    lat: 34.7025, lng: 135.4959,
    genre: 'イタリアン',
    scene: ['デート', '友達'],
    priceRange: '¥1,500〜',
    distance: '徒歩3分',
    influencer: { name: '梅田グルメ', handle: '@umeda_gourmet', platform: 'tiktok' },
    videoUrl: 'https://tiktok.com/@umeda_gourmet/example1',
    photoEmoji: '🍝',
  },
  {
    id: '2',
    name: '麺屋 極 梅田店',
    address: '大阪市北区曽根崎2-1-1',
    lat: 34.7040, lng: 135.5010,
    genre: 'ラーメン',
    scene: ['ひとり', '友達'],
    priceRange: '¥900〜',
    distance: '徒歩5分',
    influencer: { name: 'ラーメン太郎', handle: '@ramen_taro', platform: 'tiktok' },
    videoUrl: 'https://tiktok.com/@ramen_taro/example2',
    photoEmoji: '🍜',
  },
  {
    id: '3',
    name: '鮨 なかむら',
    address: '大阪市北区曽根崎新地1-5-5',
    lat: 34.6975, lng: 135.4980,
    genre: '寿司',
    scene: ['デート'],
    priceRange: '¥8,000〜',
    distance: '徒歩8分',
    influencer: { name: 'グルメ探偵', handle: '@gourmet_tantei', platform: 'instagram' },
    videoUrl: 'https://instagram.com/gourmet_tantei/example3',
    photoEmoji: '🍣',
  },
  {
    id: '4',
    name: '焼肉ホルモン 龍',
    address: '大阪市北区角田町1-1',
    lat: 34.7035, lng: 135.5005,
    genre: '焼肉',
    scene: ['友達', '飲み'],
    priceRange: '¥3,500〜',
    distance: '徒歩4分',
    influencer: { name: '肉好きOL', handle: '@niku_ol', platform: 'tiktok' },
    videoUrl: 'https://tiktok.com/@niku_ol/example4',
    photoEmoji: '🥩',
  },
  {
    id: '5',
    name: 'Café MUGI',
    address: '大阪市北区茶屋町2-3',
    lat: 34.7060, lng: 135.4985,
    genre: 'カフェ',
    scene: ['ひとり', 'デート'],
    priceRange: '¥800〜',
    distance: '徒歩6分',
    influencer: { name: 'カフェ巡り', handle: '@cafe_meguri', platform: 'instagram' },
    videoUrl: 'https://instagram.com/cafe_meguri/example5',
    photoEmoji: '☕',
  },
  {
    id: '6',
    name: 'スパイスカレー TADA',
    address: '大阪市北区中崎西2-1',
    lat: 34.7080, lng: 135.5030,
    genre: 'カレー',
    scene: ['ひとり', '友達'],
    priceRange: '¥1,200〜',
    distance: '徒歩10分',
    influencer: { name: '大阪スパイス', handle: '@osaka_spice', platform: 'tiktok' },
    videoUrl: 'https://tiktok.com/@osaka_spice/example6',
    photoEmoji: '🍛',
  },
  {
    id: '7',
    name: '韓国料理 ソウル食堂',
    address: '大阪市北区堂山町3-2',
    lat: 34.7050, lng: 135.5020,
    genre: '韓国料理',
    scene: ['友達', '飲み'],
    priceRange: '¥2,000〜',
    distance: '徒歩7分',
    influencer: { name: 'K-foodラバー', handle: '@kfood_lover', platform: 'tiktok' },
    videoUrl: 'https://tiktok.com/@kfood_lover/example7',
    photoEmoji: '🥟',
  },
  {
    id: '8',
    name: 'BURGER STAND UMEDA',
    address: '大阪市北区梅田3-1-1',
    lat: 34.6995, lng: 135.4940,
    genre: 'ハンバーガー',
    scene: ['ひとり', '友達'],
    priceRange: '¥1,300〜',
    distance: '徒歩5分',
    influencer: { name: 'バーガー王', handle: '@burger_king_jp', platform: 'youtube' },
    videoUrl: 'https://youtube.com/@burger_king_jp/example8',
    photoEmoji: '🍔',
  },
];

export const GENRE_EMOJI: Record<string, string> = {
  'イタリアン': '🍝',
  'ラーメン': '🍜',
  '寿司': '🍣',
  '焼肉': '🥩',
  'カフェ': '☕',
  'カレー': '🍛',
  '韓国料理': '🥟',
  'ハンバーガー': '🍔',
  '居酒屋': '🍖',
  'スイーツ': '🍰',
  '中華': '🥡',
  '和食': '🍱',
  'フレンチ': '🥂',
  'タイ料理': '🍜',
  'パン': '🍞',
  'うどん': '🍜',
  'そば': '🍜',
  '天ぷら': '🍤',
  'とんかつ': '🍖',
  'ピザ': '🍕',
};

export const SCENES = [
  // ひとり：カウンター席で一人の食事
  { id: 'ひとり', emoji: '🧑', label: 'ひとり', photo: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=300&q=70' },
  // デート：キャンドルとワイン
  { id: 'デート', emoji: '👫', label: 'デート', photo: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=300&q=70' },
  // 友達：乾杯シーン
  { id: '友達', emoji: '👥', label: '友達', photo: 'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=300&q=70' },
  // 飲み：ビアジョッキで乾杯
  { id: '飲み', emoji: '🍻', label: '飲み', photo: 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=300&q=70' },
] as const;

// 上位 5 ジャンルが先頭。残りは「その他」展開で表示
export const GENRES = [
  'ラーメン', '寿司', '焼肉', 'イタリアン', 'カフェ',
  '居酒屋', 'カレー', 'ハンバーガー', '中華', '韓国料理',
  'スイーツ', 'パン', 'うどん', '和食', 'フレンチ',
  'そば', '天ぷら', 'とんかつ', 'お好み焼き', 'たこ焼き',
  'ステーキ', 'タイ料理', 'ベトナム料理', 'メキシカン',
  'インド料理', 'バー',
] as const;

/** ジャンル名 → 代表写真 URL（Unsplash、重複なし） */
export const GENRE_PHOTOS: Record<string, string> = {
  ラーメン: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=300&q=70',
  寿司: 'https://images.unsplash.com/photo-1553621042-f6e147245754?w=300&q=70',
  焼肉: 'https://images.unsplash.com/photo-1535473895227-bdecb20fb157?w=300&q=70',
  イタリアン: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=300&q=70',
  カフェ: 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=300&q=70',
  居酒屋: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=300&q=70',
  カレー: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=300&q=70',
  ハンバーガー: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&q=70',
  中華: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=300&q=70',
  韓国料理: 'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=300&q=70',
  スイーツ: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=300&q=70',
  パン: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300&q=70',
  うどん: 'https://images.unsplash.com/photo-1631898037220-32d1aa00b8a5?w=300&q=70',
  和食: 'https://images.unsplash.com/photo-1580651315530-69c8e0903883?w=300&q=70',
  フレンチ: 'https://images.unsplash.com/photo-1592861956120-e524fc739696?w=300&q=70',
  そば: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=300&q=70',
  天ぷら: 'https://images.unsplash.com/photo-1606502288749-f0c6c2b63b4d?w=300&q=70',
  とんかつ: 'https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?w=300&q=70',
  お好み焼き: 'https://images.unsplash.com/photo-1611601679008-3a0db49ed4d6?w=300&q=70',
  たこ焼き: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=300&q=70',
  ステーキ: 'https://images.unsplash.com/photo-1558030006-450675393462?w=300&q=70',
  タイ料理: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=300&q=70',
  ベトナム料理: 'https://images.unsplash.com/photo-1503764654157-72d979d9af2f?w=300&q=70',
  メキシカン: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=300&q=70',
  インド料理: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=300&q=70',
  バー: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=300&q=70',
};
