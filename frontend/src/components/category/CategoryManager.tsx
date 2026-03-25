import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useRestaurantContext } from '../../context/RestaurantContext';
import type { Category } from '../../types/restaurant';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

const PRESET_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];

export function CategoryManager() {
  const { state, dispatch } = useRestaurantContext();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);

  function add() {
    if (!name.trim()) return;
    const cat: Category = { id: crypto.randomUUID(), name: name.trim(), color };
    dispatch({ type: 'ADD_CATEGORY', payload: cat });
    setName('');
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="カテゴリ名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="flex-1"
        />
        <div className="flex gap-1 items-center">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <Button variant="primary" onClick={add} size="sm">追加</Button>
      </div>
      <ul className="space-y-2">
        {state.categories.map((cat) => (
          <li key={cat.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color }} />
              <span className="text-sm">{cat.name}</span>
            </div>
            <button
              onClick={() => dispatch({ type: 'DELETE_CATEGORY', payload: { id: cat.id } })}
              className="text-gray-400 hover:text-red-500 p-1"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
        {state.categories.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-2">カテゴリなし</p>
        )}
      </ul>
    </div>
  );
}
