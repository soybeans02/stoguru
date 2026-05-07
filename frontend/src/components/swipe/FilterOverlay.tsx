import { SCENES, GENRES, POPULAR_GENRES, GENRE_PHOTOS, PREFECTURES } from '../../data/mockRestaurants';

interface Props {
  selectedScenes: string[];
  selectedGenres: string[];
  selectedAreas?: string[];
  priceMin?: number;
  priceMax?: number;
  onScenesChange: (scenes: string[]) => void;
  onGenresChange: (genres: string[]) => void;
  onAreasChange?: (areas: string[]) => void;
  onPriceChange?: (min: number, max: number) => void;
  onClose: () => void;
  onApply?: () => void;
}

export function FilterOverlay({
  selectedScenes,
  selectedGenres,
  selectedAreas = [],
  priceMin = 0,
  priceMax = 10000,
  onScenesChange,
  onGenresChange,
  onAreasChange,
  onPriceChange,
  onClose,
  onApply,
}: Props) {
  // 人気 8 と残りを分ける（home の GenreListModal と同じレイアウトに揃える）
  const popularSet = new Set<string>(POPULAR_GENRES as readonly string[]);
  const restGenres = GENRES.filter((g) => !popularSet.has(g));

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

  function toggleArea(p: string) {
    if (!onAreasChange) return;
    onAreasChange(
      selectedAreas.includes(p)
        ? selectedAreas.filter((x) => x !== p)
        : [...selectedAreas, p],
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
    onAreasChange?.([]);
    onPriceChange?.(0, 10000);
  }

  return (
    <div className="absolute inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-base font-bold text-gray-900 dark:text-white">絞り込み</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors" aria-label="閉じる">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {/* Scene */}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">シーン</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
          {SCENES.map((s) => {
            const active = selectedScenes.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggleScene(s.id)}
                className={`relative aspect-[4/3] rounded-xl overflow-hidden transition-all ${
                  active
                    ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-900'
                    : 'hover:scale-[1.02]'
                }`}
              >
                <img loading="lazy" src={s.photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div
                  className="absolute inset-0"
                  style={{
                    background: active
                      ? 'linear-gradient(to top, rgba(249, 115, 22, 0.7), rgba(249, 115, 22, 0.35) 70%, rgba(249, 115, 22, 0.15))'
                      : 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.15))',
                  }}
                />
                {active && (
                  <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white grid place-items-center shadow-md">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </span>
                )}
                <span
                  className="absolute inset-0 grid place-items-center text-white text-[20px] sm:text-[22px] font-extrabold tracking-[-0.01em]"
                  style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.5)' }}
                >
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Area — 47 都道府県をフラットなテキストチップで一覧。複数選択 OK。
            住所が選んだ都道府県名で始まるレストランだけ表示する単純実装。 */}
        {onAreasChange && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">エリア</h3>
              {selectedAreas.length > 0 && (
                <span className="text-[11px] font-semibold text-orange-500">{selectedAreas.length} 選択中</span>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-8">
              {PREFECTURES.map((p) => {
                const active = selectedAreas.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => toggleArea(p)}
                    className={`px-3 py-2.5 rounded-xl text-[12px] font-medium text-center transition-colors ${
                      active
                        ? 'bg-orange-500 text-white border border-orange-500'
                        : 'bg-orange-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-orange-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Genre — home の GenreListModal と同じレイアウトに揃える。
            人気 8 を写真タイル（2 列 16:10）、残りはテキストチップで。 */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">ジャンル</h3>
          {selectedGenres.length > 0 && (
            <span className="text-[11px] font-semibold text-orange-500">{selectedGenres.length} 選択中</span>
          )}
        </div>

        {/* 人気 8（写真タイル） */}
        <div className="text-[10px] uppercase tracking-[0.04em] font-bold text-gray-400 dark:text-gray-500 mb-2">
          人気ジャンル
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {POPULAR_GENRES.map((g) => {
            const active = selectedGenres.includes(g);
            const photo = GENRE_PHOTOS[g];
            return (
              <button
                key={g}
                onClick={() => toggleGenre(g)}
                className={`relative aspect-[16/10] rounded-2xl overflow-hidden transition-all ${
                  active
                    ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-900'
                    : 'hover:-translate-y-0.5'
                }`}
              >
                {photo ? (
                  <img loading="lazy" src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800" />
                )}
                <div
                  className="absolute inset-0"
                  style={{
                    background: active
                      ? 'linear-gradient(to top, rgba(249, 115, 22, 0.7), rgba(249, 115, 22, 0.35) 70%, rgba(249, 115, 22, 0.15))'
                      : 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.7))',
                  }}
                />
                {active && (
                  <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white grid place-items-center shadow-md">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </span>
                )}
                <span className="absolute bottom-2 left-3 right-3 text-white text-[15px] font-extrabold tracking-[-0.01em] text-left drop-shadow">
                  {g}
                </span>
              </button>
            );
          })}
        </div>

        {/* 残りジャンル（テキストチップ） */}
        <div className="text-[10px] uppercase tracking-[0.04em] font-bold text-gray-400 dark:text-gray-500 mb-2">
          すべてのジャンル
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-8">
          {restGenres.map((g) => {
            const active = selectedGenres.includes(g);
            return (
              <button
                key={g}
                onClick={() => toggleGenre(g)}
                className={`px-4 py-3 rounded-xl text-[13px] font-medium text-left transition-colors ${
                  active
                    ? 'bg-orange-500 text-white border border-orange-500'
                    : 'bg-orange-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-orange-100 dark:hover:bg-gray-700'
                }`}
              >
                {g}
              </button>
            );
          })}
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
