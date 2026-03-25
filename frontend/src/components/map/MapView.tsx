import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, useLoadScript, Marker, InfoWindow } from '@react-google-maps/api';
import { Users, X, Crosshair } from 'lucide-react';
import { useRestaurantContext } from '../../context/RestaurantContext';
import type { Influencer, Restaurant } from '../../types/restaurant';
import { RestaurantMarker } from './RestaurantMarker';
import { InfluencerFilter } from './InfluencerFilter';
import { GpsCheckinBanner } from './GpsCheckinBanner';
import { UserLocationMarker } from './UserLocationMarker';
import { MapSearch } from './MapSearch';
import { useGPS } from '../../hooks/useGPS';
import * as api from '../../utils/api';

const LIBRARIES: ('places')[] = ['places'];
const DEFAULT_CENTER = { lat: 35.6762, lng: 139.6503 };
const MAP_OPTIONS: google.maps.MapOptions = {
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  zoomControl: false,
  clickableIcons: false,
};

function makeIconUrl(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30" viewBox="0 0 24 36">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24C24 5.373 18.627 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="5" fill="white" opacity="0.8"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

interface FollowedUserForMap {
  userId: string;
  nickname: string;
  restaurants: { name: string; address: string; lat: number | null; lng: number | null; hasReview: boolean }[];
}

interface Props {
  onDetail: (r: Restaurant) => void;
  onReview: (r: Restaurant) => void;
  onQuickAdd: (name: string, lat: number, lng: number) => void;
  panTo?: { lat: number; lng: number } | null;
  onPanComplete?: () => void;
}

export function MapView({ onDetail, onReview, onQuickAdd, panTo, onPanComplete }: Props) {
  const { state } = useRestaurantContext();
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
    libraries: LIBRARIES,
  });
  const [activeInfluencer, setActiveInfluencer] = useState<Influencer | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const gps = useGPS();

  // フォローユーザーのピン表示
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [followedUsers, setFollowedUsers] = useState<FollowedUserForMap[]>([]);
  const [selectedUser, setSelectedUser] = useState<FollowedUserForMap | null>(null);
  const [selectedMarkerIdx, setSelectedMarkerIdx] = useState<number | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // localStorageからマップ位置を復元
  const savedView = useRef(() => {
    try {
      const s = localStorage.getItem('gourmet-map-view');
      if (s) return JSON.parse(s) as { lat: number; lng: number; zoom: number };
    } catch { /* ignore */ }
    return null;
  });

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    const saved = savedView.current();
    if (saved) {
      map.setCenter({ lat: saved.lat, lng: saved.lng });
      map.setZoom(saved.zoom);
    }
    // ユーザーがマップを動かしたらlocalStorageに保存
    map.addListener('idle', () => {
      const c = map.getCenter();
      const z = map.getZoom();
      if (c && z != null) {
        localStorage.setItem('gourmet-map-view', JSON.stringify({ lat: c.lat(), lng: c.lng(), zoom: z }));
      }
    });
  }, []);

  useEffect(() => {
    if (panTo && mapRef.current) {
      mapRef.current.panTo(panTo);
      mapRef.current.setZoom(17);
      onPanComplete?.();
    }
  }, [panTo, onPanComplete]);

  // フォロー中ユーザー一覧を取得（並列化）
  useEffect(() => {
    async function load() {
      setLoadingUsers(true);
      try {
        const following = await api.getFollowing();
        const profiles = await Promise.all(
          following.map((f) => api.getUserProfile(f.followeeId).catch(() => null))
        );
        setFollowedUsers(
          profiles
            .filter((p): p is NonNullable<typeof p> => p !== null)
            .map((p) => ({
              userId: p.userId,
              nickname: p.nickname,
              restaurants: p.restaurants ?? [],
            }))
        );
      } catch { /* ignore */ }
      setLoadingUsers(false);
    }
    load();
  }, []);

  function selectUser(u: FollowedUserForMap) {
    setSelectedUser(u);
    setPeopleOpen(false);
    setSelectedMarkerIdx(null);
    // そのユーザーの最初のお店にパン
    const first = u.restaurants.find((r) => r.lat != null && r.lng != null);
    if (first && mapRef.current) {
      mapRef.current.panTo({ lat: first.lat!, lng: first.lng! });
      mapRef.current.setZoom(14);
    }
  }

  function clearUserPins() {
    setSelectedUser(null);
    setSelectedMarkerIdx(null);
  }

  const pinned = state.restaurants.filter((r) => r.lat !== null && r.lng !== null);
  const visible = activeInfluencer
    ? pinned.filter((r) => r.influencerIds.includes(activeInfluencer.id))
    : pinned;

  // 初回のみ：保存位置がなければピンの中心に移動
  const hasFitted = useRef(false);
  useEffect(() => {
    if (pinned.length > 0 && mapRef.current && !hasFitted.current) {
      hasFitted.current = true;
      // localStorageに保存済みの位置があればスキップ（既にonLoadで復元済み）
      if (savedView.current()) return;
      const avg = {
        lat: pinned.reduce((s, r) => s + r.lat!, 0) / pinned.length,
        lng: pinned.reduce((s, r) => s + r.lng!, 0) / pinned.length,
      };
      mapRef.current.setCenter(avg);
    }
  }, [pinned]);

  if (!isLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        地図を読み込み中...
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden w-full max-w-full">
      <div className="relative" style={{ height: 'calc(100dvh - 104px - 52px - env(safe-area-inset-bottom, 0px))' }}>
      <InfluencerFilter active={activeInfluencer} onChange={setActiveInfluencer} />
      <GoogleMap
        mapContainerStyle={{ width: '100%', maxWidth: '100vw', height: '100%' }}
        center={DEFAULT_CENTER}
        zoom={14}
        onLoad={onMapLoad}
        options={MAP_OPTIONS}
      >
        {/* 自分のお店のピン */}
        {!selectedUser && visible.map((r) => (
          <RestaurantMarker
            key={r.id}
            restaurant={r}
            activeInfluencer={activeInfluencer}
            onDetail={onDetail}
            onReview={onReview}
          />
        ))}

        {/* フォローユーザーのお店のピン */}
        {selectedUser && selectedUser.restaurants
          .filter((r) => r.lat != null && r.lng != null)
          .map((r, i) => (
            <Marker
              key={`user-${i}`}
              position={{ lat: r.lat!, lng: r.lng! }}
              icon={{
                url: makeIconUrl(r.hasReview ? '#86efac' : '#ef4444'),
                scaledSize: new window.google.maps.Size(20, 30),
                anchor: new window.google.maps.Point(10, 30),
              }}
              onClick={() => setSelectedMarkerIdx(i)}
            >
              {selectedMarkerIdx === i && (
                <InfoWindow onCloseClick={() => setSelectedMarkerIdx(null)}>
                  <div style={{ padding: '4px 2px', minWidth: 160, maxWidth: 220, fontFamily: 'system-ui, sans-serif' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: r.hasReview ? '#86efac' : '#f87171', flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', lineHeight: 1.3 }}>{r.name}</span>
                    </div>
                    {r.address && (
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 4px 14px', lineHeight: 1.3 }}>{r.address}</p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <span style={{
                        fontSize: 10, color: '#fff', borderRadius: 9999, padding: '2px 8px',
                        background: r.hasReview ? 'linear-gradient(135deg,#86efac,#4ade80)' : 'linear-gradient(135deg,#f87171,#ef4444)',
                      }}>
                        {r.hasReview ? 'レビュー済み' : '行きたい'}
                      </span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{selectedUser.nickname}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); const found = state.restaurants.find((rest: Restaurant) => rest.name === r.name); if (found) onDetail(found); }}
                      style={{
                        display: 'block', width: '100%', marginTop: 8, padding: '5px 0',
                        fontSize: 12, fontWeight: 600, color: '#fff', border: 'none', borderRadius: 8,
                        background: 'linear-gradient(135deg,#fb923c,#f97316)', cursor: 'pointer',
                      }}
                    >
                      詳細を見る
                    </button>
                  </div>
                </InfoWindow>
              )}
            </Marker>
          ))
        }

        <UserLocationMarker position={gps.position} />
      </GoogleMap>

      {/* 検索バー + 人マーク */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 w-[90vw] max-w-sm space-y-1">
        <div className="flex gap-1.5">
          <div className="flex-1">
            <MapSearch mapRef={mapRef} onSelect={onDetail} onQuickAdd={onQuickAdd} />
          </div>
          <button
            onClick={() => { setPeopleOpen((v) => !v); }}
            className={`shrink-0 bg-white rounded-xl shadow-md border border-gray-100 p-2.5 transition-colors ${
              selectedUser ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
            }`}
          >
            <Users size={18} className={selectedUser ? 'text-blue-500' : 'text-gray-500'} />
          </button>
        </div>

        {/* ユーザー選択中のバナー */}
        {selectedUser && (
          <div className="bg-blue-50 rounded-xl shadow-md border border-blue-200 px-3 py-2 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-cyan-300 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {selectedUser.nickname.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-blue-800 truncate">{selectedUser.nickname} のストック</p>
              <p className="text-xs text-blue-500">{selectedUser.restaurants.filter((r) => r.lat != null).length}件</p>
            </div>
            <button onClick={clearUserPins} className="text-blue-400 hover:text-blue-600 shrink-0">
              <X size={16} />
            </button>
          </div>
        )}

        {/* ユーザー一覧ドロップダウン */}
        {peopleOpen && (
          <>
            <div className="fixed inset-0 z-0" onClick={() => setPeopleOpen(false)} />
            <div className="relative bg-white rounded-xl shadow-xl border z-10 overflow-hidden">
              <div className="px-3 py-2 border-b bg-gray-50">
                <p className="text-xs font-semibold text-gray-600">フォロー中のユーザー</p>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {loadingUsers ? (
                  <p className="text-xs text-gray-400 text-center py-4">読み込み中...</p>
                ) : followedUsers.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">フォロー中のユーザーがいません</p>
                ) : (
                  followedUsers.map((u) => (
                    <button
                      key={u.userId}
                      onClick={() => selectUser(u)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left ${
                        selectedUser?.userId === u.userId ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-cyan-300 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {u.nickname.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{u.nickname}</p>
                        <p className="text-xs text-gray-400">{u.restaurants.filter((r) => r.lat != null).length}件のストック</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {selectedUser && (
                <button
                  onClick={() => { clearUserPins(); setPeopleOpen(false); }}
                  className="w-full px-3 py-2 border-t text-xs text-red-500 hover:bg-red-50 text-center"
                >
                  自分のマップに戻る
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <GpsCheckinBanner
        onReview={(id) => {
          const r = state.restaurants.find((x) => x.id === id);
          if (r) onReview(r);
        }}
      />

      </div>

      {/* 下部バー：凡例 + 現在地ボタン */}
      <div className="shrink-0 bg-white border-t border-gray-200 flex items-center justify-between px-4" style={{ height: 'calc(52px + env(safe-area-inset-bottom, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-400" /> 行きたい
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-green-300 opacity-85" /> レビュー済み
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-500" /> 現在地
          </div>
        </div>
        <button
          onClick={() => {
            if (gps.position) {
              mapRef.current?.panTo({ lat: gps.position.lat, lng: gps.position.lng });
              mapRef.current?.setZoom(17);
            } else if (gps.denied) {
              window.alert('位置情報が拒否されています。ブラウザの設定から位置情報を許可してください。');
            } else {
              // 取得中 or まだ来ていない → 再試行して待機
              gps.startWatch();
              const check = setInterval(() => {
                const pos = gps.positionRef.current;
                if (pos && mapRef.current) {
                  mapRef.current.panTo({ lat: pos.lat, lng: pos.lng });
                  mapRef.current.setZoom(17);
                  clearInterval(check);
                }
              }, 500);
              setTimeout(() => clearInterval(check), 10000);
            }
          }}
          className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors ${
            gps.position
              ? 'bg-blue-50 border-blue-300 hover:bg-blue-100'
              : 'bg-gray-50 border-gray-300 hover:bg-blue-50'
          }`}
        >
          <Crosshair size={20} className={gps.position ? 'text-blue-500' : 'text-gray-400'} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
