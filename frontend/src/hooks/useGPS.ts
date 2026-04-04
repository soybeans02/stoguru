import { useState, useEffect, useCallback, useRef } from 'react';

export interface GPSPosition {
  lat: number;
  lng: number;
  heading: number | null;
}

export function useGPS() {
  const [position, setPosition] = useState<GPSPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const positionRef = useRef<GPSPosition | null>(null);

  const startWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    setError(null);
    setDenied(false);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, heading: pos.coords.heading };
        positionRef.current = p;
        setPosition(p);
        setError(null);
      },
      (err) => {
        setError(err.message);
        if (err.code === err.PERMISSION_DENIED) {
          setDenied(true);
        }
      },
      { enableHighAccuracy: true },
    );
  }, []);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setPosition(null);
    positionRef.current = null;
  }, []);

  // 初回マウント時に自動でGPS取得開始 + ページ非表示時は停止
  useEffect(() => {
    startWatch();

    const onVisibility = () => {
      if (document.hidden) {
        if (watchIdRef.current != null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      } else {
        startWatch();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [startWatch]);

  return { position, positionRef, error, denied, startWatch, stopWatch };
}
