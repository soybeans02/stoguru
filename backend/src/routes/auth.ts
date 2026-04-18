import { Router, Request, Response } from 'express';
import { signUp, confirmSignUp, signIn, deleteUser, changePassword, refreshAccessToken, forgotPassword, confirmForgotPassword, isNicknameTaken, updateNickname, requestEmailChange, verifyEmailChange, resendEmailVerificationCode } from '../services/cognito';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { deleteAllUserData } from '../services/dynamo';
import { validate, signupSchema, loginSchema, confirmSchema, changePasswordSchema, refreshSchema, forgotPasswordSchema, resetPasswordSchema, updateNicknameSchema, changeEmailSchema, verifyEmailSchema } from '../validators';

const router = Router();

router.post('/signup', async (req: Request, res: Response) => {
  const v = validate(signupSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  try {
    await signUp(v.data.email, v.data.password, v.data.nickname);
    res.json({ message: '確認コードをメールに送信しました', email: v.data.email });
  } catch (err: unknown) {
    res.status(400).json({ error: '登録に失敗しました' });
  }
});

router.post('/confirm', async (req: Request, res: Response) => {
  const v = validate(confirmSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  try {
    await confirmSignUp(v.data.email, v.data.code);
    res.json({ message: 'アカウントが確認されました。ログインしてください' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('CodeMismatch') || msg.includes('ExpiredCode')) {
      res.status(400).json({ error: 'コードが無効または期限切れです' });
    } else {
      res.status(400).json({ error: '確認に失敗しました' });
    }
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const v = validate(loginSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  try {
    const tokens = await signIn(v.data.email, v.data.password);
    res.json(tokens);
  } catch (err: unknown) {
    res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  const v = validate(refreshSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  try {
    const tokens = await refreshAccessToken(v.data.refreshToken);
    res.json(tokens);
  } catch (err: unknown) {
    res.status(401).json({ error: 'トークン更新に失敗しました' });
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
      res.status(400).json({ error: 'パスワードの要件を満たしていません（8文字以上）' });
    } else {
      res.status(400).json({ error: 'パスワード再設定に失敗しました' });
    }
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  res.json(req.user);
});

router.put('/nickname', requireAuth, async (req: AuthRequest, res: Response) => {
  const v = validate(updateNicknameSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  try {
    const taken = await isNicknameTaken(v.data.nickname, req.user!.userId);
    if (taken) {
      res.status(409).json({ error: 'このニックネームは既に使われています' });
      return;
    }
    await updateNickname(req.user!.userId, v.data.nickname);
    res.json({ message: 'ニックネームを変更しました', nickname: v.data.nickname });
  } catch (err: unknown) {
    res.status(500).json({ error: 'ニックネーム変更に失敗しました' });
  }
});

// メール変更リクエスト：新メールに確認コードを送信
router.put('/email', requireAuth, async (req: AuthRequest, res: Response) => {
  const v = validate(changeEmailSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  try {
    // パスワード検証（トークン窃取時のメール変更を防止）
    await signIn(req.user!.email, v.data.currentPassword);
    const accessToken = req.headers.authorization!.split(' ')[1];
    await requestEmailChange(accessToken, v.data.newEmail);
    res.json({
      message: '新しいメールアドレスに確認コードを送信しました',
      pendingEmail: v.data.newEmail,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('NotAuthorized') || msg.includes('Incorrect')) {
      res.status(401).json({ error: 'パスワードが正しくありません' });
    } else if (msg.includes('already exists') || msg.includes('AliasExistsException')) {
      res.status(409).json({ error: 'このメールアドレスは既に使われています' });
    } else if (msg.includes('InvalidParameter')) {
      res.status(400).json({ error: 'メールアドレスが正しくありません' });
    } else {
      res.status(500).json({ error: 'メールアドレス変更に失敗しました' });
    }
  }
});

// メール変更確認：新メールに届いたコードを検証して変更を確定
router.post('/email/verify', requireAuth, async (req: AuthRequest, res: Response) => {
  const v = validate(verifyEmailSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }
  try {
    const accessToken = req.headers.authorization!.split(' ')[1];
    await verifyEmailChange(accessToken, v.data.code);
    res.json({ message: 'メールアドレスを変更しました' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('CodeMismatch')) {
      res.status(400).json({ error: '確認コードが正しくありません' });
    } else if (msg.includes('ExpiredCode')) {
      res.status(400).json({ error: '確認コードの有効期限が切れました。再送信してください' });
    } else {
      res.status(500).json({ error: '確認に失敗しました' });
    }
  }
});

// 確認コード再送信
router.post('/email/resend', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const accessToken = req.headers.authorization!.split(' ')[1];
    await resendEmailVerificationCode(accessToken);
    res.json({ message: '確認コードを再送信しました' });
  } catch {
    res.status(500).json({ error: '再送信に失敗しました' });
  }
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
    res.status(500).json({ error: 'アカウント削除に失敗しました' });
  }
});

export default router;
