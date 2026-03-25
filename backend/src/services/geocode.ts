export interface GeoResult {
  lat: number;
  lng: number;
}

export async function geocode(query: string): Promise<GeoResult | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=ja`,
      { headers: { 'User-Agent': 'RestaurantBookmark/1.0' } }
    );
    if (!res.ok) return null;
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (err) {
    console.warn('[geocode] Nominatim failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
