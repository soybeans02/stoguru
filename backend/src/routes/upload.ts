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

router.delete('/upload/*key', requireAuth, async (req: AuthRequest, res: Response) => {
  const key = req.params.key as string;

  // ユーザーが自分の写真のみ削除可能
  if (!key.startsWith(`photos/${req.user!.userId}/`)) {
    res.status(403).json({ error: '他のユーザーの写真は削除できません' });
    return;
  }

  await deleteObject(key);
  res.json({ ok: true });
});

export default router;
