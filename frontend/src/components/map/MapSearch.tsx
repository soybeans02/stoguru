import { useRef, useState, useEffect, type MutableRefObject } from 'react';
import { Autocomplete } from '@react-google-maps/api';
import { Search, X, Plus } from 'lucide-react';
import { useRestaurantContext } from '../../context/RestaurantContext';
import type { Restaurant } from '../../types/restaurant';

interface Props {
  mapRef: MutableRefObject<google.maps.Map | null>;
  onSelect: (r: Restaurant) => void;
  onQuickAdd: (name: string, lat: number, lng: number) => void;
}

const COUNTRY_OPTIONS = [
  { code: null, label: 'ALL', icon: '⊘' },
  { code: 'jp', label: '日本', icon: '🇯🇵' },
  { code: 'us', label: 'アメリカ', icon: '🇺🇸' },
  { code: 'kr', label: '韓国', icon: '🇰🇷' },
  { code: 'tw', label: '台湾', icon: '🇹🇼' },
  { code: 'th', label: 'タイ', icon: '🇹🇭' },
  { code: 'it', label: 'イタリア', icon: '🇮🇹' },
  { code: 'fr', label: 'フランス', icon: '🇫🇷' },
  { code: 'gb', label: 'イギリス', icon: '🇬🇧' },
  { code: 'cn', label: '中国', icon: '🇨🇳' },
  { code: 'au', label: 'オーストラリア', icon: '🇦🇺' },
] as const;

export function MapSearch({ mapRef, onSelect, onQuickAdd }: Props) {
  const { state } = useRestaurantContext();
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [query, setQuery] = useState('');
  const [pendingPlace, setPendingPlace] = useState<{
    name: string; lat: number; lng: number;
  } | null>(null);
  const [countryFilter, setCountryFilter] = useState<string | null>('jp');
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  const currentCountry = COUNTRY_OPTIONS.find((c) => c.code === countryFilter) ?? COUNTRY_OPTIONS[0];

  // 国フィルター変更時にAutocompleteの制限を更新
  useEffect(() => {
    if (autocompleteRef.current) {
      if (countryFilter) {
        autocompleteRef.current.setComponentRestrictions({ country: countryFilter });
      } else {
        autocompleteRef.current.setComponentRestrictions({ country: [] });
      }
    }
  }, [countryFilter]);

  function onPlaceChanged() {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.geometry?.location) return;

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    const name = place.name ?? '';

    setQuery(name);
    setPendingPlace(null);

    if (mapRef.current) {
      mapRef.current.panTo({ lat, lng });
      mapRef.current.setZoom(17);
    }

    const saved = state.restaurants.find(
      (r) => r.name.toLowerCase() === name.toLowerCase(),
    );
    if (saved) {
      onSelect(saved);
    } else {
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
            onLoad={(ac) => {
              autocompleteRef.current = ac;
              if (countryFilter) {
                ac.setComponentRestrictions({ country: countryFilter });
              }
            }}
            onPlaceChanged={onPlaceChanged}
            options={countryFilter
              ? { types: ['establishment', 'geocode'], componentRestrictions: { country: countryFilter } }
              : { types: ['establishment', 'geocode'] }
            }
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
          <button onClick={clear} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X size={15} />
          </button>
        )}

        {/* 国フィルターボタン */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowCountryPicker(!showCountryPicker)}
            className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-base transition-colors border border-gray-200"
            title={currentCountry.label}
          >
            {currentCountry.icon}
          </button>

          {showCountryPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowCountryPicker(false)} />
              <div className="absolute right-0 top-10 z-50 bg-white rounded-xl shadow-lg border border-gray-200 py-1 min-w-[140px] max-h-[300px] overflow-y-auto">
                {COUNTRY_OPTIONS.map((opt) => (
                  <button
                    key={opt.code ?? 'all'}
                    onClick={() => { setCountryFilter(opt.code); setShowCountryPicker(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                      countryFilter === opt.code ? 'bg-orange-50 text-orange-600 font-medium' : 'text-gray-700'
                    }`}
                  >
                    <span className="text-base">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
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
