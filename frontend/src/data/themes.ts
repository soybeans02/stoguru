/**
 * 「テーマで探す」用の静的テーマ定義。
 * 各テーマはマッチ用のキーワードを持ち、ThemeListScreen で
 * フィードを絞り込みするのに使う。
 *
 * 特集記事（microCMS）とは独立。テーマは UI 上のフィルタ用、
 * 特集は読み物コンテンツ。
 */

export interface Theme {
  id: string;          // URL に使う slug（半角英小文字 + ハイフン）
  label: string;       // ホームのカードに出る短い名前（一人飲み 等）
  description: string; // ヒーロー下のサブタイトル
  image: string;       // カードと詳細画面ヒーローで使う写真
  keywords: string[];  // フィード絞り込み用（genre / scene / description 対象）
}

export const THEMES: Theme[] = [
  {
    id: 'solo',
    label: 'ひとり飲み',
    description: 'カウンターでひっそり。気を使わず一人で楽しめるお店。',
    image: 'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=800&q=80',
    keywords: ['ひとり', 'カウンター', '立ち飲み', 'バー'],
  },
  {
    id: 'date',
    label: 'デート',
    description: '雰囲気重視。記念日や特別な夜に連れて行きたいレストラン。',
    image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80',
    keywords: ['デート', '記念日', 'イタリアン', 'フレンチ', '夜景'],
  },
  {
    id: 'friends',
    label: '友達と',
    description: 'ワイワイ盛り上がれる、シェアして楽しい店。',
    image: 'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=800&q=80',
    keywords: ['友達', '飲み', '居酒屋', '焼肉', '韓国料理'],
  },
  {
    id: 'lunch',
    label: 'ランチ',
    description: 'コスパ最強。平日のお昼にサクッと美味しいやつ。',
    image: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&q=80',
    keywords: ['ランチ', 'ラーメン', 'うどん', 'そば', '定食', 'カフェ'],
  },
  {
    id: 'late-night',
    label: '深夜営業',
    description: '終電を逃した夜でも開いてる、頼りになるお店。',
    image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    keywords: ['深夜', 'バー', '居酒屋', '24時間'],
  },
  {
    id: 'takeout',
    label: 'テイクアウト',
    description: '公園・お部屋・職場で。持ち帰り向きのテイクアウトグルメ。',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80',
    keywords: ['テイクアウト', 'お弁当', 'サンドイッチ', 'バーガー', 'パン'],
  },
];

export function findTheme(id: string): Theme | null {
  return THEMES.find((t) => t.id === id) ?? null;
}
