// ─── DynamoDB Item Interfaces ───

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
  role?: 'user' | 'influencer';
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
  visibility?: 'public' | 'mutual' | 'hidden';
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
