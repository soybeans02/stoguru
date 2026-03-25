export interface OEmbedResult {
  title?: string;
  authorName?: string;
  platform: 'tiktok' | 'instagram' | 'other';
}

export async function fetchOEmbed(url: string): Promise<OEmbedResult> {
  const isTikTok = url.includes('tiktok.com');
  const isInstagram = url.includes('instagram.com');

  if (isTikTok) {
    try {
      const res = await fetch(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
        { headers: { 'User-Agent': 'RestaurantBookmark/1.0' } }
      );
      if (res.ok) {
        const data = await res.json() as { title?: string; author_name?: string };
        return { title: data.title, authorName: data.author_name, platform: 'tiktok' };
      }
    } catch (err) {
      console.warn('[oEmbed] TikTok fetch failed:', err instanceof Error ? err.message : err);
    }
    return { platform: 'tiktok' };
  }

  if (isInstagram) {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN;
    if (token) {
      try {
        const res = await fetch(
          `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=${token}`,
          { headers: { 'User-Agent': 'RestaurantBookmark/1.0' } }
        );
        if (res.ok) {
          const data = await res.json() as { title?: string; author_name?: string };
          return { title: data.title, authorName: data.author_name, platform: 'instagram' };
        }
      } catch (err) {
        console.warn('[oEmbed] Instagram fetch failed:', err instanceof Error ? err.message : err);
      }
    }
    return { platform: 'instagram' };
  }

  return { platform: 'other' };
}
