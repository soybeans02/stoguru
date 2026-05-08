/**
 * テーマ（ジャンル / 気分）とレストランのマッチング判定。
 *
 * 同じ判定ロジックをホームの件数バッジ（DiscoveryHome.genreCounts）と
 * テーマ詳細画面のフィルタ（ThemeListScreen.matched）で共有するための
 * 純関数。ここを 1 個に寄せないと、ホームで「3 件」と出てるのにテーマを
 * タップすると違う件数、という UX 不一致が発生する。
 *
 * マッチ範囲は 5 フィールドの AND OR：
 *   r.name + r.genre + r.description + r.genres[] + r.scene[]
 * を join して lowercase した上で、theme.keywords のいずれかが
 * 含まれていれば true。
 */

export type ThemeMatchable = {
  name?: string;
  genre?: string;
  description?: string;
  genres?: string[];
  scene?: string[];
};

/** restaurant が theme.keywords のいずれかに該当すれば true。 */
export function matchesTheme(r: ThemeMatchable, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return false;
  const text = [
    r.name ?? '',
    r.genre ?? '',
    r.description ?? '',
    ...(r.genres ?? []),
    ...(r.scene ?? []),
  ].join(' ').toLowerCase();
  if (!text) return false;
  return keywords.some((kw) => text.includes(kw.toLowerCase()));
}
