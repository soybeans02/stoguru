import { useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { filterRestaurants, type FilterOptions } from '../../utils/filters';
import { RestaurantCard } from './RestaurantCard';
import type { Restaurant } from '../../types/restaurant';

interface Props {
  onEdit: (r: Restaurant) => void;
  onDetail: (r: Restaurant) => void;
  onReview: (r: Restaurant) => void;
  onJumpToMap?: (lat: number, lng: number) => void;
}

export function RestaurantList({ onEdit, onDetail, onReview, onJumpToMap }: Props) {
  const { state } = useRestaurantContext();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<FilterOptions['status']>('all');

  const filters: FilterOptions = { query, categoryIds: [], influencerIds: [], status };
  const filtered = filterRestaurants(state.restaurants, filters);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 bg-white border-b space-y-2 sticky top-14 z-10">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="お店を検索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'wishlist', 'reviewed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors ${status === s ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {s === 'all' ? '全て' : s === 'wishlist' ? '行きたい' : 'レビュー済'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <SlidersHorizontal size={40} className="opacity-30" />
            <p className="text-sm">お店が見つかりません</p>
          </div>
        ) : (
          filtered.map((r) => (
            <RestaurantCard key={r.id} restaurant={r} onEdit={onEdit} onDetail={onDetail} onReview={onReview} onJumpToMap={onJumpToMap} />
          ))
        )}
      </div>
    </div>
  );
}
