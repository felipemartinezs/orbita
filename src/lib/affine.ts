import { AffineTransform, CalibrationPoint, GpsPoint, PixelPoint } from "@/types";

/**
 * Solves a 2D affine transform from GPS -> Pixel using ≥2 calibration points.
 * Model: [px, py] = A * [lng, lat] + [tx, ty]
 * With 2 points we solve exactly; with 3+ we use least squares.
 */
export function solveAffine(points: CalibrationPoint[]): AffineTransform | null {
  if (points.length < 2) return null;

  const n = points.length;

  if (n === 2) {
    // Exact solution from 2 points
    const [p0, p1] = points;
    const dlng = p1.gps.lng - p0.gps.lng;
    const dlat = p1.gps.lat - p0.gps.lat;
    const dpx = p1.pixel.x - p0.pixel.x;
    const dpy = p1.pixel.y - p0.pixel.y;

    const det = dlng * dlng + dlat * dlat;
    if (Math.abs(det) < 1e-20) return null;

    // Solve assuming similarity transform (rotation + uniform scale, no shear)
    const a = (dpx * dlng + dpy * dlat) / det;
    const b = (-dpx * dlat + dpy * dlng) / det;
    const c = -b;
    const d = a;
    const tx = p0.pixel.x - a * p0.gps.lng - b * p0.gps.lat;
    const ty = p0.pixel.y - c * p0.gps.lng - d * p0.gps.lat;

    return { a, b, c, d, tx, ty };
  }

  // Least squares for 3+ points (general affine)
  // Solve: [px_i] = a*lng_i + b*lat_i + tx
  //        [py_i] = c*lng_i + d*lat_i + ty
  // Each set of (a,b,tx) and (c,d,ty) is solved independently.
  let sumLng = 0, sumLat = 0, sumPx = 0, sumPy = 0;
  let sumLng2 = 0, sumLat2 = 0, sumLngLat = 0;
  let sumLngPx = 0, sumLatPx = 0, sumLngPy = 0, sumLatPy = 0;

  for (const pt of points) {
    const { lng, lat } = pt.gps;
    const { x, y } = pt.pixel;
    sumLng += lng; sumLat += lat; sumPx += x; sumPy += y;
    sumLng2 += lng * lng; sumLat2 += lat * lat; sumLngLat += lng * lat;
    sumLngPx += lng * x; sumLatPx += lat * x;
    sumLngPy += lng * y; sumLatPy += lat * y;
  }

  // 3x3 system (normal equations) for [a, b, tx]:
  // [sumLng2  sumLngLat  sumLng ] [a ]   [sumLngPx]
  // [sumLngLat sumLat2  sumLat ] [b ] = [sumLatPx]
  // [sumLng   sumLat    n      ] [tx]   [sumPx   ]
  const M = [
    [sumLng2, sumLngLat, sumLng],
    [sumLngLat, sumLat2, sumLat],
    [sumLng, sumLat, n],
  ];
  const rhsX = [sumLngPx, sumLatPx, sumPx];
  const rhsY = [sumLngPy, sumLatPy, sumPy];

  const solX = solve3x3(M, rhsX);
  const solY = solve3x3(M, rhsY);

  if (!solX || !solY) return null;

  return {
    a: solX[0], b: solX[1], tx: solX[2],
    c: solY[0], d: solY[1], ty: solY[2],
  };
}

function solve3x3(M: number[][], rhs: number[]): number[] | null {
  // Gaussian elimination with partial pivoting
  const aug = M.map((row, i) => [...row, rhs[i]]);
  const n = 3;
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    if (Math.abs(aug[col][col]) < 1e-12) return null;
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let k = col; k <= n; k++) aug[row][k] -= factor * aug[col][k];
    }
  }
  const x = [0, 0, 0];
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j];
    x[i] /= aug[i][i];
  }
  return x;
}

export function gpsToPixel(gps: GpsPoint, t: AffineTransform): PixelPoint {
  return {
    x: t.a * gps.lng + t.b * gps.lat + t.tx,
    y: t.c * gps.lng + t.d * gps.lat + t.ty,
  };
}

export function pixelToGps(pixel: PixelPoint, t: AffineTransform): GpsPoint {
  // Invert the affine: solve [lng,lat] from [px,py]
  const det = t.a * t.d - t.b * t.c;
  if (Math.abs(det) < 1e-20) return { lat: 0, lng: 0 };
  const ai = t.d / det, bi = -t.b / det;
  const ci = -t.c / det, di = t.a / det;
  const px = pixel.x - t.tx;
  const py = pixel.y - t.ty;
  return {
    lng: ai * px + bi * py,
    lat: ci * px + di * py,
  };
}
