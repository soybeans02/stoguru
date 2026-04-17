/**
 * DynamoDBから直接モックデータを削除（新規20件以外を全削除）
 *
 * 使い方:
 *   cd backend
 *   npx tsx scripts/cleanup-restaurants-direct.ts
 *   npx tsx scripts/cleanup-restaurants-direct.ts --execute   # 実際に削除
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  DeleteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'ap-northeast-1' });
const db = DynamoDBDocumentClient.from(client);

const TABLE_RESTAURANTS = 'GourmetStock_Restaurants_v2';
const TABLE_URL_INDEX = 'GourmetStock_UrlIndex';

const KEEP_IDS = new Set([
  'mock-pho-01', 'mock-tacos-01', 'mock-india-01', 'mock-spain-01', 'mock-okinawa-01',
  'mock-motsu-01', 'mock-teppan-01', 'mock-sukiyaki-01', 'mock-unagi-01', 'mock-tonkatsu-01',
  'mock-tachinomi-01', 'mock-gibier-01', 'mock-bakery-01', 'mock-hawaii-01', 'mock-pancake-01',
  'mock-craftbeer-01', 'mock-monja-01', 'mock-kakigori-01', 'mock-sosaku-01', 'mock-kchicken-01',
]);

const EXECUTE = process.argv.includes('--execute');

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function scanAllRestaurants() {
  const items: any[] = [];
  let lastKey: any = undefined;
  do {
    const res = await db.send(new ScanCommand({
      TableName: TABLE_RESTAURANTS,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function scanAllUrlIndex() {
  const items: any[] = [];
  let lastKey: any = undefined;
  do {
    const res = await db.send(new ScanCommand({
      TableName: TABLE_URL_INDEX,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function main() {
  console.log(`📊 ${TABLE_RESTAURANTS} スキャン中...`);
  const all = await scanAllRestaurants();
  console.log(`  合計: ${all.length}件`);

  // mock- で始まるIDのみ削除対象（KEEP_IDS以外）
  const toDelete = all.filter(r => r.restaurantId.startsWith('mock-') && !KEEP_IDS.has(r.restaurantId));
  const toKeep = all.filter(r => KEEP_IDS.has(r.restaurantId));
  console.log(`  保持: ${toKeep.length}件 / 削除対象: ${toDelete.length}件\n`);

  // URL index も整理
  console.log(`📊 ${TABLE_URL_INDEX} スキャン中...`);
  const allUrls = await scanAllUrlIndex();
  console.log(`  合計: ${allUrls.length}件`);

  const deleteIds = new Set(toDelete.map(r => r.restaurantId));
  const urlsToDelete = allUrls.filter(u => deleteIds.has(u.restaurantId));
  console.log(`  削除対象URL: ${urlsToDelete.length}件\n`);

  console.log('--- 削除対象レストラン ---');
  for (const r of toDelete) {
    console.log(`  - ${r.name} (${r.restaurantId})`);
  }

  if (!EXECUTE) {
    console.log('\n⚠️  ドライラン (実行するには --execute を付けて再実行)');
    return;
  }

  console.log('\n🗑️  削除実行...');

  // レストラン削除（BatchWrite, 25件ずつ）
  for (const batch of chunk(toDelete, 25)) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE_RESTAURANTS]: batch.map(r => ({
          DeleteRequest: { Key: { restaurantId: r.restaurantId } },
        })),
      },
    }));
  }
  console.log(`  ✅ レストラン ${toDelete.length}件削除`);

  // URL index削除
  if (urlsToDelete.length > 0) {
    for (const batch of chunk(urlsToDelete, 25)) {
      await db.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_URL_INDEX]: batch.map(u => ({
            DeleteRequest: { Key: { normalizedUrl: u.normalizedUrl } },
          })),
        },
      }));
    }
    console.log(`  ✅ URL index ${urlsToDelete.length}件削除`);
  }

  console.log('\n✨ 完了!');
}

main().catch(err => {
  console.error('❌ エラー:', err);
  process.exit(1);
});
