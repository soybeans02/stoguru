/**
 * 修正スクリプト: ストック由来のレストランをprivateに
 *
 * 実行: npx ts-node src/scripts/fix-stock-visibility.ts
 *
 * マイグレーションで postedBy: userId になったストック由来の店を
 * visibility: 'private' にして、feedやダッシュボードに出ないようにする
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const rawClient = new DynamoDBClient({ region: 'ap-northeast-1' });
const db = DynamoDBDocumentClient.from(rawClient);

const TABLE = {
  restaurantsV2: 'GourmetStock_Restaurants_v2',
  influencerRestaurants: 'GourmetStock_InfluencerRestaurants',
};

async function main() {
  console.log('=== ストック由来レストランの修正 ===\n');

  // 1. InfluencerRestaurantsのrestaurantIdを全取得（本物の投稿）
  const infIds = new Set<string>();
  let lastKey1: Record<string, unknown> | undefined;
  do {
    const result = await db.send(new ScanCommand({
      TableName: TABLE.influencerRestaurants,
      ProjectionExpression: 'restaurantId',
      ExclusiveStartKey: lastKey1,
    }));
    for (const item of result.Items ?? []) {
      infIds.add(item.restaurantId as string);
    }
    lastKey1 = result.LastEvaluatedKey;
  } while (lastKey1);

  console.log(`  インフルエンサー投稿: ${infIds.size} 件`);

  // 2. Restaurants_v2で、infIdsに含まれないものをprivateに
  let fixed = 0;
  let lastKey2: Record<string, unknown> | undefined;
  do {
    const result = await db.send(new ScanCommand({
      TableName: TABLE.restaurantsV2,
      ProjectionExpression: 'restaurantId, visibility',
      ExclusiveStartKey: lastKey2,
    }));
    for (const item of result.Items ?? []) {
      const rid = item.restaurantId as string;
      if (!infIds.has(rid)) {
        // ストック由来 → privateに
        await db.send(new UpdateCommand({
          TableName: TABLE.restaurantsV2,
          Key: { restaurantId: rid },
          UpdateExpression: 'SET visibility = :v',
          ExpressionAttributeValues: { ':v': 'private' },
        }));
        fixed++;
      }
    }
    lastKey2 = result.LastEvaluatedKey;
  } while (lastKey2);

  console.log(`  private に修正: ${fixed} 件`);
  console.log(`  インフルエンサー投稿（変更なし）: ${infIds.size} 件`);
  console.log('\n=== 完了 ===');
}

main().catch(console.error);
