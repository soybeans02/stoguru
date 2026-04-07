import { useState, useRef, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { StockedRestaurant } from '../stock/StockScreen';
import type { GPSPosition } from '../../hooks/useGPS';
import { distanceMetres, formatDistance } from '../../utils/distance';
import { fetchFollowingRestaurants, getFollowing, getUserProfile, getInfluencerRestaurants } from '../../utils/api';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? '';

interface Props {
  stocks: StockedRestaurant[];
  panTo: { lat: number; lng: number; restaurant?: StockedRestaurant } | null;
  onPanComplete: () => void;
  userPosition: GPSPosition | null;
  compassGranted?: boolean;
  requestCompass?: () => void;
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
    background: '#fff5ee', water: '#a8c8e8', park: '#b8d4a8',
    buildingFlat: '#f0ddd0', roadCasing: '#e8d8cc', road: '#fff8f2',
    rail: '#c8b8a8', building3d: '#e8d5c8', labelColor: '#4a3830',
    labelHalo: '#fff5ee', transitColor: '#4a3830', poiColor: '#5a4840',
    poiHalo: 'rgba(255,245,238,0.9)',
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
    background: '#c8886a', water: '#6888a8', park: '#6a8858',
    buildingFlat: '#b87860', roadCasing: '#a87058', road: '#d8a888',
    rail: '#987060', building3d: '#b07058', labelColor: '#f0e8e0',
    labelHalo: '#5a3828', transitColor: '#f0e8e0', poiColor: '#e8ddd5',
    poiHalo: 'rgba(90,56,40,0.9)',
  },
  night: {
    label: '🌙 夜',
    background: '#1d2c4d', water: '#17263c', park: '#1b3a2a',
    buildingFlat: '#243b5c', roadCasing: '#2a4470', road: '#3a5a8a',
    rail: '#3a5070', building3d: '#2a4060', labelColor: '#c8d8e8',
    labelHalo: '#0e1a30', transitColor: '#8ab4f8', poiColor: '#b0c0d0',
    poiHalo: 'rgba(14,26,48,0.9)',
  },
};

// --- 太陽位置計算（NOAA簡易版） ---
function calcSunTimes(lat: number, lng: number, date: Date = new Date()): { sunrise: number; sunset: number } {
  const rad = Math.PI / 180;
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
  const declination = -23.45 * Math.cos(rad * (360 / 365) * (dayOfYear + 10));
  const latRad = lat * rad;
  const declRad = declination * rad;
  const cosHA = (Math.sin(-0.833 * rad) - Math.sin(latRad) * Math.sin(declRad)) / (Math.cos(latRad) * Math.cos(declRad));
  const ha = Math.acos(Math.max(-1, Math.min(1, cosHA))) / rad;
  const solarNoon = 12 - lng / 15;  // UTC hours
  const tzOffset = -date.getTimezoneOffset() / 60;
  const sunrise = solarNoon - ha / 15 + tzOffset;
  const sunset = solarNoon + ha / 15 + tzOffset;
  return { sunrise, sunset };
}

// デフォルト: 大阪付近の概算値（GPS未取得時のフォールバック）
let sunTimes = { sunrise: 6, sunset: 18 };

function updateSunTimes(lat: number, lng: number) {
  sunTimes = calcSunTimes(lat, lng);
}

// 色補間
function hexToRgb(hex: string): [number, number, number] {
  const m = hex.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}
function rgbToHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
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

/**
 * 現在時刻に基づいてテーマを決定する。
 * 各遷移は30分かけてグラデーション（重なりなし）。
 * night → morning → day → evening → night
 */
