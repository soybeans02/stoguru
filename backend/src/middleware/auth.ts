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

/**
 * Cognito アクセストークン (JWT) の `exp` クレームを decode（署名検証なし）。
 * キャッシュ TTL を `min(now+5min, exp)` にするためだけに使う。署名検証は
 * Cognito GetUser 経由で済んでいるので、ここではペイロードを取り出すだけ。
 * パース失敗時は null。
 */
function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    const obj = JSON.parse(decoded);
    if (typeof obj?.exp === 'number') return obj.exp * 1000; // 秒→ミリ秒
    return null;
  } catch {
    return null;
  }
}

function computeCacheExpiry(token: string): number {
  const jwtExpMs = decodeJwtExp(token);
  const cacheCap = Date.now() + CACHE_TTL;
  if (jwtExpMs && jwtExpMs < cacheCap) return jwtExpMs;
  return cacheCap;
}

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

/**
 * Authorization ヘッダーから「すでに検証済みでキャッシュにある」userId を取り出す。
 * トークンが新規なら null（= verified userId は得られない）。
 *
 * 用途: rate-limit の key 生成。verifyせずに token を decode した userId を使うと
 * 攻撃者が任意の userId を詐称して rate-limit を回避できるので、必ずキャッシュ
 * （= 過去に Cognito で検証済み）の userId だけを信頼する。最初のリクエストは
 * IP ベースに fallback、検証後の継続リクエストは user ベースになる。
 */
export function peekVerifiedUserId(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  const cached = TOKEN_CACHE.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.user.userId;
  return null;
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
      TOKEN_CACHE.set(token, { user, expiresAt: computeCacheExpiry(token) });
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
