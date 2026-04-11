import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  BatchWriteCommand,
  BatchGetCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  Restaurant,
  RestaurantV2,
  UserStock,
  UrlIndexEntry,
  UserSettings,
  Follow,
  FollowRequest,
  Notification,
  NotificationType,
  InfluencerProfile,
  InfluencerRestaurant,
} from '../types';
import { encode as geohashEncode } from '../utils/geohash';

const rawClient = new DynamoDBClient({ region: 'ap-northeast-1' });
const db = DynamoDBDocumentClient.from(rawClient);

const TABLE = {
  // 新テーブル（V2）
  restaurantsV2: 'GourmetStock_Restaurants_v2',
  userStocks: 'GourmetStock_UserStocks',
  urlIndex: 'GourmetStock_UrlIndex',
  // 既存テーブル
  restaurants: 'GourmetStock_Restaurants',
  settings: 'GourmetStock_UserSettings',
  follows: 'GourmetStock_Follows',
  followRequests: 'GourmetStock_FollowRequests',
  notifications: 'GourmetStock_Notifications',
  stats: 'GourmetStock_Stats',
  shares: 'GourmetStock_Shares',
  influencerProfiles: 'GourmetStock_InfluencerProfiles',
  influencerRestaurants: 'GourmetStock_InfluencerRestaurants',
} as const;

// =============================================
// V2: レストランマスター（1店舗1レコード）
// =============================================

export async function putRestaurantV2(restaurant: Omit<RestaurantV2, 'nameLower' | 'geohash' | 'geohash4'> & { nameLower?: string; geohash?: string; geohash4?: string }) {
  const nameLower = restaurant.nameLower ?? restaurant.name.toLowerCase();
  const geohash = (restaurant.lat != null && restaurant.lng != null)
    ? geohashEncode(restaurant.lat, restaurant.lng, 6)
    : undefined;
  const geohash4 = geohash ? geohash.substring(0, 4) : undefined;

  await db.send(new PutCommand({
    TableName: TABLE.restaurantsV2,
    Item: {
      ...restaurant,
      nameLower,
      geohash,
      geohash4,
      updatedAt: Date.now(),
    },
  }));

  // URL逆引きインデックスも更新
  if (restaurant.urls?.length) {
    await putUrlIndexEntries(restaurant.restaurantId, restaurant.urls);
  }
}

export async function getRestaurantV2(restaurantId: string): Promise<RestaurantV2 | null> {
  const result = await db.send(new GetCommand({
    TableName: TABLE.restaurantsV2,
    Key: { restaurantId },
  }));
  return (result.Item as RestaurantV2) ?? null;
}

export async function batchGetRestaurantsV2(restaurantIds: string[]): Promise<RestaurantV2[]> {
  if (restaurantIds.length === 0) return [];

  const results: RestaurantV2[] = [];
  // BatchGetItemは100件まで
  for (const chunk of chunkArray(restaurantIds, 100)) {
    const keys = chunk.map((id) => ({ restaurantId: id }));
    const res = await db.send(new BatchGetCommand({
      RequestItems: {
        [TABLE.restaurantsV2]: { Keys: keys },
      },
    }));
    const items = res.Responses?.[TABLE.restaurantsV2] ?? [];
    results.push(...(items as RestaurantV2[]));
  }
  return results;
}

export async function deleteRestaurantV2(restaurantId: string) {
  // まずURLインデックスを削除
  const existing = await getRestaurantV2(restaurantId);
  if (existing?.urls?.length) {
    await deleteUrlIndexEntries(existing.urls);
  }
  await db.send(new DeleteCommand({
    TableName: TABLE.restaurantsV2,
    Key: { restaurantId },
  }));
}

/**
 * Geohash GSIでの位置検索
 * geohash4プレフィックスでクエリ → 約40km×20km のセル
 */
export async function queryRestaurantsByGeohash(geohash4: string): Promise<RestaurantV2[]> {
  const result = await db.send(new QueryCommand({
    TableName: TABLE.restaurantsV2,
    IndexName: 'GSI-Geohash',
    KeyConditionExpression: 'geohash4 = :gh',
    ExpressionAttributeValues: { ':gh': geohash4 },
    Limit: 1000,
  }));
  return (result.Items ?? []) as RestaurantV2[];
}

