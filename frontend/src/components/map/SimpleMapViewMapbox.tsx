import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { StockedRestaurant } from '../stock/StockScreen';
import type { GPSPosition } from '../../hooks/useGPS';
import { distanceMetres, formatDistance } from '../../utils/distance';
import { fetchFollowingRestaurants, getFollowing, getUserProfile, getInfluencerRestaurants } from '../../utils/api';
import { useTranslation } from '../../context/LanguageContext';
import { GENRE_TAGS } from '../../constants/genre';
import './map-page.css';

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
      // 衛星画像（デフォルトは非表示。レイヤー切替で visibility を toggle）
      'mapbox-satellite': { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 },
    },
    glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': t.background } },
      // 衛星画像レイヤー（デフォルト非表示。レイヤー切替で 衛星 にすると表示）
      { id: 'satellite', type: 'raster', source: 'mapbox-satellite',
        layout: { visibility: 'none' },
        paint: { 'raster-fade-duration': 0 } },
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

/** 安全な http(s) URL のみ返す。`javascript:` 等のスキームは null。 */
function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * mapbox popup のコンテンツを **DOM ノードで構築**する。以前は文字列の
 * テンプレートリテラルから setHTML していたが、p.name / p.videoUrl /
 * p.photoUrls / p.ownerNickname 等は他ユーザーがレストラン投稿時に
 * 入力する値で、影響範囲は閲覧者全員。`<a href={p.videoUrl}>` や
 * `<img src={p.photoUrls}>` 等に javascript: や `"><script>` を仕込めば
 * stored XSS（→ localStorage トークン奪取 → アカウント乗っ取り）が成立した。
 * ここでは textContent / setAttribute のみを使い、URL は safeHttpUrl で
 * scheme チェックする。
 */
