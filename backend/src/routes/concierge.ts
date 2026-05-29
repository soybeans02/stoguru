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
  pickBySlotCached,
  recommendSavedCached,
  analyzeUserInsights,
  isLLMAvailable,
  type ConciergeCandidate,
  type InsightStockEntry,
  type DaySlot,
  type UserHistoryEntry,
} from '../services/concierge';
import { getSearchCache, batchGetInfluencerProfiles } from '../services/dynamo';
import { haversineDistance } from '../utils/geo';

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

/** body.userHistory を正規化 (= パーソナライズ用の履歴、最大 40 件)。 */
function normalizeHistory(raw: unknown): UserHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h): h is Record<string, unknown> => typeof h === 'object' && h !== null)
    .map((h) => ({
      name: String(h.name ?? ''),
      genre: typeof h.genre === 'string' ? h.genre : undefined,
      scene: Array.isArray(h.scene)
        ? h.scene.filter((s): s is string => typeof s === 'string')
        : undefined,
      priceRange: typeof h.priceRange === 'string' ? h.priceRange : undefined,
      liked: h.liked === true,
    }))
    .filter((h) => h.name.length > 0)
    .slice(0, 40);
}

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  if (!isLLMAvailable()) {
    res.status(503).json({ error: 'AI コンシェルジュは現在オフラインです' });
    return;
  }

  // バリデーション
  const body = req.body as {
    query?: unknown;
    chips?: unknown;
    candidates?: unknown;
    maxResults?: unknown;
    userHistory?: unknown;
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

  // ユーザーの好み履歴 (パーソナライズ用、最大 40 件)
  const userHistory = normalizeHistory(body.userHistory);

  try {
    const result = await recommendRestaurants({
      query, chips, candidates, maxResults, userHistory,
    });
    res.json(result);
  } catch (err) {
    console.error('[concierge] error:', err);
    res.status(500).json({ error: "AI の呼び出しに失敗しました。少し待って再度お試しください。" });
  }
});

/**
 * POST /api/concierge/today-pick
 * Home の TODAY'S PICK 用。候補から AI が 1 軒選ぶ。24h キャッシュ。
 */
router.post('/today-pick', async (req: Request, res: Response) => {
  if (!isLLMAvailable()) {
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
    console.error('[today-pick] error:', err);
    res.status(500).json({ error: "AI の呼び出しに失敗しました。少し待って再度お試しください。" });
  }
});

/**
 * POST /api/concierge/pick-slot
 * { slot: "morning" | "lunch" | "dinner", candidates: [...] }
 * 時間帯別に AI が 1 軒選定。24h cache (slot 別)。
 */
router.post('/pick-slot', async (req: Request, res: Response) => {
  if (!isLLMAvailable()) {
    res.status(503).json({ error: 'AI コンシェルジュは現在オフラインです' });
    return;
  }
  const body = req.body as { slot?: unknown; candidates?: unknown };
  const slot = body.slot;
  if (slot !== 'morning' && slot !== 'lunch' && slot !== 'dinner') {
    res.status(400).json({ error: 'slot は morning / lunch / dinner のいずれか' });
    return;
  }
  const candidates = normalizeCandidates(body.candidates);
  if (candidates.length === 0) {
    res.json({ recommendations: [] });
    return;
  }
  try {
    const result = await pickBySlotCached(slot as DaySlot, candidates);
    res.json(result);
  } catch (err) {
    console.error('[pick-slot] error:', err);
    res.status(500).json({ error: "AI の呼び出しに失敗しました。少し待って再度お試しください。" });
  }
});

/**
 * POST /api/concierge/saved-rec
 * 保存タブの AI 推薦用。未訪問候補から 3 軒。24h キャッシュ。
 */
router.post('/saved-rec', async (req: Request, res: Response) => {
  if (!isLLMAvailable()) {
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
    console.error('[saved-rec] error:', err);
    res.status(500).json({ error: "AI の呼び出しに失敗しました。少し待って再度お試しください。" });
  }
});

/**
 * POST /api/concierge/insights
 * 保存履歴から食の傾向を AI に分析させる (You タブの AI 傾向)
 */
router.post('/insights', async (req: Request, res: Response) => {
  if (!isLLMAvailable()) {
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
    console.error('[insights] error:', err);
    res.status(500).json({ error: "AI の分析に失敗しました。少し待って再度お試しください。" });
  }
});

/**
 * POST /api/concierge/recall
 * iOS 検索タブの「TikTok で観た あの店、思い出す」AI 記憶検索。
 *
 * body: { q: string, lat?: number, lng?: number, radius?: number }
 *
 * 手順:
 *  1. search cache (全 1086 件) から photoUrls あり / visibility OK で絞る
 *  2. lat/lng があれば distance ≤ radius (default 50km) でさらに絞る
 *  3. q のトークンが name/genres/scene/address に多く一致する順で sort → 上位 30 件
 *  4. その 30 件を AI に投げて、最終候補 3 軒に絞らせる
 */
