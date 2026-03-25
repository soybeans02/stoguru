import type { Restaurant } from '../types/restaurant';

export interface FilterOptions {
  query: string;
  categoryIds: string[];
  influencerIds: string[];
  status: 'all' | 'wishlist' | 'visited' | 'reviewed';
}

export function filterRestaurants(list: Restaurant[], opts: FilterOptions): Restaurant[] {
  return list.filter((r) => {
    if (opts.query) {
      const q = opts.query.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.address.toLowerCase().includes(q) && !r.notes.toLowerCase().includes(q)) return false;
    }
    if (opts.categoryIds.length > 0 && !opts.categoryIds.some((id) => r.categoryIds.includes(id))) return false;
    if (opts.influencerIds.length > 0 && !opts.influencerIds.some((id) => r.influencerIds.includes(id))) return false;
    if (opts.status === 'wishlist' && r.status !== 'wishlist') return false;
    if (opts.status === 'visited' && r.status !== 'visited') return false;
    if (opts.status === 'reviewed' && !r.review) return false;
    return true;
  });
}
