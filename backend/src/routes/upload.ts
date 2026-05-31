import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validate, presignSchema } from '../validators';
import { generatePresignedUploadUrl, deleteObject } from '../services/s3';

const router = Router();

/**
 * POST /api/upload/video
 *
 * CloudFlare Stream の Direct Creator Upload URL を発行する。
 * クライアントが返却された uploadURL に動画ファイルを直接 PUT すると、
 * CloudFlare が自動で transcoding + HLS 化して全世界に配信できる状態にする。
 *
 * 必要な env var:
 *   - CLOUDFLARE_ACCOUNT_ID
 *   - CLOUDFLARE_STREAM_TOKEN  (= Account.Stream:Edit 権限)
 *
 * Response:
 *   {
 *     uploadUrl: "https://upload.cloudflarestream.com/...",
 *     videoUid: "abc123...",
 *     playbackUrl: "https://customer-xxx.cloudflarestream.com/abc123.../manifest/video.m3u8"
 *   }
 *
 * 注意: playback URL は customer-{code} を含む。Cloudflare account ごとに
 * 固有 (= subdomain) なので、env で `CLOUDFLARE_STREAM_CUSTOMER_CODE` を
 * 設定するか、最初の動画レスポンスから抽出して保存する。
 */
router.post('/upload/video', requireAuth, async (req: AuthRequest, res: Response) => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_STREAM_TOKEN;
  const customerCode = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;

  if (!accountId || !apiToken) {
    res.status(503).json({ error: '動画アップロードは現在オフラインです (= CloudFlare Stream 未設定)' });
    return;
  }

  // 最大 90 秒の縦動画想定。サイズ上限はクライアント側でも 100MB 程度に。
  const maxDurationSeconds = 90;

  try {
    const cfResp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxDurationSeconds,
          // creator フィールドに userId を入れて、後で「誰がアップしたか」追跡可能に
          creator: req.user!.userId,
          // 署名付き URL 必須に = 直リンク/bot/スクレイパからの再生 (= 配信費漏れ) を防ぐ。
          // 再生は POST /upload/video-token で発行した短命トークン経由のみ。
          requireSignedURLs: true,
        }),
      }
    );

    if (!cfResp.ok) {
      const text = await cfResp.text();
      console.error('[upload/video] CloudFlare error:', cfResp.status, text);
      res.status(502).json({ error: `CloudFlare Stream エラー: ${cfResp.status}` });
      return;
    }

    const data = await cfResp.json() as {
      success: boolean;
      result?: { uploadURL: string; uid: string };
      errors?: { message: string }[];
    };

    if (!data.success || !data.result) {
      res.status(502).json({
        error: data.errors?.[0]?.message ?? 'CloudFlare からの応答が不正',
      });
      return;
    }

    const { uploadURL, uid } = data.result;
    // 署名付き必須なので固定 playback URL は使えない。stoguruVideoUrl には
    // "cfstream:{uid}" を保存させ、再生時に /upload/video-token で署名 URL を発行する。
    res.json({
      uploadUrl: uploadURL,
      videoUid: uid,
      playbackRef: `cfstream:${uid}`,
    });
  } catch (err) {
    console.error('[upload/video] error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `動画 upload URL 発行に失敗: ${msg}` });
  }
});

/**
 * POST /api/upload/video-token  { ref: "cfstream:<uid>" }
 *
 * 署名付き再生 URL を発行する。requireSignedURLs=true の動画は、この短命
 * トークン無しには再生できない (= 直リンク/bot からの配信費漏れを防ぐ)。
 * トークンは CloudFlare の /stream/{uid}/token API で発行 (デフォルト有効期限)。
 *
 * Response: { playbackUrl: "https://customer-xxx.cloudflarestream.com/<uid>/manifest/video.m3u8?token=..." }
 */
