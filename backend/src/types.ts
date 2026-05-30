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
  // ─── Phase 7 (動画 + メニュー) ───
  /// CloudFlare Stream の HLS playback URL (= アプリ内 AVPlayer ネイティブ再生用)
  stoguruVideoUrl?: string;
  /// 手打ちで登録された料理一覧
  menus?: MenuItem[];
  /// メニュー表 / 看板の写真 (最大 5 枚)
  menuPhotoUrls?: string[];
  // ─── 品質シグナル (Good/Bad → シャドウバン) ───
  /// 👍 (この店良い) の累計
  goodCount?: number;
  /// 👎 (興味なし/微妙) の累計
  badCount?: number;
  /// シャドウバン中か (= bad 率が高くフィード露出を絞られている)
  shadowBanned?: boolean;
}

/// 料理 1 件 (= クリエイターが手打ちで登録するメニュー)
export interface MenuItem {
  id: string;
  name: string;
  price?: number;          // 円 (税込)
  photoUrl?: string;
  description?: string;
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
  /// 旧 `uploadStatus` / `uploadApplication` フィールドはインフルエンサー登録
  /// 制度の撤廃に伴い廃止。DynamoDB に既存レコードが残っていても無視される
  /// （getUserSettings は型外フィールドをそのまま落として返す）。
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

export type NotificationType = 'follow' | 'follow_request' | 'follow_accepted';

export interface Notification {
  userId: string;
  createdAt: number;
  type: NotificationType;
  fromUserId: string;
  fromNickname: string;
  read: boolean;
}
