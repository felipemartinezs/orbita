'use client';
import { useMemo } from 'react';
import { AffineTransform, CalibrationPoint, GpsPoint, PixelPoint } from '@/types';
import { gpsToPixel, solveAffine } from '@/lib/affine';

export function useAffineMap(points: CalibrationPoint[]) {
  const transform = useMemo<AffineTransform | null>(
    () => solveAffine(points),
    [points]
  );

  const toPixel = (gps: GpsPoint): PixelPoint | null => {
    if (!transform) return null;
    return gpsToPixel(gps, transform);
  };

  return { transform, toPixel };
}
