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
  const retryTimer = useRef<number | null>(null);
  const startRef = useRef<() => void>(() => undefined);

  const clearRetry = useCallback(() => {
    if (retryTimer.current !== null) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  const handleSuccess = useCallback((pos: GeolocationPosition) => {
    clearRetry();
    setState({
      position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      accuracy: pos.coords.accuracy,
      error: null,
      watching: true,
      permissionState: 'granted',
    });
  }, [clearRetry]);

  const handleWatchError = useCallback((err: GeolocationPositionError) => {
    console.error('Geolocation error:', err.code, err.message);
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }

    setState((s) => ({
      ...s,
      error: err.code === 1
        ? 'Permiso denegado. Ve a Ajustes → Safari → Ubicación → Permitir'
        : err.message,
      watching: false,
      permissionState: err.code === 1 ? 'denied' : (s.permissionState === 'granted' ? 'granted' : 'unknown'),
    }));

    if (err.code !== 1) {
      clearRetry();
      retryTimer.current = window.setTimeout(() => {
        retryTimer.current = null;
        startRef.current();
      }, 1500);
    }
  }, [clearRetry]);

  const handleSnapshotError = useCallback((err: GeolocationPositionError) => {
    if (err.code === 1) {
      handleWatchError(err);
      return;
    }

    setState((s) => ({
      ...s,
      error: s.position ? null : err.message,
      permissionState: s.permissionState === 'granted' ? 'granted' : 'unknown',
    }));
  }, [handleWatchError]);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: 'Geolocalización no soportada', watching: false, permissionState: 'denied' }));
      return;
    }

    // Already watching
    if (watchId.current !== null) return;
    clearRetry();

    setState((s) => ({
      ...s,
      watching: true,
      error: null,
      permissionState: s.permissionState === 'granted' ? 'granted' : 'asking',
    }));

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      handleSnapshotError,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 2000 },
    );

    watchId.current = navigator.geolocation.watchPosition(
      handleSuccess,
      handleWatchError,
      { enableHighAccuracy: true, maximumAge: 2000 },
    );
  }, [clearRetry, handleSnapshotError, handleSuccess, handleWatchError]);

  startRef.current = start;

  const stop = useCallback(() => {
    clearRetry();
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setState((s) => ({ ...s, watching: false }));
  }, [clearRetry]);

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

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && watchId.current === null && state.permissionState !== 'denied') {
        start();
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [start, state.permissionState]);

  return { ...state, start, stop };
}
