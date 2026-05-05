import { z } from 'zod';

/**
 * URL は必ず http(s) のみ許可。`javascript:` / `data:` 等のスキームを
 * 蹴って `<a href={url}>` 経由の click-XSS を防ぐ。
 */
const httpUrl = (max = 500, msg = '無効な URL です') =>
  z.string().max(max).refine((s) => {
    if (!s) return true;
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, { message: msg });

// ─── 認証 ───

export const signupSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください').max(254),
  password: z.string().min(8, 'パスワードは8文字以上にしてください').max(128),
  nickname: z.string().min(1, 'ニックネームは必須です').max(50, 'ニックネームは50文字以内にしてください').trim(),
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export const confirmSchema = z.object({
  email: z.string().email().max(254),
  code: z.string().min(1).max(10),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '現在のパスワードは必須です').max(128),
  newPassword: z.string().min(8, 'パスワードは8文字以上にしてください').max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください').max(254),
});

export const resetPasswordSchema = z.object({
  email: z.string().email().max(254),
  code: z.string().min(1, '確認コードは必須です').max(10),
  newPassword: z.string().min(8, 'パスワードは8文字以上にしてください').max(128),
});

export const updateNicknameSchema = z.object({
  nickname: z.string().min(1, 'ニックネームは必須です').max(50, 'ニックネームは50文字以内にしてください').trim(),
});

export const changeEmailSchema = z.object({
  newEmail: z.string().email('有効なメールアドレスを入力してください').max(254),
  currentPassword: z.string().min(1, '現在のパスワードは必須です').max(128),
});

export const verifyEmailSchema = z.object({
  code: z.string().min(1, '確認コードは必須です').max(20).trim(),
});

// ─── レストラン ───

export const restaurantSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1, '店名は必須です').max(100).trim(),
  address: z.string().max(200).default(''),
  lat: z.union([z.number(), z.null()]).optional().transform(v => v ?? undefined),
  lng: z.union([z.number(), z.null()]).optional().transform(v => v ?? undefined),
  genre: z.string().max(50).optional(),
  scene: z.array(z.string().max(50)).max(10).optional(),
  priceRange: z.string().max(50).optional(),
  distance: z.string().max(50).optional(),
  influencer: z.object({
    name: z.string().max(100).default(''),
    handle: z.string().max(100).default(''),
    platform: z.enum(['tiktok', 'instagram', 'youtube']).default('tiktok'),
  }).optional(),
  videoUrl: z.string().max(500).optional(),
  photoEmoji: z.string().max(10).optional(),
  pinned: z.boolean().optional(),
  categoryIds: z.array(z.string().max(50)).max(20).default([]),
  influencerIds: z.array(z.string().max(50)).max(20).default([]),
  sourceVideos: z.array(z.object({
    url: z.string().url().max(500),
    platform: z.enum(['tiktok', 'instagram', 'youtube', 'other']).default('other'),
  })).max(10).default([]),
  genreTags: z.array(z.string().max(30)).max(20).default([]),
  notes: z.string().max(1000).default(''),
  landmarkMemo: z.string().max(200).optional(),
  review: z.object({
    text: z.string().max(2000).default(''),
    rating: z.number().min(0).max(5).optional(),
    reviewedAt: z.string().optional(),
  }).nullable().optional(),
  status: z.enum(['wishlist', 'visited']).default('wishlist'),
  visitedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.union([z.string(), z.number()]).optional(),
});

// ─── ユーザー設定 ───

export const settingsSchema = z.object({
  influencers: z.array(z.string().max(100)).max(50).default([]),
  categories: z.array(z.string().max(50)).max(50).default([]),
  isPrivate: z.boolean().optional(),
}).passthrough(); // 将来のフィールド拡張に対応しつつサイズは制限

// ─── シェア ───

export const shareSchema = z.object({
  restaurantName: z.string().min(1, 'レストラン名が必要です').max(100),
  restaurantAddress: z.string().max(200).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  comment: z.string().max(500).optional(),
});

