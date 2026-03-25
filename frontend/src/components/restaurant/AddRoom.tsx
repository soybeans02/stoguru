import { useState, useEffect, useRef } from 'react';
import { Loader2, Link2 } from 'lucide-react';
import { Autocomplete, useLoadScript } from '@react-google-maps/api';
import { useRestaurantContext } from '../../context/RestaurantContext';
import type { Restaurant, SourceVideo } from '../../types/restaurant';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';

const LIBRARIES: ('places')[] = ['places'];

interface Props {
  prefill?: { name: string; lat: number; lng: number } | null;
  onPrefillConsumed?: () => void;
}

export function AddRoom({ prefill, onPrefillConsumed }: Props) {
  const { state, dispatch } = useRestaurantContext();
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
    libraries: LIBRARIES,
  });

  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [selectedInfs, setSelectedInfs] = useState<string[]>([]);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [savedVideo, setSavedVideo] = useState<SourceVideo | null>(null);
  const [saved, setSaved] = useState(false);

  const prefillLatLng = useRef<{ lat: number; lng: number } | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!prefill) return;
    setName(prefill.name);
    prefillLatLng.current = { lat: prefill.lat, lng: prefill.lng };
    onPrefillConsumed?.();
  }, [prefill]);

  // Google Places Autocomplete で店が選択されたとき
  function onPlaceSelected() {
    const place = autocompleteRef.current?.getPlace();
    if (!place) return;
    if (place.name) setName(place.name);
    if (place.formatted_address) setAddress(place.formatted_address);
    if (place.geometry?.location) {
      prefillLatLng.current = {
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      };
    }
  }

  async function fetchUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      setUrlError('URLはhttps://で始まるものを入力してください');
      return;
    }
    setLoadingUrl(true);
    setUrlError('');
    try {
      const res = await fetch((import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api') + '/extract-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), caption: caption.trim() || undefined }),
      });
      const data = await res.json() as {
        error?: string;
        restaurantName?: string | null;
        address?: string | null;
        platform?: string;
        videoTitle?: string | null;
        influencerHandle?: string | null;
      };
      if (data.error) {
        setUrlError(data.error);
      } else {
        if (data.restaurantName) setName(data.restaurantName);
        if (data.address) setAddress(data.address);
        setSavedVideo({
          url: url.trim(),
          platform: (data.platform as SourceVideo['platform']) ?? 'other',
          title: data.videoTitle ?? undefined,
        });
        if (data.influencerHandle) {
          const found = state.influencers.find(
            (i) => i.tiktokHandle === data.influencerHandle || i.instagramHandle === data.influencerHandle,
          );
          if (found && !selectedInfs.includes(found.id)) {
            setSelectedInfs((prev) => [...prev, found.id]);
          }
        }
      }
    } catch {
      setUrlError('バックエンドが起動していますか？');
    } finally {
      setLoadingUrl(false);
    }
  }

  function toggleCat(id: string) {
    setSelectedCats((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  }
  function toggleInf(id: string) {
    setSelectedInfs((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  }

  function save() {
    if (!name.trim()) return;
    const now = new Date().toISOString();
    const fromMap = prefillLatLng.current;
    prefillLatLng.current = null;

    const r: Restaurant = {
      id: crypto.randomUUID(),
      name: name.trim(),
      address: address.trim(),
      lat: fromMap?.lat ?? null,
      lng: fromMap?.lng ?? null,
      categoryIds: selectedCats,
      influencerIds: selectedInfs,
      sourceVideos: savedVideo ? [savedVideo] : [],
      notes: notes.trim(),
      review: null,
      status: 'wishlist',
      visitedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    // 座標が未取得の場合のみ Nominatim でジオコーディング
    if (address.trim() && !fromMap) {
      fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`, {
        headers: { 'User-Agent': 'RestaurantBookmark/1.0' },
      })
        .then((res) => res.json())
        .then((data: Array<{ lat: string; lon: string }>) => {
          if (data.length > 0) {
            dispatch({
              type: 'UPDATE_RESTAURANT',
              payload: { ...r, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) },
            });
          }
        })
        .catch(() => {});
    }

    dispatch({ type: 'ADD_RESTAURANT', payload: r });
    setUrl(''); setCaption(''); setName(''); setAddress(''); setNotes('');
    setSelectedCats([]); setSelectedInfs([]); setSavedVideo(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const nameInput = (
    <input
      type="text"
      placeholder="麺屋武蔵"
      value={name}
      onChange={(e) => setName(e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
    />
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">お店を追加</h2>

        {/* URL 入力 */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
            <Link2 size={14} /> 動画URL（TikTok / Instagram）
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://www.tiktok.com/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <Button variant="secondary" onClick={fetchUrl} disabled={loadingUrl || !url.trim()}>
              {loadingUrl ? <Loader2 size={14} className="animate-spin" /> : '自動入力'}
            </Button>
          </div>
          {urlError && <p className="text-xs text-red-500">{urlError}</p>}
          {savedVideo && <p className="text-xs text-green-600">✓ URLを紐付けました</p>}
          <Textarea
            label="説明文（TikTok/Instagramの投稿文をコピペ）"
            placeholder="投稿のキャプションを貼り付けると店名・住所を自動で読み取ります"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
          />
        </div>
      </div>

      <div className="h-px bg-gray-100" />

      <div className="space-y-3">
        {/* 店名 — Google Places Autocomplete */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            店名 *
            {isLoaded && (
              <span className="ml-1 text-xs font-normal text-gray-400">（Google Mapsと連携）</span>
            )}
          </label>
          {isLoaded ? (
            <Autocomplete
              onLoad={(ac) => { autocompleteRef.current = ac; }}
              onPlaceChanged={onPlaceSelected}
              options={{ types: ['restaurant', 'cafe', 'bar', 'food'], componentRestrictions: { country: 'jp' } }}
            >
              {nameInput}
            </Autocomplete>
          ) : (
            nameInput
          )}
        </div>

        <Textarea
          label="メモ（任意）"
          placeholder="気になる点など..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      {state.influencers.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">インフルエンサー</p>
          <div className="flex flex-wrap gap-2">
            {state.influencers.map((inf) => (
              <button
                key={inf.id}
                type="button"
                onClick={() => toggleInf(inf.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium border-2 transition-colors ${
                  selectedInfs.includes(inf.id) ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600'
                }`}
                style={selectedInfs.includes(inf.id) ? { backgroundColor: inf.color, borderColor: inf.color } : {}}
              >
                {inf.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.categories.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">カテゴリ</p>
          <div className="flex flex-wrap gap-2">
            {state.categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleCat(cat.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium border-2 transition-colors ${
                  selectedCats.includes(cat.id) ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600'
                }`}
                style={selectedCats.includes(cat.id) ? { backgroundColor: cat.color, borderColor: cat.color } : {}}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <Button
        variant="primary"
        onClick={save}
        disabled={!name.trim()}
        className="w-full"
      >
        {saved ? '✓ 追加しました！' : '保存（赤ピンで追加）'}
      </Button>
    </div>
  );
}
