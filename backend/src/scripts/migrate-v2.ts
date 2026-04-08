/**
 * マイグレーションスクリプト: 旧テーブル → V2テーブル
 *
 * 実行: npx ts-node src/scripts/migrate-v2.ts
 *
 * 処理:
 * 1. InfluencerRestaurants → Restaurants_v2 + UrlIndex
 * 2. Restaurants（ユーザーストック） → UserStocks + 不足分をRestaurants_v2に追加
 * 3. stockCountを計算
 *
 * 前提: 新テーブルがAWSコンソールまたはCDKで作成済み
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { encode as geohashEncode } from '../utils/geohash';

const rawClient = new DynamoDBClient({ region: 'ap-northeast-1' });
const db = DynamoDBDocumentClient.from(rawClient);

const TABLE = {
  // 旧
  restaurants: 'GourmetStock_Restaurants',
  influencerRestaurants: 'GourmetStock_InfluencerRestaurants',
  // 新
  restaurantsV2: 'GourmetStock_Restaurants_v2',
  userStocks: 'GourmetStock_UserStocks',
  urlIndex: 'GourmetStock_UrlIndex',
};

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    let path = parsed.pathname.replace(/\/+$/, '');
    path = path.replace(/^\/reels\//, '/reel/');
    const host = parsed.hostname.replace(/^www\./, '');
    return `${host}${path}`.toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/+$/, '').replace(/\?.*$/, '');
  }
}

async function scanAll<T>(tableName: string): Promise<T[]> {
  const items: T[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await db.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...((result.Items ?? []) as T[]));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function main() {
  console.log('=== V2 マイグレーション開始 ===\n');

  // ─── Step 1: InfluencerRestaurants → Restaurants_v2 + UrlIndex ───
  console.log('Step 1: InfluencerRestaurants → Restaurants_v2');

  const infRestaurants = await scanAll<Record<string, unknown>>(TABLE.influencerRestaurants);
  console.log(`  ${infRestaurants.length} 件のインフルエンサーレストラン`);

  let migratedRest = 0;
  let migratedUrls = 0;

  for (const r of infRestaurants) {
    const restaurantId = r.restaurantId as string;
    const lat = r.lat as number | undefined;
    const lng = r.lng as number | undefined;
    const geohash = lat != null && lng != null ? geohashEncode(lat, lng, 6) : undefined;
    const geohash4 = geohash ? geohash.substring(0, 4) : undefined;
    const name = (r.name as string) || '';

    // Restaurants_v2に書き込み
    await db.send(new PutCommand({
      TableName: TABLE.restaurantsV2,
      Item: {
        restaurantId,
        name,
        nameLower: name.toLowerCase(),
        address: r.address,
        lat, lng, geohash, geohash4,
        genres: r.genres || [],
        priceRange: r.priceRange,
        photoUrls: r.photoUrls || [],
        urls: [
          ...(r.urls as string[] || []),
          r.instagramUrl,
          r.tiktokUrl,
          r.youtubeUrl,
          r.videoUrl,
        ].filter(Boolean),
        description: r.description,
        postedBy: r.influencerId,
        visibility: r.visibility || 'public',
        stockCount: 0, // 後で計算
        createdAt: r.createdAt || Date.now(),
        updatedAt: r.updatedAt || Date.now(),
      },
    }));
    migratedRest++;

    // UrlIndex
    const urls = [
      ...(r.urls as string[] || []),
      r.instagramUrl as string,
      r.tiktokUrl as string,
      r.youtubeUrl as string,
      r.videoUrl as string,
    ].filter(Boolean);

    for (const url of urls) {
      await db.send(new PutCommand({
        TableName: TABLE.urlIndex,
        Item: { normalizedUrl: normalizeUrl(url), restaurantId },
      }));
      migratedUrls++;
    }

    if (migratedRest % 50 === 0) {
      console.log(`  ...${migratedRest}/${infRestaurants.length}`);
    }
  }
  console.log(`  完了: ${migratedRest} レストラン, ${migratedUrls} URL\n`);

  // ─── Step 2: Restaurants（ユーザーストック） → UserStocks ───
  console.log('Step 2: Restaurants（ストック） → UserStocks');

  const userRestaurants = await scanAll<Record<string, unknown>>(TABLE.restaurants);
  console.log(`  ${userRestaurants.length} 件のユーザーストック`);

  let migratedStocks = 0;
  let createdMissing = 0;
  const stockCounts = new Map<string, number>();

  for (const r of userRestaurants) {
    const userId = r.userId as string;
    const restaurantId = r.restaurantId as string;

    // UserStocksに書き込み
    await db.send(new PutCommand({
      TableName: TABLE.userStocks,
      Item: {
        userId,
        restaurantId,
        pinned: r.pinned,
        notes: r.notes,
        landmarkMemo: r.landmarkMemo,
        review: r.review,
        status: r.status || 'wishlist',
        visitedAt: r.visitedAt,
        photoEmoji: r.photoEmoji,
        createdAt: r.createdAt || new Date().toISOString(),
        updatedAt: r.updatedAt || Date.now(),
      },
    }));
    migratedStocks++;

    // stockCountカウント
    stockCounts.set(restaurantId, (stockCounts.get(restaurantId) ?? 0) + 1);

    // Restaurants_v2に無い場合は作成（ユーザーが手動追加したレストランなど）
    const exists = await db.send(new GetCommand({
      TableName: TABLE.restaurantsV2,
      Key: { restaurantId },
      ProjectionExpression: 'restaurantId',
    }));

    if (!exists.Item) {
      const lat = r.lat as number | undefined;
      const lng = r.lng as number | undefined;
      const geohash = lat != null && lng != null ? geohashEncode(lat, lng, 6) : undefined;
      const geohash4 = geohash ? geohash.substring(0, 4) : undefined;
      const name = (r.name as string) || '';

      await db.send(new PutCommand({
        TableName: TABLE.restaurantsV2,
        Item: {
          restaurantId,
          name,
          nameLower: name.toLowerCase(),
          address: r.address,
          lat, lng, geohash, geohash4,
          genres: r.genreTags || (r.genre ? [r.genre] : []),
          priceRange: r.priceRange,
          photoUrls: r.photoUrls || [],
          urls: r.videoUrl ? [r.videoUrl] : [],
          description: '',
          postedBy: userId, // ユーザー自身が投稿者
          visibility: 'public',
          stockCount: 0,
          createdAt: r.createdAt ? new Date(r.createdAt as string).getTime() : Date.now(),
          updatedAt: r.updatedAt || Date.now(),
        },
      }));
      createdMissing++;
    }

    if (migratedStocks % 50 === 0) {
      console.log(`  ...${migratedStocks}/${userRestaurants.length}`);
    }
  }
  console.log(`  完了: ${migratedStocks} ストック, ${createdMissing} 不足レストラン作成\n`);

  // ─── Step 3: stockCountを更新 ───
  console.log('Step 3: stockCount更新');

  let updatedCounts = 0;
  for (const [restaurantId, count] of stockCounts) {
    await db.send(new UpdateCommand({
      TableName: TABLE.restaurantsV2,
      Key: { restaurantId },
      UpdateExpression: 'SET stockCount = :c',
      ExpressionAttributeValues: { ':c': count },
    }));
    updatedCounts++;
  }
  console.log(`  完了: ${updatedCounts} レストランのstockCount更新\n`);

  console.log('=== マイグレーション完了 ===');
  console.log(`  Restaurants_v2: ${migratedRest + createdMissing} 件`);
  console.log(`  UserStocks: ${migratedStocks} 件`);
  console.log(`  UrlIndex: ${migratedUrls} 件`);
}

main().catch(console.error);
