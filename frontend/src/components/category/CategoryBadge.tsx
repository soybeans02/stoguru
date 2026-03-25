import type { Category } from '../../types/restaurant';

interface Props { category: Category; }

export function CategoryBadge({ category }: Props) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: category.color }}
    >
      {category.name}
    </span>
  );
}