router.post('/upload/video-token', requireAuth, async (req: AuthRequest, res: Response) => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_STREAM_TOKEN;
  const customerCode = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;
  if (!accountId || !apiToken) {
    res.status(503).json({ error: '動画は現在利用できません' });
    return;
  }

  const ref = (req.body as { ref?: unknown }).ref;
  if (typeof ref !== 'string' || !ref.startsWith('cfstream:')) {
    res.status(400).json({ error: '無効な動画参照です' });
    return;
  }
  const uid = ref.slice('cfstream:'.length);
  // uid は CloudFlare の hex 32 桁。想定外文字は弾く (URL/SSRF 安全)
  if (!/^[0-9a-f]{32}$/i.test(uid)) {
    res.status(400).json({ error: '無効な動画 ID です' });
    return;
  }

  try {
    // 署名トークンを発行 (有効期限はデフォルト。短命にしたい場合は exp を body で指定)
    const tokenResp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/token`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadable: false }),
      }
    );
    if (!tokenResp.ok) {
      console.error('[video-token] CloudFlare error:', tokenResp.status, await tokenResp.text());
      res.status(502).json({ error: '動画トークンの発行に失敗しました' });
      return;
    }
    const data = await tokenResp.json() as { success: boolean; result?: { token: string } };
    const token = data.result?.token;
    if (!data.success || !token) {
      res.status(502).json({ error: '動画トークンの発行に失敗しました' });
      return;
    }
    const host = customerCode
      ? `https://customer-${customerCode}.cloudflarestream.com`
      : 'https://videodelivery.net';
    res.json({ playbackUrl: `${host}/${token}/manifest/video.m3u8` });
  } catch (err) {
    console.error('[video-token] error:', err);
    res.status(500).json({ error: '動画トークンの発行に失敗しました' });
  }
});

// ─── プリサインドURL発行 ───

router.post('/upload/presign', requireAuth, async (req: AuthRequest, res: Response) => {
  const v = validate(presignSchema, req.body);
  if (!v.success) { res.status(400).json({ error: v.error }); return; }

  const { contentType, filename } = v.data;
  const result = await generatePresignedUploadUrl(req.user!.userId, contentType, filename);
  res.json(result);
});

// ─── 写真削除 ───
// Express 5 + path-to-regexp v8 では `*key` ワイルドカードのキャプチャが
// **string[] になる** ため、以前の `(key as string).startsWith(...)` は
// runtime で TypeError になっていた。さらに仮に `join('/')` で文字列化しても
// `..%2F` のような URL エンコードされたトラバーサルが prefix チェックを
// すり抜ける危険がある。ここでは:
//   1. params を string[] | string の両形に対応
//   2. URL デコード後に `..` / null byte / 二重スラッシュを拒否
//   3. その上で改めて photos/{userId}/ プレフィックスを検証
router.delete('/upload/*key', requireAuth, async (req: AuthRequest, res: Response) => {
  const raw = req.params.key as unknown;
  const segments: string[] = Array.isArray(raw)
    ? (raw as string[])
    : typeof raw === 'string'
      ? (raw as string).split('/')
      : [];
  if (segments.length === 0) { res.status(400).json({ error: 'key が必要です' }); return; }
  let decoded: string;
  try {
    decoded = segments.map((s) => decodeURIComponent(s)).join('/');
  } catch {
    res.status(400).json({ error: '不正な key です' }); return;
  }
  // パストラバーサル / NUL / 二重スラッシュ / 先頭スラッシュ拒否
  if (
    decoded.includes('..') ||
    decoded.includes('\0') ||
    decoded.startsWith('/') ||
    decoded.includes('//')
  ) {
    res.status(400).json({ error: '不正な key です' }); return;
  }
  // 自分の photos/ プレフィックスのみ
  const expectedPrefix = `photos/${req.user!.userId}/`;
  if (!decoded.startsWith(expectedPrefix)) {
    res.status(403).json({ error: '他のユーザーの写真は削除できません' });
    return;
  }
  await deleteObject(decoded);
  res.json({ ok: true });
});

export default router;
