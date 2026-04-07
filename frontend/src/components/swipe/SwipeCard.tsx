import { useState, useRef, useCallback, useEffect } from 'react';
import type { SwipeRestaurant } from '../../data/mockRestaurants';

interface Props {
  restaurant: SwipeRestaurant;
  distance: string;
  onSwipeComplete: (direction: 'left' | 'right' | 'up') => void;
  active: boolean;
  flyOut?: 'left' | 'right' | 'up' | null;
}

export function SwipeCard({ restaurant, distance, onSwipeComplete, active, flyOut }: Props) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<'left' | 'right' | 'up' | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const flyOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSwipeRef = useRef(onSwipeComplete);
  onSwipeRef.current = onSwipeComplete;

  const SWIPE_THRESHOLD = 80;

  // Button-triggered fly out
  useEffect(() => {
    if (flyOut && !exiting) {
      setExiting(flyOut);
      flyOutTimer.current = setTimeout(() => onSwipeRef.current(flyOut), 300);
    }
    return () => { if (flyOutTimer.current) clearTimeout(flyOutTimer.current); };
  }, [flyOut, exiting]);

  // Reset on card change
  useEffect(() => {
    setOffset({ x: 0, y: 0 });
    offsetRef.current = { x: 0, y: 0 };
    setDragging(false);
    draggingRef.current = false;
    setExiting(null);
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

  const SWIPE_UP_THRESHOLD = 100;

  const handleEnd = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    const ox = offsetRef.current.x;
    const oy = offsetRef.current.y;
    // 上スワイプ: Y方向が閾値超え && X方向より大きい
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

  const onTouchStart = (e: React.TouchEvent) => {
    handleStart(e.touches[0].clientX, e.touches[0].clientY);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    handleMove(e.touches[0].clientX, e.touches[0].clientY);
  };
  const onTouchEnd = () => handleEnd();
  const onMouseDown = (e: React.MouseEvent) => handleStart(e.clientX, e.clientY);
  const onMouseMove = (e: React.MouseEvent) => handleMove(e.clientX, e.clientY);

  useEffect(() => {
    const up = () => handleEnd();
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up, { passive: true });
    return () => {
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
    };
  }, [handleEnd]);

  let transform: string;
  let opacity = 1;
  let transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';

  if (exiting) {
    transform = exiting === 'up'
      ? 'translateY(-120%)'
      : exiting === 'right'
        ? 'translateX(120%) rotate(15deg)'
        : 'translateX(-120%) rotate(-15deg)';
    opacity = 0;
  } else if (active) {
    transform = `translate(${offset.x}px, ${offset.y}px) rotate(${offset.x * 0.08}deg)`;
    opacity = Math.max(0.3, 1 - Math.abs(offset.x) / 400);
    if (dragging) transition = 'none';
  } else {
    transform = 'scale(0.95) translateY(6px)';
    opacity = 0.6;
  }

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
      onMouseMove={onMouseMove}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="w-full h-full bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-lg border border-gray-100 dark:border-gray-700">
        {/* Swipe overlay labels */}
        {offset.x > 30 && !exiting && (
          <div className="absolute top-4 left-4 z-20 bg-green-500 text-white px-3 py-1 rounded-lg text-sm font-bold -rotate-12">
            LIKE
          </div>
        )}
        {offset.x < -30 && !exiting && (
          <div className="absolute top-4 right-4 z-20 bg-red-500 text-white px-3 py-1 rounded-lg text-sm font-bold rotate-12">
            NOPE
          </div>
        )}
        {offset.y < -40 && Math.abs(offset.y) > Math.abs(offset.x) && !exiting && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-blue-500 text-white px-3 py-1 rounded-lg text-sm font-bold flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            MAP
          </div>
        )}
        {exiting === 'right' && (
          <div className="absolute top-4 left-4 z-20 bg-green-500 text-white px-3 py-1 rounded-lg text-sm font-bold -rotate-12">
            LIKE
          </div>
        )}
        {exiting === 'left' && (
          <div className="absolute top-4 right-4 z-20 bg-red-500 text-white px-3 py-1 rounded-lg text-sm font-bold rotate-12">
            NOPE
          </div>
        )}
        {exiting === 'up' && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-blue-500 text-white px-3 py-1 rounded-lg text-sm font-bold flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            MAP
          </div>
        )}

        {/* Photo area */}
        <div className="w-full h-[68%] bg-gray-100 dark:bg-gray-800 flex items-center justify-center relative overflow-hidden">
          {restaurant.photoUrls && restaurant.photoUrls.length > 0 ? (
            <img src={restaurant.photoUrls[0]} alt={restaurant.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-9xl">{restaurant.photoEmoji}</span>
          )}
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
            className="absolute bottom-2 left-2 bg-black/60 text-white px-2.5 py-1 rounded-full text-[11px] backdrop-blur-sm z-10"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {restaurant.influencer.handle}
          </a>
          <button
            className="absolute bottom-2 right-2 bg-black/60 text-white w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm z-10"
            onClick={(e) => {
              e.stopPropagation();
              window.open(restaurant.videoUrl, '_blank');
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>

        {/* Info area */}
        <div className="px-4 py-3">
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-0.5">{restaurant.name}</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2.5">
            {distance} · {restaurant.priceRange}
          </p>
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            {(restaurant.genres && restaurant.genres.length > 0 ? restaurant.genres : [restaurant.genre]).filter(Boolean).map((g) => (
              <span key={g} className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded text-[11px]">
                {g}
              </span>
            ))}
            {restaurant.scene.slice(0, 2).map((s) => (
              <span key={s} className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded text-[11px]">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
