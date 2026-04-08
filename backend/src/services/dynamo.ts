import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  BatchWriteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  Restaurant,
  UserSettings,
  Follow,
  FollowRequest,
  Notification,
  NotificationType,
  InfluencerProfile,
  InfluencerRestaurant,
} from '../types';

const rawClient = new DynamoDBClient({ region: 'ap-northeast-1' });
const db = DynamoDBDocumentClient.from(rawClient);


const TABLE = {
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

// ─── レストラン ───

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

export async function getUserStockRanking(limit = 30): Promise<{ userId: string; totalStocks: number }[]> {
  // 1. インフルエンサーが投稿したレストランID → 投稿者IDのマップを作る
  const restaurantToOwner = new Map<string, string>();
  let lastKey1: Record<string, unknown> | undefined;
  do {
    const result = await db.send(new ScanCommand({
      TableName: TABLE.influencerRestaurants,
      ProjectionExpression: 'restaurantId, influencerId',
      ExclusiveStartKey: lastKey1,
    }));
    for (const item of result.Items ?? []) {
      restaurantToOwner.set(item.restaurantId as string, item.influencerId as string);
    }
    lastKey1 = result.LastEvaluatedKey;
  } while (lastKey1);

  // 2. ユーザーの保存を全スキャンし、投稿者ごとに保存回数を集計
  const counts = new Map<string, number>();
  let lastKey2: Record<string, unknown> | undefined;
  do {
    const result = await db.send(new ScanCommand({
      TableName: TABLE.restaurants,
      ProjectionExpression: 'restaurantId',
      ExclusiveStartKey: lastKey2,
    }));
    for (const item of result.Items ?? []) {
      const owner = restaurantToOwner.get(item.restaurantId as string);
      if (owner) {
        counts.set(owner, (counts.get(owner) ?? 0) + 1);
      }
    }
    lastKey2 = result.LastEvaluatedKey;
  } while (lastKey2);

  return [...counts.entries()]
    .map(([userId, totalStocks]) => ({ userId, totalStocks }))
    .sort((a, b) => b.totalStocks - a.totalStocks)
    .slice(0, limit);
}

// ─── ユーザー設定（インフルエンサー・カテゴリ等） ───

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

// ─── フォロー ───

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

// ─── フォローリクエスト（鍵垢用） ───

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

// ─── 通知 ───

export async function createNotification(userId: string, type: NotificationType, fromUserId: string, fromNickname: string, content?: string) {
  // createdAtにランダムサフィックスを付与してミリ秒衝突を回避
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
    ScanIndexForward: false, // 新しい順
    Limit: limit,
  }));
  return (result.Items ?? []) as Notification[];
}

