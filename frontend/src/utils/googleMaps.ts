/**
 * Google Maps Places SDK の遅延ロード共通ヘルパー。
 *
 * 課題: 各画面が mount 時に script タグを追加してロードしていたため、
 *       実際にエリア検索を使わないユーザーでも Maps JS / Places SDK の
 *       JS ダウンロードと session 初期化が走っていた。
 *
 * 設計: モジュールスコープの単一 Promise でロードを共有。最初に
 *       `loadGoogleMapsPlaces()` を呼んだコンポーネントが script 追加
 *       担当、以降の呼び出しは同じ Promise を await するだけ。
 *       VITE_GOOGLE_MAPS_API_KEY が無ければ reject せず resolve(null)
 *       で返す（Places 機能が単に無効になるだけ）。
 */

let mapsPromise: Promise<typeof google | null> | null = null;

export function loadGoogleMapsPlaces(): Promise<typeof google | null> {
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve) => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) { resolve(null); return; }
    if (window.google?.maps?.places) { resolve(window.google); return; }

    const existing = document.querySelector('script[src*="maps.googleapis.com"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google ?? null));
      existing.addEventListener('error', () => resolve(null));
      return;
    }
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=ja`;
    s.async = true;
    s.onload = () => resolve(window.google ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return mapsPromise;
}

/**
 * Google Places Autocomplete の課金最適化用セッショントークン。
 * セッショントークンを `getPlacePredictions` と `getDetails` に同じ
 * 値を渡すと、その session の predictions + 1 つの details が
 * **「1 セッション = 1 リクエスト分の料金」** にまとめられる。
 * 渡さない場合は **キーストローク毎に Per Request 課金**。
 *
 * 使い方:
 *   const session = createPlacesSessionToken();
 *   ...
 *   service.getPlacePredictions({ ...query, sessionToken: session }, cb);
 *   ...
 *   service.getDetails({ placeId, sessionToken: session, fields }, cb);
 *   // 完了後は session を捨てる（次の検索開始時に新規生成）
 */
export function createPlacesSessionToken(): google.maps.places.AutocompleteSessionToken | null {
  if (!window.google?.maps?.places) return null;
  return new google.maps.places.AutocompleteSessionToken();
}
