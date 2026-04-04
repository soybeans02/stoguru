import { useState, useCallback, useRef, useEffect } from 'react';
import { SwipeCard } from './SwipeCard';
import { FilterOverlay } from './FilterOverlay';
import { MOCK_RESTAURANTS } from '../../data/mockRestaurants';
import type { SwipeRestaurant } from '../../data/mockRestaurants';

// 効果音を生成（Web Audio API）
function createSwipeSound(type: 'like' | 'nope') {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === 'like') {
    // ポワン: 柔らかく弾ける音
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } else {
    // シュッ: 空気を切る音
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }
}

interface Props {
  onStock: (restaurant: SwipeRestaurant) => void;
  onNope?: () => void;
}

export function SwipeScreen({ onStock, onNope }: Props) {
  const [cards, setCards] = useState<SwipeRestaurant[]>([...MOCK_RESTAURANTS]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedScenes, setSelectedScenes] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [swipeAnim, setSwipeAnim] = useState<'left' | 'right' | null>(null);
  const animTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // フィルタ適用
  useEffect(() => {
    let filtered = [...MOCK_RESTAURANTS];
    if (selectedScenes.length > 0) {
      filtered = filtered.filter((r) =>
        r.scene.some((s) => selectedScenes.includes(s))
      );
    }
    if (selectedGenres.length > 0) {
      filtered = filtered.filter((r) => selectedGenres.includes(r.genre));
    }
    setCards(filtered);
    setCurrentIndex(0);
  }, [selectedScenes, selectedGenres]);

  const handleSwipe = useCallback(
    (direction: 'left' | 'right') => {
      const current = cards[currentIndex];
      if (!current) return;

      // 効果音
      createSwipeSound(direction === 'right' ? 'like' : 'nope');

      // アニメーション
      setSwipeAnim(direction);
      if (animTimeout.current) clearTimeout(animTimeout.current);
      animTimeout.current = setTimeout(() => {
        setSwipeAnim(null);
        if (direction === 'right') {
          onStock(current);
        } else {
          onNope?.();
        }
        setCurrentIndex((i) => i + 1);
      }, 300);
    },
    [cards, currentIndex, onStock],
  );

  const handleButtonSwipe = (direction: 'left' | 'right') => {
    handleSwipe(direction);
  };

  const current = cards[currentIndex];
  const next = cards[currentIndex + 1];
  const isFinished = currentIndex >= cards.length;

  const filterCount = selectedScenes.length + selectedGenres.length;

  return (
    <div className="flex-1 flex flex-col items-center relative bg-gray-50">
      {/* Filter bar */}
      <div className="w-full flex items-center gap-2 px-4 py-3 flex-shrink-0">
        <button
          onClick={() => setFilterOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-gray-800 text-white text-xs font-medium"
        >
          🎯 絞り込み
          {filterCount > 0 && (
            <span className="bg-orange-500 text-white text-[10px] rounded-full w-4.5 h-4.5 flex items-center justify-center ml-0.5">
              {filterCount}
            </span>
          )}
        </button>
        <div className="ml-auto text-xs text-gray-400 flex items-center gap-1">
          📍 梅田
        </div>
      </div>

      {/* Card area */}
      <div className="flex-1 flex flex-col items-center justify-start w-full px-4 min-h-0 overflow-hidden">
        {isFinished ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <p className="text-5xl mb-4">🍽️</p>
            <p className="text-gray-600 font-bold text-lg mb-2">全部見たよ！</p>
            <p className="text-gray-400 text-sm mb-6">また後でチェックしてね</p>
            <button
              onClick={() => setCurrentIndex(0)}
              className="px-6 py-2.5 bg-orange-500 text-white rounded-full text-sm font-bold"
            >
              もう一度見る
            </button>
          </div>
        ) : (
          <>
            <div className="relative w-full max-w-[300px] h-[340px] flex-shrink-0">
              {next && <SwipeCard restaurant={next} onSwipe={() => {}} active={false} />}
              {current && (
                <div
                  className="absolute inset-0"
                  style={{
                    transform:
                      swipeAnim === 'left'
                        ? 'translateX(-120%) rotate(-20deg)'
                        : swipeAnim === 'right'
                          ? 'translateX(120%) rotate(20deg)'
                          : 'none',
                    transition: swipeAnim ? 'transform 0.3s ease-out' : 'none',
                  }}
                >
                  <SwipeCard
                    restaurant={current}
                    onSwipe={handleSwipe}
                    active={!swipeAnim}
                  />
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-8 py-2 flex-shrink-0">
              <button
                onClick={() => handleButtonSwipe('left')}
                className="w-14 h-14 rounded-full bg-red-50 border-2 border-red-300 flex items-center justify-center text-red-500 text-2xl shadow-md active:scale-90 transition-transform"
              >
                ✕
              </button>
              <button
                onClick={() => handleButtonSwipe('right')}
                className="w-14 h-14 rounded-full bg-green-50 border-2 border-green-300 flex items-center justify-center text-green-500 text-2xl shadow-md active:scale-90 transition-transform"
              >
                ○
              </button>
            </div>
            <p className="text-[11px] text-gray-400 pb-1 flex-shrink-0 tracking-wider">
              ← シュッ ・ ポワン →
            </p>
          </>
        )}
      </div>

      {/* Filter overlay */}
      {filterOpen && (
        <FilterOverlay
          selectedScenes={selectedScenes}
          selectedGenres={selectedGenres}
          onScenesChange={setSelectedScenes}
          onGenresChange={setSelectedGenres}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </div>
  );
}
