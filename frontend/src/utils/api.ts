const BASE = import.meta.env.VITE_API_URL ?? '/api';

// Token refresh callback — AuthContextから設定される
let _refreshTokenFn: (() => Promise<string | null>) | null = null;
export function setRefreshTokenFn(fn: () => Promise<string | null>) {
  _refreshTokenFn = fn;
}

function getToken() {
  return localStorage.getItem('accessToken');
}

function headers(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  // Bearer ヘッダーは互換性のため残す（cookie が無効/期限切れ時の fallback +
  // 将来 iOS WebView 等で localStorage 共有してくる場合に対応）。
  // 本命はバックが Set-Cookie で発行する httpOnly cookie。
  const t = getToken();
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

/**
 * 全 fetch に credentials: 'include' を付与する共通の init マージャ。
 * これで Set-Cookie / Cookie ヘッダーが cross-origin リクエストにも乗る
 * （バックの CORS は credentials: true / origin allowlist 済み）。
 */
function withCreds(init?: RequestInit): RequestInit {
  return { credentials: 'include', ...init };
}

// 401時に自動でトークンリフレッシュしてリトライ
async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, withCreds(init));
  if (res.status === 401 && _refreshTokenFn) {
    const newToken = await _refreshTokenFn();
    if (newToken) {
      const newInit = withCreds({
        ...init,
        headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), Authorization: `Bearer ${newToken}` },
      });
      return fetch(url, newInit);
    }
  }
  return res;
}

