import { useState, useRef, useEffect, useCallback } from 'react';
import * as api from '../../utils/api';
import { PhotoUpload } from '../ui/PhotoUpload';

interface InfluencerRestaurant {
  influencerId: string;
  restaurantId: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  genres?: string[];
  priceRange?: string;
  photoUrls: string[];
  videoUrl?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

const GENRE_OPTIONS = [
  '和食', '寿司', '焼肉', 'ラーメン', 'イタリアン', 'フレンチ',
  '中華', '韓国料理', 'カフェ', '居酒屋', 'バー', 'スイーツ', 'その他',
];

const PRICE_OPTIONS = [
  '~500円', '~1,000円', '~1,500円', '~2,000円', '~2,500円',
  '~3,000円', '~4,000円', '~5,000円', '~7,000円', '~10,000円', '10,000円~',
];

interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface Props {
  editing?: InfluencerRestaurant;
  onSaved: () => void;
  onClose: () => void;
}

export function InfluencerRestaurantForm({ editing, onSaved, onClose }: Props) {
  const [name, setName] = useState(editing?.name ?? '');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [lat, setLat] = useState<number | undefined>(editing?.lat);
  const [lng, setLng] = useState<number | undefined>(editing?.lng);
  const [placeId, setPlaceId] = useState(editing?.placeId ?? '');
  const [genres, setGenres] = useState<string[]>(editing?.genres ?? []);
  const [priceRange, setPriceRange] = useState(editing?.priceRange ?? '');
  const [photoUrls, setPhotoUrls] = useState<string[]>(editing?.photoUrls ?? []);
  const [videoUrl, setVideoUrl] = useState(editing?.videoUrl ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Google Places Autocomplete
  const [query, setQuery] = useState(editing?.name ?? '');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const placesDiv = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // Load Google Maps JS API
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    if (window.google?.maps?.places) {
      setMapsLoaded(true);
      return;
    }

    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      existing.addEventListener('load', () => setMapsLoaded(true));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=ja`;
    script.async = true;
    script.onload = () => setMapsLoaded(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!mapsLoaded || !window.google?.maps?.places) return;
    autocompleteService.current = new google.maps.places.AutocompleteService();
    if (placesDiv.current) {
      placesService.current = new google.maps.places.PlacesService(placesDiv.current);
    }
  }, [mapsLoaded]);

  const searchPlaces = useCallback((input: string) => {
    if (!autocompleteService.current || input.length < 2) {
      setPredictions([]);
      return;
    }
    autocompleteService.current.getPlacePredictions(
      {
        input,
        types: ['establishment'],
        componentRestrictions: { country: 'jp' },
      },
      (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          setPredictions(results.slice(0, 5));
          setShowPredictions(true);
        } else {
          setPredictions([]);
        }
      },
    );
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    setName(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => searchPlaces(value), 300);
  }

  function selectPlace(prediction: PlacePrediction) {
    setShowPredictions(false);
    setPredictions([]);
    setName(prediction.structured_formatting.main_text);
    setQuery(prediction.structured_formatting.main_text);
    setPlaceId(prediction.place_id);

    if (!placesService.current) return;
    placesService.current.getDetails(
      { placeId: prediction.place_id, fields: ['geometry', 'formatted_address', 'name'] },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place) {
          if (place.name) {
            setName(place.name);
            setQuery(place.name);
          }
          if (place.formatted_address) setAddress(place.formatted_address);
          if (place.geometry?.location) {
            setLat(place.geometry.location.lat());
            setLng(place.geometry.location.lng());
          }
        }
      },
    );
  }

  function toggleGenre(g: string) {
    setGenres(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : prev.length < 5 ? [...prev, g] : prev,
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('店名は必須です');
      return;
    }

    setSaving(true);
    setError('');

    const id = editing?.restaurantId ?? crypto.randomUUID();
    const data: Record<string, unknown> = {
      name: name.trim(),
      photoUrls,
      genres,
    };
    if (address.trim()) data.address = address.trim();
    if (lat !== undefined) data.lat = lat;
    if (lng !== undefined) data.lng = lng;
    if (placeId) data.placeId = placeId;
    if (priceRange) data.priceRange = priceRange;
    if (videoUrl.trim()) data.videoUrl = videoUrl.trim();
    if (description.trim()) data.description = description.trim();

    try {
      await api.putInfluencerRestaurant(id, data);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-white rounded-t-2xl px-5 pt-5 pb-8 animate-slide-up max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Hidden div for PlacesService */}
        <div ref={placesDiv} style={{ display: 'none' }} />

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-900">
            {editing ? 'レストラン編集' : 'レストラン追加'}
          </h2>
          <button onClick={onClose} className="text-gray-400 p-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Store Name with Places Autocomplete */}
          <div className="relative">
            <label className="block text-xs text-gray-400 mb-1">店名 *</label>
            <input
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              onFocus={() => predictions.length > 0 && setShowPredictions(true)}
              onBlur={() => setTimeout(() => setShowPredictions(false), 200)}
              maxLength={100}
              placeholder="店名を検索..."
              className="w-full rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm"
              autoFocus
            />
            {showPredictions && predictions.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {predictions.map(p => (
                  <button
                    key={p.place_id}
                    type="button"
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    onMouseDown={() => selectPlace(p)}
                  >
                    <div className="text-sm font-medium text-gray-900">
                      {p.structured_formatting.main_text}
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {p.structured_formatting.secondary_text}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Address (auto-filled, editable) */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">住所</label>
            <input value={address} onChange={e => setAddress(e.target.value)} maxLength={200}
              className="w-full rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm" />
          </div>

          {/* Genres (multi-select pills) */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">ジャンル（最大5つ）</label>
            <div className="flex flex-wrap gap-2">
              {GENRE_OPTIONS.map(g => {
                const selected = genres.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGenre(g)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } ${!selected && genres.length >= 5 ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price Range (500 yen increments) */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">価格帯</label>
            <div className="flex flex-wrap gap-2">
              {PRICE_OPTIONS.map(p => {
                const selected = priceRange === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriceRange(selected ? '' : p)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Photos */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">写真（最大10枚）</label>
            <PhotoUpload photos={photoUrls} onChange={setPhotoUrls} maxPhotos={10} />
          </div>

          {/* Video URL */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">動画URL</label>
            <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} maxLength={500}
              placeholder="https://..."
              className="w-full rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">説明</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} rows={3}
              className="w-full rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm resize-none" />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving || !name.trim()}
              className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? '...' : editing ? '更新' : '追加'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600">
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
