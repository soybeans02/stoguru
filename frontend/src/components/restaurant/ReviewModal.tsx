import { useState } from 'react';
import type { Restaurant, PrivateReview } from '../../types/restaurant';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { Modal } from '../ui/Modal';
import { Textarea } from '../ui/Textarea';
import { StarRating } from '../ui/StarRating';
import { Button } from '../ui/Button';

interface Props {
  restaurant: Restaurant | null;
  onClose: () => void;
}

export function ReviewModal({ restaurant: r, onClose }: Props) {
  const { dispatch } = useRestaurantContext();
  const [rating, setRating] = useState(r?.review?.rating ?? 0);
  const [text, setText] = useState(r?.review?.text ?? '');

  if (!r) return null;

  function save() {
    if (!r) return;
    const review: PrivateReview = { text, rating, reviewedAt: new Date().toISOString() };
    dispatch({ type: 'WRITE_REVIEW', payload: { id: r.id, review } });
    onClose();
  }

  return (
    <Modal isOpen={!!r} onClose={onClose} title={`${r.name} のレビュー`}>
      <div className="space-y-4">
        <p className="text-xs text-gray-500">このレビューはあなただけが見られます</p>
        <div>
          <p className="text-sm font-medium text-gray-700 mb-1">評価</p>
          <StarRating value={rating} onChange={setRating} size={24} />
        </div>
        <Textarea
          label="感想"
          placeholder="どうだった？（任意）"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
        />
        <p className="text-xs text-amber-600">💡 保存するとマップのピンが薄緑に変わります</p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={save} className="flex-1">保存してピンを薄緑に</Button>
          <Button variant="ghost" onClick={onClose}>キャンセル</Button>
        </div>
      </div>
    </Modal>
  );
}
