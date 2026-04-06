import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  putRestaurant, getRestaurants, deleteRestaurant,
  getUserSettings, putUserSettings,
  followUser, unfollowUser, getFollowing,
  createFollowRequest, getFollowRequests, deleteFollowRequest,
  createNotification, getNotifications, markNotificationsRead,
  getOrCreateConversation, getConversation, updateConversationStatus,
  getUserConversations, sendMessage, getMessages, markConversationRead,
  createShare, getSharesFeed, deleteShare,
  scanAllInfluencerRestaurants, getInfluencerProfile, getInfluencerRestaurants,
} from '../services/dynamo';
import { searchUsers, getUserById } from '../services/cognito';
import type { Restaurant } from '../types';
import { validate, restaurantSchema, settingsSchema, messageSchema, shareSchema, nearbySchema } from '../validators';
import { haversineDistance } from '../utils/geo';

const router = Router();

// ─── レストラン ───

router.get('/restaurants/nearby', requireAuth, async (req: AuthRequest, res: Response) => {
  const v = validate(nearbySchema, req.query);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  const { lat, lng, radius } = v.data;

  const items = await getRestaurants(req.user!.userId);
  const nearby = items
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => {
      const distanceMeters = haversineDistance(lat, lng, r.lat!, r.lng!);
      return { ...r, distanceMeters };
    })
    .filter((r) => r.distanceMeters <= radius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  res.json(nearby);
});

// ─── スワイプ用フィード（全インフルエンサーのレストラン、半径内） ───

router.get('/restaurants/feed', requireAuth, async (req: AuthRequest, res: Response) => {
  const v = validate(nearbySchema, req.query);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  const { lat, lng, radius } = v.data;

  const allRestaurants = await scanAllInfluencerRestaurants();
  const nearby = allRestaurants
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => ({
      ...r,
      distanceMeters: haversineDistance(lat, lng, r.lat!, r.lng!),
    }))
    .filter((r) => r.distanceMeters <= radius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  // インフルエンサープロフィールをまとめて取得
  const influencerIds = [...new Set(nearby.map((r) => r.influencerId))];
  const profiles = await Promise.all(influencerIds.map((id) => getInfluencerProfile(id)));
  const profileMap = new Map(
    profiles.filter(Boolean).map((p) => [p!.influencerId, p!]),
  );

  const feed = nearby.map((r) => {
    const profile = profileMap.get(r.influencerId);
    const handle = profile?.instagramHandle || profile?.tiktokHandle || profile?.youtubeHandle || '';
    const platform = profile?.instagramHandle ? 'instagram'
      : profile?.tiktokHandle ? 'tiktok'
      : profile?.youtubeHandle ? 'youtube'
      : 'instagram';
    return {
      id: r.restaurantId,
      name: r.name,
      address: r.address || '',
      lat: r.lat!,
      lng: r.lng!,
      genre: (r.genres || [])[0] || '',
      genres: r.genres || [],
      scene: [],
      priceRange: r.priceRange || '',
      distance: '',
      influencer: {
        name: profile?.displayName || '',
        handle: handle ? `@${handle.replace(/^@/, '')}` : '',
        platform,
        url: profile?.instagramUrl || profile?.tiktokUrl || profile?.youtubeUrl || '',
      },
      videoUrl: r.videoUrl || '',
      photoEmoji: '🍽️',
      photoUrls: r.photoUrls || [],
      description: r.description || '',
      distanceMeters: r.distanceMeters,
    };
  });

  res.json(feed);
});

router.get('/restaurants', requireAuth, async (req: AuthRequest, res: Response) => {
  const items = await getRestaurants(req.user!.userId);
  res.json(items);
});

// ─── フォロー中ユーザーの保存レストラン一覧 ───