function getBlendedTheme(): Theme {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  const { sunrise, sunset } = sunTimes;

  // 各フェーズの境界を定義（重ならないように配置）
  // night → morning: sunrise の30分前から30分かけて遷移
  // morning → day:   sunrise の30分後から30分かけて遷移
  // day → evening:   sunset  の30分前から30分かけて遷移
  // evening → night: sunset  の30分後から30分かけて遷移
  const dur = 0.5; // 遷移にかける時間（30分）
  const transitions = [
    { start: sunrise - dur, from: 'night',   to: 'morning' },
    { start: sunrise,       from: 'morning', to: 'day' },
    { start: sunset - dur,  from: 'day',     to: 'evening' },
    { start: sunset,        from: 'evening', to: 'night' },
  ];

  for (const tr of transitions) {
    if (h >= tr.start && h < tr.start + dur) {
      const t = (h - tr.start) / dur;
      return lerpTheme(themes[tr.from], themes[tr.to], t);
    }
  }

  // 遷移区間外 → 固定テーマ
  if (h < sunrise - dur) return themes.night;
  if (h < sunrise) return themes.night;       // ↑ のtransitionでカバー済みだがフォールバック
  if (h < sunrise + dur) return themes.day;   // ↑ 同上
  if (h < sunset - dur) return themes.day;
  if (h < sunset + dur) return themes.evening;// ↑ 同上
  return themes.night;
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
        filter: ['match', ['get', 'class'], ['park', 'grass', 'cemetery', 'garden'], true, false],
        paint: { 'fill-color': t.park, 'fill-opacity': 0.8 } },
      { id: 'building-flat', type: 'fill', source: 'mapbox-streets', 'source-layer': 'building',
        paint: { 'fill-color': t.buildingFlat, 'fill-opacity': 0.7 } },
      { id: 'building-outline', type: 'line', source: 'mapbox-streets', 'source-layer': 'building',
        paint: { 'line-color': '#b8b0a5', 'line-width': 0.7, 'line-opacity': 0.8 } },
      { id: 'road-casing', type: 'line', source: 'mapbox-streets', 'source-layer': 'road',
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'street'], true, false],
        paint: { 'line-color': t.roadCasing, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 6, 16, 10, 20, 22] },
        layout: { 'line-cap': 'round', 'line-join': 'round' } },
      { id: 'road', type: 'line', source: 'mapbox-streets', 'source-layer': 'road',
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'street'], true, false],
        paint: { 'line-color': t.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 4, 16, 7, 20, 18] },
        layout: { 'line-cap': 'round', 'line-join': 'round' } },
      { id: 'rail', type: 'line', source: 'mapbox-streets', 'source-layer': 'road',
        filter: ['==', 'class', 'major_rail'],
        paint: { 'line-color': t.rail, 'line-width': 2, 'line-dasharray': [3, 3] } },
      { id: 'building-3d', type: 'fill-extrusion', source: 'mapbox-streets', 'source-layer': 'building',
        minzoom: 13, filter: ['>=', ['get', 'height'], 80],
        paint: {
          'fill-extrusion-color': t.building3d,
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 15.5, ['get', 'height']],
          'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 15.5, ['get', 'min_height']],
          'fill-extrusion-opacity': 1,
        } },
      { id: 'place-label', type: 'symbol', source: 'mapbox-streets', 'source-layer': 'place_label',
        filter: ['match', ['get', 'class'], ['city', 'town', 'suburb', 'neighbourhood'], true, false],
        layout: {
          'text-field': ['coalesce', ['get', 'name_ja'], ['get', 'name']],
          'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 9, 16, 13],
          'text-anchor': 'center',
          'symbol-z-elevate': true,
        },
        paint: { 'text-color': t.labelColor, 'text-halo-color': t.labelHalo, 'text-halo-width': 1.5 } },
      { id: 'transit-label', type: 'symbol', source: 'mapbox-streets', 'source-layer': 'transit_stop_label',
        layout: {
          'text-field': ['coalesce', ['get', 'name_ja'], ['get', 'name']],
          'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
          'text-size': 10,
          'symbol-z-elevate': true,
        },
        paint: { 'text-color': t.transitColor, 'text-halo-color': t.labelHalo, 'text-halo-width': 1.5, 'text-opacity': 0.8 } },
      { id: 'poi-label', type: 'symbol', source: 'mapbox-streets', 'source-layer': 'poi_label',
        minzoom: 14,
        filter: ['match', ['get', 'class'], ['landmark', 'place_of_worship', 'park_like', 'college', 'hospital'], true, false],
        layout: {
          'text-field': ['coalesce', ['get', 'name_ja'], ['get', 'name']],
          'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 14, 9, 18, 11],
          'text-anchor': 'center', 'text-max-width': 8, 'text-allow-overlap': false,
          'symbol-z-elevate': true,
        },
        paint: { 'text-color': t.poiColor, 'text-halo-color': t.poiHalo, 'text-halo-width': 2, 'text-opacity': 0.8 } },
      // 高ズーム時: 建物名ラベル（飲食店・ショップは除外）
      { id: 'building-label', type: 'symbol', source: 'mapbox-streets', 'source-layer': 'poi_label',
        minzoom: 14.5,
        filter: ['match', ['get', 'class'], ['commercial', 'lodging', 'public_facility', 'general', 'motorist', 'parking', 'parking_garage'], true, false],
        layout: {
          'text-field': ['coalesce', ['get', 'name_ja'], ['get', 'name']],
          'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 14.5, 9, 18, 12],
          'text-anchor': 'center', 'text-max-width': 7, 'text-allow-overlap': false,
          'text-optional': true,
          'symbol-z-elevate': true,
        },
        paint: { 'text-color': t.poiColor, 'text-halo-color': t.poiHalo, 'text-halo-width': 1.5, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, 0, 15, 0.8] } },
    ],
  } as mapboxgl.StyleSpecification;
}

