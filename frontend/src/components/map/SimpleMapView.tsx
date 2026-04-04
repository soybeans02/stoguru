import { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import type { StockedRestaurant } from '../stock/StockScreen';
import type { GPSPosition } from '../../hooks/useGPS';
import { distanceMetres, formatDistance } from '../../utils/distance';

const MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID;

interface Props {
  stocks: StockedRestaurant[];
  panTo: { lat: number; lng: number } | null;
  onPanComplete: () => void;
  userPosition: GPSPosition | null;
  compassGranted: boolean;
  requestCompass: () => void;
}

const containerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 34.7025, lng: 135.4959 }; // 梅田

export function SimpleMapView({ stocks, panTo, onPanComplete, userPosition, compassGranted, requestCompass }: Props) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedPin, setSelectedPin] = useState<StockedRestaurant | null>(null);
  const [labelsOn, setLabelsOn] = useState(true);
  const [zoom, setZoom] = useState(15);
  const initialCenterSet = useRef(false);

  const onLoad = useCallback((m: google.maps.Map) => {
    setMap(m);
    m.addListener('zoom_changed', () => setZoom(m.getZoom() ?? 15));
  }, []);

  // Pan to location (from stock screen "マップ" button)
  useEffect(() => {
    if (map && panTo) {
      map.panTo(panTo);
      map.setZoom(17);
      onPanComplete();
    }
  }, [map, panTo, onPanComplete]);

  // Toggle labels
  useEffect(() => {
    if (!map) return;
    if (labelsOn) {
      map.setOptions({ styles: [] });
    } else {
      map.setOptions({
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      });
    }
  }, [map, labelsOn]);

  // Set initial center to user position (once only)
  useEffect(() => {
    if (map && userPosition && !initialCenterSet.current) {
      initialCenterSet.current = true;
      map.panTo(userPosition);
    }
  }, [map, userPosition]);

  const center = defaultCenter;

  if (!isLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">マップを読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={15}
        onLoad={onLoad}
        options={{
          mapId: MAP_ID,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
        }}
      >
        {/* Current location: heading cone (DeviceOrientation) */}
        {userPosition && userPosition.heading != null && (
          <Marker
            position={userPosition}
            icon={{
              path: 'M0,0 L-18,-45 A50,50 0 0,1 18,-45 Z',
              fillColor: '#4285F4',
              fillOpacity: 0.25,
              strokeColor: '#4285F4',
              strokeOpacity: 0.4,
              strokeWeight: 1,
              scale: 1,
              rotation: userPosition.heading,
              anchor: new google.maps.Point(0, 0),
            }}
            zIndex={99}
          />
        )}
        {/* Current location: blue dot */}
        {userPosition && (
          <Marker
            position={userPosition}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: '#3b82f6',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 3,
              scale: 8,
            }}
            zIndex={100}
          />
        )}

        {stocks.map((s) => (
          <Marker
            key={s.id}
            position={{ lat: s.lat, lng: s.lng }}
            icon={zoom >= 14 ? {
              path: 'M12 0C7.03 0 3 4.03 3 9c0 6.75 9 15 9 15s9-8.25 9-15c0-4.97-4.03-9-9-9zm0 12.75c-2.07 0-3.75-1.68-3.75-3.75S9.93 5.25 12 5.25 15.75 6.93 15.75 9 14.07 12.75 12 12.75z',
              fillColor: s.visited ? '#22c55e' : '#ef4444',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 1.5,
              scale: 1.1,
              anchor: new google.maps.Point(12, 24),
            } : {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: s.visited ? '#22c55e' : '#ef4444',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 1.5,
              scale: 6,
            }}
            onClick={() => setSelectedPin(s)}
            onUnmount={(marker) => marker.setMap(null)}
          />
        ))}

        {selectedPin && (
          <InfoWindow
            position={{ lat: selectedPin.lat, lng: selectedPin.lng }}
            onCloseClick={() => setSelectedPin(null)}
          >
            <div className="p-1 min-w-[160px]">
              <p className="font-bold text-sm text-gray-900">{selectedPin.name}</p>
              <p className="text-xs text-gray-500 mt-1">
                {userPosition
                  ? formatDistance(distanceMetres(userPosition.lat, userPosition.lng, selectedPin.lat, selectedPin.lng))
                  : selectedPin.distance}
                {' · '}{selectedPin.genre}
              </p>
              {selectedPin.visited && (
                <span className="inline-block bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded mt-1">
                  visited
                </span>
              )}
              <button
                className="block text-gray-500 text-xs font-medium mt-2"
                onClick={() => window.open(selectedPin.videoUrl, '_blank')}
              >
                動画を見る →
              </button>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Legend + label toggle */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 flex gap-3 text-[11px] text-gray-600 shadow-sm">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> ストック
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> 行った
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> 現在地
        </span>
      </div>
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        {!compassGranted && (
          <button
            onClick={requestCompass}
            className="bg-blue-500 text-white backdrop-blur-sm rounded-lg px-3 py-2 text-[11px] font-medium shadow-sm"
          >
            方向を表示
          </button>
        )}
        <button
          onClick={() => setLabelsOn(!labelsOn)}
          className={`bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 text-[11px] font-medium shadow-sm transition-colors ${labelsOn ? 'text-gray-600' : 'text-gray-400'}`}
        >
          {labelsOn ? 'ラベル非表示' : 'ラベル表示'}
        </button>
      </div>
    </div>
  );
}
