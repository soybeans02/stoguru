import { Router, Request, Response } from 'express';
import { signUp, confirmSignUp, signIn, deleteUser, changePassword, refreshAccessToken, forgotPassword, confirmForgotPassword, isNicknameTaken, updateNickname, requestEmailChange, verifyEmailChange, resendEmailVerificationCode } from '../services/cognito';
import { requireAuth, AuthRequest, ACCESS_TOKEN_COOKIE } from '../middleware/auth';
import { deleteAllUserData, recordAccountDeletion } from '../services/dynamo';
import { deleteAllUserPhotos } from '../services/s3';
import { validate, signupSchema, loginSchema, confirmSchema, changePasswordSchema, refreshSchema, forgotPasswordSchema, resetPasswordSchema, updateNicknameSchema, changeEmailSchema, verifyEmailSchema, deleteAccountSchema } from '../validators';

const router = Router();

/**
 * Web 用に access/id token を httpOnly cookie でも配る。XSS で
 * `localStorage` を読み出されてアカウント奪取される脆弱性への対策。
 * iOS/Swift クライアントは Bearer ヘッダー方式のままで動くよう、JSON
 * レスポンスにもトークンを含める（互換維持）。
 *
 * SameSite=Lax: 通常リンクからの GET には cookie が乗り、外部 form POST
 * 等の CSRF 系には乗らない。Strict だと OAuth リダイレクト等で困る場合が
 * あるので Lax を採用。Secure は本番（NODE_ENV=production）でのみ。
 */
function setAuthCookie(res: Response, accessToken: string | undefined) {
  if (!accessToken) return;
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    // Cognito access token は通常 1 時間有効。cookie もそれに合わせる。
    maxAge: 60 * 60 * 1000,
    path: '/',
  });
}
function clearAuthCookie(res: Response) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
}

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
    setAuthCookie(res, tokens.accessToken);
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
    setAuthCookie(res, tokens.accessToken);
    res.json(tokens);
  } catch (err: unknown) {
    res.status(401).json({ error: 'トークン更新に失敗しました' });
  }
});

// 明示的なログアウト：cookie をクリア（Web クライアント用）
router.post('/logout', async (_req: Request, res: Response) => {
  clearAuthCookie(res);
  res.json({ ok: true });
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
  // アカウント削除は不可逆 + 写真 / プロフィール / Cognito ユーザーを完全消去
  // するので、currentPassword を必須にして「トークン盗難 → 即削除」を防ぐ。
  // changeEmail と同等のガードレベル。
  const v = validate(deleteAccountSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }

  try {
    const userId = req.user!.userId;
    // Cognito DeleteUser には access token が必要。Bearer または cookie の
    // どちらから来ていても取得できるよう両方見る。
    const header = req.headers.authorization;
    const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
    const accessToken = header?.startsWith('Bearer ')
      ? header.slice(7)
      : cookies?.[ACCESS_TOKEN_COOKIE];
    if (!accessToken) { res.status(401).json({ error: '認証情報がありません' }); return; }

    // 0. 現在のパスワードで再認証 (失敗 = 401, Cognito の lockout は通常運用通り)
    try {
      await signIn(req.user!.email, v.data.currentPassword);
    } catch {
      res.status(401).json({ error: 'パスワードが正しくありません' });
      return;
    }
    // 0.5. 削除直前にニックネームを掴んでおいて監査ログ用に保存（本体は次の手順で消える）。
    //      失敗しても削除は続行する。
    await recordAccountDeletion({
      userId,
      email: req.user!.email ?? '',
      nickname: req.user!.nickname ?? '',
      deletedAt: Date.now(),
      deletedBy: 'self',
    });
    // 1. DynamoDB のデータを全削除（プロフィール匿名化含む）
    await deleteAllUserData(userId);
    // 2. S3 上のユーザーアップロード写真を全削除
    await deleteAllUserPhotos(userId);
    // 3. Cognito ユーザーを削除
    await deleteUser(accessToken);
    // 4. cookie もクリア
    clearAuthCookie(res);
    res.json({ message: 'アカウントを削除しました' });
  } catch (err: unknown) {
    console.error('Account deletion failed:', err instanceof Error ? err.message : 'unknown');
    res.status(500).json({ error: 'アカウント削除に失敗しました' });
  }
});

export default router;