function applyThemeColors(map: mapboxgl.Map, t: Theme) {
  if (!map.isStyleLoaded()) return;
  try {
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
    map.setPaintProperty('building-label', 'text-color', t.poiColor);
    map.setPaintProperty('building-label', 'text-halo-color', t.poiHalo);
  } catch {}
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

/** ストグルロゴ入りピン（オレンジグラデーション + フォーク&ナイフ） */
function createLogoPinImage(size: number = 48): { width: number; height: number; data: Uint8Array } {
  const w = size;
  const h = Math.round(size * 1.4);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const r = size * 0.4;
  const cx = w / 2;
  const headY = r + 2;

  // 影
  ctx.beginPath();
  ctx.ellipse(cx, h - 3, r * 0.5, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fill();

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#FF6B6B');
  grad.addColorStop(1, '#FF8E53');

  // 尖り部分
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, headY + r * 0.7);
  ctx.quadraticCurveTo(cx, h - 4, cx, h - 4);
  ctx.quadraticCurveTo(cx, h - 4, cx + r * 0.55, headY + r * 0.7);
  ctx.fillStyle = grad;
  ctx.fill();

  // 丸い頭（白枠）
  ctx.beginPath();
  ctx.arc(cx, headY, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, headY, r - 3, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // フォーク&ナイフアイコン（白）— ロゴと同じデザイン
  const s = r / 20;
  const iconCenterY = headY + 2 * s; // アイコンを少し下にオフセット
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.fillStyle = '#ffffff';

  // フォーク（左寄り、-22度回転）
  ctx.save();
  ctx.translate(cx, iconCenterY);
  ctx.rotate(-22 * Math.PI / 180);
  ctx.lineWidth = 2 * s;
  // 柄
  ctx.beginPath(); ctx.moveTo(0, -12 * s); ctx.lineTo(0, 6 * s); ctx.stroke();
  // 左歯
  ctx.beginPath(); ctx.moveTo(-3 * s, -12 * s); ctx.lineTo(-3 * s, -7 * s); ctx.stroke();
  // 右歯
  ctx.beginPath(); ctx.moveTo(3 * s, -12 * s); ctx.lineTo(3 * s, -7 * s); ctx.stroke();
  // カーブ
  ctx.beginPath();
  ctx.moveTo(-3 * s, -7 * s);
  ctx.quadraticCurveTo(0, -4 * s, 3 * s, -7 * s);
  ctx.stroke();
  ctx.restore();

  // ナイフ（右寄り、+22度回転）
  ctx.save();
  ctx.translate(cx, iconCenterY);
  ctx.rotate(22 * Math.PI / 180);
  ctx.lineWidth = 2.2 * s;
  // 柄
  ctx.beginPath(); ctx.moveTo(0, -12 * s); ctx.lineTo(0, 6 * s); ctx.stroke();
  // 刃（カーブ）
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(0, -12 * s);
  ctx.quadraticCurveTo(5 * s, -8 * s, 0, -4 * s);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  const imgData = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: new Uint8Array(imgData.data.buffer) };
}

const LABEL_LAYERS = ['place-label', 'transit-label', 'poi-label', 'building-label'];

function buildPopupHTML(p: { name: string; genre: string; distance: string; videoUrl: string; photoEmoji: string; photoUrls?: string; scene: string[]; priceRange: string; lat: number; lng: number; ownerNickname?: string }, userPos: GPSPosition | null): string {
  const dist = userPos ? formatDistance(distanceMetres(userPos.lat, userPos.lng, p.lat, p.lng)) : p.distance;
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  const dark = h < sunTimes.sunrise || h >= sunTimes.sunset;
  const bg = dark ? 'rgba(30,30,40,0.92)' : '#fff';
  const border = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)';
  const nameColor = dark ? '#f0f0f0' : '#111';
  const metaColor = dark ? '#888' : '#9ca3af';
  const tagBg = dark ? 'rgba(255,255,255,0.08)' : '#f3f4f6';
  const tagColor = dark ? '#aaa' : '#6b7280';
  const btnVidBg = dark ? 'rgba(255,255,255,0.1)' : '#f3f4f6';
  const btnVidColor = dark ? '#ddd' : '#555';
  const emojiBg = dark ? 'rgba(255,255,255,0.08)' : '#f9fafb';
  const sceneTags = (p.scene || []).slice(0, 2)
    .map((s: string) => `<span style="background:${tagBg};color:${tagColor};font-size:9px;padding:3px 8px;border-radius:6px">${s}</span>`).join('');
  return `
    <div style="font-family:system-ui,sans-serif;background:${bg};border-radius:14px;padding:12px 14px;border:${border};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)">
      <div style="display:flex;align-items:center;gap:8px">
        ${p.photoUrls ? `<img src="${p.photoUrls}" style="width:36px;height:36px;border-radius:10px;object-fit:cover;flex-shrink:0" />` : `<div style="width:36px;height:36px;border-radius:10px;background:${emojiBg};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${p.photoEmoji || '🍽️'}</div>`}
        <div style="min-width:0;flex:1">
          <div style="font-size:13px;font-weight:700;color:${nameColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
          ${p.ownerNickname ? `<div style="font-size:9px;color:#a855f7;margin-top:1px;font-weight:600">@${p.ownerNickname}</div>` : ''}
          <div style="font-size:10px;color:${metaColor};margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${dist} · ${p.genre}${p.priceRange ? ' · ' + p.priceRange : ''}</div>
        </div>
      </div>
      ${sceneTags ? `<div style="display:flex;gap:4px;margin-top:8px">${sceneTags}</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:10px">
        ${p.videoUrl ? `<a href="${p.videoUrl}" target="_blank" rel="noopener" style="flex:1;text-align:center;font-size:10px;font-weight:600;padding:6px 0;border-radius:8px;background:${btnVidBg};color:${btnVidColor};text-decoration:none;display:block">▶ 動画</a>` : ''}
        <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener" style="flex:1;text-align:center;font-size:10px;font-weight:600;padding:6px 0;border-radius:8px;background:#3b82f6;color:#fff;text-decoration:none;display:block">ナビ</a>
      </div>
    </div>
  `;
}

export function SimpleMapViewMapbox({ stocks, panTo, onPanComplete, userPosition }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [mapMode, setMapMode] = useState<'standard' | '3d'>('3d');
  const [simpleMode, setSimpleMode] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [showFollowingPicker, setShowFollowingPicker] = useState(false);
  const [followingUsers, setFollowingUsers] = useState<{ id: string; nickname: string }[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [selectedFollowUser, setSelectedFollowUser] = useState<string | null>(null);
  const [followingData, setFollowingData] = useState<Record<string, unknown>[]>([]);
  const followingDataRef = useRef<Record<string, unknown>[]>([]);
  const followingLoaded = useRef(false);
  const myPostedRef = useRef<Record<string, unknown>[]>([]);
  const myPostedLoading = useRef(false);
  const myPostedLoaded = useRef(false);
  const initialCenterSet = useRef(false);
  const mapLoadedRef = useRef(false);

  // GPS取得時に日の出/日の入り時刻を更新 → テーマを即再適用
  useEffect(() => {
    if (userPosition) {
      updateSunTimes(userPosition.lat, userPosition.lng);
      if (mapRef.current?.isStyleLoaded()) {
        applyThemeColors(mapRef.current, getBlendedTheme());
      }
    }
  }, [userPosition]);

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


    // マップロード完了 → レイヤー初期化
    const initLayers = () => {
      if (mapLoadedRef.current) return;
      if (mapRef.current !== map) return;
      mapLoadedRef.current = true;
      try {
      if (!map.hasImage('pin-red')) map.addImage('pin-red', createPinImage('#ff5a5a', 40));
      if (!map.hasImage('pin-green')) map.addImage('pin-green', createPinImage('#4ade80', 40));
      if (!map.hasImage('pin-purple')) map.addImage('pin-purple', createPinImage('#a855f7', 40));
      if (!map.hasImage('pin-logo')) map.addImage('pin-logo', createLogoPinImage(48));

      // 空のGeoJSONソースとレイヤーを事前追加
      map.addSource('stocks', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('my-posted', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('following', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('user-location', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('panTo-pin', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      // フォロー中: 丸ピン（保存=紫, 行った=緑）+ 紫枠で区別
      map.addLayer({ id: 'following-outline', type: 'circle', source: 'following', maxzoom: 15,
        layout: { visibility: 'none' },
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 14, 8], 'circle-color': '#ffffff' } });
      map.addLayer({ id: 'following-circle', type: 'circle', source: 'following', maxzoom: 15,
        layout: { visibility: 'none' },
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 5],
          'circle-color': ['case', ['==', ['get', 'isPosted'], 1], '#a855f7', ['==', ['get', 'visited'], 1], '#4ade80', '#ff5a5a'] } });
      map.addLayer({ id: 'following-pin', type: 'symbol', source: 'following', minzoom: 15,
        layout: { visibility: 'none',
          'icon-image': ['case', ['==', ['get', 'isPosted'], 1], 'pin-purple', ['==', ['get', 'visited'], 1], 'pin-green', 'pin-red'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.6, 18, 1],
          'icon-anchor': 'bottom', 'icon-allow-overlap': true } });

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
      // 自分の投稿（紫ピン）
      map.addLayer({ id: 'my-posted-outline', type: 'circle', source: 'my-posted', maxzoom: 15,
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 7], 'circle-color': '#ffffff' } });
      map.addLayer({ id: 'my-posted-circle', type: 'circle', source: 'my-posted', maxzoom: 15,
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 5], 'circle-color': '#a855f7' } });
      map.addLayer({ id: 'my-posted-pin', type: 'symbol', source: 'my-posted', minzoom: 15,
        layout: { 'icon-image': 'pin-purple',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.6, 18, 1],
          'icon-anchor': 'bottom', 'icon-allow-overlap': true } });
      // panTo一時ピン（スワイプ/保存カードからマップに飛んだ時用）
      map.addLayer({ id: 'panTo-pin-icon', type: 'symbol', source: 'panTo-pin',
        layout: { 'icon-image': 'pin-logo',
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
      const handleClick = (e: mapboxgl.MapMouseEvent & { features?: GeoJSON.Feature[] }, offset: number | [number, number]) => {
        if (!e.features?.length) return;
        const f = e.features[0];
        const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
        const p = f.properties!;
        const scenes = (() => { try { return JSON.parse(p.scene || '[]'); } catch { return []; } })();

        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ offset, closeButton: false, maxWidth: '230px', className: 'stoguru-popup' })
          .setLngLat(coords)
          .setHTML(buildPopupHTML({
            name: p.name, genre: p.genre || '', distance: p.distance || '',
            videoUrl: p.videoUrl || '', photoEmoji: p.photoEmoji || '',
            photoUrls: p.photoUrls || '',
            scene: Array.isArray(scenes) ? scenes : [], priceRange: p.priceRange || '',
            lat: coords[1], lng: coords[0], ownerNickname: p.ownerNickname || '',
          }, userPosRef.current))
          .addTo(map);
      };
      map.on('click', 'stocks-circle', (e) => handleClick(e, 15));
      map.on('click', 'stocks-pin', (e) => handleClick(e, [0, -55]));
      map.on('click', 'my-posted-circle', (e) => handleClick(e, 15));
      map.on('click', 'my-posted-pin', (e) => handleClick(e, [0, -55]));
      map.on('click', 'following-circle', (e) => handleClick(e, 15));
      map.on('click', 'following-pin', (e) => handleClick(e, [0, -55]));
      map.on('click', 'panTo-pin-icon', (e) => handleClick(e, [0, -70]));
      ['stocks-circle', 'stocks-pin', 'my-posted-circle', 'my-posted-pin', 'following-circle', 'following-pin', 'panTo-pin-icon'].forEach(id => {
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
              videoUrl: r.videoUrl || '', photoEmoji: r.photoEmoji || '',
              photoUrls: (r as any).photoUrls?.[0] || '',
              scene: JSON.stringify(r.scene || []), priceRange: r.priceRange || '',
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
      // マップロード直後にmyPostedデータもフェッチして紫ピンを表示
      if (!myPostedLoaded.current && !myPostedLoading.current) {
        myPostedLoading.current = true;
        getInfluencerRestaurants()
          .then(posted => {
            myPostedRef.current = posted;
            myPostedLoaded.current = true;
            const postedSrc = map.getSource('my-posted') as mapboxgl.GeoJSONSource | undefined;
            if (postedSrc) {
              const stockIds = new Set(stocksRef.current.map(r => r.id));
              postedSrc.setData({
                type: 'FeatureCollection',
                features: posted
                  .filter((r: Record<string, unknown>) => r.lat && r.lng && !stockIds.has(r.restaurantId as string))
                  .map((r: Record<string, unknown>) => ({
                    type: 'Feature' as const,
                    geometry: { type: 'Point' as const, coordinates: [Number(r.lng), Number(r.lat)] },
                    properties: {
                      id: r.restaurantId, name: `${r.name}`,
                      genre: Array.isArray(r.genres) ? (r.genres as string[])[0] || '' : '',
                      visited: 0, distance: '',
                      videoUrl: r.videoUrl || '', photoEmoji: '',
                      photoUrls: Array.isArray(r.photoUrls) && (r.photoUrls as string[]).length > 0 ? (r.photoUrls as string[])[0] : '',
                      scene: '[]', priceRange: r.priceRange || '',
                    },
                  })),
              });
            }
          })
          .catch(() => { /* ignore */ })
          .finally(() => { myPostedLoading.current = false; });
      }
      } catch { mapLoadedRef.current = false; }
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

    }, 60000);

    return () => { clearInterval(timer); map.remove(); mapRef.current = null; mapLoadedRef.current = false; };
  }, []);

  // Pan to location + show popup
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !panTo) return;

    const doPan = () => {
      initialCenterSet.current = true;
      map.flyTo({ center: [panTo.lng, panTo.lat], zoom: 17 });

      // 一時ピンを表示（ストック済みでなければ）
      const panSrc = map.getSource('panTo-pin') as mapboxgl.GeoJSONSource | undefined;
      if (panSrc) {
        const r = panTo.restaurant;
        panSrc.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [panTo.lng, panTo.lat] },
            properties: r ? {
              id: r.id, name: r.name, genre: r.genre || '',
              visited: r.visited ? 1 : 0, distance: r.distance || '',
              videoUrl: r.videoUrl || '', photoEmoji: r.photoEmoji || '',
              photoUrls: (r as any).photoUrls?.[0] || '',
              scene: JSON.stringify(r.scene || []), priceRange: r.priceRange || '',
            } : { name: '選択した場所' },
          }],
        });
      }

      if (panTo.restaurant) {
        const r = panTo.restaurant;
        const showPopup = () => {
          popupRef.current?.remove();
          popupRef.current = new mapboxgl.Popup({ offset: [0, -70], closeButton: false, maxWidth: '230px', className: 'stoguru-popup' })
            .setLngLat([r.lng, r.lat])
            .setHTML(buildPopupHTML({
              name: r.name, genre: r.genre || '', distance: r.distance || '',
              videoUrl: r.videoUrl || '', photoEmoji: r.photoEmoji || '',
              photoUrls: (r as any).photoUrls?.[0] || '',
              scene: r.scene || [], priceRange: r.priceRange || '',
              lat: r.lat, lng: r.lng,
            }, userPosRef.current))
            .addTo(map);
        };
        map.once('moveend', showPopup);
      }
      onPanComplete();
    };

    // マップがまだload完了してなければ待つ
    if (mapLoadedRef.current) {
      doPan();
    } else {
      map.once('load', doPan);
    }
  }, [panTo, onPanComplete]);

  // Set initial center to user position
  useEffect(() => {
    if (mapRef.current && userPosition && !initialCenterSet.current) {
      initialCenterSet.current = true;
      mapRef.current.jumpTo({ center: [userPosition.lng, userPosition.lat], zoom: 15 });
    }
  }, [userPosition]);

  // Refs for accessing latest data inside map event handlers
  const stocksRef = useRef(stocks);
  stocksRef.current = stocks;
  const userPosRef = useRef(userPosition);
  userPosRef.current = userPosition;

  // データ更新のみ（ソース/レイヤーはon('load')で作成済み）
  const updateData = useCallback(async (s: StockedRestaurant[], uPos: GPSPosition | null) => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    // 一時ピンをクリア
    const panSrc = map.getSource('panTo-pin') as mapboxgl.GeoJSONSource | undefined;
    if (panSrc) panSrc.setData({ type: 'FeatureCollection', features: [] });
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
            videoUrl: r.videoUrl || '', photoEmoji: r.photoEmoji || '',
            photoUrls: (r as any).photoUrls?.[0] || '',
            scene: JSON.stringify(r.scene || []), priceRange: r.priceRange || '',
          },
        })),
      });
    }
    // 自分の投稿レストラン（紫ピン）
    if (!myPostedLoaded.current && !myPostedLoading.current) {
      myPostedLoading.current = true;
      try {
        const posted = await getInfluencerRestaurants();
        myPostedRef.current = posted;
        myPostedLoaded.current = true;
      } catch { /* ignore */ }
      myPostedLoading.current = false;
    }
    // 紫ピンソース更新（ストック済みの店は除外）
    if (myPostedLoaded.current) {
      const postedSrc = map.getSource('my-posted') as mapboxgl.GeoJSONSource | undefined;
      if (postedSrc) {
        const stockIds = new Set(s.map(r => r.id));
        postedSrc.setData({
          type: 'FeatureCollection',
          features: myPostedRef.current
            .filter((r: Record<string, unknown>) => r.lat && r.lng && !stockIds.has(r.restaurantId as string))
            .map((r: Record<string, unknown>) => ({
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: [Number(r.lng), Number(r.lat)] },
              properties: {
                id: r.restaurantId, name: `${r.name}`,
                genre: Array.isArray(r.genres) ? (r.genres as string[])[0] || '' : '',
                visited: 0, distance: '',
                videoUrl: r.videoUrl || '', photoEmoji: '',
                photoUrls: Array.isArray(r.photoUrls) && (r.photoUrls as string[]).length > 0 ? (r.photoUrls as string[])[0] : '',
                scene: '[]', priceRange: r.priceRange || '',
              },
            })),
        });
      }
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


  // Toggle labels
  const handleToggleLabels = useCallback((show: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    const vis = show ? 'visible' : 'none';
    LABEL_LAYERS.forEach(id => {
      map.setLayoutProperty(id, 'visibility', vis);
    });
  }, []);

  // Switch map mode (2D / 3D)
  const handleSwitchMode = useCallback((mode: 'standard' | '3d') => {
    const map = mapRef.current;
    if (!map) return;

    if (mode === '3d') {
      map.easeTo({ pitch: 50, bearing: -15, duration: 800 });
      try { map.setLayoutProperty('building-3d', 'visibility', 'visible'); } catch {}
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
      try { map.setLayoutProperty('building-3d', 'visibility', 'none'); } catch {}
    }

    setMapMode(mode);
  }, []);

  // Open following picker
  const handleOpenFollowingPicker = useCallback(async () => {
    if (selectedFollowUser) {
      // 解除: 自分のピンに戻す
      setSelectedFollowUser(null);
      setShowFollowingPicker(false);
      const map = mapRef.current;
      if (map && mapLoadedRef.current) {
        ['following-outline', 'following-circle', 'following-pin'].forEach(id => {
          try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
        });
        ['stocks-outline', 'stocks-circle', 'stocks-pin', 'my-posted-outline', 'my-posted-circle', 'my-posted-pin'].forEach(id => {
          try { map.setLayoutProperty(id, 'visibility', 'visible'); } catch {}
        });
      }
      return;
    }
    // ピッカーが閉じていたら開く（開いていたら閉じる）
    if (showFollowingPicker) {
      setShowFollowingPicker(false);
      return;
    }
    setShowFollowingPicker(true);
    setFollowingLoading(true);
    try {
      const [list, data] = await Promise.all([
        getFollowing(),
        followingLoaded.current ? Promise.resolve(followingData) : fetchFollowingRestaurants(),
      ]);
      followingLoaded.current = true;
      const users = await Promise.all(list.map(async (f) => {
        try {
          const p = await getUserProfile(f.followeeId);
          return { id: f.followeeId, nickname: p.nickname || f.followeeId };
        } catch { return { id: f.followeeId, nickname: f.followeeId }; }
      }));
      setFollowingUsers(users);
      followingDataRef.current = data;
      setFollowingData(data);
    } catch {
      // エラー時は空のまま
    } finally {
      setFollowingLoading(false);
    }
  }, [selectedFollowUser, showFollowingPicker, followingData]);

  // Select a following user
  const handleSelectFollowUser = useCallback((userId: string) => {
    setSelectedFollowUser(userId);
    setShowFollowingPicker(false);
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    // 自分のピンを非表示
    ['stocks-outline', 'stocks-circle', 'stocks-pin', 'my-posted-outline', 'my-posted-circle', 'my-posted-pin'].forEach(id => {
      try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
    });

    // 選択ユーザーのデータだけフィルタ（refで最新データを参照）
    const data = followingDataRef.current;
    const userRestaurants = data.filter((r: Record<string, unknown>) => r.ownerId === userId);
    console.log('[MAP] followingData total:', data.length, 'filtered for user:', userId, '→', userRestaurants.length);
    if (userRestaurants.length > 0) console.log('[MAP] sample:', JSON.stringify(userRestaurants[0]));
    const src = map.getSource('following') as mapboxgl.GeoJSONSource | undefined;
    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features: userRestaurants.filter((r: Record<string, unknown>) => r.lat && r.lng).map((r: Record<string, unknown>) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [Number(r.lng), Number(r.lat)] },
          properties: {
            id: r.id || r.restaurantId, name: `${r.name}`,
            ownerNickname: (r.ownerNickname as string) || '',
            genre: r.genre || '', visited: r.status === 'visited' ? 1 : 0,
            isPosted: r.isPosted ? 1 : 0, distance: '',
            videoUrl: r.videoUrl || '', photoEmoji: r.photoEmoji || '',
            photoUrls: Array.isArray(r.photoUrls) && (r.photoUrls as string[]).length > 0 ? (r.photoUrls as string[])[0] : '',
            scene: JSON.stringify(r.scene || []), priceRange: r.priceRange || '',
          },
        })),
      });
    }
    ['following-outline', 'following-circle', 'following-pin'].forEach(id => {
      try { map.setLayoutProperty(id, 'visibility', 'visible'); } catch {}
    });
  }, []);

  // Toggle simple mode (labels on/off, independent of 2D/3D)
  const handleToggleSimple = useCallback(() => {
    const next = !simpleMode;
    setSimpleMode(next);
    handleToggleLabels(!next);
  }, [simpleMode, handleToggleLabels]);

  return (
    <div className="flex-1 relative">
      <style>{`
        .mapboxgl-ctrl-logo { width: 60px !important; height: 16px !important; }
        .mapboxgl-ctrl-attrib { font-size: 8px !important; padding: 1px 4px !important; }
        .mapboxgl-ctrl-attrib a { font-size: 8px !important; }
        .stoguru-popup .mapboxgl-popup-content { background: transparent !important; box-shadow: none !important; padding: 0 !important; border-radius: 0 !important; }
        .stoguru-popup .mapboxgl-popup-tip { display: none !important; }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />

      {/* Map mode button */}
      <button
        onClick={() => setModePickerOpen(!modePickerOpen)}
        className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-xl shadow-md flex items-center justify-center"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
      </button>

      {/* Following picker button */}
      <button
        onClick={handleOpenFollowingPicker}
        className={`absolute top-16 right-4 z-10 w-10 h-10 backdrop-blur-sm rounded-xl shadow-md flex items-center justify-center transition-colors ${
          selectedFollowUser ? 'bg-purple-500 text-white' : 'bg-white/90 text-gray-500'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="-3 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
      </button>

      {/* Following user picker */}
      {showFollowingPicker && (
        <>
          <div className="absolute inset-0 z-20" onClick={() => setShowFollowingPicker(false)} />
          <div className="absolute top-28 right-4 z-30 bg-gray-900/95 backdrop-blur-md rounded-2xl p-3 shadow-xl min-w-[180px] max-h-[300px] overflow-y-auto">
            <p className="text-white text-sm font-bold text-center mb-2">マップを見る</p>
            {followingLoading ? (
              <p className="text-gray-400 text-xs text-center py-4">読み込み中...</p>
            ) : followingUsers.length === 0 ? (
              <p className="text-gray-400 text-xs text-center py-4">フォロー中のユーザーがいません</p>
            ) : (
              followingUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => handleSelectFollowUser(u.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
                  </div>
                  <span className="text-white text-sm truncate">{u.nickname}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}

      {/* Selected user banner */}
      {selectedFollowUser && (
        <div className="absolute top-4 left-4 right-16 z-10 bg-purple-500/90 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center justify-between shadow-md">
          <span className="text-white text-sm font-bold truncate">
            {followingUsers.find(u => u.id === selectedFollowUser)?.nickname}のマップ
          </span>
          <button onClick={handleOpenFollowingPicker} className="text-white/80 text-xs ml-2 flex-shrink-0">
            戻る
          </button>
        </div>
      )}

      {/* Map mode picker */}
      {modePickerOpen && (
        <>
          <div className="absolute inset-0 z-20" onClick={() => setModePickerOpen(false)} />
          <div className="absolute top-16 right-4 z-30 bg-gray-900/95 backdrop-blur-md rounded-2xl p-4 shadow-xl min-w-[220px]">
            <p className="text-white text-sm font-bold text-center mb-3">地図モード</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {([
                { id: 'standard' as const, label: '2D',
                  thumb: `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/135.4959,34.7025,14,0,0/120x80@2x?access_token=${mapboxgl.accessToken}` },
                { id: '3d' as const, label: '3D',
                  thumb: `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/135.4959,34.7025,15,50,-15/120x80@2x?access_token=${mapboxgl.accessToken}` },
              ]).map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleSwitchMode(m.id)}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div
                    className={`w-[88px] h-[60px] rounded-xl overflow-hidden transition-all ${
                      mapMode === m.id
                        ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900'
                        : 'ring-1 ring-white/20'
                    }`}
                  >
                    <img src={m.thumb} alt={m.label} className="w-full h-full object-cover" />
                  </div>
                  <span className={`text-[11px] font-medium ${mapMode === m.id ? 'text-blue-400' : 'text-gray-400'}`}>
                    {m.label}
                  </span>
                </button>
              ))}
            </div>
            <div className="border-t border-white/10 pt-3">
              <button
                onClick={handleToggleSimple}
                className="flex items-center gap-2.5 w-full"
              >
                <div
                  className={`w-10 h-10 rounded-lg overflow-hidden transition-all ${
                    simpleMode
                      ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900'
                      : 'ring-1 ring-white/20'
                  }`}
                >
                  <img
                    src={`https://api.mapbox.com/styles/v1/mapbox/light-v11/static/135.4959,34.7025,12,0,0/60x60@2x?access_token=${mapboxgl.accessToken}`}
                    alt="シンプル" className="w-full h-full object-cover opacity-60"
                  />
                </div>
                <div className="text-left">
                  <span className={`text-xs font-medium ${simpleMode ? 'text-blue-400' : 'text-gray-400'}`}>
                    シンプル
                  </span>
                  <p className="text-[9px] text-gray-500">ラベルを非表示</p>
                </div>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Legend */}
      <div className="absolute bottom-10 left-2 bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1.5 flex gap-2 text-[10px] text-gray-600 shadow-sm">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> 保存
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> 行った
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> 投稿
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> 現在地
        </span>
      </div>

      {/* 現在地ボタン — ズームコントロールの上 */}
      <button
        onClick={() => {
          if (userPosition) {
            mapRef.current?.flyTo({ center: [userPosition.lng, userPosition.lat], zoom: 16, duration: 800 });
          } else {
            navigator.geolocation.getCurrentPosition(
              (pos) => mapRef.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16, duration: 800 }),
              () => {},
              { enableHighAccuracy: true },
            );
          }
        }}
        className="absolute bottom-[88px] right-[10px] w-[32px] h-[32px] bg-white rounded-lg shadow flex items-center justify-center z-10"
        style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.15)' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'translate(-1px, 1px)' }}>
          <polygon points="3 11 22 2 13 21 11 13 3 11" />
        </svg>
      </button>

    </div>
  );
}
