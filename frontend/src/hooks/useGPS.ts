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
  const [compassGranted, setCompassGranted] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const positionRef = useRef<GPSPosition | null>(null);
  const headingRef = useRef<number | null>(null);

  // DeviceOrientation ハンドラ
  const orientationHandler = useCallback((e: DeviceOrientationEvent) => {
    let h: number | null = null;
    // iOS: webkitCompassHeading (0-360, 北基準)
    if ('webkitCompassHeading' in e && typeof (e as any).webkitCompassHeading === 'number') {
      h = (e as any).webkitCompassHeading;
    } else if (e.alpha != null) {
      // Android: alpha (反転)
      h = (360 - e.alpha) % 360;
    }

    if (h != null) {
      headingRef.current = h;
      if (positionRef.current) {
        const updated = { ...positionRef.current, heading: h };
        positionRef.current = updated;
        setPosition(updated);
      }
    }
  }, []);

  const compassListenerAdded = useRef(false);

  // ユーザータップから呼ぶコンパス許可リクエスト（iOS 13+対応）
  const requestCompass = useCallback(async () => {
    if (compassGranted || compassListenerAdded.current) return;

    const needsPermission = typeof (DeviceOrientationEvent as any).requestPermission === 'function';
    if (needsPermission) {
      try {
        const state = await (DeviceOrientationEvent as any).requestPermission();
        if (state === 'granted') {
          setCompassGranted(true);
          if (!compassListenerAdded.current) {
            compassListenerAdded.current = true;
            window.addEventListener('deviceorientation', orientationHandler, true);
          }
        }
      } catch {
        // ユーザーが拒否
      }
    } else {
      // Android / 許可不要ブラウザ
      setCompassGranted(true);
      if (!compassListenerAdded.current) {
        compassListenerAdded.current = true;
        window.addEventListener('deviceorientation', orientationHandler, true);
      }
    }
  }, [compassGranted, orientationHandler]);

  // Android等はマウント時に自動でリスン開始（許可不要）
  useEffect(() => {
    const needsPermission = typeof (DeviceOrientationEvent as any).requestPermission === 'function';
    if (!needsPermission && !compassListenerAdded.current) {
      setCompassGranted(true);
      compassListenerAdded.current = true;
      window.addEventListener('deviceorientation', orientationHandler, true);
    }
    return () => {
      window.removeEventListener('deviceorientation', orientationHandler, true);
      compassListenerAdded.current = false;
    };
  }, [orientationHandler]);

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

  return { position, positionRef, error, denied, startWatch, stopWatch, compassGranted, requestCompass };
}
