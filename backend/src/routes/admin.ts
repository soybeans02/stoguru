import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { getUserPoolId } from '../services/cognito';

const router = Router();
const cognito = new CognitoIdentityProviderClient({ region: 'ap-northeast-1' });

const ADMIN_JWT_SECRET = process.env.ADMIN_SECRET ?? 'default-admin-secret-change-me';

// 管理者ログイン → JWT返却
router.post('/login', (req: Request, res: Response) => {
  const { id, password } = req.body;
  if (id === process.env.ADMIN_ID && password === process.env.ADMIN_PASSWORD) {
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
  const { stats } = require('../index');
  const { saveStats } = require('../services/dynamo');
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

export default router;
