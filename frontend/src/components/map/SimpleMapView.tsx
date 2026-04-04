import { useState, useCallback } from 'react';
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
}

const containerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 34.7025, lng: 135.4959 }; // 梅田

export function SimpleMapView({ stocks, panTo, onPanComplete, userPosition }: Props) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedPin, setSelectedPin] = useState<StockedRestaurant | null>(null);

  const onLoad = useCallback((m: google.maps.Map) => setMap(m), []);

  // Pan to location
  if (map && panTo) {
    map.panTo(panTo);
    map.setZoom(16);
    onPanComplete();
  }

  const center = userPosition ?? defaultCenter;

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
        {/* Current location marker */}
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
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: s.visited ? '#22c55e' : '#ef4444',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 2,
              scale: 10,
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

      {/* Legend */}
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
    </div>
  );
}
