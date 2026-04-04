import { useState, useRef, useCallback, useEffect } from 'react';
import type { SwipeRestaurant } from '../../data/mockRestaurants';

interface Props {
  restaurant: SwipeRestaurant;
  distance: string;
  onSwipeComplete: (direction: 'left' | 'right') => void;
  active: boolean;
  flyOut?: 'left' | 'right' | null;
}

export function SwipeCard({ restaurant, distance, onSwipeComplete, active, flyOut }: Props) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<'left' | 'right' | null>(null);
  const startPos = useRef({ x: 0, y: 0 });

  const SWIPE_THRESHOLD = 80;

  useEffect(() => {
    if (flyOut && !exiting) {
      setExiting(flyOut);
      setTimeout(() => onSwipeComplete(flyOut), 300);
    }
  }, [flyOut, exiting, onSwipeComplete]);

  useEffect(() => {
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    setExiting(null);
  }, [restaurant.id]);

  const handleStart = useCallback((clientX: number, clientY: number) => {
    if (!active || exiting) return;
    setDragging(true);
    startPos.current = { x: clientX, y: clientY };
  }, [active, exiting]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!dragging) return;
    setOffset({
      x: clientX - startPos.current.x,
      y: clientY - startPos.current.y,
    });
  }, [dragging]);

  const handleEnd = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    if (Math.abs(offset.x) > SWIPE_THRESHOLD) {
      const dir = offset.x > 0 ? 'right' : 'left';
      setExiting(dir);
      setTimeout(() => onSwipeComplete(dir), 300);
    } else {
      setOffset({ x: 0, y: 0 });
    }
  }, [dragging, offset.x, onSwipeComplete]);

  const onTouchStart = (e: React.TouchEvent) => handleStart(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchEnd = () => handleEnd();
  const onMouseDown = (e: React.MouseEvent) => handleStart(e.clientX, e.clientY);
  const onMouseMove = (e: React.MouseEvent) => handleMove(e.clientX, e.clientY);

  useEffect(() => {
    if (!dragging) return;
    const up = () => handleEnd();
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
    };
  }, [dragging, handleEnd]);

  let transform: string;
  let opacity = 1;
  let transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';

  if (exiting) {
    transform = exiting === 'right'
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

  const platformLabel = {
    tiktok: 'TikTok',
    instagram: 'Instagram',
    youtube: 'YouTube',
  }[restaurant.influencer.platform];

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
      <div className="w-full h-full bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-100">
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

        {/* Photo area */}
        <div className="w-full h-[68%] bg-gray-100 flex items-center justify-center relative">
          <span className="text-9xl">{restaurant.photoEmoji}</span>
          <div className="absolute bottom-2 left-2 bg-black/60 text-white px-2.5 py-1 rounded-full text-[11px] backdrop-blur-sm">
            {restaurant.influencer.handle}
          </div>
        </div>

        {/* Info area */}
        <div className="px-4 py-3">
          <h3 className="text-base font-bold text-gray-900 mb-0.5">{restaurant.name}</h3>
          <p className="text-xs text-gray-400 mb-2.5">
            {distance} · {restaurant.priceRange}
          </p>
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[11px]">
              {restaurant.genre}
            </span>
            {restaurant.scene.slice(0, 2).map((s) => (
              <span key={s} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[11px]">
                {s}
              </span>
            ))}
          </div>
          <button
            className="text-gray-500 text-xs font-medium hover:text-gray-700 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              window.open(restaurant.videoUrl, '_blank');
            }}
          >
            {platformLabel}で見る →
          </button>
        </div>
      </div>
    </div>
  );
}
