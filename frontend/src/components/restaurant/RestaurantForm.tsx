import { useState, useEffect } from 'react';
import type { Restaurant, SourceVideo } from '../../types/restaurant';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';

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
  const [landmarkMemo, setLandmarkMemo] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (r) {
      setName(r.name); setAddress(r.address); setNotes(r.notes);
      setLandmarkMemo(r.landmarkMemo ?? '');
      setSelectedCats(r.categoryIds); setSelectedInfs(r.influencerIds);
      setVideoUrl(r.sourceVideos[0]?.url ?? '');
    } else {
      setName(''); setAddress(''); setNotes(''); setLandmarkMemo('');
      setSelectedCats([]); setSelectedInfs([]); setVideoUrl('');
    }
    setErrors({});
  }, [r]);

  function toggleCat(id: string) {
    setSelectedCats((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  }
  function toggleInf(id: string) {
    setSelectedInfs((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = '店名は必須です';
    else if (name.trim().length > 100) e.name = '店名は100文字以内にしてください';
    if (address.trim().length > 200) e.address = '住所は200文字以内にしてください';
    if (videoUrl.trim() && !/^https?:\/\/.+/.test(videoUrl.trim())) e.videoUrl = '有効なURLを入力してください';
    if (notes.trim().length > 1000) e.notes = 'メモは1000文字以内にしてください';
    if (landmarkMemo.trim().length > 200) e.landmarkMemo = '目印は200文字以内にしてください';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function save() {
    if (!validate()) return;
    const now = new Date().toISOString();
    const sourceVideos: SourceVideo[] = videoUrl.trim()
      ? [{ url: videoUrl.trim(), platform: videoUrl.includes('tiktok') ? 'tiktok' : videoUrl.includes('instagram') ? 'instagram' : 'other' }]
      : (r ? r.sourceVideos : []);

    if (r && r.id) {
      dispatch({
        type: 'UPDATE_RESTAURANT',
        payload: { ...r, name: name.trim(), address: address.trim(), notes: notes.trim(), landmarkMemo: landmarkMemo.trim() || undefined, categoryIds: selectedCats, influencerIds: selectedInfs, sourceVideos, updatedAt: now },
      });
    } else {
      const restaurant: Restaurant = {
        id: crypto.randomUUID(), name: name.trim(), address: address.trim(),
        lat: r?.lat ?? null, lng: r?.lng ?? null, categoryIds: selectedCats, influencerIds: selectedInfs,
        sourceVideos, notes: notes.trim(), landmarkMemo: landmarkMemo.trim() || undefined, review: null, status: 'wishlist',
        visitedAt: null, createdAt: now, updatedAt: now,
      };
      dispatch({ type: 'ADD_RESTAURANT', payload: restaurant });
    }
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={r ? 'お店を編集' : 'お店を追加'}>
      <div className="space-y-3">
        <div>
          <Input label="店名 *" value={name} onChange={(e) => setName(e.target.value)} />
          {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
        </div>
        <div>
          <Input label="住所" value={address} onChange={(e) => setAddress(e.target.value)} />
          {errors.address && <p className="text-xs text-red-500 mt-0.5">{errors.address}</p>}
        </div>
        <div>
          <Input label="動画URL（任意）" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
          {errors.videoUrl && <p className="text-xs text-red-500 mt-0.5">{errors.videoUrl}</p>}
        </div>
        <div>
          <Textarea label="メモ" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          {errors.notes && <p className="text-xs text-red-500 mt-0.5">{errors.notes}</p>}
        </div>
        <div>
          <Input label="目印" value={landmarkMemo} onChange={(e) => setLandmarkMemo(e.target.value)} placeholder="例: 3番出口直進、ビル6階" />
          {errors.landmarkMemo && <p className="text-xs text-red-500 mt-0.5">{errors.landmarkMemo}</p>}
        </div>

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

        <div className="flex gap-2 pt-2">
          <Button variant="primary" onClick={save} disabled={!name.trim()} className="flex-1">保存</Button>
          <Button variant="ghost" onClick={onClose}>キャンセル</Button>
        </div>
      </div>
    </Modal>
  );
}
