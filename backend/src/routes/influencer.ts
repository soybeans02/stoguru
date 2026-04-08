import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
// import { requireInfluencer } from '../middleware/requireInfluencer';
import {
  putInfluencerProfile, getInfluencerProfile,
  putInfluencerRestaurant, getInfluencerRestaurants, deleteInfluencerRestaurant,
  updateRestaurantVisibility,
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

// ─── 自分のレストラン一覧 ───

router.get('/restaurants', requireAuth, async (req: AuthRequest, res: Response) => {
  const items = await getInfluencerRestaurants(req.user!.userId);
  res.json(items);
});

// ─── レストラン追加/更新 ───

router.put('/restaurants/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const restaurantId = req.params.id as string;
  const v = validate(influencerRestaurantSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }

  // プロフィール未作成なら自動作成
  const existing = await getInfluencerProfile(userId);
  if (!existing) {
    const now = Date.now();
    await putInfluencerProfile(userId, {
      influencerId: userId,
      displayName: req.user!.nickname || 'ユーザー',
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  await putInfluencerRestaurant(userId, {
    restaurantId,
    influencerId: userId,
    ...v.data,
    createdAt: Date.now(),
  });

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
  await updateRestaurantVisibility(req.user!.userId, restaurantId, visibility);
  res.json({ ok: true });
});

// ─── レストラン削除 ───

router.delete('/restaurants/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  await deleteInfluencerRestaurant(req.user!.userId, req.params.id as string);
  res.json({ ok: true });
});

// ─── 公開プロフィール（認証済みユーザーなら誰でも閲覧可） ───

router.get('/:id/public', requireAuth, async (req: AuthRequest, res: Response) => {
  const profile = await getInfluencerProfile(req.params.id as string);
  if (!profile) {
    res.status(404).json({ error: 'インフルエンサーが見つかりません' });
    return;
  }
  // 公開用フィールドのみ返す
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

// ─── 公開レストラン一覧 ───

router.get('/:id/restaurants', requireAuth, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const profile = await getInfluencerProfile(id);
  if (!profile) {
    res.status(404).json({ error: 'インフルエンサーが見つかりません' });
    return;
  }
  const items = await getInfluencerRestaurants(id);
  res.json(items);
});

export default router;
