export function buildPlanId(file: File): string {
  const safeName = file.name.trim().toLowerCase();
  const safeType = file.type.trim().toLowerCase() || 'unknown';
  return `upload:${safeName}:${file.size}:${file.lastModified}:${safeType}`;
}

export function buildStaticPlanId(name: string): string {
  return `static:${name.trim().toLowerCase()}`;
}
