'use client';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppScreen, CalibrationPoint, PlanSourceType } from '@/types';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useAffineMap } from '@/hooks/useAffineMap';
import { saveCalibration, loadCalibration } from '@/lib/storage';
import { solveAffine } from '@/lib/affine';
import UploadScreen from '@/components/UploadScreen';
import Calibration from '@/components/Calibration';
import PlanViewer from '@/components/PlanViewer';
import GpsStatus from '@/components/GpsStatus';

export default function Home() {
  const [screen, setScreen]                   = useState<AppScreen>('upload');
  const [sourceUrl, setSourceUrl]             = useState<string | null>(null);
  const [sourceType, setSourceType]           = useState<PlanSourceType | null>(null);
  const [sourceFileName, setSourceFileName]   = useState<string>('');
  const [sourceFile, setSourceFile]           = useState<File | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>([]);
  const [showMenu, setShowMenu]               = useState(false);

  // Demo-mode state
  const [isDemoMode, setIsDemoMode]           = useState(false);
  const demoCalibratedRef                     = useRef(false);
  // Stores canvas dims once PDF renders, so we can calibrate when GPS arrives later
  const demoCanvasRef                         = useRef<{ w: number; h: number; scale: number } | null>(null);

  const geo    = useGeolocation();
  const { transform } = useAffineMap(calibrationPoints);

  // ── Build demo calibration from canvas size + current GPS ─────────
  const buildDemoCalibration = useCallback((
    canvasW: number, canvasH: number, scale: number,
    gps: { lat: number; lng: number },
  ) => {
    if (demoCalibratedRef.current) return;
    demoCalibratedRef.current = true;

    // demo-space.pdf is 612×792 pts.
    // pdf.js renders y=0 at top, so PDF y → canvas y = (792 - pdfY) * scale
    const sw = { x: 30 * scale,  y: (792 - 30)  * scale };   // bottom-left border (SW)
    const ne = { x: 582 * scale, y: (792 - 762) * scale };   // top-right border (NE)

    const metersPerDegLat = 111000;
    const metersPerDegLng = 111000 * Math.cos(gps.lat * Math.PI / 180);
    const widthM  = 50; // plan represents ~50m wide
    const heightM = 65; // plan represents ~65m tall

    const swGps = {
      lat: gps.lat - (heightM * 0.5) / metersPerDegLat,
      lng: gps.lng - (widthM  * 0.5) / metersPerDegLng,
    };
    const neGps = {
      lat: gps.lat + (heightM * 0.5) / metersPerDegLat,
      lng: gps.lng + (widthM  * 0.5) / metersPerDegLng,
    };

    const points: CalibrationPoint[] = [
      { pixel: sw, gps: swGps },
      { pixel: ne, gps: neGps },
    ];

    const t = solveAffine(points);
    if (t) saveCalibration({ fileName: 'demo-espacio.pdf', points, transform: t, createdAt: Date.now() });
    setCalibrationPoints(points);
  }, []);

  // ── When GPS arrives and we're in demo mode, auto-calibrate ───────
  useEffect(() => {
    if (!isDemoMode || demoCalibratedRef.current) return;
    if (!geo.position || !demoCanvasRef.current) return;

    const { w, h, scale } = demoCanvasRef.current;
    buildDemoCalibration(w, h, scale, geo.position);
  }, [isDemoMode, geo.position, buildDemoCalibration]);

  // ── Demo mode: load PDF immediately, calibrate whenever GPS ready ──
  const loadDemoMode = useCallback(async () => {
    setIsDemoMode(true);
    demoCalibratedRef.current = false;
    demoCanvasRef.current = null;

    const res = await fetch('/demo-space.pdf');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);

    setSourceUrl(url);
    setSourceType('pdf');
    setSourceFileName('demo-espacio.pdf');
    setSourceFile(null);
    setCalibrationPoints([]);
    setScreen('viewer');
    // Blue dot will appear automatically once GPS resolves
  }, []);

  // ── PlanViewer callback when PDF renders ──────────────────────────
  const onPlanRendered = useCallback((canvasW: number, canvasH: number, scale: number) => {
    if (!isDemoMode) return;
    demoCanvasRef.current = { w: canvasW, h: canvasH, scale };

    // If GPS already available, calibrate now; otherwise the useEffect above handles it
    if (geo.position && !demoCalibratedRef.current) {
      buildDemoCalibration(canvasW, canvasH, scale, geo.position);
    }
  }, [isDemoMode, geo.position, buildDemoCalibration]);

  // ── Regular file upload ───────────────────────────────────────────
  const onFileSelected = useCallback((file: File, nextSourceType: PlanSourceType) => {
    setIsDemoMode(false);
    demoCalibratedRef.current = false;
    demoCanvasRef.current = null;
    setSourceUrl(URL.createObjectURL(file));
    setSourceType(nextSourceType);
    setSourceFileName(file.name);
    setSourceFile(file);

    const saved = loadCalibration(file.name);
    if (saved && saved.points.length >= 2) {
      setCalibrationPoints(saved.points);
      setScreen('viewer');
    } else {
      setCalibrationPoints([]);
      setScreen('calibrate');
    }
  }, []);

  // ── Calibration complete (manual) ─────────────────────────────────
  const onCalibrationComplete = useCallback((points: CalibrationPoint[]) => {
    setCalibrationPoints(points);
    const t = solveAffine(points);
    if (t) saveCalibration({ fileName: sourceFileName, points, transform: t, createdAt: Date.now() });
    setScreen('viewer');
  }, [sourceFileName]);

  const onRecalibrate = () => {
    setCalibrationPoints([]);
    demoCalibratedRef.current = false;
    setScreen('calibrate');
    setShowMenu(false);
  };

  const onChangePdf = () => {
    if (sourceUrl?.startsWith('blob:')) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(null);
    setSourceType(null);
    setSourceFileName('');
    setSourceFile(null);
    setCalibrationPoints([]);
    setIsDemoMode(false);
    demoCalibratedRef.current = false;
    demoCanvasRef.current = null;
    setScreen('upload');
    setShowMenu(false);
  };

  // ── Render ─────────────────────────────────────────────────────────
  if (screen === 'upload') {
    return <UploadScreen onFileSelected={onFileSelected} onDemoMode={loadDemoMode} />;
  }

  if (screen === 'calibrate' && sourceUrl && sourceType) {
    return (
      <Calibration
        sourceUrl={sourceUrl}
        sourceType={sourceType}
        sourceFile={sourceFile}
        currentGps={geo.position}
        onComplete={onCalibrationComplete}
        onCancel={() => {
          if (calibrationPoints.length >= 2) setScreen('viewer');
          else setScreen('upload');
        }}
      />
    );
  }

  if (screen === 'viewer' && sourceUrl && sourceType) {
    const isDemo = isDemoMode;
    const isWaitingGps = isDemo && calibrationPoints.length < 2;
    const gpsDenied = geo.permissionState === 'denied';

    return (
      <div className="viewer-shell">
        <div className="viewer-topbar">
          <div className="topbar-left">
            <span className="topbar-logo">📐 Orbita</span>
            <span className="topbar-filename">
              {isDemo ? '🗺 Demo GPS en vivo' : sourceFileName}
            </span>
          </div>
          <div className="topbar-right">
            <GpsStatus accuracy={geo.accuracy} error={geo.error} watching={geo.watching} />
            <button className="btn-icon" onClick={() => setShowMenu((v) => !v)}>⋮</button>
          </div>
        </div>

        {/* GPS permission prompt — most important screen for iOS */}
        {geo.permissionState === 'unknown' && !geo.watching && (
          <div className="gps-prompt-overlay">
            <div className="gps-prompt-card">
              <div className="gps-prompt-icon">📍</div>
              <h2 className="gps-prompt-title">Activa tu ubicación</h2>
              <p className="gps-prompt-text">
                Toca el botón para que la app pueda mostrarte en el plano
              </p>
              <button className="btn-primary gps-prompt-btn" onClick={() => geo.start()}>
                Activar GPS ahora
              </button>
            </div>
          </div>
        )}

        {/* GPS denied error */}
        {gpsDenied && (
          <div className="calib-pill calib-pill-warn">
            ⚠️ Ubicación bloqueada — ve a Ajustes → Safari → Ubicación → Permitir
          </div>
        )}

        {/* Status banner */}
        {!gpsDenied && geo.watching && (
          isWaitingGps ? (
            <div className="calib-pill calib-pill-warn">
              <span className="waiting-dot" />
              Adquiriendo señal GPS…
            </div>
          ) : calibrationPoints.length >= 2 ? (
            <div className="calib-pill">
              {isDemo
                ? '🔵 Este punto azul eres tú — camina para verlo moverse'
                : `✓ ${calibrationPoints.length} puntos de calibración`}
            </div>
          ) : null
        )}

        <PlanViewer
          sourceUrl={sourceUrl}
          sourceType={sourceType}
          sourceFile={sourceFile}
          calibrationPoints={isDemo ? [] : calibrationPoints}
          transform={transform}
          gpsPosition={geo.position}
          gpsAccuracy={geo.accuracy}
          tapMode={false}
          onRendered={onPlanRendered}
        />

        {showMenu && (
          <div className="overflow-menu">
            <button onClick={onRecalibrate}>🔧 Recalibrar plano</button>
            <button onClick={() => { setScreen('calibrate'); setShowMenu(false); }}>
              ➕ Agregar punto de calibración
            </button>
            <button onClick={onChangePdf}>📂 Cambiar archivo</button>
            <button onClick={() => setShowMenu(false)}>✕ Cerrar</button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
