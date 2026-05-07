import { useState, useRef, useCallback } from 'react';
import * as api from '../../utils/api';
import { PhotoUpload } from '../ui/PhotoUpload';
import { loadGoogleMapsPlaces, createPlacesSessionToken } from '../../utils/googleMaps';

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
  instagramUrl?: string;
  tiktokUrl?: string;
  youtubeUrl?: string;
  urls?: string[];
  description?: string;
  visibility?: 'public' | 'mutual' | 'hidden';
  createdAt: number;
  updatedAt: number;
}

const GENRE_OPTIONS = [
  'ラーメン', '焼肉', '寿司', 'カフェ', '居酒屋',
  'イタリアン', 'カレー', 'ハンバーガー', '中華', '韓国料理',
  'スイーツ', 'パン', 'うどん', '和食', 'フレンチ',
  'そば', '天ぷら', 'とんかつ', 'お好み焼き', 'たこ焼き',
  'ステーキ', 'タイ料理', 'ベトナム料理', 'メキシカン',
  'インド料理', 'バー',
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

function urlIcon(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('tiktok.com')) return '🎵';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return '▶️';
  return '🔗';
}

export function InfluencerRestaurantForm({ editing, onSaved, onClose }: Props) {
  const [name, setName] = useState(editing?.name ?? '');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [lat, setLat] = useState<number | undefined>(editing?.lat);
  const [lng, setLng] = useState<number | undefined>(editing?.lng);
  const [placeId, setPlaceId] = useState(editing?.placeId ?? '');
  const [genres, setGenres] = useState<string[]>(editing?.genres ?? []);
  const [priceMin, setPriceMin] = useState(() => {
    const p = editing?.priceRange ?? '';
    const nums = p.match(/\d[\d,]*/g)?.map(s => parseInt(s.replace(/,/g, ''))) ?? [];
    return nums[0] || 0;
  });
  const [priceMax, setPriceMax] = useState(() => {
    const p = editing?.priceRange ?? '';
    const nums = p.match(/\d[\d,]*/g)?.map(s => parseInt(s.replace(/,/g, ''))) ?? [];
    if (p.includes('~') && nums.length === 1 && !p.startsWith('~')) return 10000;
    return nums[1] || nums[0] || 10000;
  });
  const [photoUrls, setPhotoUrls] = useState<string[]>(editing?.photoUrls ?? []);
  const [urls, setUrls] = useState<string[]>(() => {
    if (editing?.urls?.length) return editing.urls;
    const migrated = [editing?.instagramUrl, editing?.tiktokUrl, editing?.youtubeUrl, editing?.videoUrl].filter(Boolean) as string[];
    return migrated.length ? migrated : [''];
  });
  const [description, setDescription] = useState(editing?.description ?? '');
  const [visibility, setVisibility] = useState<'public' | 'mutual' | 'hidden'>(editing?.visibility ?? 'public');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Google Places Autocomplete — フォーム上部の店名 input が初めて focus された
  // 時にだけ SDK をロード（モーダル開いただけで Maps JS をダウンロードしないように）。
  // sessionToken を渡して per-keystroke 課金 → per-session 課金に。
  const [query, setQuery] = useState(editing?.name ?? '');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const placesDiv = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function ensureMapsLoaded() {
    if (autocompleteService.current) return;
    const g = await loadGoogleMapsPlaces();
    if (!g?.maps?.places) return;
    autocompleteService.current = new g.maps.places.AutocompleteService();
    if (placesDiv.current) {
      placesService.current = new g.maps.places.PlacesService(placesDiv.current);
    }
  }
  function startNewPlacesSession() {
    sessionTokenRef.current = createPlacesSessionToken();
  }

  const searchPlaces = useCallback((input: string) => {
    if (!autocompleteService.current || input.length < 2) {
      setPredictions([]);
      return;
    }
    if (!sessionTokenRef.current) sessionTokenRef.current = createPlacesSessionToken();
    autocompleteService.current.getPlacePredictions(
      {
        input,
        types: ['establishment'],
        componentRestrictions: { country: 'jp' },
        sessionToken: sessionTokenRef.current ?? undefined,
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
    const token = sessionTokenRef.current;
    placesService.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['geometry', 'formatted_address', 'name'],
        sessionToken: token ?? undefined,
      },
      (place, status) => {
        // session 終了 — 次の検索開始時に再生成
        sessionTokenRef.current = null;
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
    if (priceMin > 0 || priceMax < 10000) {
      const minStr = priceMin > 0 ? `¥${priceMin.toLocaleString()}` : '';
      const maxStr = priceMax < 10000 ? `¥${priceMax.toLocaleString()}` : '';
      data.priceRange = minStr && maxStr ? `${minStr}〜${maxStr}` : minStr ? `${minStr}〜` : `〜${maxStr}`;
    }
    const filteredUrls = urls.map(u => u.trim()).filter(Boolean);
    if (filteredUrls.length) data.urls = filteredUrls;
    if (description.trim()) data.description = description.trim();
    data.visibility = visibility;

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
              onFocus={async () => {
                // 店名 input フォーカス時に Maps SDK を遅延ロード + セッション開始
                await ensureMapsLoaded();
                if (!sessionTokenRef.current) startNewPlacesSession();
                if (predictions.length > 0) setShowPredictions(true);
              }}
              onBlur={() => setTimeout(() => setShowPredictions(false), 200)}
              maxLength={100}
              placeholder="店名を検索..."
              className="w-full rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm"
              autoFocus
            />
            {showPredictions && predictions.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[240px] overflow-y-auto">
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
              <button
                type="button"
                onClick={async () => {
                  const name = prompt('追加したいジャンル名を入力してください');
                  if (!name?.trim()) return;
                  try {
                    const { requestGenre } = await import('../../utils/api');
                    await requestGenre(name.trim());
                    alert('リクエストを送信しました！');
                  } catch {
                    alert('送信に失敗しました');
                  }
                }}
                className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
              >
                + 追加依頼
              </button>
            </div>
          </div>

          {/* Price Range (free input) */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">価格帯</label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-gray-400 mb-1 block">下限</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">¥</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={priceMin || ''}
                    onChange={(e) => setPriceMin(parseInt(e.target.value) || 0)}
                    onKeyDown={(e) => {
                      if (!/^[0-9]$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) e.preventDefault();
                    }}
                    placeholder="0"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-7 pr-3 py-2.5 text-sm text-gray-700"
                  />
                </div>
              </div>
              <span className="text-gray-300 mt-4">〜</span>
              <div className="flex-1">
                <label className="text-[10px] text-gray-400 mb-1 block">上限</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">¥</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={priceMax >= 10000 ? '' : priceMax || ''}
                    onChange={(e) => setPriceMax(parseInt(e.target.value) || 10000)}
                    onKeyDown={(e) => {
                      if (!/^[0-9]$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) e.preventDefault();
                    }}
                    placeholder="上限なし"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-7 pr-3 py-2.5 text-sm text-gray-700"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Photos */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">写真（最大5枚）</label>
            <PhotoUpload photos={photoUrls} onChange={setPhotoUrls} maxPhotos={5} />
          </div>

          {/* URLs */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              動画リンク
              {urls.filter(u => u.trim()).length > 1 && (
                <span className="ml-1.5 text-[10px] text-gray-400">★ がカード/マップに表示されます</span>
              )}
            </label>
            <div className="flex flex-col gap-2">
              {urls.map((url, i) => {
                const isPrimary = i === 0;
                const hasMultiple = urls.filter(u => u.trim()).length > 1;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-base w-5 text-center flex-shrink-0">{urlIcon(url)}</span>
                    <input
                      value={url}
                      onChange={e => { const next = [...urls]; next[i] = e.target.value; setUrls(next); }}
                      maxLength={500}
                      placeholder="https://..."
                      className="flex-1 rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm"
                    />
                    {/* メイン表示マーカー。複数 URL ある時だけ操作可能。
                        星クリックで該当 URL を配列先頭に移動 → backend は urls[0]
                        を videoUrl として配信する。 */}
                    {hasMultiple && url.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isPrimary) return;
                          const next = [...urls];
                          const [picked] = next.splice(i, 1);
                          next.unshift(picked);
                          setUrls(next);
                        }}
                        title={isPrimary ? 'カード/マップに表示中' : 'メインに設定'}
                        aria-label={isPrimary ? 'メイン表示' : 'メインに設定'}
                        className={`flex-shrink-0 w-7 h-7 rounded-full grid place-items-center transition-colors ${
                          isPrimary
                            ? 'text-amber-500'
                            : 'text-gray-300 hover:text-amber-400 hover:bg-amber-50'
                        }`}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill={isPrimary ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                      </button>
                    )}
                    {urls.length > 1 && (
                      <button type="button" onClick={() => setUrls(urls.filter((_, j) => j !== i))}
                        className="text-red-400 hover:text-red-600 text-lg flex-shrink-0">−</button>
                    )}
                  </div>
                );
              })}
              {urls.length < 20 && (
                <button type="button" onClick={() => setUrls([...urls, ''])}
                  className="flex items-center gap-1 text-blue-500 hover:text-blue-700 text-sm font-medium py-1">
                  <span className="text-lg">+</span> URLを追加
                </button>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">説明</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} rows={3}
              className="w-full rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm resize-none" />
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">公開範囲</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setVisibility('public')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${visibility === 'public' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                公開
              </button>
              <button type="button" onClick={() => setVisibility('mutual')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${visibility === 'mutual' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                相互のみ
              </button>
              <button type="button" onClick={() => setVisibility('hidden')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${visibility === 'hidden' ? 'bg-gray-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                非表示
              </button>
            </div>
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
