/**
 * URL逆引きインデックスを再構築するスクリプト
 *
 * 実行: npx ts-node src/scripts/rebuild-url-index.ts
 *
 * normalizeUrl のロジック変更（YouTube/TikTok の動画ID抽出対応）に伴い、
 * 既存の urlIndex テーブルを全削除して、restaurantsV2 から再構築する。
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { normalizeUrl } from '../services/dynamo';
import type { RestaurantV2, UrlIndexEntry } from '../types';

const rawClient = new DynamoDBClient({ region: 'ap-northeast-1' });
const db = DynamoDBDocumentClient.from(rawClient);

const TABLE = {
  restaurantsV2: 'GourmetStock_Restaurants_v2',
  urlIndex: 'GourmetStock_UrlIndex',
};

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function deleteAllUrlIndex() {
  console.log('📦 既存の urlIndex を全件削除中...');
  let deleted = 0;
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await db.send(new ScanCommand({
      TableName: TABLE.urlIndex,
      ProjectionExpression: 'normalizedUrl',
      ExclusiveStartKey: lastKey,
    }));
    const items = (result.Items ?? []) as UrlIndexEntry[];
    if (items.length > 0) {
      const deleteRequests = items.map((item) => ({
        DeleteRequest: { Key: { normalizedUrl: item.normalizedUrl } },
      }));
      for (const chunk of chunkArray(deleteRequests, 25)) {
        await db.send(new BatchWriteCommand({
          RequestItems: { [TABLE.urlIndex]: chunk },
        }));
      }
      deleted += items.length;
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  console.log(`   削除: ${deleted} 件`);
}

async function rebuildFromRestaurants() {
  console.log('\n🔧 restaurantsV2 から再構築中...');
  let scanned = 0;
  let registered = 0;
  let collisions = 0;
  const seen = new Map<string, string>(); // normalizedUrl → restaurantId

  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await db.send(new ScanCommand({
      TableName: TABLE.restaurantsV2,
      ProjectionExpression: 'restaurantId, urls, visibility',
      ExclusiveStartKey: lastKey,
    }));

    for (const item of (result.Items ?? []) as RestaurantV2[]) {
      scanned++;
      // hidden / private はスキップ（公開対象のみインデックス）
      if (item.visibility === 'hidden' || item.visibility === 'private') continue;
      if (!item.urls || item.urls.length === 0) continue;

      for (const rawUrl of item.urls) {
        if (!rawUrl) continue;
        const key = normalizeUrl(rawUrl);
        if (seen.has(key) && seen.get(key) !== item.restaurantId) {
          collisions++;
          console.log(`   ⚠️  衝突: ${key} (restaurant ${seen.get(key)} vs ${item.restaurantId})`);
          continue;
        }
        seen.set(key, item.restaurantId);
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  console.log(`   スキャン: ${scanned} 件`);
  console.log(`   ユニークURL: ${seen.size} 件`);
  console.log(`   衝突: ${collisions} 件`);

  // BatchWrite で書き込み
  const entries = Array.from(seen.entries()).map(([normalizedUrl, restaurantId]) => ({
    PutRequest: { Item: { normalizedUrl, restaurantId } },
  }));
  for (const chunk of chunkArray(entries, 25)) {
    await db.send(new BatchWriteCommand({
      RequestItems: { [TABLE.urlIndex]: chunk },
    }));
    registered += chunk.length;
  }
  console.log(`   登録: ${registered} 件`);
}

async function main() {
  console.log('=== URL逆引きインデックス再構築 ===\n');
  await deleteAllUrlIndex();
  await rebuildFromRestaurants();
  console.log('\n=== 完了 ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
