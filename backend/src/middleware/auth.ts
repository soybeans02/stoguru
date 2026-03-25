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

// Use RequestHandler so Express accepts this directly without `as any`
export const requireAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'ログインが必要です' });
    return;
  }

  try {
    const token = header.slice(7);
    const user = await getUserFromToken(token);
    if (!user.userId) {
      res.status(401).json({ error: 'トークンが無効です' });
      return;
    }
    (req as AuthRequest).user = user;
    next();
  } catch {
    res.status(401).json({ error: 'トークンが期限切れです。再ログインしてください' });
  }
};
