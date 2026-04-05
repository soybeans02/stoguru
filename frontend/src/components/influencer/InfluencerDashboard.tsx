import { useState, useEffect, useCallback } from 'react';
import * as api from '../../utils/api';
import { InfluencerRestaurantForm } from './InfluencerRestaurantForm';

interface InfluencerProfile {
  influencerId: string;
  displayName: string;
  bio?: string;
  instagramHandle?: string;
  instagramUrl?: string;
  tiktokHandle?: string;
  tiktokUrl?: string;
  youtubeHandle?: string;
  youtubeUrl?: string;
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
  const [previewRestaurant, setPreviewRestaurant] = useState<InfluencerRestaurant | null>(null);

  // Profile edit state
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [tiktokHandle, setTiktokHandle] = useState('');
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [youtubeHandle, setYoutubeHandle] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
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
    setInstagramUrl(profile.instagramUrl ?? '');
    setTiktokHandle(profile.tiktokHandle ?? '');
    setTiktokUrl(profile.tiktokUrl ?? '');
    setYoutubeHandle(profile.youtubeHandle ?? '');
    setYoutubeUrl(profile.youtubeUrl ?? '');
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
        instagramUrl: instagramUrl || undefined,
        tiktokHandle: tiktokHandle || undefined,
        tiktokUrl: tiktokUrl || undefined,
        youtubeHandle: youtubeHandle || undefined,
        youtubeUrl: youtubeUrl || undefined,
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
              profile.instagramUrl ? (
                <a href={profile.instagramUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs bg-white px-2.5 py-1 rounded-full text-pink-500 border border-pink-100 hover:bg-pink-50 transition-colors">
                  ID: @{profile.instagramHandle}
                </a>
              ) : (
                <span className="text-xs bg-white px-2.5 py-1 rounded-full text-pink-500 border border-pink-100">
                  ID: @{profile.instagramHandle}
                </span>
              )
            )}
            {profile.tiktokHandle && (
              profile.tiktokUrl ? (
                <a href={profile.tiktokUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs bg-white px-2.5 py-1 rounded-full text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors">
                  TikTok: @{profile.tiktokHandle}
                </a>
              ) : (
                <span className="text-xs bg-white px-2.5 py-1 rounded-full text-gray-700 border border-gray-200">
                  TikTok: @{profile.tiktokHandle}
                </span>
              )
            )}
            {profile.youtubeHandle && (
              profile.youtubeUrl ? (
                <a href={profile.youtubeUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs bg-white px-2.5 py-1 rounded-full text-red-500 border border-red-100 hover:bg-red-50 transition-colors">
                  YT: @{profile.youtubeHandle}
                </a>
              ) : (
                <span className="text-xs bg-white px-2.5 py-1 rounded-full text-red-500 border border-red-100">
                  YT: @{profile.youtubeHandle}
                </span>
              )
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

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label className="block text-xs text-gray-400">Instagram</label>
              <input value={instagramHandle} onChange={e => setInstagramHandle(e.target.value)} maxLength={100} placeholder="表示名（例: suimy）"
                className="w-full rounded-lg bg-white text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm" />
              <input value={instagramUrl} onChange={e => setInstagramUrl(e.target.value)} maxLength={500} placeholder="https://www.instagram.com/suimy/"
                className="w-full rounded-lg bg-white text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm" />
            </div>
            <div className="space-y-2">
              <label className="block text-xs text-gray-400">TikTok</label>
              <input value={tiktokHandle} onChange={e => setTiktokHandle(e.target.value)} maxLength={100} placeholder="表示名（例: suimy）"
                className="w-full rounded-lg bg-white text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm" />
              <input value={tiktokUrl} onChange={e => setTiktokUrl(e.target.value)} maxLength={500} placeholder="https://www.tiktok.com/@suimy"
                className="w-full rounded-lg bg-white text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm" />
            </div>
            <div className="space-y-2">
              <label className="block text-xs text-gray-400">YouTube</label>
              <input value={youtubeHandle} onChange={e => setYoutubeHandle(e.target.value)} maxLength={100} placeholder="表示名（例: suimy）"
                className="w-full rounded-lg bg-white text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm" />
              <input value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} maxLength={500} placeholder="https://www.youtube.com/@suimy"
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
        <div className="grid grid-cols-3 gap-2">
          {restaurants.map(r => (
            <div key={r.restaurantId} className="bg-white rounded-xl overflow-hidden shadow border border-gray-100 flex flex-col">
              {/* Photo area — matches SwipeCard */}
              <div className="w-full aspect-square bg-gray-100 relative overflow-hidden">
                {r.photoUrls && r.photoUrls.length > 0 ? (
                  <img src={r.photoUrls[0]} alt={r.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-3xl opacity-30">🍽️</span>
                  </div>
                )}
                {/* Preview / Edit / Delete overlay */}
                <div className="absolute top-1 right-1 flex gap-1">
                  <button
                    onClick={() => setPreviewRestaurant(r)}
                    className="p-1 bg-white/80 backdrop-blur-sm rounded-full text-gray-600 hover:bg-white transition-colors"
                    title="プレビュー"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  <button
                    onClick={() => setRestaurantForm({ open: true, editing: r })}
                    className="p-1 bg-white/80 backdrop-blur-sm rounded-full text-gray-600 hover:bg-white transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
                  </button>
                  <button
                    onClick={() => handleDeleteRestaurant(r.restaurantId)}
                    className="p-1 bg-white/80 backdrop-blur-sm rounded-full text-gray-600 hover:text-red-500 hover:bg-white transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
                {r.photoUrls && r.photoUrls.length > 1 && (
                  <div className="absolute bottom-1 right-1 bg-black/60 text-white px-1.5 py-0.5 rounded-full text-[9px] backdrop-blur-sm">
                    +{r.photoUrls.length - 1}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="px-2 py-1.5">
                <h3 className="text-[11px] font-bold text-gray-900 truncate">{r.name}</h3>
                {r.priceRange && <p className="text-[10px] text-gray-400 truncate">{r.priceRange}</p>}
                {r.genres && r.genres.length > 0 && (
                  <div className="flex gap-0.5 flex-wrap mt-0.5">
                    {r.genres.slice(0, 2).map(g => (
                      <span key={g} className="bg-gray-100 text-gray-500 px-1 py-0 rounded text-[9px]">{g}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal — full-size SwipeCard style */}
      {previewRestaurant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPreviewRestaurant(null)}>
          <div className="relative w-full max-w-[320px] h-[460px]" onClick={e => e.stopPropagation()}>
            <div className="w-full h-full bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-100 flex flex-col">
              {/* Photo area */}
              <div className="w-full h-[68%] bg-gray-100 relative overflow-hidden flex-shrink-0">
                {previewRestaurant.photoUrls && previewRestaurant.photoUrls.length > 0 ? (
                  <img src={previewRestaurant.photoUrls[0]} alt={previewRestaurant.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-7xl opacity-30">🍽️</span>
                  </div>
                )}
                {profile && (
                  <a
                    href={profile.instagramUrl || profile.tiktokUrl || profile.youtubeUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-2 left-2 bg-black/60 text-white px-2.5 py-1 rounded-full text-[11px] backdrop-blur-sm"
                  >
                    @{profile.instagramHandle || profile.displayName}
                  </a>
                )}
                {(previewRestaurant.videoUrl || previewRestaurant.instagramUrl) && (
                  <a
                    href={previewRestaurant.videoUrl || previewRestaurant.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-2 right-2 bg-black/60 text-white w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                  </a>
                )}
                {/* Close button */}
                <button
                  onClick={() => setPreviewRestaurant(null)}
                  className="absolute top-2 right-2 p-1.5 bg-black/40 backdrop-blur-sm rounded-full text-white hover:bg-black/60 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
              {/* Info area */}
              <div className="px-4 py-3 flex-1 overflow-hidden">
                <h3 className="text-base font-bold text-gray-900 mb-0.5">{previewRestaurant.name}</h3>
                <p className="text-xs text-gray-400 mb-2.5">
                  {[previewRestaurant.address, previewRestaurant.priceRange].filter(Boolean).join(' · ')}
                </p>
                <div className="flex gap-1.5 flex-wrap mb-2.5">
                  {previewRestaurant.genres?.map(g => (
                    <span key={g} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[11px]">{g}</span>
                  ))}
                </div>
                {previewRestaurant.description && <p className="text-xs text-gray-500 mb-2 line-clamp-2">{previewRestaurant.description}</p>}
                {previewRestaurant.instagramUrl && (
                  <a href={previewRestaurant.instagramUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-pink-500 hover:text-pink-600 font-medium">
                    Instagramで見る →
                  </a>
                )}
              </div>
            </div>
          </div>
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