// ─── 近隣検索 ───

export const nearbySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(100).max(50000).default(3000),
});

// ─── インフルエンサー ───

export const influencerProfileSchema = z.object({
  displayName: z.string().max(50).trim().optional(),
  bio: z.string().max(500).optional(),
  instagramHandle: z.string().max(100).optional(),
  instagramUrl: httpUrl().optional(),
  tiktokHandle: z.string().max(100).optional(),
  tiktokUrl: httpUrl().optional(),
  youtubeHandle: z.string().max(100).optional(),
  youtubeUrl: httpUrl().optional(),
  platform: z.enum(['instagram', 'tiktok', 'youtube']).optional(),
  genres: z.array(z.string().max(50)).max(10).default([]),
});

export const influencerRestaurantSchema = z.object({
  name: z.string().min(1, '店名は必須です').max(100, '店名は100文字以内にしてください').trim(),
  address: z.string().max(200).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  placeId: z.string().max(300).optional(),
  genres: z.array(z.string().max(50)).max(5, 'ジャンルは5個まで').default([]),
  scene: z.array(z.string().max(50)).max(10).optional(),
  priceRange: z.string().max(50).optional(),
  // photoUrls / urls は href / src に流れるため必ず http(s) スキームを強制
  photoUrls: z.array(httpUrl()).max(10, '写真は10枚まで').default([]),
  videoUrl: httpUrl().optional(),
  instagramUrl: httpUrl().optional(),
  tiktokUrl: httpUrl().optional(),
  youtubeUrl: httpUrl().optional(),
  urls: z.array(httpUrl()).max(20).optional(),
  description: z.string().max(1000).optional(),
  visibility: z.enum(['public', 'mutual', 'hidden']).default('public'),
});

// ─── 一括同期（localStorage 移行用）───
// /restaurants/sync で送られてくる 1 件あたりの schema。各フィールドに上限を
// 設けて、500 件 × 巨大文字列の DoS / DynamoDB アイテムサイズ超過を防ぐ。

export const syncItemSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().max(200).optional(),
  address: z.string().max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  genre: z.string().max(50).optional(),
  genreTags: z.array(z.string().max(50)).max(10).optional(),
  priceRange: z.string().max(50).optional(),
  videoUrl: httpUrl(2000).optional(),
  pinned: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  landmarkMemo: z.string().max(500).optional(),
  review: z.object({
    text: z.string().max(2000).optional(),
    rating: z.number().min(0).max(5).optional(),
    reviewedAt: z.string().max(50).optional(),
  }).nullable().optional(),
  status: z.enum(['visited', 'wishlist']).optional(),
  visitedAt: z.string().max(50).optional(),
  photoEmoji: z.string().max(10).optional(),
  createdAt: z.string().max(50).optional(),
}).passthrough(); // 将来追加されるフィールドは無害に通過

export const syncBatchSchema = z.object({
  restaurants: z.array(syncItemSchema).max(500),
});

// ─── フィードバック ───

export const feedbackSchema = z.object({
  category: z.enum(['bug', 'feature', 'support', 'other']).default('other'),
  message: z.string().min(1, 'メッセージを入力してください').max(2000, 'メッセージは2000文字以内にしてください').trim(),
  // Swift の JSONEncoder は nil を null として送るので nullable で受ける
  replyEmail: z.union([
    z.string().email('有効なメールアドレスを入力してください').max(254),
    z.null(),
  ]).optional().transform(v => v ?? undefined),
});

// ─── 写真アップロード ───

export const presignSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  filename: z.string().min(1).max(255),
});

// ─── ユーティリティ ───

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  // Zod v4 uses .issues, v3 uses .errors
  const issues = (result.error as any).issues ?? (result.error as any).errors ?? [];
  const firstError = issues[0];
  return { success: false, error: firstError?.message ?? 'バリデーションエラー' };
}
