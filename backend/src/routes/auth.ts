import { Router, Request, Response } from 'express';
import { signUp, confirmSignUp, signIn, deleteUser } from '../services/cognito';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { deleteAllUserData } from '../services/dynamo';

const router = Router();

router.post('/signup', async (req: Request, res: Response) => {
  const { email, password, nickname } = req.body;
  if (!email || !password || !nickname) {
    res.status(400).json({ error: 'email, password, nickname は必須です' });
    return;
  }
  try {
    await signUp(email, password, nickname);
    res.json({ message: '確認コードをメールに送信しました', email });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '登録に失敗しました';
    res.status(400).json({ error: msg });
  }
});

router.post('/confirm', async (req: Request, res: Response) => {
  const { email, code } = req.body;
  if (!email || !code) {
    res.status(400).json({ error: 'email と code は必須です' });
    return;
  }
  try {
    await confirmSignUp(email, code);
    res.json({ message: 'アカウントが確認されました。ログインしてください' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '確認に失敗しました';
    res.status(400).json({ error: msg });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'email と password は必須です' });
    return;
  }
  try {
    const tokens = await signIn(email, password);
    res.json(tokens);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'ログインに失敗しました';
    res.status(401).json({ error: msg });
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  res.json(req.user);
});

router.delete('/account', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    // DynamoDBのデータをすべて削除
    await deleteAllUserData(userId);
    // Cognitoユーザーを削除
    await deleteUser(req.headers.authorization!.split(' ')[1]);
    res.json({ message: 'アカウントを削除しました' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'アカウント削除に失敗しました';
    res.status(500).json({ error: msg });
  }
});

export default router;
