export interface GpsPoint {
  lat: number;
  lng: number;
}

export interface PixelPoint {
  x: number;
  y: number;
}

export interface CalibrationPoint {
  pixel: PixelPoint;
  gps: GpsPoint;
}

export interface AffineTransform {
  // Transforms GPS -> Pixel: [px, py] = A * [lng, lat]^T + [tx, ty]
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export interface SavedCalibration {
  fileName: string;
  points: CalibrationPoint[];
  transform: AffineTransform;
  createdAt: number;
}

export type PlanSourceType = 'pdf' | 'image';

export type AppScreen = 'upload' | 'calibrate' | 'viewer';
