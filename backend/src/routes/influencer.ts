import { Router, Response } from 'express';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth';
import {
  putInfluencerProfile, getInfluencerProfile,
  // V2
  putRestaurantV2, getRestaurantV2, queryRestaurantsByPostedBy,
  updateRestaurantV2Visibility,
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
  // private はストック由来（本人が投稿したものではない）なので除外
  // hidden は削除済み（論理削除）なので一覧に表示しない
  const filtered = items.filter((r) => r.visibility !== 'private' && r.visibility !== 'hidden');
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
// 投稿申請 / 管理者承認ゲートは撤廃済み。requireAuth のみで通す。

// クライアントが UUID v4 として生成した restaurantId だけ受け付ける。
// 任意文字列を許すと別 namespace（例: 旧 cognito sub 形式の id）を squat
// したり、ID 衝突攻撃でテーブルを汚染できてしまう。crypto.randomUUID() の
// 出力フォーマットに合わせた厳密な regex で弾く。
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.put('/restaurants/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;

  const restaurantId = req.params.id as string;
  if (!UUID_RE.test(restaurantId)) {
    res.status(400).json({ error: '無効なお店 ID です' });
    return;
  }
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

  // 既存レストランがあれば更新、なければ新規。
  // 他人の restaurantId を当ててきた場合は乗っ取り攻撃なので 403 で拒否する
  // （以前は postedBy だけ保持して他フィールドは丸ごと書き換わる脆弱性があった）。
  const existing = await getRestaurantV2(restaurantId);
  if (existing && existing.postedBy && existing.postedBy !== userId) {
    res.status(403).json({ error: 'このお店を編集する権限がありません' });
    return;
  }

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

// ─── 投稿申請（旧 4 ステップウィザード）は撤廃 ───
// /upload-application GET / POST は削除。クライアントから一切呼ばれない。

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
// 共有リンク経由での閲覧を許可するため optionalAuth

router.get('/:id/public', optionalAuth, async (req: AuthRequest, res: Response) => {
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

router.get('/:id/restaurants', optionalAuth, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const profile = await getInfluencerProfile(id);
  if (!profile) {
    res.status(404).json({ error: 'インフルエンサーが見つかりません' });
    return;
  }
  const items = await queryRestaurantsByPostedBy(id);
  // hidden を除外、mutual は本人のみ（匿名は除外）
  const viewerId = req.user?.userId;
  const visible = items.filter((r) => {
    if (r.visibility === 'hidden') return false;
    if (r.visibility === 'mutual' && r.postedBy !== viewerId) return false;
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

export default router;