router.get('/restaurants/following', requireAuth, async (req: AuthRequest, res: Response) => {
  const following = await getFollowing(req.user!.userId);
  const allItems = await Promise.all(
    following.map(async (f) => {
      const [saved, influencer] = await Promise.all([
        getRestaurants(f.followeeId),
        getInfluencerRestaurants(f.followeeId),
      ]);
      const user = await getUserById(f.followeeId);
      const nickname = user?.nickname || f.followeeId;
      // 保存リスト
      const savedItems = saved.map((r) => ({ ...r, ownerNickname: nickname, ownerId: f.followeeId }));
      // お店編集で登録したレストラン（IDが重複しないものだけ追加）
      const savedIds = new Set(saved.map((r) => r.restaurantId));
      const infItems = influencer
        .filter((r) => !savedIds.has(r.restaurantId) && r.visibility !== 'hidden')
        .map((r) => ({ ...r, genre: r.genres?.[0] || '', photoEmoji: '', ownerNickname: nickname, ownerId: f.followeeId }));
      return [...savedItems, ...infItems];
    })
  );
  res.json(allItems.flat());
});

router.put('/restaurants/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const v = validate(restaurantSchema, { id, ...req.body });
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  await putRestaurant(req.user!.userId, v.data as Partial<Restaurant> & { id: string });
  res.json({ ok: true });
});

router.delete('/restaurants/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  await deleteRestaurant(req.user!.userId, id);
  res.json({ ok: true });
});

// ─── 一括同期（localStorage移行用） ───

router.post('/restaurants/sync', requireAuth, async (req: AuthRequest, res: Response) => {
  const { restaurants } = req.body as { restaurants: (Partial<Restaurant> & { id: string })[] };
  if (!Array.isArray(restaurants) || restaurants.length > 500) {
    res.status(400).json({ error: 'restaurants 配列が必要です（上限500件）' });
    return;
  }
  // バリデーション + 並列バッチ処理（10件ずつ）
  const validated = restaurants.map((r) => validate(restaurantSchema, r));
  const valid = validated.filter((v) => v.success).map((v) => (v as { success: true; data: Record<string, unknown> }).data);
  const BATCH = 10;
  for (let i = 0; i < valid.length; i += BATCH) {
    await Promise.all(valid.slice(i, i + BATCH).map((r) =>
      putRestaurant(req.user!.userId, r as Partial<Restaurant> & { id: string })
    ));
  }
  res.json({ synced: valid.length });
});

// ─── ユーザー設定 ───

router.get('/settings', requireAuth, async (req: AuthRequest, res: Response) => {
  const settings = await getUserSettings(req.user!.userId);
  res.json(settings);
});

