import { Star } from 'lucide-react';

interface Props {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}

export function StarRating({ value, onChange, size = 18 }: Props) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}
        >
          <Star
            size={size}
            className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}
          />
        </button>
      ))}
    </div>
  );
}
