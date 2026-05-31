/**
 * コミュニティ掲示板テーブル GourmetStock_Posts を作成する。
 *
 *   cd backend
 *   npx tsx scripts/create-posts-table.ts
 *
 * スキーマ:
 *   PK: areaId   (S)  — エリア ("umeda" 等、"all" は全国)
 *   SK: createdAt (N)  — 降順クエリで最新順
 *   GSI-Author: PK=authorId — アカウント削除時にユーザーの投稿を引くため
 *   課金: PAY_PER_REQUEST (オンデマンド)
 *
 * 既存テーブルに GSI が無ければ追加 (冪等)。AWS 認証は環境のデフォルトチェーン。
 */
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTableCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION ?? 'ap-northeast-1';
const TABLE = 'GourmetStock_Posts';

const client = new DynamoDBClient({ region: REGION });

const GSI_AUTHOR = 'GSI-Author';

async function main() {
  // 既存チェック
  let existing: Awaited<ReturnType<typeof client.send>> | null = null;
  try {
    existing = await client.send(new DescribeTableCommand({ TableName: TABLE })) as never;
  } catch (err: unknown) {
    if (!(err && typeof err === 'object' && (err as { name?: string }).name === 'ResourceNotFoundException')) {
      throw err;
    }
  }

  if (existing) {
    // テーブルはある → GSI-Author が無ければ追加
    const gsis = (existing as { Table?: { GlobalSecondaryIndexes?: { IndexName?: string }[] } })
      .Table?.GlobalSecondaryIndexes ?? [];
    if (gsis.some((g) => g.IndexName === GSI_AUTHOR)) {
      console.log(`✓ ${TABLE} + ${GSI_AUTHOR} は既に存在します。何もしません。`);
      return;
    }
    await client.send(new UpdateTableCommand({
      TableName: TABLE,
      AttributeDefinitions: [{ AttributeName: 'authorId', AttributeType: 'S' }],
      GlobalSecondaryIndexUpdates: [{
        Create: {
          IndexName: GSI_AUTHOR,
          KeySchema: [{ AttributeName: 'authorId', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'KEYS_ONLY' },
        },
      }],
    }));
    console.log(`✓ ${TABLE} に ${GSI_AUTHOR} を追加しました (作成完了まで数分かかります)。`);
    return;
  }

  // 新規作成 (GSI 込み)
  await client.send(new CreateTableCommand({
    TableName: TABLE,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'areaId', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'N' },
      { AttributeName: 'authorId', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'areaId', KeyType: 'HASH' },
      { AttributeName: 'createdAt', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [{
      IndexName: GSI_AUTHOR,
      KeySchema: [{ AttributeName: 'authorId', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'KEYS_ONLY' },
    }],
  }));
  console.log(`✓ ${TABLE} を作成しました (PAY_PER_REQUEST, ${GSI_AUTHOR} 込み)。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
