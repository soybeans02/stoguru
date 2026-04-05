import { useState, useRef, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { StockedRestaurant } from '../stock/StockScreen';
import type { GPSPosition } from '../../hooks/useGPS';
import { distanceMetres, formatDistance } from '../../utils/distance';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? '';

interface Props {
  stocks: StockedRestaurant[];
  panTo: { lat: number; lng: number } | null;
  onPanComplete: () => void;
  userPosition: GPSPosition | null;
  compassGranted: boolean;
  requestCompass: () => void;
}

const defaultCenter: [number, number] = [135.4959, 34.7025]; // [lng, lat] 梅田

// --- 時間帯テーマ ---
interface Theme {
  label: string;
  background: string; water: string; park: string;
  buildingFlat: string; roadCasing: string; road: string;
  rail: string; building3d: string; labelColor: string;
  labelHalo: string; transitColor: string; poiColor: string;
  poiHalo: string;
}

const themes: Record<string, Theme> = {
  morning: {
    label: '🌅 朝',
    background: '#f5f5f5', water: '#aadaff', park: '#c8e6c9',
    buildingFlat: '#e8e8e8', roadCasing: '#e0e0e0', road: '#ffffff',
    rail: '#bdbdbd', building3d: '#e0e0e0', labelColor: '#333333',
    labelHalo: '#ffffff', transitColor: '#333333', poiColor: '#333333',
    poiHalo: 'rgba(255,255,255,0.9)',
  },
  day: {
    label: '☀️ 昼',
    background: '#f5f5f5', water: '#aadaff', park: '#c8e6c9',
    buildingFlat: '#e8e8e8', roadCasing: '#e0e0e0', road: '#ffffff',
    rail: '#bdbdbd', building3d: '#e0e0e0', labelColor: '#333333',
    labelHalo: '#ffffff', transitColor: '#333333', poiColor: '#333333',
    poiHalo: 'rgba(255,255,255,0.9)',
  },
  evening: {
    label: '🌇 夕方',
    background: '#ede8e0', water: '#90c4e8', park: '#a8d5aa',
    buildingFlat: '#ddd8d0', roadCasing: '#d0ccc5', road: '#f8f5f0',
    rail: '#b0a8a0', building3d: '#d5d0c8', labelColor: '#333333',
    labelHalo: '#ede8e0', transitColor: '#333333', poiColor: '#333333',
    poiHalo: 'rgba(237,232,224,0.9)',
  },
  night: {
    label: '🌙 夜',
    background: '#1d2c4d', water: '#17263c', park: '#1b3a2a',
    buildingFlat: '#243b5c', roadCasing: '#2a4470', road: '#3a5a8a',
    rail: '#3a5070', building3d: '#2a4060', labelColor: '#99aabb',
    labelHalo: '#1d2c4d', transitColor: '#8ab4f8', poiColor: '#8899aa',
    poiHalo: 'rgba(29,44,77,0.9)',
  },
};

function getTimeThemeName(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 10) return 'morning';
  if (h >= 10 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'evening';
  return 'night';
}

// 色補間
function hexToRgb(hex: string): [number, number, number] {
  const m = hex.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}
function rgbToHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function lerpColor(a: string, b: string, t: number): string {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  return rgbToHex(ra.map((v, i) => v + (rb[i] - v) * t));
}
function lerpTheme(themeA: Theme, themeB: Theme, t: number): Theme {
  const keys = ['background', 'water', 'park', 'buildingFlat', 'roadCasing', 'road',
    'rail', 'building3d', 'labelColor', 'labelHalo', 'transitColor', 'poiColor'] as const;
  const result: Record<string, string> = { label: t < 0.5 ? themeA.label : themeB.label };
  keys.forEach(k => { result[k] = lerpColor(themeA[k], themeB[k], t); });
  result.poiHalo = `rgba(${hexToRgb(result.background).join(',')},0.9)`;
  return result as unknown as Theme;
}
function getBlendedTheme(): Theme {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  const transitions = [
    { at: 6, from: 'night', to: 'morning' },
    { at: 10, from: 'morning', to: 'day' },
    { at: 17, from: 'day', to: 'evening' },
    { at: 20, from: 'evening', to: 'night' },
  ];
  const blend = 1;
  for (const tr of transitions) {
    const diff = h - tr.at;
    if (diff >= -blend && diff <= blend) {
      const t = (diff + blend) / (blend * 2);
      return lerpTheme(themes[tr.from], themes[tr.to], t);
    }
  }
  return themes[getTimeThemeName()];
}

function buildStyle(t: Theme): mapboxgl.StyleSpecification {
  return {
    version: 8,
    name: 'Stoguru Zenly',
    sources: {
      'mapbox-streets': { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' },
    },
    glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': t.background } },
      { id: 'water', type: 'fill', source: 'mapbox-streets', 'source-layer': 'water',
        paint: { 'fill-color': t.water, 'fill-opacity': 1 } },
      { id: 'park', type: 'fill', source: 'mapbox-streets', 'source-layer': 'landuse',
        filter: ['in', 'class', 'park', 'grass', 'cemetery', 'garden'],
        paint: { 'fill-color': t.park, 'fill-opacity': 0.8 } },
      { id: 'building-flat', type: 'fill', source: 'mapbox-streets', 'source-layer': 'building',
        paint: { 'fill-color': t.buildingFlat, 'fill-opacity': 0.7 } },
      { id: 'building-outline', type: 'line', source: 'mapbox-streets', 'source-layer': 'building',
        paint: { 'line-color': '#b8b0a5', 'line-width': 0.7, 'line-opacity': 0.8 } },
      { id: 'road-casing', type: 'line', source: 'mapbox-streets', 'source-layer': 'road',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'street'],
        paint: { 'line-color': t.roadCasing, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 6, 16, 10, 20, 22] },
        layout: { 'line-cap': 'round', 'line-join': 'round' } },
      { id: 'road', type: 'line', source: 'mapbox-streets', 'source-layer': 'road',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'street'],
        paint: { 'line-color': t.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 4, 16, 7, 20, 18] },
        layout: { 'line-cap': 'round', 'line-join': 'round' } },
      { id: 'rail', type: 'line', source: 'mapbox-streets', 'source-layer': 'road',
        filter: ['==', 'class', 'major_rail'],
        paint: { 'line-color': t.rail, 'line-width': 2, 'line-dasharray': [3, 3] } },
      { id: 'building-3d', type: 'fill-extrusion', source: 'mapbox-streets', 'source-layer': 'building',
        minzoom: 13, filter: ['>=', ['get', 'height'], 100],
        paint: {
          'fill-extrusion-color': t.building3d,
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 15.5, ['get', 'height']],
          'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 15.5, ['get', 'min_height']],
          'fill-extrusion-opacity': 1,
        } },
      { id: 'place-label', type: 'symbol', source: 'mapbox-streets', 'source-layer': 'place_label',
        filter: ['in', 'class', 'city', 'town', 'suburb', 'neighbourhood'],
        layout: {
          'text-field': ['coalesce', ['get', 'name_ja'], ['get', 'name']],
          'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 9, 16, 13],
          'text-anchor': 'center',
        },
        paint: { 'text-color': t.labelColor, 'text-halo-color': t.labelHalo, 'text-halo-width': 1.5 } },
      { id: 'transit-label', type: 'symbol', source: 'mapbox-streets', 'source-layer': 'transit_stop_label',
        layout: {
          'text-field': ['coalesce', ['get', 'name_ja'], ['get', 'name']],
          'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
          'text-size': 10,
        },
        paint: { 'text-color': t.transitColor, 'text-halo-color': t.labelHalo, 'text-halo-width': 1.5, 'text-opacity': 0.8 } },
      { id: 'poi-label', type: 'symbol', source: 'mapbox-streets', 'source-layer': 'poi_label',
        minzoom: 14,
        filter: ['in', 'class', 'landmark', 'place_of_worship', 'park_like', 'college', 'hospital'],
        layout: {
          'text-field': ['coalesce', ['get', 'name_ja'], ['get', 'name']],
          'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 14, 9, 18, 11],
          'text-anchor': 'center', 'text-max-width': 8, 'text-allow-overlap': false,
        },
        paint: { 'text-color': t.poiColor, 'text-halo-color': t.poiHalo, 'text-halo-width': 2, 'text-opacity': 0.8 } },
    ],
  } as mapboxgl.StyleSpecification;
}

