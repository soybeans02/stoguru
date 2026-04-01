export const GENRE_TAGS = [
  'スイーツ', '居酒屋', 'ラーメン', 'カフェ', '焼肉',
  '寿司', 'イタリアン', '中華', '和食', 'カレー',
  'フレンチ', '韓国料理', 'タイ料理', 'ハンバーガー',
  'パン', 'うどん', 'そば', '天ぷら', 'とんかつ', 'ピザ',
] as const;

export type GenreTag = typeof GENRE_TAGS[number];
