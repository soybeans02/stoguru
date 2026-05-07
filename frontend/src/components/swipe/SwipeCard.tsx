import { useState, useRef, useCallback, useEffect } from 'react';
import type { SwipeRestaurant } from '../../data/mockRestaurants';

interface Props {
  restaurant: SwipeRestaurant;
  distance: string;
  onSwipeComplete: (direction: 'left' | 'right' | 'up') => void;
  active: boolean;
  flyOut?: 'left' | 'right' | 'up' | null;
  /** プレビュー用：ドラッグ無効、不透明度 100%、写真ナビは可能 */
  preview?: boolean;
}

export function SwipeCard({ restaurant, distance, onSwipeComplete, active, flyOut, preview }: Props) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<'left' | 'right' | 'up' | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const startPos = useRef({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const flyOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSwipeRef = useRef(onSwipeComplete);
  onSwipeRef.current = onSwipeComplete;

  const SWIPE_THRESHOLD = 80;
  const SWIPE_UP_THRESHOLD = 100;

  const photos = restaurant.photoUrls && restaurant.photoUrls.length > 0 ? restaurant.photoUrls : [];
  const photoCount = Math.max(photos.length, 1);

  useEffect(() => {
    // 依存配列に `exiting` を入れると、ここで setExiting() した直後に
    // この effect が再実行されて cleanup が走り、scheduleTimeout の
    // タイマーがクリアされてしまう（→ handleSwipeComplete が呼ばれず
    // カードが画面途中で止まる）。flyOut の変化のみを契機にしたい。
    if (flyOut) {
      setExiting(flyOut);
      flyOutTimer.current = setTimeout(() => onSwipeRef.current(flyOut), 300);
    }
    return () => { if (flyOutTimer.current) { clearTimeout(flyOutTimer.current); flyOutTimer.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyOut]);

  useEffect(() => {
    setOffset({ x: 0, y: 0 });
    offsetRef.current = { x: 0, y: 0 };
    setDragging(false);
    draggingRef.current = false;
    setExiting(null);
    setPhotoIndex(0);
    if (flyOutTimer.current) { clearTimeout(flyOutTimer.current); flyOutTimer.current = null; }
    if (swipeTimer.current) { clearTimeout(swipeTimer.current); swipeTimer.current = null; }
  }, [restaurant.id]);

  const handleStart = useCallback((clientX: number, clientY: number) => {
    if (!active || exiting) return;
    setDragging(true);
    draggingRef.current = true;
    startPos.current = { x: clientX, y: clientY };
    offsetRef.current = { x: 0, y: 0 };
  }, [active, exiting]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!draggingRef.current) return;
    const newOffset = {
      x: clientX - startPos.current.x,
      y: clientY - startPos.current.y,
    };
    offsetRef.current = newOffset;
    setOffset(newOffset);
  }, []);

  const handleEnd = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    const ox = offsetRef.current.x;
    const oy = offsetRef.current.y;
    if (oy < -SWIPE_UP_THRESHOLD && Math.abs(oy) > Math.abs(ox)) {
      setExiting('up');
      swipeTimer.current = setTimeout(() => onSwipeRef.current('up'), 300);
    } else if (Math.abs(ox) > SWIPE_THRESHOLD) {
      const dir = ox > 0 ? 'right' : 'left';
      setExiting(dir);
      swipeTimer.current = setTimeout(() => onSwipeRef.current(dir), 300);
    } else {
      setOffset({ x: 0, y: 0 });
      offsetRef.current = { x: 0, y: 0 };
    }
  }, []);

  const onTouchStart = (e: React.TouchEvent) => handleStart(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchMove = (e: React.TouchEvent) => { e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); };
  const onTouchEnd = () => handleEnd();
  const onMouseDown = (e: React.MouseEvent) => { e.preventDefault(); handleStart(e.clientX, e.clientY); };

  useEffect(() => {
    const move = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const up = () => handleEnd();
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up, { passive: true });
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
    };
  }, [handleMove, handleEnd]);

  // 写真左右タップナビゲーション (active カード or プレビューカード)
  const handlePhotoTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ((!active && !preview) || exiting) return;
    // ドラッグ後はスキップ（プレビュー時はドラッグ無し）
    if (!preview && (Math.abs(offsetRef.current.x) > 5 || Math.abs(offsetRef.current.y) > 5)) return;

    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const clientX = 'touches' in e ? e.changedTouches[0].clientX : (e as React.MouseEvent).clientX;
    const relX = clientX - rect.left;
    const half = rect.width / 2;

    if (relX < half) {
      // 左タップ → 前の写真
      setPhotoIndex(prev => Math.max(0, prev - 1));
    } else {
      // 右タップ → 次の写真
      setPhotoIndex(prev => Math.min(photoCount - 1, prev + 1));
    }
  }, [active, preview, exiting, photoCount]);

  let transform: string;
  let opacity = 1;
  let transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';

  if (exiting) {
    // 大きめに動かして画面外まで運ぶ。opacity は 1 のまま保つ。
    // 旧版は opacity を 0 に落としていたので 0.3s の transition 中ずっと
    // 「半透明にディムされたカード」が見えてダサかった（特にボタン swipe）。
    transform = exiting === 'up'
      ? 'translateY(-140%)'
      : exiting === 'right'
        ? 'translateX(140%) rotate(18deg)'
        : 'translateX(-140%) rotate(-18deg)';
    opacity = 1;
  } else if (preview) {
    // プレビューモード：完全に不透明、変形なし
    transform = 'none';
    opacity = 1;
  } else if (active) {
    transform = `translate(${offset.x}px, ${offset.y}px) rotate(${offset.x * 0.06}deg)`;
    opacity = Math.max(0.3, 1 - Math.abs(offset.x) / 400);
    if (dragging) transition = 'none';
  } else {
    transform = 'scale(0.97) translateY(4px)';
    opacity = 0.5;
  }

  const hasPhoto = photos.length > 0;
  const currentPhoto = hasPhoto ? photos[photoIndex] || photos[0] : null;

  return (
    <div
      className="absolute inset-0 select-none"
      style={{
        transform,
        transition,
        opacity,
        zIndex: active ? 10 : 5,
        cursor: active && !exiting ? 'grab' : 'default',
        touchAction: 'none',
        willChange: 'transform, opacity',
      }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="w-full h-full rounded-2xl lg:rounded-3xl overflow-hidden relative"
        onClick={handlePhotoTap}
      >
        {/* Photo */}
        {currentPhoto ? (
          <img
            src={currentPhoto}
            alt={restaurant.name}
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
            <span className="text-[120px]">{restaurant.photoEmoji}</span>
          </div>
        )}

        {/* 下部グラデーション（濃いめ） */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/[0.88] via-black/50 via-[35%] to-transparent to-[55%]" />

        {/* 写真バー（上端） */}
        {photoCount > 1 && (
          <div className="absolute top-1.5 left-2.5 right-2.5 flex gap-[3px] z-[8]">
            {Array.from({ length: photoCount }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-[3px] rounded-sm ${i === photoIndex ? 'bg-white/90' : 'bg-white/30'}`}
              />
            ))}
          </div>
        )}

        {/* 上部バー（バッジ・動画ボタン） */}
        <div className="absolute top-0 left-0 right-0 z-[6] flex items-center justify-between px-3.5 pt-4 pb-3">
          {restaurant.influencer?.handle && (
            <a
              href={
                restaurant.influencer.url || (
                restaurant.influencer.platform === 'instagram'
                  ? `https://www.instagram.com/${restaurant.influencer.handle.replace('@', '')}/`
                  : restaurant.influencer.platform === 'tiktok'
                  ? `https://www.tiktok.com/@${restaurant.influencer.handle.replace('@', '')}`
                  : `https://www.youtube.com/@${restaurant.influencer.handle.replace('@', '')}`)
              }
              target="_blank"
              rel="noopener noreferrer"
              className="bg-black/60 backdrop-blur-xl text-white px-3 py-1 rounded-full text-[11px] font-semibold max-w-[120px] truncate"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {restaurant.influencer.handle}
            </a>
          )}
          {!restaurant.influencer?.handle && <div />}
          {restaurant.videoUrl && (
            <button
              className="bg-black/60 backdrop-blur-xl text-white w-[34px] h-[34px] rounded-full flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); window.open(restaurant.videoUrl, '_blank'); }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
            </button>
          )}
          {!restaurant.videoUrl && <div />}
        </div>

        {/* Swipe labels */}
        {offset.x > 30 && !exiting && (
          <div className="absolute top-8 left-6 z-20 border-[3px] border-green-400 text-green-400 px-4 py-1.5 rounded-lg text-2xl font-black -rotate-12">
            LIKE
          </div>
        )}
        {offset.x < -30 && !exiting && (
          <div className="absolute top-8 right-6 z-20 border-[3px] border-red-400 text-red-400 px-4 py-1.5 rounded-lg text-2xl font-black rotate-12">
            NOPE
          </div>
        )}
        {offset.y < -40 && Math.abs(offset.y) > Math.abs(offset.x) && !exiting && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 border-[3px] border-blue-400 text-blue-400 px-4 py-1.5 rounded-lg text-2xl font-black flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            MAP
          </div>
        )}
        {exiting === 'right' && (
          <div className="absolute top-8 left-6 z-20 border-[3px] border-green-400 text-green-400 px-4 py-1.5 rounded-lg text-2xl font-black -rotate-12">LIKE</div>
        )}
        {exiting === 'left' && (
          <div className="absolute top-8 right-6 z-20 border-[3px] border-red-400 text-red-400 px-4 py-1.5 rounded-lg text-2xl font-black rotate-12">NOPE</div>
        )}
        {exiting === 'up' && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 border-[3px] border-blue-400 text-blue-400 px-4 py-1.5 rounded-lg text-2xl font-black">MAP</div>
        )}

        {/* 店名・距離・値段・タグ */}
        <div className="absolute bottom-[72px] left-0 right-0 px-5 z-10">
          <div className="flex items-baseline gap-2 mb-2">
            <h3 className="text-xl font-bold text-white drop-shadow-lg">{restaurant.name}</h3>
            <span className="text-xs text-white/55 whitespace-nowrap">
              {distance}{restaurant.priceRange ? ` · ${restaurant.priceRange}` : ''}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(restaurant.genres && restaurant.genres.length > 0 ? restaurant.genres : [restaurant.genre]).filter(Boolean).map((g) => (
              <span key={g} className="bg-white/20 backdrop-blur-sm text-white px-2.5 py-1 rounded-full text-xs font-medium">
                {g}
              </span>
            ))}
            {restaurant.scene.slice(0, 2).map((s) => (
              <span key={s} className="bg-white/15 backdrop-blur-sm text-white/80 px-2.5 py-1 rounded-full text-xs">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
