import { useState } from 'react';
import { Search, SlidersHorizontal, Link2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { filterRestaurants, type FilterOptions } from '../../utils/filters';
import { RestaurantCard } from './RestaurantCard';
import type { Restaurant, SourceVideo } from '../../types/restaurant';

interface Props {
  onEdit: (r: Restaurant) => void;
  onDetail: (r: Restaurant) => void;
  onReview: (r: Restaurant) => void;
  onJumpToMap?: (lat: number, lng: number) => void;
}

export function RestaurantList({ onEdit, onDetail, onReview, onJumpToMap }: Props) {
  const { state, dispatch } = useRestaurantContext();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<FilterOptions['status']>('all');

  // URL抽出
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [urlSuccess, setUrlSuccess] = useState('');

  async function handleExtract() {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      setUrlError('URLはhttps://で始まるものを入力してください');
      return;
    }
    setLoadingUrl(true);
    setUrlError('');
    setUrlSuccess('');
    try {
      const res = await fetch((import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api') + '/extract-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken') ?? ''}`,
        },
        body: JSON.stringify({ url: trimmed, caption: caption.trim() || undefined }),
      });
      const data = await res.json() as {
        error?: string;
        restaurantName?: string | null;
        address?: string | null;
        lat?: number | null;
        lng?: number | null;
        platform?: string;
        videoTitle?: string | null;
        influencerHandle?: string | null;
      };
      if (data.error) {
        setUrlError(data.error);
      } else {
        const now = new Date().toISOString();
        const video: SourceVideo | undefined = trimmed ? {
          url: trimmed,
          platform: (data.platform as SourceVideo['platform']) ?? 'other',
          title: data.videoTitle ?? undefined,
        } : undefined;

        // インフルエンサー自動マッチ
        const matchedInfIds: string[] = [];
        if (data.influencerHandle) {
          const found = state.influencers.find(
            (i) => i.tiktokHandle === data.influencerHandle || i.instagramHandle === data.influencerHandle,
          );
          if (found) matchedInfIds.push(found.id);
        }

        const r: Restaurant = {
          id: crypto.randomUUID(),
          name: data.restaurantName?.trim() || '名前未取得',
          address: data.address?.trim() || '',
          lat: data.lat ?? null,
          lng: data.lng ?? null,
          categoryIds: [],
          influencerIds: matchedInfIds,
          sourceVideos: video ? [video] : [],
          notes: '',
          landmarkMemo: '',
          review: null,
          status: 'wishlist',
          visitedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        dispatch({ type: 'ADD_RESTAURANT', payload: r });
        setUrlSuccess(`「${r.name}」を追加しました！`);
        setUrl('');
        setCaption('');
        setTimeout(() => setUrlSuccess(''), 3000);
      }
    } catch {
      setUrlError('抽出に失敗しました。バックエンドが起動していますか？');
    } finally {
      setLoadingUrl(false);
    }
  }

  const filters: FilterOptions = { query, categoryIds: [], influencerIds: [], status };
  const filtered = filterRestaurants(state.restaurants, filters);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 bg-white border-b space-y-2 sticky top-[104px] z-10">
        {/* URL抽出セクション */}
        <button
          onClick={() => setUrlOpen(!urlOpen)}
          className="w-full flex items-center justify-between px-3 py-2 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100 rounded-lg text-sm font-medium text-purple-700 hover:from-purple-100 hover:to-blue-100 transition-colors"
        >
          <span className="flex items-center gap-1.5"><Link2 size={14} /> URLから自動追加</span>
          {urlOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {urlOpen && (
          <div className="space-y-2 bg-gray-50 rounded-lg p-3">
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="TikTok / Instagram のURL"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setUrlError(''); setUrlSuccess(''); }}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
              <button
                onClick={handleExtract}
                disabled={loadingUrl || !url.trim()}
                className="shrink-0 px-3 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1"
              >
                {loadingUrl ? <Loader2 size={14} className="animate-spin" /> : '抽出'}
              </button>
            </div>
            <textarea
              placeholder="投稿のキャプションを貼り付けると精度UP（任意）"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
            />
            {urlError && <p className="text-xs text-red-500">{urlError}</p>}
            {urlSuccess && <p className="text-xs text-green-600">{urlSuccess}</p>}
          </div>
        )}

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
