/**
 * V2テーブル作成スクリプト
 *
 * 実行: npx ts-node src/scripts/create-v2-tables.ts
 *
 * 作成するテーブル:
 * 1. GourmetStock_Restaurants_v2 (PK: restaurantId) + GSI-Geohash, GSI-PostedBy
 * 2. GourmetStock_UserStocks (PK: userId, SK: restaurantId) + GSI-RestaurantStocks
 * 3. GourmetStock_UrlIndex (PK: normalizedUrl)
 */

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: 'ap-northeast-1' });

async function tableExists(name: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: name }));
    return true;
  } catch {
    return false;
  }
}

async function createTable(name: string, params: ConstructorParameters<typeof CreateTableCommand>[0]) {
  if (await tableExists(name)) {
    console.log(`  ✓ ${name} は既に存在します`);
    return;
  }
  await client.send(new CreateTableCommand(params));
  console.log(`  ✓ ${name} を作成しました`);
}

async function main() {
  console.log('=== V2テーブル作成 ===\n');

  // 1. Restaurants_v2
  await createTable('GourmetStock_Restaurants_v2', {
    TableName: 'GourmetStock_Restaurants_v2',
    KeySchema: [
      { AttributeName: 'restaurantId', KeyType: 'HASH' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'restaurantId', AttributeType: 'S' },
      { AttributeName: 'geohash4', AttributeType: 'S' },
      { AttributeName: 'postedBy', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'N' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI-Geohash',
        KeySchema: [
          { AttributeName: 'geohash4', KeyType: 'HASH' },
          { AttributeName: 'restaurantId', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'GSI-PostedBy',
        KeySchema: [
          { AttributeName: 'postedBy', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  });

  // 2. UserStocks
  await createTable('GourmetStock_UserStocks', {
    TableName: 'GourmetStock_UserStocks',
    KeySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' },
      { AttributeName: 'restaurantId', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'restaurantId', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI-RestaurantStocks',
        KeySchema: [
          { AttributeName: 'restaurantId', KeyType: 'HASH' },
          { AttributeName: 'userId', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'KEYS_ONLY' },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  });

  // 3. UrlIndex
  await createTable('GourmetStock_UrlIndex', {
    TableName: 'GourmetStock_UrlIndex',
    KeySchema: [
      { AttributeName: 'normalizedUrl', KeyType: 'HASH' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'normalizedUrl', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  });

  console.log('\n=== 完了 ===');
  console.log('次のステップ:');
  console.log('  1. テーブルがACTIVEになるのを待つ（数秒）');
  console.log('  2. npx ts-node src/scripts/migrate-v2.ts でデータ移行');
  console.log('  3. デプロイして新APIに切り替え');
}

main().catch(console.error);
