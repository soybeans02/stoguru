import { Request, Response, NextFunction, RequestHandler } from 'express';
import { getUserFromToken } from '../services/cognito';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  nickname: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

// トークン検証キャッシュ（TTL付き）
interface CacheEntry {
  user: AuthenticatedUser;
  expiresAt: number;
}

const TOKEN_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5分
const MAX_CACHE_SIZE = 1000;

function cleanupCache() {
  if (TOKEN_CACHE.size <= MAX_CACHE_SIZE) return;
  const now = Date.now();
  for (const [key, entry] of TOKEN_CACHE) {
    if (entry.expiresAt < now) TOKEN_CACHE.delete(key);
  }
  // それでも多い場合は古い順に削除
  if (TOKEN_CACHE.size > MAX_CACHE_SIZE) {
    const entries = [...TOKEN_CACHE.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const toDelete = entries.slice(0, TOKEN_CACHE.size - MAX_CACHE_SIZE);
    for (const [key] of toDelete) TOKEN_CACHE.delete(key);
  }
}

// トークンキャッシュ無効化（admin disableなどで使用）
export function invalidateTokenCache(token?: string) {
  if (token) {
    TOKEN_CACHE.delete(token);
  } else {
    TOKEN_CACHE.clear();
  }
}

/// 認証は任意（ログインしてれば user セット、未ログインでも次へ進む）
export const optionalAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }
  try {
    const token = header.slice(7);
    const cached = TOKEN_CACHE.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      (req as AuthRequest).user = cached.user;
      next();
      return;
    }
    const user = await getUserFromToken(token);
    if (user.userId) {
      TOKEN_CACHE.set(token, { user, expiresAt: Date.now() + CACHE_TTL });
      cleanupCache();
      (req as AuthRequest).user = user;
    }
    next();
  } catch {
    // トークン期限切れでも匿名として通す
    next();
  }
};

// Use RequestHandler so Express accepts this directly without `as any`
export const requireAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'ログインが必要です' });
    return;
  }

  try {
    const token = header.slice(7);

    // キャッシュチェック
    const cached = TOKEN_CACHE.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      (req as AuthRequest).user = cached.user;
      next();
      return;
    }

    const user = await getUserFromToken(token);
    if (!user.userId) {
      res.status(401).json({ error: 'トークンが無効です' });
      return;
    }

    // キャッシュに保存
    TOKEN_CACHE.set(token, { user, expiresAt: Date.now() + CACHE_TTL });
    cleanupCache();

    (req as AuthRequest).user = user;
    next();
  } catch {
    res.status(401).json({ error: 'トークンが期限切れです。再ログインしてください' });
  }
};
