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

export type NotificationType = 'follow' | 'follow_request' | 'follow_accepted' | 'message_request' | 'message';

export interface Notification {
  userId: string;
  createdAt: number;
  type: NotificationType;
  fromUserId: string;
  fromNickname: string;
  read: boolean;
}
