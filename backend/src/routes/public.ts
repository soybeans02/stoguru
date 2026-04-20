import { Router, Request, Response } from 'express';
import { getUserById } from '../services/cognito';
import { getInfluencerProfile, getUserSettings, getUserStocks } from '../services/dynamo';

const router = Router();

// ─── 公開プロフィール（認証不要・共有リンク用） ───
router.get('/profile/:userId', async (req: Request, res: Response) => {
  const userId = req.params.userId as string;
  try {
    const [userInfo, profile, settings, stocks] = await Promise.all([
      getUserById(userId),
      getInfluencerProfile(userId).catch(() => null),
      getUserSettings(userId).catch(() => null),
      getUserStocks(userId).catch(() => []),
    ]);

    if (!userInfo) {
      res.status(404).json({ error: 'ユーザーが見つかりません' });
      return;
    }

    // 非公開アカウントは最小限のみ返す
    if ((settings as { isPrivate?: boolean } | null)?.isPrivate) {
      res.json({
        userId,
        nickname: userInfo.nickname,
        isPrivate: true,
      });
      return;
    }

    const visitedCount = stocks.filter((s) => s.status === 'visited').length;

    res.json({
      userId,
      nickname: userInfo.nickname,
      profilePhotoUrl: profile?.profilePhotoUrl ?? (settings as { profilePhotoUrl?: string } | null)?.profilePhotoUrl,
      bio: profile?.bio,
      stockCount: stocks.length,
      visitedCount,
      isPrivate: false,
    });
  } catch (err) {
    console.error('Public profile fetch failed:', err);
    res.status(500).json({ error: '取得に失敗しました' });
  }
});

export default router;
