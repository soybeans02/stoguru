import { DynamoDBClient, PutItemCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
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
const db = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

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
  feedback: 'GourmetStock_Feedback',
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
    if (host === 'tiktok.com') {
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

/**
 * 短縮URL展開のメモリキャッシュ
 * - プロセス内でのみ有効（再起動でクリア）
 * - 同じ短縮URLに対する HTTP HEAD の重複発行を抑える
 * - サイズ上限を超えたら古いエントリから削除 (簡易LRU)
 */
const EXPAND_CACHE_MAX = 2000;
const expandCache = new Map<string, string>();

function cacheGetExpanded(key: string): string | undefined {
  const v = expandCache.get(key);
  if (v !== undefined) {
    // 最近参照した要素を末尾に移動 (LRU更新)
    expandCache.delete(key);
    expandCache.set(key, v);
  }
  return v;
}

function cacheSetExpanded(key: string, value: string): void {
  if (expandCache.has(key)) expandCache.delete(key);
  expandCache.set(key, value);
  if (expandCache.size > EXPAND_CACHE_MAX) {
    // 最古のエントリを削除
    const oldest = expandCache.keys().next().value;
    if (oldest !== undefined) expandCache.delete(oldest);
  }
}

/**
 * 短縮URLを展開する（リダイレクト先のLocationヘッダを取得）
 * - vt.tiktok.com / vm.tiktok.com など
 * - 結果をメモリキャッシュして HTTP 叩く回数を抑える
 * - 失敗時は元のURLを返す
 */
async function expandShortUrl(url: string): Promise<string> {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    // 展開対象のホストのみ処理
    const shortHosts = ['vt.tiktok.com', 'vm.tiktok.com'];
    if (!shortHosts.includes(host)) return url;

    // キャッシュヒット
    const cached = cacheGetExpanded(url);
    if (cached !== undefined) return cached;

    // 同じURLを同時に複数展開しない（in-flight dedup）
    const inflight = expandInflight.get(url);
    if (inflight) return inflight;

    const promise = doExpandShortUrl(url);
    expandInflight.set(url, promise);
    try {
      return await promise;
    } finally {
      expandInflight.delete(url);
    }
  } catch {
    return url;
  }
}

// in-flight dedup: 同時リクエストの重複排除
const expandInflight = new Map<string, Promise<string>>();

/**
 * SSRF ガード: 内部ネットワーク / メタデータエンドポイントへのアクセスを拒否。
 * 短縮 URL のリダイレクト先が AWS メタデータ (169.254.169.254) や
 * localhost / プライベート IP に向いていないか確認する。
 */
function isUnsafeRedirectTarget(targetUrl: string): boolean {
  try {
    const u = new URL(targetUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    // IPv6 ループバック
    if (host === '[::1]' || host === '::1') return true;
    // IPv4 数値マッチ（プライベート / リンクローカル / メタデータ / ループバック）
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
      const a = +m[1], b = +m[2];
      if (a === 10) return true;                                  // 10.0.0.0/8
      if (a === 127) return true;                                 // 127.0.0.0/8
      if (a === 169 && b === 254) return true;                    // 169.254.0.0/16 (AWS metadata 含む)
      if (a === 172 && b >= 16 && b <= 31) return true;           // 172.16.0.0/12
      if (a === 192 && b === 168) return true;                    // 192.168.0.0/16
      if (a === 0) return true;                                   // 0.0.0.0/8
      if (a >= 224) return true;                                  // multicast / reserved
    }
    return false;
  } catch {
    return true;
  }
}

async function doExpandShortUrl(url: string): Promise<string> {
  // HEADでLocation取得（最大3回リダイレクト追跡、タイムアウト短縮）
  let current = url;
  // 入力 URL 自体も SSRF チェック（短縮 URL 識別済みだが念のため）
  if (isUnsafeRedirectTarget(current)) return url;
  for (let i = 0; i < 3; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const res = await fetch(current, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      const loc = res.headers.get('location');
      if (!loc) {
        cacheSetExpanded(url, current);
        return current;
      }
      const next = new URL(loc, current).toString();
      // 内部 IP / メタデータエンドポイントへのリダイレクトは中断（SSRF 防御）
      if (isUnsafeRedirectTarget(next)) return url;
      current = next;
      // 既にtiktok.com本体に到達したら終了
      const nextHost = new URL(current).hostname.replace(/^www\./, '');
      if (nextHost === 'tiktok.com') {
        cacheSetExpanded(url, current);
        return current;
      }
    } catch {
      clearTimeout(timer);
      // 失敗時はキャッシュしない（次回リトライさせる）
      return url;
    }
  }
  cacheSetExpanded(url, current);
  return current;
}

/**
 * 短縮URLを展開してから正規化する（async版）
 */
export async function normalizeUrlAsync(url: string): Promise<string> {
  const expanded = await expandShortUrl(url);
  return normalizeUrl(expanded);
}

async function putUrlIndexEntries(restaurantId: string, urls: string[]) {
  const normalizedUrls = await Promise.all(urls.filter(Boolean).map((u) => normalizeUrlAsync(u)));
  const items = normalizedUrls.map((normalizedUrl) => ({
    PutRequest: {
      Item: { normalizedUrl, restaurantId },
    },
  }));
  for (const chunk of chunkArray(items, 25)) {
    await db.send(new BatchWriteCommand({
      RequestItems: { [TABLE.urlIndex]: chunk },
    }));
  }
}

async function deleteUrlIndexEntries(urls: string[]) {
  const normalizedUrls = await Promise.all(urls.filter(Boolean).map((u) => normalizeUrlAsync(u)));
  const items = normalizedUrls.map((normalizedUrl) => ({
    DeleteRequest: {
      Key: { normalizedUrl },
    },
  }));
  for (const chunk of chunkArray(items, 25)) {
    await db.send(new BatchWriteCommand({
      RequestItems: { [TABLE.urlIndex]: chunk },
    }));
  }
}

export async function lookupRestaurantByUrl(url: string): Promise<string | null> {
  // まず同期的に正規化して即座にDB照合を開始
  const syncNormalized = normalizeUrl(url);
  const lookups: Promise<string | null>[] = [
    db.send(new GetCommand({
      TableName: TABLE.urlIndex,
      Key: { normalizedUrl: syncNormalized },
    })).then(r => (r.Item as UrlIndexEntry)?.restaurantId ?? null),
  ];

  // 短縮URLの場合は展開版も並列で照合
  const parsed = tryParseUrl(url);
  const host = parsed?.hostname.replace(/^www\./, '').replace(/^m\./, '') ?? '';
  const isShortUrl = ['vt.tiktok.com', 'vm.tiktok.com'].includes(host);

  if (isShortUrl) {
    lookups.push((async () => {
      const expanded = await normalizeUrlAsync(url);
      if (expanded === syncNormalized) return null;
      const result = await db.send(new GetCommand({
        TableName: TABLE.urlIndex,
        Key: { normalizedUrl: expanded },
      }));
      return (result.Item as UrlIndexEntry)?.restaurantId ?? null;
    })());
  }

  // 動画URLからプロフィールURLを推測してフォールバック照合
  // 例: tiktok.com/@user/video/123 → tiktok.com/@user
  //     instagram.com/reel/ABC → (ハンドル不明なのでスキップ)
  const profileUrl = extractProfileUrl(url, host, parsed);
  if (profileUrl && profileUrl !== syncNormalized) {
    lookups.push(
      db.send(new GetCommand({
        TableName: TABLE.urlIndex,
        Key: { normalizedUrl: profileUrl },
      })).then(r => (r.Item as UrlIndexEntry)?.restaurantId ?? null),
    );
  }

  const results = await Promise.all(lookups);
  return results.find(r => r !== null) ?? null;
}

/**
 * 動画URLからプロフィールURL（正規化済み）を推測する
 * TikTok: /@user/video/123 → tiktok.com/@user
 * YouTube: /watch?v=xxx のチャンネルURLは不明なのでスキップ
 * Instagram: /reel/xxx はハンドル含まないのでスキップ
 */
function extractProfileUrl(url: string, host: string, parsed: URL | null): string | null {
  if (!parsed) return null;

  if (host === 'tiktok.com') {
    const match = parsed.pathname.match(/^\/@([^/]+)/);
    if (match) return `tiktok.com/@${match[1]}`.toLowerCase();
  }

  // YouTube: /@handle/video → /@handle
  if (host === 'youtube.com') {
    const match = parsed.pathname.match(/^\/@([^/]+)/);
    if (match) return `youtube.com/@${match[1]}`.toLowerCase();
  }

  return null;
}

function tryParseUrl(url: string): URL | null {
  try { return new URL(url); } catch { return null; }
}

// =============================================
// テキスト検索（インメモリキャッシュ）
// =============================================

let searchCache: RestaurantV2[] = [];
let searchCacheExpiry = 0;
const SEARCH_CACHE_TTL = 5 * 60_000; // 5分
// 同時複数リクエストが cache miss すると並列で Scan が走る
// （thundering herd）。inflight Promise を共有して 1 回にまとめる。
let searchCacheInflight: Promise<RestaurantV2[]> | null = null;

async function getSearchCache(): Promise<RestaurantV2[]> {
  if (Date.now() < searchCacheExpiry && searchCache.length > 0) return searchCache;
  if (searchCacheInflight) return searchCacheInflight;

  searchCacheInflight = (async () => {
    try {
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
    } finally {
      searchCacheInflight = null;
    }
  })();
  return searchCacheInflight;
}

export function invalidateSearchCache() {
  searchCacheExpiry = 0;
  spotsRankingExpiry = 0;
  rankingCacheExpiry = 0;
}

export async function searchRestaurantsV2(query: string, limit = 20): Promise<RestaurantV2[]> {
  // 「渋谷 ラーメン」のような空白区切りクエリは AND マッチ（全トークンが
  // name / address / genres の連結文字列内に含まれるレストランを返す）。
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const cache = await getSearchCache();
  return cache
    .filter((r) => {
      if (r.visibility === 'hidden') return false;
      const nameLower = (r.nameLower ?? r.name?.toLowerCase() ?? '');
      const addressLower = r.address?.toLowerCase() ?? '';
      const genresLower = (r.genres ?? []).map((g) => g?.toLowerCase() ?? '').join(' ');
      const hay = `${nameLower} ${addressLower} ${genresLower}`;
      return tokens.every((tok) => hay.includes(tok));
    })
    .slice(0, limit);
}

// =============================================
// ランキング（V2: stockCountベース）
// =============================================

let rankingCache: { postedBy: string; totalStocks: number }[] = [];
let rankingCacheExpiry = 0;
const RANKING_CACHE_TTL = 10 * 60_000; // 10分
let rankingCacheInflight: Promise<{ postedBy: string; totalStocks: number }[]> | null = null;

// お店ごとのストック数ランキング（個別レストラン）
let spotsRankingCache: RestaurantV2[] = [];
let spotsRankingExpiry = 0;
const SPOTS_RANKING_TTL = 10 * 60_000;
let spotsRankingInflight: Promise<RestaurantV2[]> | null = null;

export async function getTopRestaurantsByStockCount(limit = 10): Promise<RestaurantV2[]> {
  if (Date.now() < spotsRankingExpiry && spotsRankingCache.length > 0) {
    return spotsRankingCache.slice(0, limit);
  }
  if (spotsRankingInflight) return (await spotsRankingInflight).slice(0, limit);

  spotsRankingInflight = (async () => {
    try {
      const items: RestaurantV2[] = [];
      let lastKey: Record<string, unknown> | undefined;
      do {
        const result = await db.send(new ScanCommand({
          TableName: TABLE.restaurantsV2,
          ExclusiveStartKey: lastKey,
        }));
        items.push(...((result.Items ?? []) as RestaurantV2[]));
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

      spotsRankingCache = items
        .filter((r) => r.stockCount > 0 && r.visibility !== 'private' && r.visibility !== 'hidden')
        .sort((a, b) => b.stockCount - a.stockCount);
      spotsRankingExpiry = Date.now() + SPOTS_RANKING_TTL;
      return spotsRankingCache;
    } finally {
      spotsRankingInflight = null;
    }
  })();
  return (await spotsRankingInflight).slice(0, limit);
}

export async function getStockRankingV2(limit = 30): Promise<{ postedBy: string; totalStocks: number }[]> {
  if (Date.now() < rankingCacheExpiry && rankingCache.length > 0) {
    return rankingCache.slice(0, limit);
  }
  if (rankingCacheInflight) return (await rankingCacheInflight).slice(0, limit);

  rankingCacheInflight = (async () => {
    try {
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
        // postedBy 空（削除済み匿名化）、private、hidden は除外
        if (
          item.postedBy &&
          item.stockCount > 0 &&
          item.visibility !== 'private' &&
          item.visibility !== 'hidden'
        ) {
          counts.set(item.postedBy, (counts.get(item.postedBy) ?? 0) + item.stockCount);
        }
      }

      rankingCache = [...counts.entries()]
        .map(([postedBy, totalStocks]) => ({ postedBy, totalStocks }))
        .sort((a, b) => b.totalStocks - a.totalStocks);
      rankingCacheExpiry = Date.now() + RANKING_CACHE_TTL;
      return rankingCache;
    } finally {
      rankingCacheInflight = null;
    }
  })();
  return (await rankingCacheInflight).slice(0, limit);
}

// =============================================
// 旧テーブル（マイグレーション完了済み・内部参照だけ残置）
// =============================================
// putRestaurant / deleteRestaurant / scanAllInfluencerRestaurants は
// V2 移行で外部 export 不要になったので削除。getRestaurants は
// deleteAllUserData (line ~958) からの内部参照があるため残置。

export async function getRestaurants(userId: string): Promise<Restaurant[]> {
  const result = await db.send(new QueryCommand({
    TableName: TABLE.restaurants,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    Limit: 500,
  }));
  return (result.Items ?? []) as Restaurant[];
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

/**
 * 複数のインフルエンサープロフィールを **BatchGetItem** で一括取得。
 *
 * /feed や /search で各レコードに `getInfluencerProfile` を fan-out して
 * いた N+1 を解消する用。最大 100 件 / 1 リクエスト、超過分は 100 件単位で
 * チャンク分割。UnprocessedKeys は空 Map をデフォルトでスキップ
 * （次サイクルのキャッシュで埋まる想定）。
 *
 * 返り値: influencerId をキーとしたマップ。プロフィール未作成の id は
 * 含まれない。
 */
export async function batchGetInfluencerProfiles(
  influencerIds: string[],
): Promise<Map<string, InfluencerProfile>> {
  const out = new Map<string, InfluencerProfile>();
  const unique = [...new Set(influencerIds.filter(Boolean))];
  if (unique.length === 0) return out;
  const CHUNK = 100;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const batch = unique.slice(i, i + CHUNK);
    const res = await db.send(new BatchGetCommand({
      RequestItems: {
        [TABLE.influencerProfiles]: {
          Keys: batch.map((influencerId) => ({ influencerId })),
        },
      },
    }));
    for (const raw of (res.Responses?.[TABLE.influencerProfiles] ?? [])) {
      const p = raw as InfluencerProfile;
      if (p?.influencerId) out.set(p.influencerId, p);
    }
  }
  return out;
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

/**
 * アカウント削除：このユーザーに紐づくデータを徹底的に消す。
 * - 自分のストック・投稿・設定・プロフィール・フォロー関係・通知・シェア・
 *   フォローリクエスト（双方向）・フィードバックすべて削除
 * - 自分が投稿したレストラン V2 は他ユーザーのストックを壊さないよう
 *   visibility=hidden + postedBy='' に匿名化（論理削除）
 * - 他ユーザーから自分への follow / follow request も逆引きで削除
 */
export async function deleteAllUserData(userId: string) {
  // 1. UserStocks 削除 + stockCount 減算
  const stocks = await getUserStocks(userId);
  for (const chunk of chunkArray(stocks, 25)) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE.userStocks]: chunk.map((s) => ({
          DeleteRequest: { Key: { userId, restaurantId: s.restaurantId } },
        })),
      },
    }));
    await Promise.all(chunk.map((s) => incrementStockCount(s.restaurantId, -1).catch(() => {})));
  }

  // 2. 旧テーブル：レストラン全削除
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

  // 3. V2: 自分が投稿したレストランは匿名化＋hidden 化
  //    （他ユーザーが保存している可能性があるため hard delete はしない）
  const postedV2 = await queryRestaurantsByPostedBy(userId);
  for (const r of postedV2) {
    try {
      await db.send(new UpdateCommand({
        TableName: TABLE.restaurantsV2,
        Key: { restaurantId: r.restaurantId },
        UpdateExpression: 'SET visibility = :v, postedBy = :p, updatedAt = :u',
        ExpressionAttributeValues: { ':v': 'hidden', ':p': '', ':u': Date.now() },
      }));
      // URL インデックスも消す
      if (r.urls?.length) {
        await deleteUrlIndexEntries(r.urls).catch((err) => console.error('[deleteAllUserData] URL index delete failed:', err));
      }
    } catch (err) {
      console.error(`[deleteAllUserData] Failed to anonymize restaurant ${r.restaurantId}:`, err);
    }
  }
  invalidateSearchCache();

  // 4. インフルエンサープロフィール削除
  await db.send(new DeleteCommand({ TableName: TABLE.influencerProfiles, Key: { influencerId: userId } })).catch(() => {});

  // 5. 設定削除
  await db.send(new DeleteCommand({ TableName: TABLE.settings, Key: { userId } }));

  // 6. 自分がフォローしている人を削除
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

  // 7. 自分のフォロワー（誰かがこのユーザーをフォローしている）も削除
  const followers = await getFollowers(userId);
  for (const chunk of chunkArray(followers, 25)) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE.follows]: chunk.map((f) => ({
          DeleteRequest: { Key: { followerId: f.followerId, followeeId: userId } },
        })),
      },
    }));
  }

  // 8. このユーザー宛のフォローリクエスト削除
  const incomingReqs = await getFollowRequests(userId);
  for (const chunk of chunkArray(incomingReqs, 25)) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE.followRequests]: chunk.map((r) => ({
          DeleteRequest: { Key: { targetId: userId, requesterId: r.requesterId } },
        })),
      },
    }));
  }

  // 9. このユーザーが送ったフォローリクエストも削除（GSI 無いので Scan）
  try {
    const outgoing = await db.send(new ScanCommand({
      TableName: TABLE.followRequests,
      FilterExpression: 'requesterId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    }));
    const items = (outgoing.Items ?? []) as { targetId: string; requesterId: string }[];
    for (const chunk of chunkArray(items, 25)) {
      await db.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE.followRequests]: chunk.map((r) => ({
            DeleteRequest: { Key: { targetId: r.targetId, requesterId: r.requesterId } },
          })),
        },
      }));
    }
  } catch { /* skip */ }

  // 10. 通知削除
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

  // 11. シェア削除
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

  // 12. フィードバック削除（このユーザーが送ったもの全部）
  try {
    const fb = await db.send(new ScanCommand({
      TableName: TABLE.feedback,
      FilterExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    }));
    const items = (fb.Items ?? []) as { id: string }[];
    for (const it of items) {
      await db.send(new DeleteCommand({ TableName: TABLE.feedback, Key: { id: it.id } })).catch(() => {});
    }
  } catch { /* skip */ }
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

