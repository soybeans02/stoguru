import { SCENES, GENRES } from '../../data/mockRestaurants';

interface Props {
  selectedScenes: string[];
  selectedGenres: string[];
  onScenesChange: (scenes: string[]) => void;
  onGenresChange: (genres: string[]) => void;
  onClose: () => void;
}

export function FilterOverlay({
  selectedScenes,
  selectedGenres,
  onScenesChange,
  onGenresChange,
  onClose,
}: Props) {
  function toggleScene(id: string) {
    onScenesChange(
      selectedScenes.includes(id)
        ? selectedScenes.filter((s) => s !== id)
        : [...selectedScenes, id],
    );
  }

  function toggleGenre(g: string) {
    onGenresChange(
      selectedGenres.includes(g)
        ? selectedGenres.filter((x) => x !== g)
        : [...selectedGenres, g],
    );
  }

  function clearAll() {
    onScenesChange([]);
    onGenresChange([]);
  }

  return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="text-base font-bold text-gray-900">絞り込み</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {/* Scene */}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">シーン</h3>
        <div className="grid grid-cols-2 gap-2 mb-8">
          {SCENES.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleScene(s.id)}
              className={`rounded-xl py-3.5 text-center text-sm font-medium transition-all ${
                selectedScenes.includes(s.id)
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Genre */}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">ジャンル</h3>
        <div className="flex flex-wrap gap-2 mb-6">
          {GENRES.map((g) => (
            <button
              key={g}
              onClick={() => toggleGenre(g)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                selectedGenres.includes(g)
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
        <button
          onClick={clearAll}
          className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium"
        >
          クリア
        </button>
        <button
          onClick={onClose}
          className="flex-[2] py-3 rounded-xl bg-gray-900 text-white text-sm font-medium"
        >
          この条件で探す
        </button>
      </div>
    </div>
  );
}
