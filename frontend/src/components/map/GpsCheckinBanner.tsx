import { useRestaurantContext } from '../../context/RestaurantContext';
import { useGPS } from '../../hooks/useGPS';
import { distanceMetres } from '../../utils/distance';
import { MapPin } from 'lucide-react';

interface Props {
  onReview: (id: string) => void;
}

export function GpsCheckinBanner({ onReview }: Props) {
  const { state } = useRestaurantContext();
  const { position } = useGPS();

  if (!position) return null;

  const nearby = state.restaurants.filter(
    (r) =>
      r.lat !== null &&
      r.lng !== null &&
      !r.review &&
      distanceMetres(position.lat, position.lng, r.lat!, r.lng!) < 100,
  );

  if (nearby.length === 0) return null;

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[1000] w-[90vw] max-w-sm bg-white rounded-2xl shadow-lg p-4 space-y-2 border border-green-200">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-green-700">
        <MapPin size={16} /> 近くにお店があります！
      </p>
      {nearby.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2">
          <span className="text-sm text-gray-800 truncate">{r.name}</span>
          <button
            onClick={() => onReview(r.id)}
            className="shrink-0 px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-200"
          >
            レビューを書く
          </button>
        </div>
      ))}
    </div>
  );
}
