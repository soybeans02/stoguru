import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  // V2
  putRestaurantV2, getRestaurantV2, batchGetRestaurantsV2,
  queryRestaurantsByGeohash, queryRestaurantsByPostedBy,
  putUserStock, getUserStocks, deleteUserStock, getUserStock,
  incrementStockCount, invalidateSearchCache,
  lookupRestaurantByUrl, searchRestaurantsV2,
  getStockRankingV2,
  // 既存
  getUserSettings, putUserSettings,
  followUser, unfollowUser, getFollowing,
  createFollowRequest, getFollowRequests, deleteFollowRequest,
  createNotification, getNotifications, markNotificationsRead,
  createShare, getSharesFeed, deleteShare,
  getInfluencerProfile,
  saveGenreRequest,
} from '../services/dynamo';
import { searchUsers, getUserById } from '../services/cognito';
import type { RestaurantV2 } from '../types';
import { validate, restaurantSchema, settingsSchema, shareSchema, nearbySchema } from '../validators';
import { haversineDistance } from '../utils/geo';
import { encode as geohashEncode, neighbors as geohashNeighbors } from '../utils/geohash';

const router = Router();

// ─── スワイプ用フィード（geohashベース、スキャン不要） ───

router.get('/restaurants/feed', requireAuth, async (req: AuthRequest, res: Response) => {
  const v = validate(nearbySchema, req.query);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  const { lat, lng, radius } = v.data;
  const userId = req.user!.userId;

  // geohash precision 4の9セルをクエリ（約40km×20km × 9 = 広域カバー）
  const centerHash4 = geohashEncode(lat, lng, 4);
  const cells = geohashNeighbors(centerHash4);

  const results = await Promise.all(cells.map((cell) => queryRestaurantsByGeohash(cell)));
  const allRestaurants = results.flat();

  // 距離フィルタ + 自分の投稿を除外 + hidden除外
  const nearby = allRestaurants
    .filter((r) => r.lat != null && r.lng != null && r.postedBy !== userId && r.visibility !== 'hidden')
    .map((r) => ({
      ...r,
      distanceMeters: haversineDistance(lat, lng, r.lat!, r.lng!),
    }))
    .filter((r) => r.distanceMeters <= radius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  // インフルエンサープロフィールをまとめて取得
  const influencerIds = [...new Set(nearby.map((r) => r.postedBy))];
  const profiles = await Promise.all(influencerIds.map((id) => getInfluencerProfile(id)));
  const profileMap = new Map(profiles.filter(Boolean).map((p) => [p!.influencerId, p!]));

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
      scene: [],
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

  res.json(feed);
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
  }

  // UserStock を作成/更新
  const existingStock = await getUserStock(userId, restaurantId);
  const isNew = !existingStock;

  await putUserStock(userId, {
    restaurantId,
    pinned: data.pinned,
    notes: data.notes,
    landmarkMemo: data.landmarkMemo,
    review: data.review,
    status: data.status || 'wishlist',
    visitedAt: data.visitedAt,
    photoEmoji: data.photoEmoji,
    createdAt: existingStock?.createdAt || data.createdAt || new Date().toISOString(),
  });

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
  const { restaurants } = req.body as { restaurants: (Record<string, unknown> & { id: string })[] };
  if (!Array.isArray(restaurants) || restaurants.length > 500) {
    res.status(400).json({ error: 'restaurants 配列が必要です（上限500件）' });
    return;
  }

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
          name: String(r.name || ''),
          address: r.address as string | undefined,
          lat: r.lat as number | undefined,
          lng: r.lng as number | undefined,
          genres: (r.genreTags as string[]) || (r.genre ? [String(r.genre)] : []),
          priceRange: r.priceRange as string | undefined,
          photoUrls: [],
          urls: r.videoUrl ? [String(r.videoUrl)] : [],
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
        pinned: r.pinned as boolean | undefined,
        notes: r.notes as string | undefined,
        landmarkMemo: r.landmarkMemo as string | undefined,
        review: r.review as UserStock['review'],
        status: ((r.status as string) === 'visited' ? 'visited' : 'wishlist'),
        visitedAt: r.visitedAt as string | undefined,
        photoEmoji: r.photoEmoji as string | undefined,
        createdAt: (r.createdAt as string) || new Date().toISOString(),
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

// ─── フォロー ───

router.post('/follow/:targetId', requireAuth, async (req: AuthRequest, res: Response) => {
  const targetId = req.params.targetId as string;
  const followerId = req.user!.userId;
  if (followerId === targetId) { res.status(400).json({ error: '自分をフォローできません' }); return; }

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
  res.json(list);
});

router.get('/followers', requireAuth, async (req: AuthRequest, res: Response) => {
  const { getFollowers } = await import('../services/dynamo');
  const list = await getFollowers(req.user!.userId);
  res.json(list);
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
      if (r) {
        const profile = await getInfluencerProfile(r.postedBy);
        res.json({
          users: [],
          restaurants: [],
          urlMatch: {
            restaurantId: r.restaurantId,
            name: r.name,
            address: r.address,
            genres: r.genres,
            priceRange: r.priceRange,
            photoUrls: r.photoUrls,
            influencer: profile?.displayName,
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

  // レストラン結果にインフルエンサー名を付与
  const postedByIds = [...new Set(restaurants.map((r) => r.postedBy))];
  const profiles = await Promise.all(postedByIds.map((id) => getInfluencerProfile(id)));
  const profileMap = new Map(profiles.filter(Boolean).map((p) => [p!.influencerId, p!]));

  res.json({
    users,
    restaurants: restaurants.map((r) => ({
      restaurantId: r.restaurantId,
      name: r.name,
      address: r.address,
      genres: r.genres,
      priceRange: r.priceRange,
      photoUrls: r.photoUrls,
      influencer: profileMap.get(r.postedBy)?.displayName,
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

    if (isPrivate && !isMyself) {
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

    // レストランデータを取得
    const restaurants = stocks.length > 0
      ? await batchGetRestaurantsV2(stocks.map((s) => s.restaurantId))
      : [];
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
      isPrivate,
      restaurantCount: stocks.length,
      reviewedCount: stocks.filter((s) => !!s.review).length,
      influencerCount: (settings.influencers ?? []).length,
      restaurants: publicRestaurants,
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
  const following = await getFollowing(req.user!.userId);
  const followeeIds = following.map((f) => f.followeeId);
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

// ─── URL照合（Share Extension用） ───

router.get('/restaurants/by-url', requireAuth, async (req: AuthRequest, res: Response) => {
  const url = ((req.query.url as string) ?? '').trim();
  if (!url) { res.status(400).json({ error: 'URLが必要です' }); return; }

  const restaurantId = await lookupRestaurantByUrl(url);
  if (!restaurantId) { res.json({ found: false }); return; }

  const restaurant = await getRestaurantV2(restaurantId);
  if (!restaurant) { res.json({ found: false }); return; }

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

  const restaurantId = await lookupRestaurantByUrl(url);
  if (!restaurantId) {
    res.status(404).json({ error: 'この投稿に一致するお店が見つかりません' });
    return;
  }

  const restaurant = await getRestaurantV2(restaurantId);
  if (!restaurant) {
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

// ─── 保存ランキング（投稿者別） ───

router.get('/ranking', requireAuth, async (_req: AuthRequest, res: Response) => {
  const ranking = await getStockRankingV2(30);
  const withProfiles = await Promise.all(ranking.map(async (r) => {
    try {
      const profile = await getInfluencerProfile(r.postedBy);
      return { userId: r.postedBy, totalStocks: r.totalStocks, nickname: profile?.displayName || '不明', profilePhotoUrl: profile?.profilePhotoUrl || '' };
    } catch {
      return { userId: r.postedBy, totalStocks: r.totalStocks, nickname: '不明', profilePhotoUrl: '' };
    }
  }));
  res.json(withProfiles);
});

// UserStock type import for sync
import type { UserStock } from '../types';

export default router;
