import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, type ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import path from 'path';

const BUCKET = process.env.S3_BUCKET ?? 'stoguru-photos';
const REGION = 'ap-northeast-1';

const s3 = new S3Client({ region: REGION });

/**
 * プリサインドURLを生成して返す
 */
export async function generatePresignedUploadUrl(
  userId: string,
  contentType: string,
  filename: string,
): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  // 拡張子はホワイトリストから決定（filename 経由の偽装防止）
  const extByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const fallbackExt = path.extname(filename).replace('.', '').toLowerCase();
  const safeExtFromFilename = ['jpg', 'jpeg', 'png', 'webp'].includes(fallbackExt) ? fallbackExt : 'jpg';
  const ext = extByMime[contentType] ?? safeExtFromFilename;
  const key = `photos/${userId}/${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 600 }); // 10分
  const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

  return { uploadUrl, key, publicUrl };
}

/**
 * S3オブジェクトを削除する
 */
export async function deleteObject(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  await s3.send(command);
}

/**
 * 指定ユーザーがアップロードしたすべての写真を削除（アカウント削除時用）。
 * photos/{userId}/ プレフィックス配下を全削除。失敗してもエラーをスローせず
 * ログだけ出して進む（DynamoDB の削除は完了させたい）。
 */
export async function deleteAllUserPhotos(userId: string): Promise<{ deleted: number }> {
  if (!userId) return { deleted: 0 };
  const prefix = `photos/${userId}/`;
  let deleted = 0;
  let continuationToken: string | undefined = undefined;

  try {
    do {
      // 1 ページ最大 1000 件
      const list: ListObjectsV2CommandOutput = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));
      const keys: string[] = (list.Contents ?? [])
        .map((obj: { Key?: string }) => obj.Key)
        .filter((k: string | undefined): k is string => !!k);

      if (keys.length > 0) {
        // DeleteObjects は最大 1000 件 / 1 リクエスト
        for (let i = 0; i < keys.length; i += 1000) {
          const chunk = keys.slice(i, i + 1000);
          await s3.send(new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: {
              Objects: chunk.map((Key: string) => ({ Key })),
              Quiet: true,
            },
          }));
          deleted += chunk.length;
        }
      }

      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
  } catch (err) {
    console.error(`[S3] deleteAllUserPhotos failed for ${userId}:`, err);
  }

  return { deleted };
}
