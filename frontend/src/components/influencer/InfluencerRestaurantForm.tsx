import { useState } from 'react';
import * as api from '../../utils/api';
import { PhotoUpload } from '../ui/PhotoUpload';

interface InfluencerRestaurant {
  influencerId: string;
  restaurantId: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  genre?: string;
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
  '~1,000円', '1,000~3,000円', '3,000~5,000円', '5,000~10,000円', '10,000円~',
];

interface Props {
  editing?: InfluencerRestaurant;
  onSaved: () => void;
  onClose: () => void;
}

export function InfluencerRestaurantForm({ editing, onSaved, onClose }: Props) {
  const [name, setName] = useState(editing?.name ?? '');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [lat, setLat] = useState(editing?.lat?.toString() ?? '');
  const [lng, setLng] = useState(editing?.lng?.toString() ?? '');
  const [genre, setGenre] = useState(editing?.genre ?? '');
  const [priceRange, setPriceRange] = useState(editing?.priceRange ?? '');
  const [photoUrls, setPhotoUrls] = useState<string[]>(editing?.photoUrls ?? []);
  const [videoUrl, setVideoUrl] = useState(editing?.videoUrl ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
    };
    if (address.trim()) data.address = address.trim();
    if (lat) data.lat = parseFloat(lat);
    if (lng) data.lng = parseFloat(lng);
    if (genre) data.genre = genre;
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
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-900">
            {editing ? 'レストラン編集' : 'レストラン追加'}
          </h2>
          <button onClick={onClose} className="text-gray-400 p-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">店名 *</label>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={100}
              className="w-full rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm"
              autoFocus />
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">住所</label>
            <input value={address} onChange={e => setAddress(e.target.value)} maxLength={200}
              className="w-full rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm" />
          </div>

          {/* Lat/Lng */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">緯度</label>
              <input value={lat} onChange={e => setLat(e.target.value)} type="text" placeholder="35.6812"
                className="w-full rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">経度</label>
              <input value={lng} onChange={e => setLng(e.target.value)} type="text" placeholder="139.7671"
                className="w-full rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm" />
            </div>
          </div>

          {/* Genre */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">ジャンル</label>
            <select value={genre} onChange={e => setGenre(e.target.value)}
              className="w-full rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm">
              <option value="">選択してください</option>
              {GENRE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* Price Range */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">価格帯</label>
            <select value={priceRange} onChange={e => setPriceRange(e.target.value)}
              className="w-full rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm">
              <option value="">選択してください</option>
              {PRICE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
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
