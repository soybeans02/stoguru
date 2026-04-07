import { useState, useMemo, useRef, useCallback } from 'react';
import type { SwipeRestaurant } from '../../data/mockRestaurants';
import type { GPSPosition } from '../../hooks/useGPS';
import { distanceMetres, formatDistance } from '../../utils/distance';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export interface StockedRestaurant extends SwipeRestaurant {
  visited: boolean;
  stockedAt: string;
  visitedAt?: string;
  pinned?: boolean;
}

type Filter = 'all' | 'unvisited' | 'visited';
type SortMode = 'added' | 'distance';

interface Props {
  stocks: StockedRestaurant[];
  onMarkVisited: (id: string) => void;
  onUnmarkVisited: (id: string) => void;
  onRemoveStock: (id: string) => void;
  onTogglePin: (id: string) => void;
  onShowOnMap: (lat: number, lng: number, restaurant?: StockedRestaurant) => void;
  userPosition: GPSPosition | null;
}

/* ── Swipeable card ── */
function SwipeableCard({
  s,
  onTogglePin,
  onRemoveStock,
  onMarkVisited,
  onUnmarkVisited,
  onShowOnMap,
  userPosition,
  openId,
  setOpenId,
}: {
  s: StockedRestaurant;
  onTogglePin: (id: string) => void;
  onRemoveStock: (id: string) => void;
  onMarkVisited: (id: string) => void;
  onUnmarkVisited: (id: string) => void;
  onShowOnMap: (lat: number, lng: number, restaurant?: StockedRestaurant) => void;
  userPosition: GPSPosition | null;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const ACTION_WIDTH = 120; // px to reveal

  const isOpen = openId === s.id;

  const setTranslate = useCallback((x: number) => {
    if (cardRef.current) {
      cardRef.current.style.transform = `translateX(${x}px)`;
    }
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = isOpen ? -ACTION_WIDTH : 0;
    swiping.current = false;
    if (cardRef.current) cardRef.current.style.transition = 'none';
  }, [isOpen]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // 最初の動きで横か縦か判定
    if (!swiping.current && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    if (!swiping.current) {
      if (Math.abs(dy) > Math.abs(dx)) return; // 縦スクロール優先
      swiping.current = true;
    }

    const base = isOpen ? -ACTION_WIDTH : 0;
    const raw = base + dx;
    const clamped = Math.min(0, raw);

    // ACTION_WIDTH超えた分はラバーバンド（抵抗感）
    if (clamped < -ACTION_WIDTH) {
      const over = -clamped - ACTION_WIDTH;
      const damped = -ACTION_WIDTH - over * 0.15;
      setTranslate(damped);
    } else {
      setTranslate(clamped);
    }
  }, [isOpen, setTranslate]);

  const onTouchEnd = useCallback(() => {
    if (!cardRef.current) return;
    cardRef.current.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';

    const current = cardRef.current.getBoundingClientRect();
    const parent = cardRef.current.parentElement?.getBoundingClientRect();
    if (!parent) return;

    const offset = current.left - parent.left;
    if (offset < -ACTION_WIDTH / 3) {
      // スナップ: ピタッとACTION_WIDTHで止まる
      setTranslate(-ACTION_WIDTH);
      setOpenId(s.id);
    } else {
      setTranslate(0);
      if (isOpen) setOpenId(null);
    }
  }, [isOpen, s.id, setOpenId, setTranslate]);

  // 他のカード開いたら閉じる
  const translate = isOpen ? -ACTION_WIDTH : 0;

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Action buttons behind */}
      <div className="absolute right-0 top-0 bottom-0 flex items-stretch" style={{ width: ACTION_WIDTH }}>
        <button
          onClick={() => { onTogglePin(s.id); setOpenId(null); }}
          className={`flex-1 flex flex-col items-center justify-center gap-1 ${s.pinned ? 'bg-amber-400' : 'bg-amber-500'} text-white`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={s.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/></svg>
          <span className="text-[10px] font-medium">{s.pinned ? '解除' : 'ピン'}</span>
        </button>
        <button
          onClick={() => { onRemoveStock(s.id); setOpenId(null); }}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-red-500 text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          <span className="text-[10px] font-medium">削除</span>
        </button>
      </div>

      {/* Foreground card */}
      <div
        ref={cardRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={`flex gap-3 p-3.5 relative ${s.pinned ? 'bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200 dark:ring-amber-800' : 'bg-gray-50 dark:bg-gray-900'}`}
        style={{ transform: `translateX(${translate}px)`, transition: 'transform 0.25s ease' }}
      >
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
            s.visited ? 'bg-green-50 dark:bg-green-900/30' : 'bg-gray-200 dark:bg-gray-700'
          }`}
        >
          {s.photoEmoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.name}</h3>
            {s.pinned && (
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 flex-shrink-0"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/></svg>
            )}
            <span className="text-[12px] font-normal text-gray-300 dark:text-gray-600 flex-shrink-0 ml-auto">{formatDate(s.stockedAt)}</span>
            {/* PC版: ピン・削除ボタン */}
            <button
              onClick={() => onTogglePin(s.id)}
              className={`hidden md:block flex-shrink-0 p-0.5 transition-colors ${s.pinned ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={s.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/></svg>
            </button>
            <button
              onClick={() => { if (window.confirm(`「${s.name}」を保存から削除する？`)) onRemoveStock(s.id); }}
              className="hidden md:block flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors p-0.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mb-2 truncate">
            {userPosition ? formatDistance(distanceMetres(userPosition.lat, userPosition.lng, s.lat, s.lng)) : s.distance}{s.genre ? ` · ${s.genre}` : ''}
          </p>
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => onShowOnMap(s.lat, s.lng, s)}
              className="text-xs px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium active:scale-95 transition-transform"
            >
              マップ
            </button>
            <button
              onClick={() => window.open(s.videoUrl, '_blank')}
              className="text-xs px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium active:scale-95 transition-transform"
            >
              動画
            </button>
            {!s.visited && (
              <button
                onClick={() => onMarkVisited(s.id)}
                className="text-xs px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium active:scale-95 transition-transform"
              >
                行った
              </button>
            )}
            {s.visited && (
              <button
                onClick={() => onUnmarkVisited(s.id)}
                className="ml-auto bg-green-500 hover:bg-green-600 text-white text-[11px] px-2 py-0 rounded font-medium active:scale-95 transition-all leading-tight"
                title="タップで未訪問に戻す"
              >
                visited
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StockScreen({ stocks, onMarkVisited, onUnmarkVisited, onRemoveStock, onTogglePin, onShowOnMap, userPosition }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [genreOpen, setGenreOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('added');
  const [openId, setOpenId] = useState<string | null>(null);
  const visitedCount = stocks.filter((s) => s.visited).length;

  // ストック内のジャンル一覧
  const genres = useMemo(() => {
    const set = new Set(stocks.map((s) => s.genre).filter(Boolean));
    return [...set].sort();
  }, [stocks]);

  const filtered = useMemo(() => stocks
    .filter((s) => {
      if (filter === 'unvisited') return !s.visited;
      if (filter === 'visited') return s.visited;
      return true;
    })
    .filter((s) => {
      if (search) {
        const q = search.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.genre.toLowerCase().includes(q);
      }
      return true;
    })
    .filter((s) => !selectedGenre || s.genre === selectedGenre)
    .sort((a, b) => {
      // ピン留め優先
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sortMode === 'distance' && userPosition) {
        const distA = distanceMetres(userPosition.lat, userPosition.lng, a.lat, a.lng);
        const distB = distanceMetres(userPosition.lat, userPosition.lng, b.lat, b.lng);
        return distA - distB;
      }
      // 追加順（デフォルト）: stockedAtの降順（新しい順）
      return new Date(b.stockedAt).getTime() - new Date(a.stockedAt).getTime();
    }), [stocks, filter, search, selectedGenre, sortMode, userPosition]);

  return (
    <div className="flex-1 overflow-y-auto overscroll-none px-4 py-5 bg-white dark:bg-gray-900">
      <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-0.5">保存</h1>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
        {stocks.length}件 · うち{visitedCount}件 行った
      </p>

      {/* Search */}
      <div className="relative mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="店名・ジャンルで検索"
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white outline-none border border-gray-100 dark:border-gray-700 focus:border-gray-300 dark:focus:border-gray-500 placeholder:text-gray-300 dark:placeholder:text-gray-600"
        />
      </div>

      {/* Filter tabs + sort */}
      <div className="flex gap-2 mb-4 items-center">
        {([['unvisited', '未訪問'], ['visited', '行った']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(filter === key ? 'all' : key)}
            className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-colors ${
              filter === key ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
        {genres.length > 0 && (
          <button
            onClick={() => setGenreOpen(!genreOpen)}
            className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-colors flex items-center gap-1 ${
              selectedGenre ? 'bg-gray-700 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}
          >
            {selectedGenre ?? '絞り込み'}
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${genreOpen ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setSortMode(sortMode === 'added' ? 'distance' : 'added')}
          className="text-[11px] px-3 py-1.5 rounded-full font-medium bg-gray-50 dark:bg-gray-800 text-gray-400 border border-gray-100 dark:border-gray-700 flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>
          {sortMode === 'added' ? '追加順' : '距離順'}
        </button>
      </div>
      {genreOpen && genres.length > 0 && (
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {selectedGenre && (
            <button
              onClick={() => { setSelectedGenre(null); setGenreOpen(false); }}
              className="text-[11px] px-3 py-1.5 rounded-full font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
            >
              クリア
            </button>
          )}
          {genres.map((g) => (
            <button
              key={g}
              onClick={() => { setSelectedGenre(selectedGenre === g ? null : g); setGenreOpen(false); }}
              className={`text-[11px] px-3 py-1.5 rounded-full font-medium transition-colors ${
                selectedGenre === g ? 'bg-gray-700 text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-400 border border-gray-100 dark:border-gray-700'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {stocks.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-300 dark:text-gray-600 text-5xl font-thin mb-3">0</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">まだ保存がないよ</p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">ホームで気になる店をスワイプしよう</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm">該当するお店がないよ</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <SwipeableCard
              key={s.id}
              s={s}
              onTogglePin={onTogglePin}
              onRemoveStock={onRemoveStock}
              onMarkVisited={onMarkVisited}
              onUnmarkVisited={onUnmarkVisited}
              onShowOnMap={onShowOnMap}
              userPosition={userPosition}
              openId={openId}
              setOpenId={setOpenId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
