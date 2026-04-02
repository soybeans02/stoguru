import type { GenreTag } from '../constants/genre';

/** Google Places types → ジャンルタグ */
const TYPE_MAP: Record<string, GenreTag> = {
  cafe: 'カフェ',
  bakery: 'パン',
  bar: '居酒屋',
};

/** お店の名前に含まれるキーワード → ジャンルタグ */
const NAME_PATTERNS: [RegExp, GenreTag][] = [
  [/スイーツ|ケーキ|パティスリー|パフェ|甘味|dessert|sweets|patisserie/i, 'スイーツ'],
  [/居酒屋|酒場|バル|立ち飲み|izakaya/i, '居酒屋'],
  [/ラーメン|らーめん|拉麺|ramen/i, 'ラーメン'],
  [/カフェ|珈琲|コーヒー|cafe|coffee/i, 'カフェ'],
  [/焼肉|焼き肉|ホルモン|yakiniku/i, '焼肉'],
  [/寿司|鮨|すし|sushi/i, '寿司'],
  [/イタリアン|イタリア料理|トラットリア|リストランテ|italian|trattoria/i, 'イタリアン'],
  [/中華|中国料理|チャイニーズ|chinese/i, '中華'],
  [/和食|割烹|懐石|料亭|日本料理|japanese/i, '和食'],
  [/カレー|curry/i, 'カレー'],
  [/フレンチ|フランス料理|ビストロ|french|bistro/i, 'フレンチ'],
  [/韓国|コリアン|korean/i, '韓国料理'],
  [/タイ料理|タイ食|thai/i, 'タイ料理'],
  [/ハンバーガー|バーガー|burger/i, 'ハンバーガー'],
  [/パン屋|ベーカリー|ブーランジェリー|bakery|boulangerie/i, 'パン'],
  [/うどん|udon/i, 'うどん'],
  [/そば|蕎麦|soba/i, 'そば'],
  [/天ぷら|天麩羅|tempura/i, '天ぷら'],
  [/とんかつ|豚カツ|tonkatsu/i, 'とんかつ'],
  [/ピザ|ピッツァ|pizza/i, 'ピザ'],
];

/**
 * Google Places のデータからジャンルタグを自動推定
 * @param name お店の名前
 * @param types Google Places API の types 配列
 */
export function detectGenres(name: string, types: string[] = []): GenreTag[] {
  const found = new Set<GenreTag>();

  // Google Places types からマッピング
  for (const t of types) {
    const mapped = TYPE_MAP[t];
    if (mapped) found.add(mapped);
  }

  // 名前からキーワードマッチ
  for (const [pattern, genre] of NAME_PATTERNS) {
    if (pattern.test(name)) found.add(genre);
  }

  return [...found];
}
