import { SavedCalibration } from "@/types";

const KEY = "orbita_calibrations";

function getCalibrationId(cal: Pick<SavedCalibration, 'planId' | 'fileName'>): string {
  return cal.planId || cal.fileName;
}

export function saveCalibration(cal: SavedCalibration): void {
  const all = loadAll();
  const idx = all.findIndex((c) => getCalibrationId(c) === getCalibrationId(cal));
  if (idx >= 0) all[idx] = cal;
  else all.push(cal);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function loadCalibration(planId: string, fileName?: string): SavedCalibration | null {
  const all = loadAll();
  return (
    all.find((c) => getCalibrationId(c) === planId) ??
    (fileName ? all.find((c) => c.fileName === fileName) ?? null : null)
  );
}

export function loadAll(): SavedCalibration[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function deleteCalibration(planId: string): void {
  const all = loadAll().filter((c) => getCalibrationId(c) !== planId);
  localStorage.setItem(KEY, JSON.stringify(all));
}
