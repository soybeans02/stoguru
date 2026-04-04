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
  };
  videoUrl: string;
  photoEmoji: string; // 後で実写真に差し替え
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
  { id: 'ひとり', emoji: '🧑', label: 'ひとり' },
  { id: 'デート', emoji: '👫', label: 'デート' },
  { id: '友達', emoji: '👥', label: '友達' },
  { id: '飲み', emoji: '🍻', label: '飲み' },
] as const;

export const GENRES = [
  'ラーメン', '焼肉', '寿司', 'カフェ', '居酒屋',
  'イタリアン', 'カレー', 'ハンバーガー', '中華', '韓国料理',
  'スイーツ', 'パン', 'うどん', '和食', 'フレンチ',
] as const;