export async function fetchRestaurants() {
  const res = await fetchWithRetry(`${BASE}/restaurants`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to fetch restaurants');
  return res.json();
}

export async function fetchFollowingRestaurants() {
  const res = await fetchWithRetry(`${BASE}/restaurants/following`, { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

export async function putRestaurant(restaurant: Record<string, unknown>) {
  const res = await fetchWithRetry(`${BASE}/restaurants/${restaurant.id}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(restaurant),
  });
  if (!res.ok) throw new Error('Failed to save restaurant');
}

export async function deleteRestaurant(id: string) {
  const res = await fetchWithRetry(`${BASE}/restaurants/${id}`, {
    method: 'DELETE', headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to delete restaurant');
}

export async function fetchRestaurantFeed(lat: number, lng: number, radius: number = 1000, limit = 50, offset = 0) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius: String(radius), limit: String(limit), offset: String(offset) });
  const res = await fetchWithRetry(`${BASE}/restaurants/feed?${params}`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to fetch restaurant feed');
  const data = await res.json();
  return Array.isArray(data) ? data : data.items;
}

/** ホーム画面の統計（登録店 / アクティブユーザー / 保存数）— 認証不要。
    バックエンドが DescribeTable.ItemCount を 5 分キャッシュで返す近似値。 */
export type PublicStats = {
  restaurants: number;
  users: number;
  stocks: number;
  approximate?: boolean;
};
export async function getPublicStats(): Promise<PublicStats> {
  try {
    const res = await fetchWithRetry(`${BASE}/stats/public`);
    if (!res.ok) throw new Error('stats/public failed');
    const data = await res.json();
    return {
      restaurants: Number(data.restaurants) || 0,
      users: Number(data.users) || 0,
      stocks: Number(data.stocks) || 0,
      approximate: !!data.approximate,
    };
  } catch {
    return { restaurants: 0, users: 0, stocks: 0, approximate: true };
  }
}

export async function fetchSettings() {
  const res = await fetchWithRetry(`${BASE}/settings`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function putSettings(settings: Record<string, unknown>) {
  const res = await fetchWithRetry(`${BASE}/settings`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to save settings');
}

// ─── ユーザー検索 ───

export async function searchUsers(query: string): Promise<{ userId: string; nickname: string }[]> {
  const res = await fetchWithRetry(`${BASE}/users/search?q=${encodeURIComponent(query)}`, { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

export async function getUserProfile(userId: string) {
  const res = await fetchWithRetry(`${BASE}/users/${userId}/profile`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}

// ─── ニックネーム変更 ───

export async function updateNickname(nickname: string): Promise<{ nickname: string }> {
  const res = await fetch(`${BASE}/auth/nickname`, {
    method: 'PUT', headers: headers(),
    body: JSON.stringify({ nickname }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'ニックネーム変更に失敗しました');
  return data;
}

// ─── メールアドレス変更 ───

export async function changeEmail(newEmail: string, currentPassword: string): Promise<{ email: string }> {
  const res = await fetch(`${BASE}/auth/email`, {
    method: 'PUT', headers: headers(),
    body: JSON.stringify({ newEmail, currentPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'メールアドレス変更に失敗しました');
  return data;
}

// ─── パスワード変更 ───

export async function changePassword(oldPassword: string, newPassword: string) {
  const res = await fetch(`${BASE}/auth/change-password`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'パスワード変更に失敗しました');
  return data;
}

// ─── アカウント削除 ───

export async function deleteAccount() {
  const res = await fetch(`${BASE}/auth/account`, {
    method: 'DELETE', headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to delete account');
}

// ─── プライバシー設定 ───

export async function getPrivacySettings(): Promise<{ isPrivate: boolean }> {
  const res = await fetch(`${BASE}/settings`, { headers: headers() });
  if (!res.ok) return { isPrivate: false };
  const data = await res.json();
  return { isPrivate: !!data.isPrivate };
}

export async function setPrivateAccount(isPrivate: boolean) {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PUT', headers: headers(),
    body: JSON.stringify({ isPrivate }),
  });
  if (!res.ok) throw new Error('Failed to update privacy');
}

// ─── フォロー ───

export async function followUser(targetId: string): Promise<{ pending: boolean }> {
  const res = await fetch(`${BASE}/follow/${targetId}`, {
    method: 'POST', headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to follow');
  return res.json();
}

export async function unfollowUser(targetId: string) {
  const res = await fetch(`${BASE}/follow/${targetId}`, {
    method: 'DELETE', headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to unfollow');
}

export async function getFollowing(): Promise<{ followeeId: string }[]> {
  const res = await fetchWithRetry(`${BASE}/following`, { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

export async function getFollowers(): Promise<{ followerId: string }[]> {
  const res = await fetch(`${BASE}/followers`, { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

// ─── フォローリクエスト ───

export async function getFollowRequests(): Promise<{ requesterId: string; createdAt: number }[]> {
  const res = await fetch(`${BASE}/follow-requests`, { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

export async function approveFollowRequest(requesterId: string) {
  const res = await fetch(`${BASE}/follow-requests/${requesterId}/approve`, {
    method: 'POST', headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to approve');
}

export async function rejectFollowRequest(requesterId: string) {
  const res = await fetch(`${BASE}/follow-requests/${requesterId}/reject`, {
    method: 'POST', headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to reject');
}

// ─── 通知 ───

export interface Notification {
  userId: string;
  createdAt: number;
  type: 'follow' | 'follow_request' | 'follow_accepted' | 'message_request' | 'message';
  fromUserId: string;
  fromNickname: string;
  read: boolean;
  content?: string;
}

export async function getNotifications(): Promise<Notification[]> {
  const res = await fetch(`${BASE}/notifications`, { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

export async function markNotificationsRead() {
  const res = await fetch(`${BASE}/notifications/read`, {
    method: 'POST', headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to mark read');
}

// ─── 写真アップロード ───

export async function getPresignedUploadUrl(contentType: string, filename: string): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  const res = await fetchWithRetry(`${BASE}/upload/presign`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ contentType, filename }),
  });
  if (!res.ok) throw new Error('プリサインドURL取得に失敗しました');
  return res.json();
}

export async function uploadPhoto(file: File): Promise<string> {
  const { uploadUrl, publicUrl } = await getPresignedUploadUrl(file.type, file.name);
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!uploadRes.ok) throw new Error('写真のアップロードに失敗しました');
  return publicUrl;
}

export async function deletePhoto(key: string) {
  const res = await fetchWithRetry(`${BASE}/upload/${encodeURIComponent(key)}`, {
    method: 'DELETE', headers: headers(),
  });
  if (!res.ok) throw new Error('写真の削除に失敗しました');
}

// ─── ランキング ───

export interface RankedUser {
  userId: string;
  totalStocks: number;
  nickname: string;
  profilePhotoUrl: string;
}

export async function getStockRanking(): Promise<RankedUser[]> {
  const res = await fetchWithRetry(`${BASE}/ranking`, { headers: headers() });
  // ゲスト時に 401 を投げると console error になり UX が悪い。
  // ランキングは public 表示なので、未認証/エラー時は空配列返却にとどめる。
  if (!res.ok) return [];
  return res.json();
}

// ─── 保存ランキング（お店別） ───

export interface RankedSpot {
  restaurantId: string;
  name: string;
  stockCount: number;
  photoUrls?: string[];
  genres?: string[];
  priceRange?: string;
  address?: string;
  postedBy?: string;
  // backend は RestaurantV2 をそのまま返してるので lat/lng も実は来てる。
  // モーダル「マップで見る」に必要なので型に追加。
  lat?: number;
  lng?: number;
}

export async function getSpotRanking(): Promise<RankedSpot[]> {
  const res = await fetchWithRetry(`${BASE}/ranking/spots`, { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

// ─── 特集記事（microCMS 経由） ───

export async function fetchFeaturesFromCMS(): Promise<unknown[]> {
  try {
    const res = await fetch(`${BASE}/features`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.contents) ? data.contents : [];
  } catch {
    return [];
  }
}

// ─── 統合検索 ───

export interface SearchResult {
  users: { userId: string; nickname: string }[];
  restaurants: {
    restaurantId: string;
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    genres?: string[];
    priceRange?: string;
    photoUrls?: string[];
    influencer?: string;
  }[];
  urlMatch: {
    restaurantId: string;
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    genres?: string[];
    priceRange?: string;
    photoUrls?: string[];
    influencer?: string;
  } | null;
}

export async function unifiedSearch(query: string): Promise<SearchResult> {
  const res = await fetchWithRetry(`${BASE}/search?q=${encodeURIComponent(query)}`, { headers: headers() });
  if (!res.ok) return { users: [], restaurants: [], urlMatch: null };
  return res.json();
}

export async function stockByUrl(url: string): Promise<{ ok: boolean; name?: string }> {
  const res = await fetchWithRetry(`${BASE}/restaurants/stock-by-url`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error('保存に失敗しました');
  return res.json();
}

// ─── ジャンル追加リクエスト ───

export async function requestGenre(genre: string) {
  const res = await fetchWithRetry(`${BASE}/genre-request`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ genre }),
  });
  if (!res.ok) throw new Error('リクエストに失敗しました');
  return res.json();
}

// ─── インフルエンサー ───

export async function getInfluencerProfile() {
  const res = await fetchWithRetry(`${BASE}/influencer/profile`, { headers: headers() });
  if (!res.ok) return null;
  return res.json();
}

export async function updateInfluencerProfile(data: { displayName: string; bio?: string; instagramHandle?: string; instagramUrl?: string; tiktokHandle?: string; tiktokUrl?: string; youtubeHandle?: string; youtubeUrl?: string; genres?: string[] }) {
  const res = await fetchWithRetry(`${BASE}/influencer/profile`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('プロフィール更新に失敗しました');
  return res.json();
}

export async function getInfluencerRestaurants() {
  const res = await fetchWithRetry(`${BASE}/influencer/restaurants`, { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

export async function putInfluencerRestaurant(id: string, data: Record<string, unknown>) {
  const res = await fetchWithRetry(`${BASE}/influencer/restaurants/${id}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('レストラン保存に失敗しました');
  return res.json();
}

export async function updateRestaurantVisibility(id: string, visibility: 'public' | 'mutual' | 'hidden') {
  const res = await fetchWithRetry(`${BASE}/influencer/restaurants/${id}/visibility`, {
    method: 'PATCH', headers: headers(), body: JSON.stringify({ visibility }),
  });
  if (!res.ok) throw new Error('公開設定の変更に失敗しました');
  return res.json();
}

export async function deleteInfluencerRestaurant(id: string) {
  const res = await fetchWithRetry(`${BASE}/influencer/restaurants/${id}`, {
    method: 'DELETE', headers: headers(),
  });
  if (!res.ok) throw new Error('レストラン削除に失敗しました');
}

export async function getPublicInfluencerProfile(id: string) {
  const res = await fetchWithRetry(`${BASE}/influencer/${id}/public`, { headers: headers() });
  if (!res.ok) throw new Error('プロフィール取得に失敗しました');
  return res.json();
}

export async function getPublicInfluencerRestaurants(id: string) {
  const res = await fetchWithRetry(`${BASE}/influencer/${id}/restaurants`, { headers: headers() });
  if (!res.ok) throw new Error('レストラン一覧取得に失敗しました');
  return res.json();
}

// ─── フィードバック / サポート ───

export type FeedbackCategory = 'bug' | 'feature' | 'support' | 'other';

export async function submitFeedback(payload: {
  message: string;
  category: FeedbackCategory;
  replyEmail?: string;
}) {
  const res = await fetchWithRetry(`${BASE}/feedback`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('フィードバック送信に失敗しました');
  return res.json().catch(() => ({}));
}

// ─── 管理: 投稿申請 (admin 用) ───

export interface AdminUploadApplication {
  userId: string;
  email?: string;
  nickname?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: number;
}

export async function adminFetchUploadApplications(token: string): Promise<AdminUploadApplication[]> {
  const adminBase = (import.meta.env.VITE_API_URL ?? '/api') + '/admin';
  const res = await fetch(`${adminBase}/upload-applications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return (data.items ?? data ?? []) as AdminUploadApplication[];
}

export async function adminApproveUploadApplication(token: string, userId: string) {
  const adminBase = (import.meta.env.VITE_API_URL ?? '/api') + '/admin';
  const res = await fetch(`${adminBase}/upload-applications/${userId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to approve');
}

export async function adminRejectUploadApplication(token: string, userId: string) {
  const adminBase = (import.meta.env.VITE_API_URL ?? '/api') + '/admin';
  const res = await fetch(`${adminBase}/upload-applications/${userId}/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to reject');
}

// ─── 投稿申請（multi-step ウィザード版） ───
// 旧フローを撤廃した後、management+申請フォームを再導入。
// `payload` は UploadApplicationWizard で集めた内容を丸ごと送る。

export type UploadApplicationStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface UploadApplicationDetail {
  reason?: string;
  regions?: string[];
  genres?: string[];
  sampleUrls?: string[];
  agreedAt?: number;
}

export interface UploadApplication {
  status: UploadApplicationStatus;
  application?: UploadApplicationDetail | null;
  appliedAt?: number | null;
}

export interface UploadApplicationPayload {
  reason: string;
  regions: string[];
  genres: string[];
  sampleUrls: string[];
  agreed: true;
}

export async function getUploadApplication(): Promise<UploadApplication> {
  const res = await fetchWithRetry(`${BASE}/influencer/upload-application`, { headers: headers() });
  if (!res.ok) return { status: 'none', application: null, appliedAt: null };
  const data = await res.json().catch(() => ({}));
  const status = (data?.status as UploadApplicationStatus | undefined) ?? 'none';
  return {
    status,
    application: (data?.application ?? null) as UploadApplicationDetail | null,
    appliedAt: typeof data?.appliedAt === 'number' ? data.appliedAt : null,
  };
}

export async function submitUploadApplication(payload: UploadApplicationPayload): Promise<UploadApplication> {
  const res = await fetchWithRetry(`${BASE}/influencer/upload-application`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && data.error) ? String(data.error) : '投稿申請の送信に失敗しました');
  }
  return {
    status: (data?.status as UploadApplicationStatus) ?? 'pending',
    application: (data?.application ?? null) as UploadApplicationDetail | null,
    appliedAt: typeof data?.appliedAt === 'number' ? data.appliedAt : null,
  };
}

