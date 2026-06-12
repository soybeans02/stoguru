/**
 * admin.ts — 運営者専用 API。
 *
 * 一般ユーザーの Cognito 認証とは別系統で、単一の管理者 ID + bcrypt ハッシュ
 * (env: ADMIN_ID / ADMIN_PASSWORD_HASH) を検証して独自 JWT を発行する。
 * ユーザー一覧 / 統計 / フィードバック閲覧などの運用機能を提供。
 */
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { getUserPoolId, getUserById, adminDisableUser, adminEnableUser, adminResetPassword, adminDeleteUser } from '../services/cognito';
import { deleteAllUserData, saveStats, listFeedback, markFeedbackRead, deleteFeedback, recordAccountDeletion, listDeletedAccounts, scanRestaurantsMissingHours, updateRestaurantPlaceInfo } from '../services/dynamo';
import { resolvePlaceInfo, placesEnabled } from '../services/places';
import { deleteAllUserPhotos } from '../services/s3';
import { invalidateTokenCache } from '../middleware/auth';
import { stats, userActivity } from '../state';

const router = Router();
const cognito = new CognitoIdentityProviderClient({ region: 'ap-northeast-1' });

function getAdminSecret(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error('ADMIN_SECRET environment variable is required');
  return secret;
}
const ADMIN_JWT_SECRET = getAdminSecret();

// 管理者ログイン → JWT返却
// ADMIN_PASSWORD env var must store a bcrypt hash (not plain text).
// Generate one with: node -e "require('bcryptjs').hash('yourpassword', 10).then(h => console.log(h))"
router.post('/login', async (req: Request, res: Response) => {
  const { id, password } = req.body;
  const hash = process.env.ADMIN_PASSWORD;
  if (id === process.env.ADMIN_ID && hash && await bcrypt.compare(password, hash)) {
    const token = jwt.sign({ sub: id, role: 'admin' }, ADMIN_JWT_SECRET, {
      expiresIn: '8h',
    });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'IDまたはパスワードが違います' });
  }
});

// 管理者認証ミドルウェア
function requireAdmin(req: Request, res: Response, next: () => void) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: '管理者認証が必要です' });
    return;
  }
  try {
    const payload = jwt.verify(auth.slice(7), ADMIN_JWT_SECRET) as jwt.JwtPayload;
    if (payload.sub !== process.env.ADMIN_ID || payload.role !== 'admin') {
      throw new Error();
    }
    next();
  } catch {
    res.status(401).json({ error: '無効なトークンです' });
  }
}

// ユーザー一覧取得
router.get('/users', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await cognito.send(new ListUsersCommand({
      UserPoolId: getUserPoolId(),
      Limit: 60,
    }));

    const users = (result.Users ?? []).map((u) => {
      const attrs: Record<string, string> = {};
      u.Attributes?.forEach((a) => {
        if (a.Name && a.Value) attrs[a.Name] = a.Value;
      });
      return {
        userId: attrs['sub'],
        email: attrs['email'],
        nickname: attrs['nickname'] ?? '-',
        status: u.UserStatus,
        createdAt: u.UserCreateDate?.toISOString(),
        enabled: u.Enabled,
      };
    });

    res.json({ users, total: users.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ユーザー一覧の取得に失敗しました' });
  }
});

// リクエスト統計取得（閲覧時にDBにも保存）
router.get('/stats', requireAdmin, async (_req: Request, res: Response) => {
  const result = {
    total: stats.total,
    startedAt: stats.startedAt,
    byEndpoint: Object.entries(stats.byEndpoint)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 20),
    byHour: stats.byHour,
  };
  // DBに保存（非同期、失敗しても無視）
  saveStats({ total: stats.total, byEndpoint: stats.byEndpoint, byHour: stats.byHour, startedAt: stats.startedAt }).catch(() => {});
  res.json(result);
});

