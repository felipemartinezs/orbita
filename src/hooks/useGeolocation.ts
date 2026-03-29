'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GpsPoint } from '@/types';

export interface GeolocationState {
  position: GpsPoint | null;
  accuracy: number | null;
  error: string | null;
  watching: boolean;
  permissionState: 'unknown' | 'asking' | 'granted' | 'denied';
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    accuracy: null,
    error: null,
    watching: false,
    permissionState: 'unknown',
  });
  const watchId = useRef<number | null>(null);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: 'Geolocalización no soportada', watching: false, permissionState: 'denied' }));
      return;
    }

    // Already watching
    if (watchId.current !== null) return;

    setState((s) => ({ ...s, watching: true, error: null, permissionState: 'asking' }));

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy: pos.coords.accuracy,
          error: null,
          watching: true,
          permissionState: 'granted',
        });
      },
      (err) => {
        console.error('Geolocation error:', err.code, err.message);
        setState((s) => ({
          ...s,
          error: err.code === 1
            ? 'Permiso denegado. Ve a Ajustes → Safari → Ubicación → Permitir'
            : err.message,
          watching: false,
          permissionState: err.code === 1 ? 'denied' : 'unknown',
        }));
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 2000 },
    );
  }, []);

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setState((s) => ({ ...s, watching: false }));
  }, []);

  // Auto-start on mount — this triggers the iOS permission dialog
  useEffect(() => {
    // Small delay so iOS registers it as user-gesture context
    const t = setTimeout(() => start(), 300);
    return () => {
      clearTimeout(t);
      stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, start, stop };
}