/**
 * 投稿者別のレストラン一覧（GSI-PostedBy）
 */
export async function queryRestaurantsByPostedBy(postedBy: string): Promise<RestaurantV2[]> {
  const result = await db.send(new QueryCommand({
    TableName: TABLE.restaurantsV2,
    IndexName: 'GSI-PostedBy',
    KeyConditionExpression: 'postedBy = :pb',
    ExpressionAttributeValues: { ':pb': postedBy },
    ScanIndexForward: false,
  }));
  return (result.Items ?? []) as RestaurantV2[];
}

/**
 * レストランのstockCountをアトミックに増減
 */
export async function incrementStockCount(restaurantId: string, delta: number) {
  await db.send(new UpdateCommand({
    TableName: TABLE.restaurantsV2,
    Key: { restaurantId },
    UpdateExpression: 'ADD stockCount :d',
    ExpressionAttributeValues: { ':d': delta },
  }));
}

/**
 * レストランのvisibilityを更新
 */
export async function updateRestaurantV2Visibility(restaurantId: string, visibility: string) {
  const existing = await getRestaurantV2(restaurantId);
  if (existing?.urls?.length) {
    if (visibility === 'hidden' || visibility === 'private') {
      // soft delete: URLインデックスも削除
      await deleteUrlIndexEntries(existing.urls);
    } else if (existing.visibility === 'hidden' || existing.visibility === 'private') {
      // 復元: URLインデックスを再作成
      await putUrlIndexEntries(restaurantId, existing.urls);
    }
  }
  await db.send(new UpdateCommand({
    TableName: TABLE.restaurantsV2,
    Key: { restaurantId },
    UpdateExpression: 'SET visibility = :v, updatedAt = :u',
    ExpressionAttributeValues: { ':v': visibility, ':u': Date.now() },
  }));
}

// =============================================
// V2: ユーザーストック（紐付けのみ）
// =============================================

export async function putUserStock(userId: string, stock: Omit<UserStock, 'userId' | 'updatedAt'>) {
  await db.send(new PutCommand({
    TableName: TABLE.userStocks,
    Item: { userId, ...stock, updatedAt: Date.now() },
  }));
}

export async function getUserStocks(userId: string): Promise<UserStock[]> {
  const result = await db.send(new QueryCommand({
    TableName: TABLE.userStocks,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    Limit: 1000,
  }));
  return (result.Items ?? []) as UserStock[];
}

export async function deleteUserStock(userId: string, restaurantId: string) {
  await db.send(new DeleteCommand({
    TableName: TABLE.userStocks,
    Key: { userId, restaurantId },
  }));
}

export async function getUserStock(userId: string, restaurantId: string): Promise<UserStock | null> {
  const result = await db.send(new GetCommand({
    TableName: TABLE.userStocks,
    Key: { userId, restaurantId },
  }));
  return (result.Item as UserStock) ?? null;
}

/**
 * あるレストランを保存しているユーザー数（GSI-RestaurantStocks）
 */
export async function getStockUserCount(restaurantId: string): Promise<number> {
  const result = await db.send(new QueryCommand({
    TableName: TABLE.userStocks,
    IndexName: 'GSI-RestaurantStocks',
    KeyConditionExpression: 'restaurantId = :rid',
    ExpressionAttributeValues: { ':rid': restaurantId },
    Select: 'COUNT',
  }));
  return result.Count ?? 0;
}

