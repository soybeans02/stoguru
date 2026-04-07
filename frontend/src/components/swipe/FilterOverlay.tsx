import { SCENES, GENRES } from '../../data/mockRestaurants';

interface Props {
  selectedScenes: string[];
  selectedGenres: string[];
  priceMin?: number;
  priceMax?: number;
  onScenesChange: (scenes: string[]) => void;
  onGenresChange: (genres: string[]) => void;
  onPriceChange?: (min: number, max: number) => void;
  onClose: () => void;
  onApply?: () => void;
}

export function FilterOverlay({
  selectedScenes,
  selectedGenres,
  priceMin = 0,
  priceMax = 10000,
  onScenesChange,
  onGenresChange,
  onPriceChange,
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

  /** 数字以外の入力を防ぐ */
  function blockNonNumeric(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!/^[0-9]$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
      e.preventDefault();
    }
  }

  function handleMinChange(v: number) {
    if (!onPriceChange) return;
    onPriceChange(v, v > priceMax ? v : priceMax);
  }

  function handleMaxChange(v: number) {
    if (!onPriceChange) return;
    onPriceChange(v < priceMin ? v : priceMin, v);
  }

  function clearAll() {
    onScenesChange([]);
    onGenresChange([]);
    onPriceChange?.(0, 10000);
  }

  return (
    <div className="absolute inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-base font-bold text-gray-900 dark:text-white">絞り込み</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
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
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
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
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Price Range - free input */}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">価格帯</h3>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1">
            <label className="text-[10px] text-gray-400 mb-1 block">下限</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">¥</span>
              <input
                type="text"
                inputMode="numeric"
                value={priceMin || ''}
                onChange={(e) => handleMinChange(parseInt(e.target.value) || 0)}
                onKeyDown={blockNonNumeric}
                placeholder="0"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-7 pr-3 py-2.5 text-sm text-gray-700 dark:text-gray-200"
              />
            </div>
          </div>
          <span className="text-gray-300 dark:text-gray-600 mt-4">〜</span>
          <div className="flex-1">
            <label className="text-[10px] text-gray-400 mb-1 block">上限</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">¥</span>
              <input
                type="text"
                inputMode="numeric"
                value={priceMax >= 10000 ? '' : priceMax || ''}
                onChange={(e) => handleMaxChange(parseInt(e.target.value) || 10000)}
                onKeyDown={blockNonNumeric}
                placeholder="上限なし"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-7 pr-3 py-2.5 text-sm text-gray-700 dark:text-gray-200"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex gap-3">
        <button
          onClick={clearAll}
          className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-medium"
        >
          クリア
        </button>
        <button
          onClick={onApply ?? onClose}
          className="flex-[2] py-3 rounded-xl bg-orange-500 text-white text-sm font-medium"
        >
          この条件で探す
        </button>
      </div>
    </div>
  );
}
