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
 * Bearer ヘッダー or httpOnly Cookie からトークン文字列を取り出す。
 * Web は cookie、iOS/Swift は Bearer（互換性のため両対応）。
 */
export const ACCESS_TOKEN_COOKIE = 'stoguru_at';
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  // cookie-parser が req.cookies にパース済み
  const cookieToken = (req as unknown as { cookies?: Record<string, string> }).cookies?.[ACCESS_TOKEN_COOKIE];
  return cookieToken || null;
}

/**
 * Authorization ヘッダーまたは httpOnly cookie から「すでに検証済みで
 * キャッシュにある」userId を取り出す。トークンが新規なら null。
 *
 * 用途: rate-limit の key 生成。verifyせずに token を decode した userId を使うと
 * 攻撃者が任意の userId を詐称して rate-limit を回避できるので、必ずキャッシュ
 * （= 過去に Cognito で検証済み）の userId だけを信頼する。最初のリクエストは
 * IP ベースに fallback、検証後の継続リクエストは user ベースになる。
 */
export function peekVerifiedUserId(req: Request): string | null {
  const token = extractToken(req);
  if (!token) return null;
  const cached = TOKEN_CACHE.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.user.userId;
  return null;
}

/// 認証は任意（ログインしてれば user セット、未ログインでも次へ進む）。
/// 旧版は catch で Cognito 5xx エラーまで「匿名 OK」と握り潰していたため、
/// AWS 一時障害時に全 optionalAuth エンドポイントが沈黙のまま匿名扱いに
/// なる事故が起きやすかった。"Token 不正/期限切れ" と "Cognito 一時障害"
/// を区別して、後者は 503 で明示的に失敗させる。
export const optionalAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) {
    next();
    return;
  }
  try {
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
  } catch (err: unknown) {
    // Cognito の認証ライブラリは "NotAuthorizedException" / "TokenExpired"
    // 系を name に持つ独自エラーを投げる。これは 401 相当 (= 匿名扱いで OK)。
    // それ以外 (network / Cognito 5xx 等) は明示的に 503 で失敗させて
    // 「Cognito 障害が匿名アクセスに化ける」事故を防ぐ。
    const name = err instanceof Error ? err.name : '';
    const expiredOrInvalid =
      name === 'NotAuthorizedException' ||
      name === 'TokenExpiredError' ||
      name === 'JsonWebTokenError' ||
      name === 'UserNotFoundException';
    if (expiredOrInvalid) {
      next();
      return;
    }
    console.error('optionalAuth: upstream auth failed:', err);
    res.status(503).json({ error: '認証サービスが一時的に利用できません' });
  }
};

// Use RequestHandler so Express accepts this directly without `as any`
export const requireAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'ログインが必要です' });
    return;
  }

  try {
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
