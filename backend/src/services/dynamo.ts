import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  Restaurant,
  UserSettings,
  Follow,
  FollowRequest,
  Notification,
  NotificationType,
} from '../types';

const rawClient = new DynamoDBClient({ region: 'ap-northeast-1' });
const db = DynamoDBDocumentClient.from(rawClient);

import { ScanCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = {
  restaurants: 'GourmetStock_Restaurants',
  settings: 'GourmetStock_UserSettings',
  follows: 'GourmetStock_Follows',
  followRequests: 'GourmetStock_FollowRequests',
  notifications: 'GourmetStock_Notifications',
  stats: 'GourmetStock_Stats',
  conversations: 'GourmetStock_Conversations',
  messages: 'GourmetStock_Messages',
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
  const item: Record<string, unknown> = { userId, createdAt: Date.now(), type, fromUserId, fromNickname, read: false };
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
  const items = await getNotifications(userId);
  for (const item of items) {
    if (!item.read) {
      await db.send(new UpdateCommand({
        TableName: TABLE.notifications,
        Key: { userId, createdAt: item.createdAt },
        UpdateExpression: 'SET #r = :true',
        ExpressionAttributeNames: { '#r': 'read' },
        ExpressionAttributeValues: { ':true': true },
      }));
    }
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
  } catch {
    // GSI未作成時はScanフォールバック
    const result = await db.send(new ScanCommand({
      TableName: TABLE.conversations,
      FilterExpression: 'user1 = :uid OR user2 = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    }));
    return (result.Items ?? []).sort((a, b) =>
      ((b as Record<string, number>).lastMessageAt ?? 0) - ((a as Record<string, number>).lastMessageAt ?? 0)
    );
  }
}

export async function markConversationRead(pk: string, userId: string, user1: string) {
  const field = userId === user1 ? 'user1LastRead' : 'user2LastRead';
  await db.send(new UpdateCommand({
    TableName: TABLE.conversations,
    Key: { pk },
    UpdateExpression: `SET ${field} = :ts`,
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

export async function deleteAllUserData(userId: string) {
  // レストラン全削除
  const restaurants = await getRestaurants(userId);
  for (const r of restaurants) {
    await db.send(new DeleteCommand({
      TableName: TABLE.restaurants,
      Key: { userId, restaurantId: r.restaurantId },
    }));
  }

  // 設定削除
  await db.send(new DeleteCommand({
    TableName: TABLE.settings,
    Key: { userId },
  }));

  // フォロー関係削除
  const following = await getFollowing(userId);
  for (const f of following) {
    await db.send(new DeleteCommand({
      TableName: TABLE.follows,
      Key: { followerId: userId, followeeId: f.followeeId },
    }));
  }
}
