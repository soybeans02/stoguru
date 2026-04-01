import { useState, useMemo } from 'react';
import { Search, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { filterRestaurants, type FilterOptions } from '../../utils/filters';
import { GENRE_TAGS } from '../../constants/genre';
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
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [genreOpen, setGenreOpen] = useState(false);

  const filters: FilterOptions = { query, categoryIds: [], influencerIds: [], genreTags: selectedGenres, status };
  const filtered = useMemo(() => filterRestaurants(state.restaurants, filters), [state.restaurants, query, status, selectedGenres]);

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
        <button
          onClick={() => setGenreOpen((v) => !v)}
          className={`flex items-center gap-1 text-xs font-medium transition-colors ${
            selectedGenres.length > 0 ? 'text-orange-500' : 'text-gray-500'
          }`}
        >
          ジャンル{selectedGenres.length > 0 && ` (${selectedGenres.length})`}
          {genreOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {genreOpen && (
          <div className="flex flex-wrap gap-1">
            {selectedGenres.length > 0 && (
              <button onClick={() => setSelectedGenres([])} className="px-2 py-0.5 rounded-full text-[10px] bg-gray-200 text-gray-600">
                クリア
              </button>
            )}
            {GENRE_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedGenres((prev) =>
                  prev.includes(tag) ? prev.filter((g) => g !== tag) : [...prev, tag]
                )}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                  selectedGenres.includes(tag) ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
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