function applyThemeColors(map: mapboxgl.Map, t: Theme) {
  if (!map.isStyleLoaded()) return;
  map.setPaintProperty('background', 'background-color', t.background);
  map.setPaintProperty('water', 'fill-color', t.water);
  map.setPaintProperty('park', 'fill-color', t.park);
  map.setPaintProperty('building-flat', 'fill-color', t.buildingFlat);
  map.setPaintProperty('road-casing', 'line-color', t.roadCasing);
  map.setPaintProperty('road', 'line-color', t.road);
  map.setPaintProperty('rail', 'line-color', t.rail);
  map.setPaintProperty('building-3d', 'fill-extrusion-color', t.building3d);
  map.setPaintProperty('place-label', 'text-color', t.labelColor);
  map.setPaintProperty('place-label', 'text-halo-color', t.labelHalo);
  map.setPaintProperty('transit-label', 'text-color', t.transitColor);
  map.setPaintProperty('transit-label', 'text-halo-color', t.labelHalo);
  map.setPaintProperty('poi-label', 'text-color', t.poiColor);
  map.setPaintProperty('poi-label', 'text-halo-color', t.poiHalo);
}

// ティアドロップ型ピン画像をCanvasで生成 → ImageData返却（Mapbox addImage互換）
function createPinImage(color: string, size: number = 40): { width: number; height: number; data: Uint8Array } {
  const w = size;
  const h = Math.round(size * 1.3);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const r = size * 0.38;
  const cx = w / 2;
  const headY = r + 2;

  // 影
  ctx.beginPath();
  ctx.ellipse(cx, h - 3, r * 0.5, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fill();

  // 尖り部分
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, headY + r * 0.7);
  ctx.quadraticCurveTo(cx, h - 4, cx, h - 4);
  ctx.quadraticCurveTo(cx, h - 4, cx + r * 0.55, headY + r * 0.7);
  ctx.fillStyle = color;
  ctx.fill();

  // 丸い頭（白枠）
  ctx.beginPath();
  ctx.arc(cx, headY, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, headY, r - 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  const imgData = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: new Uint8Array(imgData.data.buffer) };
}

