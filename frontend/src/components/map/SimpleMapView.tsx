import { useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import type { StockedRestaurant } from '../stock/StockScreen';
import { GENRE_EMOJI } from '../../data/mockRestaurants';

const MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID;

interface Props {
  stocks: StockedRestaurant[];
  panTo: { lat: number; lng: number } | null;
  onPanComplete: () => void;
}

const containerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 34.7025, lng: 135.4959 }; // 梅田

export function SimpleMapView({ stocks, panTo, onPanComplete }: Props) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '',
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

  if (!isLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100">
        <p className="text-gray-400 text-sm">マップを読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={defaultCenter}
        zoom={15}
        onLoad={onLoad}
        options={{
          mapId: MAP_ID,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
        }}
      >
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
              <p className="font-bold text-sm text-gray-900">
                {GENRE_EMOJI[selectedPin.genre] ?? '🍽️'} {selectedPin.name}
              </p>
              <p className="text-xs text-gray-500 mt-1">📍 {selectedPin.distance}</p>
              {selectedPin.visited && (
                <span className="inline-block bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded mt-1">
                  ✓ 行った
                </span>
              )}
              <button
                className="block text-orange-500 text-xs font-bold mt-2"
                onClick={() => window.open(selectedPin.videoUrl, '_blank')}
              >
                ▶ 動画を見る
              </button>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-gray-900/90 rounded-xl px-3 py-2 flex gap-3 text-[11px] text-gray-200">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> ストック
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> 行った
        </span>
      </div>
    </div>
  );
}
