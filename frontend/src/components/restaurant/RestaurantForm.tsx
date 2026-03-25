import { useState, useEffect } from 'react';
import type { Restaurant, SourceVideo } from '../../types/restaurant';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import * as api from '../../utils/api';

interface Props {
  restaurant: Restaurant | null;
  isOpen: boolean;
  onClose: () => void;
}

export function RestaurantForm({ restaurant: r, isOpen, onClose }: Props) {
  const { state, dispatch } = useRestaurantContext();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [selectedInfs, setSelectedInfs] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [shouldShare, setShouldShare] = useState(false);
  const [shareComment, setShareComment] = useState('');

  useEffect(() => {
    if (r) {
      setName(r.name); setAddress(r.address); setNotes(r.notes);
      setSelectedCats(r.categoryIds); setSelectedInfs(r.influencerIds);
      setVideoUrl(r.sourceVideos[0]?.url ?? '');
    } else {
      setName(''); setAddress(''); setNotes('');
      setSelectedCats([]); setSelectedInfs([]); setVideoUrl('');
      setShouldShare(false); setShareComment('');
    }
  }, [r]);

  function toggleCat(id: string) {
    setSelectedCats((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  }
  function toggleInf(id: string) {
    setSelectedInfs((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  }

  function save() {
    if (!name.trim()) return;
    const now = new Date().toISOString();
    const sourceVideos: SourceVideo[] = videoUrl.trim()
      ? [{ url: videoUrl.trim(), platform: videoUrl.includes('tiktok') ? 'tiktok' : videoUrl.includes('instagram') ? 'instagram' : 'other' }]
      : (r ? r.sourceVideos : []);

    if (r && r.id) {
      dispatch({
        type: 'UPDATE_RESTAURANT',
        payload: { ...r, name: name.trim(), address: address.trim(), notes: notes.trim(), categoryIds: selectedCats, influencerIds: selectedInfs, sourceVideos, updatedAt: now },
      });
    } else {
      const restaurant: Restaurant = {
        id: crypto.randomUUID(), name: name.trim(), address: address.trim(),
        lat: r?.lat ?? null, lng: r?.lng ?? null, categoryIds: selectedCats, influencerIds: selectedInfs,
        sourceVideos, notes: notes.trim(), review: null, status: 'wishlist',
        visitedAt: null, createdAt: now, updatedAt: now,
      };
      dispatch({ type: 'ADD_RESTAURANT', payload: restaurant });
    }
    if (shouldShare) {
      api.createSharePost({
        restaurantName: name.trim(),
        restaurantAddress: address.trim() || undefined,
        lat: r?.lat ?? undefined,
        lng: r?.lng ?? undefined,
        comment: shareComment.trim() || 'ここ行きたい！',
      }).catch(() => {});
    }
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={r ? 'お店を編集' : 'お店を追加'}>
      <div className="space-y-3">
        <Input label="店名 *" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="住所" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input label="動画URL（任意）" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
        <Textarea label="メモ" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />

        {state.influencers.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">インフルエンサー</p>
            <div className="flex flex-wrap gap-1">
              {state.influencers.map((inf) => (
                <button key={inf.id} type="button" onClick={() => toggleInf(inf.id)}
                  className={`px-2 py-1 rounded-full text-xs border-2 transition-colors ${selectedInfs.includes(inf.id) ? 'text-white' : 'bg-white border-gray-200 text-gray-600'}`}
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
            <p className="text-sm font-medium text-gray-700 mb-1">カテゴリ</p>
            <div className="flex flex-wrap gap-1">
              {state.categories.map((cat) => (
                <button key={cat.id} type="button" onClick={() => toggleCat(cat.id)}
                  className={`px-2 py-1 rounded-full text-xs border-2 transition-colors ${selectedCats.includes(cat.id) ? 'text-white' : 'bg-white border-gray-200 text-gray-600'}`}
                  style={selectedCats.includes(cat.id) ? { backgroundColor: cat.color, borderColor: cat.color } : {}}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* シェアオプション */}
        <div className="border border-orange-200 rounded-lg p-3 bg-orange-50/50">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={shouldShare}
              onChange={(e) => setShouldShare(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
            />
            <span className="text-sm font-medium text-gray-700">フォロワーにシェアする</span>
          </label>
          {shouldShare && (
            <input
              type="text"
              value={shareComment}
              onChange={(e) => setShareComment(e.target.value)}
              placeholder="ここ行きたい！"
              className="mt-2 w-full px-3 py-1.5 text-sm border border-orange-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="primary" onClick={save} disabled={!name.trim()} className="flex-1">保存</Button>
          <Button variant="ghost" onClick={onClose}>キャンセル</Button>
        </div>
      </div>
    </Modal>
  );
}