function buildPopupNode(
  p: { name: string; genre: string; distance: string; videoUrl: string; photoEmoji: string; photoUrls?: string; scene: string[]; priceRange: string; lat: number; lng: number; ownerNickname?: string },
  userPos: GPSPosition | null,
): HTMLElement {
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

  const root = document.createElement('div');
  root.style.cssText = `font-family:system-ui,sans-serif;background:${bg};border-radius:14px;padding:12px 14px;border:${border};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)`;

  // ─── header (photo + texts) ───
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:8px';
  root.appendChild(header);

  const photoUrl = safeHttpUrl(p.photoUrls);
  if (photoUrl) {
    const img = document.createElement('img');
    img.src = photoUrl;
    img.style.cssText = 'width:36px;height:36px;border-radius:10px;object-fit:cover;flex-shrink:0';
    header.appendChild(img);
  } else {
    const emoji = document.createElement('div');
    emoji.style.cssText = `width:36px;height:36px;border-radius:10px;background:${emojiBg};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0`;
    emoji.textContent = p.photoEmoji || '🍽️';
    header.appendChild(emoji);
  }

  const textCol = document.createElement('div');
  textCol.style.cssText = 'min-width:0;flex:1';
  header.appendChild(textCol);

  const nameEl = document.createElement('div');
  nameEl.style.cssText = `font-size:13px;font-weight:700;color:${nameColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
  nameEl.textContent = p.name;
  textCol.appendChild(nameEl);

  if (p.ownerNickname) {
    const nick = document.createElement('div');
    nick.style.cssText = 'font-size:9px;color:#a855f7;margin-top:1px;font-weight:600';
    nick.textContent = '@' + p.ownerNickname;
    textCol.appendChild(nick);
  }

  const metaEl = document.createElement('div');
  metaEl.style.cssText = `font-size:10px;color:${metaColor};margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
  metaEl.textContent = `${dist} · ${p.genre}${p.priceRange ? ' · ' + p.priceRange : ''}`;
  textCol.appendChild(metaEl);

  // ─── scene tags ───
  const scenes = (p.scene || []).slice(0, 2);
  if (scenes.length > 0) {
    const tagWrap = document.createElement('div');
    tagWrap.style.cssText = 'display:flex;gap:4px;margin-top:8px';
    for (const s of scenes) {
      const tag = document.createElement('span');
      tag.style.cssText = `background:${tagBg};color:${tagColor};font-size:9px;padding:3px 8px;border-radius:6px`;
      tag.textContent = s;
      tagWrap.appendChild(tag);
    }
    root.appendChild(tagWrap);
  }

  // ─── action buttons ───
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;margin-top:10px';
  root.appendChild(btnRow);

  const safeVideoUrl = safeHttpUrl(p.videoUrl);
  if (safeVideoUrl) {
    const a = document.createElement('a');
    a.href = safeVideoUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.cssText = `flex:1;text-align:center;font-size:10px;font-weight:600;padding:6px 0;border-radius:8px;background:${btnVidBg};color:${btnVidColor};text-decoration:none;display:block`;
    a.textContent = '▶ 動画';
    btnRow.appendChild(a);
  }

  const navA = document.createElement('a');
  navA.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.lat + ',' + p.lng)}`;
  navA.target = '_blank';
  navA.rel = 'noopener noreferrer';
  navA.style.cssText = 'flex:1;text-align:center;font-size:10px;font-weight:600;padding:6px 0;border-radius:8px;background:#3b82f6;color:#fff;text-decoration:none;display:block';
  navA.textContent = 'ナビ';
  btnRow.appendChild(navA);

  return root;
}

export function SimpleMapViewMapbox({ stocks, panTo, onPanComplete, userPosition }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [mapMode, setMapMode] = useState<'standard' | '3d' | 'satellite'>('3d');
  const [simpleMode, setSimpleMode] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  // Claude Design: 左の list panel + 上の cat フィルタ + 検索
  const [listOpen, setListOpen] = useState(true);
  const [listSearch, setListSearch] = useState('');
  const [topSearch, setTopSearch] = useState('');
  const [catFilter, setCatFilter] = useState<'all' | 'visited' | 'wishlist'>('all');
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
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
  // Filter state
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterGenres, setFilterGenres] = useState<string[]>([]);
  // 0 = no limit, otherwise meters (100..10000)
  const [filterDistance, setFilterDistance] = useState<number>(0);
  // visited filter: 'all' | 'wishlist' | 'visited'
  const [filterVisited, setFilterVisited] = useState<'all' | 'wishlist' | 'visited'>('all');
  // Nearby banner dismissal (so user can hide it)
  const [nearbyDismissed, setNearbyDismissed] = useState(false);
  // Explore-this-area UI は削除済み（state も不要）。
  // Nearby (100m) detection
  const nearbyStock = useMemo(() => {
    if (!userPosition) return null;
    const matches = stocks
      .filter(s => s.lat && s.lng)
      .map(s => ({ s, d: distanceMetres(userPosition.lat, userPosition.lng, s.lat, s.lng) }))
      .filter(({ d }) => d <= 100)
      .sort((a, b) => a.d - b.d);
    return matches.length > 0 ? matches[0].s : null;
  }, [stocks, userPosition]);

  // Reset banner dismissal when nearby stock changes
  useEffect(() => {
    setNearbyDismissed(false);
  }, [nearbyStock?.id]);

  // Active filter count
  const activeFilterCount =
    filterGenres.length +
    (filterDistance > 0 ? 1 : 0) +
    (filterVisited !== 'all' ? 1 : 0);

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
    // Mapbox 標準の NavigationControl は右下に +/- を出すが、デザインの
     // top-right 側に自前で拡大縮小（.map-ctrl-stack）と現在地ボタンを
     // 用意しているので重複になる。さらに layer switcher (3D/2D/衛星)
     // とも被る。なのでこの addControl は外す。
     // map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
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
      map.addSource('stocks', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterMaxZoom: 14, clusterRadius: 35 });
      map.addSource('my-posted', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterMaxZoom: 14, clusterRadius: 35 });
      map.addSource('following', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterMaxZoom: 14, clusterRadius: 35 });
      map.addSource('user-location', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('panTo-pin', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      // フォロー中: 丸ピン（保存=紫, 行った=緑）+ 紫枠で区別
      map.addLayer({ id: 'following-outline', type: 'circle', source: 'following', maxzoom: 15,
        filter: ['!', ['has', 'point_count']],
        layout: { visibility: 'none' },
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 14, 8], 'circle-color': '#ffffff' } });
      map.addLayer({ id: 'following-circle', type: 'circle', source: 'following', maxzoom: 15,
        filter: ['!', ['has', 'point_count']],
        layout: { visibility: 'none' },
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 5],
          'circle-color': ['case', ['==', ['get', 'isPosted'], 1], '#a855f7', ['==', ['get', 'visited'], 1], '#4ade80', '#ff5a5a'] } });
      map.addLayer({ id: 'following-pin', type: 'symbol', source: 'following', minzoom: 15,
        filter: ['!', ['has', 'point_count']],
        layout: { visibility: 'none',
          'icon-image': ['case', ['==', ['get', 'isPosted'], 1], 'pin-purple', ['==', ['get', 'visited'], 1], 'pin-green', 'pin-red'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.6, 18, 1],
          'icon-anchor': 'bottom', 'icon-allow-overlap': true } });

      // 縮小時: 丸ピン
      map.addLayer({ id: 'stocks-outline', type: 'circle', source: 'stocks', maxzoom: 15,
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 7], 'circle-color': '#ffffff' } });
      map.addLayer({ id: 'stocks-circle', type: 'circle', source: 'stocks', maxzoom: 15,
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 5],
          'circle-color': ['case', ['==', ['get', 'visited'], 1], '#4ade80', '#ff5a5a'] } });
      // 拡大時: ティアドロップピン
      map.addLayer({ id: 'stocks-pin', type: 'symbol', source: 'stocks', minzoom: 15,
        filter: ['!', ['has', 'point_count']],
        layout: { 'icon-image': ['case', ['==', ['get', 'visited'], 1], 'pin-green', 'pin-red'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.6, 18, 1],
          'icon-anchor': 'bottom', 'icon-allow-overlap': true } });
      // 自分の投稿（紫ピン）
      map.addLayer({ id: 'my-posted-outline', type: 'circle', source: 'my-posted', maxzoom: 15,
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 7], 'circle-color': '#ffffff' } });
      map.addLayer({ id: 'my-posted-circle', type: 'circle', source: 'my-posted', maxzoom: 15,
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 5], 'circle-color': '#a855f7' } });
      map.addLayer({ id: 'my-posted-pin', type: 'symbol', source: 'my-posted', minzoom: 15,
        filter: ['!', ['has', 'point_count']],
        layout: { 'icon-image': 'pin-purple',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.6, 18, 1],
          'icon-anchor': 'bottom', 'icon-allow-overlap': true } });
      // panTo一時ピン（スワイプ/保存カードからマップに飛んだ時用）
      map.addLayer({ id: 'panTo-pin-icon', type: 'symbol', source: 'panTo-pin',
        layout: { 'icon-image': 'pin-logo',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.6, 18, 1],
          'icon-anchor': 'bottom', 'icon-allow-overlap': true } });

      // クラスター（黒丸 + 白数字）
      for (const src of ['stocks', 'my-posted', 'following'] as const) {
        map.addLayer({ id: `${src}-cluster`, type: 'circle', source: src,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#000000',
            'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 16, 10, 22, 50, 28],
            'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff',
          } });
        map.addLayer({ id: `${src}-cluster-count`, type: 'symbol', source: src,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            'text-size': 14, 'text-allow-overlap': true,
          },
          paint: { 'text-color': '#ffffff' } });
      }

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
          .setDOMContent(buildPopupNode({
            name: p.name, genre: p.genre || '', distance: p.distance || '',
            videoUrl: p.videoUrl || '', photoEmoji: p.photoEmoji || '',
            photoUrls: p.photoUrls || '',
            scene: Array.isArray(scenes) ? scenes : [], priceRange: p.priceRange || '',
            lat: coords[1], lng: coords[0], ownerNickname: p.ownerNickname || '',
          }, userPosRef.current))
          .addTo(map);
      };
      // クラスタークリック → ズームイン
      for (const src of ['stocks', 'my-posted', 'following'] as const) {
        map.on('click', `${src}-cluster`, (e) => {
          const features = map.queryRenderedFeatures(e.point, { layers: [`${src}-cluster`] });
          if (!features.length) return;
          const clusterId = features[0].properties!.cluster_id;
          (map.getSource(src) as mapboxgl.GeoJSONSource).getClusterExpansionZoom(clusterId, (err?: Error | null, zoom?: number | null) => {
            if (err || zoom == null) return;
            map.easeTo({ center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number], zoom });
          });
        });
        map.on('mouseenter', `${src}-cluster`, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', `${src}-cluster`, () => { map.getCanvas().style.cursor = ''; });
      }
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
            .setDOMContent(buildPopupNode({
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

  // フィルター適用済みのストック
  const filteredStocks = useMemo(() => {
    let list = stocks;
    if (filterGenres.length > 0) {
      list = list.filter(r => filterGenres.includes(r.genre));
    }
    if (filterVisited === 'visited') {
      list = list.filter(r => r.visited);
    } else if (filterVisited === 'wishlist') {
      list = list.filter(r => !r.visited);
    }
    if (filterDistance > 0 && userPosition) {
      list = list.filter(r => distanceMetres(userPosition.lat, userPosition.lng, r.lat, r.lng) <= filterDistance);
    }
    return list;
  }, [stocks, filterGenres, filterVisited, filterDistance, userPosition]);

  // Refs for accessing latest data inside map event handlers
  const stocksRef = useRef(filteredStocks);
  stocksRef.current = filteredStocks;
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
    updateData(filteredStocks, userPosition);
  }, [filteredStocks, userPosition, updateData]);

  // 「このエリアを再探索」関連のロジックは削除。
  // 地図移動の検知 useEffect / handleExploreThisArea / fetchRestaurantFeed import も使わない。

  const handleClearFilters = useCallback(() => {
    setFilterGenres([]);
    setFilterDistance(0);
    setFilterVisited('all');
  }, []);

  const handleFocusNearby = useCallback(() => {
    if (!nearbyStock) return;
    mapRef.current?.flyTo({ center: [nearbyStock.lng, nearbyStock.lat], zoom: 17, duration: 800 });
  }, [nearbyStock]);


  // Toggle labels
  const handleToggleLabels = useCallback((show: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    const vis = show ? 'visible' : 'none';
    LABEL_LAYERS.forEach(id => {
      map.setLayoutProperty(id, 'visibility', vis);
    });
  }, []);

  // Switch map mode (2D / 3D / 衛星)
  const handleSwitchMode = useCallback((mode: 'standard' | '3d' | 'satellite') => {
    const map = mapRef.current;
    if (!map) return;

    // ベースの style レイヤー（衛星モードの時だけ非表示にしたい一覧）
    const styleLayers = ['water', 'park', 'building-flat', 'building-outline', 'road-casing', 'road', 'rail'];

    if (mode === '3d') {
      map.easeTo({ pitch: 50, bearing: -15, duration: 800 });
      try { map.setLayoutProperty('building-3d', 'visibility', 'visible'); } catch {}
      try { map.setLayoutProperty('satellite', 'visibility', 'none'); } catch {}
      styleLayers.forEach(id => { try { map.setLayoutProperty(id, 'visibility', 'visible'); } catch {} });
    } else if (mode === 'satellite') {
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
      try { map.setLayoutProperty('building-3d', 'visibility', 'none'); } catch {}
      try { map.setLayoutProperty('satellite', 'visibility', 'visible'); } catch {}
      // ベクター style レイヤーは衛星画像と被るので非表示にする（ラベルは残す）
      styleLayers.forEach(id => { try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {} });
    } else {
      // standard (2D)
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
      try { map.setLayoutProperty('building-3d', 'visibility', 'none'); } catch {}
      try { map.setLayoutProperty('satellite', 'visibility', 'none'); } catch {}
      styleLayers.forEach(id => { try { map.setLayoutProperty(id, 'visibility', 'visible'); } catch {} });
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

      {/* ─── Claude Design overlay: Top floating search + cat pills ─── */}
      <div className="map-top">
        <div className="map-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            placeholder="エリア・お店の名前で検索"
            value={topSearch}
            onChange={(e) => setTopSearch(e.target.value)}
          />
          <span className="map-search__shortcut">⌘K</span>
        </div>
        {([
          { key: 'all' as const, label: 'すべて', color: null, count: stocks.length },
          { key: 'wishlist' as const, label: 'まだ', color: 'var(--stg-orange-500)', count: stocks.filter(s => !s.visited).length },
          { key: 'visited' as const, label: '行った', color: 'var(--stg-green)', count: stocks.filter(s => s.visited).length },
          // 「気になる」フィルターは UI バランス + 機能要件の整理で削除
        ]).map((c) => (
          <button
            key={c.key}
            className={`map-pill ${catFilter === c.key ? 'is-active' : ''}`}
            onClick={() => {
              setCatFilter(c.key);
              if (c.key === 'visited') setFilterVisited('visited');
              else if (c.key === 'wishlist') setFilterVisited('wishlist');
              else setFilterVisited('all');
            }}
          >
            {c.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />}
            {c.label}
            <span className="map-pill__count">{c.count}</span>
          </button>
        ))}
        <button
          className={`map-pill ${activeFilterCount > 0 ? 'is-active' : ''}`}
          onClick={() => setFilterOpen(v => !v)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 12h12M15 18h6"/><circle cx="6" cy="6" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="12" cy="18" r="2"/></svg>
          絞り込み
        </button>
      </div>

      {/* ─── 右側 control stack（zoom + 現在地 + 経路 + フォロー）
            Claude Design map.html 準拠 ─── */}
      <div className="map-right">
        <div className="map-ctrl-stack">
          <button title="ズームイン" onClick={() => mapRef.current?.zoomIn()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button title="ズームアウト" onClick={() => mapRef.current?.zoomOut()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>
          </button>
        </div>
        <button
          className="map-ctrl"
          title="現在地"
          onClick={() => { if (userPosition) mapRef.current?.flyTo({ center: [userPosition.lng, userPosition.lat], zoom: 16 }); }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="9"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>
        </button>
        <button
          className="map-ctrl"
          title="経路（Google Maps）"
          onClick={() => {
            // 選択中の店があればそこへ、なければマップ中心へ経路を引く
            const map = mapRef.current; if (!map) return;
            const sel = stocks.find(x => x.id === selectedStockId);
            const c = sel ? { lat: sel.lat, lng: sel.lng } : (() => { const cc = map.getCenter(); return { lat: cc.lat, lng: cc.lng }; })();
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.lat + ',' + c.lng)}`, '_blank', 'noopener');
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/></svg>
        </button>
        <button
          className={`map-ctrl ${selectedFollowUser ? 'is-active' : ''}`}
          title={t('account.following')}
          onClick={handleOpenFollowingPicker}
        >
          <svg width="18" height="18" viewBox="-3 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        </button>
      </div>

      {/* ─── 左 list panel ─── */}
      {!listOpen && (
        <button className="map-list-toggle" onClick={() => setListOpen(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>
          リストを表示
          <span className="map-pill__count">{stocks.length}</span>
        </button>
      )}
      <div className={`map-list ${listOpen ? '' : 'is-collapsed'}`}>
        <div className="map-list__head">
          <div>
            <div className="map-list__title">表示中のお店</div>
            <div className="map-list__count">{stocks.length}件 · 地図上のピン</div>
          </div>
          <button className="map-list__close" onClick={() => setListOpen(false)} aria-label="閉じる">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
        </div>
        <div className="map-list__search">
          <div className="map-list__search-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              placeholder="このリストを絞り込む"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="map-list__items">
          {(() => {
            const items = stocks
              .filter((s) => {
                if (catFilter === 'visited') return s.visited;
                if (catFilter === 'wishlist') return !s.visited;
                return true;
              })
              .filter((s) => {
                const q = (listSearch || topSearch).toLowerCase();
                if (!q) return true;
                return s.name.toLowerCase().includes(q) || (s.genre ?? '').toLowerCase().includes(q);
              });
            if (items.length === 0) {
              return (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--stg-gray-600)', fontSize: 13 }}>
                  該当するお店がありません
                </div>
              );
            }
            return items.map((s, idx) => {
              const photo = s.photoUrls?.[0] ?? '';
              const dist = userPosition && s.lat && s.lng
                ? formatDistance(distanceMetres(userPosition.lat, userPosition.lng, s.lat, s.lng))
                : '';
              return (
                <div
                  key={s.id}
                  className={`map-list__item ${selectedStockId === s.id ? 'is-selected' : ''}`}
                  onClick={() => {
                    setSelectedStockId(s.id);
                    if (s.lat && s.lng) mapRef.current?.flyTo({ center: [s.lng, s.lat], zoom: 16 });
                  }}
                >
                  <div className="map-list__item-rank">{idx + 1}</div>
                  <div className="map-list__item-photo">
                    {photo ? <img loading="lazy" src={photo} alt="" /> : null}
                  </div>
                  <div className="map-list__item-body">
                    <div className="map-list__item-title">{s.name}</div>
                    <div className="map-list__item-meta">
                      {s.address && <span>{s.address}</span>}
                      {s.genre && <><span className="map-list__item-meta-dot" /><span>{s.genre}</span></>}
                      {s.priceRange && <><span className="map-list__item-meta-dot" /><span>{s.priceRange}</span></>}
                    </div>
                    <div className="map-list__item-tags">
                      <span className={`map-list__item-tag ${s.visited ? 'is-visited' : ''}`}>
                        {s.visited ? '行った' : 'まだ'}
                      </span>
                    </div>
                  </div>
                  {dist && (
                    <div className="map-list__item-status">
                      <div style={{ fontWeight: 700, color: 'var(--stg-gray-900)' }}>{dist}</div>
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* ─── 選択 pin の info card ─── */}
      {selectedStockId && (() => {
        const s = stocks.find(x => x.id === selectedStockId);
        if (!s) return null;
        const photo = s.photoUrls?.[0] ?? '';
        const dist = userPosition && s.lat && s.lng
          ? formatDistance(distanceMetres(userPosition.lat, userPosition.lng, s.lat, s.lng))
          : '';
        return (
          <div className="map-card">
            <div className="map-card__photo">
              {photo && <img loading="lazy" src={photo} alt={s.name} />}
              <div className="map-card__photo-badge">
                {s.visited ? (
                  <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>行った</>
                ) : (
                  <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>まだ</>
                )}
              </div>
            </div>
            <div className="map-card__body">
              <div className="map-card__top">
                <h3 className="map-card__title">{s.name}</h3>
                <button className="map-card__close" onClick={() => setSelectedStockId(null)} aria-label="閉じる">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="map-card__meta">
                {s.address && <span>{s.address}</span>}
                {dist && <><span className="map-card__meta-dot" /><span style={{ color: 'var(--stg-gray-900)', fontWeight: 600 }}>{dist}</span></>}
                {s.genre && <><span className="map-card__meta-dot" /><span>{s.genre}</span></>}
                {s.priceRange && <><span className="map-card__meta-dot" /><span>{s.priceRange}</span></>}
              </div>
              <div className="map-card__actions">
                {s.videoUrl ? (
                  <a className="map-card__action" href={s.videoUrl} target="_blank" rel="noopener noreferrer">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="m6 4 14 8-14 8Z"/></svg>動画
                  </a>
                ) : (
                  <button className="map-card__action" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="m6 4 14 8-14 8Z"/></svg>動画
                  </button>
                )}
                <a
                  className="map-card__action"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.lat + ',' + s.lng)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/></svg>
                  経路
                </a>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Legend (左下) — 4 項目に整理：保存 / 行った / 投稿（紫） / 現在地 ─── */}
      <div className="map-legend">
        <div className="map-legend__item"><span className="map-legend__dot cat-todo" />保存</div>
        <div className="map-legend__item"><span className="map-legend__dot cat-visited" />行った</div>
        <div className="map-legend__item"><span className="map-legend__dot cat-special" />投稿</div>
        <div className="map-legend__item"><span className="map-legend__dot cat-here" />現在地</div>
      </div>

      {/* ─── Layer switcher (右下) — 3D / 2D / 衛星 ─── */}
      <div className="map-layers">
        <button className={mapMode === '3d' ? 'is-active' : ''} onClick={() => handleSwitchMode('3d')}>3D</button>
        <button className={mapMode === 'standard' ? 'is-active' : ''} onClick={() => handleSwitchMode('standard')}>2D</button>
        <button className={mapMode === 'satellite' ? 'is-active' : ''} onClick={() => handleSwitchMode('satellite')}>衛星</button>
      </div>

      {/* ダークモードトグルは map に置くと layer switcher と被って邪魔だったので削除。
          テーマ切替はアカウント画面のテーマシートで行う。 */}

      {/* Filter panel */}
      {filterOpen && (
        <>
          <div className="absolute inset-0 z-20" onClick={() => setFilterOpen(false)} />
          <div className="absolute top-40 right-4 z-30 bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-xl w-[260px] max-h-[70vh] overflow-y-auto border border-gray-100 dark:border-gray-700" role="dialog" aria-label={t('map.filter')}>
            {/* Genre */}
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('map.genre')}</p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {GENRE_TAGS.map((tag) => {
                const active = filterGenres.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => setFilterGenres(prev => prev.includes(tag) ? prev.filter(g => g !== tag) : [...prev, tag])}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                      active ? 'bg-[var(--accent-orange)] text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            {/* Distance */}
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('map.distance')}</p>
            <div className="mb-4">
              <input
                type="range"
                min={0}
                max={10000}
                step={100}
                value={filterDistance}
                onChange={(e) => setFilterDistance(Number(e.target.value))}
                className="w-full accent-[var(--accent-orange)]"
                aria-label={t('map.distance')}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  {filterDistance === 0
                    ? t('map.distanceUnlimited')
                    : filterDistance < 1000
                      ? `${filterDistance}m`
                      : `${(filterDistance / 1000).toFixed(1)}km`}
                </span>
                {filterDistance > 0 && (
                  <button onClick={() => setFilterDistance(0)} className="text-[10px] text-[var(--accent-orange)] font-medium">
                    {t('map.distanceUnlimited')}
                  </button>
                )}
              </div>
            </div>

            {/* Visited */}
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('map.visitedFilter')}</p>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {([
                { v: 'all' as const, label: t('map.all') },
                { v: 'wishlist' as const, label: t('map.visitedNotYet') },
                { v: 'visited' as const, label: t('map.visitedDone') },
              ]).map(opt => {
                const active = filterVisited === opt.v;
                return (
                  <button
                    key={opt.v}
                    onClick={() => setFilterVisited(opt.v)}
                    className={`py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                      active ? 'bg-[var(--accent-orange)] text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Clear */}
            <button
              onClick={handleClearFilters}
              disabled={activeFilterCount === 0}
              className="w-full py-2 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-50"
            >
              {t('map.clearFilters')}
            </button>
          </div>
        </>
      )}

      {/* 100m banner */}
      {nearbyStock && !nearbyDismissed && (
        <div
          className="absolute top-4 left-4 right-16 z-10 bg-[var(--accent-orange)] text-white rounded-xl px-3 py-2.5 shadow-lg flex items-center gap-2"
          role="status"
          aria-live="polite"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <button
            onClick={handleFocusNearby}
            className="flex-1 text-left min-w-0"
            aria-label={`${t('map.nearby100m')} ${nearbyStock.name}`}
          >
            <p className="text-[11px] font-medium opacity-90 truncate">{t('map.nearby100m')}</p>
            <p className="text-[13px] font-bold truncate">{nearbyStock.name}</p>
          </button>
          <button
            onClick={() => setNearbyDismissed(true)}
            aria-label={t('common.close')}
            className="flex-shrink-0 w-6 h-6 rounded-full hover:bg-white/20 flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      )}

      {/* 「このエリアを再探索」ボタン / インジケータ / 結果パネルは
          見た目が邪魔だったので削除。Explore は左 list panel で代替。 */}

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
                    <img loading="lazy" src={m.thumb} alt={m.label} className="w-full h-full object-cover" />
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

      {/* 旧 Legend（保存/行った/投稿/現在地）と旧 現在地ボタン
          (bottom-[88px] right-[10px]) はリファクタの取り残し。
          現行は .map-legend と .map-right の自前 control stack に
          統合済みなので、ここから削除して右下の重複を解消。 */}

    </div>
  );
}
