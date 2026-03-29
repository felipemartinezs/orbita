'use client';
import React, { useState } from 'react';
import { CalibrationPoint, GpsPoint, PixelPoint, PlanSourceType } from '@/types';
import PlanViewer from './PlanViewer';

interface CalibrationProps {
  sourceUrl: string;
  sourceType: PlanSourceType;
  currentGps: GpsPoint | null;
  onComplete: (points: CalibrationPoint[]) => void;
  onCancel: () => void;
}

export default function Calibration({ sourceUrl, sourceType, currentGps, onComplete, onCancel }: CalibrationProps) {
  const [points, setPoints] = useState<CalibrationPoint[]>([]);
  const [pendingPixel, setPendingPixel] = useState<PixelPoint | null>(null);
  const [step, setStep] = useState<'tap' | 'gps'>('tap');
  const [gpsInput, setGpsInput] = useState({ lat: '', lng: '' });
  const [error, setError] = useState('');

  const handleTap = (pixel: PixelPoint) => {
    if (step !== 'tap') return;
    setPendingPixel(pixel);
    setStep('gps');
    // Pre-fill with current GPS if available
    if (currentGps) {
      setGpsInput({ lat: String(currentGps.lat.toFixed(7)), lng: String(currentGps.lng.toFixed(7)) });
    }
  };

  const handleGpsSubmit = () => {
    const lat = parseFloat(gpsInput.lat);
    const lng = parseFloat(gpsInput.lng);
    if (isNaN(lat) || isNaN(lng) || !pendingPixel) {
      setError('Por favor ingresa coordenadas válidas');
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError('Coordenadas fuera de rango');
      return;
    }
    setError('');
    const newPoints = [...points, { pixel: pendingPixel, gps: { lat, lng } }];
    setPoints(newPoints);
    setPendingPixel(null);
    setStep('tap');
    setGpsInput({ lat: '', lng: '' });
  };

  const handleUseCurrentGps = () => {
    if (!currentGps) return;
    setGpsInput({ lat: String(currentGps.lat.toFixed(7)), lng: String(currentGps.lng.toFixed(7)) });
  };

  const handleRemoveLast = () => {
    setPoints((p) => p.slice(0, -1));
    setPendingPixel(null);
    setStep('tap');
  };

  return (
    <div className="calibration-overlay">
      {/* Instructions header */}
      <div className="calib-header">
        <button className="btn-ghost" onClick={onCancel}>✕ Cancelar</button>
        <div className="calib-title">
          Calibración — Punto {points.length + 1}
        </div>
        {points.length >= 2 && (
          <button className="btn-primary btn-sm" onClick={() => onComplete(points)}>
            Listo ✓
          </button>
        )}
        {points.length < 2 && <div style={{ width: 80 }} />}
      </div>

      {/* Hint banner */}
      <div className="calib-hint">
        {step === 'tap' && (
          <p>
            {points.length === 0
              ? '👆 Toca un punto conocido en el plano (ej. esquina exterior)'
              : points.length === 1
              ? '👆 Toca un segundo punto conocido — mínimo 2 para calibrar'
              : '👆 Toca más puntos para mayor precisión, o presiona Listo'}
          </p>
        )}
        {step === 'gps' && <p>📍 Ahora ingresa las coordenadas GPS de ese punto</p>}
      </div>

      {/* PDF Plan */}
      <div className="calib-plan-area">
        <PlanViewer
          sourceUrl={sourceUrl}
          sourceType={sourceType}
          calibrationPoints={pendingPixel ? [...points, { pixel: pendingPixel, gps: { lat: 0, lng: 0 } }] : points}
          transform={null}
          gpsPosition={null}
          gpsAccuracy={null}
          onCanvasTap={handleTap}
          tapMode={step === 'tap'}
        />
        {pendingPixel && step === 'tap' && (
          <div className="pending-dot" style={{ display: 'none' }} />
        )}
      </div>

      {/* GPS input drawer */}
      {step === 'gps' && (
        <div className="gps-drawer">
          <div className="gps-drawer-title">Coordenadas GPS del punto {points.length + 1}</div>
          {error && <div className="gps-error">{error}</div>}
          <div className="gps-inputs">
            <div className="gps-field">
              <label>Latitud</label>
              <input
                type="number"
                step="0.0000001"
                placeholder="ej. 19.4326"
                value={gpsInput.lat}
                onChange={(e) => setGpsInput((g) => ({ ...g, lat: e.target.value }))}
              />
            </div>
            <div className="gps-field">
              <label>Longitud</label>
              <input
                type="number"
                step="0.0000001"
                placeholder="ej. -99.1332"
                value={gpsInput.lng}
                onChange={(e) => setGpsInput((g) => ({ ...g, lng: e.target.value }))}
              />
            </div>
          </div>
          <div className="gps-actions">
            {currentGps && (
              <button className="btn-secondary" onClick={handleUseCurrentGps}>
                📍 Usar mi ubicación actual
              </button>
            )}
            <button className="btn-primary" onClick={handleGpsSubmit}>
              Confirmar punto →
            </button>
          </div>
          <button className="btn-ghost btn-sm" onClick={() => { setPendingPixel(null); setStep('tap'); }}>
            ← Cancelar este punto
          </button>
        </div>
      )}

      {/* Point list */}
      {points.length > 0 && step === 'tap' && (
        <div className="calib-points-list">
          {points.map((pt, i) => (
            <div key={i} className="calib-point-chip">
              <span className="chip-num">{i + 1}</span>
              <span>{pt.gps.lat.toFixed(5)}, {pt.gps.lng.toFixed(5)}</span>
            </div>
          ))}
          <button className="btn-ghost btn-sm" onClick={handleRemoveLast}>
            ✕ Quitar último
          </button>
        </div>
      )}
    </div>
  );
}