export async function markNotificationsRead(userId: string) {
  // 全件取得（上限1000件）して未読を一括更新
  const items = await getNotifications(userId, 1000);
  const unread = items.filter((item) => !item.read);
  if (unread.length === 0) return;

  // BatchWriteはUpdateをサポートしないため、個別Updateだが並列化
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

// ─── アカウント削除（全データ削除） ───

// ─── リクエスト統計（永続化） ───

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

// ─── ジャンル追加リクエスト ───

export async function saveGenreRequest(userId: string, nickname: string, genre: string) {
  const ts = Date.now();
  await db.send(new PutCommand({
    TableName: TABLE.stats,
    Item: { pk: `genre_req#${ts}#${userId}`, userId, nickname, genre, createdAt: ts },
  }));
}

export async function saveActivity(data: Record<string, { lastSeen: number; nickname?: string }>) {
  // ユーザーごとに分割して保存（400KBリミット回避）
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
  // 旧形式（単一レコード）から読み込み
  // 新形式はper-user保存だが、読み込みはメモリ上のuserActivityから行うため
  // 起動時は旧形式のフォールバックのみ
  const legacy = await db.send(new GetCommand({
    TableName: TABLE.stats,
    Key: { pk: 'user_activity' },
  }));
  if (legacy.Item?.data) {
    return legacy.Item.data as Record<string, { lastSeen: number; nickname?: string }>;
  }
  return null;
}


// ─── インフルエンサー ───

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

export async function putInfluencerRestaurant(influencerId: string, restaurant: Partial<InfluencerRestaurant> & { restaurantId: string }) {
  await db.send(new PutCommand({
    TableName: TABLE.influencerRestaurants,
    Item: { influencerId, ...restaurant, updatedAt: Date.now() },
  }));
}

export async function updateRestaurantVisibility(influencerId: string, restaurantId: string, visibility: string) {
  await db.send(new UpdateCommand({
    TableName: TABLE.influencerRestaurants,
    Key: { influencerId, restaurantId },
    UpdateExpression: 'SET visibility = :v, updatedAt = :u',
    ExpressionAttributeValues: { ':v': visibility, ':u': Date.now() },
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

export async function searchRestaurantsByName(query: string, limit = 20): Promise<(InfluencerRestaurant & { influencerDisplayName?: string })[]> {
  const q = query.toLowerCase();
  const allRestaurants = await scanAllInfluencerRestaurants();
  const matched = allRestaurants.filter((r) =>
    r.name.toLowerCase().includes(q) ||
    (r.address?.toLowerCase().includes(q)) ||
    (r.genres?.some((g) => g.toLowerCase().includes(q)))
  );

  // インフルエンサー名を付与
  const influencerIds = [...new Set(matched.map((r) => r.influencerId))];
  const profiles = await Promise.all(influencerIds.map((id) => getInfluencerProfile(id)));
  const profileMap = new Map(profiles.filter(Boolean).map((p) => [p!.influencerId, p!]));

  return matched.slice(0, limit).map((r) => ({
    ...r,
    influencerDisplayName: profileMap.get(r.influencerId)?.displayName,
  }));
}

export async function findRestaurantByUrl(url: string): Promise<(InfluencerRestaurant & { influencerDisplayName?: string }) | null> {
  // URLを正規化（末尾スラッシュ、クエリパラメータ除去）
  const normalize = (u: string) => {
    try {
      const parsed = new URL(u);
      let path = parsed.pathname.replace(/\/+$/, '');
      // Instagram: /reels/ID → /reel/ID に統一
      path = path.replace(/^\/reels\//, '/reel/');
      // www除去で統一
      const host = parsed.hostname.replace(/^www\./, '');
      return `${host}${path}`.toLowerCase();
    } catch {
      return u.toLowerCase().replace(/\/+$/, '').replace(/\?.*$/, '');
    }
  };

  const normalizedUrl = normalize(url);

  // InfluencerRestaurantsを全スキャンしてURL照合
  const allRestaurants = await scanAllInfluencerRestaurants();
  for (const r of allRestaurants) {
    const urls = [r.instagramUrl, r.videoUrl].filter(Boolean) as string[];
    for (const u of urls) {
      if (normalize(u) === normalizedUrl) {
        // インフルエンサー名も取得
        const profile = await getInfluencerProfile(r.influencerId);
        return { ...r, influencerDisplayName: profile?.displayName };
      }
    }
  }
  return null;
}

export async function deleteInfluencerRestaurant(influencerId: string, restaurantId: string) {
  await db.send(new DeleteCommand({
    TableName: TABLE.influencerRestaurants,
    Key: { influencerId, restaurantId },
  }));
}

export async function deleteAllUserData(userId: string) {
  // レストラン全削除（BatchWrite使用）
  const restaurants = await getRestaurants(userId);
  const restChunks = chunkArray(restaurants, 25);
  for (const chunk of restChunks) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE.restaurants]: chunk.map((r) => ({
          DeleteRequest: { Key: { userId, restaurantId: r.restaurantId } },
        })),
      },
    }));
  }

  // 設定削除
  await db.send(new DeleteCommand({
    TableName: TABLE.settings,
    Key: { userId },
  }));

  // フォロー関係削除（BatchWrite使用）
  const following = await getFollowing(userId);
  const followChunks = chunkArray(following, 25);
  for (const chunk of followChunks) {
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
  const notifChunks = chunkArray(notifications, 25);
  for (const chunk of notifChunks) {
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
  const shareChunks = chunkArray(shares, 25);
  for (const chunk of shareChunks) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE.shares]: chunk.map((s) => ({
          DeleteRequest: { Key: { userId, createdAt: s.createdAt } },
        })),
      },
    }));
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── シェア ───

export async function createShare(data: {
  userId: string;
  userNickname: string;
  restaurantName: string;
  restaurantAddress?: string;
  lat?: number;
  lng?: number;
  comment?: string;
}) {
  const item = {
    ...data,
    shareId: crypto.randomUUID(),
    createdAt: Date.now(),
  };
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
  // 並列クエリ数を制限（最大50人分、10件ずつバッチ処理）
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

