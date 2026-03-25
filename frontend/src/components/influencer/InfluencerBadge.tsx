import type { Influencer } from '../../types/restaurant';

interface Props { influencer: Influencer; }

export function InfluencerBadge({ influencer }: Props) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: influencer.color }}
    >
      {influencer.name}
    </span>
  );
}
