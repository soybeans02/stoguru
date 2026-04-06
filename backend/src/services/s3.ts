import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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
  const ext = path.extname(filename).replace('.', '') || 'jpg';
  const key = `photos/${userId}/${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    ACL: 'public-read',
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
