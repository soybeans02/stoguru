import { useState, useEffect, useCallback } from 'react';
import * as api from '../../utils/api';
import { InfluencerRestaurantForm } from './InfluencerRestaurantForm';

interface InfluencerProfile {
  influencerId: string;
  displayName: string;
  bio?: string;
  instagramHandle?: string;
  tiktokHandle?: string;
  youtubeHandle?: string;
  profilePhotoUrl?: string;
  genres: string[];
  isVerified: boolean;
}

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
  description?: string;
  createdAt: number;
  updatedAt: number;
}

interface Props {
  onBack: () => void;
}

export function InfluencerDashboard({ onBack }: Props) {
  const [profile, setProfile] = useState<InfluencerProfile | null>(null);
  const [restaurants, setRestaurants] = useState<InfluencerRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [restaurantForm, setRestaurantForm] = useState<{ open: boolean; editing?: InfluencerRestaurant }>({ open: false });

  // Profile edit state
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [tiktokHandle, setTiktokHandle] = useState('');
  const [youtubeHandle, setYoutubeHandle] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [genreInput, setGenreInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([
        api.getInfluencerProfile(),
        api.getInfluencerRestaurants(),
      ]);
      setProfile(p);
      setRestaurants(r);
    } catch {
      setError('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function startEditProfile() {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setBio(profile.bio ?? '');
    setInstagramHandle(profile.instagramHandle ?? '');
    setTiktokHandle(profile.tiktokHandle ?? '');
    setYoutubeHandle(profile.youtubeHandle ?? '');
    setGenres(profile.genres ?? []);
    setEditingProfile(true);
  }

  async function handleSaveProfile() {
    setSaving(true);
    setError('');
    try {
      await api.updateInfluencerProfile({
        displayName,
        bio: bio || undefined,
        instagramHandle: instagramHandle || undefined,
        tiktokHandle: tiktokHandle || undefined,
        youtubeHandle: youtubeHandle || undefined,
        genres,
      });
      await loadData();
      setEditingProfile(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  function addGenre() {
    const g = genreInput.trim();
    if (g && !genres.includes(g) && genres.length < 10) {
      setGenres([...genres, g]);
      setGenreInput('');
    }
  }

  async function handleDeleteRestaurant(restaurantId: string) {
    if (!confirm('このレストランを削除しますか？')) return;
    try {
      await api.deleteInfluencerRestaurant(restaurantId);
      setRestaurants(restaurants.filter(r => r.restaurantId !== restaurantId));
    } catch {
      setError('削除に失敗しました');
    }
  }

  async function handleRestaurantSaved() {
    setRestaurantForm({ open: false });
    const r = await api.getInfluencerRestaurants();
    setRestaurants(r);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overscroll-none px-5 py-6 bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 className="text-lg font-bold text-gray-900">インフルエンサー管理</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
      )}

      {/* Profile Section */}
      {profile && !editingProfile && (
        <div className="mb-8 p-5 bg-gray-50 rounded-2xl">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                {profile.displayName}
                {profile.isVerified && (
                  <span className="text-blue-500 text-xs bg-blue-50 px-1.5 py-0.5 rounded-full">認証済み</span>
                )}
              </h2>
              {profile.bio && <p className="text-sm text-gray-500 mt-1">{profile.bio}</p>}
            </div>
            <button
              onClick={startEditProfile}
              className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-full text-gray-600 hover:bg-gray-100 transition-colors"
            >
              編集
            </button>
          </div>

          {/* Handles */}
          <div className="flex flex-wrap gap-2 mb-3">
            {profile.instagramHandle && (
              <span className="text-xs bg-white px-2.5 py-1 rounded-full text-pink-500 border border-pink-100">
                IG: @{profile.instagramHandle}
              </span>
            )}
            {profile.tiktokHandle && (
              <span className="text-xs bg-white px-2.5 py-1 rounded-full text-gray-700 border border-gray-200">
                TikTok: @{profile.tiktokHandle}
              </span>
            )}
            {profile.youtubeHandle && (
              <span className="text-xs bg-white px-2.5 py-1 rounded-full text-red-500 border border-red-100">
                YT: @{profile.youtubeHandle}
              </span>
            )}
          </div>

          {/* Genres */}
          {profile.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {profile.genres.map(g => (
                <span key={g} className="text-[11px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{g}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Profile Edit Form */}
      {editingProfile && (
        <div className="mb-8 p-5 bg-gray-50 rounded-2xl space-y-4">
          <h2 className="text-sm font-bold text-gray-900 mb-2">プロフィール編集</h2>

          <div>
            <label className="block text-xs text-gray-400 mb-1">表示名 *</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={50}
              className="w-full rounded-lg bg-white text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm" />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">自己紹介</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={500} rows={3}
              className="w-full rounded-lg bg-white text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm resize-none" />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Instagram</label>
              <input value={instagramHandle} onChange={e => setInstagramHandle(e.target.value)} maxLength={100} placeholder="username"
                className="w-full rounded-lg bg-white text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">TikTok</label>
              <input value={tiktokHandle} onChange={e => setTiktokHandle(e.target.value)} maxLength={100} placeholder="username"
                className="w-full rounded-lg bg-white text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">YouTube</label>
              <input value={youtubeHandle} onChange={e => setYoutubeHandle(e.target.value)} maxLength={100} placeholder="channel"
                className="w-full rounded-lg bg-white text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">ジャンル</label>
            <div className="flex gap-2 mb-2">
              <input value={genreInput} onChange={e => setGenreInput(e.target.value)} maxLength={50} placeholder="例: 和食"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGenre(); } }}
                className="flex-1 rounded-lg bg-white text-gray-900 px-3 py-2 outline-none border border-gray-200 focus:border-gray-400 text-sm" />
              <button type="button" onClick={addGenre} className="px-3 py-2 bg-gray-900 text-white text-sm rounded-lg">追加</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {genres.map(g => (
                <span key={g} className="text-[11px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                  {g}
                  <button type="button" onClick={() => setGenres(genres.filter(x => x !== g))} className="text-gray-400 hover:text-gray-600">x</button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={handleSaveProfile} disabled={saving || !displayName.trim()}
              className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? '...' : '保存'}
            </button>
            <button onClick={() => setEditingProfile(false)}
              className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Restaurants Section */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">おすすめレストラン</h2>
        <button
          onClick={() => setRestaurantForm({ open: true })}
          className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors"
        >
          + 追加
        </button>
      </div>

      {restaurants.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm mb-2">まだレストランがありません</p>
          <p className="text-gray-300 text-xs">おすすめのレストランを追加しましょう</p>
        </div>
      ) : (
        <div className="space-y-3">
          {restaurants.map(r => (
            <div key={r.restaurantId} className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-gray-900 truncate">{r.name}</h3>
                  {r.address && <p className="text-xs text-gray-400 mt-0.5 truncate">{r.address}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {r.genres?.map(g => <span key={g} className="text-[11px] bg-white text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">{g}</span>)}
                    {r.priceRange && <span className="text-[11px] bg-white text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">{r.priceRange}</span>}
                  </div>
                  {r.instagramUrl && (
                    <a href={r.instagramUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-xs text-pink-500 hover:text-pink-600">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                      Instagramで見る
                    </a>
                  )}
                  {r.description && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{r.description}</p>}
                </div>
                <div className="flex gap-1 ml-2 flex-shrink-0">
                  <button
                    onClick={() => setRestaurantForm({ open: true, editing: r })}
                    className="p-1.5 text-gray-400 hover:text-gray-600"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
                  </button>
                  <button
                    onClick={() => handleDeleteRestaurant(r.restaurantId)}
                    className="p-1.5 text-gray-400 hover:text-red-500"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>

              {/* Photos */}
              {r.photoUrls && r.photoUrls.length > 0 && (
                <div className="flex gap-2 mt-3 overflow-x-auto">
                  {r.photoUrls.map((url, i) => (
                    <img key={i} src={url} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Restaurant Form Modal */}
      {restaurantForm.open && (
        <InfluencerRestaurantForm
          editing={restaurantForm.editing}
          onSaved={handleRestaurantSaved}
          onClose={() => setRestaurantForm({ open: false })}
        />
      )}
    </div>
  );
}
