/**
 * コミュニティ掲示板テーブル GourmetStock_Posts を作成する。
 *
 *   cd backend
 *   npx tsx scripts/create-posts-table.ts
 *
 * スキーマ:
 *   PK: areaId   (S)  — エリア ("umeda" 等、"all" は全国)
 *   SK: createdAt (N)  — 降順クエリで最新順
 *   課金: PAY_PER_REQUEST (オンデマンド)
 *
 * 既存なら何もしない (冪等)。AWS 認証は環境のデフォルトチェーンを使用。
 */
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION ?? 'ap-northeast-1';
const TABLE = 'GourmetStock_Posts';

const client = new DynamoDBClient({ region: REGION });

async function main() {
  // 既存チェック
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE }));
    console.log(`✓ ${TABLE} は既に存在します。何もしません。`);
    return;
  } catch (err: unknown) {
    if (!(err && typeof err === 'object' && (err as { name?: string }).name === 'ResourceNotFoundException')) {
      throw err;
    }
  }

  await client.send(new CreateTableCommand({
    TableName: TABLE,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'areaId', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'N' },
    ],
    KeySchema: [
      { AttributeName: 'areaId', KeyType: 'HASH' },
      { AttributeName: 'createdAt', KeyType: 'RANGE' },
    ],
  }));
  console.log(`✓ ${TABLE} を作成しました (PAY_PER_REQUEST)。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