// =============================================
// URL逆引きインデックス
// =============================================

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '');

    // YouTube: 動画IDを抽出して統一
    // youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID, youtube.com/embed/ID
    if (host === 'youtube.com' || host === 'youtu.be') {
      let videoId: string | null = null;
      if (host === 'youtu.be') {
        videoId = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
      } else if (parsed.pathname === '/watch') {
        videoId = parsed.searchParams.get('v');
      } else if (parsed.pathname.startsWith('/shorts/')) {
        videoId = parsed.pathname.split('/')[2] ?? null;
      } else if (parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.split('/')[2] ?? null;
      } else if (parsed.pathname.startsWith('/v/')) {
        videoId = parsed.pathname.split('/')[2] ?? null;
      }
      if (videoId) return `youtube.com/v/${videoId}`;
    }

    // TikTok: /@user/video/{id} 形式から動画IDを抽出
    // 短縮URL (vm.tiktok.com/ZShortcode) は別エントリ扱い
    if (host === 'tiktok.com' || host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
      const match = parsed.pathname.match(/\/video\/(\d+)/);
      if (match) return `tiktok.com/v/${match[1]}`;
      // /v/{id}.html (mobile) 形式
      const mobileMatch = parsed.pathname.match(/^\/v\/(\d+)/);
      if (mobileMatch) return `tiktok.com/v/${mobileMatch[1]}`;
    }

    // Instagram (既存ロジック): /reels/ → /reel/ に統一
    let path = parsed.pathname.replace(/\/+$/, '');
    path = path.replace(/^\/reels\//, '/reel/');
    return `${host}${path}`.toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/+$/, '').replace(/\?.*$/, '');
  }
}

async function putUrlIndexEntries(restaurantId: string, urls: string[]) {
  const items = urls.filter(Boolean).map((url) => ({
    PutRequest: {
      Item: { normalizedUrl: normalizeUrl(url), restaurantId },
    },
  }));
  for (const chunk of chunkArray(items, 25)) {
    await db.send(new BatchWriteCommand({
      RequestItems: { [TABLE.urlIndex]: chunk },
    }));
  }
}

async function deleteUrlIndexEntries(urls: string[]) {
  const items = urls.filter(Boolean).map((url) => ({
    DeleteRequest: {
      Key: { normalizedUrl: normalizeUrl(url) },
    },
  }));
  for (const chunk of chunkArray(items, 25)) {
    await db.send(new BatchWriteCommand({
      RequestItems: { [TABLE.urlIndex]: chunk },
    }));
  }
}

export async function lookupRestaurantByUrl(url: string): Promise<string | null> {
  const normalized = normalizeUrl(url);
  const result = await db.send(new GetCommand({
    TableName: TABLE.urlIndex,
    Key: { normalizedUrl: normalized },
  }));
  return (result.Item as UrlIndexEntry)?.restaurantId ?? null;
}

// =============================================
// テキスト検索（インメモリキャッシュ）
// =============================================

let searchCache: RestaurantV2[] = [];
let searchCacheExpiry = 0;
const SEARCH_CACHE_TTL = 60_000; // 60秒