router.post('/recall', async (req: Request, res: Response) => {
  if (!isLLMAvailable()) {
    res.status(503).json({ error: 'AI 検索は現在オフラインです' });
    return;
  }
  const body = req.body as {
    q?: unknown;
    lat?: unknown;
    lng?: unknown;
    radius?: unknown;
  };
  const q = typeof body.q === 'string' ? body.q.trim().slice(0, 300) : '';
  if (!q) {
    res.status(400).json({ error: 'q は必須' });
    return;
  }
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const radius = Math.min(Number(body.radius) || 50000, 100000);
  const hasLocation =
    !Number.isNaN(lat) && !Number.isNaN(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  try {
    const cache = await getSearchCache();
    let candidates = cache.filter((r) =>
      r.visibility !== 'hidden' &&
      r.visibility !== 'private' &&
      r.shadowBanned !== true &&
      Array.isArray(r.photoUrls) && r.photoUrls.length > 0
    );

    // 位置情報があれば距離フィルタ
    if (hasLocation) {
      candidates = candidates.filter((r) => {
        if (r.lat == null || r.lng == null) return false;
        return haversineDistance(lat, lng, r.lat, r.lng) <= radius;
      });
    }

    // q のトークンとの一致数で前ソート (= AI に渡す前のリランキング)
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    candidates.sort((a, b) => {
      const ah = matchScore(a, tokens);
      const bh = matchScore(b, tokens);
      return bh - ah;
    });

    // 上位 30 件を AI に渡す
    const top = candidates.slice(0, 30);
    if (top.length === 0) {
      res.json({ recommendations: [], intro: '近くに該当しそうなお店が見つかりませんでした。' });
      return;
    }

    const aiCandidates: ConciergeCandidate[] = top.map((r) => ({
      id: r.restaurantId,
      name: r.name,
      genre: (r.genres ?? [])[0],
      scene: r.scene,
      priceRange: r.priceRange,
      description: r.description,
    }));

    const result = await recommendRestaurants({
      query: `ユーザーが TikTok / Instagram で観たお店を断片情報から思い出そうとしています:「${q}」。この記憶に最も近そうなお店を 3 軒、なぜそれが該当しそうか具体的に説明しながら選んでください。「思い出のあの店、これかもしれません」という温度感で。`,
      chips: ['記憶検索'],
      candidates: aiCandidates,
      maxResults: 3,
    });

    // AI が選んだ id を full restaurant data (= iOS SwipeRestaurant 形) に解決して
    // 一緒に返す。これがないと iOS 側で 60 件の feed からしか解決できず、
    // recall の大半が表示できない (= 記憶検索が機能しない) 問題を防ぐ。
    const byId = new Map(top.map((r) => [r.restaurantId, r]));
    const chosen = result.recommendations
      .map((rec) => byId.get(rec.restaurantId))
      .filter((r): r is NonNullable<typeof r> => r != null);
    const profileMap = await batchGetInfluencerProfiles(
      [...new Set(chosen.map((r) => r.postedBy).filter(Boolean))]
    );
    const restaurants = chosen.map((r) => {
      const profile = profileMap.get(r.postedBy);
      const platform = profile?.platform
        || (profile?.instagramHandle ? 'instagram'
          : profile?.tiktokHandle ? 'tiktok'
          : profile?.youtubeHandle ? 'youtube' : 'instagram');
      const handleMap: Record<string, string | undefined> = {
        instagram: profile?.instagramHandle, tiktok: profile?.tiktokHandle, youtube: profile?.youtubeHandle,
      };
      const handle = handleMap[platform] || profile?.instagramHandle || profile?.tiktokHandle || profile?.youtubeHandle || '';
      return {
        id: r.restaurantId,
        name: r.name,
        address: r.address || '',
        lat: r.lat ?? 0,
        lng: r.lng ?? 0,
        genre: (r.genres || [])[0] || '',
        genres: r.genres || [],
        scene: r.scene || [],
        priceRange: r.priceRange || '',
        distance: '',
        influencer: {
          name: profile?.displayName || '',
          handle: handle ? `@${handle.replace(/^@/, '')}` : '',
          platform,
          url: profile?.instagramUrl || profile?.tiktokUrl || profile?.youtubeUrl || '',
        },
        influencerUserId: r.postedBy,
        videoUrl: (r.urls || [])[0] || '',
        videoUrls: (r.urls || []).filter(Boolean),
        stoguruVideoUrl: r.stoguruVideoUrl,
        photoEmoji: '🍽️',
        photoUrls: r.photoUrls || [],
        description: r.description || '',
        menus: r.menus,
        menuPhotoUrls: r.menuPhotoUrls,
      };
    });

    res.json({ ...result, restaurants });
  } catch (err) {
    console.error('[recall] error:', err);
    res.status(500).json({ error: "AI 検索に失敗しました。少し待って再度お試しください。" });
  }
});

/** name / genres / scene / address に token がいくつ含まれるか数える */
function matchScore(r: { name?: string; genres?: string[]; scene?: string[]; address?: string }, tokens: string[]): number {
  const hay = [
    r.name ?? '',
    (r.genres ?? []).join(' '),
    (r.scene ?? []).join(' '),
    r.address ?? '',
  ].join(' ').toLowerCase();
  return tokens.reduce((acc, tok) => acc + (hay.includes(tok) ? 1 : 0), 0);
}

export default router;
