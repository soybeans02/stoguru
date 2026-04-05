import { Response, NextFunction, RequestHandler } from 'express';
import { AuthRequest } from './auth';
import { getUserSettings } from '../services/dynamo';

export const requireInfluencer: RequestHandler = async (req, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  if (!authReq.user?.userId) {
    res.status(401).json({ error: 'ログインが必要です' });
    return;
  }

  try {
    const settings = await getUserSettings(authReq.user.userId);
    if (settings.role !== 'influencer') {
      res.status(403).json({ error: 'インフルエンサー登録が必要です' });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
};
