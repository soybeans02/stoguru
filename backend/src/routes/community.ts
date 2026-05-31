/**
 * community.ts — エリア別タイムライン掲示板。
 *
 *  GET  /community/posts?area=umeda   エリアの投稿を新着順
 *  POST /community/posts              投稿 (text + 任意 photoUrls + 任意 restaurantId)
 *  POST /community/posts/:area/:createdAt/like     いいね (1人1回)
 *  POST /community/posts/:area/:createdAt/report   通報 (1人1回、閾値で自動非表示)
 *  DELETE /community/posts/:area/:createdAt        削除 (本人のみ)
 *
 * 全エンドポイント要認証。投稿は NG ワード + 長さ + URL スキームを検証。
 */
import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  createPost, listPostsByArea, getPost,
  likePost, reportPost, deletePost,
  getRestaurantV2,
} from '../services/dynamo';
import type { Post } from '../types';
import { randomUUID } from 'crypto';

const router = Router();
router.use(requireAuth);

// 有効な areaId (HomeArea と揃える) + 全国
const VALID_AREAS = new Set([
  'all', 'umeda', 'namba', 'shinsaibashi', 'tennoji', 'kyobashi',
  'kyoto', 'kobe', 'tokyo', 'fukuoka',
]);

// 簡易 NG ワード (公序良俗 + スパム最低限。本格運用時は外部辞書に差し替え)
const NG_WORDS = ['死ね', '殺す', 'カス', '詐欺', 'http://bit.ly'];

function containsNG(text: string): boolean {
  const lower = text.toLowerCase();
  return NG_WORDS.some((w) => lower.includes(w.toLowerCase()));
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

// ─── 一覧 ───
router.get('/posts', async (req: AuthRequest, res: Response) => {
  const area = String(req.query.area ?? 'all');
  if (!VALID_AREAS.has(area)) {
    res.status(400).json({ error: '無効なエリアです' });
    return;
  }
  const posts = await listPostsByArea(area, 30);
  // voter Set などの内部フィールドは返さない
  res.json({
    items: posts.map((p) => ({
      postId: p.postId,
      areaId: p.areaId,
      createdAt: p.createdAt,
      authorId: p.authorId,
      authorNickname: p.authorNickname,
      text: p.text,
      photoUrls: p.photoUrls ?? [],
      restaurantId: p.restaurantId,
      restaurantName: p.restaurantName,
      likeCount: p.likeCount,
    })),
  });
});

// ─── 投稿 ───
router.post('/posts', async (req: AuthRequest, res: Response) => {
  const body = req.body as {
    area?: unknown; text?: unknown; photoUrls?: unknown; restaurantId?: unknown;
  };
  const area = String(body.area ?? 'all');
  if (!VALID_AREAS.has(area)) {
    res.status(400).json({ error: '無効なエリアです' });
    return;
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length === 0 || text.length > 1000) {
    res.status(400).json({ error: '本文は 1〜1000 文字で入力してください' });
    return;
  }
  if (containsNG(text)) {
    res.status(400).json({ error: '不適切な表現が含まれています' });
    return;
  }
  // 写真 URL は http(s) のみ、最大 4 枚
  const photoUrls = Array.isArray(body.photoUrls)
    ? body.photoUrls.filter((u): u is string => typeof u === 'string' && isHttpUrl(u)).slice(0, 4)
    : [];

  // 店タグ (任意) — 実在 + 表示名を非正規化
  let restaurantId: string | undefined;
  let restaurantName: string | undefined;
  if (typeof body.restaurantId === 'string' && body.restaurantId) {
    const r = await getRestaurantV2(body.restaurantId);
    if (r) { restaurantId = r.restaurantId; restaurantName = r.name; }
  }

  const post: Post = {
    areaId: area,
    createdAt: Date.now(),
    postId: randomUUID(),
    authorId: req.user!.userId,
    authorNickname: req.user!.nickname || 'ユーザー',
    text,
    photoUrls: photoUrls.length ? photoUrls : undefined,
    restaurantId,
    restaurantName,
    likeCount: 0,
    reportCount: 0,
    hidden: false,
  };
  await createPost(post);
  res.json({ ok: true, postId: post.postId, createdAt: post.createdAt });
});

// ─── いいね ───
router.post('/posts/:area/:createdAt/like', async (req: AuthRequest, res: Response) => {
  const area = req.params.area as string;
  const createdAt = Number(req.params.createdAt);
  if (!VALID_AREAS.has(area) || Number.isNaN(createdAt)) {
    res.status(400).json({ error: '無効なパラメータです' });
    return;
  }
  const result = await likePost(area, createdAt, req.user!.userId);
  res.json({ ok: true, liked: result.liked });
});

// ─── 通報 ───
router.post('/posts/:area/:createdAt/report', async (req: AuthRequest, res: Response) => {
  const area = req.params.area as string;
  const createdAt = Number(req.params.createdAt);
  if (!VALID_AREAS.has(area) || Number.isNaN(createdAt)) {
    res.status(400).json({ error: '無効なパラメータです' });
    return;
  }
  const result = await reportPost(area, createdAt, req.user!.userId);
  res.json({ ok: true, hidden: result.hidden });
});

// ─── 削除 (本人のみ) ───
router.delete('/posts/:area/:createdAt', async (req: AuthRequest, res: Response) => {
  const area = req.params.area as string;
  const createdAt = Number(req.params.createdAt);
  if (!VALID_AREAS.has(area) || Number.isNaN(createdAt)) {
    res.status(400).json({ error: '無効なパラメータです' });
    return;
  }
  const post = await getPost(area, createdAt);
  if (!post) { res.status(404).json({ error: '投稿が見つかりません' }); return; }
  if (post.authorId !== req.user!.userId) {
    res.status(403).json({ error: '自分の投稿のみ削除できます' });
    return;
  }
  await deletePost(area, createdAt);
  res.json({ ok: true });
});

export default router;
