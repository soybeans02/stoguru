/**
 * AI Concierge route.
 *
 * POST /api/concierge
 * iOS の SafeSearchScreen から呼ばれる。候補レストラン (クライアントが
 * 既にロード済みの feed) と気分タグ + 自由入力を受け取り、Claude Haiku で
 * 推薦リストを返す。
 *
 * 認証不要 (匿名ユーザーも検索できるようにする)。レート制限は
 * グローバルの globalLimit / hourlyLimit に乗る。
 */
import { Router, Request, Response } from 'express';
import {
  recommendRestaurants,
  pickTodayCached,
  recommendSavedCached,
  analyzeUserInsights,
  type ConciergeCandidate,
  type InsightStockEntry,
} from '../services/concierge';

/**
 * body.candidates の生 input を正規化する共通処理。
 * 30 件で打ち切り、id / name 空のものは除外。
 */
function normalizeCandidates(raw: unknown): ConciergeCandidate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c) => ({
      id: String(c.id ?? ''),
      name: String(c.name ?? ''),
      genre: typeof c.genre === 'string' ? c.genre : undefined,
      scene: Array.isArray(c.scene)
        ? c.scene.filter((s): s is string => typeof s === 'string')
        : undefined,
      priceRange: typeof c.priceRange === 'string' ? c.priceRange : undefined,
      distance: typeof c.distance === 'string' ? c.distance : undefined,
      description: typeof c.description === 'string' ? c.description : undefined,
    }))
    .filter((c) => c.id.length > 0 && c.name.length > 0)
    .slice(0, 30);
}

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'AI コンシェルジュは現在オフラインです' });
    return;
  }

  // バリデーション
  const body = req.body as {
    query?: unknown;
    chips?: unknown;
    candidates?: unknown;
    maxResults?: unknown;
  };

  const query = typeof body.query === 'string' ? body.query.slice(0, 200) : '';
  const chips = Array.isArray(body.chips)
    ? body.chips.filter((c): c is string => typeof c === 'string').slice(0, 20)
    : [];

  const candidates = normalizeCandidates(body.candidates);

  if (candidates.length === 0) {
    res.json({ recommendations: [], intro: '候補のお店がありません' });
    return;
  }

  const maxResults = typeof body.maxResults === 'number'
    ? Math.max(1, Math.min(10, Math.floor(body.maxResults)))
    : 6;

  try {
    const result = await recommendRestaurants({
      query, chips, candidates, maxResults,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[concierge] error:', err);
    res.status(500).json({ error: `AI 呼び出しに失敗: ${msg}` });
  }
});

/**
 * POST /api/concierge/today-pick
 * Home の TODAY'S PICK 用。候補から AI が 1 軒選ぶ。24h キャッシュ。
 */
router.post('/today-pick', async (req: Request, res: Response) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'AI コンシェルジュは現在オフラインです' });
    return;
  }
  const body = req.body as { candidates?: unknown };
  const candidates = normalizeCandidates(body.candidates);
  if (candidates.length === 0) {
    res.json({ recommendations: [] });
    return;
  }
  try {
    const result = await pickTodayCached(candidates);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[today-pick] error:', err);
    res.status(500).json({ error: `AI 呼び出しに失敗: ${msg}` });
  }
});

/**
 * POST /api/concierge/saved-rec
 * 保存タブの AI 推薦用。未訪問候補から 3 軒。24h キャッシュ。
 */
router.post('/saved-rec', async (req: Request, res: Response) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'AI コンシェルジュは現在オフラインです' });
    return;
  }
  const body = req.body as { candidates?: unknown };
  const candidates = normalizeCandidates(body.candidates);
  if (candidates.length === 0) {
    res.json({ recommendations: [] });
    return;
  }
  try {
    const result = await recommendSavedCached(candidates);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[saved-rec] error:', err);
    res.status(500).json({ error: `AI 呼び出しに失敗: ${msg}` });
  }
});

/**
 * POST /api/concierge/insights
 * 保存履歴から食の傾向を AI に分析させる (You タブの AI 傾向)
 */
router.post('/insights', async (req: Request, res: Response) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'AI コンシェルジュは現在オフラインです' });
    return;
  }

  const body = req.body as { stocks?: unknown };
  if (!Array.isArray(body.stocks)) {
    res.status(400).json({ error: 'stocks は配列で必須' });
    return;
  }

  const stocks: InsightStockEntry[] = body.stocks
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map((s) => ({
      name: String(s.name ?? ''),
      genre: typeof s.genre === 'string' ? s.genre : undefined,
      scene: Array.isArray(s.scene)
        ? s.scene.filter((x): x is string => typeof x === 'string')
        : undefined,
      priceRange: typeof s.priceRange === 'string' ? s.priceRange : undefined,
      visited: s.visited === true,
    }))
    .filter((s) => s.name.length > 0)
    .slice(0, 60);

  if (stocks.length === 0) {
    res.json({ insights: [], intro: 'まだ保存履歴がありません' });
    return;
  }

  try {
    const result = await analyzeUserInsights({ stocks });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[insights] error:', err);
    res.status(500).json({ error: `AI 分析に失敗: ${msg}` });
  }
});

export default router;