const LABEL_LAYERS = ['place-label', 'transit-label', 'poi-label'];

export function SimpleMapViewMapbox({ stocks, panTo, onPanComplete, userPosition, compassGranted, requestCompass }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [labelsOn, setLabelsOn] = useState(true);
  const [is3D, setIs3D] = useState(true);
  const [, setThemeLabel] = useState(() => getBlendedTheme().label);
  const initialCenterSet = useRef(false);
  const mapLoadedRef = useRef(false);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const t = getBlendedTheme();
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: buildStyle(t),
      center: defaultCenter,
      zoom: 15.5,
      pitch: 50,
      bearing: -15,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current = map;
    setThemeLabel(t.label);

    // マップロード完了 → レイヤー初期化
    const initLayers = () => {
      if (mapLoadedRef.current) return;
      if (mapRef.current !== map) return;
      mapLoadedRef.current = true;
      try {
      if (!map.hasImage('pin-red')) map.addImage('pin-red', createPinImage('#ff5a5a', 40));
      if (!map.hasImage('pin-green')) map.addImage('pin-green', createPinImage('#4ade80', 40));

      // 空のGeoJSONソースとレイヤーを事前追加
      map.addSource('stocks', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('user-location', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      // 縮小時: 丸ピン
      map.addLayer({ id: 'stocks-outline', type: 'circle', source: 'stocks', maxzoom: 15,
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 7], 'circle-color': '#ffffff' } });
      map.addLayer({ id: 'stocks-circle', type: 'circle', source: 'stocks', maxzoom: 15,
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 5],
          'circle-color': ['case', ['==', ['get', 'visited'], 1], '#4ade80', '#ff5a5a'] } });
      // 拡大時: ティアドロップピン
      map.addLayer({ id: 'stocks-pin', type: 'symbol', source: 'stocks', minzoom: 15,
        layout: { 'icon-image': ['case', ['==', ['get', 'visited'], 1], 'pin-green', 'pin-red'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.6, 18, 1],
          'icon-anchor': 'bottom', 'icon-allow-overlap': true } });
      // ユーザー位置
      map.addLayer({ id: 'user-glow', type: 'circle', source: 'user-location',
        paint: { 'circle-radius': 14, 'circle-color': 'rgba(59,130,246,0.15)' } });
      map.addLayer({ id: 'user-outline', type: 'circle', source: 'user-location',
        paint: { 'circle-radius': 8, 'circle-color': '#ffffff' } });
      map.addLayer({ id: 'user-dot', type: 'circle', source: 'user-location',
        paint: { 'circle-radius': 5, 'circle-color': '#3b82f6' } });

      // クリックハンドラ
      const handleClick = (e: mapboxgl.MapMouseEvent & { features?: GeoJSON.Feature[] }, offset: number) => {
        if (!e.features?.length) return;
        const f = e.features[0];
        const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
        const p = f.properties!;
        const uPos = userPosRef.current;
        const dist = uPos ? formatDistance(distanceMetres(uPos.lat, uPos.lng, coords[1], coords[0])) : p.distance;
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ offset, closeButton: true, maxWidth: '220px' })
          .setLngLat(coords)
          .setHTML(`<div style="font-family:system-ui,sans-serif;padding:2px">
            <p style="font-weight:700;font-size:13px;color:#111;margin:0">${p.name}</p>
            <p style="font-size:11px;color:#9ca3af;margin:4px 0">${dist} · ${p.genre}</p>
            ${p.visited ? '<span style="display:inline-block;background:#22c55e;color:#fff;font-size:10px;padding:1px 6px;border-radius:4px">visited</span>' : ''}
            ${p.videoUrl ? `<a href="${p.videoUrl}" target="_blank" rel="noopener" style="display:block;font-size:11px;color:#6b7280;font-weight:500;margin-top:6px;text-decoration:none">動画を見る →</a>` : ''}
          </div>`).addTo(map);
      };
      map.on('click', 'stocks-circle', (e) => handleClick(e, 12));
      map.on('click', 'stocks-pin', (e) => handleClick(e, 25));
      ['stocks-circle', 'stocks-pin'].forEach(id => {
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      });

      // 初期データがあれば反映
      const stockSrc = map.getSource('stocks') as mapboxgl.GeoJSONSource | undefined;
      if (stockSrc && stocksRef.current.length > 0) {
        stockSrc.setData({
          type: 'FeatureCollection',
          features: stocksRef.current.map(r => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
            properties: {
              id: r.id, name: r.name, genre: r.genre || '',
              visited: r.visited ? 1 : 0, distance: r.distance || '',
              videoUrl: r.videoUrl || '',
            },
          })),
        });
      }
      const userSrc = map.getSource('user-location') as mapboxgl.GeoJSONSource | undefined;
      if (userSrc && userPosRef.current) {
        userSrc.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [userPosRef.current.lng, userPosRef.current.lat] },
            properties: {},
          }],
        });
      }
      } catch (err) { console.error('initLayers error:', err); mapLoadedRef.current = false; }
    };
    // loaded()がtrueならすでにload済み（HMR等）→ 即実行、そうでなければイベント待ち
    if (map.loaded()) {
      initLayers();
    } else {
      map.on('load', initLayers);
      map.once('style.load', initLayers);
    }

    // 自動グラデーション更新（1分ごと）
    const timer = setInterval(() => {
      if (!mapRef.current) return;
      const blended = getBlendedTheme();
      applyThemeColors(mapRef.current, blended);
      setThemeLabel(blended.label);
    }, 60000);

    return () => { clearInterval(timer); map.remove(); mapRef.current = null; mapLoadedRef.current = false; };
  }, []);

  // Pan to location
  useEffect(() => {
    if (mapRef.current && panTo) {
      mapRef.current.flyTo({ center: [panTo.lng, panTo.lat], zoom: 17 });
      initialCenterSet.current = true;
      onPanComplete();
    }
  }, [panTo, onPanComplete]);

  // Set initial center to user position
  useEffect(() => {
    if (mapRef.current && userPosition && !initialCenterSet.current) {
      initialCenterSet.current = true;
      mapRef.current.flyTo({ center: [userPosition.lng, userPosition.lat], zoom: 15, duration: 1000 });
    }
  }, [userPosition]);

  // Refs for accessing latest data inside map event handlers
  const stocksRef = useRef(stocks);
  stocksRef.current = stocks;
  const userPosRef = useRef(userPosition);
  userPosRef.current = userPosition;

  // データ更新のみ（ソース/レイヤーはon('load')で作成済み）
  const updateData = useCallback((s: StockedRestaurant[], uPos: GPSPosition | null) => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const stockSrc = map.getSource('stocks') as mapboxgl.GeoJSONSource | undefined;
    if (stockSrc) {
      stockSrc.setData({
        type: 'FeatureCollection',
        features: s.map(r => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
          properties: {
            id: r.id, name: r.name, genre: r.genre || '',
            visited: r.visited ? 1 : 0, distance: r.distance || '',
            videoUrl: r.videoUrl || '',
          },
        })),
      });
    }
    const userSrc = map.getSource('user-location') as mapboxgl.GeoJSONSource | undefined;
    if (userSrc) {
      userSrc.setData({
        type: 'FeatureCollection',
        features: uPos ? [{
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [uPos.lng, uPos.lat] },
          properties: {},
        }] : [],
      });
    }
  }, []);

  useEffect(() => {
    updateData(stocks, userPosition);
  }, [stocks, userPosition, updateData]);

  // Toggle 3D
  const handleToggle3D = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (is3D) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
      map.setLayoutProperty('building-3d', 'visibility', 'none');
      if (labelsOn) map.setLayoutProperty('poi-label', 'visibility', 'visible');
    } else {
      map.easeTo({ pitch: 50, bearing: -15, duration: 800 });
      map.setLayoutProperty('building-3d', 'visibility', 'visible');
      map.setLayoutProperty('poi-label', 'visibility', 'none');
    }
    setIs3D(!is3D);
  }, [is3D, labelsOn]);

  // Toggle labels
  const handleToggleLabels = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const next = !labelsOn;
    const vis = next ? 'visible' : 'none';
    LABEL_LAYERS.forEach(id => {
      if (id === 'poi-label' && is3D) {
        map.setLayoutProperty(id, 'visibility', 'none');
      } else {
        map.setLayoutProperty(id, 'visibility', vis);
      }
    });
    setLabelsOn(next);
  }, [labelsOn, is3D]);

  return (
    <div className="flex-1 relative">
      <style>{`
        .mapboxgl-ctrl-logo { width: 60px !important; height: 16px !important; }
        .mapboxgl-ctrl-attrib { font-size: 8px !important; padding: 1px 4px !important; }
        .mapboxgl-ctrl-attrib a { font-size: 8px !important; }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />

      {/* Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        <button
          onClick={handleToggle3D}
          className="bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 text-[13px] font-semibold text-gray-700 shadow-sm"
        >
          {is3D ? '3D → 2D' : '2D → 3D'}
        </button>
        <button
          onClick={handleToggleLabels}
          className="bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 text-[13px] font-semibold text-gray-700 shadow-sm"
        >
          {labelsOn ? 'ラベル非表示' : 'ラベル表示'}
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-10 left-2 bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1.5 flex gap-2 text-[10px] text-gray-600 shadow-sm">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> 保存
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> 行った
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> 現在地
        </span>
      </div>

      {/* Compass button */}
      {!compassGranted && (
        <div className="absolute bottom-4 right-4">
          <button
            onClick={requestCompass}
            className="bg-blue-500 text-white backdrop-blur-sm rounded-lg px-3 py-2 text-[11px] font-medium shadow-sm"
          >
            方向を表示
          </button>
        </div>
      )}
    </div>
  );
}
