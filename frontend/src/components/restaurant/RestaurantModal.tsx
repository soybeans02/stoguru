import { MapPin, ExternalLink, CheckCircle2 } from 'lucide-react';
import type { Restaurant } from '../../types/restaurant';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { StarRating } from '../ui/StarRating';
import { CategoryBadge } from '../category/CategoryBadge';
import { InfluencerBadge } from '../influencer/InfluencerBadge';

interface Props {
  restaurant: Restaurant | null;
  onClose: () => void;
  onEdit: (r: Restaurant) => void;
  onReview: (r: Restaurant) => void;
}

export function RestaurantModal({ restaurant: r, onClose, onEdit, onReview }: Props) {
  const { state } = useRestaurantContext();
  if (!r) return null;

  const cats = state.categories.filter((c) => r.categoryIds.includes(c.id));
  const infs = state.influencers.filter((i) => r.influencerIds.includes(i.id));

  return (
    <Modal isOpen={!!r} onClose={onClose} title={r.name}>
      <div className="space-y-4">
        {r.address && (
          <p className="flex items-center gap-1.5 text-sm text-gray-600">
            <MapPin size={14} /> {r.address}
          </p>
        )}

        {(cats.length > 0 || infs.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {cats.map((c) => <CategoryBadge key={c.id} category={c} />)}
            {infs.map((i) => <InfluencerBadge key={i.id} influencer={i} />)}
          </div>
        )}

        {r.sourceVideos.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">参考動画</p>
            {r.sourceVideos.filter((v) => /^https?:\/\//i.test(v.url)).map((v, i) => (
              <a key={i} href={v.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-blue-500 hover:underline">
                <ExternalLink size={13} />
                {v.title ?? (v.platform === 'tiktok' ? 'TikTok' : 'Instagram')}
              </a>
            ))}
          </div>
        )}

        {r.landmarkMemo && (
          <div className="flex items-start gap-1.5">
            <MapPin size={14} className="text-orange-500 mt-0.5 shrink-0" />
            <p className="text-sm text-orange-700 bg-orange-50 rounded-lg px-3 py-2 flex-1">{r.landmarkMemo}</p>
          </div>
        )}

        {r.notes && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">メモ</p>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{r.notes}</p>
          </div>
        )}

        {r.review ? (
          <div className="bg-green-50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-green-500" />
              <span className="text-sm font-medium text-green-700">マイレビュー</span>
              <StarRating value={r.review.rating} size={14} />
            </div>
            {r.review.text && <p className="text-sm text-gray-700">{r.review.text}</p>}
            <p className="text-xs text-gray-400">{new Date(r.review.reviewedAt).toLocaleDateString('ja-JP')}</p>
          </div>
        ) : (
          <Button variant="primary" onClick={() => { onReview(r); onClose(); }} className="w-full">
            レビューを書く（ピンが薄緑に変わります）
          </Button>
        )}

        <div className="flex gap-2 pt-2 border-t">
          <Button variant="secondary" onClick={() => { onEdit(r); onClose(); }} className="flex-1">編集</Button>
          <Button variant="ghost" onClick={onClose} className="flex-1">閉じる</Button>
        </div>
      </div>
    </Modal>
  );
}
