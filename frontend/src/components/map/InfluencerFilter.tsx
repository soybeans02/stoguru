import { useRestaurantContext } from '../../context/RestaurantContext';
import type { Influencer } from '../../types/restaurant';

interface Props {
  active: Influencer | null;
  onChange: (inf: Influencer | null) => void;
}

export function InfluencerFilter({ active, onChange }: Props) {
  const { state } = useRestaurantContext();

  if (state.influencers.length === 0) return null;

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] flex gap-1 bg-white/90 backdrop-blur rounded-full px-2 py-1.5 shadow-md overflow-x-auto max-w-[90vw]">
      <button
        onClick={() => onChange(null)}
        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
          !active ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        全員
      </button>
      {state.influencers.map((inf) => (
        <button
          key={inf.id}
          onClick={() => onChange(active?.id === inf.id ? null : inf)}
          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
            active?.id === inf.id ? 'text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
          style={active?.id === inf.id ? { backgroundColor: inf.color } : {}}
        >
          {inf.name}
        </button>
      ))}
    </div>
  );
}
