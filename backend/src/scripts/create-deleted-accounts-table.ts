/**
 * 削除アカウント監査ログ用テーブルを作成するスクリプト
 *
 * 実行: npx ts-node src/scripts/create-deleted-accounts-table.ts
 *
 * テーブル構成:
 *   GourmetStock_DeletedAccounts
 *     PK: userId (String)
 *     attrs: email, nickname, deletedAt (Number ms epoch), deletedBy ('self' | 'admin'), ttl (Number sec epoch)
 *
 * TTL を ttl 属性に対して有効化することで 1 年程度で自動的に枯らせる
 * （admin dashboard 側の運用ポリシーに合わせて手動で TTL ON にする想定）。
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

async function main() {
  const name = 'GourmetStock_DeletedAccounts';
  if (await tableExists(name)) {
    console.log(`✓ ${name} は既に存在します`);
    return;
  }
  await client.send(new CreateTableCommand({
    TableName: name,
    KeySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  }));
  console.log(`✓ ${name} を作成しました`);
  console.log('  ※ TTL を有効化したい場合は AWS Console で `ttl` 属性に対して TimeToLive を ON にしてください。');
}

main().catch((e) => { console.error(e); process.exit(1); });
