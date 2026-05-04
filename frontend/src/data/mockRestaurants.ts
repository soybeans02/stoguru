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
  { id: 'ひとり', emoji: '🧑', label: 'ひとり', photo: 'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=400&q=80' },
  { id: 'デート', emoji: '👫', label: 'デート', photo: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&q=80' },
  { id: '友達', emoji: '👥', label: '友達', photo: 'https://images.unsplash.com/photo-1529543544282-ea669407fca3?w=400&q=80' },
  { id: '飲み', emoji: '🍻', label: '飲み', photo: 'https://images.unsplash.com/photo-1514218953589-2d7d37efd2dc?w=400&q=80' },
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

/** ジャンル名 → 代表写真 URL */
export const GENRE_PHOTOS: Record<string, string> = {
  ラーメン: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&q=80',
  寿司: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&q=80',
  焼肉: 'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=400&q=80',
  イタリアン: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=400&q=80',
  カフェ: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&q=80',
  居酒屋: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400&q=80',
  カレー: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&q=80',
  ハンバーガー: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80',
  中華: 'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=400&q=80',
  韓国料理: 'https://images.unsplash.com/photo-1583224944844-5b268c057b72?w=400&q=80',
  スイーツ: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&q=80',
  パン: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80',
  うどん: 'https://images.unsplash.com/photo-1618841557871-b4664fbf0cb3?w=400&q=80',
  和食: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80',
  フレンチ: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&q=80',
  そば: 'https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=400&q=80',
  天ぷら: 'https://images.unsplash.com/photo-1562158074-0b9e4ba33d9e?w=400&q=80',
  とんかつ: 'https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=400&q=80',
  お好み焼き: 'https://images.unsplash.com/photo-1611601679008-3a0db49ed4d6?w=400&q=80',
  たこ焼き: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=400&q=80',
  ステーキ: 'https://images.unsplash.com/photo-1558030006-450675393462?w=400&q=80',
  タイ料理: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=400&q=80',
  ベトナム料理: 'https://images.unsplash.com/photo-1583032015879-e5022cb87c3b?w=400&q=80',
  メキシカン: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&q=80',
  インド料理: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&q=80',
  バー: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=400&q=80',
};
