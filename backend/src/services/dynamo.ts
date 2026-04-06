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
  conversations: 'GourmetStock_Conversations',
  messages: 'GourmetStock_Messages',
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

// ─── メッセージ ───

function makeConversationId(a: string, b: string): string {
  return [a, b].sort().join('#');
}

export async function getOrCreateConversation(senderId: string, receiverId: string) {
  const pk = makeConversationId(senderId, receiverId);
  const existing = await db.send(new GetCommand({
    TableName: TABLE.conversations,
    Key: { pk },
  }));
  if (existing.Item) return existing.Item;

  const conv = {
    pk,
    user1: [senderId, receiverId].sort()[0],
    user2: [senderId, receiverId].sort()[1],
    status: 'pending',
    requestedBy: senderId,
    lastMessage: '',
    lastMessageAt: Date.now(),
    createdAt: Date.now(),
  };
  await db.send(new PutCommand({ TableName: TABLE.conversations, Item: conv }));
  return conv;
}

export async function getConversation(user1: string, user2: string) {
  const pk = makeConversationId(user1, user2);
  const result = await db.send(new GetCommand({
    TableName: TABLE.conversations,
    Key: { pk },
  }));
  return result.Item ?? null;
}

export async function updateConversationStatus(pk: string, status: string) {
  await db.send(new UpdateCommand({
    TableName: TABLE.conversations,
    Key: { pk },
    UpdateExpression: 'SET #s = :status',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':status': status },
  }));
}

export async function updateConversationLastMessage(pk: string, content: string) {
  await db.send(new UpdateCommand({
    TableName: TABLE.conversations,
    Key: { pk },
    UpdateExpression: 'SET lastMessage = :msg, lastMessageAt = :ts',
    ExpressionAttributeValues: { ':msg': content.slice(0, 50), ':ts': Date.now() },
  }));
}

export async function getUserConversations(userId: string) {
  try {
    // GSIで効率的に取得
    const [r1, r2] = await Promise.all([
      db.send(new QueryCommand({
        TableName: TABLE.conversations,
        IndexName: 'user1-index',
        KeyConditionExpression: 'user1 = :uid',
        ExpressionAttributeValues: { ':uid': userId },
      })),
      db.send(new QueryCommand({
        TableName: TABLE.conversations,
        IndexName: 'user2-index',
        KeyConditionExpression: 'user2 = :uid',
        ExpressionAttributeValues: { ':uid': userId },
      })),
    ]);
    const seen = new Set<string>();
    const items = [...(r1.Items ?? []), ...(r2.Items ?? [])].filter((item) => {
      const pk = (item as Record<string, string>).pk;
      if (seen.has(pk)) return false;
      seen.add(pk);
      return true;
    });
    return items.sort((a, b) =>
      ((b as Record<string, number>).lastMessageAt ?? 0) - ((a as Record<string, number>).lastMessageAt ?? 0)
    );
  } catch (err) {
    // GSIが存在しない場合はエラーを投げる（Scanフォールバックは避ける）
    throw new Error(`getUserConversations failed: GSI query error for userId=${userId}: ${err}`);
  }
}

export async function markConversationRead(pk: string, userId: string, user1: string) {
  const field = userId === user1 ? 'user1LastRead' : 'user2LastRead';
  await db.send(new UpdateCommand({
    TableName: TABLE.conversations,
    Key: { pk },
    UpdateExpression: 'SET #f = :ts',
    ExpressionAttributeNames: { '#f': field },
    ExpressionAttributeValues: { ':ts': Date.now() },
  }));
}

export async function sendMessage(conversationId: string, senderId: string, content: string) {
  const msg = {
    conversationId,
    createdAt: Date.now(),
    senderId,
    content,
    read: false,
  };
  await db.send(new PutCommand({ TableName: TABLE.messages, Item: msg }));
  await updateConversationLastMessage(conversationId, content);
  return msg;
}

export async function getMessages(conversationId: string, limit = 200) {
  const result = await db.send(new QueryCommand({
    TableName: TABLE.messages,
    KeyConditionExpression: 'conversationId = :cid',
    ExpressionAttributeValues: { ':cid': conversationId },
    ScanIndexForward: true,
    Limit: limit,
  }));
  return result.Items ?? [];
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

  // 会話のメッセージ削除
  const convs = await getUserConversations(userId).catch(() => []);
  for (const conv of convs) {
    const pk = conv.pk as string;
    const msgs = await getMessages(pk, 1000);
    const msgChunks = chunkArray(msgs, 25);
    for (const chunk of msgChunks) {
      await db.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE.messages]: chunk.map((m) => ({
            DeleteRequest: { Key: { conversationId: pk, createdAt: (m as Record<string, unknown>).createdAt as number } },
          })),
        },
      }));
    }
    // 会話自体を削除
    await db.send(new DeleteCommand({ TableName: TABLE.conversations, Key: { pk } }));
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
