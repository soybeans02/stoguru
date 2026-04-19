import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { createFeedback } from '../services/dynamo';
import { validate, feedbackSchema } from '../validators';

const router = Router();

// フィードバック送信（ログインユーザー）
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const v = validate(feedbackSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }

  try {
    const fb = await createFeedback({
      userId: req.user!.userId,
      nickname: req.user!.nickname,
      email: req.user!.email,
      message: v.data.message,
      category: v.data.category,
      replyEmail: v.data.replyEmail,
    });
    res.json({ message: 'フィードバックを送信しました', id: fb.id });
  } catch (err) {
    console.error('Feedback save failed:', err);
    const msg = err instanceof Error ? err.message : '送信に失敗しました';
    res.status(500).json({ error: msg });
  }
});

export default router;
