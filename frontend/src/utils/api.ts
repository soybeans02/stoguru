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
  const t = getToken();
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

// 401時に自動でトークンリフレッシュしてリトライ
async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401 && _refreshTokenFn) {
    const newToken = await _refreshTokenFn();
    if (newToken) {
      const newInit = { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), Authorization: `Bearer ${newToken}` } };
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

export async function fetchNearbyRestaurants(lat: number, lng: number, radius: number) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius: String(radius) });
  const res = await fetchWithRetry(`${BASE}/restaurants/nearby?${params}`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to fetch nearby restaurants');
  return res.json();
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
  const res = await fetch(`${BASE}/users/search?q=${encodeURIComponent(query)}`, { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

export async function getUserProfile(userId: string) {
  const res = await fetch(`${BASE}/users/${userId}/profile`, { headers: headers() });
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
  const res = await fetch(`${BASE}/following`, { headers: headers() });
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

// ─── メッセージ ───

export interface Conversation {
  pk: string;
  user1: string;
  user2: string;
  status: 'pending' | 'accepted' | 'rejected';
  requestedBy: string;
  lastMessage: string;
  lastMessageAt: number;
  user1LastRead?: number;
  user2LastRead?: number;
}

export interface Message {
  conversationId: string;
  createdAt: number;
  senderId: string;
  content: string;
  read: boolean;
}

export async function getConversations(): Promise<Conversation[]> {
  const res = await fetch(`${BASE}/conversations`, { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

export async function getMessagesWithUser(targetId: string, skipRead = false): Promise<{ messages: Message[]; status: string | null; requestedBy?: string; user1?: string; user2?: string; user1LastRead?: number; user2LastRead?: number }> {
  const url = skipRead ? `${BASE}/messages/${targetId}?skipRead=1` : `${BASE}/messages/${targetId}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) return { messages: [], status: null };
  return res.json();
}

export async function sendMessageTo(targetId: string, content: string) {
  const res = await fetch(`${BASE}/messages/${targetId}`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Failed to send message');
  return res.json();
}

export async function acceptMessageRequest(targetId: string) {
  const res = await fetch(`${BASE}/messages/${targetId}/accept`, {
    method: 'POST', headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to accept');
}

export async function rejectMessageRequest(targetId: string) {
  const res = await fetch(`${BASE}/messages/${targetId}/reject`, {
    method: 'POST', headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to reject');
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

// ─── インフルエンサー ───

export async function registerInfluencer(data: { displayName: string; bio?: string; instagramHandle?: string; instagramUrl?: string; tiktokHandle?: string; tiktokUrl?: string; youtubeHandle?: string; youtubeUrl?: string; genres?: string[] }) {
  const res = await fetchWithRetry(`${BASE}/influencer/register`, {
    method: 'POST', headers: headers(), body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'インフルエンサー登録に失敗しました' }));
    throw new Error(err.error || 'インフルエンサー登録に失敗しました');
  }
  return res.json();
}

export async function getInfluencerProfile() {
  const res = await fetchWithRetry(`${BASE}/influencer/profile`, { headers: headers() });
  if (!res.ok) throw new Error('プロフィール取得に失敗しました');
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
  if (!res.ok) throw new Error('レストラン一覧取得に失敗しました');
  return res.json();
}

export async function putInfluencerRestaurant(id: string, data: Record<string, unknown>) {
  const res = await fetchWithRetry(`${BASE}/influencer/restaurants/${id}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('レストラン保存に失敗しました');
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

