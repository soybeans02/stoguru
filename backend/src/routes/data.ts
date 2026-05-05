import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth';
import {
  // V2
  putRestaurantV2, getRestaurantV2, batchGetRestaurantsV2,
  queryRestaurantsByGeohash, queryRestaurantsByPostedBy,
  putUserStock, getUserStocks, deleteUserStock, getUserStock,
  incrementStockCount, invalidateSearchCache,
  lookupRestaurantByUrl, searchRestaurantsV2,
  getStockRankingV2,
  getTopRestaurantsByStockCount,
  // 既存
  getUserSettings, putUserSettings,
  followUser, unfollowUser, getFollowing,
  createFollowRequest, getFollowRequests, deleteFollowRequest,
  createNotification, getNotifications, markNotificationsRead,
  createShare, getSharesFeed, getRecentShares, deleteShare,
  getInfluencerProfile,
  batchGetInfluencerProfiles,
  saveGenreRequest,
} from '../services/dynamo';
import { searchUsers, getUserById } from '../services/cognito';
import type { RestaurantV2 } from '../types';
import { validate, restaurantSchema, settingsSchema, shareSchema, nearbySchema, syncBatchSchema } from '../validators';
import { haversineDistance } from '../utils/geo';
import { encode as geohashEncode, neighbors as geohashNeighbors } from '../utils/geohash';

const router = Router();

// ─── スワイプ用フィード（geohashベース、スキャン不要） ───

