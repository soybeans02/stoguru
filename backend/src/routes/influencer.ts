import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireInfluencer } from '../middleware/requireInfluencer';
import {
  getUserSettings, putUserSettings,
  putInfluencerProfile, getInfluencerProfile,
  putInfluencerRestaurant, getInfluencerRestaurants, deleteInfluencerRestaurant,
} from '../services/dynamo';
import { validate, influencerRegisterSchema, influencerRestaurantSchema } from '../validators';

const router = Router();

// ─── インフルエンサー登録 ───

router.post('/register', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;

  // 既に登録済みかチェック
  const settings = await getUserSettings(userId);
  if (settings.role === 'influencer') {
    res.status(400).json({ error: '既にインフルエンサーとして登録済みです' });
    return;
  }

  const v = validate(influencerRegisterSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }

  // ロールをインフルエンサーに更新
  await putUserSettings(userId, { ...settings, role: 'influencer' });

  // プロフィール作成
  const now = Date.now();
  await putInfluencerProfile(userId, {
    influencerId: userId,
    displayName: v.data.displayName,
    bio: v.data.bio,
    instagramHandle: v.data.instagramHandle,
    tiktokHandle: v.data.tiktokHandle,
    youtubeHandle: v.data.youtubeHandle,
    genres: v.data.genres,
    isVerified: false,
    createdAt: now,
    updatedAt: now,
  });

  res.json({ ok: true });
});

// ─── 自分のプロフィール取得 ───

router.get('/profile', requireAuth, requireInfluencer, async (req: AuthRequest, res: Response) => {
  const profile = await getInfluencerProfile(req.user!.userId);
  if (!profile) {
    res.status(404).json({ error: 'プロフィールが見つかりません' });
    return;
  }
  res.json(profile);
});

// ─── 自分のプロフィール更新 ───

router.put('/profile', requireAuth, requireInfluencer, async (req: AuthRequest, res: Response) => {
  const v = validate(influencerRegisterSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }

  const existing = await getInfluencerProfile(req.user!.userId);
  await putInfluencerProfile(req.user!.userId, {
    ...existing,
    influencerId: req.user!.userId,
    displayName: v.data.displayName,
    bio: v.data.bio,
    instagramHandle: v.data.instagramHandle,
    tiktokHandle: v.data.tiktokHandle,
    youtubeHandle: v.data.youtubeHandle,
    genres: v.data.genres,
    createdAt: existing?.createdAt ?? Date.now(),
  });

  res.json({ ok: true });
});

// ─── 自分のレストラン一覧 ───

router.get('/restaurants', requireAuth, requireInfluencer, async (req: AuthRequest, res: Response) => {
  const items = await getInfluencerRestaurants(req.user!.userId);
  res.json(items);
});

// ─── レストラン追加/更新 ───

router.put('/restaurants/:id', requireAuth, requireInfluencer, async (req: AuthRequest, res: Response) => {
  const restaurantId = req.params.id as string;
  const v = validate(influencerRestaurantSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }

  await putInfluencerRestaurant(req.user!.userId, {
    restaurantId,
    influencerId: req.user!.userId,
    ...v.data,
    createdAt: Date.now(),
  });

  res.json({ ok: true });
});

// ─── レストラン削除 ───

router.delete('/restaurants/:id', requireAuth, requireInfluencer, async (req: AuthRequest, res: Response) => {
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
    tiktokHandle: profile.tiktokHandle,
    youtubeHandle: profile.youtubeHandle,
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
