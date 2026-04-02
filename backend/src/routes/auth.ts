import { Router, Request, Response } from 'express';
import { signUp, confirmSignUp, signIn, deleteUser, changePassword, refreshAccessToken, forgotPassword, confirmForgotPassword } from '../services/cognito';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { deleteAllUserData } from '../services/dynamo';
import { validate, signupSchema, loginSchema, confirmSchema, changePasswordSchema, refreshSchema, forgotPasswordSchema, resetPasswordSchema } from '../validators';

const router = Router();

router.post('/signup', async (req: Request, res: Response) => {
  const v = validate(signupSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  try {
    await signUp(v.data.email, v.data.password, v.data.nickname);
    res.json({ message: '確認コードをメールに送信しました', email: v.data.email });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '登録に失敗しました';
    res.status(400).json({ error: msg });
  }
});

router.post('/confirm', async (req: Request, res: Response) => {
  const v = validate(confirmSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  try {
    await confirmSignUp(v.data.email, v.data.code);
    res.json({ message: 'アカウントが確認されました。ログインしてください' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '確認に失敗しました';
    res.status(400).json({ error: msg });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const v = validate(loginSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  try {
    const tokens = await signIn(v.data.email, v.data.password);
    res.json(tokens);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'ログインに失敗しました';
    res.status(401).json({ error: msg });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  const v = validate(refreshSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  try {
    const tokens = await refreshAccessToken(v.data.refreshToken);
    res.json(tokens);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'トークン更新に失敗しました';
    res.status(401).json({ error: msg });
  }
});

router.post('/forgot-password', async (req: Request, res: Response) => {
  const v = validate(forgotPasswordSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  try {
    await forgotPassword(v.data.email);
    res.json({ message: '確認コードをメールに送信しました' });
  } catch (err: unknown) {
    // ユーザーが存在しない場合もセキュリティ上同じレスポンスを返す
    res.json({ message: '確認コードをメールに送信しました' });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  const v = validate(resetPasswordSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  try {
    await confirmForgotPassword(v.data.email, v.data.code, v.data.newPassword);
    res.json({ message: 'パスワードを再設定しました。ログインしてください' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'パスワード再設定に失敗しました';
    if (msg.includes('CodeMismatch') || msg.includes('ExpiredCode')) {
      res.status(400).json({ error: '確認コードが正しくないか、期限切れです' });
    } else if (msg.includes('InvalidPassword') || msg.includes('Password')) {
      res.status(400).json({ error: 'パスワードの要件を満たしていません（8文字以上、英小文字+数字）' });
    } else {
      res.status(400).json({ error: 'パスワード再設定に失敗しました' });
    }
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  res.json(req.user);
});

router.post('/change-password', requireAuth, async (req: AuthRequest, res: Response) => {
  const v = validate(changePasswordSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  try {
    const accessToken = req.headers.authorization!.split(' ')[1];
    await changePassword(accessToken, v.data.oldPassword, v.data.newPassword);
    res.json({ message: 'パスワードを変更しました' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'パスワード変更に失敗しました';
    if (msg.includes('Incorrect') || msg.includes('NotAuthorized')) {
      res.status(400).json({ error: '現在のパスワードが正しくありません' });
    } else {
      res.status(500).json({ error: 'パスワード変更に失敗しました' });
    }
  }
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
