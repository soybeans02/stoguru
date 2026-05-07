/**
 * 住所文字列から都道府県を抽出する純粋関数。
 *
 * 旧版は `address.startsWith('大阪府')` で判定していたが、以下のような
 * 実データで外れる事故があった:
 *   - "〒530-0001 大阪府..." (郵便番号プレフィックス)
 *   - "〒1500041東京都..."   (ハイフンも空白も無いケース)
 *   - "Osaka, Japan"         (英語表記)        ← これは諦める
 *   - "  大阪府..."          (先頭空白)
 *
 * よくあるケースだけでも include ベースに変えると startsWith より頑強。
 * PREFECTURES 配列を 1 つずつ走査して、住所内に出現する最初の都道府県を返す。
 *
 * Backend へのマイグレーションは不要 — クライアント側で派生させるだけで
 * 既存全データに即適用できる。
 */
import { PREFECTURES } from '../data/mockRestaurants';

export function extractPrefecture(address: string | null | undefined): string | null {
  if (!address) return null;
  // 並び順で先勝ちする (e.g. "京都府" を "東京都" より先に書いた場合に
  // "東京都" が先頭で誤マッチしないよう、住所内の最初の出現位置で決める)。
  let bestIdx = Infinity;
  let best: string | null = null;
  for (const pref of PREFECTURES) {
    const i = address.indexOf(pref);
    if (i !== -1 && i < bestIdx) {
      bestIdx = i;
      best = pref;
    }
  }
  return best;
}

/**
 * `selectedAreas` (PREFECTURES のサブセット) のいずれかに住所がマッチするか。
 * 選択が空なら常に true (フィルタ無しと同じ意味)。
 */
export function matchesAnyPrefecture(
  address: string | null | undefined,
  selectedAreas: string[],
): boolean {
  if (selectedAreas.length === 0) return true;
  const pref = extractPrefecture(address);
  if (!pref) return false;
  return selectedAreas.includes(pref);
}
