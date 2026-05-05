import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validate, presignSchema } from '../validators';
import { generatePresignedUploadUrl, deleteObject } from '../services/s3';

const router = Router();

// ─── プリサインドURL発行 ───

router.post('/upload/presign', requireAuth, async (req: AuthRequest, res: Response) => {
  const v = validate(presignSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }

  const { contentType, filename } = v.data;
  const result = await generatePresignedUploadUrl(req.user!.userId, contentType, filename);
  res.json(result);
});

// ─── 写真削除 ───
// Express 5 + path-to-regexp v8 では `*key` ワイルドカードのキャプチャが
// **string[] になる** ため、以前の `(key as string).startsWith(...)` は
// runtime で TypeError になっていた。さらに仮に `join('/')` で文字列化しても
// `..%2F` のような URL エンコードされたトラバーサルが prefix チェックを
// すり抜ける危険がある。ここでは:
//   1. params を string[] | string の両形に対応
//   2. URL デコード後に `..` / null byte / 二重スラッシュを拒否
//   3. その上で改めて photos/{userId}/ プレフィックスを検証
router.delete('/upload/*key', requireAuth, async (req: AuthRequest, res: Response) => {
  const raw = req.params.key as unknown;
  const segments: string[] = Array.isArray(raw)
    ? (raw as string[])
    : typeof raw === 'string'
      ? (raw as string).split('/')
      : [];
  if (segments.length === 0) { res.status(400).json({ error: 'key が必要です' }); return; }
  let decoded: string;
  try {
    decoded = segments.map((s) => decodeURIComponent(s)).join('/');
  } catch {
    res.status(400).json({ error: '不正な key です' }); return;
  }
  // パストラバーサル / NUL / 二重スラッシュ / 先頭スラッシュ拒否
  if (
    decoded.includes('..') ||
    decoded.includes('\0') ||
    decoded.startsWith('/') ||
    decoded.includes('//')
  ) {
    res.status(400).json({ error: '不正な key です' }); return;
  }
  // 自分の photos/ プレフィックスのみ
  const expectedPrefix = `photos/${req.user!.userId}/`;
  if (!decoded.startsWith(expectedPrefix)) {
    res.status(403).json({ error: '他のユーザーの写真は削除できません' });
    return;
  }
  await deleteObject(decoded);
  res.json({ ok: true });
});

export default router;
