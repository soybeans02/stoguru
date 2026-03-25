import { useState } from 'react';
import { Trash2, ExternalLink } from 'lucide-react';
import { useRestaurantContext } from '../../context/RestaurantContext';
import type { Influencer } from '../../types/restaurant';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

const PRESET_COLORS = ['#f43f5e','#8b5cf6','#06b6d4','#10b981','#f97316','#3b82f6','#ec4899'];

function profileUrl(inf: Influencer): string | null {
  if (inf.tiktokHandle) return `https://www.tiktok.com/@${inf.tiktokHandle}`;
  if (inf.instagramHandle) return `https://www.instagram.com/${inf.instagramHandle}`;
  return null;
}

export function InfluencerManager() {
  const { state, dispatch } = useRestaurantContext();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [platform, setPlatform] = useState<'instagram' | 'tiktok'>('tiktok');
  const [color, setColor] = useState(PRESET_COLORS[0]);

  function add() {
    if (!name.trim()) return;
    const inf: Influencer = {
      id: crypto.randomUUID(),
      name: name.trim(),
      color,
      ...(platform === 'instagram' ? { instagramHandle: handle.trim() } : { tiktokHandle: handle.trim() }),
    };
    dispatch({ type: 'ADD_INFLUENCER', payload: inf });
    setName(''); setHandle('');
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input placeholder="名前" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-2 items-center">
          <select
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as 'instagram' | 'tiktok')}
          >
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
          </select>
          <Input placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} className="flex-1" />
        </div>
        <div className="flex gap-2 items-center">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <Button variant="primary" onClick={add} size="sm" className="ml-auto">追加</Button>
        </div>
      </div>

      <ul className="space-y-2">
        {state.influencers.map((inf) => {
          const url = profileUrl(inf);
          return (
            <li key={inf.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: inf.color }} />
                <span className="text-sm font-medium truncate">{inf.name}</span>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-0.5 text-xs text-blue-500 hover:underline shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    @{inf.tiktokHandle ?? inf.instagramHandle}
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
              <button
                onClick={() => dispatch({ type: 'DELETE_INFLUENCER', payload: { id: inf.id } })}
                className="text-gray-400 hover:text-red-500 p-1 shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </li>
          );
        })}
        {state.influencers.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-2">インフルエンサーなし</p>
        )}
      </ul>
    </div>
  );
}
