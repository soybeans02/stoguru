import { getTranslation, STORAGE_KEY, type Language } from '../i18n';

/** Haversine distance in metres between two lat/lng points */
export function distanceMetres(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// utility は React 外でも呼ばれるので、localStorage 直読みで言語を解決。
function readLang(): Language {
  if (typeof window === 'undefined') return 'ja';
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'en' ? 'en' : 'ja';
}

/** Format distance for display: "徒歩3分" / "3 min walk" or "1.2km" */
export function formatDistance(metres: number): string {
  if (metres < 1000) {
    const min = Math.max(1, Math.round(metres / 80)); // 徒歩 80m/min
    return getTranslation(readLang(), 'common.walkingMin').replace('{min}', String(min));
  }
  return `${(metres / 1000).toFixed(1)}km`;
}
