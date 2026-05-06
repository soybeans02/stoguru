// ─── DynamoDB Item Interfaces ───

// ─── V2: 正規化されたレストランマスター ───

export interface RestaurantV2 {
  restaurantId: string;        // PK
  name: string;
  nameLower: string;           // 検索用（小文字）
  address?: string;
  lat?: number;
  lng?: number;
  geohash?: string;            // GSI-Geohash PK用（precision 6）
  geohash4?: string;           // GSI-Geohash PK（precision 4、粗いパーティション）
  genres: string[];
  scene?: string[];
  priceRange?: string;
  photoUrls: string[];
  urls: string[];              // 全動画/SNS URL
  description?: string;
  postedBy: string;            // 投稿者のuserId
  visibility: 'public' | 'mutual' | 'hidden' | 'private';
  stockCount: number;          // 保存された回数（アトミックカウンター）
  createdAt: number;
  updatedAt: number;
}

// ─── V2: ユーザー⇔レストランの紐付け ───

export interface UserStock {
  userId: string;              // PK
  restaurantId: string;        // SK
  pinned?: boolean;
  notes?: string;
  landmarkMemo?: string;
  review?: { text: string; rating?: number; reviewedAt?: string } | null;
  status: 'wishlist' | 'visited';
  visitedAt?: string | null;
  photoEmoji?: string;
  createdAt: string;
  updatedAt: number;
}

// ─── URL逆引きインデックス ───

export interface UrlIndexEntry {
  normalizedUrl: string;       // PK
  restaurantId: string;
}

// ─── レガシー（既存テーブル用、マイグレーション中に使用） ───

export interface Restaurant {
  userId: string;
  restaurantId: string;
  id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  genre?: string;
  scene?: string[];
  priceRange?: string;
  distance?: string;
  influencer?: { name: string; handle: string; platform: string };
  videoUrl?: string;
  photoEmoji?: string;
  photoUrls?: string[];
  pinned?: boolean;
  categoryIds?: string[];
  influencerIds?: string[];
  sourceVideos?: { url: string; platform: string }[];
  genreTags?: string[];
  notes?: string;
  landmarkMemo?: string;
  review?: { text: string; rating?: number; reviewedAt?: string } | null;
  status?: string;
  visitedAt?: string | null;
  createdAt?: string;
  updatedAt: number;
}

export interface UserSettings {
  userId: string;
  influencers: string[];
  categories: string[];
  isPrivate?: boolean;
  /// 投稿許可ステータス（管理者が承認した時のみ public 投稿可能）。
  /// 旧 `role: 'user' | 'influencer'` は uploadStatus に置き換え済み。
  /// 'none' = 申請未提出 / 'pending' = 申請中 / 'approved' = 承認済 / 'rejected' = 却下
  uploadStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  uploadAppliedAt?: number;
  /// 申請フォームの内容（管理者が審査時に見る）。複数ステップで集めた情報を
  /// 1 オブジェクトに格納。詳細は POST /influencer/upload-application のスキーマ参照。
  uploadApplication?: {
    reason?: string;            // 投稿したい動機・自己紹介
    regions?: string[];         // 活動エリア（最大 5）
    genres?: string[];          // 得意ジャンル（最大 5）
    sampleUrls?: string[];      // SNS / 動画サンプル URL（最大 5）
    agreedAt?: number;          // ガイドライン同意タイムスタンプ
  };
  profilePhotoUrl?: string;
  updatedAt?: number;
}

export interface Follow {
  followerId: string;
  followeeId: string;
  createdAt: number;
}

export interface FollowRequest {
  targetId: string;
  requesterId: string;
  createdAt: number;
}

export interface InfluencerProfile {
  influencerId: string;
  displayName: string;
  bio?: string;
  instagramHandle?: string;
  instagramUrl?: string;
  tiktokHandle?: string;
  tiktokUrl?: string;
  youtubeHandle?: string;
  youtubeUrl?: string;
  platform?: 'instagram' | 'tiktok' | 'youtube';
  profilePhotoUrl?: string;
  genres: string[];
  isVerified: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface InfluencerRestaurant {
  influencerId: string;
  restaurantId: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  genres: string[];
  priceRange?: string;
  photoUrls: string[];
  videoUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  youtubeUrl?: string;
  urls?: string[];
  description?: string;
  visibility?: 'public' | 'mutual' | 'hidden' | 'private';
  createdAt: number;
  updatedAt: number;
}

export type NotificationType = 'follow' | 'follow_request' | 'follow_accepted';

export interface Notification {
  userId: string;
  createdAt: number;
  type: NotificationType;
  fromUserId: string;
  fromNickname: string;
  read: boolean;
}