async function getSearchCache(): Promise<RestaurantV2[]> {
  if (Date.now() < searchCacheExpiry && searchCache.length > 0) return searchCache;

  // 全件スキャン（V2テーブルが小さいうちはOK、将来はStreams+ESに移行）
  const items: RestaurantV2[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await db.send(new ScanCommand({
      TableName: TABLE.restaurantsV2,
      ProjectionExpression: 'restaurantId, #n, nameLower, address, genres, priceRange, photoUrls, postedBy, visibility',
      ExpressionAttributeNames: { '#n': 'name' },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...((result.Items ?? []) as RestaurantV2[]));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  searchCache = items;
  searchCacheExpiry = Date.now() + SEARCH_CACHE_TTL;
  return items;
}

export function invalidateSearchCache() {
  searchCacheExpiry = 0;
}

export async function searchRestaurantsV2(query: string, limit = 20): Promise<RestaurantV2[]> {
  const q = query.toLowerCase();
  const cache = await getSearchCache();
  return cache
    .filter((r) =>
      r.visibility !== 'hidden' &&
      (r.nameLower.includes(q) ||
       r.address?.toLowerCase().includes(q) ||
       r.genres?.some((g) => g.toLowerCase().includes(q)))
    )
    .slice(0, limit);
}

// =============================================
// ランキング（V2: stockCountベース）
// =============================================

export async function getStockRankingV2(limit = 30): Promise<{ postedBy: string; totalStocks: number }[]> {
  // 全レストランのstockCountを投稿者別に集計
  // TODO: データ量が増えたらGSIまたはアグリゲーションテーブルに移行
  const items: RestaurantV2[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await db.send(new ScanCommand({
      TableName: TABLE.restaurantsV2,
      ProjectionExpression: 'postedBy, stockCount, visibility',
      ExclusiveStartKey: lastKey,
    }));
    items.push(...((result.Items ?? []) as RestaurantV2[]));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.postedBy && item.stockCount > 0 && item.visibility !== 'private') {
      counts.set(item.postedBy, (counts.get(item.postedBy) ?? 0) + item.stockCount);
    }
  }

  return [...counts.entries()]
    .map(([postedBy, totalStocks]) => ({ postedBy, totalStocks }))
    .sort((a, b) => b.totalStocks - a.totalStocks)
    .slice(0, limit);
}

// =============================================
// 旧テーブル（マイグレーション用に残す）
// =============================================

export async function putRestaurant(userId: string, restaurant: Partial<Restaurant> & { id: string }) {
  await db.send(new PutCommand({
    TableName: TABLE.restaurants,
    Item: { userId, restaurantId: restaurant.id, ...restaurant, updatedAt: Date.now() },
  }));
}

export async function getRestaurants(userId: string): Promise<Restaurant[]> {
  const result = await db.send(new QueryCommand({
    TableName: TABLE.restaurants,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    Limit: 500,
  }));
  return (result.Items ?? []) as Restaurant[];
}

export async function deleteRestaurant(userId: string, restaurantId: string) {
  await db.send(new DeleteCommand({
    TableName: TABLE.restaurants,
    Key: { userId, restaurantId },
  }));
}

export async function scanAllInfluencerRestaurants(): Promise<InfluencerRestaurant[]> {
  const items: InfluencerRestaurant[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await db.send(new ScanCommand({
      TableName: TABLE.influencerRestaurants,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...((result.Items ?? []) as InfluencerRestaurant[]));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// =============================================
// ユーザー設定
// =============================================

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const result = await db.send(new GetCommand({
    TableName: TABLE.settings,
    Key: { userId },
  }));
  return (result.Item as UserSettings) ?? { userId, influencers: [], categories: [] };
}

export async function putUserSettings(userId: string, settings: Partial<UserSettings>) {
  await db.send(new PutCommand({
    TableName: TABLE.settings,
    Item: { userId, ...settings, updatedAt: Date.now() },
  }));
}

// =============================================
// フォロー
// =============================================

export async function followUser(followerId: string, followeeId: string) {
  await db.send(new PutCommand({
    TableName: TABLE.follows,
    Item: { followerId, followeeId, createdAt: Date.now() },
  }));
}

export async function unfollowUser(followerId: string, followeeId: string) {
  await db.send(new DeleteCommand({
    TableName: TABLE.follows,
    Key: { followerId, followeeId },
  }));
}

export async function getFollowing(followerId: string): Promise<Follow[]> {
  const result = await db.send(new QueryCommand({
    TableName: TABLE.follows,
    KeyConditionExpression: 'followerId = :fid',
    ExpressionAttributeValues: { ':fid': followerId },
  }));
  return (result.Items ?? []) as Follow[];
}

export async function getFollowers(followeeId: string): Promise<Follow[]> {
  const result = await db.send(new QueryCommand({
    TableName: TABLE.follows,
    IndexName: 'followeeId-index',
    KeyConditionExpression: 'followeeId = :fid',
    ExpressionAttributeValues: { ':fid': followeeId },
  }));
  return (result.Items ?? []) as Follow[];
}

// =============================================
// フォローリクエスト
// =============================================

export async function createFollowRequest(requesterId: string, targetId: string) {
  await db.send(new PutCommand({
    TableName: TABLE.followRequests,
    Item: { targetId, requesterId, createdAt: Date.now() },
  }));
}

export async function getFollowRequests(targetId: string): Promise<FollowRequest[]> {
  const result = await db.send(new QueryCommand({
    TableName: TABLE.followRequests,
    KeyConditionExpression: 'targetId = :tid',
    ExpressionAttributeValues: { ':tid': targetId },
    Limit: 100,
  }));
  return (result.Items ?? []) as FollowRequest[];
}

export async function deleteFollowRequest(targetId: string, requesterId: string) {
  await db.send(new DeleteCommand({
    TableName: TABLE.followRequests,
    Key: { targetId, requesterId },
  }));
}

// =============================================
// 通知
// =============================================

export async function createNotification(userId: string, type: NotificationType, fromUserId: string, fromNickname: string, content?: string) {
  const ts = Date.now() + Math.random() * 0.999;
  const item: Record<string, unknown> = { userId, createdAt: ts, type, fromUserId, fromNickname, read: false };
  if (content) item.content = content.slice(0, 50);
  await db.send(new PutCommand({
    TableName: TABLE.notifications,
    Item: item,
  }));
}

export async function getNotifications(userId: string, limit = 20): Promise<Notification[]> {
  const result = await db.send(new QueryCommand({
    TableName: TABLE.notifications,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return (result.Items ?? []) as Notification[];
}

export async function markNotificationsRead(userId: string) {
  const items = await getNotifications(userId, 1000);
  const unread = items.filter((item) => !item.read);
  if (unread.length === 0) return;

  const batchSize = 10;
  for (let i = 0; i < unread.length; i += batchSize) {
    const batch = unread.slice(i, i + batchSize);
    await Promise.all(batch.map((item) =>
      db.send(new UpdateCommand({
        TableName: TABLE.notifications,
        Key: { userId, createdAt: item.createdAt },
        UpdateExpression: 'SET #r = :true',
        ExpressionAttributeNames: { '#r': 'read' },
        ExpressionAttributeValues: { ':true': true },
      }))
    ));
  }
}

// =============================================
// インフルエンサープロフィール
// =============================================

export async function putInfluencerProfile(influencerId: string, data: Partial<InfluencerProfile>) {
  await db.send(new PutCommand({
    TableName: TABLE.influencerProfiles,
    Item: { influencerId, ...data, updatedAt: Date.now() },
  }));
}

export async function getInfluencerProfile(influencerId: string): Promise<InfluencerProfile | null> {
  const result = await db.send(new GetCommand({
    TableName: TABLE.influencerProfiles,
    Key: { influencerId },
  }));
  return (result.Item as InfluencerProfile) ?? null;
}

// =============================================
// 旧インフルエンサーレストラン（マイグレーション用）
// =============================================

export async function putInfluencerRestaurant(influencerId: string, restaurant: Partial<InfluencerRestaurant> & { restaurantId: string }) {
  await db.send(new PutCommand({
    TableName: TABLE.influencerRestaurants,
    Item: { influencerId, ...restaurant, updatedAt: Date.now() },
  }));
}

export async function getInfluencerRestaurants(influencerId: string): Promise<InfluencerRestaurant[]> {
  const result = await db.send(new QueryCommand({
    TableName: TABLE.influencerRestaurants,
    KeyConditionExpression: 'influencerId = :iid',
    ExpressionAttributeValues: { ':iid': influencerId },
    Limit: 500,
  }));
  return (result.Items ?? []) as InfluencerRestaurant[];
}

export async function updateRestaurantVisibility(influencerId: string, restaurantId: string, visibility: string) {
  await db.send(new UpdateCommand({
    TableName: TABLE.influencerRestaurants,
    Key: { influencerId, restaurantId },
    UpdateExpression: 'SET visibility = :v, updatedAt = :u',
    ExpressionAttributeValues: { ':v': visibility, ':u': Date.now() },
  }));
}

export async function deleteInfluencerRestaurant(influencerId: string, restaurantId: string) {
  await db.send(new DeleteCommand({
    TableName: TABLE.influencerRestaurants,
    Key: { influencerId, restaurantId },
  }));
}

// =============================================
// 統計
// =============================================

export async function saveStats(data: Record<string, unknown>) {
  await db.send(new PutCommand({
    TableName: TABLE.stats,
    Item: { pk: 'request_stats', ...data, updatedAt: Date.now() },
  }));
}

export async function loadStats(): Promise<Record<string, unknown> | null> {
  const result = await db.send(new GetCommand({
    TableName: TABLE.stats,
    Key: { pk: 'request_stats' },
  }));
  return (result.Item as Record<string, unknown>) ?? null;
}

export async function saveGenreRequest(userId: string, nickname: string, genre: string) {
  const ts = Date.now();
  await db.send(new PutCommand({
    TableName: TABLE.stats,
    Item: { pk: `genre_req#${ts}#${userId}`, userId, nickname, genre, createdAt: ts },
  }));
}

export async function saveActivity(data: Record<string, { lastSeen: number; nickname?: string }>) {
  const entries = Object.entries(data);
  const chunks = chunkArray(entries, 25);
  for (const chunk of chunks) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE.stats]: chunk.map(([userId, d]) => ({
          PutRequest: {
            Item: { pk: `activity#${userId}`, lastSeen: d.lastSeen, nickname: d.nickname, updatedAt: Date.now() },
          },
        })),
      },
    }));
  }
}

export async function loadActivity(): Promise<Record<string, { lastSeen: number; nickname?: string }> | null> {
  const legacy = await db.send(new GetCommand({
    TableName: TABLE.stats,
    Key: { pk: 'user_activity' },
  }));
  if (legacy.Item?.data) {
    return legacy.Item.data as Record<string, { lastSeen: number; nickname?: string }>;
  }
  return null;
}

// =============================================
// アカウント削除
// =============================================

export async function deleteAllUserData(userId: string) {
  // 新テーブル: UserStocks削除 + stockCount減算
  const stocks = await getUserStocks(userId);
  for (const chunk of chunkArray(stocks, 25)) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE.userStocks]: chunk.map((s) => ({
          DeleteRequest: { Key: { userId, restaurantId: s.restaurantId } },
        })),
      },
    }));
    // stockCountを減算
    await Promise.all(chunk.map((s) => incrementStockCount(s.restaurantId, -1).catch(() => {})));
  }

  // 旧テーブル: レストラン全削除
  const restaurants = await getRestaurants(userId);
  for (const chunk of chunkArray(restaurants, 25)) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE.restaurants]: chunk.map((r) => ({
          DeleteRequest: { Key: { userId, restaurantId: r.restaurantId } },
        })),
      },
    }));
  }

  // 設定削除
  await db.send(new DeleteCommand({ TableName: TABLE.settings, Key: { userId } }));

  // フォロー関係削除
  const following = await getFollowing(userId);
  for (const chunk of chunkArray(following, 25)) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE.follows]: chunk.map((f) => ({
          DeleteRequest: { Key: { followerId: userId, followeeId: f.followeeId } },
        })),
      },
    }));
  }

  // 通知削除
  const notifications = await getNotifications(userId, 1000);
  for (const chunk of chunkArray(notifications, 25)) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE.notifications]: chunk.map((n) => ({
          DeleteRequest: { Key: { userId, createdAt: n.createdAt } },
        })),
      },
    }));
  }

  // シェア削除
  const shares = await getSharesByUser(userId, 1000);
  for (const chunk of chunkArray(shares, 25)) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE.shares]: chunk.map((s) => ({
          DeleteRequest: { Key: { userId, createdAt: s.createdAt } },
        })),
      },
    }));
  }
}

