import { useState } from 'react';
import { MapPin, CheckCircle2, ExternalLink, Pencil, Trash2, Navigation, MapPinned } from 'lucide-react';
import type { Restaurant } from '../../types/restaurant';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { CategoryBadge } from '../category/CategoryBadge';
import { InfluencerBadge } from '../influencer/InfluencerBadge';
import { StarRating } from '../ui/StarRating';
import * as api from '../../utils/api';

interface Props {
  restaurant: Restaurant;
  onEdit: (r: Restaurant) => void;
  onDetail: (r: Restaurant) => void;
  onReview: (r: Restaurant) => void;
  onJumpToMap?: (lat: number, lng: number) => void;
}

export function RestaurantCard({ restaurant: r, onEdit, onDetail, onReview, onJumpToMap }: Props) {
  const { state, dispatch } = useRestaurantContext();
  const cats = state.categories.filter((c) => r.categoryIds.includes(c.id));
  const infs = state.influencers.filter((i) => r.influencerIds.includes(i.id));
  const isReviewed = !!r.review;

  const borderColor = isReviewed ? 'border-l-green-300' : 'border-l-red-400';
  const [shared, setShared] = useState(false);
  const [sharing, setSharing] = useState(false);

  async function handleShare() {
    if (sharing || shared) return;
    setSharing(true);
    try {
      await api.createSharePost({
        restaurantName: r.name,
        restaurantAddress: r.address || undefined,
        lat: r.lat ?? undefined,
        lng: r.lng ?? undefined,
        comment: 'ここ行きたい！',
      });
      setShared(true);
      setTimeout(() => setShared(false), 3000);
    } catch { /* ignore */ }
    setSharing(false);
  }

  function del() {
    if (confirm(`「${r.name}」を削除しますか？`)) {
      dispatch({ type: 'DELETE_RESTAURANT', payload: { id: r.id } });
    }
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 ${borderColor} p-4 space-y-2`}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => onDetail(r)} className="text-left flex-1">
          <h3 className="font-semibold text-gray-900 leading-tight">{r.name}</h3>
          {r.address && (
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
              <MapPin size={11} /> {r.address}
            </p>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit(r)} className="p-1 text-gray-400 hover:text-blue-500">
            <Pencil size={14} />
          </button>
          <button onClick={del} className="p-1 text-gray-400 hover:text-red-500">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {(cats.length > 0 || infs.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {cats.map((c) => <CategoryBadge key={c.id} category={c} />)}
          {infs.map((i) => <InfluencerBadge key={i.id} influencer={i} />)}
        </div>
      )}

      {r.review && <StarRating value={r.review.rating} size={14} />}

      {r.sourceVideos.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {r.sourceVideos.filter((v) => /^https?:\/\//i.test(v.url)).map((v, i) => (
            <a key={i} href={v.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline">
              <ExternalLink size={11} />
              {v.platform === 'tiktok' ? 'TikTok' : v.platform === 'instagram' ? 'Instagram' : 'URL'}
            </a>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        {isReviewed ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
            <CheckCircle2 size={12} /> レビュー済み
          </span>
        ) : (
          <button onClick={() => onReview(r)} className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium">
            <CheckCircle2 size={12} /> レビューを書く
          </button>
        )}
        {r.lat != null && r.lng != null && onJumpToMap && (
          <button
            onClick={() => onJumpToMap(r.lat!, r.lng!)}
            className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium"
          >
            <Navigation size={12} /> マップで見る
          </button>
        )}
        <button
          onClick={handleShare}
          disabled={sharing}
          className={`inline-flex items-center gap-1 text-xs font-medium ml-auto transition-colors ${
            shared ? 'text-green-500' : 'text-orange-500 hover:text-orange-600'
          }`}
        >
          <MapPinned size={12} /> {shared ? 'いこう！済み' : 'いこう'}
        </button>
      </div>
    </div>
  );
}