/** 全ユーザーの最新シェアを取得（Scan） */
export async function getRecentShares(limit = 50) {
  const res = await db.send(new ScanCommand({
    TableName: TABLE.shares,
    Limit: limit * 2, // Scanは均等に返さないので多めに取る
  }));
  return ((res.Items ?? []) as Array<{
    userId: string; shareId: string; restaurantName: string;
    restaurantAddress?: string; lat?: number; lng?: number;
    comment?: string; createdAt: number; userNickname: string;
  }>).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export async function deleteShare(userId: string, createdAt: number) {
  await db.send(new DeleteCommand({
    TableName: TABLE.shares,
    Key: { userId, createdAt },
  }));
}

// =============================================
// 投稿申請
// =============================================

export async function listPendingUploadApplications(): Promise<Array<{ userId: string; uploadAppliedAt?: number }>> {
  const result = await db.send(new ScanCommand({
    TableName: TABLE.settings,
    FilterExpression: 'uploadStatus = :p',
    ExpressionAttributeValues: { ':p': 'pending' },
  }));
  return (result.Items ?? []) as Array<{ userId: string; uploadAppliedAt?: number }>;
}

// =============================================
// フィードバック
// =============================================

export interface FeedbackItem {
  id: string;
  userId: string;
  nickname: string;
  email: string;
  message: string;
  category: string;
  createdAt: number;
  read: boolean;
  replyEmail?: string;
}

export async function createFeedback(item: Omit<FeedbackItem, 'id' | 'createdAt' | 'read'>): Promise<FeedbackItem> {
  const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = Date.now();
  const record: FeedbackItem = {
    id,
    userId: item.userId,
    nickname: item.nickname,
    email: item.email,
    message: item.message,
    category: item.category,
    createdAt,
    read: false,
    ...(item.replyEmail ? { replyEmail: item.replyEmail } : {}),
  };

  // DocumentClient 経由だと id が消える問題があったので raw DynamoDBClient で明示マーシャル
  const marshalled = marshall(record, { removeUndefinedValues: true });
  await rawClient.send(new PutItemCommand({
    TableName: TABLE.feedback,
    Item: marshalled,
  }));
  return record;
}

export async function listFeedback(limit = 200): Promise<FeedbackItem[]> {
  const result = await db.send(new ScanCommand({
    TableName: TABLE.feedback,
    Limit: limit,
  }));
  const items = (result.Items ?? []) as FeedbackItem[];
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function markFeedbackRead(id: string) {
  await db.send(new UpdateCommand({
    TableName: TABLE.feedback,
    Key: { id },
    UpdateExpression: 'SET #r = :r',
    ExpressionAttributeNames: { '#r': 'read' },
    ExpressionAttributeValues: { ':r': true },
  }));
}

export async function deleteFeedback(id: string) {
  await db.send(new DeleteCommand({
    TableName: TABLE.feedback,
    Key: { id },
  }));
}

// =============================================
// パブリック統計（ホーム画面の「12,400+ 登録店」等を実数値に）
// =============================================

export type PublicStats = {
  restaurants: number;
  users: number;
  stocks: number;
  /** ItemCount は ~6 時間ごとに DynamoDB が更新する近似値 */
  approximate: true;
};

let publicStatsCache: { value: PublicStats; expiry: number } | null = null;
const PUBLIC_STATS_TTL_MS = 5 * 60 * 1000; // 5 分キャッシュ

/**
 * DescribeTable.ItemCount で各テーブルの近似行数を取得。
 * Scan しないので RCU 消費なし、かつ高速。
 * 値は eventually consistent（~6 時間遅延あり）だがトップページの
 * 「+」付き概数表示には十分。
 */
export async function getPublicStats(): Promise<PublicStats> {
  if (publicStatsCache && Date.now() < publicStatsCache.expiry) {
    return publicStatsCache.value;
  }
  const tablesToCount = [
    TABLE.restaurantsV2,
    TABLE.settings, // 1 user = 1 settings record
    TABLE.userStocks,
  ] as const;
  const counts = await Promise.all(
    tablesToCount.map(async (name) => {
      try {
        const r = await rawClient.send(new DescribeTableCommand({ TableName: name }));
        return r.Table?.ItemCount ?? 0;
      } catch { return 0; }
    }),
  );
  const value: PublicStats = {
    restaurants: counts[0],
    users: counts[1],
    stocks: counts[2],
    approximate: true,
  };
  publicStatsCache = { value, expiry: Date.now() + PUBLIC_STATS_TTL_MS };
  return value;
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