// =============================================
// シェア
// =============================================

export async function createShare(data: {
  userId: string;
  userNickname: string;
  restaurantName: string;
  restaurantAddress?: string;
  lat?: number;
  lng?: number;
  comment?: string;
}) {
  const item = { ...data, shareId: crypto.randomUUID(), createdAt: Date.now() };
  await db.send(new PutCommand({ TableName: TABLE.shares, Item: item }));
  return item;
}

async function getSharesByUser(userId: string, limit = 20) {
  const res = await db.send(new QueryCommand({
    TableName: TABLE.shares,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return (res.Items ?? []) as Array<{
    userId: string; shareId: string; restaurantName: string;
    restaurantAddress?: string; lat?: number; lng?: number;
    comment?: string; createdAt: number; userNickname: string;
  }>;
}

export async function getSharesFeed(followeeIds: string[], limit = 50) {
  const capped = followeeIds.slice(0, 50);
  const results: Awaited<ReturnType<typeof getSharesByUser>>[] = [];
  const BATCH = 10;
  for (let i = 0; i < capped.length; i += BATCH) {
    const batch = capped.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map((id) => getSharesByUser(id, 20)));
    results.push(...batchResults);
  }
  return results.flat().sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export async function deleteShare(userId: string, createdAt: number) {
  await db.send(new DeleteCommand({
    TableName: TABLE.shares,
    Key: { userId, createdAt },
  }));
}

// =============================================
// ヘルパー
// =============================================

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
