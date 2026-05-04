import { lazy } from 'react';

/**
 * lazy() のチャンクロードに失敗した場合、自動でリトライするラッパー。
 *
 * - Vercel デプロイ直後の古いチャンクハッシュ 404
 * - CDN コールドスタート
 * - ネットワーク瞬断
 * などで起きる「初回エラー → 再読み込みで治る」を救う。
 *
 * リトライ間隔は exponential backoff（200ms → 400ms → 800ms）で、最大 3 回試行。
 * 全部失敗した場合のみ元のエラーを throw（ErrorBoundary に到達）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 3,
) {
  return lazy(async () => {
    let lastError: unknown;
    for (let i = 0; i < retries; i++) {
      try {
        return await factory();
      } catch (err) {
        lastError = err;
        // チャンクが古い可能性 → window.location.reload する案もあるが、
        // ユーザーの状態を破壊するのでやめて、シンプルにリトライ
        if (i < retries - 1) {
          await new Promise((r) => setTimeout(r, 200 * Math.pow(2, i)));
        }
      }
    }
    throw lastError;
  });
}
