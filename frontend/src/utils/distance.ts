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

/** Format distance for display: "徒歩3分" or "1.2km" */
export function formatDistance(metres: number): string {
  if (metres < 1000) {
    const min = Math.max(1, Math.round(metres / 80)); // 徒歩 80m/min
    return `徒歩${min}分`;
  }
  return `${(metres / 1000).toFixed(1)}km`;
}