router.put('/settings', requireAuth, async (req: AuthRequest, res: Response) => {
  const v = validate(settingsSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  await putUserSettings(req.user!.userId, v.data);
  res.json({ ok: true });
});

// ─── フォロー ───

router.post('/follow/:targetId', requireAuth, async (req: AuthRequest, res: Response) => {
  const targetId = req.params.targetId as string;
  // 相手が鍵垢かチェック
  const targetSettings = await getUserSettings(targetId);
  const isPrivate = !!targetSettings.isPrivate;

  if (isPrivate) {
    // 鍵垢 → フォローリクエストを送る
    await createFollowRequest(req.user!.userId, targetId);
    // リクエスト通知
    await createNotification(targetId, 'follow_request', req.user!.userId, req.user!.nickname ?? '');
    res.json({ ok: true, pending: true });
  } else {
    // 公開垢 → 即フォロー + 通知
    await followUser(req.user!.userId, targetId);
    await createNotification(targetId, 'follow', req.user!.userId, req.user!.nickname ?? '');
    res.json({ ok: true, pending: false });
  }
});

router.delete('/follow/:targetId', requireAuth, async (req: AuthRequest, res: Response) => {
  const targetId = req.params.targetId as string;
  await unfollowUser(req.user!.userId, targetId);
  // リクエストも削除（あれば）— targetIdが受信者、req.user!.userIdがリクエスター
  await deleteFollowRequest(targetId, req.user!.userId).catch(() => {});
  res.json({ ok: true });
});

router.get('/following', requireAuth, async (req: AuthRequest, res: Response) => {
  const items = await getFollowing(req.user!.userId);
  res.json(items);
});

router.get('/followers', requireAuth, async (req: AuthRequest, res: Response) => {
  const { getFollowers } = await import('../services/dynamo.js');
  const items = await getFollowers(req.user!.userId);
  res.json(items);
});

// ─── フォローリクエスト ───

router.get('/follow-requests', requireAuth, async (req: AuthRequest, res: Response) => {
  const items = await getFollowRequests(req.user!.userId);
  res.json(items);
});

router.post('/follow-requests/:requesterId/approve', requireAuth, async (req: AuthRequest, res: Response) => {
  const requesterId = req.params.requesterId as string;
  const myId = req.user!.userId;
  // リクエスト削除 + フォロー成立 (targetId=myId, requesterId=requesterId)
  await deleteFollowRequest(myId, requesterId);
  await followUser(requesterId, myId);
  // 承認通知をリクエスターに送る
  await createNotification(requesterId, 'follow_accepted', myId, req.user!.nickname ?? '');
  res.json({ ok: true });
});

router.post('/follow-requests/:requesterId/reject', requireAuth, async (req: AuthRequest, res: Response) => {
  const requesterId = req.params.requesterId as string;
  const myId = req.user!.userId;
  await deleteFollowRequest(myId, requesterId);
  res.json({ ok: true });
});

// ─── 通知 ───

router.get('/notifications', requireAuth, async (req: AuthRequest, res: Response) => {
  const items = await getNotifications(req.user!.userId);
  res.json(items);
});

router.post('/notifications/read', requireAuth, async (req: AuthRequest, res: Response) => {
  await markNotificationsRead(req.user!.userId);
  res.json({ ok: true });
});

// ─── ユーザー検索 ───

router.get('/users/search', requireAuth, async (req: AuthRequest, res: Response) => {
  const q = ((req.query.q as string) ?? '').trim().slice(0, 100);
  if (!q || q.length < 1) {
    res.json([]);
    return;
  }
  try {
    const users = await searchUsers(q);
    res.json(users);
  } catch (err) {
    console.error('User search failed:', err);
    res.json([]);
  }
});

// ─── ユーザープロフィール ───

router.get('/users/:userId/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  const targetId = req.params.userId as string;
  try {
    const [userInfo, settings, restaurants] = await Promise.all([
      getUserById(targetId),
      getUserSettings(targetId),
      getRestaurants(targetId),
    ]);
    if (!userInfo) {
      res.status(404).json({ error: 'ユーザーが見つかりません' });
      return;
    }

    const isMyself = targetId === req.user!.userId;
    const isPrivate = !!settings.isPrivate;

    // 鍵垢かつ本人でない場合、制限された情報のみ返す
    if (isPrivate && !isMyself) {
      // フォローしているか確認
      const following = await getFollowing(req.user!.userId);
      const isFollowing = following.some((f) => f.followeeId === targetId);

      if (!isFollowing) {
        res.json({
          userId: userInfo.userId,
          nickname: userInfo.nickname,
          createdAt: userInfo.createdAt,
          isPrivate: true,
          isLockedOut: true,
          restaurantCount: 0,
          reviewedCount: 0,
          influencerCount: 0,
          restaurants: [],
        });
        return;
      }
    }

    // 公開情報のみ返す（レビュー内容は非公開）
    const publicRestaurants = restaurants.map((r) => ({
      name: r.name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      status: r.status,
      hasReview: !!r.review,
      landmarkMemo: r.landmarkMemo,
      genreTags: r.genreTags ?? [],
    }));
    res.json({
      userId: userInfo.userId,
      nickname: userInfo.nickname,
      createdAt: userInfo.createdAt,
      isPrivate,
      restaurantCount: restaurants.length,
      reviewedCount: restaurants.filter((r) => !!r.review).length,
      influencerCount: (settings.influencers ?? []).length,
      restaurants: publicRestaurants,
    });
  } catch (err) {
    console.error('Profile fetch failed:', err);
    res.status(500).json({ error: 'プロフィール取得に失敗しました' });
  }
});

// ─── メッセージ ───

// 会話一覧取得
router.get('/conversations', requireAuth, async (req: AuthRequest, res: Response) => {
  const convs = await getUserConversations(req.user!.userId);
  res.json(convs);
});