router.get('/restaurants/feed', optionalAuth, async (req: AuthRequest, res: Response) => {
  const v = validate(nearbySchema, req.query);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  const { lat, lng, radius } = v.data;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  // 既に取得済みの ID を除外するためのパラメータ（カンマ区切り）
  const excludeIds = new Set(
    ((req.query.exclude as string) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  // 未ログインの場合はユーザーフィルタなし
  const userId = req.user?.userId ?? '';

  // geohash precision 4の9セルをクエリ（約40km×20km × 9 = 広域カバー）
  const centerHash4 = geohashEncode(lat, lng, 4);
  const cells = geohashNeighbors(centerHash4);

  const results = await Promise.all(cells.map((cell) => queryRestaurantsByGeohash(cell)));
  const allRestaurants = results.flat();

  // 距離フィルタ + 自分の投稿を除外 + hidden除外 + 写真なし除外 + 既取得除外
  const nearby = allRestaurants
    .filter((r) =>
      r.lat != null &&
      r.lng != null &&
      r.postedBy !== userId &&
      r.visibility !== 'hidden' &&
      r.visibility !== 'private' &&
      Array.isArray(r.photoUrls) && r.photoUrls.length > 0 &&
      !excludeIds.has(r.restaurantId)
    )
    .map((r) => ({
      ...r,
      distanceMeters: haversineDistance(lat, lng, r.lat!, r.lng!),
    }))
    .filter((r) => r.distanceMeters <= radius);

  // ランダム順にシャッフル（Fisher-Yates）
  for (let i = nearby.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nearby[i], nearby[j]] = [nearby[j], nearby[i]];
  }

  // インフルエンサープロフィールをまとめて取得
  // 以前は postedBy ごとに per-row Get を Promise.all で並列していた
  // (= N 回 GetItem)。BatchGet で 1 回（最大 100 件）にまとめて RCU 削減。
  const influencerIds = [...new Set(nearby.map((r) => r.postedBy))];
  const profileMap = await batchGetInfluencerProfiles(influencerIds);

  const feed = nearby.map((r) => {
    const profile = profileMap.get(r.postedBy);
    const selectedPlatform = profile?.platform || (
      profile?.instagramHandle ? 'instagram'
      : profile?.tiktokHandle ? 'tiktok'
      : profile?.youtubeHandle ? 'youtube'
      : 'instagram'
    );
    const handleMap: Record<string, string | undefined> = {
      instagram: profile?.instagramHandle,
      tiktok: profile?.tiktokHandle,
      youtube: profile?.youtubeHandle,
    };
    const urlMap: Record<string, string | undefined> = {
      instagram: profile?.instagramUrl,
      tiktok: profile?.tiktokUrl,
      youtube: profile?.youtubeUrl,
    };
    const handle = handleMap[selectedPlatform] || profile?.instagramHandle || profile?.tiktokHandle || profile?.youtubeHandle || '';
    const profileUrl = urlMap[selectedPlatform] || profile?.instagramUrl || profile?.tiktokUrl || profile?.youtubeUrl || '';
    return {
      id: r.restaurantId,
      name: r.name,
      address: r.address || '',
      lat: r.lat!,
      lng: r.lng!,
      genre: (r.genres || [])[0] || '',
      genres: r.genres || [],
      scene: r.scene || [],
      priceRange: r.priceRange || '',
      distance: '',
      influencer: {
        name: profile?.displayName || '',
        handle: handle ? `@${handle.replace(/^@/, '')}` : '',
        platform: selectedPlatform,
        url: profileUrl,
      },
      videoUrl: (r.urls || [])[0] || '',
      photoEmoji: '🍽️',
      photoUrls: r.photoUrls || [],
      description: r.description || '',
      distanceMeters: r.distanceMeters,
    };
  });

  // シャッフル済みの先頭 limit 件を返す
  const paged = feed.slice(0, limit);
  res.json({
    items: paged,
    total: feed.length,
    limit,
    hasMore: feed.length > limit,
  });
});

// ─── ユーザーの保存レストラン一覧（UserStocks → BatchGet RestaurantsV2） ───

router.get('/restaurants', requireAuth, async (req: AuthRequest, res: Response) => {
  const stocks = await getUserStocks(req.user!.userId);
  if (stocks.length === 0) { res.json([]); return; }

  const restaurantIds = stocks.map((s) => s.restaurantId);
  const restaurants = await batchGetRestaurantsV2(restaurantIds);
  const restMap = new Map(restaurants.map((r) => [r.restaurantId, r]));

  // ストック情報とレストラン情報をマージ
  const merged = stocks.map((stock) => {
    const r = restMap.get(stock.restaurantId);
    return {
      userId: req.user!.userId,
      restaurantId: stock.restaurantId,
      id: stock.restaurantId,
      name: r?.name || '',
      address: r?.address,
      lat: r?.lat,
      lng: r?.lng,
      genre: (r?.genres || [])[0],
      genreTags: r?.genres || [],
      priceRange: r?.priceRange,
      photoUrls: r?.photoUrls || [],
      videoUrl: (r?.urls || [])[0],
      photoEmoji: stock.photoEmoji || '🍽️',
      pinned: stock.pinned,
      notes: stock.notes,
      landmarkMemo: stock.landmarkMemo,
      review: stock.review,
      status: stock.status,
      visitedAt: stock.visitedAt,
      createdAt: stock.createdAt,
      updatedAt: stock.updatedAt,
    };
  }).filter((item) => item.name); // レストランが見つからないものは除外

  res.json(merged);
});

// ─── 近隣の保存レストラン ───

router.get('/restaurants/nearby', requireAuth, async (req: AuthRequest, res: Response) => {
  const v = validate(nearbySchema, req.query);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  const { lat, lng, radius } = v.data;

  const stocks = await getUserStocks(req.user!.userId);
  if (stocks.length === 0) { res.json([]); return; }

  const restaurants = await batchGetRestaurantsV2(stocks.map((s) => s.restaurantId));
  const restMap = new Map(restaurants.map((r) => [r.restaurantId, r]));

  const nearby = stocks
    .map((stock) => {
      const r = restMap.get(stock.restaurantId);
      if (!r?.lat || !r?.lng) return null;
      const distanceMeters = haversineDistance(lat, lng, r.lat, r.lng);
      return { ...stock, ...r, distanceMeters };
    })
    .filter((item): item is NonNullable<typeof item> => item != null && item.distanceMeters <= radius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  res.json(nearby);
});

// ─── フォロー中ユーザーの保存レストラン一覧 ───

router.get('/restaurants/following', requireAuth, async (req: AuthRequest, res: Response) => {
  const following = await getFollowing(req.user!.userId);

  const allItems = await Promise.all(
    following.map(async (f) => {
      const [stocks, userInfo] = await Promise.all([
        getUserStocks(f.followeeId),
        getUserById(f.followeeId),
      ]);
      const nickname = userInfo?.nickname || f.followeeId;

      if (stocks.length === 0) return [];

      const restaurants = await batchGetRestaurantsV2(stocks.map((s) => s.restaurantId));
      const restMap = new Map(restaurants.map((r) => [r.restaurantId, r]));

      return stocks.map((stock) => {
        const r = restMap.get(stock.restaurantId);
        return {
          restaurantId: stock.restaurantId,
          name: r?.name || '',
          address: r?.address,
          lat: r?.lat,
          lng: r?.lng,
          genre: (r?.genres || [])[0],
          genreTags: r?.genres || [],
          status: stock.status,
          ownerNickname: nickname,
          ownerId: f.followeeId,
        };
      }).filter((item) => item.name);
    })
  );

  res.json(allItems.flat());
});

// ─── レストラン保存/更新 ───

router.put('/restaurants/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const restaurantId = req.params.id as string;
  const v = validate(restaurantSchema, { id: restaurantId, ...req.body });
  if (!v.success) { res.status(400).json({ error: v.error }); return; }

  const data = v.data;
  const userId = req.user!.userId;

  // レストランマスターが無ければ作成（ユーザーがスワイプで保存した場合など）
  const existing = await getRestaurantV2(restaurantId);
  if (!existing) {
    await putRestaurantV2({
      restaurantId,
      name: data.name,
      address: data.address,
      lat: data.lat,
      lng: data.lng,
      genres: data.genreTags || (data.genre ? [data.genre] : []),
      priceRange: data.priceRange,
      photoUrls: [],
      urls: data.videoUrl ? [data.videoUrl] : [],
      description: '',
      postedBy: userId,
      visibility: 'public',
      stockCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    // 新規作成時は検索キャッシュを無効化して次回検索で反映
    invalidateSearchCache();
  }

  // UserStock を作成/更新
  const existingStock = await getUserStock(userId, restaurantId);
  const isNew = !existingStock;

  // undefined を除去（DynamoDB DocumentClient は undefined を marshal できない）
  const stockPayload: Record<string, unknown> = {
    restaurantId,
    status: data.status || 'wishlist',
    createdAt: existingStock?.createdAt || data.createdAt || new Date().toISOString(),
  };
  if (data.pinned !== undefined) stockPayload.pinned = data.pinned;
  if (data.notes !== undefined) stockPayload.notes = data.notes;
  if (data.landmarkMemo !== undefined) stockPayload.landmarkMemo = data.landmarkMemo;
  if (data.review !== undefined && data.review !== null) stockPayload.review = data.review;
  if (data.visitedAt !== undefined && data.visitedAt !== null) stockPayload.visitedAt = data.visitedAt;
  if (data.photoEmoji !== undefined) stockPayload.photoEmoji = data.photoEmoji;

  await putUserStock(userId, stockPayload as any);

  // 新規保存の場合stockCountを+1
  if (isNew) {
    await incrementStockCount(restaurantId, 1);
  }

  res.json({ ok: true });
});

// ─── レストラン削除 ───

router.delete('/restaurants/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const restaurantId = req.params.id as string;
  const userId = req.user!.userId;

  const existing = await getUserStock(userId, restaurantId);
  await deleteUserStock(userId, restaurantId);

  // stockCount を-1
  if (existing) {
    await incrementStockCount(restaurantId, -1);
  }

  res.json({ ok: true });
});

// ─── 一括同期（localStorage移行用） ───

router.post('/restaurants/sync', requireAuth, async (req: AuthRequest, res: Response) => {
  // 各 item を Zod で検証（旧: 全フィールドを raw cast していて巨大文字列 / 不正
  // 数値が DynamoDB に到達していた）
  const v = validate(syncBatchSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  const restaurants = v.data.restaurants;

  const userId = req.user!.userId;
  let synced = 0;
  for (const r of restaurants) {
    try {
      const restaurantId = r.id;

      // レストランマスターが無ければ作成
      const existing = await getRestaurantV2(restaurantId);
      if (!existing) {
        await putRestaurantV2({
          restaurantId,
          name: r.name ?? '',
          address: r.address,
          lat: r.lat,
          lng: r.lng,
          genres: r.genreTags ?? (r.genre ? [r.genre] : []),
          priceRange: r.priceRange,
          photoUrls: [],
          urls: r.videoUrl ? [r.videoUrl] : [],
          description: '',
          postedBy: userId,
          visibility: 'public',
          stockCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      const existingStock = await getUserStock(userId, restaurantId);
      await putUserStock(userId, {
        restaurantId,
        pinned: r.pinned,
        notes: r.notes,
        landmarkMemo: r.landmarkMemo,
        review: (r.review ?? undefined) as UserStock['review'],
        status: r.status === 'visited' ? 'visited' : 'wishlist',
        visitedAt: r.visitedAt,
        photoEmoji: r.photoEmoji,
        createdAt: r.createdAt || new Date().toISOString(),
      });

      if (!existingStock) await incrementStockCount(restaurantId, 1);
      synced++;
    } catch {}
  }

  res.json({ synced });
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

router.put('/settings/profile-photo', requireAuth, async (req: AuthRequest, res: Response) => {
  const raw = req.body.profilePhotoUrl;
  // 削除（null / 空）は許可。それ以外は http(s) スキームの URL のみ許可。
  // javascript: 等のスキームが <img src> や <a href> 経由で XSS の入り口に
  // ならないようバックでも検証する。
  let safeUrl: string | undefined = undefined;
  if (raw && typeof raw === 'string' && raw.length <= 1000) {
    try {
      const u = new URL(raw);
      if (u.protocol === 'http:' || u.protocol === 'https:') safeUrl = u.toString();
    } catch { /* 無効 URL は無視 */ }
    if (!safeUrl) {
      res.status(400).json({ error: '画像 URL は http(s):// で始まる必要があります' });
      return;
    }
  }
  const existing = await getUserSettings(req.user!.userId);
  await putUserSettings(req.user!.userId, { ...existing, profilePhotoUrl: safeUrl });
  res.json({ ok: true });
});

// ─── フォロー ───

router.post('/follow/:targetId', requireAuth, async (req: AuthRequest, res: Response) => {
  const targetId = req.params.targetId as string;
  const followerId = req.user!.userId;
  if (followerId === targetId) { res.status(400).json({ error: '自分をフォローできません' }); return; }

  // targetId が Cognito に実在するか確認（旧: 任意 UUID で notification spam 可）
  const targetUser = await getUserById(targetId).catch(() => null);
  if (!targetUser) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }

  const targetSettings = await getUserSettings(targetId);
  if (targetSettings.isPrivate) {
    await createFollowRequest(followerId, targetId);
    const follower = await getUserById(followerId);
    await createNotification(targetId, 'follow_request', followerId, follower?.nickname ?? '');
    res.json({ ok: true, pending: true });
    return;
  }

  await followUser(followerId, targetId);
  const follower = await getUserById(followerId);
  await createNotification(targetId, 'follow', followerId, follower?.nickname ?? '');
  res.json({ ok: true });
});

router.delete('/follow/:targetId', requireAuth, async (req: AuthRequest, res: Response) => {
  const targetId = req.params.targetId as string;
  await unfollowUser(req.user!.userId, targetId);
  res.json({ ok: true });
});

router.get('/following', requireAuth, async (req: AuthRequest, res: Response) => {
  const list = await getFollowing(req.user!.userId);
  const enriched = await Promise.all(list.map(async (f) => {
    const user = await getUserById(f.followeeId);
    return { ...f, nickname: user?.nickname ?? f.followeeId };
  }));
  res.json(enriched);
});

router.get('/followers', requireAuth, async (req: AuthRequest, res: Response) => {
  const { getFollowers } = await import('../services/dynamo');
  const list = await getFollowers(req.user!.userId);
  const enriched = await Promise.all(list.map(async (f) => {
    const user = await getUserById(f.followerId);
    return { ...f, nickname: user?.nickname ?? f.followerId };
  }));
  res.json(enriched);
});

router.get('/follow-requests', requireAuth, async (req: AuthRequest, res: Response) => {
  const requests = await getFollowRequests(req.user!.userId);
  const enriched = await Promise.all(requests.map(async (r) => {
    const user = await getUserById(r.requesterId);
    return { ...r, nickname: user?.nickname ?? r.requesterId };
  }));
  res.json(enriched);
});

router.post('/follow-requests/:requesterId/approve', requireAuth, async (req: AuthRequest, res: Response) => {
  const requesterId = req.params.requesterId as string;
  const targetId = req.user!.userId;
  await deleteFollowRequest(targetId, requesterId);
  await followUser(requesterId, targetId);
  const target = await getUserById(targetId);
  await createNotification(requesterId, 'follow_accepted', targetId, target?.nickname ?? '');
  res.json({ ok: true });
});

router.post('/follow-requests/:requesterId/reject', requireAuth, async (req: AuthRequest, res: Response) => {
  const requesterId = req.params.requesterId as string;
  await deleteFollowRequest(req.user!.userId, requesterId);
  res.json({ ok: true });
});

// ─── 通知 ───

router.get('/notifications', requireAuth, async (req: AuthRequest, res: Response) => {
  const list = await getNotifications(req.user!.userId);
  res.json(list);
});

router.post('/notifications/read', requireAuth, async (req: AuthRequest, res: Response) => {
  await markNotificationsRead(req.user!.userId);
  res.json({ ok: true });
});

// ─── ユーザー検索 ───

router.get('/users/search', requireAuth, async (req: AuthRequest, res: Response) => {
  const q = ((req.query.q as string) ?? '').trim().slice(0, 100);
  if (!q || q.length < 1) { res.json([]); return; }
  try {
    const users = await searchUsers(q);
    res.json(users);
  } catch (err) {
    console.error('User search failed:', err);
    res.json([]);
  }
});

// ─── 統合検索（ユーザー + お店 + URL） ───

router.get('/search', requireAuth, async (req: AuthRequest, res: Response) => {
  const q = ((req.query.q as string) ?? '').trim().slice(0, 200);
  if (!q || q.length < 1) {
    res.json({ users: [], restaurants: [], urlMatch: null });
    return;
  }

  const isUrl = q.startsWith('http://') || q.startsWith('https://');

  if (isUrl) {
    const restaurantId = await lookupRestaurantByUrl(q);
    if (restaurantId) {
      const r = await getRestaurantV2(restaurantId);
      if (r && r.visibility !== 'private' && r.visibility !== 'hidden') {
        const profile = await getInfluencerProfile(r.postedBy);
        res.json({
          users: [],
          restaurants: [],
          urlMatch: {
            restaurantId: r.restaurantId,
            name: r.name,
            address: r.address,
            lat: r.lat,
            lng: r.lng,
            genres: r.genres,
            priceRange: r.priceRange,
            photoUrls: r.photoUrls,
            influencer: profile?.displayName,
            influencerId: r.postedBy,
          },
        });
        return;
      }
    }
    res.json({ users: [], restaurants: [], urlMatch: null });
    return;
  }

  // ユーザー検索 + お店検索を並列
  const [users, restaurants] = await Promise.all([
    searchUsers(q).catch(() => []),
    searchRestaurantsV2(q),
  ]);

  // private/hidden除外
  const visibleRestaurants = restaurants.filter((r) => r.visibility !== 'private' && r.visibility !== 'hidden');

  // レストラン結果にインフルエンサー名を付与（BatchGet で N+1 解消）
  const postedByIds = [...new Set(visibleRestaurants.map((r) => r.postedBy))];
  const profileMap = await batchGetInfluencerProfiles(postedByIds);

  res.json({
    users,
    restaurants: visibleRestaurants.map((r) => ({
      restaurantId: r.restaurantId,
      name: r.name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      genres: r.genres,
      priceRange: r.priceRange,
      photoUrls: r.photoUrls,
      influencer: profileMap.get(r.postedBy)?.displayName,
      influencerId: r.postedBy,
    })),
    urlMatch: null,
  });
});

// ─── ユーザープロフィール ───

router.get('/users/:userId/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  const targetId = req.params.userId as string;
  try {
    const [userInfo, settings, stocks] = await Promise.all([
      getUserById(targetId),
      getUserSettings(targetId),
      getUserStocks(targetId),
    ]);
    if (!userInfo) {
      res.status(404).json({ error: 'ユーザーが見つかりません' });
      return;
    }

    const isMyself = targetId === req.user!.userId;
    const isPrivate = !!settings.isPrivate;
    const following = isMyself ? [] : await getFollowing(req.user!.userId);
    const isFollowing = following.some((f) => f.followeeId === targetId);

    if (isPrivate && !isMyself && !isFollowing) {
      res.json({
        userId: userInfo.userId,
        nickname: userInfo.nickname,
        createdAt: userInfo.createdAt,
        profilePhotoUrl: settings.profilePhotoUrl ?? null,
        isPrivate: true,
        isLockedOut: true,
        isFollowing: false,
        restaurantCount: 0,
        reviewedCount: 0,
        influencerCount: 0,
        restaurants: [],
      });
      return;
    }

    // レストランデータ + インフルエンサープロフィールを取得
    const [restaurants, influencerProfile] = await Promise.all([
      stocks.length > 0
        ? batchGetRestaurantsV2(stocks.map((s) => s.restaurantId))
        : Promise.resolve([]),
      getInfluencerProfile(targetId),
    ]);
    const restMap = new Map(restaurants.map((r) => [r.restaurantId, r]));

    const publicRestaurants = stocks.map((stock) => {
      const r = restMap.get(stock.restaurantId);
      return {
        name: r?.name || '',
        address: r?.address,
        lat: r?.lat,
        lng: r?.lng,
        status: stock.status,
        hasReview: !!stock.review,
        landmarkMemo: stock.landmarkMemo,
        genreTags: r?.genres || [],
      };
    }).filter((item) => item.name);

    res.json({
      userId: userInfo.userId,
      nickname: userInfo.nickname,
      createdAt: userInfo.createdAt,
      profilePhotoUrl: settings.profilePhotoUrl ?? null,
      isPrivate,
      isFollowing: isMyself ? undefined : isFollowing,
      restaurantCount: stocks.length,
      reviewedCount: stocks.filter((s) => !!s.review).length,
      influencerCount: (settings.influencers ?? []).length,
      restaurants: publicRestaurants,
      bio: influencerProfile?.bio ?? null,
      instagramHandle: influencerProfile?.instagramHandle ?? null,
      instagramUrl: influencerProfile?.instagramUrl ?? null,
      tiktokHandle: influencerProfile?.tiktokHandle ?? null,
      tiktokUrl: influencerProfile?.tiktokUrl ?? null,
      youtubeHandle: influencerProfile?.youtubeHandle ?? null,
      youtubeUrl: influencerProfile?.youtubeUrl ?? null,
    });
  } catch (err) {
    console.error('Profile fetch failed:', err);
    res.status(500).json({ error: 'プロフィール取得に失敗しました' });
  }
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
  const userId = req.user!.userId;
  const following = await getFollowing(userId);
  const followeeIds = new Set(following.map((f) => f.followeeId));
  followeeIds.add(userId);

  // フォロー中のシェア + 全体の最新シェアを並行取得
  const [followingFeed, recentFeed] = await Promise.all([
    getSharesFeed([...followeeIds]),
    getRecentShares(50),
  ]);

  // マージ: フォロー中を先頭に、重複排除
  const seen = new Set<string>();
  const merged = [];

  // フォロー中を優先
  for (const s of followingFeed) {
    const key = `${s.userId}:${s.createdAt}`;
    if (!seen.has(key)) { seen.add(key); merged.push(s); }
  }
  // 残りの公開シェアを追加
  for (const s of recentFeed) {
    const key = `${s.userId}:${s.createdAt}`;
    if (!seen.has(key)) { seen.add(key); merged.push(s); }
  }

  res.json(merged.slice(0, 50));
});

router.delete('/shares/:createdAt', requireAuth, async (req: AuthRequest, res: Response) => {
  const createdAt = Number(req.params.createdAt);
  if (!createdAt) { res.status(400).json({ error: '無効なパラメータ' }); return; }
  await deleteShare(req.user!.userId, createdAt);
  res.json({ ok: true });
});

// ─── URL照合（Share Extension用） ───

router.get('/restaurants/by-url', requireAuth, async (req: AuthRequest, res: Response) => {
  const url = ((req.query.url as string) ?? '').trim();
  if (!url) { res.status(400).json({ error: 'URLが必要です' }); return; }
  // 入力 URL のサイズ・スキームを縛って DoS / 不正リクエストを弾く
  if (url.length > 1000 || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: '不正な URL です' }); return;
  }

  const restaurantId = await lookupRestaurantByUrl(url);
  if (!restaurantId) { res.json({ found: false }); return; }

  const restaurant = await getRestaurantV2(restaurantId);
  if (!restaurant || restaurant.visibility === 'private' || restaurant.visibility === 'hidden') {
    res.json({ found: false }); return;
  }

  const profile = await getInfluencerProfile(restaurant.postedBy);
  res.json({
    found: true,
    restaurant: {
      restaurantId: restaurant.restaurantId,
      name: restaurant.name,
      address: restaurant.address,
      lat: restaurant.lat,
      lng: restaurant.lng,
      genres: restaurant.genres,
      priceRange: restaurant.priceRange,
      photoUrls: restaurant.photoUrls,
      description: restaurant.description,
      influencer: profile?.displayName,
    },
  });
});

router.post('/restaurants/stock-by-url', requireAuth, async (req: AuthRequest, res: Response) => {
  const url = String(req.body.url ?? '').trim();
  if (!url) { res.status(400).json({ error: 'URLが必要です' }); return; }
  if (url.length > 1000 || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: '不正な URL です' }); return;
  }

  const restaurantId = await lookupRestaurantByUrl(url);
  if (!restaurantId) {
    res.status(404).json({ error: 'この投稿に一致するお店が見つかりません' });
    return;
  }

  const restaurant = await getRestaurantV2(restaurantId);
  if (!restaurant || restaurant.visibility === 'private' || restaurant.visibility === 'hidden') {
    res.status(404).json({ error: 'お店が見つかりません' });
    return;
  }

  const userId = req.user!.userId;
  const existingStock = await getUserStock(userId, restaurantId);

  if (!existingStock) {
    await putUserStock(userId, {
      restaurantId,
      status: 'wishlist',
      photoEmoji: '🍽️',
      createdAt: new Date().toISOString(),
    });
    await incrementStockCount(restaurantId, 1);
  }

  res.json({ ok: true, name: restaurant.name });
});

// ─── 検索からお店を保存 ───

router.post('/restaurants/stock-from-place', requireAuth, async (req: AuthRequest, res: Response) => {
  const { name, address, lat, lng } = req.body;
  // 入力検証：name 必須 200 文字以内、address 300 文字以内、lat/lng は妥当な範囲
  if (!name || typeof name !== 'string' || name.length > 200) {
    res.status(400).json({ error: 'お店の名前が必要です（200文字以内）' });
    return;
  }
  if (address != null && (typeof address !== 'string' || address.length > 300)) {
    res.status(400).json({ error: '住所は300文字以内にしてください' });
    return;
  }
  if (lat != null && (typeof lat !== 'number' || lat < -90 || lat > 90)) {
    res.status(400).json({ error: 'lat が無効です' });
    return;
  }
  if (lng != null && (typeof lng !== 'number' || lng < -180 || lng > 180)) {
    res.status(400).json({ error: 'lng が無効です' });
    return;
  }
  const userId = req.user!.userId;
  // crypto.randomUUID で衝突安全な ID を生成（旧: Math.random）
  const restaurantId = `place_${randomUUID()}`;

  await putRestaurantV2({
    restaurantId,
    name: name.trim(),
    address: address ? address.trim() : undefined,
    lat: typeof lat === 'number' ? lat : undefined,
    lng: typeof lng === 'number' ? lng : undefined,
    genres: [],
    photoUrls: [],
    urls: [],
    postedBy: userId,
    visibility: 'private',
    stockCount: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  await putUserStock(userId, {
    restaurantId,
    status: 'wishlist',
    photoEmoji: '🍽️',
    createdAt: new Date().toISOString(),
  });

  res.json({ ok: true, restaurantId, name });
});

// ─── ジャンル追加リクエスト ───

router.post('/genre-request', requireAuth, async (req: AuthRequest, res: Response) => {
  const genre = String(req.body.genre || '').trim();
  if (!genre || genre.length > 50) {
    res.status(400).json({ error: 'ジャンル名を入力してください（50文字以内）' });
    return;
  }
  await saveGenreRequest(req.user!.userId, req.user!.nickname, genre);
  res.json({ ok: true });
});

// ─── 投稿者ランキング（保存数の合計） ───

// resolved profiles のキャッシュ（10 分）。ranking signature が変わらない
// 限り Cognito + DynamoDB を毎リクエストで叩かない。
type ResolvedRanking = { userId: string; totalStocks: number; nickname: string; profilePhotoUrl: string };
let rankingResolvedCache: ResolvedRanking[] = [];
let rankingResolvedSignature = '';
let rankingResolvedExpiry = 0;
const RANKING_RESOLVED_TTL = 10 * 60_000;

router.get('/ranking', requireAuth, async (_req: AuthRequest, res: Response) => {
  const ranking = await getStockRankingV2(20); // 削除済みを弾いた後に Top N 切り出すため少し多めに取得
  // signature: 上位 20 の (userId, totalStocks) を連結。変わらない限り再解決しない。
  const sig = ranking.map((r) => `${r.postedBy}:${r.totalStocks}`).join(',');
  if (sig === rankingResolvedSignature && Date.now() < rankingResolvedExpiry && rankingResolvedCache.length) {
    res.json(rankingResolvedCache.slice(0, 5));
    return;
  }

  // インフルエンサープロフィールは BatchGet で 1 回にまとめる（旧: per-row GetItem）
  const profileMap = await batchGetInfluencerProfiles(ranking.map((r) => r.postedBy).filter(Boolean));

  const resolved = await Promise.all(ranking.map(async (r) => {
    if (!r.postedBy) return null; // 匿名化済み
    try {
      // getUserById（Cognito ListUsers + sub フィルタ）はバッチ化が困難なので並列のまま。
      // 結果はキャッシュに乗る（10 分）。
      const userInfo = await getUserById(r.postedBy).catch(() => null);
      if (!userInfo) return null; // Cognito にユーザー無し = 削除済み
      const profile = profileMap.get(r.postedBy);
      const nickname = profile?.displayName || userInfo.nickname || '';
      if (!nickname) return null;
      return {
        userId: r.postedBy,
        totalStocks: r.totalStocks,
        nickname,
        profilePhotoUrl: profile?.profilePhotoUrl || '',
      };
    } catch {
      return null;
    }
  }));
  const withProfiles = resolved.filter((x): x is NonNullable<typeof x> => x !== null).slice(0, 5);
  rankingResolvedCache = withProfiles;
  rankingResolvedSignature = sig;
  rankingResolvedExpiry = Date.now() + RANKING_RESOLVED_TTL;
  res.json(withProfiles);
});

// ─── 保存ランキング（お店別） ───

router.get('/ranking/spots', requireAuth, async (_req: AuthRequest, res: Response) => {
  const spots = await getTopRestaurantsByStockCount(10);
  res.json(spots);
});

// UserStock type import for sync
import type { UserStock } from '../types';

export default router;
