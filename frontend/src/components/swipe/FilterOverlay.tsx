import { SCENES, GENRES, GENRE_EMOJI } from '../../data/mockRestaurants';

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
    <div className="absolute inset-0 z-50 bg-gray-900/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
        <h2 className="text-lg font-bold text-white">🎯 絞り込み</h2>
        <button onClick={onClose} className="text-orange-400 text-sm font-medium">
          ✕ 閉じる
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {/* Scene */}
        <h3 className="text-sm font-bold text-gray-400 mb-3">シーン</h3>
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          {SCENES.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleScene(s.id)}
              className={`rounded-xl py-4 text-center transition-all ${
                selectedScenes.includes(s.id)
                  ? 'bg-orange-500/20 border-2 border-orange-500'
                  : 'bg-gray-800 border-2 border-transparent'
              }`}
            >
              <span className="text-2xl block mb-1">{s.emoji}</span>
              <span className="text-xs font-bold text-gray-200">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Genre */}
        <h3 className="text-sm font-bold text-gray-400 mb-3">ジャンル</h3>
        <div className="flex flex-wrap gap-2 mb-6">
          {GENRES.map((g) => (
            <button
              key={g}
              onClick={() => toggleGenre(g)}
              className={`px-3.5 py-2 rounded-full text-xs font-medium transition-all ${
                selectedGenres.includes(g)
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-800 text-gray-300 border border-gray-600'
              }`}
            >
              {GENRE_EMOJI[g] ?? '🍽️'} {g}
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-700 flex gap-3">
        <button
          onClick={clearAll}
          className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-300 text-sm font-bold"
        >
          クリア
        </button>
        <button
          onClick={onClose}
          className="flex-2 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white text-sm font-bold"
        >
          この条件で探す
        </button>
      </div>
    </div>
  );
}
