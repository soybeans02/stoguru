/**
 * 「テーマで探す」と「ジャンルで探す」用の静的テーマ定義。
 * 各テーマはマッチ用のキーワードを持ち、ThemeListScreen で
 * フィードを絞り込みするのに使う。
 *
 * 特集記事（microCMS）とは独立。テーマ/ジャンルは UI 上のフィルタ用、
 * 特集は読み物コンテンツ。
 */

export interface Theme {
  id: string;          // URL に使う slug（半角英小文字 + ハイフン）
  label: string;       // ホームのカードに出る短い名前（一人飲み 等）
  description: string; // ヒーロー下のサブタイトル
  image: string;       // カードと詳細画面ヒーローで使う写真
  keywords: string[];  // フィード絞り込み用（genre / scene / description 対象）
  /** 'theme' = シーン系（ひとり/デート等）、'genre' = ジャンル系（ラーメン/寿司等） */
  kind?: 'theme' | 'genre';
}

/* シーン系テーマ（気分・用途で探す） */
export const THEMES: Theme[] = [
  {
    id: 'solo',
    label: 'ひとり飲み',
    description: 'カウンターでひっそり。気を使わず一人で楽しめるお店。',
    image: 'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=400&q=70',
    keywords: ['ひとり', 'カウンター', '立ち飲み', 'バー'],
  },
  {
    id: 'date',
    label: 'デート',
    description: '雰囲気重視。記念日や特別な夜に連れて行きたいレストラン。',
    image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&q=70',
    keywords: ['デート', '記念日', 'イタリアン', 'フレンチ', '夜景'],
  },
  {
    id: 'friends',
    label: '友達と',
    description: 'ワイワイ盛り上がれる、シェアして楽しい店。',
    image: 'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=400&q=70',
    keywords: ['友達', '飲み', '居酒屋', '焼肉', '韓国料理'],
  },
  {
    id: 'lunch',
    label: 'ランチ',
    description: 'コスパ最強。平日のお昼にサクッと美味しいやつ。',
    image: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=400&q=70',
    keywords: ['ランチ', 'ラーメン', 'うどん', 'そば', '定食', 'カフェ'],
  },
  {
    id: 'late-night',
    label: '深夜営業',
    description: '終電を逃した夜でも開いてる、頼りになるお店。',
    image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&q=70',
    keywords: ['深夜', 'バー', '居酒屋', '24時間'],
  },
  {
    id: 'takeout',
    label: 'テイクアウト',
    description: '公園・お部屋・職場で。持ち帰り向きのテイクアウトグルメ。',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=70',
    keywords: ['テイクアウト', 'お弁当', 'サンドイッチ', 'バーガー', 'パン'],
  },
];

/* ジャンル系（食べたい料理ジャンルで探す） */
export const GENRES_AS_THEMES: Theme[] = [
  {
    id: 'ramen',
    label: 'ラーメン',
    description: '一杯に込められた職人の技。今日の気分はどの一杯？',
    image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&q=70',
    keywords: ['ラーメン', '中華そば', 'つけ麺'],
    kind: 'genre',
  },
  {
    id: 'sushi',
    label: '寿司',
    description: '握りも回転も。新鮮なネタを楽しむお店。',
    image: 'https://images.unsplash.com/photo-1553621042-f6e147245754?w=400&q=70',
    keywords: ['寿司', '鮨', 'すし'],
    kind: 'genre',
  },
  {
    id: 'yakiniku',
    label: '焼肉',
    description: 'ご褒美の一日に。タン塩からじっくり。',
    image: 'https://images.unsplash.com/photo-1535473895227-bdecb20fb157?w=400&q=70',
    keywords: ['焼肉', '韓国料理', 'ホルモン'],
    kind: 'genre',
  },
  {
    id: 'italian',
    label: 'イタリアン',
    description: 'パスタからピッツァ、トラットリアからリストランテまで。',
    image: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=400&q=70',
    keywords: ['イタリアン', 'パスタ', 'ピッツァ', 'ピザ'],
    kind: 'genre',
  },
  {
    id: 'cafe',
    label: 'カフェ',
    description: 'コーヒー一杯で長居できる、お気に入りの居場所。',
    image: 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=400&q=70',
    keywords: ['カフェ', 'コーヒー', 'ベーカリー'],
    kind: 'genre',
  },
  {
    id: 'izakaya',
    label: '居酒屋',
    description: '今日の疲れを流す、いつもの一杯と肴。',
    image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400&q=70',
    keywords: ['居酒屋', '飲み', 'バル'],
    kind: 'genre',
  },
  {
    id: 'chinese',
    label: '中華',
    description: '町中華から本格点心まで、奥深い中華料理。',
    image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&q=70',
    keywords: ['中華', '中国料理', '点心', '小籠包', '餃子'],
    kind: 'genre',
  },
  {
    id: 'korean',
    label: '韓国料理',
    description: 'サムギョプサル、チゲ、本場のヤンニョム。',
    image: 'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=400&q=70',
    keywords: ['韓国料理', '韓国', 'サムギョプサル', 'チゲ'],
    kind: 'genre',
  },
];

const ALL_THEMES: Theme[] = [...THEMES, ...GENRES_AS_THEMES];

/** 静的テーマに無い ID（= GENRES の生ジャンル名）が来た時に、
 *  ジャンル名そのものを keyword にした「自動テーマ」を生成して返す。
 *  これでホームの全件モーダルからどのジャンルチップを押しても、
 *  「テーマが見つかりません」にならず常に検索結果が出せる。 */
function autoGenreTheme(rawId: string): Theme {
  // GENRE_PHOTOS との連携は呼び出し側 (ThemeListScreen) で hint として
  // 名前を渡すので、image はここでは Unsplash の汎用食事写真にする。
  return {
    id: rawId,
    label: rawId,
    description: `${rawId}が美味しいお店をまとめて見る。`,
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=70',
    keywords: [rawId],
    kind: 'genre',
  };
}

export function findTheme(id: string): Theme | null {
  const hit = ALL_THEMES.find((t) => t.id === id);
  if (hit) return hit;
  // GENRES の生ジャンル名が URL に来る（/themes/焼き鳥 等）場合の救済。
  // 完全に未知の ID の時だけ null を返したいので、最低限の妥当性だけ確認。
  if (typeof id === 'string' && id.length > 0 && id.length <= 30) {
    return autoGenreTheme(id);
  }
  return null;
}
