import { SCENES, GENRES } from '../../data/mockRestaurants';

export const PRICE_RANGES = [
  { id: '~1000', label: '~\u00A51,000' },
  { id: '1000~3000', label: '\u00A51,000~3,000' },
  { id: '3000~5000', label: '\u00A53,000~5,000' },
  { id: '5000~', label: '\u00A55,000~' },
] as const;

export type PriceRangeId = (typeof PRICE_RANGES)[number]['id'];

interface Props {
  selectedScenes: string[];
  selectedGenres: string[];
  selectedPriceRanges?: string[];
  onScenesChange: (scenes: string[]) => void;
  onGenresChange: (genres: string[]) => void;
  onPriceRangesChange?: (priceRanges: string[]) => void;
  onClose: () => void;
  onApply?: () => void;
}

export function FilterOverlay({
  selectedScenes,
  selectedGenres,
  selectedPriceRanges = [],
  onScenesChange,
  onGenresChange,
  onPriceRangesChange,
  onClose,
  onApply,
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

  function togglePriceRange(id: string) {
    if (!onPriceRangesChange) return;
    onPriceRangesChange(
      selectedPriceRanges.includes(id)
        ? selectedPriceRanges.filter((p) => p !== id)
        : [...selectedPriceRanges, id],
    );
  }

  function clearAll() {
    onScenesChange([]);
    onGenresChange([]);
    onPriceRangesChange?.([]);
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
        <div className="flex flex-wrap gap-2 mb-8">
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

        {/* Price Range */}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">価格帯</h3>
        <div className="flex flex-wrap gap-2 mb-6">
          {PRICE_RANGES.map((p) => (
            <button
              key={p.id}
              onClick={() => togglePriceRange(p.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                selectedPriceRanges.includes(p.id)
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p.label}
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
          onClick={onApply ?? onClose}
          className="flex-[2] py-3 rounded-xl bg-gray-900 text-white text-sm font-medium"
        >
          この条件で探す
        </button>
      </div>
    </div>
  );
}
