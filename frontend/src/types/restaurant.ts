export type RestaurantStatus = 'wishlist' | 'visited';

export interface Influencer {
  id: string;
  name: string;
  instagramHandle?: string;
  tiktokHandle?: string;
  color: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface SourceVideo {
  url: string;
  platform: 'tiktok' | 'instagram' | 'other';
  influencerId?: string;
  title?: string;
}

export interface PrivateReview {
  text: string;
  rating: number;
  reviewedAt: string;
}

export interface Restaurant {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  categoryIds: string[];
  influencerIds: string[];
  sourceVideos: SourceVideo[];
  notes: string;
  review: PrivateReview | null;
  status: RestaurantStatus;
  visitedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  restaurants: Restaurant[];
  categories: Category[];
  influencers: Influencer[];
}

export type AppAction =
  | { type: 'ADD_RESTAURANT'; payload: Restaurant }
  | { type: 'UPDATE_RESTAURANT'; payload: Restaurant }
  | { type: 'DELETE_RESTAURANT'; payload: { id: string } }
  | { type: 'CHECKIN'; payload: { id: string; visitedAt: string } }
  | { type: 'WRITE_REVIEW'; payload: { id: string; review: PrivateReview } }
  | { type: 'ADD_CATEGORY'; payload: Category }
  | { type: 'UPDATE_CATEGORY'; payload: Category }
  | { type: 'DELETE_CATEGORY'; payload: { id: string } }
  | { type: 'ADD_INFLUENCER'; payload: Influencer }
  | { type: 'UPDATE_INFLUENCER'; payload: Influencer }
  | { type: 'DELETE_INFLUENCER'; payload: { id: string } }
  | { type: 'REORDER_INFLUENCERS'; payload: Influencer[] }
  | { type: 'LOAD_STATE'; payload: AppState };