// メッセージ送信（初回はリクエスト扱い）
router.post('/messages/:targetId', requireAuth, async (req: AuthRequest, res: Response) => {
  const myId = req.user!.userId;
  const targetId = req.params.targetId as string;
  const mv = validate(messageSchema, req.body);
  if (!mv.success) { res.status(400).json({ error: mv.error }); return; }
  const { content } = mv.data;

  const conv = await getOrCreateConversation(myId, targetId);
  const convId = conv.pk as string;

  // リクエストが拒否されていたら送信不可
  if (conv.status === 'rejected') {
    res.status(403).json({ error: 'メッセージを送れません' });
    return;
  }

  // pending状態で相手から送ろうとした場合は自動承認
  if (conv.status === 'pending' && conv.requestedBy !== myId) {
    await updateConversationStatus(convId, 'accepted');
  }

  const msg = await sendMessage(convId, myId, content.trim());

  // 初回メッセージの場合、通知を送る
  if (conv.status === 'pending' && conv.requestedBy === myId) {
    await createNotification(targetId, 'message_request', myId, req.user!.nickname ?? '', content.trim());
  }
  // 承認済み会話で相手にメッセージ通知
  if (conv.status === 'accepted') {
    await createNotification(targetId, 'message', myId, req.user!.nickname ?? '', content.trim());
  }

  res.json({ ok: true, message: msg, status: conv.status });
});

// メッセージ取得（初回のみ既読マーク、ポーリングはスキップ）
router.get('/messages/:targetId', requireAuth, async (req: AuthRequest, res: Response) => {
  const myId = req.user!.userId;
  const targetId = req.params.targetId as string;
  const skipRead = req.query.skipRead === '1';
  const conv = await getConversation(myId, targetId);
  if (!conv) {
    res.json({ messages: [], status: null });
    return;
  }
  // 既読マークとメッセージ取得を並列実行（ポーリング時はスキップ）
  const [, messages] = await Promise.all([
    skipRead ? Promise.resolve() : markConversationRead(conv.pk as string, myId, conv.user1 as string),
    getMessages(conv.pk as string),
  ]);
  // 既読マーク後の最新conv取得（自分のlastReadが更新されてるので再取得）
  const freshConv = skipRead ? conv : (await getConversation(myId, targetId)) ?? conv;
  res.json({
    messages,
    status: freshConv.status,
    requestedBy: freshConv.requestedBy,
    user1: freshConv.user1,
    user2: freshConv.user2,
    user1LastRead: freshConv.user1LastRead ?? 0,
    user2LastRead: freshConv.user2LastRead ?? 0,
  });
});

// メッセージリクエスト承認
router.post('/messages/:targetId/accept', requireAuth, async (req: AuthRequest, res: Response) => {
  const myId = req.user!.userId;
  const targetId = req.params.targetId as string;
  const conv = await getConversation(myId, targetId);
  if (!conv || conv.status !== 'pending') {
    res.status(400).json({ error: 'リクエストが見つかりません' });
    return;
  }
  await updateConversationStatus(conv.pk as string, 'accepted');
  res.json({ ok: true });
});

// メッセージリクエスト拒否
router.post('/messages/:targetId/reject', requireAuth, async (req: AuthRequest, res: Response) => {
  const myId = req.user!.userId;
  const targetId = req.params.targetId as string;
  const conv = await getConversation(myId, targetId);
  if (!conv || conv.status !== 'pending') {
    res.status(400).json({ error: 'リクエストが見つかりません' });
    return;
  }
  await updateConversationStatus(conv.pk as string, 'rejected');
  res.json({ ok: true });
});

// ─── シェア ───

router.post('/shares', requireAuth, async (req: AuthRequest, res: Response) => {
  const sv = validate(shareSchema, req.body);
  if (!sv.success) { res.status(400).json({ error: sv.error }); return; }
  const { restaurantName, restaurantAddress, lat, lng, comment } = sv.data;
  const userInfo = await getUserById(req.user!.userId);
  const share = await createShare({
    userId: req.user!.userId,
    userNickname: userInfo?.nickname ?? '匿名',
    restaurantName,
    restaurantAddress,
    lat, lng, comment,
  });
  res.json(share);
});

router.get('/shares/feed', requireAuth, async (req: AuthRequest, res: Response) => {
  const following = await getFollowing(req.user!.userId);
  const followeeIds = following.map((f) => f.followeeId);
  // 自分のシェアも含める
  followeeIds.push(req.user!.userId);
  const feed = await getSharesFeed(followeeIds);
  res.json(feed);
});

router.delete('/shares/:createdAt', requireAuth, async (req: AuthRequest, res: Response) => {
  const createdAt = Number(req.params.createdAt);
  if (!createdAt) { res.status(400).json({ error: '無効なパラメータ' }); return; }
  await deleteShare(req.user!.userId, createdAt);
  res.json({ ok: true });
});

export default router;
