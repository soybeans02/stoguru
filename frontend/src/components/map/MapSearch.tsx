import { useRef, useState, type MutableRefObject } from 'react';
import { Autocomplete } from '@react-google-maps/api';
import { Search, X, Plus } from 'lucide-react';
import { useRestaurantContext } from '../../context/RestaurantContext';
import type { Restaurant } from '../../types/restaurant';

interface Props {
  mapRef: MutableRefObject<google.maps.Map | null>;
  onSelect: (r: Restaurant) => void;
  onQuickAdd: (name: string, lat: number, lng: number) => void;
}

export function MapSearch({ mapRef, onSelect, onQuickAdd }: Props) {
  const { state } = useRestaurantContext();
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [query, setQuery] = useState('');
  const [pendingPlace, setPendingPlace] = useState<{
    name: string; lat: number; lng: number;
  } | null>(null);

  function onPlaceChanged() {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.geometry?.location) return;

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    const name = place.name ?? '';

    setQuery(name);
    setPendingPlace(null);

    // マップをその場所へ移動
    if (mapRef.current) {
      mapRef.current.panTo({ lat, lng });
      mapRef.current.setZoom(17);
    }

    // 保存済みのお店と名前が一致するか確認
    const saved = state.restaurants.find(
      (r) => r.name.toLowerCase() === name.toLowerCase(),
    );
    if (saved) {
      onSelect(saved);
    } else {
      // 未登録なら「追加」バナーを表示
      setPendingPlace({ name, lat, lng });
    }
  }

  function handleAdd() {
    if (!pendingPlace) return;
    onQuickAdd(pendingPlace.name, pendingPlace.lat, pendingPlace.lng);
    setPendingPlace(null);
    setQuery('');
  }

  function clear() {
    setQuery('');
    setPendingPlace(null);
  }

  return (
    <div className="space-y-1">
      <div className="relative bg-white rounded-xl shadow-md border border-gray-100 flex items-center px-3 py-2 gap-2">
        <Search size={15} className="text-gray-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <Autocomplete
            onLoad={(ac) => { autocompleteRef.current = ac; }}
            onPlaceChanged={onPlaceChanged}
            options={{ types: ['establishment', 'geocode'] }}
          >
            <input
              type="text"
              placeholder="お店・場所を検索..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPendingPlace(null); }}
              className="w-full text-sm outline-none bg-transparent"
            />
          </Autocomplete>
        </div>
        {query && (
          <button onClick={clear} className="text-gray-400 hover:text-gray-600 shrink-0 ml-auto">
            <X size={15} />
          </button>
        )}
      </div>

      {/* 未登録のお店が見つかった場合の追加バナー */}
      {pendingPlace && (
        <div className="bg-white rounded-xl shadow-md border border-red-100 px-4 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{pendingPlace.name}</p>
            <p className="text-xs text-gray-400">リストに未登録です</p>
          </div>
          <button
            onClick={handleAdd}
            className="shrink-0 flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={12} /> 追加
          </button>
        </div>
      )}
    </div>
  );
}
