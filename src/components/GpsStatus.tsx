'use client';
import React from 'react';

interface GpsStatusProps {
  accuracy: number | null;
  error: string | null;
  watching: boolean;
}

export default function GpsStatus({ accuracy, error, watching }: GpsStatusProps) {
  const getColor = () => {
    if (error) return '#ef4444';
    if (!watching || accuracy === null) return '#6b7280';
    if (accuracy <= 5) return '#22c55e';
    if (accuracy <= 15) return '#f59e0b';
    return '#ef4444';
  };

  const getLabel = () => {
    if (error) return 'GPS Error';
    if (!watching) return 'GPS Off';
    if (accuracy === null) return 'Buscando…';
    return `±${Math.round(accuracy)}m`;
  };

  return (
    <div className="gps-badge" style={{ borderColor: getColor() }}>
      <span className="gps-pulse" style={{ background: getColor() }} />
      <span className="gps-label" style={{ color: getColor() }}>{getLabel()}</span>
    </div>
  );
}
