import { SavedCalibration } from "@/types";

const KEY = "orbita_calibrations";

export function saveCalibration(cal: SavedCalibration): void {
  const all = loadAll();
  const idx = all.findIndex((c) => c.fileName === cal.fileName);
  if (idx >= 0) all[idx] = cal;
  else all.push(cal);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function loadCalibration(fileName: string): SavedCalibration | null {
  const all = loadAll();
  return all.find((c) => c.fileName === fileName) ?? null;
}

export function loadAll(): SavedCalibration[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function deleteCalibration(fileName: string): void {
  const all = loadAll().filter((c) => c.fileName !== fileName);
  localStorage.setItem(KEY, JSON.stringify(all));
}
