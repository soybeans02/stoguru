export interface OEmbedResult {
  title?: string;
  authorName?: string;
  platform: 'tiktok' | 'instagram' | 'other';
  pageText?: string; // HTMLから抽出した追加テキスト
}

// URLがプライベートIPやlocalhostでないか検証
function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    // プライベートIP・localhost・内部ネットワークをブロック
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]') return false;
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host)) return false;
    if (host.endsWith('.local') || host.endsWith('.internal')) return false;
    // http のみ許可（ftp等をブロック）
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return true;
  } catch {
    return false;
  }
}

// HTMLのmetaタグやog:descriptionなどからテキストを抽出
async function fetchPageMeta(url: string): Promise<string> {
  if (!isAllowedUrl(url)) return '';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RestaurantBookmark/1.0)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const html = await res.text();
    const parts: string[] = [];

    // og:title
    const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"/i);
    if (ogTitle?.[1]) parts.push(ogTitle[1]);

    // og:description
    const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/i);
    if (ogDesc?.[1]) parts.push(ogDesc[1]);

    // meta description
    const metaDesc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i);
    if (metaDesc?.[1]) parts.push(metaDesc[1]);

    // title tag
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleTag?.[1]) parts.push(titleTag[1]);

    return [...new Set(parts)].join('\n').slice(0, 1000);
  } catch {
    return '';
  }
}

export async function fetchOEmbed(url: string): Promise<OEmbedResult> {
  const isTikTok = url.includes('tiktok.com');
  const isInstagram = url.includes('instagram.com');

  // oEmbedとページメタを並列取得
  const pageMetaPromise = fetchPageMeta(url);

  if (isTikTok) {
    try {
      const [res, pageMeta] = await Promise.all([
        fetch(
          `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
          { headers: { 'User-Agent': 'RestaurantBookmark/1.0' } }
        ),
        pageMetaPromise,
      ]);
      if (res.ok) {
        const data = await res.json() as { title?: string; author_name?: string };
        return { title: data.title, authorName: data.author_name, platform: 'tiktok', pageText: pageMeta };
      }
      return { platform: 'tiktok', pageText: pageMeta };
    } catch (err) {
      console.warn('[oEmbed] TikTok fetch failed:', err instanceof Error ? err.message : err);
    }
    const pageMeta = await pageMetaPromise;
    return { platform: 'tiktok', pageText: pageMeta };
  }

  if (isInstagram) {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN;
    if (token) {
      try {
        const [res, pageMeta] = await Promise.all([
          fetch(
            `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=${token}`,
            { headers: { 'User-Agent': 'RestaurantBookmark/1.0' } }
          ),
          pageMetaPromise,
        ]);
        if (res.ok) {
          const data = await res.json() as { title?: string; author_name?: string };
          return { title: data.title, authorName: data.author_name, platform: 'instagram', pageText: pageMeta };
        }
        return { platform: 'instagram', pageText: pageMeta };
      } catch (err) {
        console.warn('[oEmbed] Instagram fetch failed:', err instanceof Error ? err.message : err);
      }
    }
    const pageMeta = await pageMetaPromise;
    return { platform: 'instagram', pageText: pageMeta };
  }

  const pageMeta = await pageMetaPromise;
  return { platform: 'other', pageText: pageMeta };
}
