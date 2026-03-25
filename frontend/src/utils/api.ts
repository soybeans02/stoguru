const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

function getToken() {
  return localStorage.getItem('accessToken');
}

function headers(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

export async function fetchRestaurants() {
  const res = await fetch(`${BASE}/restaurants`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to fetch restaurants');
  return res.json();
}

export async function putRestaurant(restaurant: Record<string, unknown>) {
  const res = await fetch(`${BASE}/restaurants/${restaurant.id}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(restaurant),
  });
  if (!res.ok) throw new Error('Failed to save restaurant');
}

export async function deleteRestaurant(id: string) {
  const res = await fetch(`${BASE}/restaurants/${id}`, {
    method: 'DELETE', headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to delete restaurant');
}

export async function syncAllRestaurants(restaurants: Record<string, unknown>[]) {
  const res = await fetch(`${BASE}/restaurants/sync`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ restaurants }),
  });
  if (!res.ok) throw new Error('Failed to sync restaurants');
  return res.json();
}

export async function fetchSettings() {
  const res = await fetch(`${BASE}/settings`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function putSettings(settings: Record<string, unknown>) {
  const res = await fetch(`${BASE}/settings`, {
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

export async function getMessagesWithUser(targetId: string, skipRead = false): Promise<{ messages: Message[]; status: string | null; requestedBy?: string }> {
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

// ─── シェア ───

export interface ShareItem {
  userId: string;
  shareId: string;
  restaurantName: string;
  restaurantAddress?: string;
  lat?: number;
  lng?: number;
  comment?: string;
  createdAt: number;
  userNickname: string;
}

export async function createSharePost(data: {
  restaurantName: string;
  restaurantAddress?: string;
  lat?: number;
  lng?: number;
  comment?: string;
}): Promise<ShareItem> {
  const res = await fetch(`${BASE}/shares`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create share');
  return res.json();
}

export async function getSharesFeed(): Promise<ShareItem[]> {
  const res = await fetch(`${BASE}/shares/feed`, { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

export async function deleteSharePost(createdAt: number): Promise<void> {
  await fetch(`${BASE}/shares/${createdAt}`, {
    method: 'DELETE',
    headers: headers(),
  });
}