// ユーザーアクティビティ（最終オンライン）
router.get('/activity', requireAdmin, (_req: Request, res: Response) => {
  const list = Object.entries(userActivity)
    .map(([userId, data]) => ({
      userId,
      nickname: data.nickname ?? '不明',
      lastSeen: data.lastSeen,
      lastSeenAgo: formatAgo(data.lastSeen),
    }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
  res.json(list);
});

// ─── ユーザー管理操作 ───

// ユーザー無効化
router.post('/users/:userId/disable', requireAdmin, async (req: Request, res: Response) => {
  try {
    const uid = req.params.userId as string;
    const user = await getUserById(uid);
    if (!user?.username) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }
    await adminDisableUser(user.username);
    invalidateTokenCache(); // 全キャッシュクリア（disable対象のトークンが不明なため）
    res.json({ message: 'ユーザーを無効化しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ユーザーの無効化に失敗しました' });
  }
});

// ユーザー有効化
router.post('/users/:userId/enable', requireAdmin, async (req: Request, res: Response) => {
  try {
    const uid = req.params.userId as string;
    const user = await getUserById(uid);
    if (!user?.username) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }
    await adminEnableUser(user.username);
    res.json({ message: 'ユーザーを有効化しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ユーザーの有効化に失敗しました' });
  }
});

// パスワードリセット（確認コードをメール送信）
router.post('/users/:userId/reset-password', requireAdmin, async (req: Request, res: Response) => {
  try {
    const uid = req.params.userId as string;
    const user = await getUserById(uid);
    if (!user?.username) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }
    await adminResetPassword(user.username);
    res.json({ message: 'パスワードリセットメールを送信しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'パスワードリセットに失敗しました' });
  }
});

// ユーザー削除
router.delete('/users/:userId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const uid = req.params.userId as string;
    const user = await getUserById(uid);
    if (!user?.username) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }
    // 監査ログにメタを残す（削除実行で本体は消えるので消える前に取る）。
    // user.username は Cognito の username（= email）。
    await recordAccountDeletion({
      userId: uid,
      email: user.username,
      nickname: user.nickname ?? '',
      deletedAt: Date.now(),
      deletedBy: 'admin',
    });
    await deleteAllUserData(uid);
    await deleteAllUserPhotos(uid);
    await adminDeleteUser(user.username);
    res.json({ message: 'ユーザーを削除しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ユーザーの削除に失敗しました' });
  }
});

// 削除アカウント監査ログ一覧（最新順、最大 200 件）
router.get('/deleted-accounts', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const items = await listDeletedAccounts();
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '削除履歴の取得に失敗しました' });
  }
});

// フィードバック一覧
router.get('/feedback', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const items = await listFeedback();
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'フィードバック取得に失敗しました' });
  }
});

// フィードバック既読化
router.patch('/feedback/:id/read', requireAdmin, async (req: Request, res: Response) => {
  try {
    await markFeedbackRead(req.params.id as string);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新に失敗しました' });
  }
});

// フィードバック削除
router.delete('/feedback/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    await deleteFeedback(req.params.id as string);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '削除に失敗しました' });
  }
});

// 旧「投稿許可申請の管理」エンドポイント（list / approve / reject）は撤廃済み。
// インフルエンサー登録ゲート自体が無くなったので承認フロー不要。

function formatAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'オンライン';
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  return `${Math.floor(hr / 24)}日前`;
}

/**
 * 営業時間バックフィル。openingHours 未設定の店を limit 件、Google Places から
 * 取得して保存する。冪等（既に入った店はスキャン対象外）。営業時間は滅多に
 * 変わらないので cron 不要、必要時に手叩きで回す想定。
 * GOOGLE_PLACES_API_KEY 未設定なら 503。
 */
router.post('/backfill-hours', requireAdmin, async (req: Request, res: Response) => {
  if (!placesEnabled) {
    res.status(503).json({ error: 'GOOGLE_PLACES_API_KEY が未設定です' });
    return;
  }
  const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 50);
  const targets = await scanRestaurantsMissingHours(limit);
  let resolved = 0;
  let withHours = 0;
  const failed: string[] = [];
  for (const t of targets) {
    try {
      const info = await resolvePlaceInfo(t.name, t.lat, t.lng);
      if (info?.placeId) {
        await updateRestaurantPlaceInfo(t.restaurantId, info);
        resolved++;
        if (info.openingHours) withHours++;
      } else {
        failed.push(t.name);
      }
    } catch (e) {
      console.error('[backfill-hours] failed:', t.restaurantId, e);
      failed.push(t.name);
    }
  }
  res.json({ scanned: targets.length, resolved, withHours, failed });
});

export default router;
