// Google Places API クライアント（営業時間の自動取得）。
//
// 環境変数:
// - GOOGLE_PLACES_API_KEY: Maps Platform の API キー
//
// 未設定なら全関数 no-op（null）を返す。キー設定で有効化される。
// ※ 営業時間は構造化された opening_hours.periods を正規化し、
//    「今営業中か」はクライアント側で現在 JST 時刻から計算する。

import type { OpeningHours, OpeningPeriod } from '../types';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const ENABLED = !!API_KEY;

const BASE = 'https://maps.googleapis.com/maps/api/place';

/** 店名 + 座標から place_id を解決（座標バイアス）。見つからなければ null。 */
export async function findPlaceId(
  name: string,
  lat?: number,
  lng?: number,
): Promise<string | null> {
  if (!ENABLED) return null;
  const params = new URLSearchParams({
    input: name,
    inputtype: 'textquery',
    fields: 'place_id',
    language: 'ja',
    key: API_KEY as string,
  });
  if (lat != null && lng != null) {
    params.set('locationbias', `point:${lat},${lng}`);
  }
  try {
    const r = await fetch(`${BASE}/findplacefromtext/json?${params.toString()}`);
    if (!r.ok) {
      console.error('[places] findPlace failed:', r.status);
      return null;
    }
    const data = (await r.json()) as { candidates?: { place_id?: string }[] };
    return data.candidates?.[0]?.place_id ?? null;
  } catch (e) {
    console.error('[places] findPlace error:', e);
    return null;
  }
}

interface GooglePeriod {
  open?: { day: number; time: string };
  close?: { day: number; time: string };
}

/** place_id から営業時間・電話・評価を取得して正規化。 */
export async function fetchPlaceDetails(
  placeId: string,
): Promise<{ openingHours?: OpeningHours; phone?: string; googleRating?: number } | null> {
  if (!ENABLED) return null;
  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'opening_hours,formatted_phone_number,rating',
    language: 'ja',
    key: API_KEY as string,
  });
  try {
    const r = await fetch(`${BASE}/details/json?${params.toString()}`);
    if (!r.ok) {
      console.error('[places] details failed:', r.status);
      return null;
    }
    const data = (await r.json()) as {
      result?: {
        opening_hours?: { periods?: GooglePeriod[]; weekday_text?: string[] };
        formatted_phone_number?: string;
        rating?: number;
      };
    };
    const result = data.result;
    if (!result) return null;

    let openingHours: OpeningHours | undefined;
    const oh = result.opening_hours;
    if (oh?.periods && oh.periods.length > 0) {
      const periods: OpeningPeriod[] = oh.periods.map((p) => {
        const open = p.open ?? { day: 0, time: '0000' };
        // close が無い = 24 時間営業扱い。その日いっぱい開いていると近似。
        const close = p.close ?? { day: open.day, time: '2400' };
        return {
          openDay: open.day,
          openTime: open.time,
          closeDay: close.day,
          closeTime: close.time,
        };
      });
      openingHours = {
        periods,
        weekdayText: oh.weekday_text,
        source: 'google',
        fetchedAt: Date.now(),
      };
    }

    return {
      openingHours,
      phone: result.formatted_phone_number,
      googleRating: result.rating,
    };
  } catch (e) {
    console.error('[places] details error:', e);
    return null;
  }
}

/** 店名+座標から一括解決（place_id → details）。失敗時は null。 */
export async function resolvePlaceInfo(
  name: string,
  lat?: number,
  lng?: number,
): Promise<{ placeId: string; openingHours?: OpeningHours; phone?: string; googleRating?: number } | null> {
  if (!ENABLED) return null;
  const placeId = await findPlaceId(name, lat, lng);
  if (!placeId) return null;
  const details = await fetchPlaceDetails(placeId);
  return { placeId, ...(details ?? {}) };
}

export const placesEnabled = ENABLED;
