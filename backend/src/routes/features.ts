import { Router, Request, Response } from 'express';

/**
 * microCMS から特集記事を取得するパブリックエンドポイント。
 * 認証不要（誰でも閲覧可）。Content-Type 不要（GET のみ）。
 *
 * 環境変数:
 * - MICROCMS_DOMAIN: サブドメイン部分（例: stoguru-cms）
 * - MICROCMS_API_KEY: API キー
 *
 * 環境変数が未設定なら 200 で空配列を返す（フロントが local fallback で対応）。
 */
const router = Router();

const DOMAIN = process.env.MICROCMS_DOMAIN;
const API_KEY = process.env.MICROCMS_API_KEY;
const ENABLED = !!(DOMAIN && API_KEY);

// 簡易キャッシュ（5 分）
let cache: { items: unknown[]; expiry: number } = { items: [], expiry: 0 };
const CACHE_TTL = 5 * 60_000;

async function fetchFromMicroCMS(path: string): Promise<unknown> {
  if (!ENABLED) return null;
  const url = `https://${DOMAIN}.microcms.io/api/v1${path}`;
  const r = await fetch(url, {
    headers: { 'X-MICROCMS-API-KEY': API_KEY as string },
  });
  if (!r.ok) {
    console.error('[microCMS] fetch failed:', r.status, await r.text().catch(() => ''));
    return null;
  }
  return r.json();
}

router.get('/features', async (_req: Request, res: Response) => {
  if (!ENABLED) {
    res.json({ contents: [] });
    return;
  }
  if (Date.now() < cache.expiry && cache.items.length > 0) {
    res.json({ contents: cache.items });
    return;
  }
  const data = await fetchFromMicroCMS('/features?limit=100&orders=-publishedAt');
  if (!data) {
    res.json({ contents: [] });
    return;
  }
  // microCMS のレスポンスは { contents: [...], totalCount, ... }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents = (data as any).contents ?? [];
  cache = { items: contents, expiry: Date.now() + CACHE_TTL };
  res.json({ contents });
});

router.get('/features/:slug', async (req: Request, res: Response) => {
  if (!ENABLED) { res.status(404).json({ error: 'CMS not configured' }); return; }
  const slug = encodeURIComponent(req.params.slug as string);
  // microCMS は filters でクエリ可能
  const data = await fetchFromMicroCMS(`/features?filters=slug[equals]${slug}&limit=1`);
  if (!data) { res.status(404).json({ error: 'Not found' }); return; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents = (data as any).contents ?? [];
  if (contents.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(contents[0]);
});

export default router;
