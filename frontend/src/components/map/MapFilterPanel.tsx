import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { GENRE_TAGS } from '../../constants/genre';

interface Props {
  selectedGenres: string[];
  onGenresChange: (genres: string[]) => void;
}

export function MapFilterPanel({ selectedGenres, onGenresChange }: Props) {
  const [open, setOpen] = useState(false);
  const activeCount = selectedGenres.length;

  function toggleGenre(tag: string) {
    onGenresChange(
      selectedGenres.includes(tag)
        ? selectedGenres.filter((g) => g !== tag)
        : [...selectedGenres, tag]
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative shrink-0 bg-white rounded-xl shadow-md border p-2.5 transition-colors ${
          activeCount > 0 ? 'border-orange-300 bg-orange-50' : 'border-gray-100 hover:bg-gray-50'
        }`}
      >
        <SlidersHorizontal size={18} className={activeCount > 0 ? 'text-orange-500' : 'text-gray-500'} />
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-0" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl border z-10 overflow-hidden mt-1">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
              <p className="text-xs font-semibold text-gray-600">ジャンルで絞り込み</p>
              {activeCount > 0 && (
                <button
                  onClick={() => onGenresChange([])}
                  className="text-[10px] text-orange-500 hover:text-orange-600 font-medium"
                >
                  クリア
                </button>
              )}
            </div>
            <div className="p-2.5 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
              {GENRE_TAGS.map((tag) => {
                const active = selectedGenres.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleGenre(tag)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      active
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
