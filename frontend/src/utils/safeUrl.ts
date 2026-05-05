/**
 * `<a href={url}>` や `<img src={url}>` に値を渡す前のスキーム検証。
 * 外部入力（インフルエンサーがプロフィールに入力した URL、レストラン投稿の
 * videoUrl/photoUrls 等）が `javascript:` / `data:` スキームを含むと
 * クリック / レンダリング時に XSS が発火するため、http(s) のみ許可する。
 *
 * バックエンドの Zod でも同等のチェックが入っているが、フロントでも
 * 防御的に検証する（古いデータ、外部 API レスポンス等の二重保険）。
 */
export function safeHttpUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}
