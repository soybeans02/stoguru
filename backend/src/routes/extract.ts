import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { fetchOEmbed } from '../services/oEmbed';
import { extractRestaurantFromText } from '../services/claude';
import { geocode } from '../services/geocode';

const router = Router();

router.post('/extract-url', requireAuth, async (req: AuthRequest, res: Response) => {
  const { url, caption } = req.body as { url?: string; caption?: string };
  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: '有効なURLを入力してください' });
    return;
  }

  try {
    const oembed = await fetchOEmbed(url);
    // キャプション > oEmbedタイトル+ページメタ > oEmbedタイトルのみ
    const textToAnalyze = caption?.trim()
      || [oembed.title, oembed.pageText, oembed.authorName].filter(Boolean).join('\n');

    let restaurantName: string | null = null;
    let address: string | null = null;

    if (textToAnalyze && process.env.ANTHROPIC_API_KEY) {
      const extracted = await extractRestaurantFromText(textToAnalyze);
      restaurantName = extracted.restaurantName;
      address = extracted.address;
    }

    let lat: number | null = null;
    let lng: number | null = null;
    const geocodeQuery = address ?? restaurantName;
    if (geocodeQuery) {
      const geo = await geocode(geocodeQuery);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }

    const handleMatch = url.match(/(?:tiktok\.com\/@|instagram\.com\/)([^/?]+)/);
    const influencerHandle = handleMatch?.[1] ?? null;

    res.json({
      restaurantName,
      address,
      lat,
      lng,
      platform: oembed.platform,
      videoTitle: oembed.title ?? null,
      influencerHandle,
    });
  } catch (err: unknown) {
    console.error('[extract-url] Error:', err instanceof Error ? err.message : err);
    const isCredit = err instanceof Error && err.message.includes('credit');
    res.status(isCredit ? 402 : 500).json({
      error: isCredit ? 'APIクレジットが不足しています' : 'URL解析に失敗しました',
    });
  }
});

export default router;
