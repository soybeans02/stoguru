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
  const headingRef = useRef<number | null>(null);

  // DeviceOrientation でコンパス方向を取得（静止時も動作）
  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      // iOS: webkitCompassHeading (0-360, 北基準)
      // Android: alpha (0-360, 反転)
      let h: number | null = null;
      if ('webkitCompassHeading' in e && typeof (e as any).webkitCompassHeading === 'number') {
        h = (e as any).webkitCompassHeading;
      } else if (e.alpha != null && e.absolute) {
        h = (360 - e.alpha) % 360;
      } else if (e.alpha != null) {
        h = (360 - e.alpha) % 360;
      }

      if (h != null) {
        headingRef.current = h;
        // positionがあればheadingも更新
        if (positionRef.current) {
          const updated = { ...positionRef.current, heading: h };
          positionRef.current = updated;
          setPosition(updated);
        }
      }
    };

    // iOS 13+ はパーミッション必要
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission().then((state: string) => {
        if (state === 'granted') {
          window.addEventListener('deviceorientation', handler, true);
        }
      }).catch(() => {});
    } else {
      window.addEventListener('deviceorientation', handler, true);
    }

    return () => window.removeEventListener('deviceorientation', handler, true);
  }, []);

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
        // GPSのheadingよりDeviceOrientationを優先
        const gpsHeading = pos.coords.heading;
        const heading = headingRef.current ?? gpsHeading;
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, heading };
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
