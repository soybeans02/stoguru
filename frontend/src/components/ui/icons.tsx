import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
});

// ─── 共通アイコン ───

export function CheckIcon({ size = 16, ...props }: IconProps) {
  return <svg {...base(size)} {...props}><path d="M20 6L9 17l-5-5"/></svg>;
}
export function CheckCircleIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="12" r="10"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  );
}
export function StarIcon({ size = 14, filled = true, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
         fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" {...props}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}
export function CameraIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
      <circle cx="12" cy="13" r="3"/>
    </svg>
  );
}
export function MapPinIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}
export function FilterIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  );
}
export function MapIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/>
      <line x1="9" y1="3" x2="9" y2="18"/>
      <line x1="15" y1="6" x2="15" y2="21"/>
    </svg>
  );
}
export function CrownIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M2 8l4 6 6-10 6 10 4-6v11H2V8zm0 13h20v2H2z"/>
    </svg>
  );
}
export function MedalIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <circle cx="12" cy="14" r="7"/>
      <path d="M8 5l-2 4M16 5l2 4M9 1h6l-1 5h-4l-1-5z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── ジャンルアイコン（カテゴリピル & マップピン用） ───

export function NoodleIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M3 11h18l-2 9H5l-2-9z"/>
      <path d="M3 11c0-4 4-7 9-7s9 3 9 7"/>
      <path d="M8 14c0 2 1 4 4 4s4-2 4-4"/>
    </svg>
  );
}
export function SushiIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <ellipse cx="12" cy="12" rx="9" ry="5"/>
      <ellipse cx="12" cy="10" rx="6" ry="2.5"/>
    </svg>
  );
}
export function BurgerIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M3 8c0-3 4-5 9-5s9 2 9 5"/>
      <path d="M3 12h18"/>
      <path d="M3 16h18"/>
      <path d="M3 16c0 2 4 4 9 4s9-2 9-4"/>
    </svg>
  );
}
export function ItalianIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="12" r="9"/>
      <circle cx="9" cy="9" r="0.8" fill="currentColor"/>
      <circle cx="15" cy="10" r="0.8" fill="currentColor"/>
      <circle cx="11" cy="14" r="0.8" fill="currentColor"/>
      <circle cx="14" cy="15" r="0.8" fill="currentColor"/>
    </svg>
  );
}
export function CafeIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/>
      <path d="M17 10h2a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2"/>
      <path d="M6 4l1 2M10 4l1 2M14 4l1 2"/>
    </svg>
  );
}
export function MeatIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M5 14a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4v-3a4 4 0 0 0-4-4l-7-3-3 3v7z"/>
      <circle cx="9" cy="11" r="1.2" fill="currentColor"/>
    </svg>
  );
}
export function BeerIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M5 6h10v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6z"/>
      <path d="M15 9h2a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-2"/>
      <line x1="8" y1="10" x2="8" y2="18"/>
      <line x1="11" y1="10" x2="11" y2="18"/>
    </svg>
  );
}
export function CurryIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M2 13h20l-2 7H4l-2-7z"/>
      <path d="M6 13c0-3 3-5 6-5s6 2 6 5"/>
      <circle cx="9" cy="11" r="0.8" fill="currentColor"/>
      <circle cx="14" cy="10" r="0.8" fill="currentColor"/>
    </svg>
  );
}
export function ChineseIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M12 4c-3 0-6 2-6 5 0 1 .5 2 1 2.5C5 12 4 13 4 15c0 3 4 5 8 5s8-2 8-5c0-2-1-3-3-3.5.5-.5 1-1.5 1-2.5 0-3-3-5-6-5z"/>
      <path d="M9 9h6"/>
    </svg>
  );
}
export function EthnicIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M3 14c2-3 6-5 9-5s7 2 9 5"/>
      <path d="M3 14h18l-2 5H5l-2-5z"/>
      <path d="M8 11l1-3M12 9v-3M16 11l-1-3"/>
    </svg>
  );
}
export function PlateIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="12" r="9"/>
      <circle cx="12" cy="12" r="5"/>
    </svg>
  );
}
