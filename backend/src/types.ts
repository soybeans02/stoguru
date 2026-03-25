// ─── DynamoDB Item Interfaces ───

export interface Restaurant {
  userId: string;
  restaurantId: string;
  id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  status?: string;
  review?: string;
  updatedAt: number;
  [key: string]: unknown; // allow additional fields from client
}

export interface UserSettings {
  userId: string;
  influencers: string[];
  categories: string[];
  isPrivate?: boolean;
  updatedAt?: number;
  [key: string]: unknown;
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
