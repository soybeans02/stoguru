import crypto from 'crypto';
import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  putInfluencerProfile, getInfluencerProfile,
  // V2
  putRestaurantV2, getRestaurantV2, queryRestaurantsByPostedBy,
  deleteRestaurantV2, updateRestaurantV2Visibility,
  invalidateSearchCache,
} from '../services/dynamo';
import { validate, influencerProfileSchema, influencerRestaurantSchema } from '../validators';

const router = Router();

// ─── 自分のプロフィール取得 ───

router.get('/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  const profile = await getInfluencerProfile(req.user!.userId);
  if (!profile) {
    res.status(404).json({ error: 'プロフィールが見つかりません' });
    return;
  }
  res.json(profile);
});

// ─── 自分のプロフィール更新 ───

router.put('/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  const v = validate(influencerProfileSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }

  const existing = await getInfluencerProfile(req.user!.userId);
  await putInfluencerProfile(req.user!.userId, {
    ...existing,
    influencerId: req.user!.userId,
    ...v.data,
    displayName: v.data.displayName || existing?.displayName || req.user!.nickname || '',
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  });

  res.json({ ok: true });
});

// ─── 自分のレストラン一覧（V2: GSI-PostedBy） ───

router.get('/restaurants', requireAuth, async (req: AuthRequest, res: Response) => {
  const items = await queryRestaurantsByPostedBy(req.user!.userId);
  // privateはストック由来（本人が投稿したものではない）なので除外
  const filtered = items.filter((r) => r.visibility !== 'private');
  // 旧APIとの互換性のためフィールドをマッピング
  const mapped = filtered.map((r) => ({
    restaurantId: r.restaurantId,
    influencerId: r.postedBy,
    name: r.name,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    genres: r.genres,
    priceRange: r.priceRange,
    photoUrls: r.photoUrls,
    urls: r.urls,
    description: r.description,
    visibility: r.visibility,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
  res.json(mapped);
});

// ─── レストラン追加/更新（V2: Restaurants_v2に直接書き込み） ───

router.put('/restaurants/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const restaurantId = req.params.id as string;
  const v = validate(influencerRestaurantSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }

  // プロフィール未作成なら自動作成
  const existingProfile = await getInfluencerProfile(userId);
  if (!existingProfile) {
    const now = Date.now();
    await putInfluencerProfile(userId, {
      influencerId: userId,
      displayName: req.user!.nickname || 'ユーザー',
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 既存レストランがあれば更新、なければ新規
  const existing = await getRestaurantV2(restaurantId);

  await putRestaurantV2({
    restaurantId,
    name: v.data.name,
    address: v.data.address,
    lat: v.data.lat,
    lng: v.data.lng,
    genres: v.data.genres,
    priceRange: v.data.priceRange,
    photoUrls: v.data.photoUrls,
    urls: [
      ...(v.data.urls || []),
      v.data.instagramUrl,
      v.data.tiktokUrl,
      v.data.youtubeUrl,
      v.data.videoUrl,
    ].filter(Boolean) as string[],
    scene: v.data.scene || existing?.scene || [],
    description: v.data.description,
    postedBy: existing?.postedBy || userId,
    visibility: v.data.visibility || existing?.visibility || 'public',
    stockCount: existing?.stockCount ?? 0,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  });

  invalidateSearchCache();
  res.json({ ok: true });
});

// ─── レストラン公開設定変更 ───

router.patch('/restaurants/:id/visibility', requireAuth, async (req: AuthRequest, res: Response) => {
  const restaurantId = req.params.id as string;
  const { visibility } = req.body;
  if (visibility !== 'public' && visibility !== 'mutual' && visibility !== 'hidden') {
    res.status(400).json({ error: '無効な公開設定です' });
    return;
  }

  // 自分の投稿のみ変更可能
  const restaurant = await getRestaurantV2(restaurantId);
  if (!restaurant || restaurant.postedBy !== req.user!.userId) {
    res.status(403).json({ error: '権限がありません' });
    return;
  }

  await updateRestaurantV2Visibility(restaurantId, visibility);
  res.json({ ok: true });
});

// ─── レストラン削除 ───

router.delete('/restaurants/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const restaurantId = req.params.id as string;

  // 自分の投稿のみ削除可能
  const restaurant = await getRestaurantV2(restaurantId);
  if (!restaurant || restaurant.postedBy !== req.user!.userId) {
    res.status(403).json({ error: '権限がありません' });
    return;
  }

  // 物理削除ではなくhiddenにする（他ユーザーのストックデータを壊さないため）
  await updateRestaurantV2Visibility(restaurantId, 'hidden');
  invalidateSearchCache();
  res.json({ ok: true });
});

// ─── 公開プロフィール ───

router.get('/:id/public', requireAuth, async (req: AuthRequest, res: Response) => {
  const profile = await getInfluencerProfile(req.params.id as string);
  if (!profile) {
    res.status(404).json({ error: 'インフルエンサーが見つかりません' });
    return;
  }
  res.json({
    influencerId: profile.influencerId,
    displayName: profile.displayName,
    bio: profile.bio,
    instagramHandle: profile.instagramHandle,
    instagramUrl: profile.instagramUrl,
    tiktokHandle: profile.tiktokHandle,
    tiktokUrl: profile.tiktokUrl,
    youtubeHandle: profile.youtubeHandle,
    youtubeUrl: profile.youtubeUrl,
    profilePhotoUrl: profile.profilePhotoUrl,
    genres: profile.genres,
    isVerified: profile.isVerified,
  });
});

// ─── 公開レストラン一覧（V2: GSI-PostedBy） ───

router.get('/:id/restaurants', requireAuth, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const profile = await getInfluencerProfile(id);
  if (!profile) {
    res.status(404).json({ error: 'インフルエンサーが見つかりません' });
    return;
  }
  const items = await queryRestaurantsByPostedBy(id);
  // hiddenを除外、mutualは本人のみ
  const visible = items.filter((r) => {
    if (r.visibility === 'hidden') return false;
    if (r.visibility === 'mutual' && r.postedBy !== req.user!.userId) return false;
    return true;
  });

  const mapped = visible.map((r) => ({
    restaurantId: r.restaurantId,
    influencerId: r.postedBy,
    name: r.name,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    genres: r.genres,
    priceRange: r.priceRange,
    photoUrls: r.photoUrls,
    urls: r.urls,
    description: r.description,
    visibility: r.visibility,
    createdAt: r.createdAt,
  }));
  res.json(mapped);
});

// ─── CSV一括登録 ───

router.post('/restaurants/bulk-csv', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { csv } = req.body as { csv: string };

  if (!csv || typeof csv !== 'string') {
    res.status(400).json({ error: 'csvフィールドが必要です' });
    return;
  }

  // プロフィール未作成なら自動作成
  const existingProfile = await getInfluencerProfile(userId);
  if (!existingProfile) {
    const now = Date.now();
    await putInfluencerProfile(userId, {
      influencerId: userId,
      displayName: req.user!.nickname || 'ユーザー',
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  const lines = csv.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  // ヘッダー行をスキップ（「店名」を含む行）
  const startIdx = lines[0]?.includes('店名') ? 1 : 0;

  const results: { name: string; ok: boolean; error?: string }[] = [];
  let successCount = 0;

  for (let i = startIdx; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const name = cols[0]?.trim();
    const address = cols[1]?.trim();
    const genre = cols[2]?.trim();
    const sceneStr = cols[3]?.trim();
    const priceMinStr = cols[4]?.trim();
    const priceMaxStr = cols[5]?.trim();
    const urlStr = cols[6]?.trim();
    const desc = cols[7]?.trim();

    if (!name) {
      results.push({ name: `行${i + 1}`, ok: false, error: '店名が空です' });
      continue;
    }

    try {
      // 住所からlat/lngを取得
      let lat: number | undefined;
      let lng: number | undefined;
      if (address) {
        const coords = await geocodeAddress(address);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        }
      }

      const genres = genre ? genre.split('/').map(g => g.trim()).filter(Boolean) : [];
      const scene = sceneStr ? sceneStr.split('/').map(s => s.trim()).filter(Boolean) : [];

      const priceMin = priceMinStr ? parseInt(priceMinStr) : 0;
      const priceMax = priceMaxStr ? parseInt(priceMaxStr) : 0;
      let priceRange: string | undefined;
      if (priceMin > 0 || priceMax > 0) {
        const minS = priceMin > 0 ? `¥${priceMin}` : '';
        const maxS = priceMax > 0 ? `¥${priceMax}` : '';
        priceRange = minS && maxS ? `${minS}〜${maxS}` : minS ? `${minS}〜` : `〜${maxS}`;
      }

      const restaurantId = crypto.randomUUID();
      await putRestaurantV2({
        restaurantId,
        name,
        address,
        lat,
        lng,
        genres,
        scene,
        priceRange,
        photoUrls: [],
        urls: urlStr ? urlStr.split(' ').map(u => u.trim()).filter(Boolean) : [],
        description: desc || '',
        postedBy: userId,
        visibility: 'public',
        stockCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      successCount++;
      results.push({ name, ok: true });
    } catch (e: any) {
      results.push({ name, ok: false, error: e.message });
    }

    // ジオコーディングのレートリミット（1秒1リクエスト）
    if (address) {
      await new Promise(r => setTimeout(r, 1100));
    }
  }

  invalidateSearchCache();
  res.json({ total: results.length, success: successCount, failed: results.length - successCount, results });
});

// ─── ジオコーディング（Nominatim） ───

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=jp`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Stoguru/1.0 (moro0215123@gmail.com)' }
    });
    const data = await resp.json() as any[];
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── CSVパーサー（カンマ区切り、ダブルクォート対応） ───

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

export default router;
