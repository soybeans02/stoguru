import { useState } from 'react';
import { Marker, InfoWindow } from '@react-google-maps/api';
import type { Restaurant, Influencer } from '../../types/restaurant';

function makeIconUrl(color: string, opacity: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36" opacity="${opacity}">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24C24 5.373 18.627 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="5" fill="white" opacity="0.8"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

interface Props {
  restaurant: Restaurant;
  activeInfluencer: Influencer | null;
  onDetail: (r: Restaurant) => void;
  onReview: (r: Restaurant) => void;
}

export function RestaurantMarker({ restaurant: r, activeInfluencer, onDetail, onReview }: Props) {
  const [open, setOpen] = useState(false);

  if (r.lat === null || r.lng === null) return null;

  const isReviewed = !!r.review;
  let color = isReviewed ? '#86efac' : '#ef4444';
  const opacity = isReviewed ? 0.85 : 1.0;

  if (!isReviewed && activeInfluencer && r.influencerIds.includes(activeInfluencer.id)) {
    color = activeInfluencer.color;
  }

  const position = { lat: r.lat, lng: r.lng };
  const genres = r.genreTags ?? [];

  return (
    <Marker
      position={position}
      icon={{
        url: makeIconUrl(color, opacity),
        scaledSize: new window.google.maps.Size(24, 36),
        anchor: new window.google.maps.Point(12, 36),
      }}
      zIndex={10}
      onClick={() => setOpen(true)}
    >
      {open && (
        <InfoWindow position={position} onCloseClick={() => setOpen(false)}>
          <div className="min-w-[100px] pr-4">
            <p className="text-[13px] font-bold text-gray-900 leading-tight">{r.name}</p>
            {r.address && <p className="text-[10px] text-gray-400 leading-tight">{r.address}</p>}
            {genres.length > 0 && (
              <p className="text-[10px] text-orange-600 leading-tight mt-0.5">
                {genres.length <= 2 ? genres.join('・') : `${genres.slice(0, 2).join('・')} +${genres.length - 2}`}
              </p>
            )}
            {r.landmarkMemo && (
              <p className="text-[10px] leading-tight mt-0.5" style={{ color: '#ea580c' }}>
                📍 {r.landmarkMemo}
              </p>
            )}
            <div className="flex gap-1.5 mt-1">
              {!isReviewed && (
                <button
                  onClick={() => { setOpen(false); onReview(r); }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                >
                  レビュー
                </button>
              )}
              <button
                onClick={() => { setOpen(false); onDetail(r); }}
                className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"
              >
                詳細
              </button>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100"
                onClick={(e) => e.stopPropagation()}
              >
                道案内
              </a>
            </div>
          </div>
        </InfoWindow>
      )}
    </Marker>
  );
}
