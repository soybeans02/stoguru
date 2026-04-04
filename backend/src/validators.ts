import { z } from 'zod';

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
});

// ─── レストラン ───

export const restaurantSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1, '店名は必須です').max(100).trim(),
  address: z.string().max(200).default(''),
  lat: z.union([z.number(), z.null()]).optional().transform(v => v ?? undefined),
  lng: z.union([z.number(), z.null()]).optional().transform(v => v ?? undefined),
  categoryIds: z.array(z.string().max(50)).max(20).default([]),
  influencerIds: z.array(z.string().max(50)).max(20).default([]),
  sourceVideos: z.array(z.object({
    url: z.string().url().max(500),
    platform: z.enum(['tiktok', 'instagram', 'youtube', 'other']).default('other'),
  })).max(10).default([]),
  genreTags: z.array(z.string().max(30)).max(20).default([]),
  notes: z.string().max(1000).default(''),
  landmarkMemo: z.string().max(200).optional(),
  review: z.any().nullable().optional(),
  status: z.enum(['wishlist', 'visited']).default('wishlist'),
  visitedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

// ─── メッセージ ───

export const messageSchema = z.object({
  content: z.string().min(1, 'メッセージを入力してください').max(2000, '上限2000文字です').trim(),
});

// ─── シェア ───

export const shareSchema = z.object({
  restaurantName: z.string().min(1, 'レストラン名が必要です').max(100),
  restaurantAddress: z.string().max(200).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  comment: z.string().max(500).optional(),
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
