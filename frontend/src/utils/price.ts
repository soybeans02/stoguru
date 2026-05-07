/**
 * 価格レンジ文字列のパース / フィルタ判定。
 *
 * priceRange の保存フォーマットは InfluencerRestaurantForm が生成する:
 *   "¥1,000〜¥2,000"   両端あり
 *   "¥1,000〜"          下限のみ (上限なし)
 *   "〜¥2,000"          上限のみ (下限なし)
 *   ""                  未指定
 * セパレータは 全角 '〜' (U+301C)。
 *
 * 旧コードの問題:
 * 1) フォーム再開時のパースが ASCII '~' だけ見ていて全角 '〜' を見落とす →
 *    「上限なし」保存後に再編集すると上限が下限と同値になっていた。
 * 2) フィルタ側が `replace(/[^0-9]/g, '')` で全数字を結合してから parseInt
 *    していたため "¥1,000〜¥2,000" が 10,002,000 円扱いになっていた。
 *
 * このモジュールは両側で共通利用して上記を退治する。
 */

const HALF_WIDTH_TILDE = '~';
const FULL_WIDTH_TILDE = '〜';
/** 価格未指定扱いの上限値 (フォーム UI が「上限なし」を意味する番兵) */
export const PRICE_NO_MAX = 10000;

/**
 * 全数字トークンを抽出 (",1,000" は 1 トークン扱いで comma を除去)。
 * `\d[\d,]*` は 先頭が数字 + 以降数字 / カンマ の連続列にマッチ。
 */
function extractNumbers(s: string): number[] {
  const tokens = s.match(/\d[\d,]*/g) ?? [];
  return tokens
    .map((t) => parseInt(t.replace(/,/g, ''), 10))
    .filter((n) => Number.isFinite(n));
}

/**
 * 価格レンジ文字列を { min, max } に分解する。
 * - "¥1,000〜¥2,000" → { min: 1000, max: 2000 }
 * - "¥1,000〜"        → { min: 1000, max: PRICE_NO_MAX }
 * - "〜¥2,000"        → { min: 0, max: 2000 }
 * - ""                → null  (未指定)
 *
 * 区切り '〜' (U+301C) と互換のため ASCII '~' も許容。
 */
export function parsePriceRange(
  priceRange: string | null | undefined,
): { min: number; max: number } | null {
  if (!priceRange) return null;
  const s = priceRange.trim();
  if (!s) return null;
  const nums = extractNumbers(s);
  if (nums.length === 0) return null;

  const sep = s.includes(FULL_WIDTH_TILDE)
    ? FULL_WIDTH_TILDE
    : s.includes(HALF_WIDTH_TILDE)
      ? HALF_WIDTH_TILDE
      : '';
  if (!sep) {
    // 数字 1 つだけ。レンジでは無いが「その値ぴったり」 = ピンポイント扱い。
    const v = nums[0];
    return { min: v, max: v };
  }
  const sepIdx = s.indexOf(sep);
  const beforeSep = s.slice(0, sepIdx);
  const afterSep = s.slice(sepIdx + sep.length);
  const beforeNums = extractNumbers(beforeSep);
  const afterNums = extractNumbers(afterSep);
  const min = beforeNums.length > 0 ? beforeNums[0] : 0;
  const max = afterNums.length > 0 ? afterNums[0] : PRICE_NO_MAX;
  return { min, max };
}

/**
 * 店の priceRange と、フィルタの [filterMin, filterMax] が「重なる」かを判定。
 *
 * 範囲フィルタは「店のレンジが filter のレンジ内に少しでも被るか」で判定するのが
 * 自然 (例: 店 ¥1,000〜¥3,000 はフィルタ ¥2,000〜¥4,000 とヒットさせたい)。
 * 旧コードは店レンジを単一値に潰して `>= && <=` だったため、
 * "¥1,000〜¥2,000" が 10,002,000 円扱いで全部外れる事故を起こしていた。
 *
 * filter の min=0 / max=PRICE_NO_MAX は「指定なし」とみなして常に true。
 * 店の priceRange が空 / パース失敗の場合も、ユーザーが価格未登録の店を
 * 落としたくないケースが多いので true (フィルタを掛けてない時と同じ振る舞い)。
 */
export function priceRangeMatches(
  priceRange: string | null | undefined,
  filterMin: number,
  filterMax: number,
): boolean {
  if (filterMin <= 0 && filterMax >= PRICE_NO_MAX) return true;
  const parsed = parsePriceRange(priceRange);
  if (!parsed) return true;
  // 範囲オーバーラップ判定:
  //   store [a, b] と filter [c, d] が交差する ⇔ a <= d かつ b >= c
  return parsed.min <= filterMax && parsed.max >= filterMin;
}
